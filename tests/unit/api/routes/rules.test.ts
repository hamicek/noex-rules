import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { RuleInput, Rule } from '../../../../src/types/rule';

describe('Rules API', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  const createTestRule = (overrides: Partial<RuleInput> = {}): RuleInput => ({
    id: 'test-rule-1',
    name: 'Test Rule',
    description: 'A test rule',
    priority: 10,
    enabled: true,
    tags: ['test', 'api'],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [],
    actions: [{ type: 'log', level: 'info', message: 'Rule triggered' }],
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

  describe('GET /rules', () => {
    it('returns empty array when no rules exist', async () => {
      const response = await fetch(`${baseUrl}/rules`);
      const rules = await response.json();

      expect(response.status).toBe(200);
      expect(rules).toEqual([]);
    });

    it('returns all registered rules', async () => {
      const engine = server.getEngine();
      engine.registerRule(createTestRule({ id: 'rule-1', name: 'Rule 1' }));
      engine.registerRule(createTestRule({ id: 'rule-2', name: 'Rule 2' }));

      const response = await fetch(`${baseUrl}/rules`);
      const rules = await response.json();

      expect(response.status).toBe(200);
      expect(rules).toHaveLength(2);
      expect(rules.map((r: Rule) => r.id)).toContain('rule-1');
      expect(rules.map((r: Rule) => r.id)).toContain('rule-2');
    });
  });

  describe('GET /rules/:id', () => {
    it('returns 404 for non-existent rule', async () => {
      const response = await fetch(`${baseUrl}/rules/non-existent`);
      const error = await response.json();

      expect(response.status).toBe(404);
      expect(error.error).toBe('Not Found');
      expect(error.message).toContain('non-existent');
    });

    it('returns rule details', async () => {
      server.getEngine().registerRule(createTestRule());

      const response = await fetch(`${baseUrl}/rules/test-rule-1`);
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.id).toBe('test-rule-1');
      expect(rule.name).toBe('Test Rule');
      expect(rule.priority).toBe(10);
      expect(rule.tags).toEqual(['test', 'api']);
      expect(rule.version).toBeDefined();
      expect(rule.createdAt).toBeTypeOf('number');
    });
  });

  describe('POST /rules', () => {
    it('creates a new rule', async () => {
      const ruleInput = createTestRule();

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleInput)
      });
      const rule = await response.json();

      expect(response.status).toBe(201);
      expect(rule.id).toBe('test-rule-1');
      expect(rule.name).toBe('Test Rule');
      expect(rule.version).toBe(1);
      expect(rule.createdAt).toBeTypeOf('number');
      expect(rule.updatedAt).toBeTypeOf('number');
    });

    it('returns 409 when rule with same id exists', async () => {
      server.getEngine().registerRule(createTestRule());

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createTestRule())
      });
      const error = await response.json();

      expect(response.status).toBe(409);
      expect(error.error).toBe('Conflict');
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'test' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('sets default values for optional fields', async () => {
      const minimalRule = {
        id: 'minimal-rule',
        name: 'Minimal',
        trigger: { type: 'event', topic: 'test' }
      };

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalRule)
      });
      const rule = await response.json();

      expect(response.status).toBe(201);
      expect(rule.priority).toBe(0);
      expect(rule.enabled).toBe(true);
      expect(rule.tags).toEqual([]);
      expect(rule.conditions).toEqual([]);
      expect(rule.actions).toEqual([]);
    });
  });

  describe('PUT /rules/:id', () => {
    it('returns 404 for non-existent rule', async () => {
      const response = await fetch(`${baseUrl}/rules/non-existent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });

      expect(response.status).toBe(404);
    });

    it('updates rule properties', async () => {
      server.getEngine().registerRule(createTestRule());

      const response = await fetch(`${baseUrl}/rules/test-rule-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated Rule',
          priority: 50,
          tags: ['updated']
        })
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.name).toBe('Updated Rule');
      expect(rule.priority).toBe(50);
      expect(rule.tags).toEqual(['updated']);
      // Other fields should remain unchanged
      expect(rule.id).toBe('test-rule-1');
      expect(rule.description).toBe('A test rule');
    });

    it('preserves fields not included in update', async () => {
      server.getEngine().registerRule(createTestRule());

      const response = await fetch(`${baseUrl}/rules/test-rule-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' })
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.name).toBe('New Name');
      expect(rule.priority).toBe(10);
      expect(rule.trigger).toEqual({ type: 'event', topic: 'test.event' });
    });
  });

  describe('DELETE /rules/:id', () => {
    it('returns 404 for non-existent rule', async () => {
      const response = await fetch(`${baseUrl}/rules/non-existent`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(404);
    });

    it('deletes existing rule', async () => {
      server.getEngine().registerRule(createTestRule());

      const deleteResponse = await fetch(`${baseUrl}/rules/test-rule-1`, {
        method: 'DELETE'
      });

      expect(deleteResponse.status).toBe(204);

      // Verify it's deleted
      const getResponse = await fetch(`${baseUrl}/rules/test-rule-1`);
      expect(getResponse.status).toBe(404);
    });
  });

  describe('POST /rules/:id/enable', () => {
    it('returns 404 for non-existent rule', async () => {
      const response = await fetch(`${baseUrl}/rules/non-existent/enable`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });

    it('enables disabled rule', async () => {
      server.getEngine().registerRule(createTestRule({ enabled: false }));

      const response = await fetch(`${baseUrl}/rules/test-rule-1/enable`, {
        method: 'POST'
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.enabled).toBe(true);
    });

    it('returns enabled rule when already enabled', async () => {
      server.getEngine().registerRule(createTestRule({ enabled: true }));

      const response = await fetch(`${baseUrl}/rules/test-rule-1/enable`, {
        method: 'POST'
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.enabled).toBe(true);
    });
  });

  describe('POST /rules/:id/disable', () => {
    it('returns 404 for non-existent rule', async () => {
      const response = await fetch(`${baseUrl}/rules/non-existent/disable`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });

    it('disables enabled rule', async () => {
      server.getEngine().registerRule(createTestRule({ enabled: true }));

      const response = await fetch(`${baseUrl}/rules/test-rule-1/disable`, {
        method: 'POST'
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.enabled).toBe(false);
    });

    it('returns disabled rule when already disabled', async () => {
      server.getEngine().registerRule(createTestRule({ enabled: false }));

      const response = await fetch(`${baseUrl}/rules/test-rule-1/disable`, {
        method: 'POST'
      });
      const rule = await response.json();

      expect(response.status).toBe(200);
      expect(rule.enabled).toBe(false);
    });
  });

  describe('rule with complex trigger types', () => {
    it('creates rule with fact trigger', async () => {
      const ruleInput = createTestRule({
        id: 'fact-rule',
        trigger: { type: 'fact', pattern: 'user:*:status' }
      });

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleInput)
      });
      const rule = await response.json();

      expect(response.status).toBe(201);
      expect(rule.trigger).toEqual({ type: 'fact', pattern: 'user:*:status' });
    });

    it('creates rule with timer trigger', async () => {
      const ruleInput = createTestRule({
        id: 'timer-rule',
        trigger: { type: 'timer', name: 'payment-timeout:*' }
      });

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleInput)
      });
      const rule = await response.json();

      expect(response.status).toBe(201);
      expect(rule.trigger).toEqual({ type: 'timer', name: 'payment-timeout:*' });
    });

    it('creates rule with conditions and actions', async () => {
      const ruleInput = createTestRule({
        id: 'complex-rule',
        conditions: [
          { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 1000 },
          { source: { type: 'fact', pattern: 'customer:premium' }, operator: 'eq', value: true }
        ],
        actions: [
          { type: 'set_fact', key: 'order:status', value: 'premium' },
          { type: 'emit_event', topic: 'order.premium', data: { priority: 'high' } }
        ]
      });

      const response = await fetch(`${baseUrl}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleInput)
      });
      const rule = await response.json();

      expect(response.status).toBe(201);
      expect(rule.conditions).toHaveLength(2);
      expect(rule.actions).toHaveLength(2);
    });
  });
});
