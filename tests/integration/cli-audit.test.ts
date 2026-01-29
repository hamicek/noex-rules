import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryAdapter } from '@hamicek/noex';
import { RuleEngineServer } from '../../src/api/server';
import { ServerClient } from '../../src/cli/services/server-client';
import type { RuleInput } from '../../src/types/rule';
import type { AuditEntry, AuditQueryResult, AuditStats } from '../../src/audit/types';

const testRule: RuleInput = {
  id: 'audit-cli-rule',
  name: 'Audit CLI Test Rule',
  priority: 10,
  enabled: true,
  tags: ['test'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 50 },
  ],
  actions: [
    { type: 'set_fact', key: 'order:processed', value: true },
    { type: 'emit_event', topic: 'order.processed', data: { status: 'done' } },
  ],
};

const skippedRule: RuleInput = {
  id: 'skipped-rule',
  name: 'Skipped Rule',
  priority: 5,
  enabled: true,
  tags: ['test'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    { source: { type: 'event', field: 'amount' }, operator: 'gt', value: 99999 },
  ],
  actions: [
    { type: 'set_fact', key: 'never:reached', value: true },
  ],
};

describe('CLI Audit Integration', () => {
  let server: RuleEngineServer;
  let client: ServerClient;
  let serverUrl: string;

  beforeAll(async () => {
    const adapter = new MemoryAdapter();
    server = await RuleEngineServer.start({
      server: { port: 0, host: '127.0.0.1', logger: false, swagger: false },
      engineConfig: {
        name: 'cli-audit-test',
        audit: { adapter, flushIntervalMs: 0 },
      },
    });

    serverUrl = server.address;
    client = new ServerClient({ baseUrl: serverUrl });

    const engine = server.getEngine();
    engine.registerRule(testRule);
    engine.registerRule(skippedRule);

    await engine.setFact('customer:vip', true);
    await engine.setFact('customer:vip', false);
    engine.deleteFact('customer:vip');

    await engine.emit('order.created', { amount: 100, orderId: 'ord-1' });
    await engine.emit('order.created', { amount: 10, orderId: 'ord-2' });
  });

  afterAll(async () => {
    await server.stop();
  });

  // ---------------------------------------------------------------------------
  // GET /audit/entries — List entries
  // ---------------------------------------------------------------------------

  describe('list entries via ServerClient', () => {
    it('returns audit entries with expected structure', async () => {
      const result = await client.getAuditEntries({ limit: 100 });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.totalCount).toBeGreaterThan(0);
      expect(typeof result.queryTimeMs).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');

      const entry = result.entries[0]!;
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('summary');
      expect(entry).toHaveProperty('source');
      expect(entry).toHaveProperty('details');
    });

    it('returns engine_started as first entry', async () => {
      const result = await client.getAuditEntries({ types: ['engine_started'] });

      expect(result.totalCount).toBe(1);
      expect(result.entries[0]!.type).toBe('engine_started');
      expect(result.entries[0]!.category).toBe('system');
      expect(result.entries[0]!.details).toMatchObject({ name: 'cli-audit-test' });
    });

    it('filters by category', async () => {
      const result = await client.getAuditEntries({ category: 'rule_management' });

      expect(result.totalCount).toBeGreaterThanOrEqual(2);
      for (const entry of result.entries) {
        expect(entry.category).toBe('rule_management');
      }
    });

    it('filters by event types', async () => {
      const result = await client.getAuditEntries({
        types: ['rule_executed', 'rule_skipped'],
      });

      expect(result.totalCount).toBeGreaterThanOrEqual(2);
      for (const entry of result.entries) {
        expect(['rule_executed', 'rule_skipped']).toContain(entry.type);
      }
    });

    it('filters by ruleId', async () => {
      const result = await client.getAuditEntries({ ruleId: 'audit-cli-rule' });

      expect(result.totalCount).toBeGreaterThan(0);
      for (const entry of result.entries) {
        expect(entry.ruleId).toBe('audit-cli-rule');
      }
    });

    it('respects limit parameter', async () => {
      const result = await client.getAuditEntries({ limit: 2 });

      expect(result.entries.length).toBeLessThanOrEqual(2);
      if (result.totalCount > 2) {
        expect(result.hasMore).toBe(true);
      }
    });

    it('supports offset-based pagination', async () => {
      const first = await client.getAuditEntries({ limit: 3, offset: 0 });
      const second = await client.getAuditEntries({ limit: 3, offset: 3 });

      expect(first.entries.length).toBe(3);
      expect(second.entries.length).toBeGreaterThan(0);

      const firstIds = first.entries.map(e => e.id);
      const secondIds = second.entries.map(e => e.id);
      for (const id of secondIds) {
        expect(firstIds).not.toContain(id);
      }
    });

    it('contains fact_created, fact_updated, and fact_deleted entries', async () => {
      const result = await client.getAuditEntries({
        category: 'fact_change',
      });

      const types = result.entries.map(e => e.type);
      expect(types).toContain('fact_created');
      expect(types).toContain('fact_updated');
      expect(types).toContain('fact_deleted');
    });

    it('contains event_emitted entries', async () => {
      const result = await client.getAuditEntries({ category: 'event_emitted' });

      expect(result.totalCount).toBeGreaterThanOrEqual(2);
      for (const entry of result.entries) {
        expect(entry.type).toBe('event_emitted');
        expect(entry.details).toHaveProperty('topic');
      }
    });

    it('contains rule_executed and rule_skipped entries', async () => {
      const executed = await client.getAuditEntries({ types: ['rule_executed'] });
      const skipped = await client.getAuditEntries({ types: ['rule_skipped'] });

      expect(executed.totalCount).toBeGreaterThanOrEqual(1);
      expect(skipped.totalCount).toBeGreaterThanOrEqual(1);

      const execEntry = executed.entries[0]!;
      expect(execEntry.ruleId).toBe('audit-cli-rule');
      expect(execEntry.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /audit/entries/:id — Single entry
  // ---------------------------------------------------------------------------

  describe('get single entry via ServerClient', () => {
    it('returns entry by id', async () => {
      const list = await client.getAuditEntries({ limit: 1 });
      const id = list.entries[0]!.id;

      const entry = await client.getAuditEntry(id);

      expect(entry.id).toBe(id);
      expect(entry.timestamp).toBe(list.entries[0]!.timestamp);
      expect(entry.type).toBe(list.entries[0]!.type);
    });

    it('returns 404 for nonexistent id', async () => {
      await expect(
        client.getAuditEntry('nonexistent-id'),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /audit/stats — Statistics
  // ---------------------------------------------------------------------------

  describe('audit stats via ServerClient', () => {
    it('returns correct audit statistics', async () => {
      const stats = await client.getAuditStats();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.memoryEntries).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeTypeOf('number');
      expect(stats.newestEntry).toBeTypeOf('number');
      expect(stats.oldestEntry!).toBeLessThanOrEqual(stats.newestEntry!);
      expect(stats.entriesByCategory).toBeDefined();
      expect(stats.entriesByCategory.system).toBeGreaterThanOrEqual(1);
      expect(stats.entriesByCategory.rule_management).toBeGreaterThanOrEqual(2);
      expect(stats.entriesByCategory.fact_change).toBeGreaterThanOrEqual(3);
      expect(stats.entriesByCategory.event_emitted).toBeGreaterThanOrEqual(2);
      expect(stats.entriesByCategory.rule_execution).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /audit/export — Export
  // ---------------------------------------------------------------------------

  describe('audit export via ServerClient', () => {
    it('exports entries as JSON', async () => {
      const raw = await client.exportAudit({ format: 'json' });
      const entries = JSON.parse(raw) as AuditEntry[];

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]).toHaveProperty('id');
      expect(entries[0]).toHaveProperty('type');
      expect(entries[0]).toHaveProperty('category');
    });

    it('exports entries as CSV', async () => {
      const raw = await client.exportAudit({ format: 'csv' });
      const lines = raw.split('\n');

      expect(lines[0]).toBe(
        'id,timestamp,category,type,summary,source,ruleId,ruleName,correlationId,details,durationMs',
      );
      expect(lines.length).toBeGreaterThan(1);
    });

    it('exports with category filter', async () => {
      const raw = await client.exportAudit({
        format: 'json',
        category: 'system',
      });
      const entries = JSON.parse(raw) as AuditEntry[];

      for (const entry of entries) {
        expect(entry.category).toBe('system');
      }
    });

    it('exports with ruleId filter', async () => {
      const raw = await client.exportAudit({
        format: 'json',
        ruleId: 'audit-cli-rule',
      });
      const entries = JSON.parse(raw) as AuditEntry[];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.ruleId).toBe('audit-cli-rule');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // POST /audit/cleanup — Cleanup
  // ---------------------------------------------------------------------------

  describe('audit cleanup via ServerClient', () => {
    it('reports removal count and remaining count', async () => {
      const result = await client.cleanupAudit();

      expect(typeof result.removedCount).toBe('number');
      expect(typeof result.remainingCount).toBe('number');
      expect(result.remainingCount).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /audit/stream/stats — SSE stats (without open connection)
  // ---------------------------------------------------------------------------

  describe('audit SSE stats via HTTP', () => {
    it('returns stream statistics', async () => {
      const response = await fetch(`${serverUrl}/api/v1/audit/stream/stats`);
      const stats = await response.json();

      expect(response.ok).toBe(true);
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('totalEntriesSent');
      expect(stats.activeConnections).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // End-to-end: raw HTTP matches ServerClient
  // ---------------------------------------------------------------------------

  describe('raw HTTP parity with ServerClient', () => {
    it('GET /audit/entries returns same data via fetch and ServerClient', async () => {
      const clientResult = await client.getAuditEntries({ limit: 5 });
      const fetchResponse = await fetch(`${serverUrl}/api/v1/audit/entries?limit=5`);
      const fetchResult = (await fetchResponse.json()) as AuditQueryResult;

      expect(fetchResult.totalCount).toBe(clientResult.totalCount);
      expect(fetchResult.entries.length).toBe(clientResult.entries.length);
      expect(fetchResult.entries.map(e => e.id)).toEqual(
        clientResult.entries.map(e => e.id),
      );
    });

    it('GET /audit/stats returns same data via fetch and ServerClient', async () => {
      const clientStats = await client.getAuditStats();
      const fetchResponse = await fetch(`${serverUrl}/api/v1/audit/stats`);
      const fetchStats = (await fetchResponse.json()) as AuditStats;

      expect(fetchStats.totalEntries).toBe(clientStats.totalEntries);
      expect(fetchStats.memoryEntries).toBe(clientStats.memoryEntries);
    });
  });
});
