import type { Ref } from '../types.js';

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
