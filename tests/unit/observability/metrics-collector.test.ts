import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraceCollector } from '../../../src/debugging/trace-collector.js';
import { MetricsCollector } from '../../../src/observability/metrics-collector.js';
import type { EngineStats } from '../../../src/types/index.js';
import type { CounterMetric, HistogramMetric } from '../../../src/observability/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStats(overrides: Partial<EngineStats> = {}): EngineStats {
  return {
    rulesCount: 0,
    factsCount: 0,
    timersCount: 0,
    eventsProcessed: 0,
    rulesExecuted: 0,
    avgProcessingTimeMs: 0,
    ...overrides,
  };
}

function findCounter(counters: CounterMetric[], name: string): CounterMetric | undefined {
  return counters.find(c => c.name === name);
}

function findHistogram(histograms: HistogramMetric[], name: string): HistogramMetric | undefined {
  return histograms.find(h => h.name === name);
}

function counterValue(counters: CounterMetric[], name: string, labels: Record<string, string> = {}): number {
  const counter = findCounter(counters, name);
  if (!counter) return 0;
  const match = counter.values.find(v => {
    const keys = Object.keys(labels);
    if (keys.length !== Object.keys(v.labels).length) return false;
    return keys.every(k => v.labels[k] === labels[k]);
  });
  return match?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsCollector', () => {
  let trace: TraceCollector;
  let stats: EngineStats;
  let collector: MetricsCollector;

  beforeEach(() => {
    trace = new TraceCollector({ enabled: true });
    stats = createStats();
    collector = new MetricsCollector(trace, () => stats);
  });

  // -----------------------------------------------------------------------
  // Inicializace
  // -----------------------------------------------------------------------

  describe('initialization', () => {
    it('should auto-enable tracing on the TraceCollector', () => {
      const disabledTrace = new TraceCollector({ enabled: false });
      expect(disabledTrace.isEnabled()).toBe(false);

      new MetricsCollector(disabledTrace, () => stats);

      expect(disabledTrace.isEnabled()).toBe(true);
    });

    it('should not disable already-enabled tracing', () => {
      const enabledTrace = new TraceCollector({ enabled: true });
      new MetricsCollector(enabledTrace, () => stats);
      expect(enabledTrace.isEnabled()).toBe(true);
    });

    it('should register all expected counters', () => {
      const counters = collector.getCounters();
      const names = counters.map(c => c.name);

      expect(names).toContain('rules_triggered_total');
      expect(names).toContain('rules_executed_total');
      expect(names).toContain('rules_skipped_total');
      expect(names).toContain('rules_failed_total');
      expect(names).toContain('events_processed_total');
      expect(names).toContain('facts_changed_total');
      expect(names).toContain('actions_executed_total');
      expect(names).toContain('actions_failed_total');
      expect(names).toContain('conditions_evaluated_total');
    });

    it('should register all expected histograms', () => {
      const histograms = collector.getHistograms();
      const names = histograms.map(h => h.name);

      expect(names).toContain('evaluation_duration_seconds');
      expect(names).toContain('condition_duration_seconds');
      expect(names).toContain('action_duration_seconds');
    });

    it('should start with zero counter values', () => {
      const counters = collector.getCounters();
      for (const counter of counters) {
        expect(counter.values).toHaveLength(0);
      }
    });

    it('should start with no histogram samples', () => {
      const histograms = collector.getHistograms();
      for (const histogram of histograms) {
        expect(histogram.samples).toHaveLength(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Counter inkrementace pro jednotlivé trace entry typy
  // -----------------------------------------------------------------------

  describe('counter incrementation', () => {
    it('should increment rules_triggered_total on rule_triggered', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1' });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_triggered_total')).toBe(1);
    });

    it('should increment rules_executed_total on rule_executed', () => {
      trace.record('rule_executed', {}, { ruleId: 'r1', durationMs: 10 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_executed_total')).toBe(1);
    });

    it('should increment rules_skipped_total on rule_skipped', () => {
      trace.record('rule_skipped', {}, { ruleId: 'r1', durationMs: 2 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_skipped_total')).toBe(1);
    });

    it('should increment both rules_failed_total and actions_failed_total on action_failed', () => {
      trace.record('action_failed', { actionType: 'set_fact' }, { ruleId: 'r1', durationMs: 5 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_failed_total')).toBe(1);
      expect(counterValue(counters, 'actions_failed_total', { action_type: 'set_fact' })).toBe(1);
    });

    it('should increment events_processed_total on event_emitted', () => {
      trace.record('event_emitted', { eventType: 'order_placed' });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'events_processed_total')).toBe(1);
    });

    it('should increment facts_changed_total with operation label on fact_changed', () => {
      trace.record('fact_changed', { operation: 'created' });
      trace.record('fact_changed', { operation: 'updated' });
      trace.record('fact_changed', { operation: 'updated' });
      trace.record('fact_changed', { operation: 'deleted' });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'facts_changed_total', { operation: 'created' })).toBe(1);
      expect(counterValue(counters, 'facts_changed_total', { operation: 'updated' })).toBe(2);
      expect(counterValue(counters, 'facts_changed_total', { operation: 'deleted' })).toBe(1);
    });

    it('should increment actions_executed_total with action_type label on action_completed', () => {
      trace.record('action_completed', { actionType: 'set_fact' }, { ruleId: 'r1', durationMs: 3 });
      trace.record('action_completed', { actionType: 'emit_event' }, { ruleId: 'r1', durationMs: 1 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'actions_executed_total', { action_type: 'set_fact' })).toBe(1);
      expect(counterValue(counters, 'actions_executed_total', { action_type: 'emit_event' })).toBe(1);
    });

    it('should increment conditions_evaluated_total with result label on condition_evaluated', () => {
      trace.record('condition_evaluated', { passed: true, conditionIndex: 0 }, { ruleId: 'r1', durationMs: 1 });
      trace.record('condition_evaluated', { passed: false, conditionIndex: 0 }, { ruleId: 'r1', durationMs: 1 });
      trace.record('condition_evaluated', { passed: true, conditionIndex: 1 }, { ruleId: 'r1', durationMs: 1 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'conditions_evaluated_total', { result: 'pass' })).toBe(2);
      expect(counterValue(counters, 'conditions_evaluated_total', { result: 'fail' })).toBe(1);
    });

    it('should accumulate multiple events of the same type', () => {
      for (let i = 0; i < 5; i++) {
        trace.record('rule_triggered', {}, { ruleId: 'r1' });
      }

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_triggered_total')).toBe(5);
    });

    it('should ignore unrelated trace entry types', () => {
      trace.record('timer_set', {});
      trace.record('timer_cancelled', {});
      trace.record('timer_expired', {});
      trace.record('action_started', {}, { ruleId: 'r1' });

      const counters = collector.getCounters();
      // Žádný counter by neměl mít žádné hodnoty
      for (const counter of counters) {
        expect(counter.values).toHaveLength(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Histogramy
  // -----------------------------------------------------------------------

  describe('histogram observations', () => {
    it('should observe evaluation_duration_seconds on rule_executed', () => {
      trace.record('rule_executed', {}, { ruleId: 'r1', durationMs: 50 });

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;
      expect(hist.samples).toHaveLength(1);

      const sample = hist.samples[0]!;
      expect(sample.count).toBe(1);
      expect(sample.sum).toBeCloseTo(0.05); // 50ms → 0.05s
    });

    it('should observe evaluation_duration_seconds on rule_skipped', () => {
      trace.record('rule_skipped', {}, { ruleId: 'r1', durationMs: 5 });

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;
      expect(hist.samples).toHaveLength(1);
      expect(hist.samples[0]!.sum).toBeCloseTo(0.005);
    });

    it('should observe condition_duration_seconds on condition_evaluated', () => {
      trace.record('condition_evaluated', { passed: true, conditionIndex: 0 }, { ruleId: 'r1', durationMs: 2 });

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'condition_duration_seconds')!;
      expect(hist.samples).toHaveLength(1);
      expect(hist.samples[0]!.sum).toBeCloseTo(0.002);
    });

    it('should observe action_duration_seconds on action_completed', () => {
      trace.record('action_completed', { actionType: 'set_fact' }, { ruleId: 'r1', durationMs: 25 });

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'action_duration_seconds')!;
      expect(hist.samples).toHaveLength(1);

      const sample = hist.samples[0]!;
      expect(sample.labels).toEqual({ action_type: 'set_fact' });
      expect(sample.sum).toBeCloseTo(0.025);
    });

    it('should observe action_duration_seconds on action_failed', () => {
      trace.record('action_failed', { actionType: 'emit_event' }, { ruleId: 'r1', durationMs: 100 });

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'action_duration_seconds')!;
      expect(hist.samples).toHaveLength(1);
      expect(hist.samples[0]!.labels).toEqual({ action_type: 'emit_event' });
    });

    it('should not observe histogram when durationMs is missing', () => {
      trace.record('rule_executed', {}, { ruleId: 'r1' }); // no durationMs

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;
      expect(hist.samples).toHaveLength(0);
    });

    it('should correctly distribute values into cumulative buckets', () => {
      const customCollector = new MetricsCollector(
        trace,
        () => stats,
        { histogramBuckets: [0.01, 0.05, 0.1, 0.5, 1] },
      );

      // 5ms → 0.005s (fits in 0.01 bucket)
      trace.record('rule_executed', {}, { ruleId: 'r1', durationMs: 5 });
      // 30ms → 0.03s (fits in 0.05 bucket)
      trace.record('rule_executed', {}, { ruleId: 'r2', durationMs: 30 });
      // 200ms → 0.2s (fits in 0.5 bucket)
      trace.record('rule_executed', {}, { ruleId: 'r3', durationMs: 200 });
      // 2000ms → 2s (exceeds all buckets)
      trace.record('rule_executed', {}, { ruleId: 'r4', durationMs: 2000 });

      const histograms = customCollector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;
      expect(hist.samples).toHaveLength(1);

      const sample = hist.samples[0]!;
      expect(sample.count).toBe(4);
      expect(sample.sum).toBeCloseTo(2.235); // 0.005 + 0.03 + 0.2 + 2.0

      // Kumulativní bucket counts: [le<=0.01, le<=0.05, le<=0.1, le<=0.5, le<=1]
      expect(sample.bucketCounts).toEqual([1, 2, 2, 3, 3]);
      // Hodnota 2s neprojde žádným bucketem → zachycena jen v +Inf (= count)
    });

    it('should separate histogram samples by label set', () => {
      trace.record('action_completed', { actionType: 'set_fact' }, { ruleId: 'r1', durationMs: 10 });
      trace.record('action_completed', { actionType: 'emit_event' }, { ruleId: 'r1', durationMs: 20 });
      trace.record('action_completed', { actionType: 'set_fact' }, { ruleId: 'r1', durationMs: 30 });

      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'action_duration_seconds')!;
      expect(hist.samples).toHaveLength(2);

      const setFact = hist.samples.find(s => s.labels.action_type === 'set_fact')!;
      expect(setFact.count).toBe(2);
      expect(setFact.sum).toBeCloseTo(0.04); // 10ms + 30ms

      const emitEvent = hist.samples.find(s => s.labels.action_type === 'emit_event')!;
      expect(emitEvent.count).toBe(1);
      expect(emitEvent.sum).toBeCloseTo(0.02);
    });

    it('should use custom histogram buckets', () => {
      const customCollector = new MetricsCollector(
        trace,
        () => stats,
        { histogramBuckets: [0.5, 0.1, 1] }, // deliberately unsorted
      );

      const histograms = customCollector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;
      // Měly by být seřazené vzestupně
      expect(hist.buckets).toEqual([0.1, 0.5, 1]);
    });
  });

  // -----------------------------------------------------------------------
  // Gauges
  // -----------------------------------------------------------------------

  describe('gauges', () => {
    it('should read live stats values at scrape time', () => {
      stats.rulesCount = 10;
      stats.factsCount = 50;
      stats.timersCount = 3;

      const gauges = collector.getGauges();

      const rulesGauge = gauges.find(g => g.name === 'active_rules');
      const factsGauge = gauges.find(g => g.name === 'active_facts');
      const timersGauge = gauges.find(g => g.name === 'active_timers');

      expect(rulesGauge?.value).toBe(10);
      expect(factsGauge?.value).toBe(50);
      expect(timersGauge?.value).toBe(3);
    });

    it('should reflect updated stats on subsequent calls', () => {
      stats.rulesCount = 5;
      const first = collector.getGauges().find(g => g.name === 'active_rules');
      expect(first?.value).toBe(5);

      stats.rulesCount = 15;
      const second = collector.getGauges().find(g => g.name === 'active_rules');
      expect(second?.value).toBe(15);
    });

    it('should include trace_buffer_utilization when tracing stats are available', () => {
      stats.tracing = { enabled: true, entriesCount: 2500, maxEntries: 10000 };

      const gauges = collector.getGauges();
      const utilization = gauges.find(g => g.name === 'trace_buffer_utilization');

      expect(utilization).toBeDefined();
      expect(utilization?.value).toBe(0.25);
    });

    it('should not include trace_buffer_utilization when tracing stats are absent', () => {
      const gauges = collector.getGauges();
      const utilization = gauges.find(g => g.name === 'trace_buffer_utilization');

      expect(utilization).toBeUndefined();
    });

    it('should handle zero maxEntries gracefully', () => {
      stats.tracing = { enabled: true, entriesCount: 0, maxEntries: 0 };

      const gauges = collector.getGauges();
      const utilization = gauges.find(g => g.name === 'trace_buffer_utilization');

      expect(utilization?.value).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Per-rule metriky
  // -----------------------------------------------------------------------

  describe('per-rule metrics', () => {
    it('should not add rule labels when perRuleMetrics is disabled', () => {
      // Default: perRuleMetrics = false
      trace.record('rule_triggered', {}, { ruleId: 'r1', ruleName: 'Test Rule' });

      const counters = collector.getCounters();
      const triggered = findCounter(counters, 'rules_triggered_total')!;
      expect(triggered.values).toHaveLength(1);
      expect(triggered.values[0]!.labels).toEqual({});
    });

    it('should add rule_id and rule_name labels when perRuleMetrics is enabled (triggered)', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true },
      );

      trace.record('rule_triggered', {}, { ruleId: 'r1', ruleName: 'Check Temp' });

      const counters = perRuleCollector.getCounters();
      const triggered = findCounter(counters, 'rules_triggered_total')!;
      expect(triggered.values).toHaveLength(1);
      expect(triggered.values[0]!.labels).toEqual({ rule_id: 'r1', rule_name: 'Check Temp' });
    });

    it('should add only rule_id label for skipped (no rule_name)', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true },
      );

      trace.record('rule_skipped', {}, { ruleId: 'r1', ruleName: 'Check Temp', durationMs: 1 });

      const counters = perRuleCollector.getCounters();
      const skipped = findCounter(counters, 'rules_skipped_total')!;
      expect(skipped.values).toHaveLength(1);
      expect(skipped.values[0]!.labels).toEqual({ rule_id: 'r1' });
    });

    it('should add rule_id label to evaluation_duration histogram when perRuleMetrics enabled', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true },
      );

      trace.record('rule_executed', {}, { ruleId: 'r1', durationMs: 10 });

      const histograms = perRuleCollector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;
      expect(hist.samples[0]!.labels).toEqual({ rule_id: 'r1' });
    });

    it('should respect maxLabeledRules cardinality limit', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true, maxLabeledRules: 2 },
      );

      trace.record('rule_triggered', {}, { ruleId: 'r1', ruleName: 'Rule 1' });
      trace.record('rule_triggered', {}, { ruleId: 'r2', ruleName: 'Rule 2' });
      trace.record('rule_triggered', {}, { ruleId: 'r3', ruleName: 'Rule 3' }); // over limit

      const counters = perRuleCollector.getCounters();
      const triggered = findCounter(counters, 'rules_triggered_total')!;

      // r1 a r2 mají per-rule labels, r3 padne do unlabeled
      const labeled = triggered.values.filter(v => Object.keys(v.labels).length > 0);
      const unlabeled = triggered.values.filter(v => Object.keys(v.labels).length === 0);

      expect(labeled).toHaveLength(2);
      expect(unlabeled).toHaveLength(1);
      expect(unlabeled[0]!.value).toBe(1); // r3 bez labelů
    });

    it('should continue tracking existing rules after limit is reached', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true, maxLabeledRules: 1 },
      );

      trace.record('rule_triggered', {}, { ruleId: 'r1', ruleName: 'Rule 1' });
      trace.record('rule_triggered', {}, { ruleId: 'r2', ruleName: 'Rule 2' }); // over limit → no labels
      trace.record('rule_triggered', {}, { ruleId: 'r1', ruleName: 'Rule 1' }); // still tracked

      const counters = perRuleCollector.getCounters();
      const triggered = findCounter(counters, 'rules_triggered_total')!;

      const r1 = triggered.values.find(v => v.labels.rule_id === 'r1');
      expect(r1?.value).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle: stop() a reset()
  // -----------------------------------------------------------------------

  describe('stop()', () => {
    it('should unsubscribe from TraceCollector', () => {
      collector.stop();

      // Nové trace entries by se neměly projevit
      trace.record('rule_triggered', {}, { ruleId: 'r1' });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_triggered_total')).toBe(0);
    });

    it('should preserve existing data after stop', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1' });
      collector.stop();

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_triggered_total')).toBe(1);
    });

    it('should be safe to call stop() multiple times', () => {
      collector.stop();
      collector.stop();

      // Neměla by nastat žádná chyba
      const counters = collector.getCounters();
      expect(counters).toBeDefined();
    });
  });

  describe('reset()', () => {
    it('should clear all counter values', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1' });
      trace.record('event_emitted', {});

      collector.reset();

      const counters = collector.getCounters();
      for (const counter of counters) {
        expect(counter.values).toHaveLength(0);
      }
    });

    it('should clear all histogram samples', () => {
      trace.record('rule_executed', {}, { ruleId: 'r1', durationMs: 10 });

      collector.reset();

      const histograms = collector.getHistograms();
      for (const histogram of histograms) {
        expect(histogram.samples).toHaveLength(0);
      }
    });

    it('should reset per-rule cardinality tracking', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true, maxLabeledRules: 1 },
      );

      trace.record('rule_triggered', {}, { ruleId: 'r1', ruleName: 'Rule 1' });
      perRuleCollector.reset();

      // Po resetu by r2 mělo dostat labeled tracking (limit se resetoval)
      trace.record('rule_triggered', {}, { ruleId: 'r2', ruleName: 'Rule 2' });

      const counters = perRuleCollector.getCounters();
      const triggered = findCounter(counters, 'rules_triggered_total')!;
      expect(triggered.values[0]!.labels).toEqual({ rule_id: 'r2', rule_name: 'Rule 2' });
    });

    it('should continue collecting after reset', () => {
      trace.record('rule_triggered', {}, { ruleId: 'r1' });
      collector.reset();
      trace.record('rule_triggered', {}, { ruleId: 'r2' });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_triggered_total')).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle fact_changed without operation field', () => {
      trace.record('fact_changed', { key: 'temp', value: 42 }); // no operation

      const counters = collector.getCounters();
      expect(counterValue(counters, 'facts_changed_total')).toBe(1);
    });

    it('should handle action_completed without actionType field', () => {
      trace.record('action_completed', {}, { ruleId: 'r1', durationMs: 5 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'actions_executed_total')).toBe(1);
    });

    it('should handle action_failed without actionType field', () => {
      trace.record('action_failed', {}, { ruleId: 'r1', durationMs: 5 });

      const counters = collector.getCounters();
      expect(counterValue(counters, 'actions_failed_total')).toBe(1);
      expect(counterValue(counters, 'rules_failed_total')).toBe(1);
    });

    it('should handle rule_triggered without ruleId in per-rule mode', () => {
      const perRuleCollector = new MetricsCollector(
        trace,
        () => stats,
        { perRuleMetrics: true },
      );

      trace.record('rule_triggered', {});

      const counters = perRuleCollector.getCounters();
      const triggered = findCounter(counters, 'rules_triggered_total')!;
      // Bez ruleId → unlabeled
      expect(triggered.values[0]!.labels).toEqual({});
    });

    it('should handle high-volume event stream', () => {
      const iterations = 10_000;
      for (let i = 0; i < iterations; i++) {
        trace.record('rule_triggered', {}, { ruleId: `r${i % 10}` });
      }

      const counters = collector.getCounters();
      expect(counterValue(counters, 'rules_triggered_total')).toBe(iterations);
    });

    it('should use default buckets from types.ts', () => {
      const histograms = collector.getHistograms();
      const hist = findHistogram(histograms, 'evaluation_duration_seconds')!;

      expect(hist.buckets).toEqual([
        0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
      ]);
    });

    it('should handle subscriber errors from TraceCollector gracefully', () => {
      // Ověříme, že MetricsCollector subscriber nehodí do TraceCollectoru
      // (TraceCollector sám swallowuje chyby, ale MetricsCollector by neměl throwit)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Normální operace by neměla vyvolat chyby
      trace.record('rule_triggered', {}, { ruleId: 'r1' });
      expect(counterValue(collector.getCounters(), 'rules_triggered_total')).toBe(1);

      spy.mockRestore();
    });
  });
});
