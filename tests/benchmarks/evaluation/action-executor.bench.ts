import { bench, describe } from 'vitest';
import { ActionExecutor, type ExecutionContext } from '../../../src/evaluation/action-executor.js';
import { FactStore } from '../../../src/core/fact-store.js';
import { TimerManager } from '../../../src/core/timer-manager.js';
import type { RuleAction } from '../../../src/types/action.js';

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    event: {
      id: 'evt-12345',
      topic: 'order.created',
      data: {
        orderId: 'ORD-12345',
        customerId: 'CUST-001',
        total: 150.50,
        items: [
          { sku: 'PROD-001', qty: 2, price: 50.25 },
          { sku: 'PROD-002', qty: 1, price: 50.00 }
        ],
        metadata: {
          source: 'web',
          campaign: 'summer-sale'
        }
      },
      timestamp: Date.now(),
      source: 'api'
    },
    fact: (key: string) => {
      const facts: Record<string, unknown> = {
        'customer:CUST-001:tier': 'premium',
        'customer:CUST-001:discount': 0.15,
        'config:thresholds:freeShipping': 100
      };
      return facts[key];
    },
    correlationId: 'corr-12345',
    ...overrides
  };
}

function createActionSet(type: RuleAction['type'], count: number): RuleAction[] {
  const actions: RuleAction[] = [];

  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'set_fact':
        actions.push({
          type: 'set_fact',
          key: `result:${i}:value`,
          value: { computed: true, index: i }
        });
        break;
      case 'delete_fact':
        actions.push({
          type: 'delete_fact',
          key: `temp:${i}:cache`
        });
        break;
      case 'emit_event':
        actions.push({
          type: 'emit_event',
          topic: `processed.item_${i}`,
          data: { index: i, processed: true }
        });
        break;
      case 'set_timer':
        actions.push({
          type: 'set_timer',
          timer: {
            name: `timer_${i}`,
            duration: '5m',
            onExpire: {
              topic: `timer.expired_${i}`,
              data: { timerIndex: i }
            }
          }
        });
        break;
      case 'cancel_timer':
        actions.push({
          type: 'cancel_timer',
          name: `timer_${i}`
        });
        break;
      case 'log':
        actions.push({
          type: 'log',
          level: 'info',
          message: `Action ${i} executed`
        });
        break;
      case 'call_service':
        actions.push({
          type: 'call_service',
          service: 'testService',
          method: 'process',
          args: [i, `arg_${i}`]
        });
        break;
    }
  }

  return actions;
}

function createMixedActions(count: number): RuleAction[] {
  const types: RuleAction['type'][] = [
    'set_fact', 'delete_fact', 'emit_event', 'log', 'set_timer', 'cancel_timer'
  ];
  const actions: RuleAction[] = [];

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    actions.push(...createActionSet(type, 1).map(a => {
      if (a.type === 'set_fact') return { ...a, key: `mixed:${i}:value` };
      if (a.type === 'delete_fact') return { ...a, key: `mixed:${i}:temp` };
      if (a.type === 'emit_event') return { ...a, topic: `mixed.event_${i}` };
      if (a.type === 'set_timer') return { ...a, timer: { ...a.timer, name: `mixed_timer_${i}` } };
      if (a.type === 'cancel_timer') return { ...a, name: `mixed_timer_${i}` };
      return a;
    }));
  }

  return actions;
}

describe('ActionExecutor', () => {
  describe('individual action types', () => {
    const factStore = new FactStore();
    const timerManager = new TimerManager();
    const emittedEvents: unknown[] = [];
    const emitEvent = async (_topic: string, event: unknown) => {
      emittedEvents.push(event);
    };

    const executor = new ActionExecutor(factStore, timerManager, emitEvent);
    const ctx = createExecutionContext();

    bench('set_fact - static value', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'bench:result:static',
        value: { status: 'completed', count: 42 }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('set_fact - with ref value', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'bench:result:ref',
        value: { ref: 'event.data.total' }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('set_fact - interpolated key', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'order:${event.data.orderId}:processed',
        value: true
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('delete_fact', async () => {
      factStore.set('bench:temp:delete', 'value');
      const actions: RuleAction[] = [{
        type: 'delete_fact',
        key: 'bench:temp:delete'
      }];
      for (let i = 0; i < 100; i++) {
        factStore.set('bench:temp:delete', 'value');
        await executor.execute(actions, ctx);
      }
    });

    bench('emit_event - static data', async () => {
      emittedEvents.length = 0;
      const actions: RuleAction[] = [{
        type: 'emit_event',
        topic: 'bench.emitted',
        data: { status: 'processed', value: 100 }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('emit_event - with refs in data', async () => {
      emittedEvents.length = 0;
      const actions: RuleAction[] = [{
        type: 'emit_event',
        topic: 'bench.emitted',
        data: {
          orderId: { ref: 'event.data.orderId' },
          customerId: { ref: 'event.data.customerId' },
          total: { ref: 'event.data.total' }
        }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('emit_event - interpolated topic', async () => {
      emittedEvents.length = 0;
      const actions: RuleAction[] = [{
        type: 'emit_event',
        topic: 'order.${event.data.orderId}.processed',
        data: { status: 'done' }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('log - info level', async () => {
      const originalLog = console.info;
      console.info = () => {};
      const actions: RuleAction[] = [{
        type: 'log',
        level: 'info',
        message: 'Processing order ${event.data.orderId}'
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
      console.info = originalLog;
    });

    bench('set_timer', async () => {
      const actions: RuleAction[] = [{
        type: 'set_timer',
        timer: {
          name: 'bench-timer',
          duration: '5m',
          onExpire: {
            topic: 'timer.expired',
            data: { source: 'bench' }
          }
        }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
      await timerManager.stop();
    });

    bench('cancel_timer', async () => {
      const actions: RuleAction[] = [{
        type: 'cancel_timer',
        name: 'bench-timer-cancel'
      }];
      for (let i = 0; i < 100; i++) {
        await timerManager.setTimer({
          name: 'bench-timer-cancel',
          duration: '5m',
          onExpire: { topic: 'expired', data: {} }
        });
        await executor.execute(actions, ctx);
      }
    });
  });

  describe('call_service', () => {
    const factStore = new FactStore();
    const timerManager = new TimerManager();
    const emitEvent = async () => {};

    const testService = {
      syncMethod: (a: number, b: number) => a + b,
      asyncMethod: async (a: number, b: number) => {
        return a * b;
      },
      heavyMethod: (iterations: number) => {
        let result = 0;
        for (let i = 0; i < iterations; i++) {
          result += Math.sqrt(i);
        }
        return result;
      }
    };

    const services = new Map<string, unknown>([['testService', testService]]);
    const executor = new ActionExecutor(factStore, timerManager, emitEvent, services);
    const ctx = createExecutionContext();

    bench('call_service - sync method', async () => {
      const actions: RuleAction[] = [{
        type: 'call_service',
        service: 'testService',
        method: 'syncMethod',
        args: [10, 20]
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('call_service - async method', async () => {
      const actions: RuleAction[] = [{
        type: 'call_service',
        service: 'testService',
        method: 'asyncMethod',
        args: [10, 20]
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('call_service - with ref args', async () => {
      const actions: RuleAction[] = [{
        type: 'call_service',
        service: 'testService',
        method: 'syncMethod',
        args: [{ ref: 'event.data.total' }, 10]
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });
  });

  describe('action count scalability', () => {
    const factStore = new FactStore();
    const timerManager = new TimerManager();
    const emitEvent = async () => {};
    const executor = new ActionExecutor(factStore, timerManager, emitEvent);
    const ctx = createExecutionContext();

    const actionSets = {
      1: createMixedActions(1),
      5: createMixedActions(5),
      10: createMixedActions(10),
      20: createMixedActions(20),
      50: createMixedActions(50)
    };

    bench('execute() - 1 action', async () => {
      for (let i = 0; i < 100; i++) {
        await executor.execute(actionSets[1], ctx);
      }
    });

    bench('execute() - 5 actions', async () => {
      for (let i = 0; i < 100; i++) {
        await executor.execute(actionSets[5], ctx);
      }
    });

    bench('execute() - 10 actions', async () => {
      for (let i = 0; i < 100; i++) {
        await executor.execute(actionSets[10], ctx);
      }
    });

    bench('execute() - 20 actions', async () => {
      for (let i = 0; i < 100; i++) {
        await executor.execute(actionSets[20], ctx);
      }
    });

    bench('execute() - 50 actions', async () => {
      for (let i = 0; i < 100; i++) {
        await executor.execute(actionSets[50], ctx);
      }
    });
  });

  describe('interpolation overhead', () => {
    const factStore = new FactStore();
    const timerManager = new TimerManager();
    const emitEvent = async () => {};
    const executor = new ActionExecutor(factStore, timerManager, emitEvent);
    const ctx = createExecutionContext();

    bench('no interpolation (static strings)', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'static:key:path',
        value: 'static value'
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('single interpolation', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'order:${event.data.orderId}:status',
        value: 'processed'
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('multiple interpolations', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'relation:${event.data.customerId}:${event.data.orderId}:status',
        value: 'linked'
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('nested path interpolation', async () => {
      const actions: RuleAction[] = [{
        type: 'set_fact',
        key: 'campaign:${event.data.metadata.campaign}:orders',
        value: { ref: 'event.data.orderId' }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });
  });

  describe('emit_event with complex data', () => {
    const factStore = new FactStore();
    const timerManager = new TimerManager();
    const emittedEvents: unknown[] = [];
    const emitEvent = async (_topic: string, event: unknown) => {
      emittedEvents.push(event);
    };
    const executor = new ActionExecutor(factStore, timerManager, emitEvent);
    const ctx = createExecutionContext();

    bench('emit - simple flat data', async () => {
      emittedEvents.length = 0;
      const actions: RuleAction[] = [{
        type: 'emit_event',
        topic: 'test.simple',
        data: { a: 1, b: 2, c: 3 }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('emit - nested data structure', async () => {
      emittedEvents.length = 0;
      const actions: RuleAction[] = [{
        type: 'emit_event',
        topic: 'test.nested',
        data: {
          level1: {
            level2: {
              level3: { value: 42 }
            }
          },
          array: [1, 2, 3, 4, 5]
        }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('emit - many refs in data', async () => {
      emittedEvents.length = 0;
      const actions: RuleAction[] = [{
        type: 'emit_event',
        topic: 'test.refs',
        data: {
          id: { ref: 'event.id' },
          orderId: { ref: 'event.data.orderId' },
          customerId: { ref: 'event.data.customerId' },
          total: { ref: 'event.data.total' },
          source: { ref: 'event.source' },
          timestamp: { ref: 'event.timestamp' }
        }
      }];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });
  });

  describe('error handling overhead', () => {
    const factStore = new FactStore();
    const timerManager = new TimerManager();
    const emitEvent = async () => {};
    const services = new Map<string, unknown>([
      ['errorService', {
        throwError: () => { throw new Error('Service error'); }
      }]
    ]);
    const executor = new ActionExecutor(factStore, timerManager, emitEvent, services);
    const ctx = createExecutionContext();

    bench('successful actions (no errors)', async () => {
      const actions: RuleAction[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'set_fact' as const,
        key: `success:${i}`,
        value: i
      }));
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });

    bench('actions with errors (caught)', async () => {
      const actions: RuleAction[] = [
        { type: 'set_fact', key: 'before:error', value: 1 },
        { type: 'call_service', service: 'errorService', method: 'throwError', args: [] },
        { type: 'set_fact', key: 'after:error', value: 2 }
      ];
      for (let i = 0; i < 100; i++) {
        await executor.execute(actions, ctx);
      }
    });
  });

  describe('timer operations at scale', () => {
    bench('set 100 unique timers', async () => {
      const factStore = new FactStore();
      const timerManager = new TimerManager();
      const emitEvent = async () => {};
      const executor = new ActionExecutor(factStore, timerManager, emitEvent);
      const ctx = createExecutionContext();

      const actions = createActionSet('set_timer', 100).map((a, i) => {
        if (a.type === 'set_timer') {
          return { ...a, timer: { ...a.timer, name: `scale-timer-${i}` } };
        }
        return a;
      });

      await executor.execute(actions, ctx);
      await timerManager.stop();
    });

    bench('cancel 100 timers', async () => {
      const factStore = new FactStore();
      const timerManager = new TimerManager();
      const emitEvent = async () => {};
      const executor = new ActionExecutor(factStore, timerManager, emitEvent);
      const ctx = createExecutionContext();

      for (let i = 0; i < 100; i++) {
        await timerManager.setTimer({
          name: `cancel-timer-${i}`,
          duration: '1h',
          onExpire: { topic: 'expired', data: {} }
        });
      }

      const cancelActions: RuleAction[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'cancel_timer' as const,
        name: `cancel-timer-${i}`
      }));

      await executor.execute(cancelActions, ctx);
      await timerManager.stop();
    });
  });
});
