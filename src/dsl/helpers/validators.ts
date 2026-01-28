/**
 * Validation helpers for DSL builder inputs.
 *
 * These guards enforce a fail-fast approach — invalid input is rejected
 * at the call-site rather than deferred until `build()`.
 *
 * @module
 */

import { DslValidationError } from './errors.js';

const DURATION_RE = /^\d+(ms|s|m|h|d|w|y)$/;

/**
 * Asserts that `value` is a non-empty string.
 *
 * @param value - The value to validate.
 * @param label - A human-readable parameter name used in the error message.
 * @throws {DslValidationError} If `value` is not a string or is empty.
 */
export function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DslValidationError(`${label} must be a non-empty string`);
  }
}

/**
 * Asserts that `value` is a valid duration.
 *
 * Accepted formats:
 * - A positive finite number interpreted as milliseconds.
 * - A string matching `<digits><unit>` where unit is one of
 *   `ms`, `s`, `m`, `h`, `d`, `w`, `y`.
 *
 * @param value - The value to validate.
 * @param label - A human-readable parameter name used in the error message.
 * @throws {DslValidationError} If `value` is not a valid duration.
 */
export function requireDuration(value: unknown, label: string): asserts value is string | number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new DslValidationError(`${label} must be a positive number (milliseconds), got ${value}`);
    }
    return;
  }

  if (typeof value !== 'string' || !DURATION_RE.test(value)) {
    throw new DslValidationError(
      `${label} must be a duration string (e.g. "5s", "15m", "24h", "7d") or positive number (ms), got ${JSON.stringify(value)}`,
    );
  }
}
