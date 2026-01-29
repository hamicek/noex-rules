/**
 * Příkazy pro audit log přes API.
 * Podporuje: list, search, export
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GlobalOptions, CliConfig } from '../types.js';
import { createServerClient } from '../services/server-client.js';
import { printData, print, colorize, warning, success } from '../utils/output.js';
import type { AuditEntry, AuditQueryResult } from '../../audit/types.js';

/** Společné options pro audit příkazy */
export interface AuditCommandOptions extends GlobalOptions {
  url: string | undefined;
}

/** Options pro audit list */
export interface AuditListOptions extends AuditCommandOptions {
  category?: string;
  type?: string;
  ruleId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Options pro audit search */
export interface AuditSearchOptions extends AuditCommandOptions {
  category?: string;
  type?: string;
  ruleId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** Options pro audit export */
export interface AuditExportOptions extends AuditCommandOptions {
  output?: string;
  exportFormat?: 'json' | 'csv';
  category?: string;
  type?: string;
  ruleId?: string;
  from?: string;
  to?: string;
}

/** Parses a value as a numeric timestamp — accepts numbers or ISO date strings */
function parseTimestamp(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (Number.isFinite(num)) return String(num);
  const date = new Date(value);
  if (!isNaN(date.getTime())) return String(date.getTime());
  return undefined;
}

/** Builds query string from params, omitting undefined values */
function buildQueryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Formats timestamp to readable date string */
function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/** Returns ANSI color name for audit category */
function categoryColor(category: string): 'cyan' | 'yellow' | 'green' | 'magenta' | 'blue' {
  switch (category) {
    case 'rule_management': return 'cyan';
    case 'rule_execution': return 'green';
    case 'fact_change': return 'yellow';
    case 'event_emitted': return 'magenta';
    case 'system': return 'blue';
    default: return 'cyan';
  }
}

/** Formats a single audit entry for pretty output */
function formatAuditEntry(entry: AuditEntry): string {
  const lines: string[] = [];
  const time = colorize(formatTimestamp(entry.timestamp), 'dim');
  const cat = colorize(entry.category, categoryColor(entry.category));
  const type = colorize(entry.type, 'bold');

  lines.push(`${time}  ${cat}  ${type}`);
  lines.push(`  ${entry.summary}`);

  if (entry.ruleId) {
    const ruleName = entry.ruleName ? ` (${entry.ruleName})` : '';
    lines.push(`  ${colorize('Rule:', 'dim')} ${entry.ruleId}${ruleName}`);
  }

  if (entry.durationMs !== undefined) {
    lines.push(`  ${colorize('Duration:', 'dim')} ${entry.durationMs}ms`);
  }

  if (entry.correlationId) {
    lines.push(`  ${colorize('Correlation:', 'dim')} ${entry.correlationId}`);
  }

  return lines.join('\n');
}

const CSV_HEADER = 'id,timestamp,category,type,summary,source,ruleId,ruleName,correlationId,details,durationMs';

function escapeCsv(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function formatCsvRow(entry: AuditEntry): string {
  return [
    escapeCsv(entry.id),
    entry.timestamp.toString(),
    escapeCsv(entry.category),
    escapeCsv(entry.type),
    escapeCsv(entry.summary),
    escapeCsv(entry.source),
    escapeCsv(entry.ruleId ?? ''),
    escapeCsv(entry.ruleName ?? ''),
    escapeCsv(entry.correlationId ?? ''),
    escapeCsv(JSON.stringify(entry.details)),
    entry.durationMs?.toString() ?? '',
  ].join(',');
}

/**
 * Příkaz audit list — seznam audit záznamů s filtrováním.
 */
export async function auditListCommand(options: AuditListOptions, config: CliConfig): Promise<void> {
  const serverUrl = options.url ?? config.server.url;
  const client = createServerClient({ baseUrl: serverUrl });

  const qs = buildQueryString({
    category: options.category,
    types: options.type,
    ruleId: options.ruleId,
    from: parseTimestamp(options.from),
    to: parseTimestamp(options.to),
    limit: options.limit,
  });

  const result = await client.get<AuditQueryResult>(`/audit/entries${qs}`);

  if (options.format === 'json') {
    printData({
      type: 'table',
      data: {
        entries: result.entries,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        serverUrl,
      },
    });
    return;
  }

  if (result.entries.length === 0) {
    print(warning('No audit entries found.'));
    return;
  }

  print(colorize(`Audit Log (${result.entries.length} of ${result.totalCount})`, 'bold'));
  print(colorize(`Server: ${serverUrl}`, 'dim'));
  if (result.hasMore) {
    print(colorize('More entries available. Use --limit for pagination.', 'dim'));
  }
  print('');

  for (const entry of result.entries) {
    print(formatAuditEntry(entry));
    print('');
  }
}

/**
 * Příkaz audit search — vyhledávání v summary a details audit záznamů.
 */
export async function auditSearchCommand(
  query: string,
  options: AuditSearchOptions,
  config: CliConfig,
): Promise<void> {
  const serverUrl = options.url ?? config.server.url;
  const client = createServerClient({ baseUrl: serverUrl });

  const qs = buildQueryString({
    category: options.category,
    types: options.type,
    ruleId: options.ruleId,
    from: parseTimestamp(options.from),
    to: parseTimestamp(options.to),
    limit: options.limit ?? 1000,
  });

  const result = await client.get<AuditQueryResult>(`/audit/entries${qs}`);
  const searchLower = query.toLowerCase();

  const matched = result.entries.filter(entry => {
    if (entry.summary.toLowerCase().includes(searchLower)) return true;
    const detailsStr = JSON.stringify(entry.details).toLowerCase();
    return detailsStr.includes(searchLower);
  });

  if (options.format === 'json') {
    printData({
      type: 'table',
      data: {
        entries: matched,
        totalCount: matched.length,
        query,
        serverUrl,
      },
    });
    return;
  }

  if (matched.length === 0) {
    print(warning(`No audit entries matching '${query}'.`));
    return;
  }

  print(colorize(`Search Results: '${query}' (${matched.length} matches)`, 'bold'));
  print(colorize(`Server: ${serverUrl}`, 'dim'));
  print('');

  for (const entry of matched) {
    print(formatAuditEntry(entry));
    print('');
  }
}

/**
 * Příkaz audit export — export audit záznamů do souboru nebo stdout.
 */
export async function auditExportCommand(options: AuditExportOptions, config: CliConfig): Promise<void> {
  const serverUrl = options.url ?? config.server.url;
  const client = createServerClient({ baseUrl: serverUrl });
  const format = options.exportFormat ?? 'json';

  const qs = buildQueryString({
    category: options.category,
    types: options.type,
    ruleId: options.ruleId,
    from: parseTimestamp(options.from),
    to: parseTimestamp(options.to),
    limit: 10_000,
  });

  const result = await client.get<AuditQueryResult>(`/audit/entries${qs}`);

  let content: string;
  if (format === 'csv') {
    const lines = [CSV_HEADER, ...result.entries.map(formatCsvRow)];
    content = lines.join('\n');
  } else {
    content = JSON.stringify(result.entries, null, 2);
  }

  if (options.output) {
    const absolutePath = resolve(options.output);
    writeFileSync(absolutePath, content, 'utf-8');

    if (options.format === 'json') {
      printData({
        type: 'message',
        data: {
          message: `Exported ${result.entries.length} entries to ${absolutePath}`,
          format,
          file: absolutePath,
          count: result.entries.length,
          serverUrl,
        },
      });
    } else {
      print(success(`Exported ${result.entries.length} entries to ${absolutePath} (${format})`));
    }
  } else {
    console.log(content);
  }
}
