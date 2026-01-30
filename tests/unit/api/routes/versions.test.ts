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

describe('Versions API', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, logger: false },
      engineConfig: {
        versioning: {
          adapter: createMemoryAdapter(),
        },
      },
    });
    baseUrl = `${server.address}/api/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  function registerTestRule(id = 'test-rule') {
    return server.getEngine().registerRule({
      id,
      name: 'Test Rule',
      priority: 5,
      enabled: true,
      tags: ['test'],
      trigger: { type: 'event', topic: 'test.topic' },
      conditions: [],
      actions: [{ type: 'log', level: 'info', message: 'hello' }],
    });
  }

  describe('GET /rules/:id/versions', () => {
    it('returns version history for a rule', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/versions`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.totalVersions).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].version).toBe(1);
      expect(result.entries[0].changeType).toBe('registered');
      expect(result.entries[0].ruleSnapshot.id).toBe('test-rule');
    });

    it('returns multiple versions after mutations', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.enableRule('test-rule');
      engine.disableRule('test-rule');

      const response = await fetch(`${baseUrl}/rules/test-rule/versions`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.totalVersions).toBe(3);
      expect(result.entries).toHaveLength(3);
      // Default order is desc
      expect(result.entries[0].changeType).toBe('disabled');
      expect(result.entries[1].changeType).toBe('enabled');
      expect(result.entries[2].changeType).toBe('registered');
    });

    it('returns empty history for unknown rule', async () => {
      const response = await fetch(`${baseUrl}/rules/nonexistent/versions`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.totalVersions).toBe(0);
      expect(result.entries).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('supports limit parameter', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 10 });
      engine.updateRule('test-rule', { priority: 20 });

      const response = await fetch(`${baseUrl}/rules/test-rule/versions?limit=2`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.entries).toHaveLength(2);
      expect(result.totalVersions).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('supports offset parameter', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 10 });
      engine.updateRule('test-rule', { priority: 20 });

      const response = await fetch(`${baseUrl}/rules/test-rule/versions?offset=1&limit=10`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.entries).toHaveLength(2);
    });

    it('supports order=asc parameter', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 10 });

      const response = await fetch(`${baseUrl}/rules/test-rule/versions?order=asc`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.entries[0].changeType).toBe('registered');
      expect(result.entries[1].changeType).toBe('updated');
    });

    it('supports changeTypes filter', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.enableRule('test-rule');
      engine.disableRule('test-rule');

      const response = await fetch(`${baseUrl}/rules/test-rule/versions?changeTypes=enabled,disabled`);
      const result = await response.json();

      expect(response.status).toBe(200);
      for (const entry of result.entries) {
        expect(['enabled', 'disabled']).toContain(entry.changeType);
      }
    });

    it('supports fromVersion and toVersion filters', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 10 });
      engine.updateRule('test-rule', { priority: 20 });
      engine.updateRule('test-rule', { priority: 30 });

      const response = await fetch(`${baseUrl}/rules/test-rule/versions?fromVersion=2&toVersion=3`);
      const result = await response.json();

      expect(response.status).toBe(200);
      for (const entry of result.entries) {
        expect(entry.version).toBeGreaterThanOrEqual(2);
        expect(entry.version).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('GET /rules/:id/versions/:version', () => {
    it('returns a specific version', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/versions/1`);
      const entry = await response.json();

      expect(response.status).toBe(200);
      expect(entry.version).toBe(1);
      expect(entry.changeType).toBe('registered');
      expect(entry.ruleSnapshot.id).toBe('test-rule');
      expect(entry.ruleSnapshot.name).toBe('Test Rule');
      expect(entry.ruleSnapshot.priority).toBe(5);
      expect(typeof entry.timestamp).toBe('number');
    });

    it('returns 404 for non-existent version', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/versions/999`);
      expect(response.status).toBe(404);
    });

    it('returns 404 for unknown rule', async () => {
      const response = await fetch(`${baseUrl}/rules/nonexistent/versions/1`);
      expect(response.status).toBe(404);
    });

    it('returns snapshot reflecting state at that version', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 42, name: 'Updated Rule' });

      const v1 = await fetch(`${baseUrl}/rules/test-rule/versions/1`);
      const entry1 = await v1.json();

      const v2 = await fetch(`${baseUrl}/rules/test-rule/versions/2`);
      const entry2 = await v2.json();

      expect(entry1.ruleSnapshot.priority).toBe(5);
      expect(entry1.ruleSnapshot.name).toBe('Test Rule');
      expect(entry2.ruleSnapshot.priority).toBe(42);
      expect(entry2.ruleSnapshot.name).toBe('Updated Rule');
    });
  });

  describe('POST /rules/:id/rollback', () => {
    it('rolls back to a previous version', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 42, name: 'Changed' });

      const response = await fetch(`${baseUrl}/rules/test-rule/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.id).toBe('test-rule');
      expect(rule.priority).toBe(5);
      expect(rule.name).toBe('Test Rule');
    });

    it('records rolled_back version entry after rollback', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 42 });

      await fetch(`${baseUrl}/rules/test-rule/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1 }),
      });

      const historyResponse = await fetch(`${baseUrl}/rules/test-rule/versions?order=asc`);
      const history = await historyResponse.json();

      expect(history.totalVersions).toBe(3);
      const lastEntry = history.entries[history.entries.length - 1];
      expect(lastEntry.changeType).toBe('rolled_back');
    });

    it('returns 404 for non-existent version', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 999 }),
      });
      expect(response.status).toBe(404);
    });

    it('returns 400 when version is missing', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
    });
  });

  describe('GET /rules/:id/diff', () => {
    it('returns field-level diff between two versions', async () => {
      const engine = server.getEngine();
      registerTestRule();
      engine.updateRule('test-rule', { priority: 42, name: 'New Name' });

      const response = await fetch(`${baseUrl}/rules/test-rule/diff?from=1&to=2`);
      const diff = await response.json();

      expect(response.status).toBe(200);
      expect(diff.ruleId).toBe('test-rule');
      expect(diff.fromVersion).toBe(1);
      expect(diff.toVersion).toBe(2);
      expect(Array.isArray(diff.changes)).toBe(true);

      const priorityChange = diff.changes.find((c: { field: string }) => c.field === 'priority');
      expect(priorityChange).toBeDefined();
      expect(priorityChange.oldValue).toBe(5);
      expect(priorityChange.newValue).toBe(42);

      const nameChange = diff.changes.find((c: { field: string }) => c.field === 'name');
      expect(nameChange).toBeDefined();
      expect(nameChange.oldValue).toBe('Test Rule');
      expect(nameChange.newValue).toBe('New Name');
    });

    it('returns empty changes when versions are identical', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/diff?from=1&to=1`);
      const diff = await response.json();

      expect(response.status).toBe(200);
      expect(diff.changes).toHaveLength(0);
    });

    it('returns 404 when a version does not exist', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/diff?from=1&to=999`);
      expect(response.status).toBe(404);
    });

    it('returns 400 when from or to query params are missing', async () => {
      registerTestRule();

      const response = await fetch(`${baseUrl}/rules/test-rule/diff?from=1`);
      expect(response.status).toBe(400);
    });

    it('returns 404 for unknown rule', async () => {
      const response = await fetch(`${baseUrl}/rules/nonexistent/diff?from=1&to=2`);
      expect(response.status).toBe(404);
    });
  });
});

describe('Versions API without versioning configured', () => {
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

  it('returns 503 for version list when versioning is not configured', async () => {
    const response = await fetch(`${baseUrl}/rules/any-rule/versions`);
    expect(response.status).toBe(503);
  });

  it('returns 503 for specific version when versioning is not configured', async () => {
    const response = await fetch(`${baseUrl}/rules/any-rule/versions/1`);
    expect(response.status).toBe(503);
  });

  it('returns 503 for rollback when versioning is not configured', async () => {
    const response = await fetch(`${baseUrl}/rules/any-rule/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1 }),
    });
    expect(response.status).toBe(503);
  });

  it('returns 503 for diff when versioning is not configured', async () => {
    const response = await fetch(`${baseUrl}/rules/any-rule/diff?from=1&to=2`);
    expect(response.status).toBe(503);
  });
});
