import { describe, it, expect, beforeEach } from 'vitest';
import { RuleManager } from '../../src/core/rule-manager.js';
import type { RuleInput } from '../../src/types/rule.js';
import type { RuleGroupInput } from '../../src/types/group.js';

function makeRule(overrides: Partial<RuleInput> & { id: string }): RuleInput {
  return {
    name: overrides.id,
    priority: 0,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'emit_event', topic: 'out', data: {} }],
    ...overrides,
  };
}

function makeGroup(overrides: Partial<RuleGroupInput> & { id: string }): RuleGroupInput {
  return {
    name: overrides.id,
    ...overrides,
  };
}

describe('RuleManager — groups', () => {
  let manager: RuleManager;

  beforeEach(async () => {
    manager = await RuleManager.start();
  });

  // ---------------------------------------------------------------------------
  // Group CRUD
  // ---------------------------------------------------------------------------

  describe('registerGroup', () => {
    it('creates a group with default enabled=true', () => {
      const group = manager.registerGroup(makeGroup({ id: 'billing' }));

      expect(group.id).toBe('billing');
      expect(group.name).toBe('billing');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');
      expect(group.updatedAt).toBeTypeOf('number');
    });

    it('respects explicit enabled=false', () => {
      const group = manager.registerGroup(makeGroup({ id: 'disabled', enabled: false }));
      expect(group.enabled).toBe(false);
    });

    it('preserves optional description', () => {
      const group = manager.registerGroup(makeGroup({ id: 'g', description: 'A group' }));
      expect(group.description).toBe('A group');
    });

    it('omits description when not provided', () => {
      const group = manager.registerGroup(makeGroup({ id: 'g' }));
      expect(group).not.toHaveProperty('description');
    });
  });

  describe('getGroup / getAllGroups', () => {
    it('retrieves a registered group by ID', () => {
      manager.registerGroup(makeGroup({ id: 'billing' }));
      const group = manager.getGroup('billing');
      expect(group).toBeDefined();
      expect(group!.id).toBe('billing');
    });

    it('returns undefined for unknown group', () => {
      expect(manager.getGroup('non-existent')).toBeUndefined();
    });

    it('lists all registered groups', () => {
      manager.registerGroup(makeGroup({ id: 'a' }));
      manager.registerGroup(makeGroup({ id: 'b' }));
      const groups = manager.getAllGroups();
      expect(groups).toHaveLength(2);
      expect(groups.map(g => g.id).sort()).toEqual(['a', 'b']);
    });

    it('returns empty array when no groups exist', () => {
      expect(manager.getAllGroups()).toEqual([]);
    });
  });

  describe('updateGroup', () => {
    it('updates name', () => {
      manager.registerGroup(makeGroup({ id: 'g', name: 'Old' }));
      const updated = manager.updateGroup('g', { name: 'New' });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New');
    });

    it('updates description', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      const updated = manager.updateGroup('g', { description: 'Updated desc' });
      expect(updated!.description).toBe('Updated desc');
    });

    it('updates enabled state', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      const updated = manager.updateGroup('g', { enabled: false });
      expect(updated!.enabled).toBe(false);
    });

    it('bumps updatedAt on update', () => {
      const group = manager.registerGroup(makeGroup({ id: 'g' }));
      const originalUpdatedAt = group.updatedAt;
      const updated = manager.updateGroup('g', { name: 'Changed' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

    it('returns undefined for unknown group', () => {
      expect(manager.updateGroup('unknown', { name: 'X' })).toBeUndefined();
    });
  });

  describe('enableGroup / disableGroup', () => {
    it('enables a disabled group', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      expect(manager.enableGroup('g')).toBe(true);
      expect(manager.getGroup('g')!.enabled).toBe(true);
    });

    it('disables an enabled group', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      expect(manager.disableGroup('g')).toBe(true);
      expect(manager.getGroup('g')!.enabled).toBe(false);
    });

    it('returns false for unknown group on enable', () => {
      expect(manager.enableGroup('unknown')).toBe(false);
    });

    it('returns false for unknown group on disable', () => {
      expect(manager.disableGroup('unknown')).toBe(false);
    });

    it('bumps updatedAt on enable', () => {
      const group = manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      const before = group.updatedAt;
      manager.enableGroup('g');
      expect(manager.getGroup('g')!.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('unregisterGroup', () => {
    it('deletes the group', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      expect(manager.unregisterGroup('g')).toBe(true);
      expect(manager.getGroup('g')).toBeUndefined();
    });

    it('returns false for unknown group', () => {
      expect(manager.unregisterGroup('unknown')).toBe(false);
    });

    it('clears group reference from assigned rules', () => {
      manager.registerGroup(makeGroup({ id: 'billing' }));
      manager.register(makeRule({ id: 'r1', group: 'billing' }));
      manager.register(makeRule({ id: 'r2', group: 'billing' }));

      manager.unregisterGroup('billing');

      expect(manager.get('r1')!).not.toHaveProperty('group');
      expect(manager.get('r2')!).not.toHaveProperty('group');
    });

    it('updates updatedAt on affected rules when deleting group', () => {
      manager.registerGroup(makeGroup({ id: 'billing' }));
      const rule = manager.register(makeRule({ id: 'r1', group: 'billing' }));
      const before = rule.updatedAt;

      manager.unregisterGroup('billing');

      expect(manager.get('r1')!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('clears byGroup index on delete', () => {
      manager.registerGroup(makeGroup({ id: 'billing' }));
      manager.register(makeRule({ id: 'r1', group: 'billing' }));

      manager.unregisterGroup('billing');

      expect(manager.getGroupRules('billing')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // isRuleActive
  // ---------------------------------------------------------------------------

  describe('isRuleActive', () => {
    it('returns true for enabled rule without group', () => {
      const rule = manager.register(makeRule({ id: 'r1' }));
      expect(manager.isRuleActive(rule)).toBe(true);
    });

    it('returns false for disabled rule without group', () => {
      const rule = manager.register(makeRule({ id: 'r1', enabled: false }));
      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns true for enabled rule in enabled group', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      const rule = manager.register(makeRule({ id: 'r1', group: 'g' }));
      expect(manager.isRuleActive(rule)).toBe(true);
    });

    it('returns false for enabled rule in disabled group', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      const rule = manager.register(makeRule({ id: 'r1', group: 'g' }));
      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns false for disabled rule in enabled group', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      const rule = manager.register(makeRule({ id: 'r1', enabled: false, group: 'g' }));
      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns false for disabled rule in disabled group', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      const rule = manager.register(makeRule({ id: 'r1', enabled: false, group: 'g' }));
      expect(manager.isRuleActive(rule)).toBe(false);
    });

    it('returns true for rule referencing non-existent group', () => {
      // Rule points to a group that was never created — treated as active
      const rule = manager.register(makeRule({ id: 'r1', group: 'ghost' }));
      expect(manager.isRuleActive(rule)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getBy* methods respect group state
  // ---------------------------------------------------------------------------

  describe('getByEventTopic respects group state', () => {
    it('includes rules from enabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'event', topic: 'order.created' } }));

      const rules = manager.getByEventTopic('order.created');
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r1');
    });

    it('excludes rules from disabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'event', topic: 'order.created' } }));

      expect(manager.getByEventTopic('order.created')).toHaveLength(0);
    });

    it('re-includes rules after group is re-enabled', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'event', topic: 'order.created' } }));

      manager.disableGroup('g');
      expect(manager.getByEventTopic('order.created')).toHaveLength(0);

      manager.enableGroup('g');
      expect(manager.getByEventTopic('order.created')).toHaveLength(1);
    });
  });

  describe('getByFactPattern respects group state', () => {
    it('excludes rules from disabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'fact', pattern: 'user.age' } }));

      expect(manager.getByFactPattern('user.age')).toHaveLength(0);
    });

    it('includes rules from enabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'fact', pattern: 'user.age' } }));

      expect(manager.getByFactPattern('user.age')).toHaveLength(1);
    });
  });

  describe('getByTimerName respects group state', () => {
    it('excludes rules from disabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'timer', name: 'payment-timeout' } }));

      expect(manager.getByTimerName('payment-timeout')).toHaveLength(0);
    });

    it('includes rules from enabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      manager.register(makeRule({ id: 'r1', group: 'g', trigger: { type: 'timer', name: 'payment-timeout' } }));

      expect(manager.getByTimerName('payment-timeout')).toHaveLength(1);
    });
  });

  describe('getTemporalRules respects group state', () => {
    it('excludes temporal rules from disabled groups', () => {
      manager.registerGroup(makeGroup({ id: 'g', enabled: false }));
      manager.register(makeRule({
        id: 'r1',
        group: 'g',
        trigger: {
          type: 'temporal',
          pattern: {
            type: 'sequence',
            events: [
              { topic: 'a' },
              { topic: 'b' },
            ],
            within: '5m',
          },
        },
      }));

      expect(manager.getTemporalRules()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // byGroup index
  // ---------------------------------------------------------------------------

  describe('getGroupRules (byGroup index)', () => {
    it('returns rules in a group', () => {
      manager.registerGroup(makeGroup({ id: 'billing' }));
      manager.register(makeRule({ id: 'r1', group: 'billing' }));
      manager.register(makeRule({ id: 'r2', group: 'billing' }));
      manager.register(makeRule({ id: 'r3' })); // ungrouped

      const rules = manager.getGroupRules('billing');
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('returns empty array for unknown group', () => {
      expect(manager.getGroupRules('non-existent')).toEqual([]);
    });

    it('removes rule from byGroup index on unregister', () => {
      manager.registerGroup(makeGroup({ id: 'g' }));
      manager.register(makeRule({ id: 'r1', group: 'g' }));
      manager.register(makeRule({ id: 'r2', group: 'g' }));

      manager.unregister('r1');

      const rules = manager.getGroupRules('g');
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  describe('persistence', () => {
    it('persists and restores groups', async () => {
      const saved: { rules: unknown[]; groups: unknown[] } = { rules: [], groups: [] };
      const mockPersistence = {
        save: async (rules: unknown[], groups: unknown[]) => {
          saved.rules = rules;
          saved.groups = groups ?? [];
        },
        load: async () => ({
          rules: saved.rules,
          groups: saved.groups,
        }),
        clear: async () => true,
        exists: async () => true,
        getKey: () => 'rules',
        getSchemaVersion: () => 1,
      };

      manager.setPersistence(mockPersistence as never);
      manager.registerGroup(makeGroup({ id: 'billing', name: 'Billing', description: 'Billing group' }));
      manager.register(makeRule({ id: 'r1', group: 'billing' }));

      await manager.persist();

      // Create a fresh manager and restore
      const fresh = await RuleManager.start();
      fresh.setPersistence(mockPersistence as never);
      const count = await fresh.restore();

      expect(count).toBe(1);
      expect(fresh.getGroup('billing')).toBeDefined();
      expect(fresh.getGroup('billing')!.name).toBe('Billing');
      expect(fresh.get('r1')!.group).toBe('billing');
      expect(fresh.getGroupRules('billing')).toHaveLength(1);
    });
  });
});
