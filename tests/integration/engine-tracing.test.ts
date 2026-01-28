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
        conditions: [{ source: { type: 'event', field: 'amount' }, operator: 'gt', value: 100 }],
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

  describe('condition evaluation tracing', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });
    });

    it('traces condition evaluations for passing rule', async () => {
      await engine.setFact('user:tier', 'premium');

      const rule: RuleInput = {
        id: 'tier-check-rule',
        name: 'Tier Check Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [
          { source: { type: 'fact', pattern: 'user:tier' }, operator: 'eq', value: 'premium' },
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 }
        ],
        actions: [{ type: 'set_fact', key: 'discount', value: 10 }]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { amount: 500 });

      const collector = engine.getTraceCollector();
      const conditionEntries = collector.getByType('condition_evaluated');

      expect(conditionEntries.length).toBe(2);

      // First condition - fact source
      const firstCond = conditionEntries[0];
      expect(firstCond.ruleId).toBe('tier-check-rule');
      expect(firstCond.details.conditionIndex).toBe(0);
      expect(firstCond.details.source).toEqual({ type: 'fact', pattern: 'user:tier' });
      expect(firstCond.details.operator).toBe('eq');
      expect(firstCond.details.actualValue).toBe('premium');
      expect(firstCond.details.expectedValue).toBe('premium');
      expect(firstCond.details.passed).toBe(true);
      expect(firstCond.durationMs).toBeGreaterThanOrEqual(0);

      // Second condition - event source
      const secondCond = conditionEntries[1];
      expect(secondCond.ruleId).toBe('tier-check-rule');
      expect(secondCond.details.conditionIndex).toBe(1);
      expect(secondCond.details.source).toEqual({ type: 'event', field: 'amount' });
      expect(secondCond.details.operator).toBe('gte');
      expect(secondCond.details.actualValue).toBe(500);
      expect(secondCond.details.expectedValue).toBe(100);
      expect(secondCond.details.passed).toBe(true);
    });

    it('traces condition evaluations for failing rule', async () => {
      const rule: RuleInput = {
        id: 'failing-rule',
        name: 'Failing Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [
          { source: { type: 'event', field: 'status' }, operator: 'eq', value: 'approved' }
        ],
        actions: [{ type: 'set_fact', key: 'approved', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('test.event', { status: 'pending' });

      const collector = engine.getTraceCollector();
      const conditionEntries = collector.getByType('condition_evaluated');

      expect(conditionEntries.length).toBe(1);
      expect(conditionEntries[0].details.passed).toBe(false);
      expect(conditionEntries[0].details.actualValue).toBe('pending');
      expect(conditionEntries[0].details.expectedValue).toBe('approved');
    });

    it('short-circuits on first failing condition', async () => {
      const rule: RuleInput = {
        id: 'multi-condition-rule',
        name: 'Multi Condition Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'check.event' },
        conditions: [
          { source: { type: 'event', field: 'a' }, operator: 'eq', value: 'x' },
          { source: { type: 'event', field: 'b' }, operator: 'eq', value: 'y' },
          { source: { type: 'event', field: 'c' }, operator: 'eq', value: 'z' }
        ],
        actions: [{ type: 'set_fact', key: 'all_matched', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('check.event', { a: 'wrong', b: 'y', c: 'z' });

      const collector = engine.getTraceCollector();
      const conditionEntries = collector.getByType('condition_evaluated');

      // Only first condition should be evaluated
      expect(conditionEntries.length).toBe(1);
      expect(conditionEntries[0].details.conditionIndex).toBe(0);
      expect(conditionEntries[0].details.passed).toBe(false);
    });

    it('links condition traces with rule traces via causation', async () => {
      const rule: RuleInput = {
        id: 'linked-cond-rule',
        name: 'Linked Condition Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'link.event' },
        conditions: [
          { source: { type: 'event', field: 'value' }, operator: 'gt', value: 0 }
        ],
        actions: [{ type: 'set_fact', key: 'positive', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('link.event', { value: 10 });

      const collector = engine.getTraceCollector();
      const triggered = collector.getByType('rule_triggered')[0];
      const conditionEntries = collector.getByType('condition_evaluated');

      expect(conditionEntries.length).toBe(1);
      expect(conditionEntries[0].causationId).toBe(triggered.id);
    });

    it('traces conditions with event source type', async () => {
      const rule: RuleInput = {
        id: 'event-source-rule',
        name: 'Event Source Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'context.event' },
        conditions: [
          { source: { type: 'event', field: 'type' }, operator: 'eq', value: 'test' }
        ],
        actions: [{ type: 'set_fact', key: 'context_tested', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('context.event', { type: 'test' });

      const collector = engine.getTraceCollector();
      const conditionEntries = collector.getByType('condition_evaluated');

      expect(conditionEntries.length).toBe(1);
      expect(conditionEntries[0].details.source.type).toBe('event');
    });

    it('does not trace conditions when tracing is disabled', async () => {
      await engine.stop();

      engine = await RuleEngine.start({
        name: 'test-engine-no-trace',
        tracing: { enabled: false }
      });

      const rule: RuleInput = {
        id: 'no-trace-rule',
        name: 'No Trace Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'notrace.event' },
        conditions: [
          { source: { type: 'event', field: 'x' }, operator: 'eq', value: 1 }
        ],
        actions: [{ type: 'set_fact', key: 'done', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('notrace.event', { x: 1 });

      const collector = engine.getTraceCollector();
      expect(collector.size).toBe(0);
    });

    it('preserves correlation ID in condition traces', async () => {
      const rule: RuleInput = {
        id: 'correlated-cond-rule',
        name: 'Correlated Condition Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'corr.event' },
        conditions: [
          { source: { type: 'event', field: 'proceed' }, operator: 'eq', value: true }
        ],
        actions: [{ type: 'set_fact', key: 'corr_done', value: true }]
      };

      engine.registerRule(rule);
      await engine.emitCorrelated('corr.event', { proceed: true }, 'correlation-abc');

      const collector = engine.getTraceCollector();
      const conditionEntries = collector.getByType('condition_evaluated');

      expect(conditionEntries.length).toBe(1);
      expect(conditionEntries[0].correlationId).toBe('correlation-abc');
    });
  });

  describe('action execution tracing', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'test-engine',
        tracing: { enabled: true }
      });
    });

    it('traces action_started for each action', async () => {
      const rule: RuleInput = {
        id: 'multi-action-rule',
        name: 'Multi Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'multi.action' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'first', value: 1 },
          { type: 'set_fact', key: 'second', value: 2 }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('multi.action', {});

      const collector = engine.getTraceCollector();
      const startedEntries = collector.getByType('action_started');

      expect(startedEntries.length).toBe(2);
      expect(startedEntries[0].ruleId).toBe('multi-action-rule');
      expect(startedEntries[0].details.actionIndex).toBe(0);
      expect(startedEntries[0].details.actionType).toBe('set_fact');
      expect(startedEntries[1].details.actionIndex).toBe(1);
    });

    it('traces action_completed with output and duration', async () => {
      const rule: RuleInput = {
        id: 'completed-action-rule',
        name: 'Completed Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'complete.action' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'test:key', value: 'test-value' }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('complete.action', {});

      const collector = engine.getTraceCollector();
      const completedEntries = collector.getByType('action_completed');

      expect(completedEntries.length).toBe(1);
      expect(completedEntries[0].ruleId).toBe('completed-action-rule');
      expect(completedEntries[0].details.actionIndex).toBe(0);
      expect(completedEntries[0].details.actionType).toBe('set_fact');
      expect(completedEntries[0].details.output).toMatchObject({
        key: 'test:key',
        value: 'test-value'
      });
      expect(completedEntries[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('traces action_failed with error message', async () => {
      const rule: RuleInput = {
        id: 'failing-action-rule',
        name: 'Failing Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'fail.action' },
        conditions: [],
        actions: [
          { type: 'call_service', service: 'nonexistent', method: 'test', args: [] }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('fail.action', {});

      const collector = engine.getTraceCollector();
      const failedEntries = collector.getByType('action_failed');

      expect(failedEntries.length).toBe(1);
      expect(failedEntries[0].ruleId).toBe('failing-action-rule');
      expect(failedEntries[0].details.actionIndex).toBe(0);
      expect(failedEntries[0].details.actionType).toBe('call_service');
      expect(failedEntries[0].details.error).toBe('Service not found: nonexistent');
      expect(failedEntries[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('traces emit_event action with resolved input', async () => {
      const rule: RuleInput = {
        id: 'emit-action-rule',
        name: 'Emit Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'trigger.emit' },
        conditions: [],
        actions: [
          {
            type: 'emit_event',
            topic: 'output.${event.type}',
            data: { value: { ref: 'event.value' } }
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('trigger.emit', { type: 'test', value: 42 });

      const collector = engine.getTraceCollector();
      const startedEntries = collector.getByType('action_started');

      expect(startedEntries.length).toBe(1);
      expect(startedEntries[0].details.input).toEqual({
        topic: 'output.test',
        data: { value: 42 }
      });
    });

    it('links action traces via causation to rule_triggered', async () => {
      const rule: RuleInput = {
        id: 'causation-action-rule',
        name: 'Causation Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'causation.action' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'caused', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('causation.action', {});

      const collector = engine.getTraceCollector();
      const triggered = collector.getByType('rule_triggered')[0];
      const actionStarted = collector.getByType('action_started')[0];
      const actionCompleted = collector.getByType('action_completed')[0];

      expect(actionStarted.causationId).toBe(triggered.id);
      expect(actionCompleted.causationId).toBe(triggered.id);
    });

    it('preserves correlation ID in action traces', async () => {
      const rule: RuleInput = {
        id: 'correlated-action-rule',
        name: 'Correlated Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'corr.action' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'corr_action_done', value: true }]
      };

      engine.registerRule(rule);
      await engine.emitCorrelated('corr.action', {}, 'action-correlation-xyz');

      const collector = engine.getTraceCollector();
      const startedEntries = collector.getByType('action_started');
      const completedEntries = collector.getByType('action_completed');

      expect(startedEntries[0].correlationId).toBe('action-correlation-xyz');
      expect(completedEntries[0].correlationId).toBe('action-correlation-xyz');
    });

    it('traces multiple actions with mixed success and failure', async () => {
      const rule: RuleInput = {
        id: 'mixed-actions-rule',
        name: 'Mixed Actions Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'mixed.actions' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'before', value: 1 },
          { type: 'call_service', service: 'missing', method: 'fail', args: [] },
          { type: 'set_fact', key: 'after', value: 2 }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('mixed.actions', {});

      const collector = engine.getTraceCollector();
      const startedEntries = collector.getByType('action_started');
      const completedEntries = collector.getByType('action_completed');
      const failedEntries = collector.getByType('action_failed');

      expect(startedEntries.length).toBe(3);
      expect(completedEntries.length).toBe(2);
      expect(failedEntries.length).toBe(1);
      expect(failedEntries[0].details.actionIndex).toBe(1);
    });

    it('does not trace actions when tracing is disabled', async () => {
      await engine.stop();

      engine = await RuleEngine.start({
        name: 'test-engine-no-action-trace',
        tracing: { enabled: false }
      });

      const rule: RuleInput = {
        id: 'no-trace-action-rule',
        name: 'No Trace Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'notrace.action' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'no_trace', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('notrace.action', {});

      const collector = engine.getTraceCollector();
      expect(collector.size).toBe(0);
    });

    it('traces set_timer action input correctly', async () => {
      const rule: RuleInput = {
        id: 'timer-action-rule',
        name: 'Timer Action Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'timer.action' },
        conditions: [],
        actions: [
          {
            type: 'set_timer',
            timer: {
              name: 'traced-timer',
              duration: '10m',
              onExpire: { topic: 'timer.expired', data: { reason: 'timeout' } }
            }
          }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('timer.action', {});

      const collector = engine.getTraceCollector();
      const startedEntries = collector.getByType('action_started');

      expect(startedEntries.length).toBe(1);
      expect(startedEntries[0].details.actionType).toBe('set_timer');
      expect(startedEntries[0].details.input).toEqual({
        name: 'traced-timer',
        duration: '10m',
        onExpire: { topic: 'timer.expired', data: { reason: 'timeout' } }
      });
    });

    it('queries action traces by rule ID', async () => {
      const rule1: RuleInput = {
        id: 'action-rule-1',
        name: 'Action Rule 1',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'action.query.1' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'rule1', value: 1 }]
      };

      const rule2: RuleInput = {
        id: 'action-rule-2',
        name: 'Action Rule 2',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'action.query.2' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'rule2', value: 2 }]
      };

      engine.registerRule(rule1);
      engine.registerRule(rule2);

      await engine.emit('action.query.1', {});
      await engine.emit('action.query.2', {});

      const collector = engine.getTraceCollector();
      const rule1Entries = collector.getByRule('action-rule-1');
      const rule2Entries = collector.getByRule('action-rule-2');

      const rule1ActionStarted = rule1Entries.filter(e => e.type === 'action_started');
      const rule2ActionStarted = rule2Entries.filter(e => e.type === 'action_started');

      expect(rule1ActionStarted.length).toBe(1);
      expect(rule2ActionStarted.length).toBe(1);
      expect(rule1ActionStarted[0].ruleId).toBe('action-rule-1');
      expect(rule2ActionStarted[0].ruleId).toBe('action-rule-2');
    });
  });

  describe('EngineStats with tracing and profiling', () => {
    beforeEach(async () => {
      engine = await RuleEngine.start({
        name: 'stats-test-engine',
        tracing: { enabled: true, maxEntries: 1000 }
      });
    });

    it('includes tracing stats in getStats()', async () => {
      const stats = engine.getStats();

      expect(stats.tracing).toBeDefined();
      expect(stats.tracing!.enabled).toBe(true);
      expect(stats.tracing!.entriesCount).toBe(0);
      expect(stats.tracing!.maxEntries).toBe(1000);
    });

    it('updates tracing stats after events', async () => {
      const rule: RuleInput = {
        id: 'stats-rule',
        name: 'Stats Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'stats.event' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'triggered', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('stats.event', {});

      const stats = engine.getStats();
      expect(stats.tracing!.entriesCount).toBeGreaterThan(0);
    });

    it('includes profiling stats when profiling is enabled', async () => {
      // Initially no profiling
      let stats = engine.getStats();
      expect(stats.profiling).toBeUndefined();

      // Enable profiling
      engine.enableProfiling();

      const rule: RuleInput = {
        id: 'profiled-rule',
        name: 'Profiled Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'profiled.event' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'profiled', value: true }]
      };

      engine.registerRule(rule);
      await engine.emit('profiled.event', {});

      stats = engine.getStats();
      expect(stats.profiling).toBeDefined();
      expect(stats.profiling!.totalRulesProfiled).toBeGreaterThan(0);
      expect(stats.profiling!.totalTriggers).toBeGreaterThan(0);
    });

    it('profiling methods work correctly', async () => {
      expect(engine.isProfilingEnabled()).toBe(false);

      const profiler = engine.enableProfiling();
      expect(engine.isProfilingEnabled()).toBe(true);
      expect(engine.getProfiler()).toBe(profiler);

      engine.disableProfiling();
      expect(engine.isProfilingEnabled()).toBe(false);
      expect(engine.getProfiler()).toBeNull();
    });

    it('profiler is stopped when engine stops', async () => {
      engine.enableProfiling();
      expect(engine.isProfilingEnabled()).toBe(true);

      await engine.stop();

      // After stop, profiler should be cleared
      expect(engine.getProfiler()).toBeNull();
    });

    it('tracing stats reflect disabled state', async () => {
      engine.disableTracing();

      const stats = engine.getStats();
      expect(stats.tracing!.enabled).toBe(false);
    });
  });
});
