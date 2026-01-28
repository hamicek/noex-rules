/**
 * Příkaz validate pro CLI.
 * Validuje pravidla ze souboru.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GlobalOptions } from '../types.js';
import { ExitCode } from '../types.js';
import { createValidator, type ValidationResult } from '../services/validator.js';
import { FileNotFoundError, ValidationError, type ValidationIssue } from '../utils/errors.js';
import { printData, print, success, warning, colorize } from '../utils/output.js';

/** Options pro příkaz validate */
export interface ValidateOptions extends GlobalOptions {
  strict: boolean;
}

/** Výsledek validace pro zobrazení */
interface ValidateOutput {
  file: string;
  valid: boolean;
  ruleCount: number;
  errorCount: number;
  warningCount: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Načte a parsuje JSON soubor.
 */
function loadJsonFile(filePath: string): unknown {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new FileNotFoundError(filePath);
  }

  const content = readFileSync(absolutePath, 'utf-8');

  try {
    return JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Invalid JSON in file: ${message}`);
  }
}

/**
 * Spočítá počet pravidel.
 */
function countRules(data: unknown): number {
  if (Array.isArray(data)) {
    return data.length;
  }
  return 1;
}

/**
 * Formátuje výstup validace pro pretty formát.
 */
function formatPrettyOutput(output: ValidateOutput): string {
  const lines: string[] = [];

  lines.push(colorize(`File: ${output.file}`, 'bold'));
  lines.push(`Rules: ${output.ruleCount}`);
  lines.push('');

  if (output.valid && output.warningCount === 0) {
    lines.push(success('All rules are valid'));
  } else if (output.valid) {
    lines.push(success(`Valid with ${output.warningCount} warning(s)`));
  } else {
    lines.push(colorize(`✗ ${output.errorCount} error(s), ${output.warningCount} warning(s)`, 'red'));
  }

  if (output.errors.length > 0) {
    lines.push('');
    lines.push(colorize('Errors:', 'red'));
    for (const err of output.errors) {
      lines.push(`  ${colorize('✗', 'red')} ${colorize(err.path, 'cyan')}: ${err.message}`);
    }
  }

  if (output.warnings.length > 0) {
    lines.push('');
    lines.push(colorize('Warnings:', 'yellow'));
    for (const warn of output.warnings) {
      lines.push(`  ${colorize('⚠', 'yellow')} ${colorize(warn.path, 'cyan')}: ${warn.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Akce příkazu validate.
 */
export async function validateCommand(file: string, options: ValidateOptions): Promise<void> {
  const validator = createValidator({ strict: options.strict });

  // Load file
  const data = loadJsonFile(file);
  const ruleCount = countRules(data);

  // Validate
  let result: ValidationResult;
  if (Array.isArray(data)) {
    result = validator.validateMany(data);
  } else {
    result = validator.validate(data);
  }

  const output: ValidateOutput = {
    file: resolve(file),
    valid: result.valid,
    ruleCount,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    errors: result.errors,
    warnings: result.warnings
  };

  // Output based on format
  if (options.format === 'json') {
    printData({
      type: 'validation',
      data: output
    });
  } else {
    print(formatPrettyOutput(output));
  }

  // Exit with appropriate code
  if (!result.valid) {
    throw new ValidationError(
      `Validation failed with ${result.errors.length} error(s)`,
      result.errors
    );
  }

  // In strict mode, warnings also cause non-zero exit
  if (options.strict && result.warnings.length > 0) {
    print('');
    print(warning('Strict mode: warnings treated as errors'));
    throw new ValidationError(
      `Strict validation failed with ${result.warnings.length} warning(s)`,
      result.warnings
    );
  }
}
