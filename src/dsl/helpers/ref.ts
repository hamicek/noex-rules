import type { Ref } from '../types.js';
import { requireNonEmptyString } from './validators.js';

/**
 * Vytvoří referenci na hodnotu z kontextu.
 *
 * @example
 * ref('event.orderId')     // Reference na orderId z eventu
 * ref('fact.customer:123') // Reference na fakt
 * ref('var.total')         // Reference na proměnnou
 *
 * @param path - Cesta k hodnotě (event.field, fact.key, var.name)
 */
export function ref<T = unknown>(path: string): Ref<T> {
  requireNonEmptyString(path, 'ref() path');
  return { ref: path };
}

/**
 * Kontroluje, zda je hodnota referencí.
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
 * Normalizuje hodnotu - vrací buď literál nebo ref objekt.
 */
export function normalizeValue<T>(value: T | Ref<T>): T | { ref: string } {
  if (isRef(value)) {
    return { ref: value.ref };
  }
  return value;
}

/**
 * Normalizuje datový objekt — nahradí Ref instance prostými `{ ref }` objekty.
 *
 * Sdílená utilita pro action buildery (emit, setTimer, callService),
 * eliminuje duplicitní Object.entries + isRef pattern.
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
 * Normalizuje pole argumentů — nahradí Ref instance prostými `{ ref }` objekty.
 *
 * Sdílená utilita pro callService builder.
 */
export function normalizeRefArgs(args: unknown[]): unknown[] {
  const result: unknown[] = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    result[i] = isRef(arg) ? { ref: (arg as Ref).ref } : arg;
  }
  return result;
}
