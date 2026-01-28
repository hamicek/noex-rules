/**
 * Příkaz stats pro CLI.
 * Zobrazuje statistiky rule enginu z běžícího serveru.
 */

import type { GlobalOptions, CliConfig } from '../types.js';
import { createServerClient, type StatsResponse } from '../services/server-client.js';
import { printData, print, colorize } from '../utils/output.js';

/** Options pro příkaz stats */
export interface StatsCommandOptions extends GlobalOptions {
  /** URL serveru (přepíše konfiguraci) */
  url: string | undefined;
}

/** Výstup příkazu stats */
interface StatsOutput {
  rulesCount: number;
  factsCount: number;
  timersCount: number;
  eventsProcessed: number;
  rulesExecuted: number;
  avgProcessingTimeMs: number;
  timestamp: number;
  serverUrl: string;
}

/**
 * Formátuje číslo s tisícovými oddělovači.
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Formátuje čas v ms s jednotkou.
 */
function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)} μs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Formátuje výstup pro pretty formát.
 */
function formatPrettyOutput(output: StatsOutput): string {
  const lines: string[] = [];

  lines.push(colorize('Engine Statistics', 'bold'));
  lines.push(colorize(`Server: ${output.serverUrl}`, 'dim'));
  lines.push('');

  lines.push(colorize('Counts:', 'cyan'));
  lines.push(`  Rules:   ${formatNumber(output.rulesCount)}`);
  lines.push(`  Facts:   ${formatNumber(output.factsCount)}`);
  lines.push(`  Timers:  ${formatNumber(output.timersCount)}`);
  lines.push('');

  lines.push(colorize('Performance:', 'cyan'));
  lines.push(`  Events processed:    ${formatNumber(output.eventsProcessed)}`);
  lines.push(`  Rules executed:      ${formatNumber(output.rulesExecuted)}`);
  lines.push(`  Avg processing time: ${formatTime(output.avgProcessingTimeMs)}`);
  lines.push('');

  const date = new Date(output.timestamp);
  lines.push(colorize(`Timestamp: ${date.toISOString()}`, 'dim'));

  return lines.join('\n');
}

/**
 * Akce příkazu stats.
 */
export async function statsCommand(options: StatsCommandOptions, config: CliConfig): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  const stats: StatsResponse = await client.getStats();

  const output: StatsOutput = {
    ...stats,
    serverUrl
  };

  if (options.format === 'json') {
    printData({
      type: 'stats',
      data: output
    });
  } else {
    print(formatPrettyOutput(output));
  }
}
