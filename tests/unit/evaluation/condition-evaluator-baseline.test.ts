import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConditionEvaluator,
  type EvaluationContext,
  type EvaluationOptions,
} from '../../../src/evaluation/condition-evaluator';
import { FactStore } from '../../../src/core/fact-store';
import type { RuleCondition } from '../../../src/types/condition';
import type { BaselineStore } from '../../../src/baseline/baseline-store';
import type { BaselineStats, BaselineMetricConfig, AnomalyResult, BaselineComparison } from '../../../src/types/baseline';
import type { ConditionEvaluationResult } from '../../../src/debugging/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockBaselineStore(overrides?: {
  metricConfig?: BaselineMetricConfig | undefined;
  anomalyResult?: AnomalyResult | undefined;
  baseline?: BaselineStats | undefined;
}): BaselineStore {
  return {
    getMetricConfig: vi.fn().mockReturnValue(overrides?.metricConfig),
    checkAnomaly: vi.fn().mockReturnValue(overrides?.anomalyResult),
    getBaseline: vi.fn().mockReturnValue(overrides?.baseline),
  } as unknown as BaselineStore;
}

function makeStats(partial?: Partial<BaselineStats>): BaselineStats {
  return {
    metric: 'error_rate',
    mean: 50,
    stddev: 10,
    median: 48,
    percentiles: { 5: 30, 25: 42, 75: 58, 95: 70, 99: 80 },
    sampleCount: 100,
    min: 20,
    max: 85,
    computedAt: Date.now(),
    dataFrom: Date.now() - 86_400_000,
    dataTo: Date.now(),
    ...partial,
  };
}

function makeMetricConfig(partial?: Partial<BaselineMetricConfig>): BaselineMetricConfig {
  return {
    name: 'error_rate',
    topic: 'error.*',
    field: 'count',
    function: 'count',
    sampleWindow: '1m',
    trainingPeriod: '7d',
    recalcInterval: '1h',
    method: 'zscore',
    ...partial,
  };
}

function makeAnomaly(partial?: Partial<AnomalyResult>): AnomalyResult {
  return {
    isAnomaly: true,
    currentValue: 85,
    baseline: makeStats(),
    zScore: 3.5,
    severity: 'high',
    description: 'Value 85 is above baseline',
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConditionEvaluator — baseline source', () => {
  let evaluator: ConditionEvaluator;
  let factStore: FactStore;
  let context: EvaluationContext;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
    factStore = new FactStore();
    context = {
      trigger: { type: 'event', data: {} },
      facts: factStore,
      variables: new Map(),
    };
  });

  describe('getSourceValue — baseline', () => {
    it('returns true when anomaly is detected', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'responseTime' }),
        anomalyResult: makeAnomaly({ isAnomaly: true }),
      });
      context.baselineStore = store;
      context.trigger.data = { responseTime: 500 };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
      expect(store.checkAnomaly).toHaveBeenCalledWith('error_rate', 500, 'above', undefined);
    });

    it('returns false when no anomaly is detected', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'responseTime' }),
        anomalyResult: makeAnomaly({ isAnomaly: false }),
      });
      context.baselineStore = store;
      context.trigger.data = { responseTime: 50 };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
    });

    it('passes sensitivity to checkAnomaly when specified', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'latency' }),
        anomalyResult: makeAnomaly({ isAnomaly: true }),
      });
      context.baselineStore = store;
      context.trigger.data = { latency: 300 };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'api_latency', comparison: 'above', sensitivity: 3.0 },
        operator: 'eq',
        value: true,
      };

      evaluator.evaluate(condition, context);
      expect(store.checkAnomaly).toHaveBeenCalledWith('api_latency', 300, 'above', 3.0);
    });

    it('supports all comparison types', () => {
      const comparisons: BaselineComparison[] = ['above', 'below', 'outside', 'above_percentile', 'below_percentile'];

      for (const comparison of comparisons) {
        const store = createMockBaselineStore({
          metricConfig: makeMetricConfig({ field: 'value' }),
          anomalyResult: makeAnomaly({ isAnomaly: true }),
        });
        context.baselineStore = store;
        context.trigger.data = { value: 100 };

        const condition: RuleCondition = {
          source: { type: 'baseline', metric: 'test_metric', comparison },
          operator: 'eq',
          value: true,
        };

        evaluator.evaluate(condition, context);
        expect(store.checkAnomaly).toHaveBeenCalledWith('test_metric', 100, comparison, undefined);
      }
    });

    it('extracts nested field from event data', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'response.timeMs' }),
        anomalyResult: makeAnomaly({ isAnomaly: true }),
      });
      context.baselineStore = store;
      context.trigger.data = { response: { timeMs: 250 } };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'latency', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      evaluator.evaluate(condition, context);
      expect(store.checkAnomaly).toHaveBeenCalledWith('latency', 250, 'above', undefined);
    });

    it('returns undefined when baselineStore is not set on context', () => {
      // context.baselineStore is undefined
      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      // undefined eq true → false
      expect(evaluator.evaluate(condition, context)).toBe(false);
    });

    it('returns undefined when metric config is not found', () => {
      const store = createMockBaselineStore({ metricConfig: undefined });
      context.baselineStore = store;
      context.trigger.data = { count: 100 };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'nonexistent', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
      expect(store.checkAnomaly).not.toHaveBeenCalled();
    });

    it('returns undefined when field value is not a number', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'status' }),
      });
      context.baselineStore = store;
      context.trigger.data = { status: 'ok' };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
      expect(store.checkAnomaly).not.toHaveBeenCalled();
    });

    it('returns undefined when field is missing from event data', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'responseTime' }),
      });
      context.baselineStore = store;
      context.trigger.data = {};

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'latency', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
      expect(store.checkAnomaly).not.toHaveBeenCalled();
    });

    it('returns undefined when checkAnomaly returns undefined (cold start)', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'count' }),
        anomalyResult: undefined,
      });
      context.baselineStore = store;
      context.trigger.data = { count: 5 };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      // undefined eq true → false (cold start gracefully handled)
      expect(evaluator.evaluate(condition, context)).toBe(false);
    });

    it('works with exists/not_exists operators', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'count' }),
        anomalyResult: makeAnomaly({ isAnomaly: true }),
      });
      context.baselineStore = store;
      context.trigger.data = { count: 100 };

      const existsCondition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'exists',
        value: null,
      };
      expect(evaluator.evaluate(existsCondition, context)).toBe(true);

      // When no baseline store — source value is undefined
      context.baselineStore = undefined;
      const notExistsCondition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'not_exists',
        value: null,
      };
      expect(evaluator.evaluate(notExistsCondition, context)).toBe(true);
    });
  });

  describe('evaluateAll with baseline conditions', () => {
    it('evaluates baseline alongside fact and event conditions', () => {
      factStore.set('config:monitoring', true);

      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'errorCount' }),
        anomalyResult: makeAnomaly({ isAnomaly: true }),
      });
      context.baselineStore = store;
      context.trigger.data = { errorCount: 500, severity: 'critical' };

      const conditions: RuleCondition[] = [
        {
          source: { type: 'fact', pattern: 'config:monitoring' },
          operator: 'eq',
          value: true,
        },
        {
          source: { type: 'baseline', metric: 'error_rate', comparison: 'above', sensitivity: 2.5 },
          operator: 'eq',
          value: true,
        },
        {
          source: { type: 'event', field: 'severity' },
          operator: 'eq',
          value: 'critical',
        },
      ];

      expect(evaluator.evaluateAll(conditions, context)).toBe(true);
    });

    it('short-circuits on failing baseline condition', () => {
      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'count' }),
        anomalyResult: makeAnomaly({ isAnomaly: false }),
      });
      context.baselineStore = store;
      context.trigger.data = { count: 50 };

      const conditions: RuleCondition[] = [
        {
          source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
          operator: 'eq',
          value: true,
        },
        {
          source: { type: 'event', field: 'severity' },
          operator: 'eq',
          value: 'critical',
        },
      ];

      expect(evaluator.evaluateAll(conditions, context)).toBe(false);
    });
  });

  describe('reference resolution — baseline', () => {
    it('resolves baseline reference to full stats object', () => {
      const stats = makeStats({ metric: 'api_latency', mean: 120 });
      const store = createMockBaselineStore({ baseline: stats });
      context.baselineStore = store;
      context.trigger.data = { value: 120 };

      const condition: RuleCondition = {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: { ref: 'baseline.api_latency.mean' },
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
      expect(store.getBaseline).toHaveBeenCalledWith('api_latency');
    });

    it('resolves baseline reference to nested stats field', () => {
      const stats = makeStats({ percentiles: { 95: 200 } });
      const store = createMockBaselineStore({ baseline: stats });
      context.baselineStore = store;
      context.trigger.data = { latency: 250 };

      const condition: RuleCondition = {
        source: { type: 'event', field: 'latency' },
        operator: 'gt',
        value: { ref: 'baseline.error_rate.percentiles.95' },
      };

      expect(evaluator.evaluate(condition, context)).toBe(true);
    });

    it('resolves baseline reference to full stats when no field path', () => {
      const stats = makeStats();
      const store = createMockBaselineStore({ baseline: stats });
      context.baselineStore = store;
      context.trigger.data = {};

      const condition: RuleCondition = {
        source: { type: 'event', field: 'stats' },
        operator: 'eq',
        value: { ref: 'baseline.error_rate' },
      };

      // event.stats is undefined, baseline.error_rate returns the full stats object → not equal
      evaluator.evaluate(condition, context);
      expect(store.getBaseline).toHaveBeenCalledWith('error_rate');
    });

    it('returns undefined for baseline reference when store is not set', () => {
      // No baselineStore on context
      context.trigger.data = { value: 100 };

      const condition: RuleCondition = {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: { ref: 'baseline.error_rate.mean' },
      };

      // ref resolves to undefined → 100 eq undefined → false
      expect(evaluator.evaluate(condition, context)).toBe(false);
    });

    it('returns undefined for baseline reference when metric name is missing', () => {
      const store = createMockBaselineStore();
      context.baselineStore = store;
      context.trigger.data = { value: 100 };

      const condition: RuleCondition = {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: { ref: 'baseline' },
      };

      // No metric name → undefined → 100 eq undefined → false
      expect(evaluator.evaluate(condition, context)).toBe(false);
    });

    it('returns undefined for baseline reference when stats not available', () => {
      const store = createMockBaselineStore({ baseline: undefined });
      context.baselineStore = store;
      context.trigger.data = { value: 100 };

      const condition: RuleCondition = {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: { ref: 'baseline.nonexistent.mean' },
      };

      expect(evaluator.evaluate(condition, context)).toBe(false);
    });
  });

  describe('tracing — baseline source', () => {
    it('correctly traces baseline source type', () => {
      const callback = vi.fn<(result: ConditionEvaluationResult) => void>();
      const options: EvaluationOptions = { onConditionEvaluated: callback };

      const store = createMockBaselineStore({
        metricConfig: makeMetricConfig({ field: 'count' }),
        anomalyResult: makeAnomaly({ isAnomaly: true }),
      });
      context.baselineStore = store;
      context.trigger.data = { count: 100 };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      evaluator.evaluate(condition, context, 0, options);

      expect(callback).toHaveBeenCalledOnce();
      const traceResult = callback.mock.calls[0]![0];
      expect(traceResult.source).toEqual({ type: 'baseline', metric: 'error_rate' });
      expect(traceResult.actualValue).toBe(true);
      expect(traceResult.expectedValue).toBe(true);
      expect(traceResult.result).toBe(true);
      expect(traceResult.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('traces undefined actual value when baseline store is missing', () => {
      const callback = vi.fn<(result: ConditionEvaluationResult) => void>();
      const options: EvaluationOptions = { onConditionEvaluated: callback };

      const condition: RuleCondition = {
        source: { type: 'baseline', metric: 'error_rate', comparison: 'above' },
        operator: 'eq',
        value: true,
      };

      evaluator.evaluate(condition, context, 0, options);

      const traceResult = callback.mock.calls[0]![0];
      expect(traceResult.source).toEqual({ type: 'baseline', metric: 'error_rate' });
      expect(traceResult.actualValue).toBeUndefined();
      expect(traceResult.result).toBe(false);
    });
  });
});
