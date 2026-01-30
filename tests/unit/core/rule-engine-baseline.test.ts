import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../../src/core/rule-engine';
import type { RuleInput } from '../../../src/types/rule';
import type { BaselineConfig } from '../../../src/types/baseline';
import { generateId } from '../../../src/utils/id-generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baselineConfig: BaselineConfig = {
  metrics: [
    {
      name: 'error_rate',
      topic: 'error.*',
      field: 'count',
      function: 'count',
      sampleWindow: '1s',
      trainingPeriod: '1h',
      recalcInterval: '30m',
      method: 'zscore',
    },
    {
      name: 'api_latency',
      topic: 'api.response',
      field: 'responseTimeMs',
      function: 'avg',
      sampleWindow: '1s',
      trainingPeriod: '1h',
      recalcInterval: '15m',
      method: 'ewma',
    },
  ],
  defaultSensitivity: 2.0,
  ewmaAlpha: 0.3,
  minSamples: 3,
};

/**
 * Seeds events directly into the EventStore with spread timestamps.
 * Each event is placed 1 second apart to ensure distinct sample windows.
 */
function seedEvents(
  engine: RuleEngine,
  topic: string,
  data: Record<string, unknown>,
  count: number,
): void {
  const store = engine.getEventStore();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    store.store({
      id: generateId(),
      topic,
      data,
      timestamp: now - (count - i) * 1000,
      source: 'test',
    });
  }
}

const createBaselineRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  id: 'anomaly-rule',
  name: 'Anomaly Detection Rule',
  priority: 100,
  enabled: true,
  tags: ['monitoring'],
  trigger: { type: 'event', topic: 'api.response' },
  conditions: [
    {
      source: { type: 'baseline', metric: 'api_latency', comparison: 'above', sensitivity: 2.0 },
      operator: 'eq',
      value: true,
    },
  ],
  actions: [{ type: 'set_fact', key: 'anomaly_detected', value: true }],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleEngine — baseline integration', () => {
  let engine: RuleEngine;

  afterEach(async () => {
    if (engine) {
      await engine.stop();
    }
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  describe('start() with baseline config', () => {
    it('creates BaselineStore when baseline config is provided', async () => {
      engine = await RuleEngine.start({ name: 'baseline-test', baseline: baselineConfig });

      expect(engine.getBaselineStore()).not.toBeNull();
    });

    it('does not create BaselineStore when no baseline config', async () => {
      engine = await RuleEngine.start({ name: 'no-baseline' });

      expect(engine.getBaselineStore()).toBeNull();
    });

    it('registers configured metrics in BaselineStore', async () => {
      engine = await RuleEngine.start({ name: 'baseline-metrics', baseline: baselineConfig });

      const store = engine.getBaselineStore()!;
      const metrics = store.getMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics.map(m => m.name)).toEqual(['error_rate', 'api_latency']);
    });
  });

  // ---------------------------------------------------------------------------
  // Public API — getBaselineStore, getBaseline, recalculateBaseline
  // ---------------------------------------------------------------------------

  describe('getBaselineStore()', () => {
    it('returns BaselineStore when configured', async () => {
      engine = await RuleEngine.start({ name: 'bs-api', baseline: baselineConfig });

      const store = engine.getBaselineStore();
      expect(store).toBeDefined();
      expect(store).not.toBeNull();
    });

    it('returns null when not configured', async () => {
      engine = await RuleEngine.start({ name: 'bs-api-null' });

      expect(engine.getBaselineStore()).toBeNull();
    });
  });

  describe('getBaseline()', () => {
    it('returns undefined when baseline is not configured', async () => {
      engine = await RuleEngine.start({ name: 'gb-no-config' });

      expect(engine.getBaseline('error_rate')).toBeUndefined();
    });

    it('returns undefined for unknown metric', async () => {
      engine = await RuleEngine.start({ name: 'gb-unknown', baseline: baselineConfig });

      expect(engine.getBaseline('unknown_metric')).toBeUndefined();
    });

    it('returns baseline stats after events are seeded and recalculated', async () => {
      engine = await RuleEngine.start({ name: 'gb-with-data', baseline: baselineConfig });

      seedEvents(engine, 'api.response', { responseTimeMs: 100 }, 10);
      await engine.recalculateBaseline('api_latency');

      const stats = engine.getBaseline('api_latency');
      expect(stats).toBeDefined();
      expect(stats!.metric).toBe('api_latency');
      expect(stats!.sampleCount).toBeGreaterThan(0);
      expect(stats!.mean).toBeCloseTo(100, 0);
    });
  });

  describe('recalculateBaseline()', () => {
    it('throws when baseline is not configured', async () => {
      engine = await RuleEngine.start({ name: 'rb-no-config' });

      await expect(engine.recalculateBaseline('error_rate')).rejects.toThrow(
        'Baseline module is not configured',
      );
    });

    it('throws for unknown metric', async () => {
      engine = await RuleEngine.start({ name: 'rb-unknown', baseline: baselineConfig });

      await expect(engine.recalculateBaseline('nonexistent')).rejects.toThrow(
        'Unknown baseline metric',
      );
    });

    it('returns recalculated stats', async () => {
      engine = await RuleEngine.start({ name: 'rb-ok', baseline: baselineConfig });

      seedEvents(engine, 'api.response', { responseTimeMs: 200 }, 5);

      const stats = await engine.recalculateBaseline('api_latency');
      expect(stats.metric).toBe('api_latency');
      expect(stats.mean).toBeCloseTo(200, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats integration
  // ---------------------------------------------------------------------------

  describe('getStats() — baseline section', () => {
    it('includes baseline stats when configured', async () => {
      engine = await RuleEngine.start({ name: 'stats-bl', baseline: baselineConfig });

      const stats = engine.getStats();
      expect(stats.baseline).toBeDefined();
      expect(stats.baseline!.metricsCount).toBe(2);
      expect(stats.baseline!.totalRecalculations).toBeGreaterThanOrEqual(0);
      expect(stats.baseline!.anomaliesDetected).toBe(0);
    });

    it('does not include baseline stats when not configured', async () => {
      engine = await RuleEngine.start({ name: 'stats-no-bl' });

      const stats = engine.getStats();
      expect(stats.baseline).toBeUndefined();
    });

    it('tracks recalculation count', async () => {
      engine = await RuleEngine.start({ name: 'stats-recalc', baseline: baselineConfig });

      const before = engine.getStats().baseline!.totalRecalculations;
      await engine.recalculateBaseline('api_latency');
      const after = engine.getStats().baseline!.totalRecalculations;

      expect(after).toBe(before + 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Condition evaluation with baseline source
  // ---------------------------------------------------------------------------

  describe('baseline condition evaluation', () => {
    it('passes baseline store to condition evaluator context', async () => {
      engine = await RuleEngine.start({
        name: 'cond-baseline',
        baseline: baselineConfig,
      });

      // Seed spread events to build a stable baseline with some variance
      const es = engine.getEventStore();
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        es.store({
          id: generateId(),
          topic: 'api.response',
          data: { responseTimeMs: 95 + (i % 5) * 2 },  // 95-103 range
          timestamp: now - (20 - i) * 1000,
          source: 'test',
        });
      }
      await engine.recalculateBaseline('api_latency');

      engine.registerRule(createBaselineRule());

      // Emit a normal value within baseline range — no anomaly expected
      await engine.emit('api.response', { responseTimeMs: 100 });
      expect(engine.getFact('anomaly_detected')).toBeUndefined();
    });

    it('detects anomaly when value exceeds baseline', async () => {
      engine = await RuleEngine.start({
        name: 'cond-anomaly',
        baseline: baselineConfig,
      });

      // Build a stable baseline from spread events
      seedEvents(engine, 'api.response', { responseTimeMs: 100 }, 20);
      await engine.recalculateBaseline('api_latency');

      engine.registerRule(createBaselineRule());

      // Emit a very high value — should trigger anomaly
      await engine.emit('api.response', { responseTimeMs: 100_000 });

      expect(engine.getFact('anomaly_detected')).toBe(true);
    });

    it('tracks anomalies detected in stats', async () => {
      engine = await RuleEngine.start({
        name: 'stats-anomaly',
        baseline: baselineConfig,
      });

      seedEvents(engine, 'api.response', { responseTimeMs: 100 }, 20);
      await engine.recalculateBaseline('api_latency');

      engine.registerRule(createBaselineRule());

      // Trigger anomaly
      await engine.emit('api.response', { responseTimeMs: 100_000 });

      const stats = engine.getStats();
      expect(stats.baseline!.anomaliesDetected).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle — stop
  // ---------------------------------------------------------------------------

  describe('stop()', () => {
    it('cleanly stops baseline store', async () => {
      engine = await RuleEngine.start({ name: 'stop-bl', baseline: baselineConfig });
      expect(engine.getBaselineStore()).not.toBeNull();

      await engine.stop();

      expect(engine.getBaselineStore()).toBeNull();
    });

    it('stop without baseline config does not error', async () => {
      engine = await RuleEngine.start({ name: 'stop-no-bl' });

      await expect(engine.stop()).resolves.not.toThrow();
    });
  });
});
