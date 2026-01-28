import type { RuleTrigger } from '../../../types/rule.js';
import type { AggregatePattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

type AggregateFn = 'sum' | 'avg' | 'min' | 'max' | 'count';
const VALID_FUNCTIONS: readonly AggregateFn[] = ['sum', 'avg', 'min', 'max', 'count'];

/**
 * Fluent builder pro aggregate temporální vzor.
 *
 * Aggregate sleduje hodnoty pole v eventech, aplikuje agregační funkci
 * (sum, avg, min, max, count) a triggeruje pravidlo, když výsledek
 * splní podmínku vůči thresholdu.
 *
 * @example
 * aggregate()
 *   .event('order.paid')
 *   .field('amount')
 *   .function('sum')
 *   .threshold(10000)
 *   .window('1h')
 *   .build();
 *
 * @example
 * // Průměrná doba odpovědi přesáhne limit
 * aggregate()
 *   .event('api.response')
 *   .field('responseTime')
 *   .function('avg')
 *   .threshold(500)
 *   .comparison('gte')
 *   .window('5m')
 *   .groupBy('endpoint')
 *   .build();
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
   * Nastaví event, jehož hodnoty se agregují.
   *
   * @param topic  - Topic pattern pro matching eventů
   * @param filter - Volitelný filtr na data eventu
   */
  event(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'aggregate().event() topic');
    this.eventMatcher = { topic };
    if (filter) this.eventMatcher.filter = filter;
    return this;
  }

  /**
   * Nastaví pole, jehož hodnoty se agregují.
   *
   * @param path - Cesta k poli v datech eventu (např. "amount", "metrics.responseTime")
   */
  field(path: string): this {
    requireNonEmptyString(path, 'aggregate().field()');
    this.fieldPath = path;
    return this;
  }

  /**
   * Nastaví agregační funkci.
   *
   * @param fn - Agregační funkce: 'sum', 'avg', 'min', 'max' nebo 'count'
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
   * Nastaví prahovou hodnotu.
   *
   * @param value - Prahová hodnota pro porovnání s agregovaným výsledkem
   */
  threshold(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DslValidationError('aggregate().threshold() must be a finite number');
    }
    this.thresholdValue = value;
    return this;
  }

  /**
   * Nastaví typ porovnání s thresholdem.
   *
   * @param op - Operátor: 'gte' (výchozí), 'lte' nebo 'eq'
   */
  comparison(op: 'gte' | 'lte' | 'eq'): this {
    if (op !== 'gte' && op !== 'lte' && op !== 'eq') {
      throw new DslValidationError(`aggregate().comparison() must be 'gte', 'lte', or 'eq', got '${op}'`);
    }
    this.comparisonOp = op;
    return this;
  }

  /**
   * Nastaví časové okno pro agregaci.
   *
   * @param value - Duration string ("5m", "1h") nebo číslo v milisekundách
   */
  window(value: string | number): this {
    requireDuration(value, 'aggregate().window()');
    this.windowValue = value;
    return this;
  }

  /**
   * Seskupí instance podle pole v datech eventu.
   *
   * @param field - Cesta k poli v datech eventu (např. "region")
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'aggregate().groupBy()');
    this.groupByField = field;
    return this;
  }

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
 * Vytvoří builder pro aggregate temporální vzor.
 *
 * @example
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
 */
export function aggregate(): AggregateBuilder {
  return new AggregateBuilder();
}
