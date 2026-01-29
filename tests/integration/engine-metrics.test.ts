import { describe, it, expect, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';

describe('Engine Metrics Integration', () => {
  let engine: RuleEngine;

  afterEach(async () => {
    if (engine?.isRunning) {
      await engine.stop();
    }
  });

  // -------------------------------------------------------------------------
  // Konfigurace a lifecycle
  // -------------------------------------------------------------------------

  describe('configuration', () => {
    it('does not create MetricsCollector when metrics not configured', async () => {
      engine = await RuleEngine.start({ name: 'no-metrics' });

      expect(engine.getMetricsCollector()).toBeNull();
    });

    it('does not create MetricsCollector when metrics.enabled is false', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-disabled',
        metrics: { enabled: false },
      });

      expect(engine.getMetricsCollector()).toBeNull();
    });

    it('creates MetricsCollector when metrics.enabled is true', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-enabled',
        metrics: { enabled: true },
      });

      expect(engine.getMetricsCollector()).not.toBeNull();
    });

    it('auto-enables tracing when metrics are enabled', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-auto-trace',
        metrics: { enabled: true },
        // tracing NOT explicitly enabled
      });

      // MetricsCollector auto-enables tracing on the TraceCollector
      expect(engine.getTraceCollector().isEnabled()).toBe(true);
    });

    it('preserves existing tracing config when metrics are enabled', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-with-trace',
        tracing: { enabled: true, maxEntries: 500 },
        metrics: { enabled: true },
      });

      expect(engine.isTracingEnabled()).toBe(true);
      expect(engine.getMetricsCollector()).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup při stop()
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('cleans up MetricsCollector on engine stop', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-cleanup',
        metrics: { enabled: true },
      });

      expect(engine.getMetricsCollector()).not.toBeNull();

      await engine.stop();

      expect(engine.getMetricsCollector()).toBeNull();
    });

    it('MetricsCollector stops receiving entries after engine stop', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-stop-entries',
        metrics: { enabled: true },
      });

      const collector = engine.getMetricsCollector()!;

      // Generujeme aktivitu před stop
      await engine.emit('test.event', {});
      const countersBefore = collector.getCounters();
      const eventsBefore = countersBefore.find(c => c.name === 'events_processed_total');
      expect(eventsBefore?.values.length).toBeGreaterThan(0);

      await engine.stop();

      // Po stop by collector měl být odpojen - žádné nové záznamy
      // (nemůžeme emitovat po stop, ale getMetricsCollector() vrací null)
      expect(engine.getMetricsCollector()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Sběr metrik z reálných operací enginu
  // -------------------------------------------------------------------------

  describe('metrics collection from engine operations', () => {
    it('collects event_emitted counter on emit()', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-events',
        metrics: { enabled: true },
      });

      await engine.emit('order.created', { orderId: '1' });
      await engine.emit('order.shipped', { orderId: '1' });

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();
      const events = counters.find(c => c.name === 'events_processed_total')!;

      expect(events.values.length).toBe(1);
      expect(events.values[0]!.value).toBe(2);
    });

    it('collects fact_changed counter on setFact()', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-facts',
        metrics: { enabled: true },
      });

      await engine.setFact('temperature', 25);
      await engine.setFact('temperature', 30);

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();
      const facts = counters.find(c => c.name === 'facts_changed_total')!;

      const total = facts.values.reduce((sum, v) => sum + v.value, 0);
      expect(total).toBe(2);
    });

    it('collects rule_triggered and rule_executed counters', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-rules',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'metrics-rule',
        name: 'Metrics Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'processed', value: true }],
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { orderId: '1' });

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();

      const triggered = counters.find(c => c.name === 'rules_triggered_total')!;
      const executed = counters.find(c => c.name === 'rules_executed_total')!;

      expect(triggered.values.reduce((s, v) => s + v.value, 0)).toBe(1);
      expect(executed.values.reduce((s, v) => s + v.value, 0)).toBe(1);
    });

    it('collects rule_skipped counter when conditions not met', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-skipped',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'conditional-rule',
        name: 'Conditional Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'check.event' },
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 100 },
        ],
        actions: [{ type: 'set_fact', key: 'high_value', value: true }],
      };

      engine.registerRule(rule);
      await engine.emit('check.event', { amount: 50 }); // podmínka nesplněna

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();

      const skipped = counters.find(c => c.name === 'rules_skipped_total')!;
      expect(skipped.values.reduce((s, v) => s + v.value, 0)).toBe(1);

      const executed = counters.find(c => c.name === 'rules_executed_total')!;
      expect(executed.values.reduce((s, v) => s + v.value, 0)).toBe(0);
    });

    it('collects actions_executed counter', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-actions',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'action-rule',
        name: 'Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'do.actions' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'a', value: 1 },
          { type: 'set_fact', key: 'b', value: 2 },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('do.actions', {});

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();

      const actionsExec = counters.find(c => c.name === 'actions_executed_total')!;
      const total = actionsExec.values.reduce((s, v) => s + v.value, 0);
      expect(total).toBe(2);
    });

    it('collects actions_failed counter on action failure', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-action-fail',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'failing-rule',
        name: 'Failing Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'fail.action' },
        conditions: [],
        actions: [
          { type: 'call_service', service: 'nonexistent', method: 'test', args: [] },
        ],
      };

      engine.registerRule(rule);
      await engine.emit('fail.action', {});

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();

      const actionsFailed = counters.find(c => c.name === 'actions_failed_total')!;
      expect(actionsFailed.values.reduce((s, v) => s + v.value, 0)).toBe(1);
    });

    it('collects conditions_evaluated counter', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-conditions',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'cond-rule',
        name: 'Condition Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'cond.event' },
        conditions: [
          { source: { type: 'event', field: 'x' }, operator: 'gt', value: 0 },
        ],
        actions: [{ type: 'set_fact', key: 'positive', value: true }],
      };

      engine.registerRule(rule);
      await engine.emit('cond.event', { x: 5 }); // pass
      await engine.emit('cond.event', { x: -1 }); // fail

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();

      const conditions = counters.find(c => c.name === 'conditions_evaluated_total')!;
      const pass = conditions.values.find(v => v.labels.result === 'pass');
      const fail = conditions.values.find(v => v.labels.result === 'fail');

      expect(pass?.value).toBe(1);
      expect(fail?.value).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Histogramy
  // -------------------------------------------------------------------------

  describe('histogram collection', () => {
    it('records evaluation_duration_seconds histogram', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-histogram',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'hist-rule',
        name: 'Histogram Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'hist.event' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'done', value: true }],
      };

      engine.registerRule(rule);
      await engine.emit('hist.event', {});

      const collector = engine.getMetricsCollector()!;
      const histograms = collector.getHistograms();

      const evalDuration = histograms.find(h => h.name === 'evaluation_duration_seconds')!;
      expect(evalDuration.samples.length).toBeGreaterThan(0);
      expect(evalDuration.samples[0]!.count).toBeGreaterThan(0);
      expect(evalDuration.samples[0]!.sum).toBeGreaterThanOrEqual(0);
    });

    it('records action_duration_seconds histogram', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-action-hist',
        metrics: { enabled: true },
      });

      const rule: RuleInput = {
        id: 'action-hist-rule',
        name: 'Action Histogram Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'action.hist' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'timed', value: true }],
      };

      engine.registerRule(rule);
      await engine.emit('action.hist', {});

      const collector = engine.getMetricsCollector()!;
      const histograms = collector.getHistograms();

      const actionDuration = histograms.find(h => h.name === 'action_duration_seconds')!;
      expect(actionDuration.samples.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Gauges
  // -------------------------------------------------------------------------

  describe('gauge collection', () => {
    it('reads live engine stats as gauges', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-gauges',
        metrics: { enabled: true },
      });

      // Registrovat pravidla a fakty
      const rule: RuleInput = {
        id: 'gauge-rule',
        name: 'Gauge Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'gauge.event' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'gauge_done', value: true }],
      };

      engine.registerRule(rule);
      await engine.setFact('temp', 25);
      await engine.setFact('humidity', 60);

      const collector = engine.getMetricsCollector()!;
      const gauges = collector.getGauges();

      const activeRules = gauges.find(g => g.name === 'active_rules');
      const activeFacts = gauges.find(g => g.name === 'active_facts');

      expect(activeRules?.value).toBe(1);
      expect(activeFacts?.value).toBe(2);
    });

    it('gauge values update as engine state changes', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-gauges-dynamic',
        metrics: { enabled: true },
      });

      const collector = engine.getMetricsCollector()!;

      let gauges = collector.getGauges();
      expect(gauges.find(g => g.name === 'active_facts')?.value).toBe(0);

      await engine.setFact('first', 1);
      gauges = collector.getGauges();
      expect(gauges.find(g => g.name === 'active_facts')?.value).toBe(1);

      await engine.setFact('second', 2);
      gauges = collector.getGauges();
      expect(gauges.find(g => g.name === 'active_facts')?.value).toBe(2);

      engine.deleteFact('first');
      gauges = collector.getGauges();
      expect(gauges.find(g => g.name === 'active_facts')?.value).toBe(1);
    });

    it('includes trace_buffer_utilization gauge', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-trace-util',
        metrics: { enabled: true },
      });

      // Generujeme nějakou aktivitu aby byl trace buffer nenulový
      await engine.emit('some.event', {});

      const collector = engine.getMetricsCollector()!;
      const gauges = collector.getGauges();

      const utilization = gauges.find(g => g.name === 'trace_buffer_utilization');
      expect(utilization).toBeDefined();
      expect(utilization!.value).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Per-rule metriky
  // -------------------------------------------------------------------------

  describe('per-rule metrics via config', () => {
    it('supports perRuleMetrics config passed through engine', async () => {
      engine = await RuleEngine.start({
        name: 'metrics-per-rule',
        metrics: { enabled: true, perRuleMetrics: true },
      });

      const rule: RuleInput = {
        id: 'labeled-rule',
        name: 'Labeled Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'labeled.event' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'labeled', value: true }],
      };

      engine.registerRule(rule);
      await engine.emit('labeled.event', {});

      const collector = engine.getMetricsCollector()!;
      const counters = collector.getCounters();

      const triggered = counters.find(c => c.name === 'rules_triggered_total')!;
      const labeled = triggered.values.find(v => v.labels.rule_id === 'labeled-rule');

      expect(labeled).toBeDefined();
      expect(labeled!.labels.rule_name).toBe('Labeled Rule');
    });
  });

  // -------------------------------------------------------------------------
  // Zero-overhead ověření
  // -------------------------------------------------------------------------

  describe('zero-overhead when disabled', () => {
    it('does not enable tracing when metrics are not configured', async () => {
      engine = await RuleEngine.start({
        name: 'no-overhead',
        // no metrics, no tracing
      });

      expect(engine.getMetricsCollector()).toBeNull();
      expect(engine.isTracingEnabled()).toBe(false);

      // Operace by měly fungovat normálně
      await engine.setFact('test', 1);
      await engine.emit('test.event', {});

      expect(engine.getTraceCollector().size).toBe(0);
    });
  });
});
