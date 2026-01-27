import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';

describe('Webhooks API', () => {
  let server: RuleEngineServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = await RuleEngineServer.start({
      server: { port: 0, logger: false }
    });
    baseUrl = `${server.address}/api/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('GET /webhooks', () => {
    it('returns empty array initially', async () => {
      const response = await fetch(`${baseUrl}/webhooks`);
      const webhooks = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(webhooks)).toBe(true);
      expect(webhooks.length).toBe(0);
    });

    it('returns list of registered webhooks', async () => {
      // Register webhooks
      await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example1.com/webhook' })
      });
      await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example2.com/webhook' })
      });

      const response = await fetch(`${baseUrl}/webhooks`);
      const webhooks = await response.json();

      expect(response.status).toBe(200);
      expect(webhooks.length).toBe(2);
      expect(webhooks.map((w: { url: string }) => w.url)).toContain('https://example1.com/webhook');
      expect(webhooks.map((w: { url: string }) => w.url)).toContain('https://example2.com/webhook');
    });

    it('does not expose secrets in list', async () => {
      await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          secret: 'super-secret-value'
        })
      });

      const response = await fetch(`${baseUrl}/webhooks`);
      const webhooks = await response.json();

      expect(webhooks[0].secret).toBeUndefined();
      expect(webhooks[0].hasSecret).toBe(true);
    });
  });

  describe('GET /webhooks/stats', () => {
    it('returns initial stats', async () => {
      const response = await fetch(`${baseUrl}/webhooks/stats`);
      const stats = await response.json();

      expect(response.status).toBe(200);
      expect(stats).toEqual({
        webhookCount: 0,
        activeWebhookCount: 0,
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0
      });
    });

    it('reflects webhook count', async () => {
      await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/webhook' })
      });

      const response = await fetch(`${baseUrl}/webhooks/stats`);
      const stats = await response.json();

      expect(stats.webhookCount).toBe(1);
      expect(stats.activeWebhookCount).toBe(1);
    });
  });

  describe('GET /webhooks/:id', () => {
    it('returns webhook by id', async () => {
      const createResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          patterns: ['order.*']
        })
      });
      const created = await createResponse.json();

      const response = await fetch(`${baseUrl}/webhooks/${created.id}`);
      const webhook = await response.json();

      expect(response.status).toBe(200);
      expect(webhook.id).toBe(created.id);
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.patterns).toEqual(['order.*']);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await fetch(`${baseUrl}/webhooks/non-existent`);

      expect(response.status).toBe(404);
    });

    it('does not expose secret in detail', async () => {
      const createResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          secret: 'my-secret'
        })
      });
      const created = await createResponse.json();

      const response = await fetch(`${baseUrl}/webhooks/${created.id}`);
      const webhook = await response.json();

      expect(webhook.secret).toBeUndefined();
      expect(webhook.hasSecret).toBe(true);
    });
  });

  describe('POST /webhooks', () => {
    it('creates webhook with minimal config', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook'
        })
      });
      const webhook = await response.json();

      expect(response.status).toBe(201);
      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.patterns).toEqual(['*']);
      expect(webhook.enabled).toBe(true);
    });

    it('creates webhook with all options', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          patterns: ['order.*', 'payment.*'],
          secret: 'my-secret',
          headers: { 'X-Custom': 'value' },
          timeout: 15000
        })
      });
      const webhook = await response.json();

      expect(response.status).toBe(201);
      expect(webhook.patterns).toEqual(['order.*', 'payment.*']);
      expect(webhook.hasSecret).toBe(true);
      expect(webhook.headers).toEqual({ 'X-Custom': 'value' });
      expect(webhook.timeout).toBe(15000);
    });

    it('validates required url field', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('url');
    });

    it('validates url format', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'not-a-valid-url'
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('URL');
    });

    it('validates patterns is array', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          patterns: 'not-an-array'
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('patterns');
    });

    it('validates patterns contains non-empty strings', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          patterns: ['valid', '']
        })
      });

      expect(response.status).toBe(400);
    });

    it('validates secret is string', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          secret: 123
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('secret');
    });

    it('validates headers is object', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          headers: 'not-an-object'
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('headers');
    });

    it('validates timeout is positive integer', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          timeout: -1
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('timeout');
    });

    it('validates timeout does not exceed maximum', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com/webhook',
          timeout: 120000
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.message).toContain('60000');
    });

    it('accepts http and https URLs', async () => {
      const httpsResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/webhook' })
      });
      expect(httpsResponse.status).toBe(201);

      const httpResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://localhost:8080/webhook' })
      });
      expect(httpResponse.status).toBe(201);
    });

    it('rejects non-http URLs', async () => {
      const response = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'ftp://example.com/webhook' })
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /webhooks/:id/enable', () => {
    it('enables disabled webhook', async () => {
      const createResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/webhook' })
      });
      const created = await createResponse.json();

      await fetch(`${baseUrl}/webhooks/${created.id}/disable`, { method: 'POST' });

      const response = await fetch(`${baseUrl}/webhooks/${created.id}/enable`, {
        method: 'POST'
      });
      const webhook = await response.json();

      expect(response.status).toBe(200);
      expect(webhook.enabled).toBe(true);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await fetch(`${baseUrl}/webhooks/non-existent/enable`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /webhooks/:id/disable', () => {
    it('disables enabled webhook', async () => {
      const createResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/webhook' })
      });
      const created = await createResponse.json();

      const response = await fetch(`${baseUrl}/webhooks/${created.id}/disable`, {
        method: 'POST'
      });
      const webhook = await response.json();

      expect(response.status).toBe(200);
      expect(webhook.enabled).toBe(false);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await fetch(`${baseUrl}/webhooks/non-existent/disable`, {
        method: 'POST'
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /webhooks/:id', () => {
    it('deletes existing webhook', async () => {
      const createResponse = await fetch(`${baseUrl}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/webhook' })
      });
      const created = await createResponse.json();

      const response = await fetch(`${baseUrl}/webhooks/${created.id}`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(204);

      const getResponse = await fetch(`${baseUrl}/webhooks/${created.id}`);
      expect(getResponse.status).toBe(404);
    });

    it('returns 404 for non-existent webhook', async () => {
      const response = await fetch(`${baseUrl}/webhooks/non-existent`, {
        method: 'DELETE'
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Webhook Manager integration', () => {
    it('exposes webhook manager via server', () => {
      const webhookManager = server.getWebhookManager();
      expect(webhookManager).toBeDefined();
      expect(typeof webhookManager.getStats).toBe('function');
      expect(typeof webhookManager.deliver).toBe('function');
    });

    it('triggers webhook delivery when event is emitted', async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      try {
        // Register webhook first using original fetch
        await originalFetch(`${baseUrl}/webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://example.com/webhook',
            patterns: ['test.*']
          })
        });

        // Now mock fetch for webhook delivery
        vi.stubGlobal('fetch', fetchMock);

        // Emit event - this triggers webhook delivery using mocked fetch
        const engine = server.getEngine();
        await engine.emit('test.event', { foo: 'bar' });

        // Wait for async delivery
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify webhook was called
        expect(fetchMock).toHaveBeenCalledWith(
          'https://example.com/webhook',
          expect.objectContaining({
            method: 'POST'
          })
        );
      } finally {
        vi.stubGlobal('fetch', originalFetch);
      }
    });

    it('does not deliver to disabled webhooks', async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      try {
        // Register and disable webhook using original fetch
        const createResponse = await originalFetch(`${baseUrl}/webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: 'https://example.com/webhook',
            patterns: ['test.*']
          })
        });
        const created = await createResponse.json();

        await originalFetch(`${baseUrl}/webhooks/${created.id}/disable`, {
          method: 'POST'
        });

        // Now mock fetch
        vi.stubGlobal('fetch', fetchMock);

        // Emit event
        const engine = server.getEngine();
        await engine.emit('test.event', {});

        // Wait for potential delivery
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Webhook should not have been called
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.stubGlobal('fetch', originalFetch);
      }
    });
  });
});
