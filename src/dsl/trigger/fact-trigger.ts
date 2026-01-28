import type { RuleTrigger } from '../../types/rule.js';
import type { TriggerBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/** @internal */
class FactTriggerBuilder implements TriggerBuilder {
  constructor(private readonly pattern: string) {}

  /** @returns A `RuleTrigger` of type `'fact'`. */
  build(): RuleTrigger {
    return {
      type: 'fact',
      pattern: this.pattern,
    };
  }
}

/**
 * Creates a trigger that fires when a fact matching `pattern` changes.
 *
 * @param pattern - Fact key pattern (supports `*` wildcards).
 * @returns A {@link TriggerBuilder} for use with {@link RuleBuilder.when}.
 *
 * @example
 * // Exact fact key
 * onFact('customer:123:creditScore')
 *
 * // Wildcard — any customer
 * onFact('customer:*:creditScore')
 *
 * // Composite wildcard
 * onFact('inventory:warehouse-*:stock')
 */
export function onFact(pattern: string): TriggerBuilder {
  requireNonEmptyString(pattern, 'onFact() pattern');
  return new FactTriggerBuilder(pattern);
}
