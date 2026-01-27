import { bench, describe } from 'vitest';
import { RuleEngine } from '../../../src/core/rule-engine.js';
import {
  generateRules,
  generateRulesForTopic,
  generateRulesWithVaryingComplexity
} from '../fixtures/index.js';

describe('RuleEngine Scalability', () => {
  describe('rule count scalability (10 -> 10,000 rules)', () => {
    const targetTopic = 'scalability.test';

    bench('10 rules - single emit', async () => {
      const engine = await RuleEngine.start({ name: 'scale-10' });
      const rules = generateRulesForTopic(targetTopic, 10);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.emit(targetTopic, { id: 1, value: 100 });
      await engine.stop();
    });

    bench('100 rules - single emit', async () => {
      const engine = await RuleEngine.start({ name: 'scale-100' });
      const rules = generateRulesForTopic(targetTopic, 100);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.emit(targetTopic, { id: 1, value: 100 });
      await engine.stop();
    });

    bench('1,000 rules - single emit', async () => {
      const engine = await RuleEngine.start({ name: 'scale-1000' });
      const rules = generateRulesForTopic(targetTopic, 1000);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.emit(targetTopic, { id: 1, value: 100 });
      await engine.stop();
    });

    bench('5,000 rules - single emit', async () => {
      const engine = await RuleEngine.start({ name: 'scale-5000' });
      const rules = generateRulesForTopic(targetTopic, 5000);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.emit(targetTopic, { id: 1, value: 100 });
      await engine.stop();
    });
  });

  describe('condition complexity scalability', () => {
    bench('1 condition per rule (10 rules)', async () => {
      const engine = await RuleEngine.start({ name: 'cond-1' });
      const rules = generateRulesWithVaryingComplexity(10, 1, 1);
      for (const rule of rules) {
        engine.registerRule({
          ...rule,
          trigger: { type: 'event', topic: 'complexity.test' }
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('complexity.test', { id: i, status: 'active' });
      }
      await engine.stop();
    });

    bench('5 conditions per rule (10 rules)', async () => {
      const engine = await RuleEngine.start({ name: 'cond-5' });
      const rules = generateRulesWithVaryingComplexity(10, 5, 5);
      for (const rule of rules) {
        engine.registerRule({
          ...rule,
          trigger: { type: 'event', topic: 'complexity.test' }
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('complexity.test', { id: i, status: 'active' });
      }
      await engine.stop();
    });

    bench('10 conditions per rule (10 rules)', async () => {
      const engine = await RuleEngine.start({ name: 'cond-10' });
      const rules = generateRulesWithVaryingComplexity(10, 10, 10);
      for (const rule of rules) {
        engine.registerRule({
          ...rule,
          trigger: { type: 'event', topic: 'complexity.test' }
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('complexity.test', { id: i, status: 'active' });
      }
      await engine.stop();
    });

    bench('20 conditions per rule (10 rules)', async () => {
      const engine = await RuleEngine.start({ name: 'cond-20' });
      const rules = generateRulesWithVaryingComplexity(10, 20, 20);
      for (const rule of rules) {
        engine.registerRule({
          ...rule,
          trigger: { type: 'event', topic: 'complexity.test' }
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('complexity.test', { id: i, status: 'active' });
      }
      await engine.stop();
    });
  });

  describe('fact store scalability under load', () => {
    bench('emit with 100 pre-existing facts', async () => {
      const engine = await RuleEngine.start({ name: 'facts-100' });
      for (let i = 0; i < 100; i++) {
        await engine.setFact(`preload:${i}:data`, { index: i, value: Math.random() });
      }
      engine.registerRule({
        name: 'fact-query-rule',
        trigger: { type: 'event', topic: 'fact.query' },
        conditions: [
          { source: { type: 'fact', pattern: 'preload:50:data' }, operator: 'exists', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'query:result', value: true }
        ]
      });
      for (let i = 0; i < 50; i++) {
        await engine.emit('fact.query', { index: i });
      }
      await engine.stop();
    });

    bench('emit with 1,000 pre-existing facts', async () => {
      const engine = await RuleEngine.start({ name: 'facts-1000' });
      for (let i = 0; i < 1000; i++) {
        await engine.setFact(`preload:${i}:data`, { index: i, value: Math.random() });
      }
      engine.registerRule({
        name: 'fact-query-rule',
        trigger: { type: 'event', topic: 'fact.query' },
        conditions: [
          { source: { type: 'fact', pattern: 'preload:500:data' }, operator: 'exists', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'query:result', value: true }
        ]
      });
      for (let i = 0; i < 50; i++) {
        await engine.emit('fact.query', { index: i });
      }
      await engine.stop();
    });

    bench('emit with 10,000 pre-existing facts', async () => {
      const engine = await RuleEngine.start({ name: 'facts-10000' });
      for (let i = 0; i < 10000; i++) {
        await engine.setFact(`preload:${i}:data`, { index: i, value: Math.random() });
      }
      engine.registerRule({
        name: 'fact-query-rule',
        trigger: { type: 'event', topic: 'fact.query' },
        conditions: [
          { source: { type: 'fact', pattern: 'preload:5000:data' }, operator: 'exists', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'query:result', value: true }
        ]
      });
      for (let i = 0; i < 30; i++) {
        await engine.emit('fact.query', { index: i });
      }
      await engine.stop();
    });
  });

  describe('parallel event processing', () => {
    bench('sequential emit (50 events)', async () => {
      const engine = await RuleEngine.start({ name: 'seq-emit', maxConcurrency: 50 });
      for (let i = 0; i < 50; i++) {
        engine.registerRule({
          name: `parallel-rule-${i}`,
          trigger: { type: 'event', topic: 'parallel.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `parallel:${i}:result`, value: true }]
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('parallel.test', { seq: i });
      }
      await engine.stop();
    });

    bench('parallel emit batch (10 concurrent)', async () => {
      const engine = await RuleEngine.start({ name: 'par-10', maxConcurrency: 50 });
      for (let i = 0; i < 50; i++) {
        engine.registerRule({
          name: `parallel-rule-${i}`,
          trigger: { type: 'event', topic: 'parallel.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `parallel:${i}:result`, value: true }]
        });
      }
      const batch = [];
      for (let i = 0; i < 10; i++) {
        batch.push(engine.emit('parallel.test', { batch: i }));
      }
      await Promise.all(batch);
      await engine.stop();
    });

    bench('parallel emit batch (50 concurrent)', async () => {
      const engine = await RuleEngine.start({ name: 'par-50', maxConcurrency: 50 });
      for (let i = 0; i < 50; i++) {
        engine.registerRule({
          name: `parallel-rule-${i}`,
          trigger: { type: 'event', topic: 'parallel.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `parallel:${i}:result`, value: true }]
        });
      }
      const batch = [];
      for (let i = 0; i < 50; i++) {
        batch.push(engine.emit('parallel.test', { batch: i }));
      }
      await Promise.all(batch);
      await engine.stop();
    });
  });

  describe('rule registration scalability', () => {
    bench('register 100 rules', async () => {
      const engine = await RuleEngine.start({ name: 'reg-100' });
      const rules = generateRules(100);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.stop();
    });

    bench('register 500 rules', async () => {
      const engine = await RuleEngine.start({ name: 'reg-500' });
      const rules = generateRules(500);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.stop();
    });

    bench('register 1,000 rules', async () => {
      const engine = await RuleEngine.start({ name: 'reg-1000' });
      const rules = generateRules(1000);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.stop();
    });

    bench('register 5,000 rules', async () => {
      const engine = await RuleEngine.start({ name: 'reg-5000' });
      const rules = generateRules(5000);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.stop();
    });
  });

  describe('engine lifecycle', () => {
    bench('start() -> stop() (empty engine)', async () => {
      const engine = await RuleEngine.start({ name: 'lifecycle-empty' });
      await engine.stop();
    });

    bench('start() -> register 100 rules -> stop()', async () => {
      const engine = await RuleEngine.start({ name: 'lifecycle-100' });
      const rules = generateRules(100);
      for (const rule of rules) {
        engine.registerRule(rule);
      }
      await engine.stop();
    });

    bench('start() -> 500 facts -> stop()', async () => {
      const engine = await RuleEngine.start({ name: 'lifecycle-facts' });
      for (let i = 0; i < 500; i++) {
        await engine.setFact(`lifecycle:${i}:data`, { index: i });
      }
      await engine.stop();
    });
  });

  describe('mixed workload simulation', () => {
    bench('realistic workload - 50 events across 10 topics', async () => {
      const engine = await RuleEngine.start({ name: 'mixed-workload', maxConcurrency: 25 });
      for (let i = 0; i < 100; i++) {
        engine.registerRule({
          name: `workload-rule-${i}`,
          trigger: { type: 'event', topic: `workload.topic_${i % 10}` },
          conditions: i % 3 === 0
            ? [{ source: { type: 'event', field: 'data.value' }, operator: 'gt', value: 50 }]
            : [],
          actions: [
            { type: 'set_fact', key: `workload:${i}:processed`, value: true }
          ]
        });
      }
      for (let i = 0; i < 500; i++) {
        await engine.setFact(`workload:initial:${i}`, { data: i });
      }
      for (let i = 0; i < 50; i++) {
        const topicIndex = i % 10;
        await engine.emit(`workload.topic_${topicIndex}`, {
          id: i,
          value: Math.random() * 100
        });
      }
      await engine.stop();
    });

    bench('realistic workload - mixed emit + setFact', async () => {
      const engine = await RuleEngine.start({ name: 'mixed-emit-fact', maxConcurrency: 25 });
      for (let i = 0; i < 50; i++) {
        engine.registerRule({
          name: `mixed-rule-${i}`,
          trigger: { type: 'event', topic: `mixed.topic_${i % 5}` },
          conditions: [],
          actions: [
            { type: 'set_fact', key: `mixed:${i}:processed`, value: true }
          ]
        });
      }
      for (let i = 0; i < 30; i++) {
        await engine.emit(`mixed.topic_${i % 5}`, { id: i, value: 75 });
        await engine.setFact(`mixed:dynamic:${i}`, { updated: true });
      }
      await engine.stop();
    });
  });

  describe('stats collection overhead', () => {
    bench('emit without getStats()', async () => {
      const engine = await RuleEngine.start({ name: 'stats-no' });
      for (let i = 0; i < 30; i++) {
        engine.registerRule({
          name: `stats-rule-${i}`,
          trigger: { type: 'event', topic: 'stats.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `stats:${i}`, value: true }]
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('stats.test', { id: i });
      }
      await engine.stop();
    });

    bench('emit with getStats() each iteration', async () => {
      const engine = await RuleEngine.start({ name: 'stats-yes' });
      for (let i = 0; i < 30; i++) {
        engine.registerRule({
          name: `stats-rule-${i}`,
          trigger: { type: 'event', topic: 'stats.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `stats:${i}`, value: true }]
        });
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('stats.test', { id: i });
        engine.getStats();
      }
      await engine.stop();
    });
  });

  describe('rule enable/disable overhead', () => {
    bench('emit with all rules enabled', async () => {
      const engine = await RuleEngine.start({ name: 'toggle-all' });
      const ruleIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const rule = engine.registerRule({
          name: `toggle-rule-${i}`,
          trigger: { type: 'event', topic: 'toggle.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `toggle:${i}`, value: true }]
        });
        ruleIds.push(rule.id);
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('toggle.test', { id: i });
      }
      await engine.stop();
    });

    bench('emit with 50% rules disabled', async () => {
      const engine = await RuleEngine.start({ name: 'toggle-half' });
      const ruleIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const rule = engine.registerRule({
          name: `toggle-rule-${i}`,
          trigger: { type: 'event', topic: 'toggle.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `toggle:${i}`, value: true }]
        });
        ruleIds.push(rule.id);
      }
      for (let i = 0; i < ruleIds.length; i += 2) {
        engine.disableRule(ruleIds[i]);
      }
      for (let i = 0; i < 50; i++) {
        await engine.emit('toggle.test', { id: i });
      }
      await engine.stop();
    });

    bench('toggle rules rapidly (enable/disable cycle)', async () => {
      const engine = await RuleEngine.start({ name: 'toggle-rapid' });
      const ruleIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const rule = engine.registerRule({
          name: `toggle-rule-${i}`,
          trigger: { type: 'event', topic: 'toggle.test' },
          conditions: [],
          actions: [{ type: 'set_fact', key: `toggle:${i}`, value: true }]
        });
        ruleIds.push(rule.id);
      }
      for (let i = 0; i < 100; i++) {
        const ruleId = ruleIds[i % ruleIds.length];
        engine.disableRule(ruleId);
        engine.enableRule(ruleId);
      }
      await engine.stop();
    });
  });

  describe('unregister rules under load', () => {
    bench('unregister 100 rules', async () => {
      const engine = await RuleEngine.start({ name: 'unreg-100' });
      const rules = generateRules(100);
      const ids: string[] = [];
      for (const rule of rules) {
        const registered = engine.registerRule(rule);
        ids.push(registered.id);
      }
      for (const id of ids) {
        engine.unregisterRule(id);
      }
      await engine.stop();
    });

    bench('unregister 500 rules', async () => {
      const engine = await RuleEngine.start({ name: 'unreg-500' });
      const rules = generateRules(500);
      const ids: string[] = [];
      for (const rule of rules) {
        const registered = engine.registerRule(rule);
        ids.push(registered.id);
      }
      for (const id of ids) {
        engine.unregisterRule(id);
      }
      await engine.stop();
    });
  });
});
