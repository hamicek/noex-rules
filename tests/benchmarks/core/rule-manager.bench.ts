import { bench, describe } from 'vitest';
import { RuleManager } from '../../../src/core/rule-manager.js';
import {
  generateRules,
  generateRulesWithMixedTriggers,
  generateRulesForTopic,
  generateRulesForFactPattern,
  TOPICS,
  FACT_PATTERNS
} from '../fixtures/index.js';

describe('RuleManager', () => {
  describe('register() - rule registration', () => {
    bench('register() - 100 event trigger rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(100, { triggerType: 'event' });
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register() - 100 fact trigger rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(100, { triggerType: 'fact' });
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register() - 100 timer trigger rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(100, { triggerType: 'timer' });
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register() - 100 temporal trigger rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(100, { triggerType: 'temporal' });
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register() - 100 mixed trigger rules', () => {
      const manager = new RuleManager();
      const rules = generateRulesWithMixedTriggers(100);
      for (const rule of rules) {
        manager.register(rule);
      }
    });
  });

  describe('unregister() - rule removal', () => {
    bench('unregister() - 100 rules from 1000', () => {
      const manager = new RuleManager();
      const rules = generateRules(1000);
      for (const rule of rules) {
        manager.register(rule);
      }
      for (let i = 0; i < 100; i++) {
        manager.unregister(rules[i].id);
      }
    });

    bench('unregister() - non-existing rules', () => {
      const manager = new RuleManager();
      for (let i = 0; i < 100; i++) {
        manager.unregister(`non_existing_rule_${i}`);
      }
    });
  });

  describe('getByEventTopic() - topic lookup', () => {
    const manager = new RuleManager();
    const rules = generateRulesWithMixedTriggers(5000);
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('getByEventTopic() - random topic (5k rules)', () => {
      for (let i = 0; i < 10; i++) {
        const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
        manager.getByEventTopic(topic);
      }
    });

    bench('getByEventTopic() - order.created (5k rules)', () => {
      for (let i = 0; i < 10; i++) {
        manager.getByEventTopic('order.created');
      }
    });

    bench('getByEventTopic() - non-matching topic', () => {
      for (let i = 0; i < 10; i++) {
        manager.getByEventTopic('non.existing.topic');
      }
    });
  });

  describe('getByFactPattern() - fact pattern lookup', () => {
    const manager = new RuleManager();
    const rules = generateRulesWithMixedTriggers(5000);
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('getByFactPattern() - wildcard match (5k rules)', () => {
      for (let i = 0; i < 10; i++) {
        const pattern = FACT_PATTERNS[Math.floor(Math.random() * FACT_PATTERNS.length)];
        const key = pattern.replace('*', `test_${i}`);
        manager.getByFactPattern(key);
      }
    });

    bench('getByFactPattern() - customer:123:status (5k rules)', () => {
      for (let i = 0; i < 10; i++) {
        manager.getByFactPattern('customer:123:status');
      }
    });

    bench('getByFactPattern() - non-matching pattern', () => {
      for (let i = 0; i < 10; i++) {
        manager.getByFactPattern(`non:existing:pattern:${i}`);
      }
    });
  });

  describe('getByTimerName() - timer lookup', () => {
    const manager = new RuleManager();
    const rules = generateRules(1000, { triggerType: 'timer' });
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('getByTimerName() - exact match (1k timer rules)', () => {
      for (let i = 0; i < 10; i++) {
        manager.getByTimerName(`scheduled_timer_${i * 10}`);
      }
    });

    bench('getByTimerName() - non-matching', () => {
      for (let i = 0; i < 10; i++) {
        manager.getByTimerName(`non_existing_timer_${i}`);
      }
    });
  });

  describe('enable/disable - state management', () => {
    const manager = new RuleManager();
    const rules = generateRules(1000);
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('disable() - 100 rules', () => {
      for (let i = 0; i < 100; i++) {
        manager.disable(rules[i].id);
      }
    });

    bench('enable() - 100 rules', () => {
      for (let i = 0; i < 100; i++) {
        manager.enable(rules[i].id);
      }
    });
  });

  describe('getTemporalRules() - temporal pattern queries', () => {
    const manager = new RuleManager();
    const rules = generateRules(500, { triggerType: 'temporal' });
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('getTemporalRules() - 500 temporal rules', () => {
      manager.getTemporalRules();
    });
  });

  describe('scalability - varying rule counts', () => {
    const scales = [10, 100, 1000, 5000] as const;
    const managers = new Map<number, RuleManager>();

    for (const scale of scales) {
      const manager = new RuleManager();
      const rules = generateRulesWithMixedTriggers(scale);
      for (const rule of rules) {
        manager.register(rule);
      }
      managers.set(scale, manager);
    }

    bench('getByEventTopic() - 10 rules', () => {
      for (let i = 0; i < 10; i++) {
        managers.get(10)!.getByEventTopic('order.created');
      }
    });

    bench('getByEventTopic() - 100 rules', () => {
      for (let i = 0; i < 10; i++) {
        managers.get(100)!.getByEventTopic('order.created');
      }
    });

    bench('getByEventTopic() - 1,000 rules', () => {
      for (let i = 0; i < 10; i++) {
        managers.get(1000)!.getByEventTopic('order.created');
      }
    });

    bench('getByEventTopic() - 5,000 rules', () => {
      for (let i = 0; i < 10; i++) {
        managers.get(5000)!.getByEventTopic('order.created');
      }
    });

    bench('getAll() - 10 rules', () => {
      managers.get(10)!.getAll();
    });

    bench('getAll() - 100 rules', () => {
      managers.get(100)!.getAll();
    });

    bench('getAll() - 1,000 rules', () => {
      managers.get(1000)!.getAll();
    });

    bench('getAll() - 5,000 rules', () => {
      managers.get(5000)!.getAll();
    });
  });

  describe('bulk registration scalability', () => {
    bench('register 100 rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(100);
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register 500 rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(500);
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register 1,000 rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(1000);
      for (const rule of rules) {
        manager.register(rule);
      }
    });

    bench('register 5,000 rules', () => {
      const manager = new RuleManager();
      const rules = generateRules(5000);
      for (const rule of rules) {
        manager.register(rule);
      }
    });
  });

  describe('topic concentration - many rules per topic', () => {
    const manager = new RuleManager();
    const rules = generateRulesForTopic('order.created', 1000);
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('getByEventTopic() - 1,000 rules on same topic', () => {
      manager.getByEventTopic('order.created');
    });
  });

  describe('fact pattern concentration - many rules per pattern', () => {
    const manager = new RuleManager();
    const rules = generateRulesForFactPattern('customer:*:status', 1000);
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('getByFactPattern() - 1,000 rules on same pattern', () => {
      manager.getByFactPattern('customer:test_user:status');
    });
  });

  describe('mixed operations workload', () => {
    bench('90% read / 10% write simulation (2k rules)', () => {
      const manager = new RuleManager();
      const rules = generateRulesWithMixedTriggers(2000);
      for (const rule of rules) {
        manager.register(rule);
      }
      for (let i = 0; i < 100; i++) {
        const op = i % 10;
        if (op < 9) {
          manager.getByEventTopic('order.created');
        } else {
          const ruleId = rules[i % rules.length].id;
          if (i % 2 === 0) {
            manager.disable(ruleId);
          } else {
            manager.enable(ruleId);
          }
        }
      }
    });
  });

  describe('get() - single rule retrieval', () => {
    const manager = new RuleManager();
    const rules = generateRules(5000);
    for (const rule of rules) {
      manager.register(rule);
    }

    bench('get() - existing rule (5k rules)', () => {
      for (let i = 0; i < 100; i++) {
        manager.get(rules[Math.floor(Math.random() * rules.length)].id);
      }
    });

    bench('get() - non-existing rule', () => {
      for (let i = 0; i < 100; i++) {
        manager.get(`non_existing_${i}`);
      }
    });
  });
});
