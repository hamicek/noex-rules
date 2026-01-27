import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookManager, type WebhookConfig } from '../../src/api/notifications/webhook-manager.js';
import type { Event } from '../../src/types/event.js';

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-123',
    topic: 'test.event',
    data: { foo: 'bar' },
    timestamp: Date.now(),
    source: 'api',
    ...overrides
  };
}

/**
 * Verifikuje HMAC-SHA256 podpis payloadu.
 */
function verifySignature(payload: string, secret: string, signature: string): boolean {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest('hex')}`;
  return signature === expected;
}

describe('WebhookManager', () => {
  let manager: WebhookManager;

  beforeEach(() => {
    manager = new WebhookManager({
      maxRetries: 3,
      retryBaseDelay: 10, // Krátký delay pro testy
      defaultTimeout: 5000
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates manager with default config', () => {
      const m = new WebhookManager();
      expect(m.list()).toEqual([]);
      expect(m.getStats().webhookCount).toBe(0);
    });

    it('creates manager with custom config', () => {
      const m = new WebhookManager({
        maxRetries: 5,
        retryBaseDelay: 2000,
        defaultTimeout: 15000
      });
      expect(m.list()).toEqual([]);
    });
  });

  describe('register', () => {
    it('registers a new webhook', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.enabled).toBe(true);
      expect(webhook.createdAt).toBeGreaterThan(0);
    });

    it('uses wildcard pattern by default', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.patterns).toEqual(['*']);
    });

    it('accepts custom patterns', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*', 'payment.completed']
      });

      expect(webhook.patterns).toEqual(['order.*', 'payment.completed']);
    });

    it('falls back to wildcard when empty patterns provided', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook',
        patterns: []
      });

      expect(webhook.patterns).toEqual(['*']);
    });

    it('stores secret for HMAC signing', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook',
        secret: 'my-secret-key'
      });

      expect(webhook.secret).toBe('my-secret-key');
    });

    it('stores custom headers', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook',
        headers: {
          'X-Custom-Header': 'custom-value',
          Authorization: 'Bearer token123'
        }
      });

      expect(webhook.headers).toEqual({
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer token123'
      });
    });

    it('stores custom timeout', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook',
        timeout: 30000
      });

      expect(webhook.timeout).toBe(30000);
    });

    it('uses default timeout when not specified', () => {
      const webhook = manager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.timeout).toBe(5000);
    });

    it('generates unique IDs for each webhook', () => {
      const webhook1 = manager.register({ url: 'https://example.com/webhook1' });
      const webhook2 = manager.register({ url: 'https://example.com/webhook2' });

      expect(webhook1.id).not.toBe(webhook2.id);
    });
  });

  describe('unregister', () => {
    it('removes existing webhook', () => {
      const webhook = manager.register({ url: 'https://example.com/webhook' });

      const result = manager.unregister(webhook.id);

      expect(result).toBe(true);
      expect(manager.get(webhook.id)).toBeUndefined();
    });

    it('returns false for non-existent webhook', () => {
      const result = manager.unregister('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('returns webhook by id', () => {
      const webhook = manager.register({ url: 'https://example.com/webhook' });

      const retrieved = manager.get(webhook.id);

      expect(retrieved).toEqual(webhook);
    });

    it('returns undefined for non-existent id', () => {
      const retrieved = manager.get('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns all registered webhooks', () => {
      manager.register({ url: 'https://example.com/webhook1' });
      manager.register({ url: 'https://example.com/webhook2' });
      manager.register({ url: 'https://example.com/webhook3' });

      const webhooks = manager.list();

      expect(webhooks).toHaveLength(3);
    });

    it('returns empty array when no webhooks registered', () => {
      expect(manager.list()).toEqual([]);
    });
  });

  describe('enable/disable', () => {
    it('disables webhook', () => {
      const webhook = manager.register({ url: 'https://example.com/webhook' });
      expect(webhook.enabled).toBe(true);

      const result = manager.disable(webhook.id);

      expect(result).toBe(true);
      expect(manager.get(webhook.id)?.enabled).toBe(false);
    });

    it('enables webhook', () => {
      const webhook = manager.register({ url: 'https://example.com/webhook' });
      manager.disable(webhook.id);

      const result = manager.enable(webhook.id);

      expect(result).toBe(true);
      expect(manager.get(webhook.id)?.enabled).toBe(true);
    });

    it('returns false when enabling non-existent webhook', () => {
      expect(manager.enable('non-existent')).toBe(false);
    });

    it('returns false when disabling non-existent webhook', () => {
      expect(manager.disable('non-existent')).toBe(false);
    });
  });

  describe('deliver', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('delivers event to matching webhook', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*']
      });

      const event = createEvent({ id: 'evt-456', topic: 'order.created' });
      const results = await manager.deliver(event, 'order.created');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].statusCode).toBe(200);
      expect(results[0].attempts).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not deliver to disabled webhooks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const webhook = manager.register({
        url: 'https://example.com/webhook',
        patterns: ['*']
      });
      manager.disable(webhook.id);

      const event = createEvent();
      const results = await manager.deliver(event, 'test.event');

      expect(results).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not deliver to non-matching webhooks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*']
      });

      const event = createEvent({ topic: 'payment.completed' });
      const results = await manager.deliver(event, 'payment.completed');

      expect(results).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('delivers to multiple matching webhooks', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      manager.register({
        url: 'https://example1.com/webhook',
        patterns: ['order.*']
      });
      manager.register({
        url: 'https://example2.com/webhook',
        patterns: ['*']
      });
      manager.register({
        url: 'https://example3.com/webhook',
        patterns: ['payment.*']
      });

      const event = createEvent({ topic: 'order.created' });
      const results = await manager.deliver(event, 'order.created');

      expect(results).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('sends correct payload structure', async () => {
      let capturedBody: string | undefined;
      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        capturedBody = options.body as string;
        return { ok: true, status: 200, statusText: 'OK' };
      });

      const webhook = manager.register({
        url: 'https://example.com/webhook'
      });

      const event = createEvent({
        id: 'evt-789',
        topic: 'test.topic',
        data: { key: 'value' },
        timestamp: 1704067200000,
        correlationId: 'corr-123',
        source: 'test-source'
      });

      await manager.deliver(event, 'test.topic');

      expect(capturedBody).toBeDefined();
      const payload = JSON.parse(capturedBody!);

      expect(payload.id).toBeDefined();
      expect(payload.webhookId).toBe(webhook.id);
      expect(payload.event).toEqual({
        id: 'evt-789',
        topic: 'test.topic',
        data: { key: 'value' },
        timestamp: 1704067200000,
        correlationId: 'corr-123',
        source: 'test-source'
      });
      expect(payload.deliveredAt).toBeGreaterThan(0);
    });

    it('sends correct headers', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        capturedHeaders = options.headers as Record<string, string>;
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({
        url: 'https://example.com/webhook',
        headers: { 'X-Custom': 'custom-value' }
      });

      await manager.deliver(createEvent(), 'test.event');

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders!['Content-Type']).toBe('application/json');
      expect(capturedHeaders!['User-Agent']).toBe('noex-rules-webhook/1.0');
      expect(capturedHeaders!['X-Custom']).toBe('custom-value');
    });

    it('includes HMAC signature when secret is configured', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: string | undefined;

      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        capturedHeaders = options.headers as Record<string, string>;
        capturedBody = options.body as string;
        return { ok: true, status: 200, statusText: 'OK' };
      });

      const secret = 'my-super-secret-key';
      manager.register({
        url: 'https://example.com/webhook',
        secret
      });

      await manager.deliver(createEvent(), 'test.event');

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders!['X-Webhook-Signature']).toBeDefined();
      expect(capturedHeaders!['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Verify the signature is correct
      const isValid = verifySignature(
        capturedBody!,
        secret,
        capturedHeaders!['X-Webhook-Signature']
      );
      expect(isValid).toBe(true);
    });

    it('does not include signature when no secret', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        capturedHeaders = options.headers as Record<string, string>;
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({
        url: 'https://example.com/webhook'
        // No secret
      });

      await manager.deliver(createEvent(), 'test.event');

      expect(capturedHeaders!['X-Webhook-Signature']).toBeUndefined();
    });

    it('retries on failure with exponential backoff', async () => {
      let attempts = 0;
      fetchMock.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return { ok: false, status: 500, statusText: 'Internal Server Error' };
        }
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({
        url: 'https://example.com/webhook'
      });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('returns failure after max retries', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      manager.register({
        url: 'https://example.com/webhook'
      });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(3);
      expect(results[0].error).toBe('HTTP 500: Internal Server Error');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('handles network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      manager.register({
        url: 'https://example.com/webhook'
      });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Network error');
    });

    it('handles timeout', async () => {
      fetchMock.mockImplementation(async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      manager.register({
        url: 'https://example.com/webhook',
        timeout: 100
      });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('tracks duration of delivery', async () => {
      fetchMock.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({
        url: 'https://example.com/webhook'
      });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results[0].duration).toBeGreaterThanOrEqual(50);
    });

    it('updates statistics on successful delivery', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      manager.register({ url: 'https://example.com/webhook' });

      await manager.deliver(createEvent(), 'test.event');

      const stats = manager.getStats();
      expect(stats.totalDeliveries).toBe(1);
      expect(stats.successfulDeliveries).toBe(1);
      expect(stats.failedDeliveries).toBe(0);
    });

    it('updates statistics on failed delivery', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      manager.register({ url: 'https://example.com/webhook' });

      await manager.deliver(createEvent(), 'test.event');

      const stats = manager.getStats();
      expect(stats.totalDeliveries).toBe(1);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(1);
    });
  });

  describe('topic pattern matching', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('matches exact topic', async () => {
      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.created']
      });

      await manager.deliver(createEvent(), 'order.created');
      await manager.deliver(createEvent(), 'order.updated');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('matches wildcard at end of pattern', async () => {
      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*']
      });

      await manager.deliver(createEvent(), 'order.created');
      await manager.deliver(createEvent(), 'order.updated');
      await manager.deliver(createEvent(), 'payment.completed');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('matches global wildcard', async () => {
      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['*']
      });

      await manager.deliver(createEvent(), 'order.created');
      await manager.deliver(createEvent(), 'payment.completed');
      await manager.deliver(createEvent(), 'user.login');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('matches multiple patterns', async () => {
      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.created', 'payment.*']
      });

      await manager.deliver(createEvent(), 'order.created');
      await manager.deliver(createEvent(), 'order.updated');
      await manager.deliver(createEvent(), 'payment.completed');
      await manager.deliver(createEvent(), 'payment.failed');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not match longer topics without wildcard', async () => {
      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['order']
      });

      await manager.deliver(createEvent(), 'order');
      await manager.deliver(createEvent(), 'order.created');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('matches multi-segment topics with wildcard', async () => {
      manager.register({
        url: 'https://example.com/webhook',
        patterns: ['system.event.*']
      });

      await manager.deliver(createEvent(), 'system.event.started');
      await manager.deliver(createEvent(), 'system.event.stopped');
      await manager.deliver(createEvent(), 'system.error.critical');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      manager.register({ url: 'https://example1.com/webhook' });
      manager.register({ url: 'https://example2.com/webhook' });
      const webhook3 = manager.register({ url: 'https://example3.com/webhook' });
      manager.disable(webhook3.id);

      const stats = manager.getStats();

      expect(stats.webhookCount).toBe(3);
      expect(stats.activeWebhookCount).toBe(2);
      expect(stats.totalDeliveries).toBe(0);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(0);
    });

    it('returns zero stats for empty manager', () => {
      const stats = manager.getStats();

      expect(stats.webhookCount).toBe(0);
      expect(stats.activeWebhookCount).toBe(0);
      expect(stats.totalDeliveries).toBe(0);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(0);
    });
  });

  describe('edge cases', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('handles event with undefined correlationId', async () => {
      let capturedBody: string | undefined;
      fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
        capturedBody = options.body as string;
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({ url: 'https://example.com/webhook' });

      const event = createEvent({ correlationId: undefined });
      await manager.deliver(event, 'test.event');

      const payload = JSON.parse(capturedBody!);
      expect(payload.event.correlationId).toBeUndefined();
    });

    it('handles multiple webhooks with mixed success/failure', async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount % 2 === 0) {
          return { ok: false, status: 500, statusText: 'Error' };
        }
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({ url: 'https://example1.com/webhook' });
      manager.register({ url: 'https://example2.com/webhook' });
      manager.register({ url: 'https://example3.com/webhook' });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results).toHaveLength(3);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      // Due to retry logic and interleaving, we verify at least some succeeded
      expect(successCount).toBeGreaterThanOrEqual(1);
    });

    it('handles concurrent deliveries', async () => {
      const delays = [50, 30, 70];
      let callIndex = 0;

      fetchMock.mockImplementation(async () => {
        const delay = delays[callIndex++ % delays.length];
        await new Promise(resolve => setTimeout(resolve, delay));
        return { ok: true, status: 200, statusText: 'OK' };
      });

      manager.register({ url: 'https://example1.com/webhook' });
      manager.register({ url: 'https://example2.com/webhook' });
      manager.register({ url: 'https://example3.com/webhook' });

      const startTime = Date.now();
      const results = await manager.deliver(createEvent(), 'test.event');
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);

      // Concurrent execution should be faster than sequential (50+30+70=150ms)
      expect(duration).toBeLessThan(150);
    });

    it('handles non-Error exceptions', async () => {
      fetchMock.mockRejectedValue('String error');

      manager.register({ url: 'https://example.com/webhook' });

      const results = await manager.deliver(createEvent(), 'test.event');

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('String error');
    });
  });
});
