import type { RuleTrigger } from '../../../types/rule.js';
import type { AbsencePattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

/**
 * Fluent builder for an **absence** temporal pattern.
 *
 * An absence pattern detects the situation where an expected event does
 * NOT arrive within a given time window after a trigger event.
 *
 * @example
 * ```typescript
 * absence()
 *   .after('order.created')
 *   .expected('payment.received')
 *   .within('15m')
 *   .groupBy('orderId')
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * // With data filters
 * absence()
 *   .after('registration.started', { source: 'web' })
 *   .expected('registration.completed')
 *   .within('24h')
 *   .groupBy('userId')
 *   .build();
 * ```
 */
export class AbsenceBuilder implements TriggerBuilder {
  private afterMatcher: EventMatcher | undefined;
  private expectedMatcher: EventMatcher | undefined;
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;

  /**
   * Sets the initiating event that starts the absence window.
   *
   * @param topic  - Event topic pattern.
   * @param filter - Optional data filter for the event.
   * @returns `this` for chaining.
   */
  after(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'absence().after() topic');
    this.afterMatcher = { topic };
    if (filter) this.afterMatcher.filter = filter;
    return this;
  }

  /**
   * Sets the event whose absence triggers the rule.
   *
   * @param topic  - Event topic pattern.
   * @param filter - Optional data filter for the event.
   * @returns `this` for chaining.
   */
  expected(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'absence().expected() topic');
    this.expectedMatcher = { topic };
    if (filter) this.expectedMatcher.filter = filter;
    return this;
  }

  /**
   * Sets the time window after which the absence is evaluated.
   *
   * @param value - Duration string (e.g. `"15m"`, `"1h"`) or milliseconds.
   * @returns `this` for chaining.
   */
  within(value: string | number): this {
    requireDuration(value, 'absence().within()');
    this.windowValue = value;
    return this;
  }

  /**
   * Groups pattern instances by a field in the event data.
   *
   * @param field - Dot-notated path (e.g. `"orderId"`).
   * @returns `this` for chaining.
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'absence().groupBy()');
    this.groupByField = field;
    return this;
  }

  /**
   * Builds the temporal trigger.
   *
   * @returns A `RuleTrigger` of type `'temporal'` with an `AbsencePattern`.
   * @throws {DslValidationError} If `after`, `expected`, or `within` are missing.
   */
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
 * Creates a new {@link AbsenceBuilder} for defining an absence temporal pattern.
 *
 * @returns A fresh builder instance.
 *
 * @example
 * ```typescript
 * Rule.create('payment-timeout')
 *   .when(absence()
 *     .after('order.created')
 *     .expected('payment.received')
 *     .within('15m')
 *     .groupBy('orderId')
 *   )
 *   .then(emit('order.payment_timeout'))
 *   .build();
 * ```
 */
export function absence(): AbsenceBuilder {
  return new AbsenceBuilder();
}
