import type { RuleTrigger } from '../../../types/rule.js';
import type { SequencePattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';

/**
 * Fluent builder pro sekvenční temporální vzor.
 *
 * Sekvence definuje řadu událostí, které musí přijít v daném pořadí
 * v rámci časového okna.
 *
 * @example
 * sequence()
 *   .event('order.created')
 *   .event('payment.received')
 *   .within('5m')
 *   .groupBy('orderId')
 *   .build();
 *
 * @example
 * // S filtry na data eventu
 * sequence()
 *   .event('auth.login_failed', { method: 'password' })
 *   .event('auth.login_failed', { method: 'password' })
 *   .event('auth.login_failed', { method: 'password' })
 *   .within('5m')
 *   .groupBy('userId')
 *   .strict()
 *   .build();
 */
export class SequenceBuilder implements TriggerBuilder {
  private readonly matchers: EventMatcher[] = [];
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;
  private strictMode = false;

  /**
   * Přidá očekávaný event do sekvence.
   *
   * @param topic  - Topic pattern pro matching eventů
   * @param filter - Volitelný filtr na data eventu
   * @param as     - Volitelný alias pro referenci v akcích
   */
  event(topic: string, filter?: Record<string, unknown>, as?: string): this {
    requireNonEmptyString(topic, 'sequence().event() topic');
    const matcher: EventMatcher = { topic };
    if (filter) matcher.filter = filter;
    if (as) matcher.as = as;
    this.matchers.push(matcher);
    return this;
  }

  /**
   * Nastaví časové okno, ve kterém musí celá sekvence proběhnout.
   *
   * @param value - Duration string ("5m", "1h") nebo číslo v milisekundách
   */
  within(value: string | number): this {
    requireDuration(value, 'sequence().within()');
    this.windowValue = value;
    return this;
  }

  /**
   * Seskupí instance podle pole v datech eventu.
   *
   * @param field - Cesta k poli v datech eventu (např. "orderId", "data.userId")
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'sequence().groupBy()');
    this.groupByField = field;
    return this;
  }

  /**
   * Zapne striktní režim - žádné jiné eventy nesmí přijít mezi očekávanými.
   */
  strict(value = true): this {
    this.strictMode = value;
    return this;
  }

  build(): RuleTrigger {
    if (this.matchers.length === 0) {
      throw new Error('sequence() requires at least one .event()');
    }
    if (this.windowValue === undefined) {
      throw new Error('sequence() requires .within() to set the time window');
    }

    const pattern: SequencePattern = {
      type: 'sequence',
      events: this.matchers,
      within: this.windowValue,
    };

    if (this.groupByField) pattern.groupBy = this.groupByField;
    if (this.strictMode) pattern.strict = true;

    return { type: 'temporal', pattern };
  }
}

/**
 * Vytvoří builder pro sekvenční temporální vzor.
 *
 * @example
 * Rule.create('payment-flow')
 *   .when(sequence()
 *     .event('order.created')
 *     .event('payment.received')
 *     .within('15m')
 *     .groupBy('orderId')
 *   )
 *   .then(emit('order.completed'))
 *   .build();
 */
export function sequence(): SequenceBuilder {
  return new SequenceBuilder();
}
