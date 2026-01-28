/**
 * YAML loader pro pravidla rule engine.
 *
 * Podporuje tři formáty YAML vstupu:
 * - Jeden objekt pravidla
 * - Pole pravidel (YAML sequence na top-level)
 * - Objekt s klíčem `rules` obsahující pole pravidel
 *
 * @example
 * ```typescript
 * import { loadRulesFromYAML, loadRulesFromFile } from 'noex-rules/dsl';
 *
 * // Z YAML řetězce
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
 * // Ze souboru
 * const fileRules = await loadRulesFromFile('./rules/orders.yaml');
 * ```
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
 * Parsuje YAML řetězec a vrací pole validovaných pravidel.
 *
 * Podporuje:
 * - Jeden YAML objekt → `[RuleInput]`
 * - YAML pole → `RuleInput[]`
 * - Objekt s klíčem `rules` → `RuleInput[]`
 *
 * @throws {YamlLoadError} Při YAML syntaktické chybě nebo prázdném vstupu
 * @throws {YamlValidationError} Při validační chybě struktury pravidla
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
 * Načte pravidla z YAML souboru.
 *
 * @throws {YamlLoadError} Při chybě čtení souboru, YAML syntaxi nebo prázdném souboru
 * @throws {YamlValidationError} Při validační chybě struktury pravidla
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
