import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngine } from '../../../src/core/rule-engine';
import { RuleValidationError } from '../../../src/validation/rule-validation-error';
import type { RuleInput } from '../../../src/types/rule';
import type { RuleGroupInput } from '../../../src/types/group';

const createTestRule = (id: string, overrides: Partial<RuleInput> = {}): RuleInput => ({
  id,
  name: `Rule ${id}`,
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'event', topic: `test.${id}` },
  conditions: [],
  actions: [{ type: 'set_fact', key: `executed:${id}`, value: true }],
  ...overrides,
});

const createGroupInput = (overrides: Partial<RuleGroupInput> = {}): RuleGroupInput => ({
  id: 'billing',
  name: 'Billing Rules',
  ...overrides,
});

describe('RuleEngine — groups', () => {
  let engine: RuleEngine;
  let adapter: MemoryAdapter;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    engine = await RuleEngine.start({
      name: 'group-test',
      audit: { adapter, flushIntervalMs: 0 },
    });
  });

  afterEach(async () => {
    await engine.stop();
  });

  // ---------------------------------------------------------------------------
  // createGroup
  // ---------------------------------------------------------------------------

  describe('createGroup()', () => {
    it('creates a group and makes it retrievable', () => {
      const group = engine.createGroup(createGroupInput());

      expect(group.id).toBe('billing');
      expect(group.name).toBe('Billing Rules');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');

      const retrieved = engine.getGroup('billing');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('billing');
    });

    it('accepts optional description and enabled flag', () => {
      const group = engine.createGroup(createGroupInput({
        description: 'Billing domain',
        enabled: false,
      }));

      expect(group.description).toBe('Billing domain');
      expect(group.enabled).toBe(false);
    });

    it('throws RuleValidationError on duplicate group ID', () => {
      engine.createGroup(createGroupInput());

      expect(() => engine.createGroup(createGroupInput()))
        .toThrow(RuleValidationError);
    });

    it('includes path and message in validation error for duplicates', () => {
      engine.createGroup(createGroupInput());

      try {
        engine.createGroup(createGroupInput());
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as RuleValidationError;
        expect(e.issues).toHaveLength(1);
        expect(e.issues[0].path).toBe('id');
        expect(e.issues[0].message).toContain('already exists');
      }
    });

    it('records group_created audit event', () => {
      const group = engine.createGroup(createGroupInput({ description: 'Test desc' }));

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_created'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe(group.id);
      expect(entry.details).toMatchObject({
        name: 'Billing Rules',
        description: 'Test desc',
        enabled: true,
      });
    });

    it('omits description from audit when not provided', () => {
      engine.createGroup(createGroupInput());

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_created'] });
      const entry = result.entries[0]!;

      expect(entry.details).not.toHaveProperty('description');
    });
  });

  // ---------------------------------------------------------------------------
  // deleteGroup
  // ---------------------------------------------------------------------------

  describe('deleteGroup()', () => {
    it('deletes an existing group and returns true', () => {
      engine.createGroup(createGroupInput());

      const result = engine.deleteGroup('billing');

      expect(result).toBe(true);
      expect(engine.getGroup('billing')).toBeUndefined();
    });

    it('returns false for non-existent group', () => {
      expect(engine.deleteGroup('non-existent')).toBe(false);
    });

    it('clears group reference on assigned rules', () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('r1', { group: 'billing' }));
      engine.registerRule(createTestRule('r2', { group: 'billing' }));

      engine.deleteGroup('billing');

      expect(engine.getRule('r1')?.group).toBeUndefined();
      expect(engine.getRule('r2')?.group).toBeUndefined();
    });

    it('records group_deleted audit event', () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('r1', { group: 'billing' }));

      engine.deleteGroup('billing');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_deleted'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe('billing');
      expect(entry.details).toMatchObject({
        name: 'Billing Rules',
        affectedRulesCount: 1,
      });
    });

    it('does not record audit for non-existent group', () => {
      engine.deleteGroup('non-existent');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_deleted'] });
      expect(result.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // enableGroup / disableGroup
  // ---------------------------------------------------------------------------

  describe('enableGroup()', () => {
    it('enables a disabled group and returns true', () => {
      engine.createGroup(createGroupInput({ enabled: false }));

      const result = engine.enableGroup('billing');

      expect(result).toBe(true);
      expect(engine.getGroup('billing')?.enabled).toBe(true);
    });

    it('returns false for non-existent group', () => {
      expect(engine.enableGroup('non-existent')).toBe(false);
    });

    it('records group_enabled audit event with affected rules count', () => {
      engine.createGroup(createGroupInput({ enabled: false }));
      engine.registerRule(createTestRule('r1', { group: 'billing' }));
      engine.registerRule(createTestRule('r2', { group: 'billing' }));

      engine.enableGroup('billing');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_enabled'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe('billing');
      expect(entry.details).toMatchObject({
        name: 'Billing Rules',
        affectedRulesCount: 2,
      });
    });

    it('does not record audit for non-existent group', () => {
      engine.enableGroup('non-existent');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_enabled'] });
      expect(result.totalCount).toBe(0);
    });
  });

  describe('disableGroup()', () => {
    it('disables an enabled group and returns true', () => {
      engine.createGroup(createGroupInput());

      const result = engine.disableGroup('billing');

      expect(result).toBe(true);
      expect(engine.getGroup('billing')?.enabled).toBe(false);
    });

    it('returns false for non-existent group', () => {
      expect(engine.disableGroup('non-existent')).toBe(false);
    });

    it('records group_disabled audit event with affected rules count', () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('r1', { group: 'billing' }));

      engine.disableGroup('billing');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_disabled'] });

      expect(result.totalCount).toBe(1);
      const entry = result.entries[0]!;
      expect(entry.ruleId).toBe('billing');
      expect(entry.details).toMatchObject({
        name: 'Billing Rules',
        affectedRulesCount: 1,
      });
    });

    it('does not record audit for non-existent group', () => {
      engine.disableGroup('non-existent');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ types: ['group_disabled'] });
      expect(result.totalCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getGroup / getGroups / getGroupRules
  // ---------------------------------------------------------------------------

  describe('read-only group methods', () => {
    it('getGroup returns undefined for non-existent group', () => {
      expect(engine.getGroup('non-existent')).toBeUndefined();
    });

    it('getGroups returns all registered groups', () => {
      engine.createGroup(createGroupInput({ id: 'billing', name: 'Billing' }));
      engine.createGroup(createGroupInput({ id: 'shipping', name: 'Shipping' }));

      const groups = engine.getGroups();

      expect(groups).toHaveLength(2);
      expect(groups.map(g => g.id).sort()).toEqual(['billing', 'shipping']);
    });

    it('getGroups returns empty array when no groups exist', () => {
      expect(engine.getGroups()).toEqual([]);
    });

    it('getGroupRules returns rules in the group', () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('r1', { group: 'billing' }));
      engine.registerRule(createTestRule('r2', { group: 'billing' }));

      const rules = engine.getGroupRules('billing');

      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('getGroupRules returns empty array for non-existent group', () => {
      expect(engine.getGroupRules('non-existent')).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Group reference validation in registerRule
  // ---------------------------------------------------------------------------

  describe('group reference validation', () => {
    it('allows registering rule with existing group', () => {
      engine.createGroup(createGroupInput());

      const rule = engine.registerRule(createTestRule('r1', { group: 'billing' }));

      expect(rule.group).toBe('billing');
    });

    it('allows registering rule without group', () => {
      const rule = engine.registerRule(createTestRule('r1'));

      expect(rule.group).toBeUndefined();
    });

    it('throws RuleValidationError for non-existent group reference', () => {
      expect(() => engine.registerRule(createTestRule('r1', { group: 'non-existent' })))
        .toThrow(RuleValidationError);
    });

    it('includes group path in validation error', () => {
      try {
        engine.registerRule(createTestRule('r1', { group: 'unknown' }));
        expect.unreachable('should have thrown');
      } catch (err) {
        const e = err as RuleValidationError;
        expect(e.issues).toHaveLength(1);
        expect(e.issues[0].path).toBe('group');
        expect(e.issues[0].message).toContain('unknown');
        expect(e.issues[0].message).toContain('does not exist');
      }
    });

    it('validates group reference even with skipValidation', () => {
      expect(() =>
        engine.registerRule(createTestRule('r1', { group: 'non-existent' }), { skipValidation: true })
      ).toThrow(RuleValidationError);
    });
  });

  // ---------------------------------------------------------------------------
  // Group audit events categorized correctly
  // ---------------------------------------------------------------------------

  describe('audit category', () => {
    it('group events are categorized as rule_management', () => {
      engine.createGroup(createGroupInput());
      engine.disableGroup('billing');
      engine.enableGroup('billing');
      engine.deleteGroup('billing');

      const auditLog = engine.getAuditLog()!;
      const result = auditLog.query({ category: 'rule_management' });

      const groupTypes = result.entries
        .map(e => e.type)
        .filter(t => t.startsWith('group_'));

      expect(groupTypes).toContain('group_created');
      expect(groupTypes).toContain('group_disabled');
      expect(groupTypes).toContain('group_enabled');
      expect(groupTypes).toContain('group_deleted');
    });
  });

  // ---------------------------------------------------------------------------
  // Functional integration: group disable stops rule execution
  // ---------------------------------------------------------------------------

  describe('group disable stops rule execution', () => {
    it('disabled group prevents rules from firing', async () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('grp-rule', {
        group: 'billing',
        trigger: { type: 'event', topic: 'order.created' },
        actions: [{ type: 'set_fact', key: 'fired', value: true }],
      }));

      engine.disableGroup('billing');
      await engine.emit('order.created', {});

      expect(engine.getFact('fired')).toBeUndefined();
    });

    it('re-enabled group allows rules to fire again', async () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('grp-rule', {
        group: 'billing',
        trigger: { type: 'event', topic: 'order.created' },
        actions: [{ type: 'set_fact', key: 'fired', value: true }],
      }));

      engine.disableGroup('billing');
      await engine.emit('order.created', {});
      expect(engine.getFact('fired')).toBeUndefined();

      engine.enableGroup('billing');
      await engine.emit('order.created', {});
      expect(engine.getFact('fired')).toBe(true);
    });

    it('individually disabled rule stays disabled after group re-enable', async () => {
      engine.createGroup(createGroupInput());
      engine.registerRule(createTestRule('grp-rule', {
        group: 'billing',
        enabled: false,
        trigger: { type: 'event', topic: 'order.created' },
        actions: [{ type: 'set_fact', key: 'fired', value: true }],
      }));

      engine.disableGroup('billing');
      engine.enableGroup('billing');
      await engine.emit('order.created', {});

      expect(engine.getFact('fired')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Engine not running
  // ---------------------------------------------------------------------------

  describe('ensureRunning guard', () => {
    it('createGroup throws when engine is stopped', async () => {
      await engine.stop();

      expect(() => engine.createGroup(createGroupInput()))
        .toThrow('is not running');
    });

    it('deleteGroup throws when engine is stopped', async () => {
      await engine.stop();

      expect(() => engine.deleteGroup('billing'))
        .toThrow('is not running');
    });

    it('enableGroup throws when engine is stopped', async () => {
      await engine.stop();

      expect(() => engine.enableGroup('billing'))
        .toThrow('is not running');
    });

    it('disableGroup throws when engine is stopped', async () => {
      await engine.stop();

      expect(() => engine.disableGroup('billing'))
        .toThrow('is not running');
    });
  });
});
