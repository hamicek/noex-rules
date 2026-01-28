import type { RuleTrigger } from '../../types/rule.js';
import type { TriggerBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Builder pro event trigger.
 */
class EventTriggerBuilder implements TriggerBuilder {
  constructor(private readonly topic: string) {}

  build(): RuleTrigger {
    return {
      type: 'event',
      topic: this.topic,
    };
  }
}

/**
 * Vytvoří trigger, který se spustí při přijetí eventu na daném topicu.
 *
 * @example
 * onEvent('order.created')
 * onEvent('payment.*')
 *
 * @param topic - Topic pattern pro matching eventů
 */
export function onEvent(topic: string): TriggerBuilder {
  requireNonEmptyString(topic, 'onEvent() topic');
  return new EventTriggerBuilder(topic);
}
