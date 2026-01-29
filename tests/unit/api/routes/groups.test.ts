import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { RuleGroupInput } from '../../../../src/types/group';
import type { RuleGroup } from '../../../../src/types/group';
import type { RuleInput } from '../../../../src/types/rule';

describe('Groups API', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  const createTestGroup = (overrides: Partial<RuleGroupInput> = {}): RuleGroupInput => ({
    id: 'test-group',
    name: 'Test Group',
    description: 'A test group',
    ...overrides
  });

  const createTestRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
    id: 'test-rule-1',
    name: 'Test Rule',
    priority: 0,
    enabled: true,
    tags: [],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'triggered' }],
    ...overrides
  });

  beforeEach(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, logger: false }
    });
    baseUrl = `${server.address}/api/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('GET /groups', () => {
    it('returns empty array when no groups exist', async () => {
      const response = await fetch(`${baseUrl}/groups`);
      const groups = await response.json();

      expect(response.status).toBe(200);
      expect(groups).toEqual([]);
    });

    it('returns all registered groups', async () => {
      const engine = server.getEngine();
      engine.createGroup(createTestGroup({ id: 'group-1', name: 'Group 1' }));
      engine.createGroup(createTestGroup({ id: 'group-2', name: 'Group 2' }));

      const response = await fetch(`${baseUrl}/groups`);
      const groups = await response.json();

      expect(response.status).toBe(200);
      expect(groups).toHaveLength(2);
      expect(groups.map((g: RuleGroup) => g.id)).toContain('group-1');
      expect(groups.map((g: RuleGroup) => g.id)).toContain('group-2');
    });
  });

  describe('GET /groups/:id', () => {
    it('returns 404 for non-existent group', async () => {
      const response = await fetch(`${baseUrl}/groups/non-existent`);
      const error = await response.json();

      expect(response.status).toBe(404);
      expect(error.error).toBe('Not Found');
      expect(error.message).toContain('non-existent');
    });

    it('returns group details', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups/test-group`);
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.id).toBe('test-group');
      expect(group.name).toBe('Test Group');
      expect(group.description).toBe('A test group');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');
      expect(group.updatedAt).toBeTypeOf('number');
    });
  });

  describe('POST /groups', () => {
    it('creates a new group', async () => {
      const response = await fetch(`${baseUrl}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createTestGroup())
      });
      const group = await response.json();

      expect(response.status).toBe(201);
      expect(group.id).toBe('test-group');
      expect(group.name).toBe('Test Group');
      expect(group.description).toBe('A test group');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');
      expect(group.updatedAt).toBeTypeOf('number');
    });

    it('creates group with enabled=false', async () => {
      const response = await fetch(`${baseUrl}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createTestGroup({ enabled: false }))
      });
      const group = await response.json();

      expect(response.status).toBe(201);
      expect(group.enabled).toBe(false);
    });

    it('returns 409 when group with same id exists', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createTestGroup())
      });
      const error = await response.json();

      expect(response.status).toBe(409);
      expect(error.error).toBe('Conflict');
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await fetch(`${baseUrl}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'no-name' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('sets default values for optional fields', async () => {
      const response = await fetch(`${baseUrl}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'minimal', name: 'Minimal Group' })
      });
      const group = await response.json();

      expect(response.status).toBe(201);
      expect(group.enabled).toBe(true);
      expect(group.description).toBeUndefined();
    });
  });

  describe('PUT /groups/:id', () => {
    it('returns 404 for non-existent group', async () => {
      const response = await fetch(`${baseUrl}/groups/non-existent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });

      expect(response.status).toBe(404);
    });

    it('updates group name', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups/test-group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Group' })
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.name).toBe('Updated Group');
      expect(group.description).toBe('A test group');
      expect(group.id).toBe('test-group');
    });

    it('updates group description', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups/test-group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'New description' })
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.description).toBe('New description');
    });

    it('updates group enabled state', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups/test-group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.enabled).toBe(false);
    });

    it('updates updatedAt timestamp', async () => {
      server.getEngine().createGroup(createTestGroup());

      const getBefore = await fetch(`${baseUrl}/groups/test-group`);
      const before = await getBefore.json();

      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const response = await fetch(`${baseUrl}/groups/test-group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });
      const after = await response.json();

      expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    });
  });

  describe('DELETE /groups/:id', () => {
    it('returns 404 for non-existent group', async () => {
      const response = await fetch(`${baseUrl}/groups/non-existent`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(404);
    });

    it('deletes existing group', async () => {
      server.getEngine().createGroup(createTestGroup());

      const deleteResponse = await fetch(`${baseUrl}/groups/test-group`, {
        method: 'DELETE'
      });

      expect(deleteResponse.status).toBe(204);

      // Verify it's deleted
      const getResponse = await fetch(`${baseUrl}/groups/test-group`);
      expect(getResponse.status).toBe(404);
    });

    it('clears group reference on rules when group is deleted', async () => {
      const engine = server.getEngine();
      engine.createGroup(createTestGroup());
      engine.registerRule(createTestRule({ group: 'test-group' }));

      await fetch(`${baseUrl}/groups/test-group`, { method: 'DELETE' });

      const rule = engine.getRule('test-rule-1');
      expect(rule?.group).toBeUndefined();
    });
  });

  describe('POST /groups/:id/enable', () => {
    it('returns 404 for non-existent group', async () => {
      const response = await fetch(`${baseUrl}/groups/non-existent/enable`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });

    it('enables disabled group', async () => {
      server.getEngine().createGroup(createTestGroup({ enabled: false }));

      const response = await fetch(`${baseUrl}/groups/test-group/enable`, {
        method: 'POST'
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.enabled).toBe(true);
    });

    it('returns enabled group when already enabled', async () => {
      server.getEngine().createGroup(createTestGroup({ enabled: true }));

      const response = await fetch(`${baseUrl}/groups/test-group/enable`, {
        method: 'POST'
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.enabled).toBe(true);
    });
  });

  describe('POST /groups/:id/disable', () => {
    it('returns 404 for non-existent group', async () => {
      const response = await fetch(`${baseUrl}/groups/non-existent/disable`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });

    it('disables enabled group', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups/test-group/disable`, {
        method: 'POST'
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.enabled).toBe(false);
    });

    it('returns disabled group when already disabled', async () => {
      server.getEngine().createGroup(createTestGroup({ enabled: false }));

      const response = await fetch(`${baseUrl}/groups/test-group/disable`, {
        method: 'POST'
      });
      const group = await response.json();

      expect(response.status).toBe(200);
      expect(group.enabled).toBe(false);
    });
  });

  describe('GET /groups/:id/rules', () => {
    it('returns 404 for non-existent group', async () => {
      const response = await fetch(`${baseUrl}/groups/non-existent/rules`);

      expect(response.status).toBe(404);
    });

    it('returns empty array when group has no rules', async () => {
      server.getEngine().createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/groups/test-group/rules`);
      const rules = await response.json();

      expect(response.status).toBe(200);
      expect(rules).toEqual([]);
    });

    it('returns rules belonging to the group', async () => {
      const engine = server.getEngine();
      engine.createGroup(createTestGroup());
      engine.registerRule(createTestRule({ id: 'rule-1', name: 'Rule 1', group: 'test-group' }));
      engine.registerRule(createTestRule({ id: 'rule-2', name: 'Rule 2', group: 'test-group' }));
      engine.registerRule(createTestRule({ id: 'rule-3', name: 'Rule 3' })); // no group

      const response = await fetch(`${baseUrl}/groups/test-group/rules`);
      const rules = await response.json();

      expect(response.status).toBe(200);
      expect(rules).toHaveLength(2);
      expect(rules.map((r: { id: string }) => r.id)).toContain('rule-1');
      expect(rules.map((r: { id: string }) => r.id)).toContain('rule-2');
    });
  });

  describe('rules API with group field', () => {
    it('creates a rule with group reference via POST /rules', async () => {
      const engine = server.getEngine();
      engine.createGroup(createTestGroup());

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'grouped-rule',
          name: 'Grouped Rule',
          trigger: { type: 'event', topic: 'test' },
          group: 'test-group'
        })
      });
      const rule = await response.json();

      expect(response.status).toBe(201);
      expect(rule.group).toBe('test-group');
    });

    it('preserves group field when updating rule via PUT /rules/:id', async () => {
      const engine = server.getEngine();
      engine.createGroup(createTestGroup());
      engine.registerRule(createTestRule({ group: 'test-group' }));

      const response = await fetch(`${baseUrl}/rules/test-rule-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' })
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.name).toBe('Updated Name');
      expect(rule.group).toBe('test-group');
    });
  });
});
