import type { RuleTrigger } from '../../types/rule.js';
import type { TriggerBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/** @internal */
class EventTriggerBuilder implements TriggerBuilder {
  constructor(private readonly topic: string) {}

  /** @returns A `RuleTrigger` of type `'event'`. */
  build(): RuleTrigger {
    return {
      type: 'event',
      topic: this.topic,
    };
  }
}

/**
 * Creates a trigger that fires when an event matching `topic` is received.
 *
 * @param topic - Event topic pattern (supports wildcards, e.g. `"payment.*"`).
 * @returns A {@link TriggerBuilder} for use with {@link RuleBuilder.when}.
 *
 * @example
 * onEvent('order.created')
 * onEvent('payment.*')
 */
export function onEvent(topic: string): TriggerBuilder {
  requireNonEmptyString(topic, 'onEvent() topic');
  return new EventTriggerBuilder(topic);
}
