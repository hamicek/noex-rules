import type { RuleCondition } from '../../types/condition.js';
import type { BaselineComparison } from '../../types/baseline.js';
import type { ConditionBuilder } from '../types.js';
import { requireNonEmptyString } from '../helpers/validators.js';
import { DslValidationError } from '../helpers/errors.js';

const VALID_COMPARISONS: ReadonlySet<BaselineComparison> = new Set([
  'above',
  'below',
  'outside',
  'above_percentile',
  'below_percentile',
]);

/**
 * Fluent builder for baseline anomaly detection conditions.
 *
 * Unlike {@link SourceExpr}, this builder produces a fixed
 * `operator: 'eq', value: true` condition — the anomaly check itself
 * is encoded in the `source` descriptor and evaluated by
 * {@link BaselineStore.checkAnomaly}.
 *
 * @example
 * ```typescript
 * baseline('error_rate').above(2.5)
 * baseline('api_latency').outside(3.0)
 * baseline('response_time').abovePercentile(95)
 * ```
 */
export class BaselineExpr implements ConditionBuilder {
  private readonly metric: string;
  private comparison?: BaselineComparison;
  private sensitivity?: number;

  constructor(metric: string) {
    this.metric = metric;
  }

  /**
   * Anomaly when value is above `mean + sensitivity * stddev`.
   *
   * @param sensitivity - Number of standard deviations (sigma). Must be positive.
   */
  above(sensitivity: number): BaselineExpr {
    this.setComparison('above', sensitivity);
    return this;
  }

  /**
   * Anomaly when value is below `mean - sensitivity * stddev`.
   *
   * @param sensitivity - Number of standard deviations (sigma). Must be positive.
   */
  below(sensitivity: number): BaselineExpr {
    this.setComparison('below', sensitivity);
    return this;
  }

  /**
   * Anomaly when value deviates from mean in either direction
   * by more than `sensitivity * stddev`.
   *
   * @param sensitivity - Number of standard deviations (sigma). Must be positive.
   */
  outside(sensitivity: number): BaselineExpr {
    this.setComparison('outside', sensitivity);
    return this;
  }

  /**
   * Anomaly when value exceeds the Nth percentile.
   *
   * @param percentile - Percentile threshold (0–100 exclusive).
   */
  abovePercentile(percentile: number): BaselineExpr {
    this.setComparison('above_percentile', percentile);
    return this;
  }

  /**
   * Anomaly when value falls below the Nth percentile.
   *
   * @param percentile - Percentile threshold (0–100 exclusive).
   */
  belowPercentile(percentile: number): BaselineExpr {
    this.setComparison('below_percentile', percentile);
    return this;
  }

  build(): RuleCondition {
    if (!this.comparison) {
      throw new DslValidationError(
        `Condition on baseline("${this.metric}"): comparison not specified. ` +
          'Use .above(), .below(), .outside(), .abovePercentile(), or .belowPercentile().',
      );
    }

    const source: RuleCondition['source'] = {
      type: 'baseline',
      metric: this.metric,
      comparison: this.comparison,
    };
    if (this.sensitivity !== undefined) {
      source.sensitivity = this.sensitivity;
    }

    return {
      source,
      operator: 'eq',
      value: true,
    };
  }

  private setComparison(comparison: BaselineComparison, sensitivity: number): void {
    if (typeof sensitivity !== 'number' || !Number.isFinite(sensitivity) || sensitivity <= 0) {
      const label =
        comparison === 'above_percentile' || comparison === 'below_percentile'
          ? 'percentile'
          : 'sensitivity';
      throw new DslValidationError(
        `baseline("${this.metric}").${formatMethodName(comparison)}() ${label} must be a positive finite number, got ${sensitivity}`,
      );
    }

    if (
      (comparison === 'above_percentile' || comparison === 'below_percentile') &&
      sensitivity >= 100
    ) {
      throw new DslValidationError(
        `baseline("${this.metric}").${formatMethodName(comparison)}() percentile must be less than 100, got ${sensitivity}`,
      );
    }

    this.comparison = comparison;
    this.sensitivity = sensitivity;
  }
}

/**
 * Creates a {@link BaselineExpr} targeting a registered baseline metric
 * for anomaly detection.
 *
 * @param metric - The baseline metric name (must match a configured metric).
 * @returns A {@link BaselineExpr} with fluent comparison methods.
 *
 * @example
 * ```typescript
 * baseline('error_rate').above(2.5)         // above 2.5 sigma
 * baseline('latency').below(2.0)            // below 2.0 sigma
 * baseline('throughput').outside(3.0)       // either direction
 * baseline('response_time').abovePercentile(95)
 * baseline('request_count').belowPercentile(5)
 * ```
 */
export function baseline(metric: string): BaselineExpr {
  requireNonEmptyString(metric, 'baseline() metric');
  return new BaselineExpr(metric);
}

function formatMethodName(comparison: BaselineComparison): string {
  switch (comparison) {
    case 'above':
      return 'above';
    case 'below':
      return 'below';
    case 'outside':
      return 'outside';
    case 'above_percentile':
      return 'abovePercentile';
    case 'below_percentile':
      return 'belowPercentile';
  }
}
