import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Rules API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('GET /api/v1/rules', () => {
    it('returns empty array when no rules exist', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/rules'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns all registered rules', async () => {
      ctx.engine.registerRule({
        id: 'rule-1',
        name: 'Test Rule 1',
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [],
        tags: []
      });

      ctx.engine.registerRule({
        id: 'rule-2',
        name: 'Test Rule 2',
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/rules'
      });

      expect(response.statusCode).toBe(200);
      const rules = response.json();
      expect(rules).toHaveLength(2);
      expect(rules.map((r: { id: string }) => r.id)).toContain('rule-1');
      expect(rules.map((r: { id: string }) => r.id)).toContain('rule-2');
    });
  });

  describe('GET /api/v1/rules/:id', () => {
    it('returns rule by id', async () => {
      ctx.engine.registerRule({
        id: 'rule-1',
        name: 'Test Rule',
        description: 'A test rule',
        trigger: { type: 'event', topic: 'test.event' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/rules/rule-1'
      });

      expect(response.statusCode).toBe(200);
      const rule = response.json();
      expect(rule.id).toBe('rule-1');
      expect(rule.name).toBe('Test Rule');
      expect(rule.description).toBe('A test rule');
    });

    it('returns 404 for non-existent rule', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/rules/non-existent'
      });

      expect(response.statusCode).toBe(404);
      const error = response.json();
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toContain('non-existent');
    });
  });

  describe('POST /api/v1/rules', () => {
    it('creates a new rule', async () => {
      const ruleData = {
        id: 'new-rule',
        name: 'New Rule',
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: []
      };

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: ruleData
      });

      expect(response.statusCode).toBe(201);
      const rule = response.json();
      expect(rule.id).toBe('new-rule');
      expect(rule.name).toBe('New Rule');
      expect(rule.enabled).toBe(true);
      expect(rule.priority).toBe(0);
    });

    it('creates rule with all optional fields', async () => {
      const ruleData = {
        id: 'full-rule',
        name: 'Full Rule',
        description: 'A complete rule',
        priority: 10,
        enabled: false,
        tags: ['important', 'test'],
        trigger: { type: 'event', topic: 'order.*' },
        conditions: [
          {
            source: { type: 'fact', pattern: 'order.status' },
            operator: 'eq',
            value: 'pending'
          }
        ],
        actions: [
          {
            type: 'emit_event',
            topic: 'order.processed',
            data: {}
          }
        ]
      };

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: ruleData
      });

      expect(response.statusCode).toBe(201);
      const rule = response.json();
      expect(rule.description).toBe('A complete rule');
      expect(rule.priority).toBe(10);
      expect(rule.enabled).toBe(false);
      expect(rule.tags).toEqual(['important', 'test']);
      expect(rule.conditions).toHaveLength(1);
      expect(rule.actions).toHaveLength(1);
    });

    it('returns 400 when id is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          name: 'Missing ID',
          trigger: { type: 'event', topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          id: 'no-name',
          trigger: { type: 'event', topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when trigger is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          id: 'no-trigger',
          name: 'No Trigger Rule'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 for duplicate rule id', async () => {
      ctx.engine.registerRule({
        id: 'existing',
        name: 'Existing Rule',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          id: 'existing',
          name: 'Duplicate Rule',
          trigger: { type: 'event', topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('CONFLICT');
    });
  });

  describe('PUT /api/v1/rules/:id', () => {
    it('updates an existing rule', async () => {
      ctx.engine.registerRule({
        id: 'update-me',
        name: 'Original Name',
        priority: 5,
        enabled: true,
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/rules/update-me',
        payload: {
          name: 'Updated Name',
          priority: 15
        }
      });

      expect(response.statusCode).toBe(200);
      const rule = response.json();
      expect(rule.name).toBe('Updated Name');
      expect(rule.priority).toBe(15);
    });

    it('preserves unspecified fields', async () => {
      ctx.engine.registerRule({
        id: 'partial-update',
        name: 'Original',
        description: 'Keep this',
        priority: 10,
        enabled: true,
        tags: ['original'],
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: []
      });

      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/rules/partial-update',
        payload: {
          name: 'New Name'
        }
      });

      expect(response.statusCode).toBe(200);
      const rule = response.json();
      expect(rule.name).toBe('New Name');
      expect(rule.description).toBe('Keep this');
      expect(rule.priority).toBe(10);
      expect(rule.tags).toEqual(['original']);
    });

    it('returns 404 for non-existent rule', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/rules/non-existent',
        payload: { name: 'New Name' }
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/rules/:id', () => {
    it('deletes an existing rule', async () => {
      ctx.engine.registerRule({
        id: 'delete-me',
        name: 'Delete Me',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/rules/delete-me'
      });

      expect(response.statusCode).toBe(204);
      expect(ctx.engine.getRule('delete-me')).toBeUndefined();
    });

    it('returns 404 for non-existent rule', async () => {
      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/rules/non-existent'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/rules/:id/enable', () => {
    it('enables a disabled rule', async () => {
      ctx.engine.registerRule({
        id: 'disabled-rule',
        name: 'Disabled Rule',
        enabled: false,
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules/disabled-rule/enable'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().enabled).toBe(true);
    });

    it('returns 404 for non-existent rule', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules/non-existent/enable'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/rules/:id/disable', () => {
    it('disables an enabled rule', async () => {
      ctx.engine.registerRule({
        id: 'enabled-rule',
        name: 'Enabled Rule',
        enabled: true,
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules/enabled-rule/disable'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().enabled).toBe(false);
    });

    it('returns 404 for non-existent rule', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules/non-existent/disable'
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
