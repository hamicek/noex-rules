/**
 * YAML loader for rule engine definitions.
 *
 * Accepts three YAML input formats:
 * - A single rule object.
 * - A top-level YAML sequence (array) of rule objects.
 * - An object with a `rules` key containing an array of rule objects.
 *
 * @example
 * ```typescript
 * import { loadRulesFromYAML, loadRulesFromFile } from 'noex-rules/dsl';
 *
 * // From a YAML string
 * const rules = loadRulesFromYAML(`
 *   id: my-rule
 *   trigger:
 *     type: event
 *     topic: order.created
 *   actions:
 *     - type: emit_event
 *       topic: notification.send
 *       data:
 *         orderId: \${event.orderId}
 * `);
 *
 * // From a file
 * const fileRules = await loadRulesFromFile('./rules/orders.yaml');
 * ```
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { validateRule, YamlValidationError } from './schema.js';
import type { RuleInput } from '../../types/rule.js';
import { DslError } from '../helpers/errors.js';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class YamlLoadError extends DslError {
  constructor(message: string, readonly filePath?: string | undefined) {
    super(filePath ? `${filePath}: ${message}` : message);
    this.name = 'YamlLoadError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a YAML string and returns an array of validated rule definitions.
 *
 * Accepted top-level shapes:
 * - Single YAML object → `[RuleInput]`
 * - YAML array → `RuleInput[]`
 * - Object with `rules` key → `RuleInput[]`
 *
 * @param yamlContent - Raw YAML string.
 * @returns Array of validated `RuleInput` objects.
 * @throws {YamlLoadError} On YAML syntax errors or empty content.
 * @throws {YamlValidationError} On rule structure validation errors.
 */
export function loadRulesFromYAML(yamlContent: string): RuleInput[] {
  let parsed: unknown;
  try {
    parsed = parse(yamlContent);
  } catch (err) {
    throw new YamlLoadError(
      `YAML syntax error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (parsed === null || parsed === undefined) {
    throw new YamlLoadError('YAML content is empty');
  }

  // Top-level pole pravidel
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new YamlLoadError('YAML array is empty, expected at least one rule');
    }
    return parsed.map((item: unknown, i: number) => validateRule(item, `rules[${i}]`));
  }

  if (typeof parsed !== 'object') {
    throw new YamlLoadError(`Expected YAML object or array, got ${typeof parsed}`);
  }

  // Objekt s klíčem `rules`
  const obj = parsed as Record<string, unknown>;
  const rulesField = obj['rules'];
  if (rulesField !== undefined) {
    if (!Array.isArray(rulesField)) {
      throw new YamlLoadError('"rules" must be an array');
    }
    if (rulesField.length === 0) {
      throw new YamlLoadError('"rules" array is empty, expected at least one rule');
    }
    return rulesField.map((item: unknown, i: number) => validateRule(item, `rules[${i}]`));
  }

  // Jeden objekt pravidla
  return [validateRule(parsed, 'rule')];
}

/**
 * Reads a YAML file from disk and returns validated rule definitions.
 *
 * @param filePath - Path to the YAML file.
 * @returns Array of validated `RuleInput` objects.
 * @throws {YamlLoadError} On file read errors, YAML syntax errors, or empty files.
 * @throws {YamlValidationError} On rule structure validation errors.
 */
export async function loadRulesFromFile(filePath: string): Promise<RuleInput[]> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new YamlLoadError(
      `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      filePath,
    );
  }

  try {
    return loadRulesFromYAML(content);
  } catch (err) {
    if (err instanceof YamlLoadError) {
      throw new YamlLoadError(err.message, filePath);
    }
    if (err instanceof YamlValidationError) {
      throw new YamlLoadError(err.message, filePath);
    }
    throw err;
  }
}
