import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { AuditLogService } from '../../src/audit/audit-log-service.js';
import type { AuditEntry, AuditSubscriber } from '../../src/audit/types.js';

describe('AuditLogService', () => {
  let service: AuditLogService;

  afterEach(async () => {
    await service.stop();
  });

  describe('record', () => {
    beforeEach(async () => {
      service = await AuditLogService.start();
    });

    it('creates entry with auto-generated id and timestamp', () => {
      const entry = service.record('rule_registered', { ruleId: 'r1' });

      expect(entry.id).toBeTruthy();
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('auto-categorizes from event type', () => {
      expect(service.record('rule_registered', {}).category).toBe('rule_management');
      expect(service.record('rule_executed', {}).category).toBe('rule_execution');
      expect(service.record('fact_created', {}).category).toBe('fact_change');
      expect(service.record('event_emitted', {}).category).toBe('event_emitted');
      expect(service.record('engine_started', {}).category).toBe('system');
    });

    it('generates human-readable summary from type', () => {
      const entry = service.record('rule_registered', {});
      expect(entry.summary).toBe('Rule registered');
    });

    it('defaults source to rule-engine', () => {
      const entry = service.record('engine_started', {});
      expect(entry.source).toBe('rule-engine');
    });

    it('uses provided options', () => {
      const entry = service.record('rule_executed', { elapsed: 42 }, {
        id: 'custom-id',
        timestamp: 1000,
        summary: 'Custom summary',
        source: 'api',
        ruleId: 'r1',
        ruleName: 'myRule',
        correlationId: 'corr-1',
        durationMs: 42,
      });

      expect(entry.id).toBe('custom-id');
      expect(entry.timestamp).toBe(1000);
      expect(entry.summary).toBe('Custom summary');
      expect(entry.source).toBe('api');
      expect(entry.ruleId).toBe('r1');
      expect(entry.ruleName).toBe('myRule');
      expect(entry.correlationId).toBe('corr-1');
      expect(entry.durationMs).toBe(42);
      expect(entry.details).toEqual({ elapsed: 42 });
    });

    it('omits optional fields when not provided', () => {
      const entry = service.record('engine_started', {});

      expect(entry).not.toHaveProperty('ruleId');
      expect(entry).not.toHaveProperty('ruleName');
      expect(entry).not.toHaveProperty('correlationId');
      expect(entry).not.toHaveProperty('durationMs');
    });

    it('returns the created entry', () => {
      const entry = service.record('fact_created', { key: 'temp', value: 25 });

      expect(entry.type).toBe('fact_created');
      expect(entry.details).toEqual({ key: 'temp', value: 25 });
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      service = await AuditLogService.start();

      service.record('rule_registered', {}, { ruleId: 'r1', ruleName: 'alpha', source: 'api', timestamp: 100, correlationId: 'c1' });
      service.record('rule_executed', {}, { ruleId: 'r1', source: 'rule-engine', timestamp: 200, correlationId: 'c1' });
      service.record('fact_created', { key: 'temp' }, { source: 'rule-engine', timestamp: 300 });
      service.record('rule_registered', {}, { ruleId: 'r2', ruleName: 'beta', source: 'api', timestamp: 400 });
      service.record('event_emitted', { topic: 'alert' }, { source: 'rule-engine', timestamp: 500 });
    });

    it('returns all entries when no filter is applied', () => {
      const result = service.query({});

      expect(result.entries).toHaveLength(5);
      expect(result.totalCount).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('filters by category', () => {
      const result = service.query({ category: 'rule_management' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.category === 'rule_management')).toBe(true);
    });

    it('filters by event types', () => {
      const result = service.query({ types: ['rule_registered', 'rule_executed'] });

      expect(result.entries).toHaveLength(3);
      expect(result.entries.every(e => ['rule_registered', 'rule_executed'].includes(e.type))).toBe(true);
    });

    it('filters by ruleId', () => {
      const result = service.query({ ruleId: 'r1' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.ruleId === 'r1')).toBe(true);
    });

    it('filters by source', () => {
      const result = service.query({ source: 'api' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.source === 'api')).toBe(true);
    });

    it('filters by correlationId', () => {
      const result = service.query({ correlationId: 'c1' });

      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.correlationId === 'c1')).toBe(true);
    });

    it('filters by time range (from/to)', () => {
      const result = service.query({ from: 200, to: 400 });

      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]!.timestamp).toBe(200);
      expect(result.entries[2]!.timestamp).toBe(400);
    });

    it('supports pagination with limit and offset', () => {
      const page1 = service.query({ limit: 2, offset: 0 });
      const page2 = service.query({ limit: 2, offset: 2 });
      const page3 = service.query({ limit: 2, offset: 4 });

      expect(page1.entries).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      expect(page2.entries).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      expect(page3.entries).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it('returns totalCount before pagination', () => {
      const result = service.query({ limit: 2 });

      expect(result.entries).toHaveLength(2);
      expect(result.totalCount).toBe(5);
    });

    it('returns results in chronological order', () => {
      const result = service.query({});
      const timestamps = result.entries.map(e => e.timestamp);

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }
    });

    it('combines multiple filters', () => {
      const result = service.query({ category: 'rule_management', source: 'api', ruleId: 'r1' });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.ruleId).toBe('r1');
      expect(result.entries[0]!.source).toBe('api');
    });

    it('returns queryTimeMs', () => {
      const result = service.query({});
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty result for non-matching filter', () => {
      const result = service.query({ ruleId: 'nonexistent' });

      expect(result.entries).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getById', () => {
    beforeEach(async () => {
      service = await AuditLogService.start();
    });

    it('returns entry by id', () => {
      const recorded = service.record('engine_started', {}, { id: 'lookup-id' });
      const found = service.getById('lookup-id');

      expect(found).toBe(recorded);
    });

    it('returns undefined for unknown id', () => {
      expect(service.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('ring buffer', () => {
    it('evicts oldest entries when maxMemoryEntries is reached', async () => {
      service = await AuditLogService.start(undefined, { maxMemoryEntries: 20 });

      for (let i = 0; i < 25; i++) {
        service.record('fact_created', { i }, { timestamp: i });
      }

      // 20 capacity, evicts ~10% (2) when full, so after 25 inserts:
      // at entry 20 → evict 2, size becomes 18, add = 19
      // at entry 22 → evict 2, size becomes 18+2=20 → evict 2 = 18, add = 19
      // continuing... final size should be <= 20
      expect(service.size).toBeLessThanOrEqual(20);
      expect(service.size).toBeGreaterThan(0);
    });

    it('maintains index consistency after eviction', async () => {
      service = await AuditLogService.start(undefined, { maxMemoryEntries: 10 });

      for (let i = 0; i < 15; i++) {
        service.record('rule_executed', { i }, { ruleId: `r${i}`, timestamp: i });
      }

      // Oldest entries are evicted — querying for their ruleId should return nothing
      const result = service.query({ ruleId: 'r0' });
      expect(result.entries).toHaveLength(0);

      // Recent entries should still be queryable
      const recent = service.query({ ruleId: 'r14' });
      expect(recent.entries).toHaveLength(1);
    });

    it('evicts approximately 10% at a time', async () => {
      service = await AuditLogService.start(undefined, { maxMemoryEntries: 100 });

      // Fill to capacity
      for (let i = 0; i < 100; i++) {
        service.record('fact_created', { i }, { timestamp: i });
      }
      expect(service.size).toBe(100);

      // One more triggers eviction of ~10 entries
      service.record('fact_created', { i: 100 }, { timestamp: 100 });
      expect(service.size).toBe(91); // 100 - 10 + 1
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      service = await AuditLogService.start();
    });

    it('notifies subscriber on new entries', () => {
      const received: AuditEntry[] = [];
      service.subscribe(entry => received.push(entry));

      service.record('engine_started', {});

      expect(received).toHaveLength(1);
      expect(received[0]!.type).toBe('engine_started');
    });

    it('returns unsubscribe function', () => {
      const received: AuditEntry[] = [];
      const unsub = service.subscribe(entry => received.push(entry));

      service.record('engine_started', {});
      unsub();
      service.record('engine_stopped', {});

      expect(received).toHaveLength(1);
    });

    it('does not notify after unsubscribe', () => {
      const received: AuditEntry[] = [];
      const unsub = service.subscribe(entry => received.push(entry));
      unsub();

      service.record('engine_started', {});

      expect(received).toHaveLength(0);
    });

    it('ignores subscriber errors', () => {
      service.subscribe(() => {
        throw new Error('boom');
      });

      // Should not throw
      expect(() => service.record('engine_started', {})).not.toThrow();
      expect(service.size).toBe(1);
    });

    it('supports multiple subscribers', () => {
      const a: AuditEntry[] = [];
      const b: AuditEntry[] = [];
      service.subscribe(entry => a.push(entry));
      service.subscribe(entry => b.push(entry));

      service.record('engine_started', {});

      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    });
  });

  describe('flush', () => {
    let adapter: MemoryAdapter;

    beforeEach(async () => {
      adapter = new MemoryAdapter();
      // Disable auto-flush timer so we control flush timing
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0 });
    });

    it('persists entries to storage adapter', async () => {
      service.record('engine_started', {}, { timestamp: Date.now() });
      await service.flush();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys.length).toBeGreaterThan(0);
    });

    it('groups entries by hourly time bucket', async () => {
      // Two entries in different hours
      const hour1 = Date.UTC(2025, 0, 15, 10, 30);
      const hour2 = Date.UTC(2025, 0, 15, 11, 30);
      service.record('engine_started', {}, { timestamp: hour1 });
      service.record('engine_stopped', {}, { timestamp: hour2 });

      await service.flush();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('audit-log:2025-01-15T10');
      expect(keys).toContain('audit-log:2025-01-15T11');
    });

    it('merges with existing bucket data', async () => {
      const hour = Date.UTC(2025, 0, 15, 10, 0);

      service.record('engine_started', {}, { timestamp: hour });
      await service.flush();

      service.record('engine_stopped', {}, { timestamp: hour + 1000 });
      await service.flush();

      const data = await adapter.load<{ entries: AuditEntry[] }>('audit-log:2025-01-15T10');
      expect(data!.state.entries).toHaveLength(2);
    });

    it('clears pending entries after flush', async () => {
      service.record('engine_started', {}, { timestamp: Date.now() });
      await service.flush();
      // Second flush should be a no-op (nothing pending)
      await service.flush();

      const keys = await adapter.listKeys('audit-log:');
      const data = await adapter.load<{ entries: AuditEntry[] }>(keys[0]!);
      expect(data!.state.entries).toHaveLength(1);
    });

    it('is a no-op without adapter', async () => {
      const noAdapterService = await AuditLogService.start();
      noAdapterService.record('engine_started', {});
      // Should not throw
      await noAdapterService.flush();
      await noAdapterService.stop();
    });

    it('auto-flushes when batch size is reached', async () => {
      const batchAdapter = new MemoryAdapter();
      const batchService = await AuditLogService.start(batchAdapter, {
        batchSize: 3,
        flushIntervalMs: 0,
      });

      const now = Date.now();
      batchService.record('fact_created', {}, { timestamp: now });
      batchService.record('fact_updated', {}, { timestamp: now + 1 });

      // Not flushed yet (2 < 3)
      let keys = await batchAdapter.listKeys('audit-log:');
      expect(keys).toHaveLength(0);

      // Third entry triggers auto-flush
      batchService.record('fact_deleted', {}, { timestamp: now + 2 });

      // Auto-flush is async (void), give it a tick
      await new Promise(resolve => setTimeout(resolve, 10));

      keys = await batchAdapter.listKeys('audit-log:');
      expect(keys.length).toBeGreaterThan(0);

      await batchService.stop();
    });
  });

  describe('cleanup', () => {
    it('removes entries older than retention from memory', async () => {
      service = await AuditLogService.start();

      const now = Date.now();
      service.record('engine_started', {}, { timestamp: now - 10_000 });
      service.record('fact_created', {}, { timestamp: now - 5_000 });
      service.record('engine_stopped', {}, { timestamp: now });

      const removed = await service.cleanup(8_000);

      expect(removed).toBe(1);
      expect(service.size).toBe(2);
    });

    it('removes storage buckets older than retention', async () => {
      const adapter = new MemoryAdapter();
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0 });

      // Two entries separated by 2 hours
      const oldTime = Date.UTC(2025, 0, 1, 10, 0);    // bucket: 2025-01-01T10
      const recentTime = Date.UTC(2025, 0, 1, 12, 0);  // bucket: 2025-01-01T12

      service.record('engine_started', {}, { timestamp: oldTime });
      service.record('engine_stopped', {}, { timestamp: recentTime });
      await service.flush();

      // A bucket is deleted when its END (start + 1h) is before the cutoff.
      // Old bucket ends at 11:00. We set Date.now() = 12:00 and maxAgeMs
      // just under 1h so cutoff = 12:00 - 0:59:59.999 = 11:00:00.001.
      // 11:00 < 11:00:00.001 → old bucket deleted.
      // Recent bucket ends at 13:00 → 13:00 < 11:00:00.001 → false → kept.
      vi.spyOn(Date, 'now').mockReturnValue(recentTime);
      await service.cleanup(HOUR_MS - 1);
      vi.restoreAllMocks();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys).not.toContain('audit-log:2025-01-01T10');
      expect(keys).toContain('audit-log:2025-01-01T12');
    });

    it('returns count of removed memory entries', async () => {
      service = await AuditLogService.start();

      const now = Date.now();
      service.record('engine_started', {}, { timestamp: now - 20_000 });
      service.record('fact_created', {}, { timestamp: now - 15_000 });
      service.record('engine_stopped', {}, { timestamp: now });

      const removed = await service.cleanup(12_000);
      expect(removed).toBe(2);
    });

    it('accepts custom maxAgeMs', async () => {
      service = await AuditLogService.start();

      const now = Date.now();
      service.record('engine_started', {}, { timestamp: now - 5_000 });
      service.record('engine_stopped', {}, { timestamp: now });

      const removed = await service.cleanup(3_000);
      expect(removed).toBe(1);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      service = await AuditLogService.start();
    });

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

    it('returns correct counts after recording', () => {
      service.record('rule_registered', {});
      service.record('rule_executed', {});
      service.record('fact_created', {});

      const stats = service.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.memoryEntries).toBe(3);
    });

    it('tracks entries by category', () => {
      service.record('rule_registered', {});
      service.record('rule_unregistered', {});
      service.record('rule_executed', {});
      service.record('fact_created', {});
      service.record('event_emitted', {});
      service.record('engine_started', {});

      const stats = service.getStats();
      expect(stats.entriesByCategory.rule_management).toBe(2);
      expect(stats.entriesByCategory.rule_execution).toBe(1);
      expect(stats.entriesByCategory.fact_change).toBe(1);
      expect(stats.entriesByCategory.event_emitted).toBe(1);
      expect(stats.entriesByCategory.system).toBe(1);
    });

    it('tracks oldest and newest timestamps', () => {
      service.record('engine_started', {}, { timestamp: 1000 });
      service.record('fact_created', {}, { timestamp: 2000 });
      service.record('engine_stopped', {}, { timestamp: 3000 });

      const stats = service.getStats();
      expect(stats.oldestEntry).toBe(1000);
      expect(stats.newestEntry).toBe(3000);
    });

    it('tracks subscriber count', () => {
      const unsub1 = service.subscribe(() => {});
      service.subscribe(() => {});

      expect(service.getStats().subscribersCount).toBe(2);

      unsub1();
      expect(service.getStats().subscribersCount).toBe(1);
    });

    it('totalEntries counts all-time even after eviction', async () => {
      const small = await AuditLogService.start(undefined, { maxMemoryEntries: 5 });

      for (let i = 0; i < 10; i++) {
        small.record('fact_created', { i }, { timestamp: i });
      }

      const stats = small.getStats();
      expect(stats.totalEntries).toBe(10);
      expect(stats.memoryEntries).toBeLessThanOrEqual(5);

      await small.stop();
    });
  });

  describe('stop', () => {
    it('flushes remaining entries', async () => {
      const adapter = new MemoryAdapter();
      service = await AuditLogService.start(adapter, { flushIntervalMs: 0 });

      service.record('engine_started', {}, { timestamp: Date.now() });
      await service.stop();

      const keys = await adapter.listKeys('audit-log:');
      expect(keys.length).toBeGreaterThan(0);
    });

    it('can be called multiple times safely', async () => {
      service = await AuditLogService.start();

      await service.stop();
      await service.stop();
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      service = await AuditLogService.start();
    });

    it('removes all in-memory entries and indexes', () => {
      service.record('rule_registered', {}, { ruleId: 'r1' });
      service.record('rule_executed', {}, { ruleId: 'r1' });
      service.record('fact_created', {});

      service.clear();

      expect(service.size).toBe(0);
      expect(service.getById('nonexistent')).toBeUndefined();
      expect(service.query({}).entries).toHaveLength(0);
      expect(service.query({ ruleId: 'r1' }).entries).toHaveLength(0);
    });
  });
});

const HOUR_MS = 3_600_000;
