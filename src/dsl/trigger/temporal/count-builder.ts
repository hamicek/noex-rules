import type { RuleTrigger } from '../../../types/rule.js';
import type { CountPattern, EventMatcher } from '../../../types/temporal.js';
import type { TriggerBuilder } from '../../types.js';
import { requireNonEmptyString, requireDuration } from '../../helpers/validators.js';
import { DslValidationError } from '../../helpers/errors.js';

/**
 * Fluent builder pro count temporální vzor.
 *
 * Count sleduje počet výskytů eventu v časovém okně a triggeruje
 * pravidlo, když počet splní zadanou podmínku vůči thresholdu.
 *
 * @example
 * count()
 *   .event('auth.login_failed')
 *   .threshold(3)
 *   .window('5m')
 *   .groupBy('userId')
 *   .build();
 *
 * @example
 * // S filtrem, comparison a sliding window
 * count()
 *   .event('api.error', { statusCode: 500 })
 *   .threshold(10)
 *   .comparison('gte')
 *   .window('1m')
 *   .sliding()
 *   .build();
 */
export class CountBuilder implements TriggerBuilder {
  private eventMatcher: EventMatcher | undefined;
  private thresholdValue: number | undefined;
  private comparisonOp: 'gte' | 'lte' | 'eq' = 'gte';
  private windowValue: string | number | undefined;
  private groupByField: string | undefined;
  private slidingMode: boolean | undefined;

  /**
   * Nastaví event, jehož výskyty se počítají.
   *
   * @param topic  - Topic pattern pro matching eventů
   * @param filter - Volitelný filtr na data eventu
   */
  event(topic: string, filter?: Record<string, unknown>): this {
    requireNonEmptyString(topic, 'count().event() topic');
    this.eventMatcher = { topic };
    if (filter) this.eventMatcher.filter = filter;
    return this;
  }

  /**
   * Nastaví prahovou hodnotu počtu.
   *
   * @param value - Minimální/maximální/přesný počet (dle comparison)
   */
  threshold(value: number): this {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new DslValidationError('count().threshold() must be a non-negative finite number');
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
      throw new DslValidationError(`count().comparison() must be 'gte', 'lte', or 'eq', got '${op}'`);
    }
    this.comparisonOp = op;
    return this;
  }

  /**
   * Nastaví časové okno pro počítání.
   *
   * @param value - Duration string ("5m", "1h") nebo číslo v milisekundách
   */
  window(value: string | number): this {
    requireDuration(value, 'count().window()');
    this.windowValue = value;
    return this;
  }

  /**
   * Seskupí instance podle pole v datech eventu.
   *
   * @param field - Cesta k poli v datech eventu (např. "userId")
   */
  groupBy(field: string): this {
    requireNonEmptyString(field, 'count().groupBy()');
    this.groupByField = field;
    return this;
  }

  /**
   * Zapne klouzavé okno (sliding window). Výchozí je tumbling window.
   *
   * @param value - true pro sliding, false pro tumbling (výchozí: true)
   */
  sliding(value = true): this {
    this.slidingMode = value;
    return this;
  }

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
 * Vytvoří builder pro count temporální vzor.
 *
 * @example
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
 */
export function count(): CountBuilder {
  return new CountBuilder();
}
