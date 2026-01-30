import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import { Rule, onEvent, baseline, event, emit, setFact } from '../../src/dsl';
import type { RuleInput } from '../../src/types/rule';
import type { Event } from '../../src/types/event';
import type { BaselineConfig } from '../../src/types/baseline';

describe('Baseline Anomaly Integration', () => {
  const BASE_TIME = 1_700_000_000_000;
  const MINUTE = 60_000;

  let engine: RuleEngine;

  const baselineConfig: BaselineConfig = {
    metrics: [
      {
        name: 'response_time',
        topic: 'api.response',
        field: 'latencyMs',
        function: 'avg',
        sampleWindow: '1m',
        trainingPeriod: '1h',
        recalcInterval: '30m',
        method: 'zscore',
      },
      {
        name: 'error_count',
        topic: 'errors.http',
        field: 'count',
        function: 'sum',
        sampleWindow: '1m',
        trainingPeriod: '1h',
        recalcInterval: '30m',
        method: 'zscore',
      },
      {
        name: 'endpoint_latency',
        topic: 'api.response',
        field: 'latencyMs',
        function: 'avg',
        sampleWindow: '1m',
        trainingPeriod: '1h',
        recalcInterval: '30m',
        method: 'ewma',
        groupBy: 'endpoint',
      },
    ],
    defaultSensitivity: 2.0,
    minSamples: 10,
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    engine = await RuleEngine.start({
      name: 'baseline-test',
      baseline: baselineConfig,
    });
  });

  afterEach(async () => {
    await engine.stop();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Generates values oscillating around a mean with controlled spread.
   * Produces a predictable distribution suitable for baseline training.
   */
  function trainingValues(mean: number, count: number, spread = 3): number[] {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      const sign = i % 2 === 0 ? 1 : -1;
      const offset = (i % spread) + 1;
      values.push(mean + sign * offset);
    }
    return values;
  }

  /**
   * Emits events at distinct 1-minute windows to build up training data.
   * Each value lands in its own sample window.
   */
  async function emitTrainingEvents(
    topic: string,
    field: string,
    values: number[],
  ): Promise<void> {
    for (let i = 0; i < values.length; i++) {
      vi.setSystemTime(BASE_TIME + i * MINUTE + 1000);
      await engine.emit(topic, { [field]: values[i] });
    }
    vi.setSystemTime(BASE_TIME + values.length * MINUTE);
  }

  /**
   * Standard training setup: 20 response time samples around 100ms.
   * Produces mean ≈ 100, stddev ≈ 2.1.
   */
  async function setupResponseTimeBaseline(): Promise<void> {
    await emitTrainingEvents(
      'api.response',
      'latencyMs',
      trainingValues(100, 20),
    );
    await engine.recalculateBaseline('response_time');
  }

  // -------------------------------------------------------------------------
  // Engine lifecycle with baseline module
  // -------------------------------------------------------------------------

  describe('engine lifecycle with baseline module', () => {
    it('reports baseline stats in getStats()', () => {
      const stats = engine.getStats();

      expect(stats.baseline).toBeDefined();
      expect(stats.baseline!.metricsCount).toBe(3);
      expect(stats.baseline!.totalRecalculations).toBeGreaterThanOrEqual(0);
      expect(stats.baseline!.anomaliesDetected).toBe(0);
    });

    it('exposes BaselineStore via getBaselineStore()', () => {
      const store = engine.getBaselineStore();

      expect(store).not.toBeNull();
      expect(store!.getMetrics()).toHaveLength(3);
    });

    it('getBaselineStore() returns null when baseline not configured', async () => {
      const plain = await RuleEngine.start({ name: 'no-baseline' });
      expect(plain.getBaselineStore()).toBeNull();
      await plain.stop();
    });

    it('recalculateBaseline() throws when baseline not configured', async () => {
      const plain = await RuleEngine.start({ name: 'no-baseline' });

      await expect(plain.recalculateBaseline('any')).rejects.toThrow(
        'Baseline module is not configured',
      );

      await plain.stop();
    });

    it('getBaseline() returns undefined for unconfigured metric', () => {
      expect(engine.getBaseline('nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Baseline statistics computation
  // -------------------------------------------------------------------------

  describe('baseline statistics computation', () => {
    it('computes statistics from emitted events', async () => {
      await setupResponseTimeBaseline();

      const stats = engine.getBaseline('response_time');
      expect(stats).toBeDefined();
      expect(stats!.metric).toBe('response_time');
      expect(stats!.sampleCount).toBe(20);
      expect(stats!.mean).toBeCloseTo(100, 0);
      expect(stats!.stddev).toBeGreaterThan(0);
      expect(stats!.min).toBeLessThan(100);
      expect(stats!.max).toBeGreaterThan(100);
      expect(stats!.percentiles[95]).toBeDefined();
    });

    it('persists baseline as fact in FactStore', async () => {
      await setupResponseTimeBaseline();

      const fact = engine.getFact('baseline:response_time:stats');
      expect(fact).toBeDefined();
      expect((fact as { metric: string }).metric).toBe('response_time');
    });

    it('throws on recalculation of unknown metric', async () => {
      await expect(engine.recalculateBaseline('nonexistent')).rejects.toThrow(
        'Unknown baseline metric: "nonexistent"',
      );
    });

    it('returns empty stats when no training data available', async () => {
      await engine.recalculateBaseline('response_time');

      const stats = engine.getBaseline('response_time');
      expect(stats).toBeDefined();
      expect(stats!.sampleCount).toBe(0);
      expect(stats!.mean).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Anomaly detection in rule conditions (RuleInput)
  // -------------------------------------------------------------------------

  describe('anomaly detection in rule conditions', () => {
    it('fires rule when value exceeds baseline threshold', async () => {
      await setupResponseTimeBaseline();

      const rule: RuleInput = {
        id: 'latency-spike',
        name: 'Latency Spike Detection',
        priority: 10,
        enabled: true,
        tags: ['monitoring'],
        trigger: { type: 'event', topic: 'api.response' },
        conditions: [
          {
            source: {
              type: 'baseline',
              metric: 'response_time',
              comparison: 'above',
              sensitivity: 2.0,
            },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [
          { type: 'set_fact', key: 'alert:latency_spike', value: true },
        ],
      };

      engine.registerRule(rule);

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });

      expect(engine.getFact('alert:latency_spike')).toBe(true);
    });

    it('does not fire rule when value is within normal range', async () => {
      await setupResponseTimeBaseline();

      const rule: RuleInput = {
        id: 'latency-normal',
        name: 'Latency Normal Check',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'api.response' },
        conditions: [
          {
            source: {
              type: 'baseline',
              metric: 'response_time',
              comparison: 'above',
              sensitivity: 2.0,
            },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [
          { type: 'set_fact', key: 'alert:false_alarm', value: true },
        ],
      };

      engine.registerRule(rule);

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 101 });

      expect(engine.getFact('alert:false_alarm')).toBeUndefined();
    });

    it('prevents anomaly detection during cold start (insufficient samples)', async () => {
      // Only 5 training samples — below minSamples threshold of 10
      await emitTrainingEvents(
        'api.response',
        'latencyMs',
        trainingValues(100, 5),
      );
      await engine.recalculateBaseline('response_time');

      const rule: RuleInput = {
        id: 'cold-start',
        name: 'Cold Start Test',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'api.response' },
        conditions: [
          {
            source: {
              type: 'baseline',
              metric: 'response_time',
              comparison: 'above',
              sensitivity: 2.0,
            },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [
          { type: 'set_fact', key: 'cold:fired', value: true },
        ],
      };

      engine.registerRule(rule);

      vi.setSystemTime(BASE_TIME + 10 * MINUTE);
      await engine.emit('api.response', { latencyMs: 10_000 });

      // Rule must NOT fire — baseline has too few samples
      expect(engine.getFact('cold:fired')).toBeUndefined();
    });

    it('skips rule when event lacks numeric field for baseline metric', async () => {
      await setupResponseTimeBaseline();

      const rule: RuleInput = {
        id: 'missing-field',
        name: 'Missing Field Test',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'api.response' },
        conditions: [
          {
            source: {
              type: 'baseline',
              metric: 'response_time',
              comparison: 'above',
              sensitivity: 2.0,
            },
            operator: 'eq',
            value: true,
          },
        ],
        actions: [
          { type: 'set_fact', key: 'missing:fired', value: true },
        ],
      };

      engine.registerRule(rule);

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      // Event without latencyMs field — evaluator returns undefined
      await engine.emit('api.response', { status: 200 });

      expect(engine.getFact('missing:fired')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // DSL-defined baseline conditions
  // -------------------------------------------------------------------------

  describe('DSL-defined baseline conditions', () => {
    it('baseline().above() fires on high anomaly', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('dsl-above')
        .name('DSL Above Detection')
        .when(onEvent('api.response'))
        .if(baseline('response_time').above(2.0))
        .then(emit('ops.latency_high', { metric: 'response_time' }))
        .build();

      engine.registerRule(rule);

      const events: Event[] = [];
      engine.subscribe('ops.latency_high', (e) => events.push(e));

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });

      expect(events).toHaveLength(1);
      expect(events[0].data.metric).toBe('response_time');
    });

    it('baseline().below() fires on low anomaly', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('dsl-below')
        .when(onEvent('api.response'))
        .if(baseline('response_time').below(2.0))
        .then(emit('ops.latency_low'))
        .build();

      engine.registerRule(rule);

      const events: Event[] = [];
      engine.subscribe('ops.latency_low', (e) => events.push(e));

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 1 });

      expect(events).toHaveLength(1);
    });

    it('baseline().outside() fires on deviation in either direction', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('dsl-outside')
        .when(onEvent('api.response'))
        .if(baseline('response_time').outside(2.0))
        .then(emit('ops.deviation'))
        .build();

      engine.registerRule(rule);

      const events: Event[] = [];
      engine.subscribe('ops.deviation', (e) => events.push(e));

      // High deviation
      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });
      expect(events).toHaveLength(1);

      // Low deviation
      vi.setSystemTime(BASE_TIME + 26 * MINUTE);
      await engine.emit('api.response', { latencyMs: 1 });
      expect(events).toHaveLength(2);

      // Normal value — no deviation
      vi.setSystemTime(BASE_TIME + 27 * MINUTE);
      await engine.emit('api.response', { latencyMs: 101 });
      expect(events).toHaveLength(2);
    });

    it('baseline().abovePercentile() fires when value exceeds percentile', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('dsl-percentile')
        .when(onEvent('api.response'))
        .if(baseline('response_time').abovePercentile(95))
        .then(emit('ops.p95_exceeded'))
        .build();

      engine.registerRule(rule);

      const events: Event[] = [];
      engine.subscribe('ops.p95_exceeded', (e) => events.push(e));

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });

      expect(events).toHaveLength(1);
    });

    it('baseline().belowPercentile() fires when value falls below percentile', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('dsl-below-percentile')
        .when(onEvent('api.response'))
        .if(baseline('response_time').belowPercentile(5))
        .then(emit('ops.p5_below'))
        .build();

      engine.registerRule(rule);

      const events: Event[] = [];
      engine.subscribe('ops.p5_below', (e) => events.push(e));

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      // Training values range roughly 97–103; p5 ≈ 97
      await engine.emit('api.response', { latencyMs: 50 });

      expect(events).toHaveLength(1);
    });

    it('combines baseline condition with event condition', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('combined-conditions')
        .when(onEvent('api.response'))
        .if(baseline('response_time').above(2.0))
        .and(event('status').eq(500))
        .then(emit('ops.error_spike'))
        .build();

      engine.registerRule(rule);

      const events: Event[] = [];
      engine.subscribe('ops.error_spike', (e) => events.push(e));

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);

      // Anomalous latency but status 200 — both conditions must pass
      await engine.emit('api.response', { latencyMs: 500, status: 200 });
      expect(events).toHaveLength(0);

      // Anomalous latency AND status 500 — both conditions pass
      vi.setSystemTime(BASE_TIME + 26 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500, status: 500 });
      expect(events).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Grouped baselines
  // -------------------------------------------------------------------------

  describe('grouped baselines', () => {
    it('maintains separate baselines per group key', async () => {
      // Emit training data for two endpoints with very different latency profiles
      for (let i = 0; i < 15; i++) {
        vi.setSystemTime(BASE_TIME + i * MINUTE + 1000);
        await engine.emit('api.response', {
          latencyMs: 50 + (i % 3),
          endpoint: '/fast',
        });
      }
      for (let i = 0; i < 15; i++) {
        vi.setSystemTime(BASE_TIME + i * MINUTE + 2000);
        await engine.emit('api.response', {
          latencyMs: 500 + (i % 3),
          endpoint: '/slow',
        });
      }

      vi.setSystemTime(BASE_TIME + 20 * MINUTE);
      await engine.recalculateBaseline('endpoint_latency', '/fast');
      await engine.recalculateBaseline('endpoint_latency', '/slow');

      const fast = engine.getBaseline('endpoint_latency', '/fast');
      const slow = engine.getBaseline('endpoint_latency', '/slow');

      expect(fast).toBeDefined();
      expect(slow).toBeDefined();
      expect(fast!.mean).toBeLessThan(100);
      expect(slow!.mean).toBeGreaterThan(400);
      expect(fast!.groupKey).toBe('/fast');
      expect(slow!.groupKey).toBe('/slow');
    });

    it('stores grouped baselines under separate fact keys', async () => {
      for (let i = 0; i < 12; i++) {
        vi.setSystemTime(BASE_TIME + i * MINUTE + 1000);
        await engine.emit('api.response', {
          latencyMs: 100 + i,
          endpoint: '/users',
        });
      }

      vi.setSystemTime(BASE_TIME + 15 * MINUTE);
      await engine.recalculateBaseline('endpoint_latency', '/users');

      const fact = engine.getFact('baseline:endpoint_latency:/users:stats');
      expect(fact).toBeDefined();
      expect((fact as { groupKey: string }).groupKey).toBe('/users');
    });
  });

  // -------------------------------------------------------------------------
  // Stats tracking
  // -------------------------------------------------------------------------

  describe('stats tracking', () => {
    it('tracks recalculation count', async () => {
      await emitTrainingEvents(
        'api.response',
        'latencyMs',
        trainingValues(100, 15),
      );

      await engine.recalculateBaseline('response_time');

      const stats = engine.getStats();
      // Initial recalculations at startup + manual recalculation
      expect(stats.baseline!.totalRecalculations).toBeGreaterThanOrEqual(1);
    });

    it('tracks anomaly detection count', async () => {
      await setupResponseTimeBaseline();

      const store = engine.getBaselineStore()!;

      // Manually check anomaly — value far above mean
      store.checkAnomaly('response_time', 500, 'above', 2.0);

      const stats = engine.getStats();
      expect(stats.baseline!.anomaliesDetected).toBe(1);
    });

    it('increments anomaly count from rule evaluation', async () => {
      await setupResponseTimeBaseline();

      const rule = Rule.create('stats-anomaly')
        .when(onEvent('api.response'))
        .if(baseline('response_time').above(2.0))
        .then(emit('ops.alert'))
        .build();

      engine.registerRule(rule);

      const before = engine.getStats().baseline!.anomaliesDetected;

      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });

      const after = engine.getStats().baseline!.anomaliesDetected;
      expect(after).toBeGreaterThan(before);
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end scenario
  // -------------------------------------------------------------------------

  describe('end-to-end scenario', () => {
    it('detects latency anomaly and executes complete action pipeline', async () => {
      // 1. Build training data — 20 samples of normal response times (~100ms)
      await setupResponseTimeBaseline();

      // 2. Register monitoring rule via DSL
      const rule = Rule.create('e2e-anomaly')
        .name('E2E Latency Anomaly')
        .priority(100)
        .tags('monitoring', 'anomaly')
        .when(onEvent('api.response'))
        .if(baseline('response_time').above(2.0))
        .then(emit('ops.anomaly_detected', { metric: 'response_time', severity: 'high' }))
        .also(setFact('anomaly:response_time:last', true))
        .build();

      engine.registerRule(rule);

      // 3. Subscribe to alert events
      const alerts: Event[] = [];
      engine.subscribe('ops.anomaly_detected', (e) => alerts.push(e));

      // 4. Emit normal event — should NOT trigger
      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 101 });

      expect(alerts).toHaveLength(0);
      expect(engine.getFact('anomaly:response_time:last')).toBeUndefined();

      // 5. Emit anomalous event — SHOULD trigger
      vi.setSystemTime(BASE_TIME + 26 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].data.metric).toBe('response_time');
      expect(alerts[0].data.severity).toBe('high');
      expect(engine.getFact('anomaly:response_time:last')).toBe(true);

      // 6. Verify engine stats reflect activity
      const stats = engine.getStats();
      expect(stats.baseline!.metricsCount).toBe(3);
      expect(stats.baseline!.anomaliesDetected).toBeGreaterThanOrEqual(1);
      expect(stats.rulesExecuted).toBeGreaterThanOrEqual(1);
    });

    it('handles multiple metrics with independent baselines', async () => {
      // Train response_time baseline
      await emitTrainingEvents(
        'api.response',
        'latencyMs',
        trainingValues(100, 20),
      );
      await engine.recalculateBaseline('response_time');

      // Train error_count baseline
      await emitTrainingEvents(
        'errors.http',
        'count',
        trainingValues(5, 20),
      );
      await engine.recalculateBaseline('error_count');

      // Register rules for both metrics
      const latencyRule = Rule.create('latency-alert')
        .when(onEvent('api.response'))
        .if(baseline('response_time').above(2.0))
        .then(emit('ops.latency_alert'))
        .build();

      const errorRule = Rule.create('error-alert')
        .when(onEvent('errors.http'))
        .if(baseline('error_count').above(2.0))
        .then(emit('ops.error_alert'))
        .build();

      engine.registerRule(latencyRule);
      engine.registerRule(errorRule);

      const latencyAlerts: Event[] = [];
      const errorAlerts: Event[] = [];
      engine.subscribe('ops.latency_alert', (e) => latencyAlerts.push(e));
      engine.subscribe('ops.error_alert', (e) => errorAlerts.push(e));

      // Anomalous response time — only latency rule fires
      vi.setSystemTime(BASE_TIME + 25 * MINUTE);
      await engine.emit('api.response', { latencyMs: 500 });

      expect(latencyAlerts).toHaveLength(1);
      expect(errorAlerts).toHaveLength(0);

      // Anomalous error count — only error rule fires
      vi.setSystemTime(BASE_TIME + 26 * MINUTE);
      await engine.emit('errors.http', { count: 100 });

      expect(latencyAlerts).toHaveLength(1);
      expect(errorAlerts).toHaveLength(1);
    });
  });
});
