import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngine } from '../../src/core/rule-engine';
import type { RuleInput } from '../../src/types/rule';

const createTestRule = (id: string, overrides: Partial<RuleInput> = {}): RuleInput => ({
  id,
  name: `Rule ${id}`,
  priority: 100,
  enabled: true,
  tags: ['test'],
  trigger: { type: 'event', topic: `test.${id}` },
  conditions: [],
  actions: [{ type: 'set_fact', key: `executed:${id}`, value: true }],
  ...overrides,
});

describe('RuleEngine Versioning Integration', () => {
  let versionAdapter: MemoryAdapter;
  let engine: RuleEngine;

  beforeEach(async () => {
    versionAdapter = new MemoryAdapter();
    engine = await RuleEngine.start({
      name: 'versioning-test',
      versioning: { adapter: versionAdapter },
    });
  });

  afterEach(async () => {
    await engine.stop();
  });

  // ---------------------------------------------------------------------------
  // Automatic version recording
  // ---------------------------------------------------------------------------

  describe('automatic version recording', () => {
    it('records version on registerRule', () => {
      const rule = engine.registerRule(createTestRule('auto-reg'));

      const result = engine.getRuleVersions('auto-reg');
      expect(result.totalVersions).toBe(1);
      expect(result.entries).toHaveLength(1);

      const entry = result.entries[0]!;
      expect(entry.version).toBe(1);
      expect(entry.changeType).toBe('registered');
      expect(entry.ruleSnapshot.id).toBe(rule.id);
      expect(entry.ruleSnapshot.name).toBe(rule.name);
    });

    it('records version on enableRule', () => {
      engine.registerRule(createTestRule('auto-enable', { enabled: false }));
      engine.enableRule('auto-enable');

      const result = engine.getRuleVersions('auto-enable');
      expect(result.totalVersions).toBe(2);

      const entries = result.entries;
      expect(entries[0]!.changeType).toBe('enabled');
      expect(entries[0]!.ruleSnapshot.enabled).toBe(true);
      expect(entries[1]!.changeType).toBe('registered');
    });

    it('records version on disableRule', () => {
      engine.registerRule(createTestRule('auto-disable'));
      engine.disableRule('auto-disable');

      const result = engine.getRuleVersions('auto-disable');
      expect(result.totalVersions).toBe(2);

      const entries = result.entries;
      expect(entries[0]!.changeType).toBe('disabled');
      expect(entries[0]!.ruleSnapshot.enabled).toBe(false);
    });

    it('records version on unregisterRule', () => {
      engine.registerRule(createTestRule('auto-unreg'));
      engine.unregisterRule('auto-unreg');

      const result = engine.getRuleVersions('auto-unreg');
      expect(result.totalVersions).toBe(2);

      const entries = result.entries;
      expect(entries[0]!.changeType).toBe('unregistered');
    });

    it('does not record version for nonexistent enable/disable/unregister', () => {
      engine.enableRule('nonexistent');
      engine.disableRule('nonexistent');
      engine.unregisterRule('nonexistent');

      const store = engine.getVersionStore()!;
      expect(store.getStats().totalVersions).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // updateRule
  // ---------------------------------------------------------------------------

  describe('updateRule', () => {
    it('updates rule and records a single updated version entry', () => {
      engine.registerRule(createTestRule('upd-rule'));

      const updated = engine.updateRule('upd-rule', { name: 'Updated Name', priority: 200 });

      expect(updated.id).toBe('upd-rule');
      expect(updated.name).toBe('Updated Name');
      expect(updated.priority).toBe(200);
      // Unchanged fields preserved
      expect(updated.enabled).toBe(true);
      expect(updated.tags).toEqual(['test']);

      const result = engine.getRuleVersions('upd-rule');
      expect(result.totalVersions).toBe(2);

      const entries = result.entries;
      // desc order: newest first
      expect(entries[0]!.changeType).toBe('updated');
      expect(entries[0]!.ruleSnapshot.name).toBe('Updated Name');
      expect(entries[1]!.changeType).toBe('registered');
    });

    it('preserves all unchanged fields during update', () => {
      engine.registerRule(createTestRule('upd-preserve', {
        description: 'original desc',
        tags: ['a', 'b'],
        conditions: [{ source: { type: 'event', field: 'x' }, operator: 'eq', value: 1 }],
      }));

      const updated = engine.updateRule('upd-preserve', { priority: 999 });

      expect(updated.description).toBe('original desc');
      expect(updated.tags).toEqual(['a', 'b']);
      expect(updated.conditions).toHaveLength(1);
      expect(updated.actions).toHaveLength(1);
      expect(updated.trigger).toEqual({ type: 'event', topic: 'test.upd-preserve' });
    });

    it('throws for nonexistent rule', () => {
      expect(() => engine.updateRule('nonexistent', { name: 'x' }))
        .toThrow("Rule 'nonexistent' not found");
    });

    it('throws validation error for invalid updates', () => {
      engine.registerRule(createTestRule('upd-invalid'));

      expect(() => engine.updateRule('upd-invalid', {
        trigger: { type: 'invalid' as 'event', topic: '' },
      })).toThrow();

      // Original rule is still registered after failed update
      const rule = engine.getRule('upd-invalid');
      expect(rule).toBeDefined();
      expect(rule!.trigger).toEqual({ type: 'event', topic: 'test.upd-invalid' });
    });

    it('validates group reference on update', () => {
      engine.registerRule(createTestRule('upd-group'));

      expect(() => engine.updateRule('upd-group', { group: 'nonexistent-group' }))
        .toThrow('non-existent group');
    });

    it('allows update with valid group reference', () => {
      engine.createGroup({ id: 'grp-1', name: 'Group 1' });
      engine.registerRule(createTestRule('upd-grp-ok'));

      const updated = engine.updateRule('upd-grp-ok', { group: 'grp-1' });
      expect(updated.group).toBe('grp-1');
    });

    it('assigns new global version number after update', () => {
      engine.registerRule(createTestRule('upd-ver'));
      const original = engine.getRule('upd-ver')!;
      const originalVersion = original.version;

      const updated = engine.updateRule('upd-ver', { name: 'Changed' });
      expect(updated.version).toBeGreaterThan(originalVersion);
    });
  });

  // ---------------------------------------------------------------------------
  // rollbackRule
  // ---------------------------------------------------------------------------

  describe('rollbackRule', () => {
    it('rolls back to a previous version', () => {
      engine.registerRule(createTestRule('rb-rule'));
      engine.updateRule('rb-rule', { name: 'V2 Name', priority: 200 });
      engine.updateRule('rb-rule', { name: 'V3 Name', priority: 300 });

      // Rollback to version 1 (the original registration)
      const rolledBack = engine.rollbackRule('rb-rule', 1);

      expect(rolledBack.id).toBe('rb-rule');
      expect(rolledBack.name).toBe('Rule rb-rule');
      expect(rolledBack.priority).toBe(100);
    });

    it('records rolled_back version entry with rolledBackFrom', () => {
      engine.registerRule(createTestRule('rb-entry'));
      const v2 = engine.updateRule('rb-entry', { name: 'Updated' });

      engine.rollbackRule('rb-entry', 1);

      const result = engine.getRuleVersions('rb-entry');
      const latest = result.entries[0]!;

      expect(latest.changeType).toBe('rolled_back');
      expect(latest.rolledBackFrom).toBe(v2.version);
      expect(latest.ruleSnapshot.name).toBe('Rule rb-entry');
    });

    it('rolls back even if rule was unregistered', () => {
      engine.registerRule(createTestRule('rb-unreg'));
      engine.unregisterRule('rb-unreg');

      expect(engine.getRule('rb-unreg')).toBeUndefined();

      const restored = engine.rollbackRule('rb-unreg', 1);
      expect(restored.id).toBe('rb-unreg');
      expect(restored.name).toBe('Rule rb-unreg');
      expect(engine.getRule('rb-unreg')).toBeDefined();
    });

    it('throws when versioning is not configured', async () => {
      const noVersionEngine = await RuleEngine.start({ name: 'no-ver' });
      noVersionEngine.registerRule(createTestRule('no-ver'));

      expect(() => noVersionEngine.rollbackRule('no-ver', 1))
        .toThrow('Rule versioning is not configured');

      await noVersionEngine.stop();
    });

    it('throws for nonexistent version', () => {
      engine.registerRule(createTestRule('rb-noversion'));

      expect(() => engine.rollbackRule('rb-noversion', 999))
        .toThrow("Version 999 not found for rule 'rb-noversion'");
    });

    it('assigns new global version number on rollback', () => {
      engine.registerRule(createTestRule('rb-gver'));
      const original = engine.getRule('rb-gver')!;

      engine.updateRule('rb-gver', { name: 'Changed' });
      const rolledBack = engine.rollbackRule('rb-gver', 1);

      expect(rolledBack.version).toBeGreaterThan(original.version);
    });
  });

  // ---------------------------------------------------------------------------
  // Version queries
  // ---------------------------------------------------------------------------

  describe('getRuleVersions', () => {
    it('returns paginated results', () => {
      engine.registerRule(createTestRule('pag'));
      engine.disableRule('pag');
      engine.enableRule('pag');
      engine.updateRule('pag', { priority: 50 });

      const page1 = engine.getRuleVersions('pag', { limit: 2 });
      expect(page1.entries).toHaveLength(2);
      expect(page1.totalVersions).toBe(4);
      expect(page1.hasMore).toBe(true);

      const page2 = engine.getRuleVersions('pag', { limit: 2, offset: 2 });
      expect(page2.entries).toHaveLength(2);
      expect(page2.hasMore).toBe(false);
    });

    it('supports ascending order', () => {
      engine.registerRule(createTestRule('asc'));
      engine.disableRule('asc');

      const result = engine.getRuleVersions('asc', { order: 'asc' });
      expect(result.entries[0]!.changeType).toBe('registered');
      expect(result.entries[1]!.changeType).toBe('disabled');
    });

    it('supports changeTypes filter', () => {
      engine.registerRule(createTestRule('filter'));
      engine.disableRule('filter');
      engine.enableRule('filter');

      const result = engine.getRuleVersions('filter', { changeTypes: ['disabled', 'enabled'] });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.changeType === 'disabled' || e.changeType === 'enabled')).toBe(true);
    });

    it('throws when versioning is not configured', async () => {
      const noVerEngine = await RuleEngine.start({ name: 'no-ver-q' });

      expect(() => noVerEngine.getRuleVersions('any'))
        .toThrow('Rule versioning is not configured');

      await noVerEngine.stop();
    });
  });

  describe('getRuleVersion', () => {
    it('returns specific version entry', () => {
      engine.registerRule(createTestRule('gv'));
      engine.updateRule('gv', { name: 'V2' });

      const v1 = engine.getRuleVersion('gv', 1);
      expect(v1).toBeDefined();
      expect(v1!.changeType).toBe('registered');
      expect(v1!.ruleSnapshot.name).toBe('Rule gv');

      const v2 = engine.getRuleVersion('gv', 2);
      expect(v2).toBeDefined();
      expect(v2!.changeType).toBe('updated');
      expect(v2!.ruleSnapshot.name).toBe('V2');
    });

    it('returns undefined for nonexistent version', () => {
      engine.registerRule(createTestRule('gv-none'));

      expect(engine.getRuleVersion('gv-none', 999)).toBeUndefined();
    });

    it('throws when versioning is not configured', async () => {
      const noVerEngine = await RuleEngine.start({ name: 'no-ver-gv' });

      expect(() => noVerEngine.getRuleVersion('any', 1))
        .toThrow('Rule versioning is not configured');

      await noVerEngine.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Diff
  // ---------------------------------------------------------------------------

  describe('diffRuleVersions', () => {
    it('returns field-level diff between two versions', () => {
      engine.registerRule(createTestRule('diff-rule'));
      engine.updateRule('diff-rule', { name: 'New Name', priority: 999 });

      const diff = engine.diffRuleVersions('diff-rule', 1, 2);
      expect(diff).toBeDefined();
      expect(diff!.ruleId).toBe('diff-rule');
      expect(diff!.fromVersion).toBe(1);
      expect(diff!.toVersion).toBe(2);

      const nameChange = diff!.changes.find(c => c.field === 'name');
      expect(nameChange).toBeDefined();
      expect(nameChange!.oldValue).toBe('Rule diff-rule');
      expect(nameChange!.newValue).toBe('New Name');

      const priorityChange = diff!.changes.find(c => c.field === 'priority');
      expect(priorityChange).toBeDefined();
      expect(priorityChange!.oldValue).toBe(100);
      expect(priorityChange!.newValue).toBe(999);
    });

    it('returns empty changes array for identical versions', () => {
      engine.registerRule(createTestRule('diff-same'));
      engine.disableRule('diff-same');
      engine.enableRule('diff-same');

      // v1 = registered (enabled: true), v3 = enabled (enabled: true)
      // The only difference is the enabled field, but v1 had enabled=true and v3 also has enabled=true
      const diff = engine.diffRuleVersions('diff-same', 1, 3);
      expect(diff).toBeDefined();
      expect(diff!.changes).toHaveLength(0);
    });

    it('detects enable/disable change', () => {
      engine.registerRule(createTestRule('diff-toggle'));
      engine.disableRule('diff-toggle');

      const diff = engine.diffRuleVersions('diff-toggle', 1, 2);
      expect(diff).toBeDefined();

      const enabledChange = diff!.changes.find(c => c.field === 'enabled');
      expect(enabledChange).toBeDefined();
      expect(enabledChange!.oldValue).toBe(true);
      expect(enabledChange!.newValue).toBe(false);
    });

    it('returns undefined for nonexistent versions', () => {
      engine.registerRule(createTestRule('diff-no'));

      expect(engine.diffRuleVersions('diff-no', 1, 999)).toBeUndefined();
    });

    it('throws when versioning is not configured', async () => {
      const noVerEngine = await RuleEngine.start({ name: 'no-ver-diff' });

      expect(() => noVerEngine.diffRuleVersions('any', 1, 2))
        .toThrow('Rule versioning is not configured');

      await noVerEngine.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Full lifecycle
  // ---------------------------------------------------------------------------

  describe('full lifecycle', () => {
    it('tracks register → update → enable → disable → rollback', () => {
      // Step 1: Register
      engine.registerRule(createTestRule('lifecycle', { enabled: false }));

      // Step 2: Update
      engine.updateRule('lifecycle', { name: 'Updated Lifecycle', priority: 50 });

      // Step 3: Enable
      engine.enableRule('lifecycle');

      // Step 4: Disable
      engine.disableRule('lifecycle');

      // Verify history so far
      const history = engine.getRuleVersions('lifecycle', { order: 'asc' });
      expect(history.totalVersions).toBe(4);
      expect(history.entries.map(e => e.changeType)).toEqual([
        'registered', 'updated', 'enabled', 'disabled',
      ]);

      // Step 5: Rollback to version 1 (original registration)
      const rolledBack = engine.rollbackRule('lifecycle', 1);
      expect(rolledBack.name).toBe('Rule lifecycle');
      expect(rolledBack.enabled).toBe(false);
      expect(rolledBack.priority).toBe(100);

      // Verify full history
      const fullHistory = engine.getRuleVersions('lifecycle', { order: 'asc' });
      expect(fullHistory.totalVersions).toBe(5);
      expect(fullHistory.entries.map(e => e.changeType)).toEqual([
        'registered', 'updated', 'enabled', 'disabled', 'rolled_back',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats & accessor
  // ---------------------------------------------------------------------------

  describe('getStats and getVersionStore', () => {
    it('includes versioning stats in engine stats', () => {
      engine.registerRule(createTestRule('stats-rule'));
      engine.updateRule('stats-rule', { priority: 50 });

      const stats = engine.getStats();
      expect(stats.versioning).toBeDefined();
      expect(stats.versioning!.trackedRules).toBe(1);
      expect(stats.versioning!.totalVersions).toBe(2);
    });

    it('getVersionStore returns store when configured', () => {
      expect(engine.getVersionStore()).not.toBeNull();
    });

    it('getVersionStore returns null when not configured', async () => {
      const noVerEngine = await RuleEngine.start({ name: 'no-ver-acc' });
      expect(noVerEngine.getVersionStore()).toBeNull();

      const stats = noVerEngine.getStats();
      expect(stats.versioning).toBeUndefined();

      await noVerEngine.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Versioning disabled
  // ---------------------------------------------------------------------------

  describe('versioning disabled', () => {
    it('engine works normally without versioning', async () => {
      const plainEngine = await RuleEngine.start({ name: 'plain' });

      const rule = plainEngine.registerRule(createTestRule('plain-rule'));
      expect(rule).toBeDefined();

      plainEngine.enableRule('plain-rule');
      plainEngine.disableRule('plain-rule');
      plainEngine.unregisterRule('plain-rule');

      // No errors, no version store
      expect(plainEngine.getVersionStore()).toBeNull();

      await plainEngine.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  describe('persistence', () => {
    it('flushes version data to adapter on stop', async () => {
      engine.registerRule(createTestRule('persist-v'));
      engine.updateRule('persist-v', { priority: 50 });

      await engine.stop();

      const keys = await versionAdapter.listKeys('rule-version:');
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe('rule-version:persist-v');

      const data = await versionAdapter.load(keys[0]!);
      expect(data).toBeDefined();
      expect((data!.state as { entries: unknown[] }).entries).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Audit integration
  // ---------------------------------------------------------------------------

  describe('audit integration', () => {
    it('records rule_rolled_back audit event', async () => {
      const auditAdapter = new MemoryAdapter();
      const auditEngine = await RuleEngine.start({
        name: 'audit-ver',
        versioning: { adapter: new MemoryAdapter() },
        audit: { adapter: auditAdapter, flushIntervalMs: 0 },
      });

      auditEngine.registerRule(createTestRule('audit-rb'));
      auditEngine.updateRule('audit-rb', { name: 'Changed' });
      auditEngine.rollbackRule('audit-rb', 1);

      const auditLog = auditEngine.getAuditLog()!;
      const result = auditLog.query({ types: ['rule_rolled_back'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.ruleId).toBe('audit-rb');
      expect(result.entries[0]!.details).toMatchObject({
        targetVersion: 1,
      });

      await auditEngine.stop();
    });
  });
});
