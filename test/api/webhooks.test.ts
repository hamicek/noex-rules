import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Webhooks API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('GET /api/v1/webhooks', () => {
    it('returns empty array when no webhooks exist', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/webhooks'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns all registered webhooks', async () => {
      ctx.webhookManager.register({ url: 'https://example.com/hook1' });
      ctx.webhookManager.register({ url: 'https://example.com/hook2' });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/webhooks'
      });

      expect(response.statusCode).toBe(200);
      const webhooks = response.json();
      expect(webhooks).toHaveLength(2);
    });

    it('does not expose secret in response', async () => {
      ctx.webhookManager.register({
        url: 'https://example.com/hook',
        secret: 'super-secret-key'
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/webhooks'
      });

      expect(response.statusCode).toBe(200);
      const webhooks = response.json();
      expect(webhooks[0].secret).toBeUndefined();
      expect(webhooks[0].hasSecret).toBe(true);
    });
  });

  describe('GET /api/v1/webhooks/stats', () => {
    it('returns webhook statistics', async () => {
      ctx.webhookManager.register({ url: 'https://example.com/hook1' });
      ctx.webhookManager.register({ url: 'https://example.com/hook2' });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/webhooks/stats'
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats.webhookCount).toBe(2);
      expect(stats.activeWebhookCount).toBe(2);
      expect(stats.totalDeliveries).toBe(0);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(0);
    });
  });

  describe('GET /api/v1/webhooks/:id', () => {
    it('returns webhook by id', async () => {
      const webhook = ctx.webhookManager.register({
        url: 'https://example.com/hook',
        patterns: ['order.*']
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: `/api/v1/webhooks/${webhook.id}`
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.id).toBe(webhook.id);
      expect(result.url).toBe('https://example.com/hook');
      expect(result.patterns).toEqual(['order.*']);
      expect(result.enabled).toBe(true);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/webhooks/non-existent-id'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/webhooks', () => {
    it('creates a webhook with minimal config', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/webhook'
        }
      });

      expect(response.statusCode).toBe(201);
      const webhook = response.json();
      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.patterns).toEqual(['*']);
      expect(webhook.enabled).toBe(true);
      expect(webhook.hasSecret).toBe(false);
    });

    it('creates a webhook with all options', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/webhook',
          patterns: ['order.created', 'order.updated'],
          secret: 'my-secret',
          headers: { 'X-Custom-Header': 'value' },
          timeout: 5000
        }
      });

      expect(response.statusCode).toBe(201);
      const webhook = response.json();
      expect(webhook.patterns).toEqual(['order.created', 'order.updated']);
      expect(webhook.hasSecret).toBe(true);
      expect(webhook.timeout).toBe(5000);
    });

    it('returns 400 when url is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid url format', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'not-a-valid-url'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for non-http(s) url', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'ftp://example.com/hook'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when patterns is not an array', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          patterns: 'order.*'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when patterns contains non-string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          patterns: ['valid', 123]
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when patterns contains empty string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          patterns: ['valid', '']
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when secret is not a string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          secret: 12345
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when headers is not an object', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          headers: 'invalid'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when timeout is not a positive integer', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          timeout: -100
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when timeout exceeds maximum', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://example.com/hook',
          timeout: 120000
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/webhooks/:id/enable', () => {
    it('enables a disabled webhook', async () => {
      const webhook = ctx.webhookManager.register({ url: 'https://example.com/hook' });
      ctx.webhookManager.disable(webhook.id);

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: `/api/v1/webhooks/${webhook.id}/enable`
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.enabled).toBe(true);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks/non-existent/enable'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/webhooks/:id/disable', () => {
    it('disables an enabled webhook', async () => {
      const webhook = ctx.webhookManager.register({ url: 'https://example.com/hook' });

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: `/api/v1/webhooks/${webhook.id}/disable`
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.enabled).toBe(false);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/webhooks/non-existent/disable'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('deletes an existing webhook', async () => {
      const webhook = ctx.webhookManager.register({ url: 'https://example.com/hook' });

      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${webhook.id}`
      });

      expect(response.statusCode).toBe(204);
      expect(ctx.webhookManager.get(webhook.id)).toBeUndefined();
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/webhooks/non-existent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });
});
