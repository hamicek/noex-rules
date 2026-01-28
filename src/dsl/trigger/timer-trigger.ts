import type { RuleTrigger } from '../../types/rule.js';
import type { TriggerBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';

/**
 * Builder pro timer trigger.
 */
class TimerTriggerBuilder implements TriggerBuilder {
  constructor(private readonly timerName: string) {}

  build(): RuleTrigger {
    return {
      type: 'timer',
      name: this.timerName,
    };
  }
}

/**
 * Vytvoří trigger, který se spustí po expiraci timeru s daným jménem.
 *
 * @example
 * // Reakce na timeout platby
 * onTimer('payment-timeout')
 *
 * // Periodická kontrola
 * onTimer('daily-cleanup')
 *
 * // Timer vázaný na entitu
 * onTimer('order:123:reminder')
 *
 * @param name - Jméno timeru, na jehož expiraci se čeká
 */
export function onTimer(name: string): TriggerBuilder {
  requireNonEmptyString(name, 'onTimer() name');
  return new TimerTriggerBuilder(name);
}
