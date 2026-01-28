/**
 * Hierarchie chybových tříd pro DSL modul.
 *
 * Všechny chyby z DSL dědí z {@link DslError}, což umožňuje
 * jednoduché odchycení všech DSL chyb najednou:
 *
 * ```typescript
 * try {
 *   rule.build();
 * } catch (err) {
 *   if (err instanceof DslError) {
 *     // Jakákoliv chyba z DSL builderu, YAML loaderu nebo template parseru
 *   }
 * }
 * ```
 */

/**
 * Základní chybová třída pro všechny DSL operace.
 *
 * Slouží jako společný předek pro všechny specifické DSL chyby
 * ({@link DslValidationError}, ParseError, YamlLoadError, YamlValidationError).
 */
export class DslError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DslError';
  }
}

/**
 * Chyba validace vstupu v DSL builderech.
 *
 * Vyvoláváno při neplatném vstupu do builder metod (neplatný string,
 * chybějící povinný parametr, neplatná hodnota) nebo při neúplném stavu
 * builderu v okamžiku volání `build()`.
 *
 * @example
 * ```typescript
 * import { DslValidationError, Rule, onEvent, emit } from 'noex-rules/dsl';
 *
 * try {
 *   Rule.create('').build();
 * } catch (err) {
 *   if (err instanceof DslValidationError) {
 *     console.error('Neplatný vstup:', err.message);
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
