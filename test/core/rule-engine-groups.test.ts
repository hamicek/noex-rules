import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngine } from '../../src/core/rule-engine.js';
import { RuleValidationError } from '../../src/validation/rule-validation-error.js';
import { MemoryAdapter } from '@hamicek/noex';
import type { RuleInput } from '../../src/types/rule.js';

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

describe('RuleEngine — groups', () => {
  let engine: RuleEngine;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'test-groups' });
  });

  afterEach(async () => {
    await engine.stop();
  });

  // ---------------------------------------------------------------------------
  // createGroup
  // ---------------------------------------------------------------------------

  describe('createGroup', () => {
    it('creates a group with defaults', () => {
      const group = engine.createGroup({ id: 'billing', name: 'Billing Rules' });

      expect(group.id).toBe('billing');
      expect(group.name).toBe('Billing Rules');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');
      expect(group.updatedAt).toBeTypeOf('number');
    });

    it('creates a group with explicit enabled=false', () => {
      const group = engine.createGroup({ id: 'g', name: 'G', enabled: false });
      expect(group.enabled).toBe(false);
    });

    it('throws on duplicate group ID', () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });

      expect(() => {
        engine.createGroup({ id: 'billing', name: 'Billing 2' });
      }).toThrow(RuleValidationError);
    });

    it('includes description when provided', () => {
      const group = engine.createGroup({ id: 'g', name: 'G', description: 'Desc' });
      expect(group.description).toBe('Desc');
    });
  });

  // ---------------------------------------------------------------------------
  // deleteGroup
  // ---------------------------------------------------------------------------

  describe('deleteGroup', () => {
    it('deletes an existing group', () => {
      engine.createGroup({ id: 'g', name: 'G' });
      expect(engine.deleteGroup('g')).toBe(true);
      expect(engine.getGroup('g')).toBeUndefined();
    });

    it('returns false for unknown group', () => {
      expect(engine.deleteGroup('unknown')).toBe(false);
    });

    it('clears group reference from rules', () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });
      engine.registerRule(makeRule({ id: 'r1', group: 'billing' }));

      engine.deleteGroup('billing');

      expect(engine.getRule('r1')!).not.toHaveProperty('group');
    });
  });

  // ---------------------------------------------------------------------------
  // enableGroup / disableGroup
  // ---------------------------------------------------------------------------

  describe('enableGroup / disableGroup', () => {
    it('disables a group', () => {
      engine.createGroup({ id: 'g', name: 'G' });
      expect(engine.disableGroup('g')).toBe(true);
      expect(engine.getGroup('g')!.enabled).toBe(false);
    });

    it('enables a disabled group', () => {
      engine.createGroup({ id: 'g', name: 'G', enabled: false });
      expect(engine.enableGroup('g')).toBe(true);
      expect(engine.getGroup('g')!.enabled).toBe(true);
    });

    it('returns false for unknown group on enable', () => {
      expect(engine.enableGroup('unknown')).toBe(false);
    });

    it('returns false for unknown group on disable', () => {
      expect(engine.disableGroup('unknown')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // updateGroup
  // ---------------------------------------------------------------------------

  describe('updateGroup', () => {
    it('updates group name', () => {
      engine.createGroup({ id: 'g', name: 'Old' });
      const updated = engine.updateGroup('g', { name: 'New' });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New');
    });

    it('returns undefined for unknown group', () => {
      expect(engine.updateGroup('unknown', { name: 'X' })).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getGroup / getGroups / getGroupRules
  // ---------------------------------------------------------------------------

  describe('getGroup / getGroups / getGroupRules', () => {
    it('retrieves a group by ID', () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });
      expect(engine.getGroup('billing')!.id).toBe('billing');
    });

    it('lists all groups', () => {
      engine.createGroup({ id: 'a', name: 'A' });
      engine.createGroup({ id: 'b', name: 'B' });
      expect(engine.getGroups()).toHaveLength(2);
    });

    it('lists rules in a group', () => {
      engine.createGroup({ id: 'g', name: 'G' });
      engine.registerRule(makeRule({ id: 'r1', group: 'g' }));
      engine.registerRule(makeRule({ id: 'r2', group: 'g' }));
      engine.registerRule(makeRule({ id: 'r3' }));

      const rules = engine.getGroupRules('g');
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });
  });

  // ---------------------------------------------------------------------------
  // Group reference validation in registerRule
  // ---------------------------------------------------------------------------

  describe('registerRule — group reference validation', () => {
    it('allows registering a rule with an existing group', () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });
      const rule = engine.registerRule(makeRule({ id: 'r1', group: 'billing' }));
      expect(rule.group).toBe('billing');
    });

    it('throws when referencing a non-existent group', () => {
      expect(() => {
        engine.registerRule(makeRule({ id: 'r1', group: 'non-existent' }));
      }).toThrow(RuleValidationError);
    });

    it('error message mentions the group ID', () => {
      try {
        engine.registerRule(makeRule({ id: 'r1', group: 'ghost' }));
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RuleValidationError);
        expect((err as RuleValidationError).message).toContain('ghost');
      }
    });

    it('allows registering a rule without a group', () => {
      const rule = engine.registerRule(makeRule({ id: 'r1' }));
      expect(rule).not.toHaveProperty('group');
    });
  });

  // ---------------------------------------------------------------------------
  // Audit logging
  // ---------------------------------------------------------------------------

  describe('audit logging', () => {
    let auditEngine: RuleEngine;
    let auditEntries: Array<{ type: string; details: Record<string, unknown> }>;

    beforeEach(async () => {
      const adapter = new MemoryAdapter();
      auditEngine = await RuleEngine.start({
        name: 'audit-test',
        audit: { adapter },
      });

      const auditLog = auditEngine.getAuditLog()!;
      auditEntries = [];
      auditLog.subscribe((entry) => {
        auditEntries.push({ type: entry.type, details: entry.details });
      });
    });

    afterEach(async () => {
      await auditEngine.stop();
    });

    it('records group_created audit entry', () => {
      auditEngine.createGroup({ id: 'billing', name: 'Billing', description: 'Bill group' });

      const entry = auditEntries.find(e => e.type === 'group_created');
      expect(entry).toBeDefined();
      expect(entry!.details.name).toBe('Billing');
    });

    it('records group_deleted audit entry', () => {
      auditEngine.createGroup({ id: 'g', name: 'G' });
      auditEngine.deleteGroup('g');

      const entry = auditEntries.find(e => e.type === 'group_deleted');
      expect(entry).toBeDefined();
      expect(entry!.details.name).toBe('G');
    });

    it('records group_enabled audit entry', () => {
      auditEngine.createGroup({ id: 'g', name: 'G', enabled: false });
      auditEngine.enableGroup('g');

      const entry = auditEntries.find(e => e.type === 'group_enabled');
      expect(entry).toBeDefined();
    });

    it('records group_disabled audit entry', () => {
      auditEngine.createGroup({ id: 'g', name: 'G' });
      auditEngine.disableGroup('g');

      const entry = auditEntries.find(e => e.type === 'group_disabled');
      expect(entry).toBeDefined();
    });

    it('records group_updated audit entry', () => {
      auditEngine.createGroup({ id: 'g', name: 'Old' });
      auditEngine.updateGroup('g', { name: 'New' });

      const entry = auditEntries.find(e => e.type === 'group_updated');
      expect(entry).toBeDefined();
      expect(entry!.details.name).toBe('New');
    });
  });

  // ---------------------------------------------------------------------------
  // Group state affects rule execution
  // ---------------------------------------------------------------------------

  describe('group state affects event processing', () => {
    it('rules in a disabled group do not fire', async () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });
      engine.registerRule(makeRule({
        id: 'billing-rule',
        group: 'billing',
        trigger: { type: 'event', topic: 'invoice.created' },
        actions: [{ type: 'set_fact', key: 'billing.fired', value: true }],
      }));

      engine.disableGroup('billing');
      await engine.emit('invoice.created');

      expect(engine.getFact('billing.fired')).toBeUndefined();
    });

    it('rules in an enabled group fire normally', async () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });
      engine.registerRule(makeRule({
        id: 'billing-rule',
        group: 'billing',
        trigger: { type: 'event', topic: 'invoice.created' },
        actions: [{ type: 'set_fact', key: 'billing.fired', value: true }],
      }));

      await engine.emit('invoice.created');

      expect(engine.getFact('billing.fired')).toBe(true);
    });

    it('re-enabling a group resumes rule execution', async () => {
      engine.createGroup({ id: 'billing', name: 'Billing' });
      engine.registerRule(makeRule({
        id: 'billing-rule',
        group: 'billing',
        trigger: { type: 'event', topic: 'invoice.created' },
        actions: [{ type: 'set_fact', key: 'billing.fired', value: true }],
      }));

      engine.disableGroup('billing');
      await engine.emit('invoice.created');
      expect(engine.getFact('billing.fired')).toBeUndefined();

      engine.enableGroup('billing');
      await engine.emit('invoice.created');
      expect(engine.getFact('billing.fired')).toBe(true);
    });

    it('individually disabled rule stays disabled after group re-enable', async () => {
      engine.createGroup({ id: 'g', name: 'G' });
      engine.registerRule(makeRule({
        id: 'disabled-rule',
        group: 'g',
        enabled: false,
        trigger: { type: 'event', topic: 'test.event' },
        actions: [{ type: 'set_fact', key: 'should.not.fire', value: true }],
      }));

      engine.disableGroup('g');
      engine.enableGroup('g');
      await engine.emit('test.event');

      expect(engine.getFact('should.not.fire')).toBeUndefined();
    });
  });
});
