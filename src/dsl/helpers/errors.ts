/**
 * Error class hierarchy for the DSL module.
 *
 * Every error thrown by the DSL inherits from {@link DslError}, allowing
 * consumers to catch all DSL-related errors in a single handler:
 *
 * ```typescript
 * try {
 *   rule.build();
 * } catch (err) {
 *   if (err instanceof DslError) {
 *     // Any error from the DSL builder, YAML loader, or template parser
 *   }
 * }
 * ```
 *
 * @module
 */

/**
 * Base error class for all DSL operations.
 *
 * Acts as the common ancestor for all specific DSL errors:
 * {@link DslValidationError}, `ParseError`, `YamlLoadError`, `YamlValidationError`.
 */
export class DslError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DslError';
  }
}

/**
 * Thrown when a DSL builder receives invalid input.
 *
 * This covers empty strings passed to required parameters, missing
 * builder state at `build()` time, out-of-range numbers, and similar
 * validation failures.
 *
 * @example
 * ```typescript
 * import { DslValidationError, Rule } from 'noex-rules/dsl';
 *
 * try {
 *   Rule.create('').build();
 * } catch (err) {
 *   if (err instanceof DslValidationError) {
 *     console.error('Invalid input:', err.message);
 *   }
 * }
 * ```
 */
export class DslValidationError extends DslError {
  constructor(message: string) {
    super(message);
    this.name = 'DslValidationError';
  }
}
