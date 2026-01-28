import type { RuleTrigger } from '../../../types/rule.js';
import type { CountPattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

/**
 * Fluent builder for a **count** temporal pattern.
 *
 * Tracks the number of matching event occurrences within a time window
 * and triggers the rule when the count satisfies the threshold comparison.
 *
 * @example
 * ```typescript
 * count()
 *   .event('auth.login_failed')
 *   .threshold(3)
 *   .window('5m')
 *   .groupBy('userId')
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * // With filter, comparison, and sliding window
 * count()
 *   .event('api.error', { statusCode: 500 })
 *   .threshold(10)
 *   .comparison('gte')
 *   .window('1m')
 *   .sliding()
 *   .build();
 * ```
 */
export class CountBuilder implements TriggerBuilder {
  private eventMatcher: EventMatcher | undefined;
  private thresholdValue: number | undefined;
  private comparisonOp: 'gte' | 'lte' | 'eq' = 'gte';
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;
  private slidingMode: boolean | undefined;

  /**
   * Sets the event whose occurrences are counted.
   *
   * @param topic  - Event topic pattern.
   * @param filter - Optional data filter for the event.
   * @returns `this` for chaining.
   */
  event(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'count().event() topic');
    this.eventMatcher = { topic };
    if (filter) this.eventMatcher.filter = filter;
    return this;
  }

  /**
   * Sets the count threshold.
   *
   * @param value - Non-negative number (interpreted per the `comparison`).
   * @returns `this` for chaining.
   * @throws {DslValidationError} If `value` is not a non-negative finite number.
   */
  threshold(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new DslValidationError('count().threshold() must be a non-negative finite number');
    }
    this.thresholdValue = value;
    return this;
  }

  /**
   * Sets the comparison operator applied against the threshold.
   *
   * @param op - `'gte'` (default), `'lte'`, or `'eq'`.
   * @returns `this` for chaining.
   * @throws {DslValidationError} If `op` is not a valid comparison.
   */
  comparison(op: 'gte' | 'lte' | 'eq'): this {
    if (op !== 'gte' && op !== 'lte' && op !== 'eq') {
      throw new DslValidationError(`count().comparison() must be 'gte', 'lte', or 'eq', got '${op}'`);
    }
    this.comparisonOp = op;
    return this;
  }

  /**
   * Sets the time window for counting.
   *
   * @param value - Duration string (e.g. `"5m"`, `"1h"`) or milliseconds.
   * @returns `this` for chaining.
   */
  window(value: string | number): this {
    requireDuration(value, 'count().window()');
    this.windowValue = value;
    return this;
  }

  /**
   * Groups pattern instances by a field in the event data.
   *
   * @param field - Dot-notated path (e.g. `"userId"`).
   * @returns `this` for chaining.
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'count().groupBy()');
    this.groupByField = field;
    return this;
  }

  /**
   * Enables a sliding window. The default is a tumbling window.
   *
   * @param value - `true` for sliding (default), `false` for tumbling.
   * @returns `this` for chaining.
   */
  sliding(value = true): this {
    this.slidingMode = value;
    return this;
  }

  /**
   * Builds the temporal trigger.
   *
   * @returns A `RuleTrigger` of type `'temporal'` with a `CountPattern`.
   * @throws {DslValidationError} If event, threshold, or window are missing.
   */
  build(): RuleTrigger {
    if (!this.eventMatcher) {
      throw new DslValidationError('count() requires .event() to set the counted event');
    }
    if (this.thresholdValue === undefined) {
      throw new DslValidationError('count() requires .threshold() to set the count threshold');
    }
    if (this.windowValue === undefined) {
      throw new DslValidationError('count() requires .window() to set the time window');
    }

    const pattern: CountPattern = {
      type: 'count',
      event: this.eventMatcher,
      threshold: this.thresholdValue,
      comparison: this.comparisonOp,
      window: this.windowValue,
    };

    if (this.groupByField) pattern.groupBy = this.groupByField;
    if (this.slidingMode !== undefined) pattern.sliding = this.slidingMode;

    return { type: 'temporal', pattern };
  }
}

/**
 * Creates a new {@link CountBuilder} for defining a count temporal pattern.
 *
 * @returns A fresh builder instance.
 *
 * @example
 * ```typescript
 * Rule.create('brute-force')
 *   .when(count()
 *     .event('auth.login_failed')
 *     .threshold(5)
 *     .window('5m')
 *     .groupBy('userId')
 *     .sliding()
 *   )
 *   .then(emit('security.alert', { type: 'brute_force' }))
 *   .build();
 * ```
 */
export function count(): CountBuilder {
  return new CountBuilder();
}
