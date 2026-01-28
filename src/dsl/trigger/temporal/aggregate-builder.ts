import type { RuleTrigger } from '../../../types/rule.js';
import type { AggregatePattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'count';
const VALID_FUNCTIONS: readonly AggregateFn[] = ['sum', 'avg', 'min', 'max', 'count'];

/**
 * Fluent builder for an **aggregate** temporal pattern.
 *
 * Tracks numeric field values across matching events, applies an
 * aggregate function (`sum`, `avg`, `min`, `max`, `count`), and triggers
 * the rule when the result satisfies the threshold comparison.
 *
 * @example
 * ```typescript
 * aggregate()
 *   .event('order.paid')
 *   .field('amount')
 *   .function('sum')
 *   .threshold(10000)
 *   .window('1h')
 *   .build();
 * ```
 *
 * @example
 * ```typescript
 * // Average response time exceeding a limit
 * aggregate()
 *   .event('api.response')
 *   .field('responseTime')
 *   .function('avg')
 *   .threshold(500)
 *   .comparison('gte')
 *   .window('5m')
 *   .groupBy('endpoint')
 *   .build();
 * ```
 */
export class AggregateBuilder implements TriggerBuilder {
  private eventMatcher: EventMatcher | undefined;
  private fieldPath: string | undefined;
  private aggregateFn: AggregateFn | undefined;
  private thresholdValue: number | undefined;
  private comparisonOp: 'gte' | 'lte' | 'eq' = 'gte';
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;

  /**
   * Sets the event whose field values are aggregated.
   *
   * @param topic  - Event topic pattern.
   * @param filter - Optional data filter for the event.
   * @returns `this` for chaining.
   */
  event(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'aggregate().event() topic');
    this.eventMatcher = { topic };
    if (filter) this.eventMatcher.filter = filter;
    return this;
  }

  /**
   * Sets the field whose values are aggregated.
   *
   * @param path - Dot-notated path in event data (e.g. `"amount"`,
   *               `"metrics.responseTime"`).
   * @returns `this` for chaining.
   */
  field(path: string): this {
    requireNonEmptyString(path, 'aggregate().field()');
    this.fieldPath = path;
    return this;
  }

  /**
   * Sets the aggregate function to apply over the collected values.
   *
   * @param fn - One of `'sum'`, `'avg'`, `'min'`, `'max'`, or `'count'`.
   * @returns `this` for chaining.
   * @throws {DslValidationError} If `fn` is not a valid aggregate function.
   */
  function(fn: AggregateFn): this {
    if (!VALID_FUNCTIONS.includes(fn)) {
      throw new DslValidationError(
        `aggregate().function() must be one of ${VALID_FUNCTIONS.join(', ')}, got '${fn}'`,
      );
    }
    this.aggregateFn = fn;
    return this;
  }

  /**
   * Sets the threshold value to compare the aggregated result against.
   *
   * @param value - A finite number.
   * @returns `this` for chaining.
   * @throws {DslValidationError} If `value` is not a finite number.
   */
  threshold(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DslValidationError('aggregate().threshold() must be a finite number');
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
      throw new DslValidationError(`aggregate().comparison() must be 'gte', 'lte', or 'eq', got '${op}'`);
    }
    this.comparisonOp = op;
    return this;
  }

  /**
   * Sets the time window for aggregation.
   *
   * @param value - Duration string (e.g. `"5m"`, `"1h"`) or milliseconds.
   * @returns `this` for chaining.
   */
  window(value: string | number): this {
    requireDuration(value, 'aggregate().window()');
    this.windowValue = value;
    return this;
  }

  /**
   * Groups pattern instances by a field in the event data.
   *
   * @param field - Dot-notated path (e.g. `"region"`).
   * @returns `this` for chaining.
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'aggregate().groupBy()');
    this.groupByField = field;
    return this;
  }

  /**
   * Builds the temporal trigger.
   *
   * @returns A `RuleTrigger` of type `'temporal'` with an `AggregatePattern`.
   * @throws {DslValidationError} If event, field, function, threshold, or window
   *         are missing.
   */
  build(): RuleTrigger {
    if (!this.eventMatcher) {
      throw new DslValidationError('aggregate() requires .event() to set the source event');
    }
    if (!this.fieldPath) {
      throw new DslValidationError('aggregate() requires .field() to set the aggregated field');
    }
    if (!this.aggregateFn) {
      throw new DslValidationError('aggregate() requires .function() to set the aggregate function');
    }
    if (this.thresholdValue === undefined) {
      throw new DslValidationError('aggregate() requires .threshold() to set the threshold value');
    }
    if (this.windowValue === undefined) {
      throw new DslValidationError('aggregate() requires .window() to set the time window');
    }

    const pattern: AggregatePattern = {
      type: 'aggregate',
      event: this.eventMatcher,
      field: this.fieldPath,
      function: this.aggregateFn,
      threshold: this.thresholdValue,
      comparison: this.comparisonOp,
      window: this.windowValue,
    };

    if (this.groupByField) pattern.groupBy = this.groupByField;

    return { type: 'temporal', pattern };
  }
}

/**
 * Creates a new {@link AggregateBuilder} for defining an aggregate
 * temporal pattern.
 *
 * @returns A fresh builder instance.
 *
 * @example
 * ```typescript
 * Rule.create('revenue-spike')
 *   .when(aggregate()
 *     .event('order.paid')
 *     .field('amount')
 *     .function('sum')
 *     .threshold(10000)
 *     .window('1h')
 *     .groupBy('region')
 *   )
 *   .then(emit('alert.revenue_spike'))
 *   .build();
 * ```
 */
export function aggregate(): AggregateBuilder {
  return new AggregateBuilder();
}
