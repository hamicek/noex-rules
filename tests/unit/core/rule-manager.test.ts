import { describe, it, expect, beforeEach } from 'vitest';
import { RuleManager } from '../../../src/core/rule-manager';
import type { RuleInput } from '../../../src/types/rule';

const createFactRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  id: 'fact-rule-1',
  name: 'Fact Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'fact', pattern: 'customer:*:age' },
  conditions: [],
  actions: [],
  ...overrides
});

const createEventRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  id: 'event-rule-1',
  name: 'Event Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [],
  actions: [],
  ...overrides
});

const createTimerRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  id: 'timer-rule-1',
  name: 'Timer Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'timer', name: 'reminder' },
  conditions: [],
  actions: [],
  ...overrides
});

const createTemporalRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
  id: 'temporal-rule-1',
  name: 'Temporal Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'sequence',
      events: [{ topic: 'order.created' }, { topic: 'payment.received' }],
      within: '5m'
    }
  },
  conditions: [],
  actions: [],
  ...overrides
});

describe('RuleManager', () => {
  let manager: RuleManager;

  beforeEach(() => {
    manager = new RuleManager();
  });

  describe('static start()', () => {
    it('creates manager instance asynchronously', async () => {
      const asyncManager = await RuleManager.start();

      expect(asyncManager).toBeInstanceOf(RuleManager);
    });
  });

  describe('register()', () => {
    it('registers a rule and returns it with metadata', () => {
      const input = createFactRule();

      const rule = manager.register(input);

      expect(rule.id).toBe('fact-rule-1');
      expect(rule.name).toBe('Fact Rule');
      expect(rule.version).toBe(1);
      expect(rule.createdAt).toBeTypeOf('number');
      expect(rule.updatedAt).toBeTypeOf('number');
    });

    it('assigns incrementing versions to registered rules', () => {
      const rule1 = manager.register(createFactRule({ id: 'rule-1' }));
      const rule2 = manager.register(createFactRule({ id: 'rule-2' }));
      const rule3 = manager.register(createFactRule({ id: 'rule-3' }));

      expect(rule1.version).toBe(1);
      expect(rule2.version).toBe(2);
      expect(rule3.version).toBe(3);
    });

    it('stores the rule and makes it retrievable', () => {
      manager.register(createFactRule());

      const retrieved = manager.get('fact-rule-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Fact Rule');
    });

    it('indexes fact-triggered rules by pattern', () => {
      manager.register(createFactRule({ id: 'r1', trigger: { type: 'fact', pattern: 'user:*:email' } }));

      const rules = manager.getByFactPattern('user:123:email');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r1');
    });

    it('indexes event-triggered rules by topic', () => {
      manager.register(createEventRule({ id: 'r1', trigger: { type: 'event', topic: 'order.*' } }));

      const rules = manager.getByEventTopic('order.created');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r1');
    });

    it('indexes timer-triggered rules by name', () => {
      manager.register(createTimerRule({ id: 'r1', trigger: { type: 'timer', name: 'daily-cleanup' } }));

      const rules = manager.getByTimerName('daily-cleanup');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r1');
    });

    it('indexes temporal rules separately', () => {
      manager.register(createTemporalRule({ id: 'r1' }));

      const rules = manager.getTemporalRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r1');
    });
  });

  describe('unregister()', () => {
    it('removes an existing rule and returns true', () => {
      manager.register(createFactRule());

      const result = manager.unregister('fact-rule-1');

      expect(result).toBe(true);
      expect(manager.get('fact-rule-1')).toBeUndefined();
    });

    it('returns false for non-existing rule', () => {
      const result = manager.unregister('non-existing');

      expect(result).toBe(false);
    });

    it('removes rule from fact pattern index', () => {
      manager.register(createFactRule({ trigger: { type: 'fact', pattern: 'user:*:name' } }));
      manager.unregister('fact-rule-1');

      const rules = manager.getByFactPattern('user:123:name');

      expect(rules).toHaveLength(0);
    });

    it('removes rule from event topic index', () => {
      manager.register(createEventRule({ trigger: { type: 'event', topic: 'order.shipped' } }));
      manager.unregister('event-rule-1');

      const rules = manager.getByEventTopic('order.shipped');

      expect(rules).toHaveLength(0);
    });

    it('removes rule from timer name index', () => {
      manager.register(createTimerRule());
      manager.unregister('timer-rule-1');

      const rules = manager.getByTimerName('reminder');

      expect(rules).toHaveLength(0);
    });

    it('removes rule from temporal rules set', () => {
      manager.register(createTemporalRule());
      manager.unregister('temporal-rule-1');

      const rules = manager.getTemporalRules();

      expect(rules).toHaveLength(0);
    });

    it('decreases size after removal', () => {
      manager.register(createFactRule());
      expect(manager.size).toBe(1);

      manager.unregister('fact-rule-1');

      expect(manager.size).toBe(0);
    });
  });

  describe('enable()', () => {
    it('enables a disabled rule and returns true', () => {
      manager.register(createFactRule({ enabled: false }));

      const result = manager.enable('fact-rule-1');

      expect(result).toBe(true);
      expect(manager.get('fact-rule-1')?.enabled).toBe(true);
    });

    it('returns false for non-existing rule', () => {
      const result = manager.enable('non-existing');

      expect(result).toBe(false);
    });

    it('updates the updatedAt timestamp', () => {
      manager.register(createFactRule({ enabled: false }));
      const originalUpdatedAt = manager.get('fact-rule-1')!.updatedAt;

      // Small delay to ensure timestamp differs
      const start = Date.now();
      while (Date.now() === start) { /* wait */ }

      manager.enable('fact-rule-1');

      expect(manager.get('fact-rule-1')!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('disable()', () => {
    it('disables an enabled rule and returns true', () => {
      manager.register(createFactRule({ enabled: true }));

      const result = manager.disable('fact-rule-1');

      expect(result).toBe(true);
      expect(manager.get('fact-rule-1')?.enabled).toBe(false);
    });

    it('returns false for non-existing rule', () => {
      const result = manager.disable('non-existing');

      expect(result).toBe(false);
    });

    it('updates the updatedAt timestamp', () => {
      manager.register(createFactRule({ enabled: true }));
      const originalUpdatedAt = manager.get('fact-rule-1')!.updatedAt;

      const start = Date.now();
      while (Date.now() === start) { /* wait */ }

      manager.disable('fact-rule-1');

      expect(manager.get('fact-rule-1')!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('get()', () => {
    it('returns rule for existing id', () => {
      manager.register(createFactRule());

      const rule = manager.get('fact-rule-1');

      expect(rule).toBeDefined();
      expect(rule?.id).toBe('fact-rule-1');
    });

    it('returns undefined for non-existing id', () => {
      const rule = manager.get('non-existing');

      expect(rule).toBeUndefined();
    });
  });

  describe('getByFactPattern()', () => {
    beforeEach(() => {
      manager.register(createFactRule({ id: 'r1', priority: 50, trigger: { type: 'fact', pattern: 'customer:*:age' } }));
      manager.register(createFactRule({ id: 'r2', priority: 100, trigger: { type: 'fact', pattern: 'customer:*:*' } }));
      manager.register(createFactRule({ id: 'r3', priority: 75, trigger: { type: 'fact', pattern: 'order:*:status' } }));
    });

    it('returns rules matching exact pattern', () => {
      const rules = manager.getByFactPattern('customer:123:age');

      expect(rules.length).toBeGreaterThanOrEqual(1);
      expect(rules.some(r => r.id === 'r1')).toBe(true);
    });

    it('matches wildcard patterns', () => {
      const rules = manager.getByFactPattern('customer:456:name');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('returns empty array for no matches', () => {
      const rules = manager.getByFactPattern('product:789:price');

      expect(rules).toEqual([]);
    });

    it('excludes disabled rules', () => {
      manager.disable('r1');

      const rules = manager.getByFactPattern('customer:123:age');

      expect(rules.every(r => r.id !== 'r1')).toBe(true);
    });

    it('sorts rules by priority descending', () => {
      const rules = manager.getByFactPattern('customer:123:age');

      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });
  });

  describe('getByEventTopic()', () => {
    beforeEach(() => {
      manager.register(createEventRule({ id: 'r1', priority: 50, trigger: { type: 'event', topic: 'order.created' } }));
      manager.register(createEventRule({ id: 'r2', priority: 100, trigger: { type: 'event', topic: 'order.*' } }));
      manager.register(createEventRule({ id: 'r3', priority: 75, trigger: { type: 'event', topic: 'payment.received' } }));
    });

    it('returns rules matching exact topic', () => {
      const rules = manager.getByEventTopic('order.created');

      expect(rules.length).toBeGreaterThanOrEqual(1);
      expect(rules.some(r => r.id === 'r1')).toBe(true);
    });

    it('matches wildcard patterns', () => {
      const rules = manager.getByEventTopic('order.shipped');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('returns empty array for no matches', () => {
      const rules = manager.getByEventTopic('user.registered');

      expect(rules).toEqual([]);
    });

    it('excludes disabled rules', () => {
      manager.disable('r1');

      const rules = manager.getByEventTopic('order.created');

      expect(rules.every(r => r.id !== 'r1')).toBe(true);
    });

    it('sorts rules by priority descending', () => {
      const rules = manager.getByEventTopic('order.created');

      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });
  });

  describe('getByTimerName()', () => {
    beforeEach(() => {
      manager.register(createTimerRule({ id: 'r1', priority: 50, trigger: { type: 'timer', name: 'daily-report' } }));
      manager.register(createTimerRule({ id: 'r2', priority: 100, trigger: { type: 'timer', name: 'daily-report' } }));
      manager.register(createTimerRule({ id: 'r3', priority: 75, trigger: { type: 'timer', name: 'weekly-cleanup' } }));
    });

    it('returns rules for exact timer name', () => {
      const rules = manager.getByTimerName('daily-report');

      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('returns empty array for non-matching name', () => {
      const rules = manager.getByTimerName('monthly-backup');

      expect(rules).toEqual([]);
    });

    it('excludes disabled rules', () => {
      manager.disable('r1');

      const rules = manager.getByTimerName('daily-report');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('sorts rules by priority descending', () => {
      const rules = manager.getByTimerName('daily-report');

      expect(rules[0].priority).toBeGreaterThanOrEqual(rules[1].priority);
    });
  });

  describe('getTemporalRules()', () => {
    it('returns all enabled temporal rules', () => {
      manager.register(createTemporalRule({ id: 't1' }));
      manager.register(createTemporalRule({ id: 't2' }));
      manager.register(createFactRule({ id: 'f1' }));

      const rules = manager.getTemporalRules();

      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['t1', 't2']);
    });

    it('excludes disabled temporal rules', () => {
      manager.register(createTemporalRule({ id: 't1', enabled: true }));
      manager.register(createTemporalRule({ id: 't2', enabled: false }));

      const rules = manager.getTemporalRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('t1');
    });

    it('returns empty array when no temporal rules exist', () => {
      manager.register(createFactRule());

      const rules = manager.getTemporalRules();

      expect(rules).toEqual([]);
    });
  });

  describe('getAll()', () => {
    it('returns empty array for empty manager', () => {
      expect(manager.getAll()).toEqual([]);
    });

    it('returns all registered rules', () => {
      manager.register(createFactRule({ id: 'r1' }));
      manager.register(createEventRule({ id: 'r2' }));
      manager.register(createTimerRule({ id: 'r3' }));

      const all = manager.getAll();

      expect(all).toHaveLength(3);
      expect(all.map(r => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
    });

    it('includes both enabled and disabled rules', () => {
      manager.register(createFactRule({ id: 'r1', enabled: true }));
      manager.register(createFactRule({ id: 'r2', enabled: false }));

      const all = manager.getAll();

      expect(all).toHaveLength(2);
    });
  });

  describe('size property', () => {
    it('returns 0 for empty manager', () => {
      expect(manager.size).toBe(0);
    });

    it('returns correct count after registering rules', () => {
      manager.register(createFactRule({ id: 'r1' }));
      manager.register(createFactRule({ id: 'r2' }));

      expect(manager.size).toBe(2);
    });

    it('decreases after unregistering', () => {
      manager.register(createFactRule({ id: 'r1' }));
      manager.register(createFactRule({ id: 'r2' }));
      manager.unregister('r1');

      expect(manager.size).toBe(1);
    });
  });

  describe('tags indexing', () => {
    it('indexes rules by tags during registration', () => {
      manager.register(createFactRule({
        id: 'r1',
        tags: ['billing', 'critical']
      }));
      manager.register(createFactRule({
        id: 'r2',
        tags: ['billing', 'low-priority']
      }));

      const rule1 = manager.get('r1');
      const rule2 = manager.get('r2');

      expect(rule1?.tags).toContain('billing');
      expect(rule1?.tags).toContain('critical');
      expect(rule2?.tags).toContain('billing');
    });

    it('removes tags from index on unregister', () => {
      manager.register(createFactRule({
        id: 'r1',
        tags: ['test-tag']
      }));

      manager.unregister('r1');

      // Rule should be completely removed
      expect(manager.get('r1')).toBeUndefined();
    });
  });

  describe('priority sorting', () => {
    it('returns higher priority rules first for fact patterns', () => {
      manager.register(createFactRule({ id: 'low', priority: 10, trigger: { type: 'fact', pattern: 'test:*' } }));
      manager.register(createFactRule({ id: 'high', priority: 100, trigger: { type: 'fact', pattern: 'test:*' } }));
      manager.register(createFactRule({ id: 'medium', priority: 50, trigger: { type: 'fact', pattern: 'test:*' } }));

      const rules = manager.getByFactPattern('test:key');

      expect(rules[0].id).toBe('high');
      expect(rules[1].id).toBe('medium');
      expect(rules[2].id).toBe('low');
    });

    it('returns higher priority rules first for event topics', () => {
      manager.register(createEventRule({ id: 'low', priority: 10, trigger: { type: 'event', topic: 'test.*' } }));
      manager.register(createEventRule({ id: 'high', priority: 100, trigger: { type: 'event', topic: 'test.*' } }));
      manager.register(createEventRule({ id: 'medium', priority: 50, trigger: { type: 'event', topic: 'test.*' } }));

      const rules = manager.getByEventTopic('test.event');

      expect(rules[0].id).toBe('high');
      expect(rules[1].id).toBe('medium');
      expect(rules[2].id).toBe('low');
    });

    it('returns higher priority rules first for timer names', () => {
      manager.register(createTimerRule({ id: 'low', priority: 10, trigger: { type: 'timer', name: 'test-timer' } }));
      manager.register(createTimerRule({ id: 'high', priority: 100, trigger: { type: 'timer', name: 'test-timer' } }));
      manager.register(createTimerRule({ id: 'medium', priority: 50, trigger: { type: 'timer', name: 'test-timer' } }));

      const rules = manager.getByTimerName('test-timer');

      expect(rules[0].id).toBe('high');
      expect(rules[1].id).toBe('medium');
      expect(rules[2].id).toBe('low');
    });
  });

  describe('wildcard matching in indexes', () => {
    describe('fact patterns', () => {
      it('matches single wildcard segment', () => {
        manager.register(createFactRule({ id: 'r1', trigger: { type: 'fact', pattern: 'user:*:email' } }));

        expect(manager.getByFactPattern('user:123:email')).toHaveLength(1);
        expect(manager.getByFactPattern('user:abc:email')).toHaveLength(1);
        expect(manager.getByFactPattern('user:123:name')).toHaveLength(0);
      });

      it('matches multiple wildcard segments', () => {
        manager.register(createFactRule({ id: 'r1', trigger: { type: 'fact', pattern: '*:*:status' } }));

        expect(manager.getByFactPattern('order:123:status')).toHaveLength(1);
        expect(manager.getByFactPattern('customer:abc:status')).toHaveLength(1);
        expect(manager.getByFactPattern('order:123:total')).toHaveLength(0);
      });

      it('matches trailing wildcard', () => {
        manager.register(createFactRule({ id: 'r1', trigger: { type: 'fact', pattern: 'config:*' } }));

        expect(manager.getByFactPattern('config:theme')).toHaveLength(1);
        expect(manager.getByFactPattern('config:language')).toHaveLength(1);
        expect(manager.getByFactPattern('settings:theme')).toHaveLength(0);
      });
    });

    describe('event topics', () => {
      it('matches single wildcard segment', () => {
        manager.register(createEventRule({ id: 'r1', trigger: { type: 'event', topic: 'order.*' } }));

        expect(manager.getByEventTopic('order.created')).toHaveLength(1);
        expect(manager.getByEventTopic('order.shipped')).toHaveLength(1);
        expect(manager.getByEventTopic('payment.received')).toHaveLength(0);
      });

      it('matches leading wildcard', () => {
        manager.register(createEventRule({ id: 'r1', trigger: { type: 'event', topic: '*.created' } }));

        expect(manager.getByEventTopic('order.created')).toHaveLength(1);
        expect(manager.getByEventTopic('user.created')).toHaveLength(1);
        expect(manager.getByEventTopic('order.shipped')).toHaveLength(0);
      });

      it('matches wildcard in middle segment', () => {
        manager.register(createEventRule({ id: 'r1', trigger: { type: 'event', topic: 'order.*.completed' } }));

        expect(manager.getByEventTopic('order.123.completed')).toHaveLength(1);
        expect(manager.getByEventTopic('order.abc.completed')).toHaveLength(1);
        expect(manager.getByEventTopic('order.123.pending')).toHaveLength(0);
      });
    });
  });
});
