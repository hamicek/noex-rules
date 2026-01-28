import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder, ValueOrRef } from '../types.js';
import { normalizeValue } from '../helpers/ref.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Builder pro set_fact akci.
 */
class SetFactBuilder implements ActionBuilder {
  constructor(
    private readonly key: string,
    private readonly value: unknown
  ) {}

  build(): RuleAction {
    return {
      type: 'set_fact',
      key: this.key,
      value: this.value,
    };
  }
}

/**
 * Builder pro delete_fact akci.
 */
class DeleteFactBuilder implements ActionBuilder {
  constructor(private readonly key: string) {}

  build(): RuleAction {
    return {
      type: 'delete_fact',
      key: this.key,
    };
  }
}

/**
 * Vytvoří akci pro nastavení faktu.
 *
 * @example
 * setFact('order:${event.orderId}:status', 'processed')
 * setFact('customer:vip', ref('event.isVip'))
 *
 * @param key - Klíč faktu (podporuje interpolaci)
 * @param value - Hodnota faktu (může být ref())
 */
export function setFact<T>(key: string, value: ValueOrRef<T>): ActionBuilder {
  requireNonEmptyString(key, 'setFact() key');
  return new SetFactBuilder(key, normalizeValue(value));
}

/**
 * Vytvoří akci pro smazání faktu.
 *
 * @example
 * deleteFact('order:${event.orderId}:pending')
 *
 * @param key - Klíč faktu k smazání (podporuje interpolaci)
 */
export function deleteFact(key: string): ActionBuilder {
  requireNonEmptyString(key, 'deleteFact() key');
  return new DeleteFactBuilder(key);
}
