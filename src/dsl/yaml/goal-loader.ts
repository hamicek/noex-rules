/**
 * YAML loader for backward chaining goal definitions.
 *
 * Accepts three YAML input formats:
 * - A single goal object.
 * - A top-level YAML sequence (array) of goal objects.
 * - An object with a `queries` key containing an array of goal objects.
 *
 * @example
 * ```typescript
 * import { loadGoalsFromYAML, loadGoalsFromFile } from 'noex-rules/dsl';
 *
 * // From a YAML string
 * const goals = loadGoalsFromYAML(`
 *   type: fact
 *   key: "customer:123:tier"
 *   value: "vip"
 * `);
 *
 * // From a file
 * const fileGoals = await loadGoalsFromFile('./queries.yaml');
 * ```
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type { Goal } from '../../types/backward.js';
import { validateGoal, YamlValidationError } from './schema.js';
import { YamlLoadError } from './loader.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a YAML string and returns an array of validated goal definitions.
 *
 * Accepted top-level shapes:
 * - Single YAML object → `[Goal]`
 * - YAML array → `Goal[]`
 * - Object with `queries` key → `Goal[]`
 *
 * @param yamlContent - Raw YAML string.
 * @returns Array of validated `Goal` objects.
 * @throws {YamlLoadError} On YAML syntax errors or empty content.
 * @throws {YamlValidationError} On goal structure validation errors.
 */
export function loadGoalsFromYAML(yamlContent: string): Goal[] {
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

  // Top-level array
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new YamlLoadError('YAML array is empty, expected at least one goal');
    }
    return parsed.map((item: unknown, i: number) => validateGoal(item, `queries[${i}]`));
  }

  if (typeof parsed !== 'object') {
    throw new YamlLoadError(`Expected YAML object or array, got ${typeof parsed}`);
  }

  // Object with `queries` key
  const obj = parsed as Record<string, unknown>;
  const queriesField = obj['queries'];
  if (queriesField !== undefined) {
    if (!Array.isArray(queriesField)) {
      throw new YamlLoadError('"queries" must be an array');
    }
    if (queriesField.length === 0) {
      throw new YamlLoadError('"queries" array is empty, expected at least one goal');
    }
    return queriesField.map((item: unknown, i: number) => validateGoal(item, `queries[${i}]`));
  }

  // Single goal object
  return [validateGoal(parsed, 'goal')];
}

/**
 * Reads a YAML file from disk and returns validated goal definitions.
 *
 * @param filePath - Path to the YAML file.
 * @returns Array of validated `Goal` objects.
 * @throws {YamlLoadError} On file read errors, YAML syntax errors, or empty files.
 * @throws {YamlValidationError} On goal structure validation errors.
 */
export async function loadGoalsFromFile(filePath: string): Promise<Goal[]> {
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
    return loadGoalsFromYAML(content);
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
