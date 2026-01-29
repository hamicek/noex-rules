/**
 * Template parameter marker factory and type guard.
 *
 * The {@link param} function creates compile-time placeholder markers
 * that are embedded in template blueprints. During instantiation, the
 * substitution engine replaces these markers with actual parameter values.
 *
 * Distinguished from runtime {@link Ref} objects by the `__templateParam`
 * brand key — `ref()` produces `{ ref: string }`, while `param()` produces
 * `{ __templateParam: true, paramName: string }`.
 *
 * @module
 */

import type { TemplateParamMarker } from './types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Creates a compile-time parameter marker for use in template blueprints.
 *
 * The returned marker is cast to `T` so it can be passed directly to
 * existing DSL builders (triggers, conditions, actions) without type errors.
 * At instantiation time, the substitution engine replaces the marker with
 * the actual parameter value.
 *
 * @typeParam T - The expected type of the parameter value. Used only at
 *   compile time for type-safe embedding in builder APIs.
 * @param paramName - Name of the declared template parameter to reference.
 *   Must be a non-empty string matching a parameter declared via
 *   {@link TemplateBuilder.param}.
 * @returns A {@link TemplateParamMarker} cast to `T`.
 *
 * @example
 * ```typescript
 * // In a template blueprint:
 * .when(onEvent(param('topic')))
 * .if(event(param('field')).gte(param('threshold')))
 * ```
 */
export function param<T = unknown>(paramName: string): T {
  requireNonEmptyString(paramName, 'param() name');
  return { __templateParam: true, paramName } as unknown as T;
}

/**
 * Type guard that checks whether a value is a {@link TemplateParamMarker}.
 *
 * Used by the substitution engine to identify placeholders that need to be
 * replaced with actual parameter values during template instantiation.
 *
 * @param value - The value to test.
 * @returns `true` if `value` is a `TemplateParamMarker` with the
 *   `__templateParam` brand and a string `paramName`.
 */
export function isTemplateParam(value: unknown): value is TemplateParamMarker {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__templateParam' in value &&
    (value as TemplateParamMarker).__templateParam === true &&
    'paramName' in value &&
    typeof (value as TemplateParamMarker).paramName === 'string'
  );
}
