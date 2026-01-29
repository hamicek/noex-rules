import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { StorageAdapter, PersistedState } from '@hamicek/noex';

function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, PersistedState<unknown>>();
  return {
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

describe('Audit API', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, logger: false },
      engineConfig: {
        audit: {
          adapter: createMemoryAdapter(),
          flushIntervalMs: 0,
        },
      },
    });
    baseUrl = `${server.address}/api/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('GET /audit/entries', () => {
    it('returns engine_started entry after server start', async () => {
      const response = await fetch(`${baseUrl}/audit/entries`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.totalCount).toBeGreaterThanOrEqual(1);
      expect(result.hasMore).toBe(false);
      expect(typeof result.queryTimeMs).toBe('number');

      const startEntry = result.entries.find(
        (e: { type: string }) => e.type === 'engine_started'
      );
      expect(startEntry).toBeDefined();
      expect(startEntry.category).toBe('system');
    });

    it('returns entries after engine operations', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'audit-test-rule',
        name: 'Audit Test',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'test.topic' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'test' }],
      });

      const response = await fetch(`${baseUrl}/audit/entries`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.entries.length).toBeGreaterThan(0);

      const registerEntry = result.entries.find(
        (e: { type: string }) => e.type === 'rule_registered'
      );
      expect(registerEntry).toBeDefined();
      expect(registerEntry.category).toBe('rule_management');
      expect(registerEntry.ruleId).toBe('audit-test-rule');
    });

    it('filters by category', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'cat-rule',
        name: 'Cat Rule',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'cat.topic' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'test' }],
      });
      engine.setFact('test-fact', 42);

      const response = await fetch(`${baseUrl}/audit/entries?category=fact_change`);
      const result = await response.json();

      expect(response.status).toBe(200);
      for (const entry of result.entries) {
        expect(entry.category).toBe('fact_change');
      }
    });

    it('filters by event types (comma-separated)', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'type-rule',
        name: 'Type Rule',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'type.topic' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'test' }],
      });
      engine.enableRule('type-rule');
      engine.disableRule('type-rule');

      const response = await fetch(`${baseUrl}/audit/entries?types=rule_enabled,rule_disabled`);
      const result = await response.json();

      expect(response.status).toBe(200);
      for (const entry of result.entries) {
        expect(['rule_enabled', 'rule_disabled']).toContain(entry.type);
      }
    });

    it('supports pagination with limit and offset', async () => {
      const engine = server.getEngine();
      for (let i = 0; i < 5; i++) {
        engine.setFact(`fact-${i}`, i);
      }

      const response = await fetch(`${baseUrl}/audit/entries?limit=2&offset=0`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.entries.length).toBeLessThanOrEqual(2);
      expect(result.hasMore).toBe(result.totalCount > 2);
    });
  });

  describe('GET /audit/entries/:id', () => {
    it('returns 404 for non-existent entry', async () => {
      const response = await fetch(`${baseUrl}/audit/entries/nonexistent-id`);
      expect(response.status).toBe(404);
    });

    it('returns entry by ID', async () => {
      const engine = server.getEngine();
      engine.setFact('lookup-fact', 'hello');

      const listResponse = await fetch(`${baseUrl}/audit/entries`);
      const listResult = await listResponse.json();
      const entryId = listResult.entries[0].id;

      const response = await fetch(`${baseUrl}/audit/entries/${entryId}`);
      const entry = await response.json();

      expect(response.status).toBe(200);
      expect(entry.id).toBe(entryId);
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('summary');
    });
  });

  describe('GET /audit/stats', () => {
    it('returns statistics', async () => {
      const response = await fetch(`${baseUrl}/audit/stats`);
      const stats = await response.json();

      expect(response.status).toBe(200);
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('memoryEntries');
      expect(stats).toHaveProperty('oldestEntry');
      expect(stats).toHaveProperty('newestEntry');
      expect(stats).toHaveProperty('entriesByCategory');
      expect(stats).toHaveProperty('subscribersCount');
    });

    it('reflects recorded entries', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'stats-rule',
        name: 'Stats Rule',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'stats.topic' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'test' }],
      });

      const response = await fetch(`${baseUrl}/audit/stats`);
      const stats = await response.json();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.memoryEntries).toBeGreaterThan(0);
      expect(stats.entriesByCategory.rule_management).toBeGreaterThan(0);
    });
  });

  describe('GET /audit/export', () => {
    it('exports entries as JSON by default', async () => {
      const engine = server.getEngine();
      engine.setFact('export-fact', 'data');

      const response = await fetch(`${baseUrl}/audit/export`);
      const contentType = response.headers.get('content-type');

      expect(response.status).toBe(200);
      expect(contentType).toContain('application/json');

      const entries = await response.json();
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('exports entries as CSV', async () => {
      const engine = server.getEngine();
      engine.setFact('csv-fact', 'value');

      const response = await fetch(`${baseUrl}/audit/export?format=csv`);
      const contentType = response.headers.get('content-type');

      expect(response.status).toBe(200);
      expect(contentType).toContain('text/csv');

      const csv = await response.text();
      const lines = csv.split('\n');
      expect(lines[0]).toBe('id,timestamp,category,type,summary,source,ruleId,ruleName,correlationId,details,durationMs');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('filters exports by category', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'export-rule',
        name: 'Export Rule',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'export.topic' },
        conditions: [],
        actions: [{ type: 'log', level: 'info', message: 'test' }],
      });
      engine.setFact('export-fact-2', 42);

      const response = await fetch(`${baseUrl}/audit/export?category=rule_management`);
      const entries = await response.json();

      expect(response.status).toBe(200);
      for (const entry of entries) {
        expect(entry.category).toBe('rule_management');
      }
    });

    it('includes Content-Disposition header', async () => {
      const response = await fetch(`${baseUrl}/audit/export`);
      const disposition = response.headers.get('content-disposition');
      expect(disposition).toContain('audit-export.json');

      const csvResponse = await fetch(`${baseUrl}/audit/export?format=csv`);
      const csvDisposition = csvResponse.headers.get('content-disposition');
      expect(csvDisposition).toContain('audit-export.csv');
    });
  });

  describe('POST /audit/cleanup', () => {
    it('performs cleanup and returns counts', async () => {
      const engine = server.getEngine();
      engine.setFact('cleanup-fact', true);

      const response = await fetch(`${baseUrl}/audit/cleanup`, { method: 'POST' });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(typeof result.removedCount).toBe('number');
      expect(typeof result.remainingCount).toBe('number');
    });
  });

  describe('GET /audit/stream/stats', () => {
    it('returns SSE stream statistics', async () => {
      const response = await fetch(`${baseUrl}/audit/stream/stats`);
      const stats = await response.json();

      expect(response.status).toBe(200);
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('totalEntriesSent');
      expect(stats).toHaveProperty('totalEntriesFiltered');
      expect(stats.activeConnections).toBe(0);
    });
  });

  describe('GET /audit/stream', () => {
    it('establishes SSE connection', async () => {
      const controller = new AbortController();
      const receivedData: string[] = [];

      const fetchPromise = fetch(`${baseUrl}/audit/stream`, {
        signal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const response = await fetchPromise.catch(() => null);

      if (response && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const readPromise = (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              receivedData.push(decoder.decode(value));
            }
          } catch {
            // Connection aborted
          }
        })();

        // Wait for initial comment
        await new Promise((resolve) => setTimeout(resolve, 50));

        controller.abort();
        await readPromise;
      }

      const allData = receivedData.join('');
      expect(allData).toContain(':');
    });

    it('streams audit entries in real-time', async () => {
      const controller = new AbortController();
      const receivedData: string[] = [];

      const fetchPromise = fetch(`${baseUrl}/audit/stream`, {
        signal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const response = await fetchPromise.catch(() => null);

      if (response && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const readPromise = (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              receivedData.push(decoder.decode(value));
            }
          } catch {
            // Connection aborted
          }
        })();

        // Trigger an audit event
        const engine = server.getEngine();
        engine.setFact('sse-test-fact', 'streamed');

        // Wait for event to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));

        controller.abort();
        await readPromise;
      }

      const allData = receivedData.join('');
      expect(allData).toContain('fact_created');
    });

    it('filters stream by categories', async () => {
      const controller = new AbortController();
      const receivedData: string[] = [];

      const fetchPromise = fetch(
        `${baseUrl}/audit/stream?categories=fact_change`,
        { signal: controller.signal }
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const response = await fetchPromise.catch(() => null);

      if (response && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const readPromise = (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              receivedData.push(decoder.decode(value));
            }
          } catch {
            // Connection aborted
          }
        })();

        // Trigger both rule_management and fact_change events
        const engine = server.getEngine();
        engine.registerRule({
          id: 'sse-filter-rule',
          name: 'SSE Filter Rule',
          priority: 0,
          enabled: true,
          tags: [],
          trigger: { type: 'event', topic: 'filter.topic' },
          conditions: [],
          actions: [{ type: 'log', level: 'info', message: 'test' }],
        });
        engine.setFact('sse-filter-fact', 'hello');

        await new Promise((resolve) => setTimeout(resolve, 100));

        controller.abort();
        await readPromise;
      }

      const allData = receivedData.join('');
      // Should have fact_change events
      expect(allData).toContain('fact_created');
      // Should NOT have rule_management events
      expect(allData).not.toContain('rule_registered');
    });
  });
});

describe('Audit API without audit configured', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, logger: false },
    });
    baseUrl = `${server.address}/api/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('returns 503 for entries when audit is not configured', async () => {
    const response = await fetch(`${baseUrl}/audit/entries`);
    expect(response.status).toBe(503);
  });

  it('returns 503 for stats when audit is not configured', async () => {
    const response = await fetch(`${baseUrl}/audit/stats`);
    expect(response.status).toBe(503);
  });

  it('returns 503 for entry by ID when audit is not configured', async () => {
    const response = await fetch(`${baseUrl}/audit/entries/some-id`);
    expect(response.status).toBe(503);
  });

  it('returns 503 for export when audit is not configured', async () => {
    const response = await fetch(`${baseUrl}/audit/export`);
    expect(response.status).toBe(503);
  });

  it('returns 503 for cleanup when audit is not configured', async () => {
    const response = await fetch(`${baseUrl}/audit/cleanup`, { method: 'POST' });
    expect(response.status).toBe(503);
  });

  it('returns 503 for stream when audit is not configured', async () => {
    const controller = new AbortController();
    try {
      const response = await fetch(`${baseUrl}/audit/stream`, { signal: controller.signal });
      expect(response.status).toBe(503);
    } catch {
      // May error on abort
    } finally {
      controller.abort();
    }
  });

  it('returns 503 for stream stats when audit is not configured', async () => {
    const controller = new AbortController();
    try {
      const response = await fetch(`${baseUrl}/audit/stream/stats`, { signal: controller.signal });
      expect(response.status).toBe(503);
    } catch {
      // May error
    } finally {
      controller.abort();
    }
  });
});
