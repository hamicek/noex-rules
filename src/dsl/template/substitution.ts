/**
 * Deep parameter substitution engine for rule templates.
 *
 * Recursively walks a template blueprint, replacing {@link TemplateParamMarker}
 * placeholders with concrete parameter values and invoking function-based
 * computed fields. Runtime {@link Ref} objects are preserved untouched —
 * they are resolved later during rule evaluation, not at template instantiation.
 *
 * @module
 */

import type { TemplateParams } from './types.js';
import { isTemplateParam } from './param.js';
import { isRef } from '../helpers/ref.js';
import { TemplateInstantiationError } from './errors.js';

/**
 * Recursively substitutes template parameter markers within a blueprint value.
 *
 * The walk handles each value type as follows:
 * - **{@link TemplateParamMarker}** — replaced with the corresponding value
 *   from `params`. Throws if the parameter is missing.
 * - **`function`** — invoked with the `params` object; the return value is
 *   used directly (not recursed into).
 * - **{@link Ref}** (`{ ref: string }`) — preserved untouched (runtime reference).
 * - **`Array`** — each element is recursively substituted.
 * - **Plain object** — each own property value is recursively substituted.
 * - **Primitive / `null` / `undefined`** — returned as-is.
 *
 * @param value - The blueprint value to process. May be any JSON-compatible
 *   structure containing param markers and functions.
 * @param params - The resolved parameter name–value map (defaults already merged).
 * @returns A new value with all markers replaced and functions invoked.
 *   Objects and arrays are cloned — the original blueprint is never mutated.
 * @throws {TemplateInstantiationError} If a param marker references a
 *   parameter name that does not exist in `params`.
 */
export function substituteParams(value: unknown, params: TemplateParams): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'function') {
    return (value as (p: TemplateParams) => unknown)(params);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(element => substituteParams(element, params));
  }

  // Object checks: order matters — check specific shapes before generic walk.

  if (isTemplateParam(value)) {
    const { paramName } = value;
    if (!(paramName in params)) {
      throw new TemplateInstantiationError(
        `Template parameter "${paramName}" is referenced in the blueprint but was not provided`,
      );
    }
    return params[paramName];
  }

  if (isRef(value)) {
    return value;
  }

  // Generic plain object — deep-clone with substitution.
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    result[key] = substituteParams(source[key], params);
  }
  return result;
}
