/**
 * Table formátter pro CLI výstup.
 */

import type { FormattableData } from '../types.js';
import type { OutputFormatter } from './index.js';
import type { Rule } from '../../types/rule.js';
import type { RuleAction } from '../../types/action.js';

/** Konfigurace sloupce */
interface ColumnConfig {
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
}

export class TableFormatter implements OutputFormatter {
  constructor(private readonly useColors: boolean = true) {}

  format(data: FormattableData): string {
    switch (data.type) {
      case 'rules':
        return this.formatRulesTable(data.data as Rule[]);
      case 'rule':
        return this.formatRuleDetail(data.data as Rule);
      case 'validation':
        return this.formatValidation(data.data as ValidationResult);
      case 'stats':
        return this.formatStats(data.data as StatsData);
      case 'table':
        return this.formatGenericTable(data.data as TableData);
      case 'error':
        return this.color(`Error: ${data.data}`, 'red');
      case 'message':
        return String(data.data);
      default:
        return JSON.stringify(data.data, null, 2);
    }
  }

  private formatRulesTable(rules: Rule[]): string {
    if (rules.length === 0) {
      return 'No rules found.';
    }

    const columns: ColumnConfig[] = [
      { header: 'ID', width: 20 },
      { header: 'Name', width: 30 },
      { header: 'Priority', width: 8, align: 'right' },
      { header: 'Enabled', width: 8 },
      { header: 'Tags', width: 20 }
    ];

    const rows = rules.map((rule) => [
      this.truncate(rule.id, 20),
      this.truncate(rule.name, 30),
      String(rule.priority),
      rule.enabled ? this.color('yes', 'green') : this.color('no', 'red'),
      rule.tags.join(', ')
    ]);

    return this.renderTable(columns, rows);
  }

  private formatRuleDetail(rule: Rule): string {
    const lines: string[] = [
      this.color('Rule Details', 'cyan'),
      this.separator(40),
      `ID:          ${rule.id}`,
      `Name:        ${rule.name}`,
      `Description: ${rule.description ?? '-'}`,
      `Priority:    ${rule.priority}`,
      `Enabled:     ${rule.enabled ? this.color('yes', 'green') : this.color('no', 'red')}`,
      `Version:     ${rule.version}`,
      `Tags:        ${rule.tags.length > 0 ? rule.tags.join(', ') : '-'}`,
      '',
      this.color('Trigger', 'cyan'),
      this.separator(40),
      `Type: ${rule.trigger.type}`,
      ...this.formatTriggerDetails(rule.trigger),
      '',
      this.color('Conditions', 'cyan'),
      this.separator(40),
      ...rule.conditions.map((c, i) => `${i + 1}. ${JSON.stringify(c)}`),
      '',
      this.color('Actions', 'cyan'),
      this.separator(40),
      ...rule.actions.map((a, i) => `${i + 1}. ${a.type}: ${this.formatActionDetails(a)}`)
    ];

    return lines.join('\n');
  }

  private formatTriggerDetails(trigger: Rule['trigger']): string[] {
    switch (trigger.type) {
      case 'fact':
        return [`Pattern: ${trigger.pattern}`];
      case 'event':
        return [`Topic: ${trigger.topic}`];
      case 'timer':
        return [`Name: ${trigger.name}`];
      case 'temporal':
        return [`Pattern: ${JSON.stringify(trigger.pattern)}`];
    }
  }

  private formatActionDetails(action: RuleAction): string {
    switch (action.type) {
      case 'set_fact':
        return `${action.key} = ${JSON.stringify(action.value)}`;
      case 'delete_fact':
        return action.key;
      case 'emit_event':
        return action.topic;
      case 'set_timer':
        return `${action.timer.name} (${action.timer.duration})`;
      case 'cancel_timer':
        return action.name;
      case 'log':
        return `[${action.level}] "${action.message}"`;
      case 'call_service':
        return `${action.service}.${action.method}()`;
      default:
        return JSON.stringify(action);
    }
  }

  private formatValidation(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
      lines.push(this.color('✓ Validation passed', 'green'));
    } else {
      lines.push(this.color('✗ Validation failed', 'red'));
    }

    if (result.errors && result.errors.length > 0) {
      lines.push('', this.color('Errors:', 'red'));
      for (const error of result.errors) {
        lines.push(`  ✗ ${error.path}: ${error.message}`);
      }
    }

    if (result.warnings && result.warnings.length > 0) {
      lines.push('', this.color('Warnings:', 'yellow'));
      for (const warning of result.warnings) {
        lines.push(`  ⚠ ${warning.path}: ${warning.message}`);
      }
    }

    return lines.join('\n');
  }

  private formatStats(stats: StatsData): string {
    const lines: string[] = [
      this.color('Engine Statistics', 'cyan'),
      this.separator(40),
      `Rules:     ${stats.rules}`,
      `Facts:     ${stats.facts}`,
      `Events:    ${stats.events}`,
      `Timers:    ${stats.timers}`,
      `Uptime:    ${this.formatDuration(stats.uptime)}`
    ];

    return lines.join('\n');
  }

  private formatGenericTable(tableData: TableData): string {
    const columns = tableData.columns.map((c) => (typeof c === 'string' ? { header: c } : c));
    return this.renderTable(columns, tableData.rows);
  }

  private renderTable(columns: ColumnConfig[], rows: string[][]): string {
    // Vypočítej šířky sloupců
    const widths = columns.map((col, i) => {
      const dataWidth = Math.max(...rows.map((row) => this.stripAnsi(row[i] ?? '').length), 0);
      const colWidth = col.width ?? 0;
      return Math.max(colWidth, col.header.length, dataWidth);
    });

    const lines: string[] = [];

    // Header
    const headerRow = columns.map((col, i) => this.pad(col.header, widths[i] ?? 0, col.align ?? 'left'));
    lines.push(this.color(headerRow.join('  '), 'cyan'));

    // Separator
    lines.push(widths.map((w) => '-'.repeat(w)).join('  '));

    // Data rows
    for (const row of rows) {
      const formattedRow = row.map((cell, i) => {
        const width = widths[i] ?? 0;
        const align = columns[i]?.align ?? 'left';
        return this.pad(cell ?? '', width, align);
      });
      lines.push(formattedRow.join('  '));
    }

    return lines.join('\n');
  }

  private pad(text: string, width: number, align: 'left' | 'right' | 'center'): string {
    const stripped = this.stripAnsi(text);
    const padding = width - stripped.length;

    if (padding <= 0) {
      return text;
    }

    switch (align) {
      case 'right':
        return ' '.repeat(padding) + text;
      case 'center': {
        const left = Math.floor(padding / 2);
        const right = padding - left;
        return ' '.repeat(left) + text + ' '.repeat(right);
      }
      default:
        return text + ' '.repeat(padding);
    }
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }

  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  private color(text: string, color: 'red' | 'green' | 'yellow' | 'cyan'): string {
    if (!this.useColors) {
      return text;
    }
    const codes: Record<string, string> = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m'
    };
    return `${codes[color]}${text}\x1b[0m`;
  }

  private separator(width: number): string {
    return '-'.repeat(width);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

interface ValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
  warnings?: Array<{ path: string; message: string }>;
}

interface StatsData {
  rules: number;
  facts: number;
  events: number;
  timers: number;
  uptime: number;
}

interface TableData {
  columns: Array<string | ColumnConfig>;
  rows: string[][];
}
