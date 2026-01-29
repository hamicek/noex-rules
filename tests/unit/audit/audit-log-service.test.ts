import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditLogService } from '../../../src/audit/audit-log-service';
import type { AuditEntry, AuditSubscriber } from '../../../src/audit/types';
import { AUDIT_EVENT_CATEGORIES } from '../../../src/audit/types';
import type { StorageAdapter, PersistedState } from '@hamicek/noex';

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

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(async () => {
    service = await AuditLogService.start(undefined, { flushIntervalMs: 0 });
  });

  afterEach(async () => {
    await service.stop();
  });

  describe('static start()', () => {
    it('creates an instance', async () => {
      const s = await AuditLogService.start();
      expect(s).toBeInstanceOf(AuditLogService);
      await s.stop();
    });

    it('creates an instance without adapter', async () => {
      const s = await AuditLogService.start(undefined, {
        maxMemoryEntries: 100,
        retentionMs: 1000,
        batchSize: 10,
        flushIntervalMs: 0,
      });
      expect(s).toBeInstanceOf(AuditLogService);
      await s.stop();
    });

    it('creates an instance with adapter', async () => {
      const adapter = createMemoryAdapter();
      const s = await AuditLogService.start(adapter, { flushIntervalMs: 0 });
      expect(s).toBeInstanceOf(AuditLogService);
      await s.stop();
    });
  });

  describe('record()', () => {
    it('records an entry and returns it', () => {
      const entry = service.record('rule_registered', { ruleId: 'r1' });

      expect(entry).toBeDefined();
      expect(entry.type).toBe('rule_registered');
      expect(entry.category).toBe('rule_management');
      expect(entry.details).toEqual({ ruleId: 'r1' });
    });

    it('generates id and timestamp automatically', () => {
      const before = Date.now();
      const entry = service.record('engine_started', {});
      const after = Date.now();

      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it('accepts custom id and timestamp', () => {
      const entry = service.record('engine_started', {}, {
        id: 'custom-id',
        timestamp: 1_700_000_000_000,
      });

      expect(entry.id).toBe('custom-id');
      expect(entry.timestamp).toBe(1_700_000_000_000);
    });

    it('derives category from event type via AUDIT_EVENT_CATEGORIES', () => {
      for (const [type, expectedCategory] of Object.entries(AUDIT_EVENT_CATEGORIES)) {
        const entry = service.record(type as any, {});
        expect(entry.category).toBe(expectedCategory);
      }
    });

    it('generates a human-readable default summary', () => {
      const entry = service.record('rule_registered', {});
      expect(entry.summary).toBe('Rule registered');
    });

    it('uses "rule-engine" as default source', () => {
      const entry = service.record('engine_started', {});
      expect(entry.source).toBe('rule-engine');
    });

    it('accepts custom source', () => {
      const entry = service.record('engine_started', {}, { source: 'api' });
      expect(entry.source).toBe('api');
    });

    it('accepts custom summary', () => {
      const entry = service.record('rule_registered', {}, { summary: 'Custom summary' });
      expect(entry.summary).toBe('Custom summary');
    });

    it('records optional fields when provided', () => {
      const entry = service.record('rule_executed', { output: 'ok' }, {
        ruleId: 'rule-1',
        ruleName: 'My Rule',
        correlationId: 'corr-123',
        durationMs: 42,
      });

      expect(entry.ruleId).toBe('rule-1');
      expect(entry.ruleName).toBe('My Rule');
      expect(entry.correlationId).toBe('corr-123');
      expect(entry.durationMs).toBe(42);
    });

    it('omits optional fields when not provided', () => {
      const entry = service.record('engine_started', {});

      expect('ruleId' in entry).toBe(false);
      expect('ruleName' in entry).toBe(false);
      expect('correlationId' in entry).toBe(false);
      expect('durationMs' in entry).toBe(false);
    });

    it('increments size', () => {
      expect(service.size).toBe(0);
      service.record('engine_started', {});
      expect(service.size).toBe(1);
      service.record('engine_stopped', {});
      expect(service.size).toBe(2);
    });
  });

  describe('getById()', () => {
    it('retrieves entry by id', () => {
      const recorded = service.record('engine_started', {}, { id: 'test-id' });
      const found = service.getById('test-id');

      expect(found).toBe(recorded);
    });

    it('returns undefined for non-existing id', () => {
      expect(service.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      service.record('rule_registered', { name: 'A' }, {
        id: 'e1', ruleId: 'rule-1', source: 'api', correlationId: 'c1', timestamp: 1000,
      });
      service.record('rule_executed', { result: true }, {
        id: 'e2', ruleId: 'rule-1', source: 'rule-engine', correlationId: 'c1', timestamp: 2000,
      });
      service.record('fact_created', { key: 'temp' }, {
        id: 'e3', source: 'rule-engine', correlationId: 'c2', timestamp: 3000,
      });
      service.record('rule_failed', { error: 'timeout' }, {
        id: 'e4', ruleId: 'rule-2', source: 'rule-engine', correlationId: 'c1', timestamp: 4000,
      });
      service.record('event_emitted', { topic: 'alert' }, {
        id: 'e5', source: 'api', timestamp: 5000,
      });
    });

    it('returns all entries when no filter given', () => {
      const result = service.query({});
      expect(result.entries).toHaveLength(5);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('returns entries in chronological order', () => {
      const result = service.query({});
      expect(result.entries.map(e => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    });

    it('filters by category', () => {
      const result = service.query({ category: 'rule_execution' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.category === 'rule_execution')).toBe(true);
    });

    it('filters by single type', () => {
      const result = service.query({ types: ['rule_registered'] });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('e1');
    });

    it('filters by multiple types', () => {
      const result = service.query({ types: ['rule_registered', 'rule_failed'] });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.id)).toEqual(['e1', 'e4']);
    });

    it('filters by ruleId', () => {
      const result = service.query({ ruleId: 'rule-1' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.ruleId === 'rule-1')).toBe(true);
    });

    it('filters by source', () => {
      const result = service.query({ source: 'api' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.source === 'api')).toBe(true);
    });

    it('filters by correlationId', () => {
      const result = service.query({ correlationId: 'c1' });
      expect(result.entries).toHaveLength(3);
      expect(result.entries.every(e => e.correlationId === 'c1')).toBe(true);
    });

    it('filters by time range (from)', () => {
      const result = service.query({ from: 3000 });
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0].id).toBe('e3');
    });

    it('filters by time range (to)', () => {
      const result = service.query({ to: 2000 });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.id)).toEqual(['e1', 'e2']);
    });

    it('filters by time range (from + to)', () => {
      const result = service.query({ from: 2000, to: 4000 });
      expect(result.entries).toHaveLength(3);
      expect(result.entries.map(e => e.id)).toEqual(['e2', 'e3', 'e4']);
    });

    it('combines multiple filters', () => {
      const result = service.query({ source: 'rule-engine', correlationId: 'c1' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.id)).toEqual(['e2', 'e4']);
    });

    it('paginates with limit', () => {
      const result = service.query({ limit: 2 });
      expect(result.entries).toHaveLength(2);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('paginates with offset', () => {
      const result = service.query({ offset: 3, limit: 10 });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.id)).toEqual(['e4', 'e5']);
      expect(result.hasMore).toBe(false);
    });

    it('paginates with offset and limit', () => {
      const result = service.query({ offset: 1, limit: 2 });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.id)).toEqual(['e2', 'e3']);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('returns empty result for non-matching filter', () => {
      const result = service.query({ ruleId: 'nonexistent' });
      expect(result.entries).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('reports queryTimeMs', () => {
      const result = service.query({});
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('subscribe()', () => {
    it('notifies subscriber of new entries', () => {
      const received: AuditEntry[] = [];
      service.subscribe(entry => received.push(entry));

      service.record('rule_registered', { name: 'A' });
      service.record('engine_started', {});

      expect(received).toHaveLength(2);
      expect(received[0].type).toBe('rule_registered');
      expect(received[1].type).toBe('engine_started');
    });

    it('returns unsubscribe function', () => {
      const received: AuditEntry[] = [];
      const unsubscribe = service.subscribe(entry => received.push(entry));

      service.record('engine_started', {});
      unsubscribe();
      service.record('engine_stopped', {});

      expect(received).toHaveLength(1);
    });

    it('supports multiple subscribers', () => {
      const received1: AuditEntry[] = [];
      const received2: AuditEntry[] = [];

      service.subscribe(entry => received1.push(entry));
      service.subscribe(entry => received2.push(entry));

      service.record('engine_started', {});

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('isolates subscriber errors', () => {
      const received: AuditEntry[] = [];

      service.subscribe(() => { throw new Error('broken'); });
      service.subscribe(entry => received.push(entry));

      service.record('engine_started', {});

      expect(received).toHaveLength(1);
    });
  });

  describe('getStats()', () => {
    it('returns empty stats initially', () => {
      const stats = service.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.memoryEntries).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
      expect(stats.subscribersCount).toBe(0);
      expect(stats.entriesByCategory).toEqual({
        rule_management: 0,
        rule_execution: 0,
        fact_change: 0,
        event_emitted: 0,
        system: 0,
      });
    });

    it('tracks entries by category', () => {
      service.record('rule_registered', {});
      service.record('rule_executed', {});
      service.record('rule_failed', {});
      service.record('fact_created', {});
      service.record('engine_started', {});

      const stats = service.getStats();
      expect(stats.totalEntries).toBe(5);
      expect(stats.memoryEntries).toBe(5);
      expect(stats.entriesByCategory.rule_management).toBe(1);
      expect(stats.entriesByCategory.rule_execution).toBe(2);
      expect(stats.entriesByCategory.fact_change).toBe(1);
      expect(stats.entriesByCategory.system).toBe(1);
      expect(stats.entriesByCategory.event_emitted).toBe(0);
    });

    it('reports oldest and newest timestamps', () => {
      service.record('engine_started', {}, { timestamp: 1000 });
      service.record('rule_registered', {}, { timestamp: 5000 });
      service.record('engine_stopped', {}, { timestamp: 3000 });

      const stats = service.getStats();
      expect(stats.oldestEntry).toBe(1000);
      expect(stats.newestEntry).toBe(3000);
    });

    it('reports subscriber count', () => {
      const unsub1 = service.subscribe(() => {});
      service.subscribe(() => {});

      expect(service.getStats().subscribersCount).toBe(2);

      unsub1();
      expect(service.getStats().subscribersCount).toBe(1);
    });
  });

  describe('ring buffer behavior', () => {
    it('enforces maxMemoryEntries limit', async () => {
      const s = await AuditLogService.start(undefined, {
        maxMemoryEntries: 10,
        flushIntervalMs: 0,
      });

      for (let i = 0; i < 15; i++) {
        s.record('engine_started', {}, { id: `e${i}` });
      }

      expect(s.size).toBeLessThanOrEqual(10);
      await s.stop();
    });

    it('preserves newest entries when evicting', async () => {
      const s = await AuditLogService.start(undefined, {
        maxMemoryEntries: 5,
        flushIntervalMs: 0,
      });

      for (let i = 0; i < 10; i++) {
        s.record('engine_started', {}, { id: `e${i}`, timestamp: i * 1000 });
      }

      expect(s.getById('e9')).toBeDefined();
      expect(s.getById('e0')).toBeUndefined();
      await s.stop();
    });

    it('removes evicted entries from indexes', async () => {
      const s = await AuditLogService.start(undefined, {
        maxMemoryEntries: 5,
        flushIntervalMs: 0,
      });

      for (let i = 0; i < 10; i++) {
        s.record('rule_executed', {}, {
          id: `e${i}`,
          ruleId: 'same-rule',
          timestamp: i * 1000,
        });
      }

      const result = s.query({ ruleId: 'same-rule' });
      expect(result.entries.length).toBeLessThanOrEqual(5);
      await s.stop();
    });

    it('evicts approximately 10% when limit is reached', async () => {
      const s = await AuditLogService.start(undefined, {
        maxMemoryEntries: 100,
        flushIntervalMs: 0,
      });

      for (let i = 0; i < 105; i++) {
        s.record('engine_started', {}, { id: `e${i}`, timestamp: i * 1000 });
      }

      expect(s.size).toBeLessThanOrEqual(100);
      expect(s.size).toBeGreaterThanOrEqual(90);
      await s.stop();
    });
  });

  describe('clear()', () => {
    it('removes all entries', () => {
      service.record('engine_started', {}, { id: 'e1' });
      service.record('engine_stopped', {}, { id: 'e2' });

      service.clear();

      expect(service.size).toBe(0);
    });

    it('clears all indexes', () => {
      service.record('rule_executed', {}, {
        id: 'e1',
        ruleId: 'rule-1',
        correlationId: 'c1',
        source: 'api',
      });

      service.clear();

      expect(service.getById('e1')).toBeUndefined();
      expect(service.query({ ruleId: 'rule-1' }).entries).toEqual([]);
      expect(service.query({ correlationId: 'c1' }).entries).toEqual([]);
      expect(service.query({ source: 'api' }).entries).toEqual([]);
      expect(service.query({ category: 'rule_execution' }).entries).toEqual([]);
      expect(service.query({ types: ['rule_executed'] }).entries).toEqual([]);
    });
  });

  describe('persistence (flush)', () => {
    let adapter: ReturnType<typeof createMemoryAdapter>;

    beforeEach(async () => {
      adapter = createMemoryAdapter();
      await service.stop();
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0, batchSize: 1000 });
    });

    it('flushes entries to storage', async () => {
      service.record('engine_started', {}, { timestamp: 1_700_000_000_000 });
      service.record('engine_stopped', {}, { timestamp: 1_700_000_000_500 });

      await service.flush();

      expect(adapter.store.size).toBeGreaterThan(0);
    });

    it('groups entries into hourly time buckets', async () => {
      // Two entries in the same hour
      const baseTime = Date.UTC(2024, 5, 15, 10, 0, 0);
      service.record('engine_started', {}, { timestamp: baseTime });
      service.record('engine_stopped', {}, { timestamp: baseTime + 30 * 60_000 });

      // One entry in the next hour
      service.record('rule_registered', {}, { timestamp: baseTime + 90 * 60_000 });

      await service.flush();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('audit-log:2024-06-15T10');
      expect(keys).toContain('audit-log:2024-06-15T11');
    });

    it('merges with existing bucket data', async () => {
      const baseTime = Date.UTC(2024, 5, 15, 10, 0, 0);

      service.record('engine_started', {}, { id: 'e1', timestamp: baseTime });
      await service.flush();

      service.record('engine_stopped', {}, { id: 'e2', timestamp: baseTime + 1000 });
      await service.flush();

      const persisted = await adapter.load<{ entries: AuditEntry[] }>('audit-log:2024-06-15T10');
      expect(persisted).toBeDefined();
      expect(persisted!.state.entries).toHaveLength(2);
      expect(persisted!.state.entries.map(e => e.id)).toEqual(['e1', 'e2']);
    });

    it('sets correct metadata on persisted state', async () => {
      service.record('engine_started', {}, { timestamp: Date.UTC(2024, 0, 1, 0, 0, 0) });
      await service.flush();

      const persisted = await adapter.load<{ entries: AuditEntry[] }>('audit-log:2024-01-01T00');
      expect(persisted).toBeDefined();
      expect(persisted!.metadata.serverId).toBe('audit-log');
      expect(persisted!.metadata.schemaVersion).toBe(1);
      expect(persisted!.metadata.persistedAt).toBeGreaterThan(0);
    });

    it('is a no-op when nothing is pending', async () => {
      const saveSpy = vi.spyOn(adapter, 'save');

      await service.flush();

      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('auto-flushes when batchSize is reached', async () => {
      await service.stop();
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0, batchSize: 3 });

      service.record('engine_started', {}, { timestamp: Date.UTC(2024, 0, 1, 0) });
      service.record('rule_registered', {}, { timestamp: Date.UTC(2024, 0, 1, 0) });
      // No flush yet
      expect(adapter.store.size).toBe(0);

      // Third record triggers auto-flush
      service.record('rule_executed', {}, { timestamp: Date.UTC(2024, 0, 1, 0) });

      // Give the async flush a tick to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(adapter.store.size).toBeGreaterThan(0);
    });
  });

  describe('cleanup()', () => {
    it('removes old entries from memory', async () => {
      const now = Date.now();
      service.record('engine_started', {}, { id: 'old', timestamp: now - 100_000 });
      service.record('engine_stopped', {}, { id: 'new', timestamp: now });

      const removed = await service.cleanup(50_000);

      expect(removed).toBe(1);
      expect(service.size).toBe(1);
      expect(service.getById('old')).toBeUndefined();
      expect(service.getById('new')).toBeDefined();
    });

    it('removes old buckets from storage', async () => {
      const adapter = createMemoryAdapter();
      await service.stop();
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0 });

      const oldTime = Date.UTC(2023, 0, 1, 10, 0, 0);
      const recentTime = Date.now();

      service.record('engine_started', {}, { timestamp: oldTime });
      service.record('engine_stopped', {}, { timestamp: recentTime });
      await service.flush();

      expect((await adapter.listKeys('audit-log:')).length).toBeGreaterThanOrEqual(1);

      // Cleanup with 1 day retention should remove the old bucket
      await service.cleanup(24 * 60 * 60 * 1000);

      // Old bucket from 2023 should be gone
      expect(await adapter.exists('audit-log:2023-01-01T10')).toBe(false);
    });

    it('returns 0 when no entries are old enough', async () => {
      service.record('engine_started', {}, { timestamp: Date.now() });

      const removed = await service.cleanup(60_000);

      expect(removed).toBe(0);
      expect(service.size).toBe(1);
    });
  });

  describe('stop()', () => {
    it('flushes pending entries before stopping', async () => {
      const adapter = createMemoryAdapter();
      await service.stop();
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0 });

      service.record('engine_started', {}, { timestamp: Date.UTC(2024, 0, 1, 0) });

      await service.stop();

      expect(adapter.store.size).toBeGreaterThan(0);
    });

    it('is safe to call multiple times', async () => {
      await service.stop();
      await service.stop();
    });
  });

  describe('flush timer', () => {
    it('periodically flushes entries when interval is set', async () => {
      vi.useFakeTimers();
      const adapter = createMemoryAdapter();

      const s = await AuditLogService.start(adapter, { flushIntervalMs: 100 });
      s.record('engine_started', {}, { timestamp: Date.UTC(2024, 0, 1, 0) });

      expect(adapter.store.size).toBe(0);

      await vi.advanceTimersByTimeAsync(150);

      expect(adapter.store.size).toBeGreaterThan(0);

      await s.stop();
      vi.useRealTimers();
    });
  });

  describe('index selection efficiency', () => {
    beforeEach(() => {
      for (let i = 0; i < 50; i++) {
        service.record('rule_executed', {}, {
          id: `bulk-${i}`,
          ruleId: `rule-${i % 5}`,
          source: `src-${i % 3}`,
          correlationId: `c-${i % 10}`,
          timestamp: 1000 + i,
        });
      }
    });

    it('uses correlationId index for correlationId filter', () => {
      const result = service.query({ correlationId: 'c-0' });
      expect(result.entries.every(e => e.correlationId === 'c-0')).toBe(true);
      expect(result.entries.length).toBe(5);
    });

    it('uses ruleId index for ruleId filter', () => {
      const result = service.query({ ruleId: 'rule-0' });
      expect(result.entries.every(e => e.ruleId === 'rule-0')).toBe(true);
      expect(result.entries.length).toBe(10);
    });

    it('uses source index for source filter', () => {
      const result = service.query({ source: 'src-0' });
      expect(result.entries.every(e => e.source === 'src-0')).toBe(true);
    });

    it('uses type index for single-type filter', () => {
      service.record('fact_created', {}, { id: 'fact-1', timestamp: 2000 });
      const result = service.query({ types: ['fact_created'] });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('fact-1');
    });

    it('uses category index for category filter', () => {
      service.record('fact_created', {}, { id: 'fact-1', timestamp: 2000 });
      const result = service.query({ category: 'fact_change' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('fact-1');
    });

    it('combines index-accelerated and post-filter correctly', () => {
      const result = service.query({
        ruleId: 'rule-0',
        source: 'src-0',
      });
      expect(result.entries.every(e => e.ruleId === 'rule-0' && e.source === 'src-0')).toBe(true);
    });
  });
});
