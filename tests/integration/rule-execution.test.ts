import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';
import type { Event } from '../../src/types/event';

describe('Rule Execution Integration', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'test-engine' });
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('basic event-triggered flow', () => {
    it('executes rule when matching event is emitted', async () => {
      const rule: RuleInput = {
        id: 'order-created-rule',
        name: 'Handle Order Created',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'order:count', value: 1 }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { orderId: 'ord-123' });

      expect(engine.getFact('order:count')).toBe(1);
    });

    it('does not execute rule for non-matching event', async () => {
      const rule: RuleInput = {
        id: 'order-rule',
        name: 'Order Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'triggered', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('user.created', { userId: 'usr-123' });

      expect(engine.getFact('triggered')).toBeUndefined();
    });

    it('disabled rule is not executed', async () => {
      const rule: RuleInput = {
        id: 'disabled-rule',
        name: 'Disabled Rule',
        priority: 10,
        enabled: false,
        tags: [],
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'should-not-exist', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('test.event', {});

      expect(engine.getFact('should-not-exist')).toBeUndefined();
    });

    it('uses event data in action', async () => {
      const rule: RuleInput = {
        id: 'event-data-rule',
        name: 'Use Event Data',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'user.registered' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'user:${event.userId}:active', value: true },
          { type: 'set_fact', key: 'last-user-id', value: { ref: 'event.userId' } }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('user.registered', { userId: 'usr-456' });

      expect(engine.getFact('user:usr-456:active')).toBe(true);
      expect(engine.getFact('last-user-id')).toBe('usr-456');
    });
  });

  describe('fact-triggered rules', () => {
    it('executes rule when matching fact is set', async () => {
      const rule: RuleInput = {
        id: 'fact-trigger-rule',
        name: 'React to Fact Change',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'fact', pattern: 'user:*:status' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'status-changed', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.setFact('user:123:status', 'online');

      expect(engine.getFact('status-changed')).toBe(true);
    });

    it('does not trigger for non-matching fact pattern', async () => {
      const rule: RuleInput = {
        id: 'specific-fact-rule',
        name: 'Specific Fact Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'fact', pattern: 'order:*:total' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'order-triggered', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.setFact('user:123:name', 'John');

      expect(engine.getFact('order-triggered')).toBeUndefined();
    });

    it('accesses triggering fact value in action', async () => {
      const rule: RuleInput = {
        id: 'fact-value-rule',
        name: 'Copy Fact Value',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'fact', pattern: 'config:threshold' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'active-threshold', value: { ref: 'trigger.fact.value' } }
        ]
      };

      engine.registerRule(rule);
      await engine.setFact('config:threshold', 100);

      expect(engine.getFact('active-threshold')).toBe(100);
    });
  });

  describe('condition evaluation', () => {
    it('executes rule only when all conditions are met', async () => {
      await engine.setFact('user:premium', true);

      const rule: RuleInput = {
        id: 'conditional-rule',
        name: 'Premium User Discount',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [
          { source: { type: 'fact', pattern: 'user:premium' }, operator: 'eq', value: true },
          { source: { type: 'event', field: 'total' }, operator: 'gte', value: 100 }
        ],
        actions: [
          { type: 'set_fact', key: 'discount-applied', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.emit('order.created', { total: 150 });
      expect(engine.getFact('discount-applied')).toBe(true);
    });

    it('does not execute rule when condition fails', async () => {
      await engine.setFact('user:premium', false);

      const rule: RuleInput = {
        id: 'conditional-rule-2',
        name: 'Premium Check',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [
          { source: { type: 'fact', pattern: 'user:premium' }, operator: 'eq', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'premium-action', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('order.created', { total: 200 });

      expect(engine.getFact('premium-action')).toBeUndefined();
    });

    it('evaluates conditions with various operators', async () => {
      await engine.setFact('inventory:count', 5);

      const lowStockRule: RuleInput = {
        id: 'low-stock-rule',
        name: 'Low Stock Alert',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'inventory.checked' },
        conditions: [
          { source: { type: 'fact', pattern: 'inventory:count' }, operator: 'lt', value: 10 }
        ],
        actions: [
          { type: 'set_fact', key: 'low-stock-alert', value: true }
        ]
      };

      engine.registerRule(lowStockRule);
      await engine.emit('inventory.checked', {});

      expect(engine.getFact('low-stock-alert')).toBe(true);
    });

    it('handles in operator with array values', async () => {
      const rule: RuleInput = {
        id: 'status-rule',
        name: 'Valid Status Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'status.update' },
        conditions: [
          { source: { type: 'event', field: 'status' }, operator: 'in', value: ['active', 'pending', 'review'] }
        ],
        actions: [
          { type: 'set_fact', key: 'valid-status', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.emit('status.update', { status: 'pending' });
      expect(engine.getFact('valid-status')).toBe(true);
    });

    it('handles exists operator', async () => {
      const rule: RuleInput = {
        id: 'exists-rule',
        name: 'Check Existence',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'check.trigger' },
        conditions: [
          { source: { type: 'fact', pattern: 'required:config' }, operator: 'exists', value: null }
        ],
        actions: [
          { type: 'set_fact', key: 'config-exists', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.emit('check.trigger', {});
      expect(engine.getFact('config-exists')).toBeUndefined();

      await engine.setFact('required:config', { enabled: true });
      await engine.emit('check.trigger', {});
      expect(engine.getFact('config-exists')).toBe(true);
    });
  });

  describe('rule actions', () => {
    it('set_fact action sets fact value', async () => {
      const rule: RuleInput = {
        id: 'set-fact-rule',
        name: 'Set Fact Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'trigger' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'action:result', value: 'success' }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('trigger', {});

      expect(engine.getFact('action:result')).toBe('success');
    });

    it('delete_fact action removes fact', async () => {
      await engine.setFact('to-delete', 'value');

      const rule: RuleInput = {
        id: 'delete-fact-rule',
        name: 'Delete Fact Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'cleanup' },
        conditions: [],
        actions: [
          { type: 'delete_fact', key: 'to-delete' }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('cleanup', {});

      expect(engine.getFact('to-delete')).toBeUndefined();
    });

    it('call_service action invokes registered service', async () => {
      const results: string[] = [];
      const testService = {
        process: (value: string) => {
          results.push(value);
          return 'processed';
        }
      };

      // Need to restart engine with service
      await engine.stop();
      engine = await RuleEngine.start({
        name: 'test-engine',
        services: { testService }
      });

      const rule: RuleInput = {
        id: 'service-rule',
        name: 'Service Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'invoke' },
        conditions: [],
        actions: [
          { type: 'call_service', service: 'testService', method: 'process', args: ['test-value'] }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('invoke', {});

      expect(results).toContain('test-value');
    });

    it('log action logs message', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const rule: RuleInput = {
        id: 'log-rule',
        name: 'Log Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'log.trigger' },
        conditions: [],
        actions: [
          { type: 'log', level: 'info', message: 'Event received: ${event.id}' }
        ]
      };

      engine.registerRule(rule);
      await engine.emit('log.trigger', { id: 'evt-123' });

      expect(infoSpy).toHaveBeenCalledWith('Event received: evt-123');

      infoSpy.mockRestore();
    });
  });

  describe('priority ordering', () => {
    it('executes higher priority rules first', async () => {
      const executionOrder: number[] = [];

      const lowPriorityRule: RuleInput = {
        id: 'low-priority',
        name: 'Low Priority',
        priority: 1,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'priority.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'low-executed', value: true }
        ]
      };

      const highPriorityRule: RuleInput = {
        id: 'high-priority',
        name: 'High Priority',
        priority: 100,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'priority.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'high-executed', value: true }
        ]
      };

      engine.registerRule(lowPriorityRule);
      engine.registerRule(highPriorityRule);

      await engine.emit('priority.test', {});

      expect(engine.getFact('high-executed')).toBe(true);
      expect(engine.getFact('low-executed')).toBe(true);
    });

    it('higher priority rule can set condition for lower priority', async () => {
      const setupRule: RuleInput = {
        id: 'setup-rule',
        name: 'Setup Rule',
        priority: 100,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'process' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'processing:enabled', value: true }
        ]
      };

      const dependentRule: RuleInput = {
        id: 'dependent-rule',
        name: 'Dependent Rule',
        priority: 1,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'process' },
        conditions: [
          { source: { type: 'fact', pattern: 'processing:enabled' }, operator: 'eq', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'dependent:executed', value: true }
        ]
      };

      engine.registerRule(dependentRule);
      engine.registerRule(setupRule);

      await engine.emit('process', {});

      expect(engine.getFact('processing:enabled')).toBe(true);
      expect(engine.getFact('dependent:executed')).toBe(true);
    });
  });

  describe('timer-triggered rules', () => {
    it('rule with timer trigger executes when timer expires', async () => {
      vi.useFakeTimers();

      // Rule that triggers on timer name (not event topic)
      const timerTriggeredRule: RuleInput = {
        id: 'timer-name-rule',
        name: 'Timer Name Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'timer', name: 'payment-timeout:*' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'timer-trigger:executed', value: true },
          { type: 'set_fact', key: 'timer-trigger:name', value: { ref: 'trigger.timerName' } }
        ]
      };

      engine.registerRule(timerTriggeredRule);

      // Set a timer that matches the pattern
      await engine.setTimer({
        name: 'payment-timeout:order-123',
        duration: '2s',
        onExpire: {
          topic: 'some.other.topic',
          data: { orderId: 'order-123' }
        }
      });

      expect(engine.getFact('timer-trigger:executed')).toBeUndefined();

      await vi.advanceTimersByTimeAsync(2100);

      expect(engine.getFact('timer-trigger:executed')).toBe(true);
      expect(engine.getFact('timer-trigger:name')).toBe('payment-timeout:order-123');

      vi.useRealTimers();
    });

    it('timer trigger accesses timer data including onExpire data', async () => {
      vi.useFakeTimers();

      const rule: RuleInput = {
        id: 'timer-data-rule',
        name: 'Timer Data Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'timer', name: 'reminder:*' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'reminder:userId', value: { ref: 'trigger.userId' } }
        ]
      };

      engine.registerRule(rule);

      await engine.setTimer({
        name: 'reminder:user-456',
        duration: '1s',
        onExpire: {
          topic: 'reminder.sent',
          data: { userId: 'user-456', type: 'weekly' }
        }
      });

      await vi.advanceTimersByTimeAsync(1100);

      expect(engine.getFact('reminder:userId')).toBe('user-456');

      vi.useRealTimers();
    });

    it('both timer trigger rule and event trigger rule execute on timer expiry', async () => {
      vi.useFakeTimers();

      // Rule triggered by timer name
      const timerRule: RuleInput = {
        id: 'timer-rule',
        name: 'Timer Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'timer', name: 'dual-trigger:*' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'timer-rule:executed', value: true }
        ]
      };

      // Rule triggered by event topic from timer's onExpire
      const eventRule: RuleInput = {
        id: 'event-rule',
        name: 'Event Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'dual.expired' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'event-rule:executed', value: true }
        ]
      };

      engine.registerRule(timerRule);
      engine.registerRule(eventRule);

      await engine.setTimer({
        name: 'dual-trigger:test',
        duration: '500ms',
        onExpire: {
          topic: 'dual.expired',
          data: {}
        }
      });

      await vi.advanceTimersByTimeAsync(600);

      // Both rules should have executed
      expect(engine.getFact('timer-rule:executed')).toBe(true);
      expect(engine.getFact('event-rule:executed')).toBe(true);

      vi.useRealTimers();
    });

    it('timer trigger rule with conditions evaluates correctly', async () => {
      vi.useFakeTimers();

      await engine.setFact('config:enabled', true);

      const rule: RuleInput = {
        id: 'conditional-timer-rule',
        name: 'Conditional Timer Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'timer', name: 'conditional:*' },
        conditions: [
          { source: { type: 'fact', pattern: 'config:enabled' }, operator: 'eq', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'conditional:executed', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.setTimer({
        name: 'conditional:test',
        duration: '100ms',
        onExpire: { topic: 'ignored', data: {} }
      });

      await vi.advanceTimersByTimeAsync(150);

      expect(engine.getFact('conditional:executed')).toBe(true);

      vi.useRealTimers();
    });

    it('rule action sets timer that triggers another rule', async () => {
      vi.useFakeTimers();

      const setTimerRule: RuleInput = {
        id: 'set-timer-rule',
        name: 'Set Timer',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'start.timer' },
        conditions: [],
        actions: [
          {
            type: 'set_timer',
            timer: {
              name: 'test-timer',
              duration: '1s',
              onExpire: {
                topic: 'timer.expired',
                data: { source: 'test-timer' }
              }
            }
          }
        ]
      };

      const timerHandlerRule: RuleInput = {
        id: 'timer-handler',
        name: 'Handle Timer',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'timer.expired' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'timer:handled', value: true },
          { type: 'set_fact', key: 'timer:source', value: { ref: 'event.source' } }
        ]
      };

      engine.registerRule(setTimerRule);
      engine.registerRule(timerHandlerRule);

      await engine.emit('start.timer', {});

      expect(engine.getTimer('test-timer')).toBeDefined();
      expect(engine.getFact('timer:handled')).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1100);

      expect(engine.getFact('timer:handled')).toBe(true);
      expect(engine.getFact('timer:source')).toBe('test-timer');

      vi.useRealTimers();
    });

    it('cancel_timer action prevents timer from firing', async () => {
      vi.useFakeTimers();

      const timerRule: RuleInput = {
        id: 'timer-rule',
        name: 'Timer Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'setup' },
        conditions: [],
        actions: [
          {
            type: 'set_timer',
            timer: {
              name: 'cancellable-timer',
              duration: '5s',
              onExpire: { topic: 'should.not.fire', data: {} }
            }
          }
        ]
      };

      const cancelRule: RuleInput = {
        id: 'cancel-rule',
        name: 'Cancel Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'cancel' },
        conditions: [],
        actions: [
          { type: 'cancel_timer', name: 'cancellable-timer' }
        ]
      };

      const handlerRule: RuleInput = {
        id: 'handler-rule',
        name: 'Handler Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'should.not.fire' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'timer:fired', value: true }
        ]
      };

      engine.registerRule(timerRule);
      engine.registerRule(cancelRule);
      engine.registerRule(handlerRule);

      await engine.emit('setup', {});
      expect(engine.getTimer('cancellable-timer')).toBeDefined();

      await engine.emit('cancel', {});
      expect(engine.getTimer('cancellable-timer')).toBeUndefined();

      await vi.advanceTimersByTimeAsync(6000);
      expect(engine.getFact('timer:fired')).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe('event subscriptions', () => {
    it('notifies exact topic subscribers', async () => {
      const receivedEvents: Event[] = [];

      engine.subscribe('order.created', (event) => {
        receivedEvents.push(event);
      });

      await engine.emit('order.created', { orderId: 'ord-1' });
      await engine.emit('order.updated', { orderId: 'ord-1' });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].data.orderId).toBe('ord-1');
    });

    it('notifies wildcard subscribers', async () => {
      const receivedEvents: Event[] = [];

      engine.subscribe('order.*', (event) => {
        receivedEvents.push(event);
      });

      await engine.emit('order.created', { orderId: 'ord-1' });
      await engine.emit('order.updated', { orderId: 'ord-2' });
      await engine.emit('user.created', { userId: 'usr-1' });

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].topic).toBe('order.created');
      expect(receivedEvents[1].topic).toBe('order.updated');
    });

    it('global wildcard receives all events', async () => {
      const receivedEvents: Event[] = [];

      engine.subscribe('*', (event) => {
        receivedEvents.push(event);
      });

      await engine.emit('order.created', {});
      await engine.emit('user.registered', {});
      await engine.emit('payment.processed', {});

      expect(receivedEvents).toHaveLength(3);
    });

    it('unsubscribe stops notifications', async () => {
      const receivedEvents: Event[] = [];

      const unsubscribe = engine.subscribe('test.event', (event) => {
        receivedEvents.push(event);
      });

      await engine.emit('test.event', { n: 1 });
      expect(receivedEvents).toHaveLength(1);

      unsubscribe();

      await engine.emit('test.event', { n: 2 });
      expect(receivedEvents).toHaveLength(1);
    });

    it('multiple subscribers on same topic all receive event', async () => {
      const received1: Event[] = [];
      const received2: Event[] = [];

      engine.subscribe('shared.topic', (event) => {
        received1.push(event);
      });

      engine.subscribe('shared.topic', (event) => {
        received2.push(event);
      });

      await engine.emit('shared.topic', { data: 'test' });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      expect(received1[0].data.data).toBe('test');
      expect(received2[0].data.data).toBe('test');
    });
  });

  describe('statistics tracking', () => {
    it('tracks events processed count', async () => {
      await engine.emit('event.1', {});
      await engine.emit('event.2', {});
      await engine.emit('event.3', {});

      const stats = engine.getStats();
      expect(stats.eventsProcessed).toBe(3);
    });

    it('tracks rules executed count', async () => {
      const rule: RuleInput = {
        id: 'stats-rule',
        name: 'Stats Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'counted.event' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'dummy', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.emit('counted.event', {});
      await engine.emit('counted.event', {});

      const stats = engine.getStats();
      expect(stats.rulesExecuted).toBe(2);
    });

    it('reports correct component counts', async () => {
      const rule: RuleInput = {
        id: 'count-rule',
        name: 'Count Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: []
      };

      engine.registerRule(rule);
      await engine.setFact('fact1', 'value1');
      await engine.setFact('fact2', 'value2');

      const stats = engine.getStats();
      expect(stats.rulesCount).toBe(1);
      expect(stats.factsCount).toBe(2);
    });
  });

  describe('error resilience', () => {
    it('continues processing after rule error', async () => {
      const workingRule: RuleInput = {
        id: 'working-rule',
        name: 'Working Rule',
        priority: 5,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'resilience.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'working:executed', value: true }
        ]
      };

      engine.registerRule(workingRule);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await engine.emit('resilience.test', {});

      expect(engine.getFact('working:executed')).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('wildcard event triggers', () => {
    it('rule with wildcard topic matches multiple events', async () => {
      const rule: RuleInput = {
        id: 'wildcard-rule',
        name: 'Wildcard Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'audit.*' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'audit:triggered', value: true }
        ]
      };

      engine.registerRule(rule);

      await engine.setFact('audit:triggered', false);
      await engine.emit('audit.login', {});
      expect(engine.getFact('audit:triggered')).toBe(true);

      await engine.setFact('audit:triggered', false);
      await engine.emit('audit.logout', {});
      expect(engine.getFact('audit:triggered')).toBe(true);
    });
  });

  describe('correlated events', () => {
    it('emitCorrelated attaches correlationId to event', async () => {
      const receivedEvents: Event[] = [];

      engine.subscribe('correlated.event', (event) => {
        receivedEvents.push(event);
      });

      await engine.emitCorrelated('correlated.event', { data: 'test' }, 'corr-123');

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].correlationId).toBe('corr-123');
    });

    it('emitCorrelated with causationId', async () => {
      const receivedEvents: Event[] = [];

      engine.subscribe('caused.event', (event) => {
        receivedEvents.push(event);
      });

      await engine.emitCorrelated('caused.event', {}, 'corr-456', 'cause-789');

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].correlationId).toBe('corr-456');
      expect(receivedEvents[0].causationId).toBe('cause-789');
    });

    it('rule action can access correlationId from triggering event', async () => {
      const receivedEvents: Event[] = [];

      engine.subscribe('processed.event', (event) => {
        receivedEvents.push(event);
      });

      const rule: RuleInput = {
        id: 'correlation-rule',
        name: 'Correlation Rule',
        priority: 10,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'incoming' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'correlated:processed', value: true }
        ]
      };

      engine.registerRule(rule);
      await engine.emitCorrelated('incoming', { value: 42 }, 'tracking-id');

      expect(engine.getFact('correlated:processed')).toBe(true);
    });
  });
});
