/**
 * Příkaz import pro CLI.
 * Importuje pravidla ze souboru do persistence.
 */

import type { StorageAdapter } from '@hamicek/noex';
import type { GlobalOptions } from '../types.js';
import { loadJsonFile } from '../utils/file-loader.js';
import { ValidationError } from '../utils/errors.js';
import { RulePersistence } from '../../persistence/rule-persistence.js';
import { createRuleIOService, RuleIOValidationError, type ImportResult, type ImportPreview } from '../services/rule-io.js';
import { print, success, info, colorize } from '../utils/output.js';
import { loadConfig } from '../utils/config.js';
import { createStorageAdapter } from './storage-factory.js';

/** Options pro příkaz import */
export interface ImportCommandOptions extends GlobalOptions {
  /** Dry run - zobrazit co by se importovalo bez provedení změn */
  dryRun: boolean;
  /** Sloučit s existujícími pravidly místo nahrazení */
  merge: boolean;
  /** Validovat pravidla před importem */
  validate: boolean;
  /** Strict mode pro validaci */
  strict: boolean;
}

/** Výstup příkazu pro zobrazení */
interface ImportOutput {
  file: string;
  dryRun: boolean;
  merge: boolean;
  result: ImportResult | ImportPreview;
}

/**
 * Formátuje výstup importu pro pretty formát.
 */
function formatPrettyOutput(output: ImportOutput): string {
  const lines: string[] = [];

  lines.push(colorize(`File: ${output.file}`, 'bold'));

  if (output.dryRun) {
    lines.push(info('Dry run mode - no changes will be made'));
    lines.push('');

    const preview = output.result as ImportPreview;

    if (!preview.valid) {
      lines.push(colorize('Validation failed:', 'red'));
      for (const error of preview.validationErrors) {
        lines.push(`  ${colorize('✗', 'red')} ${error}`);
      }
      return lines.join('\n');
    }

    if (preview.toImport.length > 0) {
      lines.push(colorize(`Would import ${preview.toImport.length} new rule(s):`, 'green'));
      for (const rule of preview.toImport) {
        lines.push(`  ${colorize('+', 'green')} ${rule.id} (${rule.name})`);
      }
    }

    if (preview.toUpdate.length > 0) {
      lines.push(colorize(`Would update ${preview.toUpdate.length} existing rule(s):`, 'yellow'));
      for (const rule of preview.toUpdate) {
        lines.push(`  ${colorize('~', 'yellow')} ${rule.id} (v${rule.oldVersion} → v${rule.newVersion})`);
      }
    }

    if (preview.unchanged.length > 0) {
      lines.push(colorize(`${preview.unchanged.length} rule(s) would remain unchanged`, 'dim'));
    }

    if (preview.toImport.length === 0 && preview.toUpdate.length === 0) {
      lines.push(info('No changes to apply'));
    }
  } else {
    const result = output.result as ImportResult;

    lines.push('');
    lines.push(success(`Import completed successfully`));
    lines.push('');

    if (result.imported > 0) {
      lines.push(`  ${colorize('Imported:', 'green')} ${result.imported} rule(s)`);
    }

    if (result.updated > 0) {
      lines.push(`  ${colorize('Updated:', 'yellow')} ${result.updated} rule(s)`);
    }

    if (result.skipped > 0) {
      lines.push(`  ${colorize('Skipped:', 'dim')} ${result.skipped} rule(s)`);
    }

    lines.push(`  ${colorize('Total:', 'bold')} ${result.total} rule(s) in storage`);
  }

  return lines.join('\n');
}

/**
 * Vytvoří storage adapter podle konfigurace.
 */
function createStorage(config: ReturnType<typeof loadConfig>): StorageAdapter {
  return createStorageAdapter(config.storage);
}

/**
 * Akce příkazu import.
 */
export async function importCommand(file: string, options: ImportCommandOptions): Promise<void> {
  const config = loadConfig(options.config);

  // Načtení souboru
  const { data, path: absolutePath } = loadJsonFile(file);

  // Zajistit, že data jsou pole
  const rules = Array.isArray(data) ? data : [data];

  // Vytvoření persistence
  const adapter = createStorage(config);
  const persistence = new RulePersistence(adapter);
  const ruleIO = createRuleIOService(persistence);

  const importOptions = {
    merge: options.merge,
    validate: options.validate,
    strict: options.strict
  };

  let output: ImportOutput;

  if (options.dryRun) {
    // Dry run mode
    const preview = await ruleIO.previewImport(rules, importOptions);

    output = {
      file: absolutePath,
      dryRun: true,
      merge: options.merge,
      result: preview
    };

    if (options.format === 'json') {
      console.log(JSON.stringify({ success: preview.valid, preview }));
    } else {
      print(formatPrettyOutput(output));
    }

    if (!preview.valid) {
      throw new ValidationError('Validation failed', preview.validationErrors.map((msg) => ({
        path: msg.split(':')[0] ?? '',
        message: msg.split(':').slice(1).join(':').trim() || msg,
        severity: 'error' as const
      })));
    }
  } else {
    // Skutečný import
    try {
      const result = await ruleIO.import(rules, importOptions);

      output = {
        file: absolutePath,
        dryRun: false,
        merge: options.merge,
        result
      };

      if (options.format === 'json') {
        console.log(JSON.stringify({ success: true, import: result }));
      } else {
        print(formatPrettyOutput(output));
      }
    } catch (err) {
      if (err instanceof RuleIOValidationError) {
        const errors = err.validation.errors;
        throw new ValidationError(
          `Import validation failed with ${errors.length} error(s)`,
          errors
        );
      }
      throw err;
    }
  }
}
