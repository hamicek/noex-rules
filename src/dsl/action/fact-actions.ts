import type { RuleAction } from '../../types/action.js';
import type { ActionBuilder, ValueOrRef } from '../types.js';
import { normalizeValue } from '../helpers/ref.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/** @internal */
class SetFactBuilder implements ActionBuilder {
  constructor(
    private readonly key: string,
    private readonly value: unknown
  ) {}

  /** @returns A `RuleAction` of type `'set_fact'`. */
  build(): RuleAction {
    return {
      type: 'set_fact',
      key: this.key,
      value: this.value,
    };
  }
}

/** @internal */
class DeleteFactBuilder implements ActionBuilder {
  constructor(private readonly key: string) {}

  /** @returns A `RuleAction` of type `'delete_fact'`. */
  build(): RuleAction {
    return {
      type: 'delete_fact',
      key: this.key,
    };
  }
}

/**
 * Creates an action that sets (upserts) a fact in the fact store.
 *
 * @typeParam T - Type of the fact value.
 * @param key   - Fact key (supports `${}` interpolation at runtime).
 * @param value - Fact value (may be a {@link ref} for dynamic resolution).
 * @returns An {@link ActionBuilder} for use with {@link RuleBuilder.then}.
 *
 * @example
 * ```typescript
 * setFact('order:${event.orderId}:status', 'processed')
 * setFact('customer:vip', ref('event.isVip'))
 * ```
 */
export function setFact<T>(key: string, value: ValueOrRef<T>): ActionBuilder {
  requireNonEmptyString(key, 'setFact() key');
  return new SetFactBuilder(key, normalizeValue(value));
}

/**
 * Creates an action that deletes a fact from the fact store.
 *
 * @param key - Fact key to delete (supports `${}` interpolation at runtime).
 * @returns An {@link ActionBuilder} for use with {@link RuleBuilder.then}.
 *
 * @example
 * ```typescript
 * deleteFact('order:${event.orderId}:pending')
 * ```
 */
export function deleteFact(key: string): ActionBuilder {
  requireNonEmptyString(key, 'deleteFact() key');
  return new DeleteFactBuilder(key);
}
