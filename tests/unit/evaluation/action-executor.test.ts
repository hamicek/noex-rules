import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ActionExecutor,
  type ExecutionContext,
  type EventEmitter,
  type ExecutionOptions
} from '../../../src/evaluation/action-executor';
import { FactStore } from '../../../src/core/fact-store';
import { TimerManager } from '../../../src/core/timer-manager';
import type { RuleAction } from '../../../src/types/action';
import type {
  ActionStartedInfo,
  ActionCompletedInfo,
  ActionFailedInfo
} from '../../../src/debugging/types';

describe('ActionExecutor', () => {
  let executor: ActionExecutor;
  let factStore: FactStore;
  let timerManager: TimerManager;
  let emitEvent: EventEmitter;
  let emittedEvents: Array<{ topic: string; event: unknown }>;
  let services: Map<string, unknown>;
  let context: ExecutionContext;

  beforeEach(async () => {
    factStore = new FactStore();
    timerManager = await TimerManager.start();
    emittedEvents = [];
    emitEvent = (topic, event) => {
      emittedEvents.push({ topic, event });
    };
    services = new Map();

    executor = new ActionExecutor(factStore, timerManager, emitEvent, services);

    context = {
      trigger: {
        type: 'event',
        data: {}
      },
      facts: factStore,
      variables: new Map(),
      correlationId: 'corr-123'
    };
  });

  describe('execute() - set_fact action', () => {
    it('sets a fact with static value', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'user:status', value: 'active' }
      ];

      const results = await executor.execute(actions, context);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(factStore.get('user:status')?.value).toBe('active');
    });

    it('sets a fact with numeric value', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'counter', value: 42 }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('counter')?.value).toBe(42);
    });

    it('sets a fact with object value', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'config', value: { enabled: true, threshold: 100 } }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('config')?.value).toEqual({ enabled: true, threshold: 100 });
    });

    it('interpolates key with template', async () => {
      context.trigger.data = { userId: '456' };
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'user:${event.userId}:online', value: true }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('user:456:online')?.value).toBe(true);
    });

    it('resolves reference in value', async () => {
      context.trigger.data = { amount: 250 };
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'last-amount', value: { ref: 'event.amount' } }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('last-amount')?.value).toBe(250);
    });

    it('resolves fact reference in value', async () => {
      factStore.set('source:value', 'copied-data');
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'target:value', value: { ref: 'fact.source:value' } }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('target:value')?.value).toBe('copied-data');
    });

    it('resolves variable reference in value', async () => {
      context.variables.set('defaultStatus', 'pending');
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'status', value: { ref: 'var.defaultStatus' } }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('status')?.value).toBe('pending');
    });

    it('returns fact as result', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'test', value: 'value' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].result).toMatchObject({
        key: 'test',
        value: 'value',
        source: 'rule'
      });
    });
  });

  describe('execute() - delete_fact action', () => {
    it('deletes an existing fact', async () => {
      factStore.set('to-delete', 'value');
      const actions: RuleAction[] = [
        { type: 'delete_fact', key: 'to-delete' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe(true);
      expect(factStore.get('to-delete')).toBeUndefined();
    });

    it('returns false when deleting non-existent fact', async () => {
      const actions: RuleAction[] = [
        { type: 'delete_fact', key: 'nonexistent' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe(false);
    });

    it('interpolates key with template', async () => {
      context.trigger.data = { orderId: 'ord-789' };
      factStore.set('order:ord-789:temp', 'data');
      const actions: RuleAction[] = [
        { type: 'delete_fact', key: 'order:${event.orderId}:temp' }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('order:ord-789:temp')).toBeUndefined();
    });
  });

  describe('execute() - emit_event action', () => {
    it('emits event with static data', async () => {
      const actions: RuleAction[] = [
        {
          type: 'emit_event',
          topic: 'notification.sent',
          data: { message: 'Hello', priority: 'high' }
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].topic).toBe('notification.sent');
      expect(emittedEvents[0].event).toMatchObject({
        topic: 'notification.sent',
        data: { message: 'Hello', priority: 'high' },
        source: 'rule',
        correlationId: 'corr-123'
      });
    });

    it('interpolates topic with template', async () => {
      context.trigger.data = { eventType: 'created' };
      const actions: RuleAction[] = [
        {
          type: 'emit_event',
          topic: 'order.${event.eventType}',
          data: {}
        }
      ];

      await executor.execute(actions, context);

      expect(emittedEvents[0].topic).toBe('order.created');
    });

    it('resolves references in event data', async () => {
      context.trigger.data = { userId: 'usr-123', amount: 500 };
      factStore.set('user:usr-123:name', 'John Doe');
      const actions: RuleAction[] = [
        {
          type: 'emit_event',
          topic: 'payment.processed',
          data: {
            userId: { ref: 'event.userId' },
            amount: { ref: 'event.amount' },
            userName: { ref: 'fact.user:usr-123:name' }
          }
        }
      ];

      await executor.execute(actions, context);

      expect(emittedEvents[0].event).toMatchObject({
        data: {
          userId: 'usr-123',
          amount: 500,
          userName: 'John Doe'
        }
      });
    });

    it('generates unique event id', async () => {
      const actions: RuleAction[] = [
        { type: 'emit_event', topic: 'test', data: {} },
        { type: 'emit_event', topic: 'test', data: {} }
      ];

      await executor.execute(actions, context);

      const event1 = emittedEvents[0].event as { id: string };
      const event2 = emittedEvents[1].event as { id: string };
      expect(event1.id).toBeDefined();
      expect(event2.id).toBeDefined();
      expect(event1.id).not.toBe(event2.id);
    });

    it('includes timestamp in emitted event', async () => {
      const before = Date.now();
      const actions: RuleAction[] = [
        { type: 'emit_event', topic: 'test', data: {} }
      ];

      await executor.execute(actions, context);

      const event = emittedEvents[0].event as { timestamp: number };
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('returns emitted event as result', async () => {
      const actions: RuleAction[] = [
        { type: 'emit_event', topic: 'test.topic', data: { key: 'value' } }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].result).toMatchObject({
        topic: 'test.topic',
        data: { key: 'value' }
      });
    });
  });

  describe('execute() - set_timer action', () => {
    it('creates a timer with duration string', async () => {
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'payment-timeout',
            duration: '15m',
            onExpire: {
              topic: 'payment.expired',
              data: { reason: 'timeout' }
            }
          }
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      const timer = timerManager.getTimer('payment-timeout');
      expect(timer).toBeDefined();
      expect(timer?.onExpire.topic).toBe('payment.expired');
    });

    it('interpolates timer name with template', async () => {
      context.trigger.data = { orderId: 'order-999' };
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'timeout:${event.orderId}',
            duration: '5m',
            onExpire: {
              topic: 'timeout.triggered',
              data: {}
            }
          }
        }
      ];

      await executor.execute(actions, context);

      expect(timerManager.getTimer('timeout:order-999')).toBeDefined();
    });

    it('interpolates onExpire topic', async () => {
      context.trigger.data = { type: 'session' };
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'my-timer',
            duration: '1h',
            onExpire: {
              topic: '${event.type}.expired',
              data: {}
            }
          }
        }
      ];

      await executor.execute(actions, context);

      const timer = timerManager.getTimer('my-timer');
      expect(timer?.onExpire.topic).toBe('session.expired');
    });

    it('resolves references in onExpire data', async () => {
      context.trigger.data = { userId: 'u-123' };
      factStore.set('config:timeout-reason', 'inactivity');
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'session-timer',
            duration: '30m',
            onExpire: {
              topic: 'session.timeout',
              data: {
                userId: { ref: 'event.userId' },
                reason: { ref: 'fact.config:timeout-reason' }
              }
            }
          }
        }
      ];

      await executor.execute(actions, context);

      const timer = timerManager.getTimer('session-timer');
      expect(timer?.onExpire.data).toEqual({
        userId: 'u-123',
        reason: 'inactivity'
      });
    });

    it('creates timer with repeat configuration', async () => {
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'heartbeat',
            duration: '1m',
            onExpire: {
              topic: 'heartbeat.tick',
              data: {}
            },
            repeat: {
              interval: '1m',
              maxCount: 10
            }
          }
        }
      ];

      await executor.execute(actions, context);

      const timer = timerManager.getTimer('heartbeat');
      expect(timer?.repeat).toBeDefined();
      expect(timer?.repeat?.maxCount).toBe(10);
    });

    it('passes correlationId to timer', async () => {
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'correlated-timer',
            duration: '10s',
            onExpire: {
              topic: 'timer.done',
              data: {}
            }
          }
        }
      ];

      await executor.execute(actions, context);

      const timer = timerManager.getTimer('correlated-timer');
      expect(timer?.correlationId).toBe('corr-123');
    });

    it('returns created timer as result', async () => {
      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'result-timer',
            duration: '5m',
            onExpire: {
              topic: 'done',
              data: {}
            }
          }
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].result).toMatchObject({
        name: 'result-timer',
        onExpire: { topic: 'done' }
      });
    });
  });

  describe('execute() - cancel_timer action', () => {
    it('cancels an existing timer', async () => {
      await timerManager.setTimer({
        name: 'to-cancel',
        duration: '1h',
        onExpire: { topic: 'test', data: {} }
      });

      const actions: RuleAction[] = [
        { type: 'cancel_timer', name: 'to-cancel' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe(true);
      expect(timerManager.getTimer('to-cancel')).toBeUndefined();
    });

    it('returns false when cancelling non-existent timer', async () => {
      const actions: RuleAction[] = [
        { type: 'cancel_timer', name: 'nonexistent' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe(false);
    });

    it('interpolates timer name with template', async () => {
      context.trigger.data = { orderId: 'ord-456' };
      await timerManager.setTimer({
        name: 'timeout:ord-456',
        duration: '1h',
        onExpire: { topic: 'test', data: {} }
      });

      const actions: RuleAction[] = [
        { type: 'cancel_timer', name: 'timeout:${event.orderId}' }
      ];

      await executor.execute(actions, context);

      expect(timerManager.getTimer('timeout:ord-456')).toBeUndefined();
    });
  });

  describe('execute() - call_service action', () => {
    it('calls service method with static args', async () => {
      const mockService = {
        sendEmail: vi.fn().mockReturnValue({ sent: true })
      };
      services.set('emailService', mockService);

      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'emailService',
          method: 'sendEmail',
          args: ['user@example.com', 'Hello', 'Body text']
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(mockService.sendEmail).toHaveBeenCalledWith('user@example.com', 'Hello', 'Body text');
      expect(results[0].result).toEqual({ sent: true });
    });

    it('resolves references in args', async () => {
      context.trigger.data = { email: 'dynamic@example.com', subject: 'Dynamic Subject' };
      const mockService = {
        sendNotification: vi.fn().mockReturnValue('notified')
      };
      services.set('notifier', mockService);

      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'notifier',
          method: 'sendNotification',
          args: [{ ref: 'event.email' }, { ref: 'event.subject' }]
        }
      ];

      await executor.execute(actions, context);

      expect(mockService.sendNotification).toHaveBeenCalledWith('dynamic@example.com', 'Dynamic Subject');
    });

    it('handles async service methods', async () => {
      const mockService = {
        asyncOperation: vi.fn().mockResolvedValue('async-result')
      };
      services.set('asyncService', mockService);

      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'asyncService',
          method: 'asyncOperation',
          args: ['param']
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(results[0].result).toBe('async-result');
    });

    it('fails when service not found', async () => {
      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'unknownService',
          method: 'someMethod',
          args: []
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Service not found: unknownService');
    });

    it('fails when method not found', async () => {
      services.set('myService', { existingMethod: () => {} });

      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'myService',
          method: 'nonExistentMethod',
          args: []
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Method not found: myService.nonExistentMethod');
    });

    it('preserves this context when calling service method', async () => {
      const mockService = {
        value: 'service-value',
        getValue() {
          return this.value;
        }
      };
      services.set('contextService', mockService);

      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'contextService',
          method: 'getValue',
          args: []
        }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].result).toBe('service-value');
    });
  });

  describe('execute() - log action', () => {
    beforeEach(() => {
      vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('logs debug message', async () => {
      const actions: RuleAction[] = [
        { type: 'log', level: 'debug', message: 'Debug message' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(true);
      expect(console.debug).toHaveBeenCalledWith('Debug message');
    });

    it('logs info message', async () => {
      const actions: RuleAction[] = [
        { type: 'log', level: 'info', message: 'Info message' }
      ];

      await executor.execute(actions, context);

      expect(console.info).toHaveBeenCalledWith('Info message');
    });

    it('logs warn message', async () => {
      const actions: RuleAction[] = [
        { type: 'log', level: 'warn', message: 'Warning message' }
      ];

      await executor.execute(actions, context);

      expect(console.warn).toHaveBeenCalledWith('Warning message');
    });

    it('logs error message', async () => {
      const actions: RuleAction[] = [
        { type: 'log', level: 'error', message: 'Error message' }
      ];

      await executor.execute(actions, context);

      expect(console.error).toHaveBeenCalledWith('Error message');
    });

    it('interpolates message with template', async () => {
      context.trigger.data = { userId: 'user-789', action: 'login' };
      const actions: RuleAction[] = [
        { type: 'log', level: 'info', message: 'User ${event.userId} performed ${event.action}' }
      ];

      await executor.execute(actions, context);

      expect(console.info).toHaveBeenCalledWith('User user-789 performed login');
    });

    it('returns logged message as result', async () => {
      const actions: RuleAction[] = [
        { type: 'log', level: 'info', message: 'Test message' }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].result).toBe('Test message');
    });
  });

  describe('execute() - error handling', () => {
    it('captures error and continues with remaining actions', async () => {
      services.set('failingService', {
        fail: () => { throw new Error('Service failed'); }
      });

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'failingService', method: 'fail', args: [] },
        { type: 'set_fact', key: 'after-error', value: 'executed' }
      ];

      const results = await executor.execute(actions, context);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Service failed');
      expect(results[1].success).toBe(true);
      expect(factStore.get('after-error')?.value).toBe('executed');
    });

    it('handles non-Error thrown values', async () => {
      services.set('stringThrower', {
        throwString: () => { throw 'string error'; }
      });

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'stringThrower', method: 'throwString', args: [] }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('string error');
    });

    it('includes original action in result', async () => {
      const action: RuleAction = { type: 'set_fact', key: 'test', value: 123 };
      const actions: RuleAction[] = [action];

      const results = await executor.execute(actions, context);

      expect(results[0].action).toBe(action);
    });

    it('handles async event emitter errors', async () => {
      const failingEmitter: EventEmitter = async () => {
        throw new Error('Emit failed');
      };
      executor = new ActionExecutor(factStore, timerManager, failingEmitter, services);

      const actions: RuleAction[] = [
        { type: 'emit_event', topic: 'test', data: {} }
      ];

      const results = await executor.execute(actions, context);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Emit failed');
    });
  });

  describe('execute() - multiple actions', () => {
    it('executes actions in sequence', async () => {
      const executionOrder: string[] = [];
      services.set('tracker', {
        track: (id: string) => { executionOrder.push(id); return id; }
      });

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'tracker', method: 'track', args: ['first'] },
        { type: 'call_service', service: 'tracker', method: 'track', args: ['second'] },
        { type: 'call_service', service: 'tracker', method: 'track', args: ['third'] }
      ];

      await executor.execute(actions, context);

      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });

    it('returns result for each action', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'a', value: 1 },
        { type: 'set_fact', key: 'b', value: 2 },
        { type: 'set_fact', key: 'c', value: 3 }
      ];

      const results = await executor.execute(actions, context);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('handles empty actions array', async () => {
      const results = await executor.execute([], context);

      expect(results).toEqual([]);
    });

    it('allows later actions to use facts set by earlier actions', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'computed', value: 100 },
        { type: 'emit_event', topic: 'notify', data: { value: { ref: 'fact.computed' } } }
      ];

      await executor.execute(actions, context);

      expect(emittedEvents[0].event).toMatchObject({
        data: { value: 100 }
      });
    });
  });

  describe('execute() - context handling', () => {
    it('works without correlationId', async () => {
      context.correlationId = undefined;
      const actions: RuleAction[] = [
        { type: 'emit_event', topic: 'test', data: {} }
      ];

      await executor.execute(actions, context);

      const event = emittedEvents[0].event as { correlationId?: string };
      expect(event.correlationId).toBeUndefined();
    });

    it('handles nested event data references', async () => {
      context.trigger.data = {
        order: {
          id: 'ord-123',
          customer: {
            name: 'John'
          }
        }
      };
      const actions: RuleAction[] = [
        {
          type: 'set_fact',
          key: 'customer-name',
          value: { ref: 'event.order.customer.name' }
        }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('customer-name')?.value).toBe('John');
    });

    it('handles trigger alias for event reference', async () => {
      context.trigger.data = { field: 'trigger-value' };
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'from-trigger', value: { ref: 'trigger.field' } }
      ];

      await executor.execute(actions, context);

      expect(factStore.get('from-trigger')?.value).toBe('trigger-value');
    });
  });

  describe('execute() - tracing callbacks', () => {
    it('calls onActionStarted before each action', async () => {
      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'a', value: 1 },
        { type: 'set_fact', key: 'b', value: 2 }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls).toHaveLength(2);
      expect(startedCalls[0].actionIndex).toBe(0);
      expect(startedCalls[0].actionType).toBe('set_fact');
      expect(startedCalls[1].actionIndex).toBe(1);
      expect(startedCalls[1].actionType).toBe('set_fact');
    });

    it('calls onActionCompleted for successful actions', async () => {
      const completedCalls: ActionCompletedInfo[] = [];
      const options: ExecutionOptions = {
        onActionCompleted: (info) => completedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'test', value: 'value' }
      ];

      await executor.execute(actions, context, options);

      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].actionIndex).toBe(0);
      expect(completedCalls[0].actionType).toBe('set_fact');
      expect(completedCalls[0].output).toMatchObject({ key: 'test', value: 'value' });
      expect(completedCalls[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('calls onActionFailed for failed actions', async () => {
      const failedCalls: ActionFailedInfo[] = [];
      const options: ExecutionOptions = {
        onActionFailed: (info) => failedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'unknown', method: 'test', args: [] }
      ];

      await executor.execute(actions, context, options);

      expect(failedCalls).toHaveLength(1);
      expect(failedCalls[0].actionIndex).toBe(0);
      expect(failedCalls[0].actionType).toBe('call_service');
      expect(failedCalls[0].error).toBe('Service not found: unknown');
      expect(failedCalls[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('provides resolved input in onActionStarted', async () => {
      context.trigger.data = { orderId: 'ord-123' };
      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'order:${event.orderId}:status', value: { ref: 'event.orderId' } }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({
        key: 'order:ord-123:status',
        value: 'ord-123'
      });
    });

    it('traces emit_event action with resolved data', async () => {
      context.trigger.data = { userId: 'usr-999' };
      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'emit_event',
          topic: 'user.${event.userId}.created',
          data: { userId: { ref: 'event.userId' }, status: 'active' }
        }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({
        topic: 'user.usr-999.created',
        data: { userId: 'usr-999', status: 'active' }
      });
    });

    it('traces set_timer action input', async () => {
      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'set_timer',
          timer: {
            name: 'my-timer',
            duration: '5m',
            onExpire: { topic: 'timer.done', data: { reason: 'timeout' } }
          }
        }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({
        name: 'my-timer',
        duration: '5m',
        onExpire: { topic: 'timer.done', data: { reason: 'timeout' } }
      });
    });

    it('traces cancel_timer action input', async () => {
      await timerManager.setTimer({
        name: 'to-cancel',
        duration: '1h',
        onExpire: { topic: 'test', data: {} }
      });

      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'cancel_timer', name: 'to-cancel' }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({ name: 'to-cancel' });
    });

    it('traces call_service action input with resolved args', async () => {
      context.trigger.data = { email: 'test@example.com' };
      services.set('mailer', { send: vi.fn().mockReturnValue({ sent: true }) });

      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        {
          type: 'call_service',
          service: 'mailer',
          method: 'send',
          args: [{ ref: 'event.email' }, 'Hello']
        }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({
        service: 'mailer',
        method: 'send',
        args: ['test@example.com', 'Hello']
      });
    });

    it('traces log action input', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      context.trigger.data = { name: 'Alice' };

      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'log', level: 'info', message: 'Hello ${event.name}!' }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({
        level: 'info',
        message: 'Hello Alice!'
      });
    });

    it('traces delete_fact action input', async () => {
      factStore.set('to-delete', 'value');
      context.trigger.data = { key: 'to-delete' };

      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'delete_fact', key: '${event.key}' }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls[0].input).toEqual({ key: 'to-delete' });
    });

    it('calls callbacks in correct order for multiple actions', async () => {
      const callOrder: string[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => callOrder.push(`started:${info.actionIndex}`),
        onActionCompleted: (info) => callOrder.push(`completed:${info.actionIndex}`)
      };

      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'a', value: 1 },
        { type: 'set_fact', key: 'b', value: 2 }
      ];

      await executor.execute(actions, context, options);

      expect(callOrder).toEqual([
        'started:0',
        'completed:0',
        'started:1',
        'completed:1'
      ]);
    });

    it('calls onActionStarted even when action fails', async () => {
      const startedCalls: ActionStartedInfo[] = [];
      const failedCalls: ActionFailedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info),
        onActionFailed: (info) => failedCalls.push(info)
      };

      services.set('failing', {
        fail: () => { throw new Error('Intentional failure'); }
      });

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'failing', method: 'fail', args: [] }
      ];

      await executor.execute(actions, context, options);

      expect(startedCalls).toHaveLength(1);
      expect(failedCalls).toHaveLength(1);
      expect(failedCalls[0].error).toBe('Intentional failure');
    });

    it('continues tracing after failed action', async () => {
      const completedCalls: ActionCompletedInfo[] = [];
      const failedCalls: ActionFailedInfo[] = [];
      const options: ExecutionOptions = {
        onActionCompleted: (info) => completedCalls.push(info),
        onActionFailed: (info) => failedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'unknown', method: 'test', args: [] },
        { type: 'set_fact', key: 'after-fail', value: true }
      ];

      await executor.execute(actions, context, options);

      expect(failedCalls).toHaveLength(1);
      expect(failedCalls[0].actionIndex).toBe(0);
      expect(completedCalls).toHaveLength(1);
      expect(completedCalls[0].actionIndex).toBe(1);
    });

    it('works without any callbacks', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'no-trace', value: 'value' }
      ];

      const results = await executor.execute(actions, context);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('works with partial callbacks', async () => {
      const startedCalls: ActionStartedInfo[] = [];
      const options: ExecutionOptions = {
        onActionStarted: (info) => startedCalls.push(info)
        // no onActionCompleted or onActionFailed
      };

      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'partial', value: 1 }
      ];

      const results = await executor.execute(actions, context, options);

      expect(startedCalls).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('measures duration accurately', async () => {
      services.set('slow', {
        delay: () => new Promise(resolve => setTimeout(resolve, 50))
      });

      const completedCalls: ActionCompletedInfo[] = [];
      const options: ExecutionOptions = {
        onActionCompleted: (info) => completedCalls.push(info)
      };

      const actions: RuleAction[] = [
        { type: 'call_service', service: 'slow', method: 'delay', args: [] }
      ];

      await executor.execute(actions, context, options);

      expect(completedCalls[0].durationMs).toBeGreaterThanOrEqual(40);
    });
  });
});
