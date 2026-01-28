import type { RuleTrigger } from '../../types/rule.js';
import type { TriggerBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Builder pro fact trigger.
 */
class FactTriggerBuilder implements TriggerBuilder {
  constructor(private readonly pattern: string) {}

  build(): RuleTrigger {
    return {
      type: 'fact',
      pattern: this.pattern,
    };
  }
}

/**
 * Vytvoří trigger, který se spustí při změně faktu odpovídajícího patternu.
 *
 * @example
 * // Konkrétní fakt
 * onFact('customer:123:creditScore')
 *
 * // Wildcard pattern - jakýkoliv customer
 * onFact('customer:*:creditScore')
 *
 * // Složitější pattern
 * onFact('inventory:warehouse-*:stock')
 *
 * @param pattern - Pattern pro matching faktů (podporuje * wildcard)
 */
export function onFact(pattern: string): TriggerBuilder {
  requireNonEmptyString(pattern, 'onFact() pattern');
  return new FactTriggerBuilder(pattern);
}
