import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';
import type { DebugTraceEntry } from '../../src/debugging/types';

describe('Engine Tracing Integration', () => {
  let engine: RuleEngine;

  afterEach(async () => {
    if (engine) {
      await engine.stop();
    }
  });

  describe('tracing configuration', () => {
    it('tracing is disabled by default', async () => {
      engine = await RuleEngine.start({ name: 'test-engine' });

      expect(engine.isTracingEnabled()).toBe(false);
      expect(engine.getTraceCollector().size).toBe(0);
    });

    it('enables tracing via config', async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });

      expect(engine.isTracingEnabled()).toBe(true);
    });

    it('enables tracing via enableTracing()', async () => {
      engine = await RuleEngine.start({ name: 'test-engine' });

      engine.enableTracing();
      expect(engine.isTracingEnabled()).toBe(true);

      engine.disableTracing();
      expect(engine.isTracingEnabled()).toBe(false);
    });

    it('respects maxEntries config', async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true, maxEntries: 100 }
      });

      const collector = engine.getTraceCollector();
      expect(collector).toBeDefined();
    });
  });

  describe('fact change tracing', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });
    });

    it('traces fact changes', async () => {
      await engine.setFact('user:count', 0);
      await engine.setFact('user:count', 5);

      const collector = engine.getTraceCollector();
      const entries = collector.getByType('fact_changed');

      expect(entries.length).toBe(2);
      expect(entries[0].details.key).toBe('user:count');
      expect(entries[0].details.previousValue).toBeUndefined();
      expect(entries[0].details.newValue).toBe(0);

      expect(entries[1].details.key).toBe('user:count');
      expect(entries[1].details.previousValue).toBe(0);
      expect(entries[1].details.newValue).toBe(5);
    });
  });

  describe('event emitting tracing', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });
    });

    it('traces emitted events', async () => {
      await engine.emit('order.created', { orderId: 'ord-123' });

      const collector = engine.getTraceCollector();
      const entries = collector.getByType('event_emitted');

      expect(entries.length).toBe(1);
      expect(entries[0].details.topic).toBe('order.created');
      expect(entries[0].details.data).toEqual({ orderId: 'ord-123' });
      expect(entries[0].details.source).toBe('api');
    });

    it('traces correlated events', async () => {
      await engine.emitCorrelated(
        'order.shipped',
        { trackingId: 'track-456' },
        'corr-001',
        'cause-001'
      );

      const collector = engine.getTraceCollector();
      const entries = collector.getByCorrelation('corr-001');

      expect(entries.length).toBe(1);
      expect(entries[0].type).toBe('event_emitted');
      expect(entries[0].correlationId).toBe('corr-001');
      expect(entries[0].causationId).toBe('cause-001');
    });
  });

  describe('rule execution tracing', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });
    });

    it('traces rule triggered and executed', async () => {
      const rule: RuleInput = {
        id: 'test-rule',
        name: 'Test Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'executed', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { orderId: 'ord-123' });

      const collector = engine.getTraceCollector();

      const triggered = collector.getByType('rule_triggered');
      expect(triggered.length).toBe(1);
      expect(triggered[0].ruleId).toBe('test-rule');
      expect(triggered[0].ruleName).toBe('Test Rule');
      expect(triggered[0].details.triggerType).toBe('event');

      const executed = collector.getByType('rule_executed');
      expect(executed.length).toBe(1);
      expect(executed[0].ruleId).toBe('test-rule');
      expect(executed[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(executed[0].details.actionsCount).toBe(1);
    });

    it('traces rule skipped when conditions not met', async () => {
      const rule: RuleInput = {
        id: 'conditional-rule',
        name: 'Conditional Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [{ source: 'trigger', path: 'amount', operator: 'gt', value: 100 }],
        actions: [{ type: 'set_fact', key: 'high_value', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 50 });

      const collector = engine.getTraceCollector();

      const triggered = collector.getByType('rule_triggered');
      expect(triggered.length).toBe(1);

      const skipped = collector.getByType('rule_skipped');
      expect(skipped.length).toBe(1);
      expect(skipped[0].ruleId).toBe('conditional-rule');
      expect(skipped[0].details.reason).toBe('conditions_not_met');

      const executed = collector.getByType('rule_executed');
      expect(executed.length).toBe(0);
    });

    it('links rule traces via causation', async () => {
      const rule: RuleInput = {
        id: 'linked-rule',
        name: 'Linked Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'done', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('test.event', {});

      const collector = engine.getTraceCollector();
      const triggered = collector.getByType('rule_triggered')[0];
      const executed = collector.getByType('rule_executed')[0];

      expect(executed.causationId).toBe(triggered.id);
    });
  });

  describe('timer tracing', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });
    });

    it('traces timer set', async () => {
      await engine.setTimer({
        name: 'test-timer',
        duration: '1h',
        onExpire: { topic: 'timer.expired', data: { timerName: 'test-timer' } }
      });

      const collector = engine.getTraceCollector();
      const entries = collector.getByType('timer_set');

      expect(entries.length).toBe(1);
      expect(entries[0].details.timerName).toBe('test-timer');
      expect(entries[0].details.duration).toBe('1h');
    });

    it('traces timer cancelled', async () => {
      await engine.setTimer({
        name: 'cancel-me',
        duration: '2h',
        onExpire: { topic: 'never.happens', data: {} }
      });

      await engine.cancelTimer('cancel-me');

      const collector = engine.getTraceCollector();
      const entries = collector.getByType('timer_cancelled');

      expect(entries.length).toBe(1);
      expect(entries[0].details.timerName).toBe('cancel-me');
    });
  });

  describe('tracing disabled behavior', () => {
    it('does not record when tracing disabled', async () => {
      engine = await RuleEngine.start({ name: 'test-engine' });

      await engine.setFact('test', 1);
      await engine.emit('test.event', {});

      const collector = engine.getTraceCollector();
      expect(collector.size).toBe(0);
    });
  });

  describe('real-time subscription', () => {
    it('notifies subscribers of new entries', async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });

      const received: DebugTraceEntry[] = [];
      const unsubscribe = engine.getTraceCollector().subscribe((entry) => {
        received.push(entry);
      });

      await engine.setFact('notify', 'test');

      expect(received.length).toBeGreaterThan(0);
      expect(received.some(e => e.type === 'fact_changed')).toBe(true);

      unsubscribe();
    });
  });

  describe('query by rule', () => {
    it('filters entries by rule ID', async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });

      const rule1: RuleInput = {
        id: 'rule-1',
        name: 'Rule 1',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'event.a' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'a', value: 1 }]
      };

      const rule2: RuleInput = {
        id: 'rule-2',
        name: 'Rule 2',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'event.b' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'b', value: 2 }]
      };

      engine.registerRule(rule1);
      engine.registerRule(rule2);

      await engine.emit('event.a', {});
      await engine.emit('event.b', {});

      const collector = engine.getTraceCollector();

      const rule1Entries = collector.getByRule('rule-1');
      expect(rule1Entries.every(e => e.ruleId === 'rule-1')).toBe(true);

      const rule2Entries = collector.getByRule('rule-2');
      expect(rule2Entries.every(e => e.ruleId === 'rule-2')).toBe(true);
    });
  });
});
