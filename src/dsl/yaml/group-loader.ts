/**
 * YAML loader for rule group definitions.
 *
 * Accepts three YAML input formats:
 * - A single group object.
 * - A top-level YAML sequence (array) of group objects.
 * - An object with a `groups` key containing an array of group objects.
 *
 * @example
 * ```typescript
 * import { loadGroupsFromYAML, loadGroupsFromFile } from 'noex-rules/dsl';
 *
 * // From a YAML string
 * const groups = loadGroupsFromYAML(`
 *   id: billing
 *   name: Billing Rules
 *   description: All billing-related rules
 * `);
 *
 * // From a file
 * const fileGroups = await loadGroupsFromFile('./groups.yaml');
 * ```
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type { RuleGroupInput } from '../../types/group.js';
import { YamlLoadError } from './loader.js';
import { YamlValidationError } from './schema.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a raw object and returns a type-safe `RuleGroupInput`.
 *
 * Applies defaults:
 * - `enabled` → `true`
 *
 * @param obj  - The raw parsed object.
 * @param path - Dot-notated path prefix for error messages.
 * @returns A validated `RuleGroupInput` object.
 * @throws {YamlValidationError} On any validation error.
 */
function validateGroup(obj: unknown, path: string): RuleGroupInput {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new YamlValidationError(
      `must be an object, got ${Array.isArray(obj) ? 'array' : typeof obj}`,
      path,
    );
  }

  const o = obj as Record<string, unknown>;

  const id = o['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new YamlValidationError(
      `missing required field "id" or it is not a non-empty string`,
      path,
    );
  }

  const name = o['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new YamlValidationError(
      `missing required field "name" or it is not a non-empty string`,
      path,
    );
  }

  const group: RuleGroupInput = { id, name };

  const description = o['description'];
  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new YamlValidationError(`must be a string`, `${path}.description`);
    }
    group.description = description;
  }

  const enabled = o['enabled'];
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') {
      throw new YamlValidationError(`must be a boolean, got ${typeof enabled}`, `${path}.enabled`);
    }
    group.enabled = enabled;
  }

  return group;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a YAML string and returns an array of validated group definitions.
 *
 * Accepted top-level shapes:
 * - Single YAML object → `[RuleGroupInput]`
 * - YAML array → `RuleGroupInput[]`
 * - Object with `groups` key → `RuleGroupInput[]`
 *
 * @param yamlContent - Raw YAML string.
 * @returns Array of validated `RuleGroupInput` objects.
 * @throws {YamlLoadError} On YAML syntax errors or empty content.
 * @throws {YamlValidationError} On group structure validation errors.
 */
export function loadGroupsFromYAML(yamlContent: string): RuleGroupInput[] {
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
      throw new YamlLoadError('YAML array is empty, expected at least one group');
    }
    return parsed.map((item: unknown, i: number) => validateGroup(item, `groups[${i}]`));
  }

  if (typeof parsed !== 'object') {
    throw new YamlLoadError(`Expected YAML object or array, got ${typeof parsed}`);
  }

  // Object with `groups` key
  const obj = parsed as Record<string, unknown>;
  const groupsField = obj['groups'];
  if (groupsField !== undefined) {
    if (!Array.isArray(groupsField)) {
      throw new YamlLoadError('"groups" must be an array');
    }
    if (groupsField.length === 0) {
      throw new YamlLoadError('"groups" array is empty, expected at least one group');
    }
    return groupsField.map((item: unknown, i: number) => validateGroup(item, `groups[${i}]`));
  }

  // Single group object
  return [validateGroup(parsed, 'group')];
}

/**
 * Reads a YAML file from disk and returns validated group definitions.
 *
 * @param filePath - Path to the YAML file.
 * @returns Array of validated `RuleGroupInput` objects.
 * @throws {YamlLoadError} On file read errors, YAML syntax errors, or empty files.
 * @throws {YamlValidationError} On group structure validation errors.
 */
export async function loadGroupsFromFile(filePath: string): Promise<RuleGroupInput[]> {
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
    return loadGroupsFromYAML(content);
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
