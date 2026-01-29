/**
 * Template parameter validation and default merging.
 *
 * Validates user-supplied parameter values against declared template
 * parameter definitions, applies default values for missing optional
 * parameters, and returns the complete merged parameter map ready
 * for use by the substitution engine.
 *
 * @module
 */

import type { TemplateParameterDef, TemplateParamType, TemplateParams } from './types.js';
import { TemplateValidationError } from './errors.js';

/**
 * Checks whether a runtime value matches the declared {@link TemplateParamType}.
 *
 * - `'any'` always passes.
 * - `'array'` uses `Array.isArray`.
 * - `'object'` requires a non-null, non-array object.
 * - Primitives (`'string'`, `'number'`, `'boolean'`) use `typeof`.
 */
function matchesType(value: unknown, type: TemplateParamType): boolean {
  switch (type) {
    case 'any':
      return true;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return typeof value === type;
  }
}

/**
 * Returns a human-readable label for a value's actual runtime type.
 */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validates template parameters against their definitions and merges defaults.
 *
 * Collects **all** validation issues before throwing, so the caller can
 * present every problem at once rather than forcing fix-one-retry cycles.
 *
 * Validation checks (in order per parameter):
 * 1. **Required** — parameter must be provided if no default exists.
 * 2. **Type** — value must match the declared type (unless `'any'`).
 * 3. **Custom** — the optional `validate` callback must return `undefined`.
 *
 * An additional global check rejects any parameter names not declared
 * in the template definitions (unknown parameters).
 *
 * @param definitions - Declared template parameters.
 * @param params - User-supplied parameter values.
 * @returns A new {@link TemplateParams} object with defaults applied for
 *   any missing optional parameters.
 * @throws {TemplateValidationError} If one or more validation issues are found.
 */
export function validateTemplateParams(
  definitions: readonly TemplateParameterDef[],
  params: TemplateParams,
): TemplateParams {
  const issues: string[] = [];
  const declaredNames = new Set(definitions.map(d => d.name));
  const merged: TemplateParams = { ...params };

  // Reject unknown parameters.
  for (const key of Object.keys(params)) {
    if (!declaredNames.has(key)) {
      issues.push(`Unknown parameter "${key}"`);
    }
  }

  // Validate each declared parameter.
  for (const def of definitions) {
    const provided = def.name in params;
    const hasDefault = 'default' in def;

    if (!provided) {
      if (hasDefault) {
        merged[def.name] = def.default;
        continue;
      }
      issues.push(`Missing required parameter "${def.name}"`);
      continue;
    }

    const value = params[def.name];
    const type = def.type ?? 'any';

    if (type !== 'any' && !matchesType(value, type)) {
      issues.push(
        `Parameter "${def.name}": expected ${type}, got ${describeType(value)}`,
      );
      // Skip custom validation when type is already wrong.
      continue;
    }

    if (def.validate) {
      const error = def.validate(value);
      if (error !== undefined) {
        issues.push(`Parameter "${def.name}": ${error}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new TemplateValidationError(
      `Template parameter validation failed with ${issues.length} issue${issues.length > 1 ? 's' : ''}`,
      issues,
    );
  }

  return merged;
}
