import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuleVersionStore } from '../../../src/versioning/rule-version-store';
import type { RuleVersionEntry } from '../../../src/versioning/types';
import type { Rule } from '../../../src/types/rule';
import type { StorageAdapter, PersistedState } from '@hamicek/noex';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMemoryAdapter(): StorageAdapter & { store: Map<string, PersistedState<unknown>> } {
  const store = new Map<string, PersistedState<unknown>>();
  return {
    store,
    async save(key: string, data: PersistedState<unknown>) {
      store.set(key, data);
    },
    async load<T>(key: string) {
      return store.get(key) as PersistedState<T> | undefined;
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async exists(key: string) {
      return store.has(key);
    },
    async listKeys(prefix?: string) {
      const keys = [...store.keys()];
      return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
    },
  };
}

function createRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'test-rule',
    name: 'Test Rule',
    priority: 100,
    enabled: true,
    version: 1,
    tags: [],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'Rule fired' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RuleVersionStore', () => {
  let adapter: ReturnType<typeof createMemoryAdapter>;
  let store: RuleVersionStore;

  beforeEach(async () => {
    adapter = createMemoryAdapter();
    store = await RuleVersionStore.start({ adapter });
  });

  afterEach(async () => {
    await store.stop();
  });

  describe('static start()', () => {
    it('creates an instance', async () => {
      const s = await RuleVersionStore.start({ adapter: createMemoryAdapter() });
      expect(s).toBeInstanceOf(RuleVersionStore);
      await s.stop();
    });

    it('accepts optional maxVersionsPerRule', async () => {
      const s = await RuleVersionStore.start({ adapter: createMemoryAdapter(), maxVersionsPerRule: 50 });
      expect(s).toBeInstanceOf(RuleVersionStore);
      await s.stop();
    });

    it('accepts optional maxAgeMs', async () => {
      const s = await RuleVersionStore.start({ adapter: createMemoryAdapter(), maxAgeMs: 1000 });
      expect(s).toBeInstanceOf(RuleVersionStore);
      await s.stop();
    });
  });

  describe('recordVersion()', () => {
    it('records a version entry and returns it', () => {
      const rule = createRule();
      const entry = store.recordVersion(rule, 'registered');

      expect(entry).toBeDefined();
      expect(entry.version).toBe(1);
      expect(entry.changeType).toBe('registered');
      expect(entry.ruleSnapshot.id).toBe('test-rule');
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('auto-increments version numbers per rule', () => {
      const rule = createRule();
      const e1 = store.recordVersion(rule, 'registered');
      const e2 = store.recordVersion(rule, 'updated');
      const e3 = store.recordVersion(rule, 'enabled');

      expect(e1.version).toBe(1);
      expect(e2.version).toBe(2);
      expect(e3.version).toBe(3);
    });

    it('maintains independent version counters per rule', () => {
      const ruleA = createRule({ id: 'rule-a' });
      const ruleB = createRule({ id: 'rule-b' });

      store.recordVersion(ruleA, 'registered');
      store.recordVersion(ruleA, 'updated');
      const entryB = store.recordVersion(ruleB, 'registered');

      expect(entryB.version).toBe(1);
    });

    it('creates a deep copy of the rule snapshot', () => {
      const rule = createRule({ tags: ['billing'] });
      const entry = store.recordVersion(rule, 'registered');

      rule.tags.push('critical');
      rule.name = 'Modified Name';

      expect(entry.ruleSnapshot.tags).toEqual(['billing']);
      expect(entry.ruleSnapshot.name).toBe('Test Rule');
    });

    it('includes rolledBackFrom when provided', () => {
      const rule = createRule();
      const entry = store.recordVersion(rule, 'rolled_back', { rolledBackFrom: 5 });

      expect(entry.rolledBackFrom).toBe(5);
    });

    it('includes description when provided', () => {
      const rule = createRule();
      const entry = store.recordVersion(rule, 'updated', {
        description: 'Changed priority for production',
      });

      expect(entry.description).toBe('Changed priority for production');
    });

    it('omits optional fields when not provided', () => {
      const rule = createRule();
      const entry = store.recordVersion(rule, 'registered');

      expect('rolledBackFrom' in entry).toBe(false);
      expect('description' in entry).toBe(false);
    });

    it('records all valid change types', () => {
      const rule = createRule();
      const types = ['registered', 'updated', 'enabled', 'disabled', 'unregistered', 'rolled_back'] as const;

      for (const type of types) {
        const entry = store.recordVersion(rule, type);
        expect(entry.changeType).toBe(type);
      }
    });
  });

  describe('getVersions()', () => {
    it('returns empty array for unknown rule', () => {
      expect(store.getVersions('nonexistent')).toEqual([]);
    });

    it('returns all versions in oldest-first order', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');
      store.recordVersion(rule, 'updated');
      store.recordVersion(rule, 'enabled');

      const versions = store.getVersions('test-rule');

      expect(versions).toHaveLength(3);
      expect(versions[0]!.version).toBe(1);
      expect(versions[1]!.version).toBe(2);
      expect(versions[2]!.version).toBe(3);
    });

    it('returns a copy (mutations do not affect internal state)', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');

      const versions = store.getVersions('test-rule');
      versions.push({} as RuleVersionEntry);

      expect(store.getVersions('test-rule')).toHaveLength(1);
    });
  });

  describe('getVersion()', () => {
    it('returns specific version entry', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');
      store.recordVersion(rule, 'updated');

      const entry = store.getVersion('test-rule', 2);

      expect(entry).toBeDefined();
      expect(entry!.version).toBe(2);
      expect(entry!.changeType).toBe('updated');
    });

    it('returns undefined for non-existing version', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');

      expect(store.getVersion('test-rule', 99)).toBeUndefined();
    });

    it('returns undefined for unknown rule', () => {
      expect(store.getVersion('nonexistent', 1)).toBeUndefined();
    });
  });

  describe('getLatestVersion()', () => {
    it('returns the most recent entry', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');
      store.recordVersion(rule, 'updated');
      store.recordVersion(rule, 'disabled');

      const latest = store.getLatestVersion('test-rule');

      expect(latest).toBeDefined();
      expect(latest!.version).toBe(3);
      expect(latest!.changeType).toBe('disabled');
    });

    it('returns undefined for unknown rule', () => {
      expect(store.getLatestVersion('nonexistent')).toBeUndefined();
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      const rule = createRule();
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      store.recordVersion(rule, 'registered');  // v1, t=1000
      vi.setSystemTime(2000);
      store.recordVersion(rule, 'updated');     // v2, t=2000
      vi.setSystemTime(3000);
      store.recordVersion(rule, 'enabled');     // v3, t=3000
      vi.setSystemTime(4000);
      store.recordVersion(rule, 'disabled');    // v4, t=4000
      vi.setSystemTime(5000);
      store.recordVersion(rule, 'updated');     // v5, t=5000
      vi.useRealTimers();
    });

    it('returns all entries with default desc ordering', () => {
      const result = store.query({ ruleId: 'test-rule' });

      expect(result.entries).toHaveLength(5);
      expect(result.totalVersions).toBe(5);
      expect(result.hasMore).toBe(false);
      expect(result.entries[0]!.version).toBe(5);
      expect(result.entries[4]!.version).toBe(1);
    });

    it('returns entries in ascending order', () => {
      const result = store.query({ ruleId: 'test-rule', order: 'asc' });

      expect(result.entries[0]!.version).toBe(1);
      expect(result.entries[4]!.version).toBe(5);
    });

    it('paginates with limit', () => {
      const result = store.query({ ruleId: 'test-rule', limit: 2 });

      expect(result.entries).toHaveLength(2);
      expect(result.totalVersions).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('paginates with offset', () => {
      const result = store.query({ ruleId: 'test-rule', offset: 3, limit: 10 });

      expect(result.entries).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('paginates with offset and limit', () => {
      const result = store.query({ ruleId: 'test-rule', offset: 1, limit: 2 });

      expect(result.entries).toHaveLength(2);
      // desc order: v5, v4, v3, v2, v1 — offset 1 → v4, v3
      expect(result.entries[0]!.version).toBe(4);
      expect(result.entries[1]!.version).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('filters by version range', () => {
      const result = store.query({ ruleId: 'test-rule', fromVersion: 2, toVersion: 4, order: 'asc' });

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]!.version).toBe(2);
      expect(result.entries[2]!.version).toBe(4);
    });

    it('filters by changeTypes', () => {
      const result = store.query({
        ruleId: 'test-rule',
        changeTypes: ['updated'],
        order: 'asc',
      });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.changeType === 'updated')).toBe(true);
    });

    it('filters by timestamp range (from)', () => {
      const result = store.query({ ruleId: 'test-rule', from: 3000, order: 'asc' });

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]!.version).toBe(3);
    });

    it('filters by timestamp range (to)', () => {
      const result = store.query({ ruleId: 'test-rule', to: 2000, order: 'asc' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!.version).toBe(1);
      expect(result.entries[1]!.version).toBe(2);
    });

    it('filters by timestamp range (from + to)', () => {
      const result = store.query({ ruleId: 'test-rule', from: 2000, to: 4000, order: 'asc' });

      expect(result.entries).toHaveLength(3);
      expect(result.entries.map(e => e.version)).toEqual([2, 3, 4]);
    });

    it('combines multiple filters', () => {
      const result = store.query({
        ruleId: 'test-rule',
        changeTypes: ['updated'],
        fromVersion: 3,
        order: 'asc',
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.version).toBe(5);
    });

    it('returns empty result for unknown rule', () => {
      const result = store.query({ ruleId: 'nonexistent' });

      expect(result.entries).toHaveLength(0);
      expect(result.totalVersions).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('returns empty result when no entries match filters', () => {
      const result = store.query({
        ruleId: 'test-rule',
        changeTypes: ['rolled_back'],
      });

      expect(result.entries).toHaveLength(0);
      expect(result.totalVersions).toBe(5);
    });
  });

  describe('diff()', () => {
    it('returns field-level diff between two versions', () => {
      const ruleV1 = createRule({ name: 'Original', priority: 100 });
      store.recordVersion(ruleV1, 'registered');

      const ruleV2 = createRule({ name: 'Updated', priority: 200 });
      store.recordVersion(ruleV2, 'updated');

      const diff = store.diff('test-rule', 1, 2);

      expect(diff).toBeDefined();
      expect(diff!.ruleId).toBe('test-rule');
      expect(diff!.fromVersion).toBe(1);
      expect(diff!.toVersion).toBe(2);

      const nameChange = diff!.changes.find(c => c.field === 'name');
      expect(nameChange).toBeDefined();
      expect(nameChange!.oldValue).toBe('Original');
      expect(nameChange!.newValue).toBe('Updated');

      const priorityChange = diff!.changes.find(c => c.field === 'priority');
      expect(priorityChange).toBeDefined();
      expect(priorityChange!.oldValue).toBe(100);
      expect(priorityChange!.newValue).toBe(200);
    });

    it('returns empty changes when versions are identical', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');
      store.recordVersion(rule, 'enabled');

      const diff = store.diff('test-rule', 1, 2);

      expect(diff).toBeDefined();
      expect(diff!.changes).toHaveLength(0);
    });

    it('detects changes in complex fields (trigger)', () => {
      const ruleV1 = createRule({ trigger: { type: 'event', topic: 'order.created' } });
      store.recordVersion(ruleV1, 'registered');

      const ruleV2 = createRule({ trigger: { type: 'fact', pattern: 'customer:*:status' } });
      store.recordVersion(ruleV2, 'updated');

      const diff = store.diff('test-rule', 1, 2);
      const triggerChange = diff!.changes.find(c => c.field === 'trigger');

      expect(triggerChange).toBeDefined();
      expect(triggerChange!.oldValue).toEqual({ type: 'event', topic: 'order.created' });
      expect(triggerChange!.newValue).toEqual({ type: 'fact', pattern: 'customer:*:status' });
    });

    it('detects changes in array fields (tags)', () => {
      const ruleV1 = createRule({ tags: ['billing'] });
      store.recordVersion(ruleV1, 'registered');

      const ruleV2 = createRule({ tags: ['billing', 'critical'] });
      store.recordVersion(ruleV2, 'updated');

      const diff = store.diff('test-rule', 1, 2);
      const tagsChange = diff!.changes.find(c => c.field === 'tags');

      expect(tagsChange).toBeDefined();
      expect(tagsChange!.oldValue).toEqual(['billing']);
      expect(tagsChange!.newValue).toEqual(['billing', 'critical']);
    });

    it('detects enabled/disabled toggle', () => {
      const ruleV1 = createRule({ enabled: true });
      store.recordVersion(ruleV1, 'registered');

      const ruleV2 = createRule({ enabled: false });
      store.recordVersion(ruleV2, 'disabled');

      const diff = store.diff('test-rule', 1, 2);
      const enabledChange = diff!.changes.find(c => c.field === 'enabled');

      expect(enabledChange).toBeDefined();
      expect(enabledChange!.oldValue).toBe(true);
      expect(enabledChange!.newValue).toBe(false);
    });

    it('detects description added/removed', () => {
      const ruleV1 = createRule({ description: undefined });
      store.recordVersion(ruleV1, 'registered');

      const ruleV2 = createRule({ description: 'New description' });
      store.recordVersion(ruleV2, 'updated');

      const diff = store.diff('test-rule', 1, 2);
      const descChange = diff!.changes.find(c => c.field === 'description');

      expect(descChange).toBeDefined();
      expect(descChange!.oldValue).toBeUndefined();
      expect(descChange!.newValue).toBe('New description');
    });

    it('returns undefined when from version does not exist', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');

      expect(store.diff('test-rule', 99, 1)).toBeUndefined();
    });

    it('returns undefined when to version does not exist', () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');

      expect(store.diff('test-rule', 1, 99)).toBeUndefined();
    });

    it('returns undefined for unknown rule', () => {
      expect(store.diff('nonexistent', 1, 2)).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('returns empty stats initially', () => {
      const stats = store.getStats();

      expect(stats.trackedRules).toBe(0);
      expect(stats.totalVersions).toBe(0);
      expect(stats.dirtyRules).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });

    it('tracks rules and versions', () => {
      const ruleA = createRule({ id: 'rule-a' });
      const ruleB = createRule({ id: 'rule-b' });

      store.recordVersion(ruleA, 'registered');
      store.recordVersion(ruleA, 'updated');
      store.recordVersion(ruleB, 'registered');

      const stats = store.getStats();

      expect(stats.trackedRules).toBe(2);
      expect(stats.totalVersions).toBe(3);
    });

    it('reports dirty rules count', async () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');

      expect(store.getStats().dirtyRules).toBe(1);

      await store.flush();

      expect(store.getStats().dirtyRules).toBe(0);
    });

    it('reports oldest and newest entry timestamps', () => {
      vi.useFakeTimers();

      vi.setSystemTime(1000);
      store.recordVersion(createRule({ id: 'rule-a' }), 'registered');

      vi.setSystemTime(5000);
      store.recordVersion(createRule({ id: 'rule-b' }), 'registered');

      vi.setSystemTime(3000);
      store.recordVersion(createRule({ id: 'rule-c' }), 'registered');

      const stats = store.getStats();

      expect(stats.oldestEntry).toBe(1000);
      expect(stats.newestEntry).toBe(5000);

      vi.useRealTimers();
    });
  });

  describe('persistence (flush)', () => {
    it('flushes dirty rules to storage', async () => {
      store.recordVersion(createRule(), 'registered');
      await store.flush();

      expect(adapter.store.size).toBe(1);
      expect(adapter.store.has('rule-version:test-rule')).toBe(true);
    });

    it('persists all version entries for a rule', async () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');
      store.recordVersion(rule, 'updated');
      store.recordVersion(rule, 'enabled');

      await store.flush();

      const persisted = await adapter.load<{ entries: RuleVersionEntry[] }>('rule-version:test-rule');
      expect(persisted).toBeDefined();
      expect(persisted!.state.entries).toHaveLength(3);
      expect(persisted!.state.entries[0]!.version).toBe(1);
      expect(persisted!.state.entries[2]!.version).toBe(3);
    });

    it('sets correct metadata on persisted state', async () => {
      store.recordVersion(createRule(), 'registered');
      await store.flush();

      const persisted = await adapter.load<{ entries: RuleVersionEntry[] }>('rule-version:test-rule');
      expect(persisted).toBeDefined();
      expect(persisted!.metadata.serverId).toBe('rule-version-store');
      expect(persisted!.metadata.schemaVersion).toBe(1);
      expect(persisted!.metadata.persistedAt).toBeGreaterThan(0);
    });

    it('is a no-op when nothing is dirty', async () => {
      const saveSpy = vi.spyOn(adapter, 'save');
      await store.flush();
      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('clears dirty set after flush', async () => {
      store.recordVersion(createRule(), 'registered');
      expect(store.getStats().dirtyRules).toBe(1);

      await store.flush();
      expect(store.getStats().dirtyRules).toBe(0);
    });

    it('flushes multiple dirty rules independently', async () => {
      store.recordVersion(createRule({ id: 'rule-a' }), 'registered');
      store.recordVersion(createRule({ id: 'rule-b' }), 'registered');

      await store.flush();

      expect(adapter.store.has('rule-version:rule-a')).toBe(true);
      expect(adapter.store.has('rule-version:rule-b')).toBe(true);
    });

    it('overwrites previous persisted data on next flush', async () => {
      const rule = createRule();
      store.recordVersion(rule, 'registered');
      await store.flush();

      store.recordVersion(rule, 'updated');
      await store.flush();

      const persisted = await adapter.load<{ entries: RuleVersionEntry[] }>('rule-version:test-rule');
      expect(persisted!.state.entries).toHaveLength(2);
    });
  });

  describe('loadRule()', () => {
    it('loads version history from storage into cache', async () => {
      // Seed storage directly
      const entries: RuleVersionEntry[] = [
        {
          version: 1,
          ruleSnapshot: createRule(),
          timestamp: 1000,
          changeType: 'registered',
        },
        {
          version: 2,
          ruleSnapshot: createRule({ name: 'Updated' }),
          timestamp: 2000,
          changeType: 'updated',
        },
      ];

      await adapter.save('rule-version:preloaded', {
        state: { entries },
        metadata: { persistedAt: Date.now(), serverId: 'rule-version-store', schemaVersion: 1 },
      });

      await store.loadRule('preloaded');

      const versions = store.getVersions('preloaded');
      expect(versions).toHaveLength(2);
      expect(versions[0]!.version).toBe(1);
      expect(versions[1]!.changeType).toBe('updated');
    });

    it('is a no-op if already loaded', async () => {
      await adapter.save('rule-version:preloaded', {
        state: {
          entries: [{
            version: 1,
            ruleSnapshot: createRule(),
            timestamp: 1000,
            changeType: 'registered',
          }],
        },
        metadata: { persistedAt: Date.now(), serverId: 'rule-version-store', schemaVersion: 1 },
      });

      await store.loadRule('preloaded');

      const loadSpy = vi.spyOn(adapter, 'load');
      await store.loadRule('preloaded');

      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('continues version numbering from loaded state', async () => {
      await adapter.save('rule-version:preloaded', {
        state: {
          entries: [{
            version: 1,
            ruleSnapshot: createRule({ id: 'preloaded' }),
            timestamp: 1000,
            changeType: 'registered',
          }],
        },
        metadata: { persistedAt: Date.now(), serverId: 'rule-version-store', schemaVersion: 1 },
      });

      await store.loadRule('preloaded');

      const newEntry = store.recordVersion(createRule({ id: 'preloaded' }), 'updated');
      expect(newEntry.version).toBe(2);
    });

    it('handles missing rule in storage gracefully', async () => {
      await store.loadRule('nonexistent');
      expect(store.getVersions('nonexistent')).toEqual([]);
    });
  });

  describe('retention (trimVersions)', () => {
    it('enforces maxVersionsPerRule limit', async () => {
      const s = await RuleVersionStore.start({
        adapter: createMemoryAdapter(),
        maxVersionsPerRule: 3,
      });

      const rule = createRule();
      for (let i = 0; i < 5; i++) {
        s.recordVersion(rule, 'updated');
      }

      const versions = s.getVersions('test-rule');
      expect(versions).toHaveLength(3);
      // Should keep the newest versions
      expect(versions[0]!.version).toBe(3);
      expect(versions[2]!.version).toBe(5);

      await s.stop();
    });

    it('enforces maxAgeMs limit on recording', async () => {
      vi.useFakeTimers();

      const s = await RuleVersionStore.start({
        adapter: createMemoryAdapter(),
        maxAgeMs: 5000,
      });

      const rule = createRule();

      vi.setSystemTime(1000);
      s.recordVersion(rule, 'registered');

      vi.setSystemTime(2000);
      s.recordVersion(rule, 'updated');

      // Jump far into the future
      vi.setSystemTime(10_000);
      s.recordVersion(rule, 'enabled');

      const versions = s.getVersions('test-rule');
      // v1 (t=1000) and v2 (t=2000) are older than 5000ms before t=10000
      expect(versions).toHaveLength(1);
      expect(versions[0]!.version).toBe(3);

      await s.stop();
      vi.useRealTimers();
    });
  });

  describe('cleanup()', () => {
    it('removes old entries from memory', async () => {
      vi.useFakeTimers();

      vi.setSystemTime(1000);
      store.recordVersion(createRule({ id: 'rule-a' }), 'registered');

      vi.setSystemTime(50_000);
      store.recordVersion(createRule({ id: 'rule-b' }), 'registered');

      vi.useRealTimers();

      // Create a store with very short maxAge
      const shortStore = await RuleVersionStore.start({
        adapter: createMemoryAdapter(),
        maxAgeMs: 30_000,
      });

      vi.useFakeTimers();
      vi.setSystemTime(1000);
      shortStore.recordVersion(createRule({ id: 'rule-old' }), 'registered');
      vi.setSystemTime(100_000);
      shortStore.recordVersion(createRule({ id: 'rule-new' }), 'registered');

      const removed = await shortStore.cleanup();

      // rule-old (t=1000) is older than 100000 - 30000 = 70000
      expect(removed).toBe(1);
      expect(shortStore.getVersions('rule-old')).toHaveLength(0);
      expect(shortStore.getVersions('rule-new')).toHaveLength(1);

      await shortStore.stop();
      vi.useRealTimers();
    });

    it('deletes storage key when all entries for a rule are removed', async () => {
      vi.useFakeTimers();

      const cleanupAdapter = createMemoryAdapter();
      const s = await RuleVersionStore.start({ adapter: cleanupAdapter, maxAgeMs: 5000 });

      vi.setSystemTime(1000);
      s.recordVersion(createRule({ id: 'old-rule' }), 'registered');
      await s.flush();

      expect(cleanupAdapter.store.has('rule-version:old-rule')).toBe(true);

      vi.setSystemTime(100_000);
      await s.cleanup();

      expect(cleanupAdapter.store.has('rule-version:old-rule')).toBe(false);

      await s.stop();
      vi.useRealTimers();
    });

    it('returns 0 when no entries are old enough', async () => {
      store.recordVersion(createRule(), 'registered');

      const removed = await store.cleanup();
      expect(removed).toBe(0);
    });
  });

  describe('stop()', () => {
    it('flushes pending entries before stopping', async () => {
      store.recordVersion(createRule(), 'registered');
      await store.stop();

      expect(adapter.store.has('rule-version:test-rule')).toBe(true);
    });

    it('is safe to call multiple times', async () => {
      await store.stop();
      await store.stop();
    });
  });

  describe('flush timer', () => {
    it('periodically flushes dirty entries', async () => {
      vi.useFakeTimers();

      const timerAdapter = createMemoryAdapter();
      const s = await RuleVersionStore.start({ adapter: timerAdapter });
      s.recordVersion(createRule(), 'registered');

      expect(timerAdapter.store.size).toBe(0);

      await vi.advanceTimersByTimeAsync(6000);

      expect(timerAdapter.store.size).toBeGreaterThan(0);

      await s.stop();
      vi.useRealTimers();
    });
  });

  describe('multi-rule scenarios', () => {
    it('handles interleaved operations across multiple rules', () => {
      const ruleA = createRule({ id: 'rule-a', name: 'Rule A' });
      const ruleB = createRule({ id: 'rule-b', name: 'Rule B' });
      const ruleC = createRule({ id: 'rule-c', name: 'Rule C' });

      store.recordVersion(ruleA, 'registered');
      store.recordVersion(ruleB, 'registered');
      store.recordVersion(ruleA, 'updated');
      store.recordVersion(ruleC, 'registered');
      store.recordVersion(ruleB, 'enabled');
      store.recordVersion(ruleA, 'disabled');

      expect(store.getVersions('rule-a')).toHaveLength(3);
      expect(store.getVersions('rule-b')).toHaveLength(2);
      expect(store.getVersions('rule-c')).toHaveLength(1);

      expect(store.getLatestVersion('rule-a')!.changeType).toBe('disabled');
      expect(store.getLatestVersion('rule-b')!.changeType).toBe('enabled');
      expect(store.getLatestVersion('rule-c')!.changeType).toBe('registered');
    });

    it('independently queries each rule', () => {
      const ruleA = createRule({ id: 'rule-a' });
      const ruleB = createRule({ id: 'rule-b' });

      store.recordVersion(ruleA, 'registered');
      store.recordVersion(ruleA, 'updated');
      store.recordVersion(ruleB, 'registered');

      const resultA = store.query({ ruleId: 'rule-a' });
      const resultB = store.query({ ruleId: 'rule-b' });

      expect(resultA.totalVersions).toBe(2);
      expect(resultB.totalVersions).toBe(1);
    });

    it('flushes all dirty rules at once', async () => {
      store.recordVersion(createRule({ id: 'rule-a' }), 'registered');
      store.recordVersion(createRule({ id: 'rule-b' }), 'registered');
      store.recordVersion(createRule({ id: 'rule-c' }), 'registered');

      await store.flush();

      expect(adapter.store.size).toBe(3);
      expect(store.getStats().dirtyRules).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles rule with complex snapshot (all fields populated)', () => {
      const complexRule = createRule({
        id: 'complex',
        name: 'Complex Rule',
        description: 'A complex rule for testing',
        priority: 200,
        enabled: false,
        version: 7,
        tags: ['billing', 'critical'],
        group: 'billing',
        trigger: { type: 'fact', pattern: 'customer:*:status' },
        conditions: [
          { source: { type: 'fact', pattern: 'customer:*:age' }, operator: 'gte', value: 18 },
        ],
        actions: [
          { type: 'emit_event', topic: 'customer.verified', data: { verified: true } },
        ],
      });

      const entry = store.recordVersion(complexRule, 'registered');

      expect(entry.ruleSnapshot.description).toBe('A complex rule for testing');
      expect(entry.ruleSnapshot.tags).toEqual(['billing', 'critical']);
      expect(entry.ruleSnapshot.group).toBe('billing');
      expect(entry.ruleSnapshot.conditions).toHaveLength(1);
      expect(entry.ruleSnapshot.actions).toHaveLength(1);
    });

    it('diff detects group field change', () => {
      store.recordVersion(createRule({ group: undefined }), 'registered');
      store.recordVersion(createRule({ group: 'billing' }), 'updated');

      const diff = store.diff('test-rule', 1, 2);
      const groupChange = diff!.changes.find(c => c.field === 'group');

      expect(groupChange).toBeDefined();
      expect(groupChange!.oldValue).toBeUndefined();
      expect(groupChange!.newValue).toBe('billing');
    });

    it('diff detects conditions change', () => {
      store.recordVersion(createRule({ conditions: [] }), 'registered');
      store.recordVersion(
        createRule({
          conditions: [{ source: { type: 'fact', pattern: 'x' }, operator: 'eq', value: 1 }],
        }),
        'updated',
      );

      const diff = store.diff('test-rule', 1, 2);
      const conditionsChange = diff!.changes.find(c => c.field === 'conditions');

      expect(conditionsChange).toBeDefined();
      expect(conditionsChange!.oldValue).toEqual([]);
      expect((conditionsChange!.newValue as unknown[]).length).toBe(1);
    });

    it('diff detects actions change', () => {
      store.recordVersion(
        createRule({ actions: [{ type: 'log', level: 'info', message: 'old' }] }),
        'registered',
      );
      store.recordVersion(
        createRule({ actions: [{ type: 'log', level: 'error', message: 'new' }] }),
        'updated',
      );

      const diff = store.diff('test-rule', 1, 2);
      const actionsChange = diff!.changes.find(c => c.field === 'actions');

      expect(actionsChange).toBeDefined();
    });
  });
});
