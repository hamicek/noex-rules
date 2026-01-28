import type { RuleTrigger } from '../../../types/rule.js';
import type { SequencePattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

/**
 * Fluent builder for a **sequence** temporal pattern.
 *
 * A sequence defines an ordered series of events that must arrive
 * within a specified time window to trigger the rule.
 *
 * @example
 * ```typescript
 * sequence()
 *   .event('order.created')
 *   .event('payment.received')
 *   .within('5m')
 *   .groupBy('orderId')
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * // With data filters and strict ordering
 * sequence()
 *   .event('auth.login_failed', { method: 'password' })
 *   .event('auth.login_failed', { method: 'password' })
 *   .event('auth.login_failed', { method: 'password' })
 *   .within('5m')
 *   .groupBy('userId')
 *   .strict()
 *   .build();
 * ```
 */
export class SequenceBuilder implements TriggerBuilder {
  private readonly matchers: EventMatcher[] = [];
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;
  private strictMode = false;

  /**
   * Appends an expected event to the sequence.
   *
   * @param topic  - Event topic pattern.
   * @param filter - Optional data filter for the event.
   * @param as     - Optional alias used to reference this event in actions.
   * @returns `this` for chaining.
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
   * Sets the time window within which the entire sequence must complete.
   *
   * @param value - Duration string (e.g. `"5m"`, `"1h"`) or milliseconds.
   * @returns `this` for chaining.
   */
  within(value: string | number): this {
    requireDuration(value, 'sequence().within()');
    this.windowValue = value;
    return this;
  }

  /**
   * Groups pattern instances by a field in the event data so that each
   * unique value is tracked independently.
   *
   * @param field - Dot-notated path (e.g. `"orderId"`, `"data.userId"`).
   * @returns `this` for chaining.
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'sequence().groupBy()');
    this.groupByField = field;
    return this;
  }

  /**
   * Enables strict mode — no unrelated events may occur between the
   * expected events in the sequence.
   *
   * @param value - `true` to enable (default), `false` to disable.
   * @returns `this` for chaining.
   */
  strict(value = true): this {
    this.strictMode = value;
    return this;
  }

  /**
   * Builds the temporal trigger.
   *
   * @returns A `RuleTrigger` of type `'temporal'` with a `SequencePattern`.
   * @throws {DslValidationError} If no events or no time window have been set.
   */
  build(): RuleTrigger {
    if (this.matchers.length === 0) {
      throw new DslValidationError('sequence() requires at least one .event()');
    }
    if (this.windowValue === undefined) {
      throw new DslValidationError('sequence() requires .within() to set the time window');
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
 * Creates a new {@link SequenceBuilder} for defining a sequence temporal pattern.
 *
 * @returns A fresh builder instance.
 *
 * @example
 * ```typescript
 * Rule.create('payment-flow')
 *   .when(sequence()
 *     .event('order.created')
 *     .event('payment.received')
 *     .within('15m')
 *     .groupBy('orderId')
 *   )
 *   .then(emit('order.completed'))
 *   .build();
 * ```
 */
export function sequence(): SequenceBuilder {
  return new SequenceBuilder();
}
