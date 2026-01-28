import { bench, describe, beforeAll, afterAll } from 'vitest';
import { RuleEngine } from '../../../src/core/rule-engine.js';
import { generateRulesForTopic } from '../fixtures/index.js';

/**
 * Benchmark pro měření overhead tracingu.
 * Cíl: < 5% overhead při zapnutém tracingu.
 */
describe('Tracing Overhead', () => {
  const RULE_COUNT = 50;
  const EVENT_COUNT = 100;
  const TARGET_TOPIC = 'benchmark.tracing';

  describe('emit() throughput comparison', () => {
    bench('baseline - tracing disabled', async () => {
      const engine = await RuleEngine.start({
        name: 'tracing-disabled',
        tracing: { enabled: false }
      });

      const rules = generateRulesForTopic(TARGET_TOPIC, RULE_COUNT);
      for (const rule of rules) {
        engine.registerRule(rule);
      }

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, value: Math.random() * 1000 });
      }

      await engine.stop();
    });

    bench('with tracing enabled', async () => {
      const engine = await RuleEngine.start({
        name: 'tracing-enabled',
        tracing: { enabled: true, maxEntries: 10000 }
      });

      const rules = generateRulesForTopic(TARGET_TOPIC, RULE_COUNT);
      for (const rule of rules) {
        engine.registerRule(rule);
      }

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, value: Math.random() * 1000 });
      }

      await engine.stop();
    });
  });

  describe('condition evaluation overhead', () => {
    const CONDITION_COUNT = 5;

    bench('baseline - complex conditions, tracing disabled', async () => {
      const engine = await RuleEngine.start({
        name: 'conditions-no-trace',
        tracing: { enabled: false }
      });

      engine.registerRule({
        name: 'complex-conditions-rule',
        trigger: { type: 'event', topic: 'condition.test' },
        conditions: [
          { source: { type: 'event', field: 'data.amount' }, operator: 'gt', value: 50 },
          { source: { type: 'event', field: 'data.status' }, operator: 'eq', value: 'active' },
          { source: { type: 'event', field: 'data.priority' }, operator: 'in', value: ['high', 'critical'] },
          { source: { type: 'event', field: 'data.count' }, operator: 'gte', value: 10 },
          { source: { type: 'event', field: 'data.type' }, operator: 'ne', value: 'internal' }
        ],
        actions: [
          { type: 'set_fact', key: 'condition:result', value: true }
        ]
      });

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit('condition.test', {
          amount: 100,
          status: 'active',
          priority: 'high',
          count: 20,
          type: 'external'
        });
      }

      await engine.stop();
    });

    bench('with tracing - complex conditions', async () => {
      const engine = await RuleEngine.start({
        name: 'conditions-with-trace',
        tracing: { enabled: true, maxEntries: 10000 }
      });

      engine.registerRule({
        name: 'complex-conditions-rule',
        trigger: { type: 'event', topic: 'condition.test' },
        conditions: [
          { source: { type: 'event', field: 'data.amount' }, operator: 'gt', value: 50 },
          { source: { type: 'event', field: 'data.status' }, operator: 'eq', value: 'active' },
          { source: { type: 'event', field: 'data.priority' }, operator: 'in', value: ['high', 'critical'] },
          { source: { type: 'event', field: 'data.count' }, operator: 'gte', value: 10 },
          { source: { type: 'event', field: 'data.type' }, operator: 'ne', value: 'internal' }
        ],
        actions: [
          { type: 'set_fact', key: 'condition:result', value: true }
        ]
      });

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit('condition.test', {
          amount: 100,
          status: 'active',
          priority: 'high',
          count: 20,
          type: 'external'
        });
      }

      await engine.stop();
    });
  });

  describe('action execution overhead', () => {
    bench('baseline - multiple actions, tracing disabled', async () => {
      const engine = await RuleEngine.start({
        name: 'actions-no-trace',
        tracing: { enabled: false }
      });

      engine.registerRule({
        name: 'multi-action-rule',
        trigger: { type: 'event', topic: 'action.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'action:step1', value: 1 },
          { type: 'set_fact', key: 'action:step2', value: 2 },
          { type: 'set_fact', key: 'action:step3', value: 3 },
          { type: 'emit_event', topic: 'action.completed', data: { status: 'done' } },
          { type: 'set_fact', key: 'action:final', value: true }
        ]
      });

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit('action.test', { id: i });
      }

      await engine.stop();
    });

    bench('with tracing - multiple actions', async () => {
      const engine = await RuleEngine.start({
        name: 'actions-with-trace',
        tracing: { enabled: true, maxEntries: 10000 }
      });

      engine.registerRule({
        name: 'multi-action-rule',
        trigger: { type: 'event', topic: 'action.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'action:step1', value: 1 },
          { type: 'set_fact', key: 'action:step2', value: 2 },
          { type: 'set_fact', key: 'action:step3', value: 3 },
          { type: 'emit_event', topic: 'action.completed', data: { status: 'done' } },
          { type: 'set_fact', key: 'action:final', value: true }
        ]
      });

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit('action.test', { id: i });
      }

      await engine.stop();
    });
  });

  describe('forward chaining overhead', () => {
    const CHAIN_DEPTH = 5;

    async function createChainEngine(name: string, tracingEnabled: boolean): Promise<RuleEngine> {
      const engine = await RuleEngine.start({
        name,
        tracing: { enabled: tracingEnabled, maxEntries: 10000 }
      });

      for (let i = 0; i < CHAIN_DEPTH; i++) {
        const isLast = i === CHAIN_DEPTH - 1;
        engine.registerRule({
          name: `chain-rule-${i}`,
          trigger: { type: 'event', topic: i === 0 ? 'chain.start' : `chain.step_${i}` },
          conditions: [],
          actions: isLast
            ? [{ type: 'set_fact', key: 'chain:completed', value: CHAIN_DEPTH }]
            : [{ type: 'emit_event', topic: `chain.step_${i + 1}`, data: { step: i + 1 } }]
        });
      }

      return engine;
    }

    bench('baseline - forward chain, tracing disabled', async () => {
      const engine = await createChainEngine('chain-no-trace', false);

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit('chain.start', { iteration: i });
      }

      await engine.stop();
    });

    bench('with tracing - forward chain', async () => {
      const engine = await createChainEngine('chain-with-trace', true);

      for (let i = 0; i < EVENT_COUNT; i++) {
        await engine.emit('chain.start', { iteration: i });
      }

      await engine.stop();
    });
  });

  describe('high-volume tracing with buffer rotation', () => {
    bench('high volume - small buffer (1000 entries)', async () => {
      const engine = await RuleEngine.start({
        name: 'small-buffer',
        tracing: { enabled: true, maxEntries: 1000 }
      });

      const rules = generateRulesForTopic(TARGET_TOPIC, 20);
      for (const rule of rules) {
        engine.registerRule(rule);
      }

      // Generate enough events to cause multiple buffer rotations
      for (let i = 0; i < 200; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, value: Math.random() * 1000 });
      }

      await engine.stop();
    });

    bench('high volume - large buffer (10000 entries)', async () => {
      const engine = await RuleEngine.start({
        name: 'large-buffer',
        tracing: { enabled: true, maxEntries: 10000 }
      });

      const rules = generateRulesForTopic(TARGET_TOPIC, 20);
      for (const rule of rules) {
        engine.registerRule(rule);
      }

      for (let i = 0; i < 200; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, value: Math.random() * 1000 });
      }

      await engine.stop();
    });
  });

  describe('dynamic tracing toggle', () => {
    bench('toggle tracing on/off during execution', async () => {
      const engine = await RuleEngine.start({
        name: 'toggle-tracing',
        tracing: { enabled: false }
      });

      const rules = generateRulesForTopic(TARGET_TOPIC, RULE_COUNT);
      for (const rule of rules) {
        engine.registerRule(rule);
      }

      // Start with tracing disabled
      for (let i = 0; i < 25; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, phase: 'no-trace' });
      }

      // Enable tracing
      engine.enableTracing();

      for (let i = 25; i < 75; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, phase: 'with-trace' });
      }

      // Disable tracing
      engine.disableTracing();

      for (let i = 75; i < 100; i++) {
        await engine.emit(TARGET_TOPIC, { id: i, phase: 'no-trace-again' });
      }

      await engine.stop();
    });
  });
});
