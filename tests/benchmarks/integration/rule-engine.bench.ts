import { bench, describe } from 'vitest';
import { RuleEngine } from '../../../src/core/rule-engine.js';
import { generateRulesForTopic, TOPICS } from '../fixtures/index.js';

async function createEngineWithRules(name: string, topic: string, ruleCount: number): Promise<RuleEngine> {
  const engine = await RuleEngine.start({ name });
  const rules = generateRulesForTopic(topic, ruleCount);
  for (const rule of rules) {
    engine.registerRule(rule);
  }
  return engine;
}

describe('RuleEngine Integration', () => {
  describe('throughput - events/sec with varying rule counts', () => {
    const targetTopic = 'order.created';

    bench('emit() throughput - 10 rules', async () => {
      const engine = await createEngineWithRules('throughput-10', targetTopic, 10);
      for (let i = 0; i < 50; i++) {
        await engine.emit(targetTopic, { orderId: `ORD-${i}`, total: 100 });
      }
      await engine.stop();
    });

    bench('emit() throughput - 100 rules', async () => {
      const engine = await createEngineWithRules('throughput-100', targetTopic, 100);
      for (let i = 0; i < 50; i++) {
        await engine.emit(targetTopic, { orderId: `ORD-${i}`, total: 100 });
      }
      await engine.stop();
    });

    bench('emit() throughput - 500 rules', async () => {
      const engine = await createEngineWithRules('throughput-500', targetTopic, 500);
      for (let i = 0; i < 20; i++) {
        await engine.emit(targetTopic, { orderId: `ORD-${i}`, total: 100 });
      }
      await engine.stop();
    });
  });

  describe('latency - emit to action execution', () => {
    bench('emit() -> action (no conditions)', async () => {
      const engine = await RuleEngine.start({ name: 'latency-simple' });
      engine.registerRule({
        name: 'simple-pass-through',
        trigger: { type: 'event', topic: 'latency.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'latency:result', value: { ref: 'event.data.value' } }
        ]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emit('latency.test', { value: i });
      }
      await engine.stop();
    });

    bench('emit() -> action (3 conditions, all pass)', async () => {
      const engine = await RuleEngine.start({ name: 'latency-conditions' });
      engine.registerRule({
        name: 'with-conditions',
        trigger: { type: 'event', topic: 'latency.conditional' },
        conditions: [
          { source: { type: 'event', field: 'data.amount' }, operator: 'gt', value: 50 },
          { source: { type: 'event', field: 'data.status' }, operator: 'eq', value: 'active' },
          { source: { type: 'event', field: 'data.priority' }, operator: 'in', value: ['high', 'critical'] }
        ],
        actions: [
          { type: 'set_fact', key: 'conditional:result', value: true }
        ]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emit('latency.conditional', {
          amount: 100,
          status: 'active',
          priority: 'high'
        });
      }
      await engine.stop();
    });

    bench('emit() -> action (3 conditions, first fails)', async () => {
      const engine = await RuleEngine.start({ name: 'latency-fail' });
      engine.registerRule({
        name: 'with-failing-conditions',
        trigger: { type: 'event', topic: 'latency.fail' },
        conditions: [
          { source: { type: 'event', field: 'data.amount' }, operator: 'gt', value: 50 },
          { source: { type: 'event', field: 'data.status' }, operator: 'eq', value: 'active' },
          { source: { type: 'event', field: 'data.priority' }, operator: 'in', value: ['high', 'critical'] }
        ],
        actions: [
          { type: 'set_fact', key: 'fail:result', value: true }
        ]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emit('latency.fail', {
          amount: 10,
          status: 'active',
          priority: 'high'
        });
      }
      await engine.stop();
    });
  });

  describe('forward chaining depth', () => {
    async function createChainEngine(depth: number): Promise<RuleEngine> {
      const engine = await RuleEngine.start({ name: `chain-${depth}` });
      for (let i = 0; i < depth; i++) {
        const isLast = i === depth - 1;
        engine.registerRule({
          name: `chain-rule-${i}`,
          trigger: { type: 'event', topic: i === 0 ? 'chain.start' : `chain.step_${i}` },
          conditions: [],
          actions: isLast
            ? [{ type: 'set_fact', key: 'chain:completed', value: depth }]
            : [{ type: 'emit_event', topic: `chain.step_${i + 1}`, data: { step: i + 1 } }]
        });
      }
      return engine;
    }

    bench('forward chain depth 1', async () => {
      const engine = await createChainEngine(1);
      for (let i = 0; i < 100; i++) {
        await engine.emit('chain.start', { iteration: i });
      }
      await engine.stop();
    });

    bench('forward chain depth 3', async () => {
      const engine = await createChainEngine(3);
      for (let i = 0; i < 100; i++) {
        await engine.emit('chain.start', { iteration: i });
      }
      await engine.stop();
    });

    bench('forward chain depth 5', async () => {
      const engine = await createChainEngine(5);
      for (let i = 0; i < 50; i++) {
        await engine.emit('chain.start', { iteration: i });
      }
      await engine.stop();
    });

    bench('forward chain depth 10', async () => {
      const engine = await createChainEngine(10);
      for (let i = 0; i < 30; i++) {
        await engine.emit('chain.start', { iteration: i });
      }
      await engine.stop();
    });
  });

  describe('maxConcurrency effectiveness', () => {
    const targetTopic = 'concurrency.test';
    const ruleCount = 100;

    async function createConcurrencyEngine(concurrency: number): Promise<RuleEngine> {
      const engine = await RuleEngine.start({
        name: `concurrency-${concurrency}`,
        maxConcurrency: concurrency
      });
      const rules = generateRulesForTopic(targetTopic, ruleCount);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      return engine;
    }

    bench('maxConcurrency=1 (100 rules)', async () => {
      const engine = await createConcurrencyEngine(1);
      for (let i = 0; i < 10; i++) {
        await engine.emit(targetTopic, { id: i, value: Math.random() });
      }
      await engine.stop();
    });

    bench('maxConcurrency=10 (100 rules)', async () => {
      const engine = await createConcurrencyEngine(10);
      for (let i = 0; i < 10; i++) {
        await engine.emit(targetTopic, { id: i, value: Math.random() });
      }
      await engine.stop();
    });

    bench('maxConcurrency=50 (100 rules)', async () => {
      const engine = await createConcurrencyEngine(50);
      for (let i = 0; i < 10; i++) {
        await engine.emit(targetTopic, { id: i, value: Math.random() });
      }
      await engine.stop();
    });
  });

  describe('mixed topic distribution', () => {
    const rulesPerTopic = 20;

    async function createMixedTopicEngine(): Promise<RuleEngine> {
      const engine = await RuleEngine.start({ name: 'mixed-topics' });
      for (const topic of TOPICS) {
        const rules = generateRulesForTopic(topic, rulesPerTopic);
        for (const rule of rules) {
          engine.registerRule(rule);
        }
      }
      return engine;
    }

    bench('emit to single hot topic', async () => {
      const engine = await createMixedTopicEngine();
      for (let i = 0; i < 50; i++) {
        await engine.emit('order.created', { orderId: `ORD-${i}`, amount: 100 });
      }
      await engine.stop();
    });

    bench('emit to multiple topics (round-robin)', async () => {
      const engine = await createMixedTopicEngine();
      for (let i = 0; i < 50; i++) {
        const topic = TOPICS[i % TOPICS.length];
        await engine.emit(topic, { id: i, value: Math.random() });
      }
      await engine.stop();
    });

    bench('emit to topic with no rules', async () => {
      const engine = await createMixedTopicEngine();
      for (let i = 0; i < 100; i++) {
        await engine.emit('unregistered.topic', { id: i });
      }
      await engine.stop();
    });
  });

  describe('fact-triggered rules', () => {
    async function createFactTriggeredEngine(): Promise<RuleEngine> {
      const engine = await RuleEngine.start({ name: 'fact-triggers' });
      for (let i = 0; i < 50; i++) {
        engine.registerRule({
          name: `fact-rule-${i}`,
          trigger: { type: 'fact', pattern: 'customer:*:status' },
          conditions: [
            { source: { type: 'fact', pattern: 'customer:*:status' }, operator: 'eq', value: 'premium' }
          ],
          actions: [
            { type: 'set_fact', key: `notification:${i}:sent`, value: true }
          ]
        });
      }
      return engine;
    }

    bench('setFact() triggering 50 rules (condition passes)', async () => {
      const engine = await createFactTriggeredEngine();
      for (let i = 0; i < 30; i++) {
        await engine.setFact(`customer:${i}:status`, 'premium');
      }
      await engine.stop();
    });

    bench('setFact() triggering 50 rules (condition fails)', async () => {
      const engine = await createFactTriggeredEngine();
      for (let i = 0; i < 30; i++) {
        await engine.setFact(`customer:${i}:status`, 'basic');
      }
      await engine.stop();
    });
  });

  describe('action complexity', () => {
    bench('single simple action', async () => {
      const engine = await RuleEngine.start({ name: 'single-action' });
      engine.registerRule({
        name: 'single-action-rule',
        trigger: { type: 'event', topic: 'action.single' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'single:result', value: true }
        ]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emit('action.single', { id: i });
      }
      await engine.stop();
    });

    bench('5 simple actions', async () => {
      const engine = await RuleEngine.start({ name: 'multi-action' });
      engine.registerRule({
        name: 'multi-action-rule',
        trigger: { type: 'event', topic: 'action.multi' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'multi:step1', value: 1 },
          { type: 'set_fact', key: 'multi:step2', value: 2 },
          { type: 'set_fact', key: 'multi:step3', value: 3 },
          { type: 'set_fact', key: 'multi:step4', value: 4 },
          { type: 'set_fact', key: 'multi:step5', value: 5 }
        ]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emit('action.multi', { id: i });
      }
      await engine.stop();
    });

    bench('3 complex actions with interpolation', async () => {
      const engine = await RuleEngine.start({ name: 'complex-action' });
      engine.registerRule({
        name: 'complex-action-rule',
        trigger: { type: 'event', topic: 'action.complex' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'complex:order:${event.data.orderId}:status', value: 'processed' },
          { type: 'emit_event', topic: 'order.processed', data: { orderId: { ref: 'event.data.orderId' } } },
          { type: 'log', level: 'info', message: 'Order ${event.data.orderId} processed' }
        ]
      });

      const originalLog = console.info;
      console.info = () => {};
      for (let i = 0; i < 100; i++) {
        await engine.emit('action.complex', { orderId: `ORD-${i}` });
      }
      console.info = originalLog;
      await engine.stop();
    });
  });

  describe('correlated events', () => {
    bench('emitCorrelated() - unique correlation IDs', async () => {
      const engine = await RuleEngine.start({ name: 'correlated-unique' });
      engine.registerRule({
        name: 'correlated-rule',
        trigger: { type: 'event', topic: 'correlation.test' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'correlated:processed', value: true }
        ]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emitCorrelated('correlation.test', { id: i }, `corr-${i}`);
      }
      await engine.stop();
    });

    bench('emitCorrelated() - shared correlation ID', async () => {
      const engine = await RuleEngine.start({ name: 'correlated-shared' });
      engine.registerRule({
        name: 'correlated-rule',
        trigger: { type: 'event', topic: 'correlation.shared' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'correlated:shared:processed', value: true }
        ]
      });

      const sharedCorrelationId = 'shared-correlation';
      for (let i = 0; i < 100; i++) {
        await engine.emitCorrelated('correlation.shared', { id: i }, sharedCorrelationId, `cause-${i}`);
      }
      await engine.stop();
    });
  });

  describe('subscription overhead', () => {
    bench('emit with 0 subscribers', async () => {
      const engine = await RuleEngine.start({ name: 'no-subs' });
      engine.registerRule({
        name: 'no-subs-rule',
        trigger: { type: 'event', topic: 'sub.test' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'sub:result', value: true }]
      });

      for (let i = 0; i < 100; i++) {
        await engine.emit('sub.test', { id: i });
      }
      await engine.stop();
    });

    bench('emit with 10 subscribers', async () => {
      const engine = await RuleEngine.start({ name: 'few-subs' });
      engine.registerRule({
        name: 'few-subs-rule',
        trigger: { type: 'event', topic: 'sub.test' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'sub:result', value: true }]
      });
      for (let i = 0; i < 10; i++) {
        engine.subscribe('sub.test', () => {});
      }

      for (let i = 0; i < 100; i++) {
        await engine.emit('sub.test', { id: i });
      }
      await engine.stop();
    });

    bench('emit with 50 subscribers', async () => {
      const engine = await RuleEngine.start({ name: 'many-subs' });
      engine.registerRule({
        name: 'many-subs-rule',
        trigger: { type: 'event', topic: 'sub.test' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'sub:result', value: true }]
      });
      for (let i = 0; i < 50; i++) {
        engine.subscribe('sub.test', () => {});
      }

      for (let i = 0; i < 100; i++) {
        await engine.emit('sub.test', { id: i });
      }
      await engine.stop();
    });

    bench('emit with wildcard subscribers', async () => {
      const engine = await RuleEngine.start({ name: 'wildcard-subs' });
      engine.registerRule({
        name: 'wildcard-subs-rule',
        trigger: { type: 'event', topic: 'sub.test' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'sub:result', value: true }]
      });
      for (let i = 0; i < 10; i++) {
        engine.subscribe('sub.*', () => {});
        engine.subscribe('*', () => {});
      }

      for (let i = 0; i < 100; i++) {
        await engine.emit('sub.test', { id: i });
      }
      await engine.stop();
    });
  });
});
