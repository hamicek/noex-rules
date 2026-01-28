import type { Ref } from '../types.js';
import { requireNonEmptyString } from './validators.js';

/**
 * Creates a dynamic reference to a runtime value.
 *
 * References are resolved during rule evaluation and can point to
 * event data, facts, or context variables.
 *
 * @typeParam T - Expected resolved type (compile-time only).
 * @param path - Dot-notated path to the value (e.g. `"event.orderId"`,
 *               `"fact.customer:123"`, `"var.total"`).
 * @returns A {@link Ref} object carrying the path.
 *
 * @example
 * ref('event.orderId')     // reference to orderId from the triggering event
 * ref('fact.customer:123') // reference to a fact value
 * ref('var.total')         // reference to a context variable
 */
export function ref<T = unknown>(path: string): Ref<T> {
  requireNonEmptyString(path, 'ref() path');
  return { ref: path };
}

/**
 * Type-guard that checks whether a value is a {@link Ref}.
 *
 * @param value - The value to test.
 * @returns `true` if `value` is a `Ref` object with a string `ref` property.
 */
export function isRef(value: unknown): value is Ref {
  return (
    value !== null &&
    typeof value === 'object' &&
    'ref' in value &&
    typeof (value as Ref).ref === 'string'
  );
}

/**
 * Normalizes a {@link ValueOrRef} to a plain value or a `{ ref }` object.
 *
 * If `value` is a {@link Ref}, returns `{ ref: value.ref }`.
 * Otherwise returns the value as-is.
 *
 * @typeParam T - The literal value type.
 * @param value - A literal or a Ref.
 * @returns The literal value or a plain `{ ref }` object.
 */
export function normalizeValue<T>(value: T | Ref<T>): T | { ref: string } {
  if (isRef(value)) {
    return { ref: value.ref };
  }
  return value;
}

/**
 * Normalizes a data record by replacing any {@link Ref} instances with
 * plain `{ ref }` objects.
 *
 * Shared utility used by action builders (emit, setTimer, etc.) to
 * produce serializable output.
 *
 * @param data - Key-value record potentially containing Ref values.
 * @returns A new record with all Refs replaced by plain objects.
 */
export function normalizeRefData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      result[key] = isRef(value) ? { ref: (value as Ref).ref } : value;
    }
  }
  return result;
}

/**
 * Normalizes an argument array by replacing any {@link Ref} instances with
 * plain `{ ref }` objects.
 *
 * Shared utility used by the `callService` builder.
 *
 * @param args - Array of arguments potentially containing Ref values.
 * @returns A new array with all Refs replaced by plain objects.
 */
export function normalizeRefArgs(args: unknown[]): unknown[] {
  const result: unknown[] = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    result[i] = isRef(arg) ? { ref: (arg as Ref).ref } : arg;
  }
  return result;
}
