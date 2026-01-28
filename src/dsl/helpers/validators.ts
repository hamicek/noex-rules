/**
 * Validační funkce pro DSL vstupy.
 *
 * Zajišťují fail-fast chování při nesprávných vstupech —
 * chyby se odhalí přímo v místě volání, nikoliv až při build().
 */

import { DslValidationError } from './errors.js';

const DURATION_RE = /^\d+(ms|s|m|h|d|w|y)$/;

/**
 * Ověří, že hodnota je neprázdný string.
 *
 * @param value  - Validovaná hodnota
 * @param label  - Lidsky čitelný popis parametru pro chybovou hlášku
 * @throws {DslValidationError} Pokud hodnota není string nebo je prázdná
 */
export function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DslValidationError(`${label} must be a non-empty string`);
  }
}

/**
 * Ověří, že hodnota je platný duration formát.
 *
 * Přijímá buď kladné číslo (milisekundy) nebo string ve formátu
 * `<číslo><jednotka>` kde jednotka je ms|s|m|h|d|w|y.
 *
 * @param value  - Validovaná hodnota
 * @param label  - Lidsky čitelný popis parametru pro chybovou hlášku
 * @throws {DslValidationError} Pokud hodnota není platný duration
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
