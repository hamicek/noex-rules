import type { RuleTrigger } from '../../../types/rule.js';
import type { AbsencePattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

/**
 * Fluent builder pro absence temporální vzor.
 *
 * Absence detekuje situaci, kdy po spouštěcím eventu NEPŘIJDE
 * očekávaný event v daném časovém okně.
 *
 * @example
 * absence()
 *   .after('order.created')
 *   .expected('payment.received')
 *   .within('15m')
 *   .groupBy('orderId')
 *   .build();
 *
 * @example
 * // S filtry na data eventu
 * absence()
 *   .after('registration.started', { source: 'web' })
 *   .expected('registration.completed')
 *   .within('24h')
 *   .groupBy('userId')
 *   .build();
 */
export class AbsenceBuilder implements TriggerBuilder {
  private afterMatcher: EventMatcher | undefined;
  private expectedMatcher: EventMatcher | undefined;
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;

  /**
   * Nastaví spouštěcí event, po kterém se začne čekat na expected event.
   *
   * @param topic  - Topic pattern pro matching eventů
   * @param filter - Volitelný filtr na data eventu
   */
  after(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'absence().after() topic');
    this.afterMatcher = { topic };
    if (filter) this.afterMatcher.filter = filter;
    return this;
  }

  /**
   * Nastaví očekávaný event, jehož absence triggeruje pravidlo.
   *
   * @param topic  - Topic pattern pro matching eventů
   * @param filter - Volitelný filtr na data eventu
   */
  expected(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'absence().expected() topic');
    this.expectedMatcher = { topic };
    if (filter) this.expectedMatcher.filter = filter;
    return this;
  }

  /**
   * Nastaví časové okno, po jehož uplynutí se absence vyhodnotí.
   *
   * @param value - Duration string ("15m", "1h") nebo číslo v milisekundách
   */
  within(value: string | number): this {
    requireDuration(value, 'absence().within()');
    this.windowValue = value;
    return this;
  }

  /**
   * Seskupí instance podle pole v datech eventu.
   *
   * @param field - Cesta k poli v datech eventu (např. "orderId")
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'absence().groupBy()');
    this.groupByField = field;
    return this;
  }

  build(): RuleTrigger {
    if (!this.afterMatcher) {
      throw new DslValidationError('absence() requires .after() to set the trigger event');
    }
    if (!this.expectedMatcher) {
      throw new DslValidationError('absence() requires .expected() to set the awaited event');
    }
    if (this.windowValue === undefined) {
      throw new DslValidationError('absence() requires .within() to set the time window');
    }

    const pattern: AbsencePattern = {
      type: 'absence',
      after: this.afterMatcher,
      expected: this.expectedMatcher,
      within: this.windowValue,
    };

    if (this.groupByField) pattern.groupBy = this.groupByField;

    return { type: 'temporal', pattern };
  }
}

/**
 * Vytvoří builder pro absence temporální vzor.
 *
 * @example
 * Rule.create('payment-timeout')
 *   .when(absence()
 *     .after('order.created')
 *     .expected('payment.received')
 *     .within('15m')
 *     .groupBy('orderId')
 *   )
 *   .then(emit('order.payment_timeout'))
 *   .build();
 */
export function absence(): AbsenceBuilder {
  return new AbsenceBuilder();
}
