import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Groups API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  // ---------------------------------------------------------------------------
  // GET /groups
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/groups', () => {
    it('returns empty array when no groups exist', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns all groups', async () => {
      ctx.engine.createGroup({ id: 'billing', name: 'Billing' });
      ctx.engine.createGroup({ id: 'shipping', name: 'Shipping' });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups',
      });

      expect(response.statusCode).toBe(200);
      const groups = response.json();
      expect(groups).toHaveLength(2);
      expect(groups.map((g: { id: string }) => g.id).sort()).toEqual(['billing', 'shipping']);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /groups/:id
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/groups/:id', () => {
    it('returns group by ID', async () => {
      ctx.engine.createGroup({ id: 'billing', name: 'Billing Rules', description: 'All billing' });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups/billing',
      });

      expect(response.statusCode).toBe(200);
      const group = response.json();
      expect(group.id).toBe('billing');
      expect(group.name).toBe('Billing Rules');
      expect(group.description).toBe('All billing');
      expect(group.enabled).toBe(true);
      expect(group.createdAt).toBeTypeOf('number');
    });

    it('returns 404 for non-existent group', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups/non-existent',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /groups
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/groups', () => {
    it('creates a new group', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups',
        payload: { id: 'billing', name: 'Billing Rules' },
      });

      expect(response.statusCode).toBe(201);
      const group = response.json();
      expect(group.id).toBe('billing');
      expect(group.name).toBe('Billing Rules');
      expect(group.enabled).toBe(true);
    });

    it('creates a group with all fields', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups',
        payload: {
          id: 'billing',
          name: 'Billing Rules',
          description: 'All billing-related rules',
          enabled: false,
        },
      });

      expect(response.statusCode).toBe(201);
      const group = response.json();
      expect(group.description).toBe('All billing-related rules');
      expect(group.enabled).toBe(false);
    });

    it('returns 409 for duplicate group ID', async () => {
      ctx.engine.createGroup({ id: 'billing', name: 'Billing' });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups',
        payload: { id: 'billing', name: 'Duplicate' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('CONFLICT');
    });

    it('returns 400 when id is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups',
        payload: { name: 'No ID' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when name is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups',
        payload: { id: 'no-name' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /groups/:id
  // ---------------------------------------------------------------------------

  describe('PUT /api/v1/groups/:id', () => {
    it('updates group name', async () => {
      ctx.engine.createGroup({ id: 'g', name: 'Old Name' });

      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/groups/g',
        payload: { name: 'New Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('New Name');
    });

    it('updates group description', async () => {
      ctx.engine.createGroup({ id: 'g', name: 'G' });

      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/groups/g',
        payload: { description: 'New description' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().description).toBe('New description');
    });

    it('updates group enabled state', async () => {
      ctx.engine.createGroup({ id: 'g', name: 'G' });

      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/groups/g',
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().enabled).toBe(false);
    });

    it('returns 404 for non-existent group', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/groups/unknown',
        payload: { name: 'X' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /groups/:id
  // ---------------------------------------------------------------------------

  describe('DELETE /api/v1/groups/:id', () => {
    it('deletes an existing group', async () => {
      ctx.engine.createGroup({ id: 'g', name: 'G' });

      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/groups/g',
      });

      expect(response.statusCode).toBe(204);
      expect(ctx.engine.getGroup('g')).toBeUndefined();
    });

    it('returns 404 for non-existent group', async () => {
      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/groups/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /groups/:id/enable
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/groups/:id/enable', () => {
    it('enables a disabled group', async () => {
      ctx.engine.createGroup({ id: 'g', name: 'G', enabled: false });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups/g/enable',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().enabled).toBe(true);
    });

    it('returns 404 for non-existent group', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups/unknown/enable',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /groups/:id/disable
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/groups/:id/disable', () => {
    it('disables an enabled group', async () => {
      ctx.engine.createGroup({ id: 'g', name: 'G' });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups/g/disable',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().enabled).toBe(false);
    });

    it('returns 404 for non-existent group', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/groups/unknown/disable',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /groups/:id/rules
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/groups/:id/rules', () => {
    it('returns rules in a group', async () => {
      ctx.engine.createGroup({ id: 'billing', name: 'Billing' });
      ctx.engine.registerRule({
        id: 'r1',
        name: 'Rule 1',
        group: 'billing',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'out', data: {} }],
        tags: [],
        priority: 0,
        enabled: true,
      });
      ctx.engine.registerRule({
        id: 'r2',
        name: 'Rule 2',
        group: 'billing',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [{ type: 'emit_event', topic: 'out', data: {} }],
        tags: [],
        priority: 0,
        enabled: true,
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups/billing/rules',
      });

      expect(response.statusCode).toBe(200);
      const rules = response.json();
      expect(rules).toHaveLength(2);
      expect(rules.map((r: { id: string }) => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('returns empty array when group has no rules', async () => {
      ctx.engine.createGroup({ id: 'empty', name: 'Empty' });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups/empty/rules',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns 404 for non-existent group', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/groups/unknown/rules',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
