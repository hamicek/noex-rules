/**
 * Error classes for the rule template system.
 *
 * Both error types extend {@link DslError} so that consumers can catch
 * all DSL-related errors (builder, YAML, template) with a single
 * `instanceof DslError` check.
 *
 * @module
 */

import { DslError } from '../helpers/errors.js';

/**
 * Thrown when template parameter validation fails.
 *
 * Collects all validation issues (missing required params, type mismatches,
 * custom validator failures, unknown params) into a single error with an
 * {@link issues} array for programmatic inspection.
 *
 * @example
 * ```typescript
 * try {
 *   template.instantiate({ threshold: 'not-a-number' });
 * } catch (err) {
 *   if (err instanceof TemplateValidationError) {
 *     console.error('Validation failed:', err.issues);
 *     // e.g. ['Parameter "threshold": expected number, got string']
 *   }
 * }
 * ```
 */
export class TemplateValidationError extends DslError {
  /** Individual validation issue descriptions. */
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = 'TemplateValidationError';
    this.issues = issues;
  }
}

/**
 * Thrown when template instantiation fails for reasons other than
 * parameter validation — e.g. a param marker references an undeclared
 * parameter, or the substituted blueprint produces invalid rule data.
 *
 * @example
 * ```typescript
 * try {
 *   template.instantiate({ topic: 'metrics.cpu' });
 * } catch (err) {
 *   if (err instanceof TemplateInstantiationError) {
 *     console.error('Instantiation failed:', err.message);
 *   }
 * }
 * ```
 */
export class TemplateInstantiationError extends DslError {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateInstantiationError';
  }
}
