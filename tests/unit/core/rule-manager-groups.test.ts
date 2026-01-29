import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleManager } from '../../../src/core/rule-manager';
import { RulePersistence } from '../../../src/persistence/rule-persistence';
import type { RuleInput } from '../../../src/types/rule';
import type { RuleGroupInput } from '../../../src/types/group';

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

const createGroupInput = (overrides: Partial<RuleGroupInput> = {}): RuleGroupInput => ({
  id: 'billing',
  name: 'Billing Rules',
  ...overrides
});

describe('RuleManager — groups', () => {
  let manager: RuleManager;

  beforeEach(() => {
    manager = new RuleManager();
  });

  describe('registerGroup()', () => {
    it('creates a group with auto-generated timestamps', () => {
      const group = manager.registerGroup(createGroupInput());

      expect(group.id).toBe('billing');
      expect(group.name).toBe('Billing Rules');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');
      expect(group.updatedAt).toBeTypeOf('number');
    });

    it('defaults enabled to true when not specified', () => {
      const group = manager.registerGroup(createGroupInput());

      expect(group.enabled).toBe(true);
    });

    it('respects explicit enabled: false', () => {
      const group = manager.registerGroup(createGroupInput({ enabled: false }));

      expect(group.enabled).toBe(false);
    });

    it('includes description when provided', () => {
      const group = manager.registerGroup(createGroupInput({
        description: 'All billing-related rules'
      }));

      expect(group.description).toBe('All billing-related rules');
    });

    it('omits description when not provided', () => {
      const group = manager.registerGroup(createGroupInput());

      expect(group).not.toHaveProperty('description');
    });

    it('makes the group retrievable', () => {
      manager.registerGroup(createGroupInput());

      const retrieved = manager.getGroup('billing');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Billing Rules');
    });
  });

  describe('unregisterGroup()', () => {
    it('removes an existing group and returns true', () => {
      manager.registerGroup(createGroupInput());

      const result = manager.unregisterGroup('billing');

      expect(result).toBe(true);
      expect(manager.getGroup('billing')).toBeUndefined();
    });

    it('returns false for non-existing group', () => {
      const result = manager.unregisterGroup('non-existing');

      expect(result).toBe(false);
    });

    it('clears group reference on assigned rules', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));
      manager.register(createEventRule({ id: 'r2', group: 'billing' }));

      manager.unregisterGroup('billing');

      expect(manager.get('r1')?.group).toBeUndefined();
      expect(manager.get('r2')?.group).toBeUndefined();
    });

    it('updates updatedAt on rules when clearing group reference', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));
      const originalUpdatedAt = manager.get('r1')!.updatedAt;

      const start = Date.now();
      while (Date.now() === start) { /* wait for timestamp to advance */ }

      manager.unregisterGroup('billing');

      expect(manager.get('r1')!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

    it('does not affect rules in other groups', () => {
      manager.registerGroup(createGroupInput({ id: 'billing', name: 'Billing' }));
      manager.registerGroup(createGroupInput({ id: 'shipping', name: 'Shipping' }));
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));
      manager.register(createEventRule({ id: 'r2', group: 'shipping' }));

      manager.unregisterGroup('billing');

      expect(manager.get('r1')?.group).toBeUndefined();
      expect(manager.get('r2')?.group).toBe('shipping');
    });

    it('clears byGroup index for the removed group', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));

      manager.unregisterGroup('billing');

      expect(manager.getGroupRules('billing')).toEqual([]);
    });
  });

  describe('enableGroup()', () => {
    it('enables a disabled group and returns true', () => {
      manager.registerGroup(createGroupInput({ enabled: false }));

      const result = manager.enableGroup('billing');

      expect(result).toBe(true);
      expect(manager.getGroup('billing')?.enabled).toBe(true);
    });

    it('returns false for non-existing group', () => {
      const result = manager.enableGroup('non-existing');

      expect(result).toBe(false);
    });

    it('updates the updatedAt timestamp', () => {
      manager.registerGroup(createGroupInput({ enabled: false }));
      const originalUpdatedAt = manager.getGroup('billing')!.updatedAt;

      const start = Date.now();
      while (Date.now() === start) { /* wait */ }

      manager.enableGroup('billing');

      expect(manager.getGroup('billing')!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('disableGroup()', () => {
    it('disables an enabled group and returns true', () => {
      manager.registerGroup(createGroupInput({ enabled: true }));

      const result = manager.disableGroup('billing');

      expect(result).toBe(true);
      expect(manager.getGroup('billing')?.enabled).toBe(false);
    });

    it('returns false for non-existing group', () => {
      const result = manager.disableGroup('non-existing');

      expect(result).toBe(false);
    });

    it('updates the updatedAt timestamp', () => {
      manager.registerGroup(createGroupInput());
      const originalUpdatedAt = manager.getGroup('billing')!.updatedAt;

      const start = Date.now();
      while (Date.now() === start) { /* wait */ }

      manager.disableGroup('billing');

      expect(manager.getGroup('billing')!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe('getGroup()', () => {
    it('returns group for existing id', () => {
      manager.registerGroup(createGroupInput());

      const group = manager.getGroup('billing');

      expect(group).toBeDefined();
      expect(group?.id).toBe('billing');
    });

    it('returns undefined for non-existing id', () => {
      const group = manager.getGroup('non-existing');

      expect(group).toBeUndefined();
    });
  });

  describe('getAllGroups()', () => {
    it('returns empty array when no groups exist', () => {
      expect(manager.getAllGroups()).toEqual([]);
    });

    it('returns all registered groups', () => {
      manager.registerGroup(createGroupInput({ id: 'billing', name: 'Billing' }));
      manager.registerGroup(createGroupInput({ id: 'shipping', name: 'Shipping' }));

      const groups = manager.getAllGroups();

      expect(groups).toHaveLength(2);
      expect(groups.map(g => g.id).sort()).toEqual(['billing', 'shipping']);
    });
  });

  describe('getGroupRules()', () => {
    it('returns rules in the specified group', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));
      manager.register(createEventRule({ id: 'r2', group: 'billing' }));

      const rules = manager.getGroupRules('billing');

      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('returns empty array for non-existing group', () => {
      expect(manager.getGroupRules('non-existing')).toEqual([]);
    });

    it('does not include rules from other groups', () => {
      manager.registerGroup(createGroupInput({ id: 'billing', name: 'Billing' }));
      manager.registerGroup(createGroupInput({ id: 'shipping', name: 'Shipping' }));
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));
      manager.register(createEventRule({ id: 'r2', group: 'shipping' }));

      const billingRules = manager.getGroupRules('billing');

      expect(billingRules).toHaveLength(1);
      expect(billingRules[0].id).toBe('r1');
    });

    it('reflects rule removal from the group', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));

      manager.unregister('r1');

      expect(manager.getGroupRules('billing')).toEqual([]);
    });
  });

  describe('isRuleActive()', () => {
    it('returns true for enabled rule without group', () => {
      const rule = manager.register(createEventRule({ enabled: true }));

      expect(manager.isRuleActive(rule)).toBe(true);
    });

    it('returns false for disabled rule without group', () => {
      const rule = manager.register(createEventRule({ enabled: false }));

      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns true for enabled rule in enabled group', () => {
      manager.registerGroup(createGroupInput({ enabled: true }));
      const rule = manager.register(createEventRule({ enabled: true, group: 'billing' }));

      expect(manager.isRuleActive(rule)).toBe(true);
    });

    it('returns false for enabled rule in disabled group', () => {
      manager.registerGroup(createGroupInput({ enabled: false }));
      const rule = manager.register(createEventRule({ enabled: true, group: 'billing' }));

      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns false for disabled rule in enabled group', () => {
      manager.registerGroup(createGroupInput({ enabled: true }));
      const rule = manager.register(createEventRule({ enabled: false, group: 'billing' }));

      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns false for disabled rule in disabled group', () => {
      manager.registerGroup(createGroupInput({ enabled: false }));
      const rule = manager.register(createEventRule({ enabled: false, group: 'billing' }));

      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns true for enabled rule with non-existent group reference', () => {
      const rule = manager.register(createEventRule({ enabled: true, group: 'unknown' }));

      expect(manager.isRuleActive(rule)).toBe(true);
    });
  });

  describe('getBy* methods respect group state', () => {
    beforeEach(() => {
      manager.registerGroup(createGroupInput({ id: 'billing', name: 'Billing' }));
    });

    it('getByEventTopic excludes rules in disabled group', () => {
      manager.register(createEventRule({ id: 'r1', group: 'billing', trigger: { type: 'event', topic: 'order.created' } }));
      manager.register(createEventRule({ id: 'r2', trigger: { type: 'event', topic: 'order.created' } }));

      manager.disableGroup('billing');

      const rules = manager.getByEventTopic('order.created');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('getByEventTopic includes rules after re-enabling group', () => {
      manager.register(createEventRule({ id: 'r1', group: 'billing', trigger: { type: 'event', topic: 'order.created' } }));

      manager.disableGroup('billing');
      expect(manager.getByEventTopic('order.created')).toHaveLength(0);

      manager.enableGroup('billing');
      expect(manager.getByEventTopic('order.created')).toHaveLength(1);
    });

    it('getByFactPattern excludes rules in disabled group', () => {
      manager.register(createFactRule({ id: 'r1', group: 'billing', trigger: { type: 'fact', pattern: 'customer:*:age' } }));
      manager.register(createFactRule({ id: 'r2', trigger: { type: 'fact', pattern: 'customer:*:age' } }));

      manager.disableGroup('billing');

      const rules = manager.getByFactPattern('customer:123:age');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('getByTimerName excludes rules in disabled group', () => {
      manager.register(createTimerRule({ id: 'r1', group: 'billing', trigger: { type: 'timer', name: 'reminder' } }));
      manager.register(createTimerRule({ id: 'r2', trigger: { type: 'timer', name: 'reminder' } }));

      manager.disableGroup('billing');

      const rules = manager.getByTimerName('reminder');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('getTemporalRules excludes rules in disabled group', () => {
      manager.register(createTemporalRule({ id: 't1', group: 'billing' }));
      manager.register(createTemporalRule({ id: 't2' }));

      manager.disableGroup('billing');

      const rules = manager.getTemporalRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('t2');
    });

    it('re-enabling group does not activate individually-disabled rules', () => {
      manager.register(createEventRule({ id: 'r1', group: 'billing', enabled: true, trigger: { type: 'event', topic: 'order.created' } }));
      manager.register(createEventRule({ id: 'r2', group: 'billing', enabled: false, trigger: { type: 'event', topic: 'order.created' } }));

      manager.disableGroup('billing');
      manager.enableGroup('billing');

      const rules = manager.getByEventTopic('order.created');

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r1');
    });
  });

  describe('byGroup index', () => {
    it('indexes rule by group during registration', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));

      expect(manager.getGroupRules('billing')).toHaveLength(1);
    });

    it('removes rule from group index on unregister', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));

      manager.unregister('r1');

      expect(manager.getGroupRules('billing')).toEqual([]);
    });

    it('handles multiple rules in the same group', () => {
      manager.registerGroup(createGroupInput());
      manager.register(createEventRule({ id: 'r1', group: 'billing' }));
      manager.register(createEventRule({ id: 'r2', group: 'billing' }));
      manager.register(createEventRule({ id: 'r3', group: 'billing' }));

      expect(manager.getGroupRules('billing')).toHaveLength(3);
    });

    it('does not index rules without group', () => {
      manager.register(createEventRule({ id: 'r1' }));

      expect(manager.getGroupRules('billing')).toEqual([]);
    });
  });

  describe('persistence scheduling', () => {
    let persistence: RulePersistence;

    beforeEach(() => {
      vi.useFakeTimers();
      persistence = new RulePersistence(new MemoryAdapter());
      manager.setPersistence(persistence);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules persist after registerGroup()', async () => {
      const saveSpy = vi.spyOn(persistence, 'save');

      manager.registerGroup(createGroupInput());

      await vi.advanceTimersByTimeAsync(20);

      expect(saveSpy).toHaveBeenCalled();
    });

    it('schedules persist after unregisterGroup()', async () => {
      manager.registerGroup(createGroupInput());
      await vi.advanceTimersByTimeAsync(20);

      const saveSpy = vi.spyOn(persistence, 'save');
      manager.unregisterGroup('billing');

      await vi.advanceTimersByTimeAsync(20);

      expect(saveSpy).toHaveBeenCalled();
    });

    it('schedules persist after enableGroup()', async () => {
      manager.registerGroup(createGroupInput({ enabled: false }));
      await vi.advanceTimersByTimeAsync(20);

      const saveSpy = vi.spyOn(persistence, 'save');
      manager.enableGroup('billing');

      await vi.advanceTimersByTimeAsync(20);

      expect(saveSpy).toHaveBeenCalled();
    });

    it('schedules persist after disableGroup()', async () => {
      manager.registerGroup(createGroupInput());
      await vi.advanceTimersByTimeAsync(20);

      const saveSpy = vi.spyOn(persistence, 'save');
      manager.disableGroup('billing');

      await vi.advanceTimersByTimeAsync(20);

      expect(saveSpy).toHaveBeenCalled();
    });
  });
});
