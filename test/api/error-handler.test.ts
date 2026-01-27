import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Error Handler Middleware', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('NotFoundError (404)', () => {
    it('returns proper 404 response structure', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/rules/non-existent-rule'
      });

      expect(response.statusCode).toBe(404);
      const error = response.json();

      expect(error).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        code: 'NOT_FOUND'
      });
      expect(error.message).toContain('non-existent-rule');
    });

    it('returns 404 for missing fact', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/facts/missing.key'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });

    it('returns 404 for missing timer', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/timers/missing-timer'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('ValidationError (400)', () => {
    it('returns proper 400 response structure', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: { name: 'Missing ID' }
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();

      expect(error).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_ERROR'
      });
    });

    it('handles missing required fields in facts', async () => {
      const response = await ctx.fastify.inject({
        method: 'PUT',
        url: '/api/v1/facts/test',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('handles invalid data types', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {
          topic: 123
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('ConflictError (409)', () => {
    it('returns proper 409 response structure', async () => {
      ctx.engine.registerRule({
        id: 'existing-rule',
        name: 'Existing',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          id: 'existing-rule',
          name: 'Duplicate',
          trigger: { type: 'event', topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(409);
      const error = response.json();

      expect(error).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        code: 'CONFLICT'
      });
    });
  });

  describe('Invalid JSON (400)', () => {
    it('handles malformed JSON body', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        headers: {
          'content-type': 'application/json'
        },
        payload: '{ invalid json }'
      });

      expect(response.statusCode).toBe(400);
    });

    it('handles empty JSON body when content-type is set', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        headers: {
          'content-type': 'application/json'
        },
        payload: ''
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Response consistency', () => {
    it('all error responses have statusCode field', async () => {
      const responses = await Promise.all([
        ctx.fastify.inject({ method: 'GET', url: '/api/v1/rules/missing' }),
        ctx.fastify.inject({
          method: 'POST',
          url: '/api/v1/rules',
          payload: { name: 'no id' }
        }),
        ctx.fastify.inject({ method: 'DELETE', url: '/api/v1/facts/missing' })
      ]);

      for (const response of responses) {
        const body = response.json();
        expect(body.statusCode).toBeDefined();
        expect(body.statusCode).toBe(response.statusCode);
      }
    });

    it('all error responses have error field', async () => {
      const responses = await Promise.all([
        ctx.fastify.inject({ method: 'GET', url: '/api/v1/rules/missing' }),
        ctx.fastify.inject({
          method: 'POST',
          url: '/api/v1/rules',
          payload: { name: 'no id' }
        })
      ]);

      for (const response of responses) {
        const body = response.json();
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe('string');
      }
    });

    it('all error responses have message field', async () => {
      const responses = await Promise.all([
        ctx.fastify.inject({ method: 'GET', url: '/api/v1/rules/missing' }),
        ctx.fastify.inject({
          method: 'POST',
          url: '/api/v1/rules',
          payload: {}
        })
      ]);

      for (const response of responses) {
        const body = response.json();
        expect(body.message).toBeDefined();
        expect(typeof body.message).toBe('string');
      }
    });
  });

  describe('Error code mapping', () => {
    it('maps 400 to "Bad Request"', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {}
      });

      expect(response.json().error).toBe('Bad Request');
    });

    it('maps 404 to "Not Found"', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/rules/missing'
      });

      expect(response.json().error).toBe('Not Found');
    });

    it('maps 409 to "Conflict"', async () => {
      ctx.engine.registerRule({
        id: 'dup',
        name: 'Original',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          id: 'dup',
          name: 'Duplicate',
          trigger: { type: 'event', topic: 'test' }
        }
      });

      expect(response.json().error).toBe('Conflict');
    });
  });
});
