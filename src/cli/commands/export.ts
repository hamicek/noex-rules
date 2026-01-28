/**
 * Příkaz export pro CLI.
 * Exportuje pravidla z persistence do souboru nebo na stdout.
 */

import type { Rule } from '../../types/rule.js';
import type { GlobalOptions } from '../types.js';
import { writeJsonFile, toJson } from '../utils/file-loader.js';
import { RulePersistence } from '../../persistence/rule-persistence.js';
import { createRuleIOService, type ExportResult } from '../services/rule-io.js';
import { print, success, info, colorize } from '../utils/output.js';
import { loadConfig } from '../utils/config.js';
import { createStorageAdapter } from './storage-factory.js';

/** Options pro příkaz export */
export interface ExportCommandOptions extends GlobalOptions {
  /** Pretty print JSON */
  pretty: boolean;
  /** Filtrovat podle tagů (comma-separated) */
  tags?: string;
  /** Filtrovat pouze enabled pravidla */
  enabled?: boolean;
}

/** Výstup příkazu pro zobrazení */
interface ExportOutput {
  output: string | null;
  result: ExportResult;
  written: boolean;
}

/**
 * Parsuje seznam tagů ze stringu.
 */
function parseTags(tagsString?: string): string[] | undefined {
  if (!tagsString) return undefined;
  return tagsString.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * Formátuje výstup exportu pro pretty formát.
 */
function formatPrettyOutput(output: ExportOutput): string {
  const lines: string[] = [];

  if (output.written) {
    lines.push(success(`Exported ${output.result.filtered} rule(s) to ${output.output}`));
  } else {
    lines.push(info(`Exporting ${output.result.filtered} rule(s) to stdout`));
  }

  if (output.result.total !== output.result.filtered) {
    lines.push(colorize(`  (filtered from ${output.result.total} total rules)`, 'dim'));
  }

  return lines.join('\n');
}

/**
 * Formátuje pravidla pro export (odstraní interní pole).
 */
function formatRulesForExport(rules: Rule[]): unknown[] {
  return rules.map((rule) => {
    const { version: _version, createdAt: _createdAt, updatedAt: _updatedAt, ...exportable } = rule;
    return exportable;
  });
}

/**
 * Akce příkazu export.
 */
export async function exportCommand(outputPath: string | undefined, options: ExportCommandOptions): Promise<void> {
  const config = loadConfig(options.config);

  // Vytvoření persistence
  const adapter = createStorageAdapter(config.storage);
  const persistence = new RulePersistence(adapter);
  const ruleIO = createRuleIOService(persistence);

  // Export pravidel
  const tags = parseTags(options.tags);
  const result = await ruleIO.export({
    ...(tags && { tags }),
    ...(options.enabled !== undefined && { enabled: options.enabled })
  });

  // Formátování pravidel pro export
  const exportedRules = formatRulesForExport(result.rules);

  const output: ExportOutput = {
    output: outputPath ?? null,
    result,
    written: false
  };

  if (outputPath) {
    // Zápis do souboru
    const absolutePath = writeJsonFile(outputPath, exportedRules, {
      pretty: options.pretty
    });
    output.output = absolutePath;
    output.written = true;

    if (options.format === 'json') {
      console.log(JSON.stringify({
        success: true,
        export: {
          file: absolutePath,
          ruleCount: result.filtered,
          totalRules: result.total
        }
      }));
    } else {
      print(formatPrettyOutput(output));
    }
  } else {
    // Výstup na stdout
    if (options.format === 'json') {
      // V JSON režimu obalit do response objektu
      console.log(JSON.stringify({
        success: true,
        rules: exportedRules,
        meta: {
          total: result.total,
          filtered: result.filtered
        }
      }));
    } else {
      // V pretty/table režimu vypsat přímo JSON pravidla
      print(toJson(exportedRules, options.pretty));

      if (!options.quiet && result.total !== result.filtered) {
        print('');
        print(colorize(`# Filtered ${result.filtered} of ${result.total} rules`, 'dim'));
      }
    }
  }
}
