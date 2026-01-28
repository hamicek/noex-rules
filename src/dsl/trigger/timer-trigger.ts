import type { RuleTrigger } from '../../types/rule.js';
import type { TriggerBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/** @internal */
class TimerTriggerBuilder implements TriggerBuilder {
  constructor(private readonly timerName: string) {}

  /** @returns A `RuleTrigger` of type `'timer'`. */
  build(): RuleTrigger {
    return {
      type: 'timer',
      name: this.timerName,
    };
  }
}

/**
 * Creates a trigger that fires when the named timer expires.
 *
 * @param name - Timer name to listen for.
 * @returns A {@link TriggerBuilder} for use with {@link RuleBuilder.when}.
 *
 * @example
 * // React to a payment timeout
 * onTimer('payment-timeout')
 *
 * // Periodic cleanup
 * onTimer('daily-cleanup')
 *
 * // Entity-scoped timer
 * onTimer('order:123:reminder')
 */
export function onTimer(name: string): TriggerBuilder {
  requireNonEmptyString(name, 'onTimer() name');
  return new TimerTriggerBuilder(name);
}
