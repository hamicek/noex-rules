import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { WebhookManager } from '../../../../src/api/notifications/webhook-manager';
import type { Event } from '../../../../src/types/event';

function createMockEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-123',
    data: { key: 'value' },
    timestamp: Date.now(),
    source: 'test',
    ...overrides
  };
}

describe('WebhookManager', () => {
  let webhookManager: WebhookManager;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    webhookManager = new WebhookManager({
      maxRetries: 3,
      retryBaseDelay: 100,
      defaultTimeout: 5000
    });

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('register', () => {
    it('registers webhook with generated id', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.id.length).toBeGreaterThan(0);
    });

    it('registers webhook with URL', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.url).toBe('https://example.com/webhook');
    });

    it('uses default wildcard pattern', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.patterns).toEqual(['*']);
    });

    it('uses provided patterns', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*', 'payment.completed']
      });

      expect(webhook.patterns).toEqual(['order.*', 'payment.completed']);
    });

    it('uses wildcard for empty patterns array', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        patterns: []
      });

      expect(webhook.patterns).toEqual(['*']);
    });

    it('stores secret when provided', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        secret: 'my-secret'
      });

      expect(webhook.secret).toBe('my-secret');
    });

    it('does not include secret when not provided', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.secret).toBeUndefined();
    });

    it('stores custom headers', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        headers: { 'X-Custom': 'value', Authorization: 'Bearer token' }
      });

      expect(webhook.headers).toEqual({
        'X-Custom': 'value',
        Authorization: 'Bearer token'
      });
    });

    it('stores custom timeout', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        timeout: 15000
      });

      expect(webhook.timeout).toBe(15000);
    });

    it('uses default timeout when not specified', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.timeout).toBe(5000);
    });

    it('creates webhook as enabled', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      expect(webhook.enabled).toBe(true);
    });

    it('sets createdAt timestamp', () => {
      vi.useRealTimers();
      const before = Date.now();

      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const after = Date.now();

      expect(webhook.createdAt).toBeGreaterThanOrEqual(before);
      expect(webhook.createdAt).toBeLessThanOrEqual(after);

      vi.useFakeTimers();
    });
  });

  describe('unregister', () => {
    it('removes existing webhook', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const result = webhookManager.unregister(webhook.id);

      expect(result).toBe(true);
      expect(webhookManager.get(webhook.id)).toBeUndefined();
    });

    it('returns false for non-existent webhook', () => {
      const result = webhookManager.unregister('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('returns webhook by id', () => {
      const created = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const webhook = webhookManager.get(created.id);

      expect(webhook).toBeDefined();
      expect(webhook?.id).toBe(created.id);
      expect(webhook?.url).toBe('https://example.com/webhook');
    });

    it('returns undefined for non-existent id', () => {
      const webhook = webhookManager.get('non-existent');

      expect(webhook).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns empty array initially', () => {
      const webhooks = webhookManager.list();

      expect(webhooks).toEqual([]);
    });

    it('returns all registered webhooks', () => {
      webhookManager.register({ url: 'https://example1.com/webhook' });
      webhookManager.register({ url: 'https://example2.com/webhook' });
      webhookManager.register({ url: 'https://example3.com/webhook' });

      const webhooks = webhookManager.list();

      expect(webhooks).toHaveLength(3);
      expect(webhooks.map((w) => w.url)).toContain('https://example1.com/webhook');
      expect(webhooks.map((w) => w.url)).toContain('https://example2.com/webhook');
      expect(webhooks.map((w) => w.url)).toContain('https://example3.com/webhook');
    });
  });

  describe('enable/disable', () => {
    it('enables disabled webhook', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });
      webhookManager.disable(webhook.id);

      const result = webhookManager.enable(webhook.id);

      expect(result).toBe(true);
      expect(webhookManager.get(webhook.id)?.enabled).toBe(true);
    });

    it('returns false when enabling non-existent webhook', () => {
      const result = webhookManager.enable('non-existent');

      expect(result).toBe(false);
    });

    it('disables enabled webhook', () => {
      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const result = webhookManager.disable(webhook.id);

      expect(result).toBe(true);
      expect(webhookManager.get(webhook.id)?.enabled).toBe(false);
    });

    it('returns false when disabling non-existent webhook', () => {
      const result = webhookManager.disable('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('deliver', () => {
    it('delivers event to matching webhook', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*']
      });

      const event = createMockEvent();
      const results = await webhookManager.deliver(event, 'order.created');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].statusCode).toBe(200);
      expect(results[0].attempts).toBe(1);

      vi.useFakeTimers();
    });

    it('does not deliver to non-matching webhooks', async () => {
      vi.useRealTimers();

      webhookManager.register({
        url: 'https://example.com/webhook',
        patterns: ['order.*']
      });

      const event = createMockEvent();
      const results = await webhookManager.deliver(event, 'payment.completed');

      expect(results).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });

    it('does not deliver to disabled webhooks', async () => {
      vi.useRealTimers();

      const webhook = webhookManager.register({
        url: 'https://example.com/webhook',
        patterns: ['*']
      });
      webhookManager.disable(webhook.id);

      const event = createMockEvent();
      const results = await webhookManager.deliver(event, 'order.created');

      expect(results).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });

    it('sends correct payload structure', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent({
        id: 'evt-456',
        data: { orderId: '123' },
        timestamp: 1700000000000,
        correlationId: 'corr-789',
        source: 'test-source'
      });

      await webhookManager.deliver(event, 'order.created');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String)
        })
      );

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body).toMatchObject({
        id: expect.any(String),
        webhookId: webhook.id,
        event: {
          id: 'evt-456',
          topic: 'order.created',
          data: { orderId: '123' },
          timestamp: 1700000000000,
          correlationId: 'corr-789',
          source: 'test-source'
        },
        deliveredAt: expect.any(Number)
      });

      vi.useFakeTimers();
    });

    it('sends correct headers', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        headers: { 'X-Custom': 'value' }
      });

      const event = createMockEvent();
      await webhookManager.deliver(event, 'test');

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].headers).toMatchObject({
        'Content-Type': 'application/json',
        'User-Agent': 'noex-rules-webhook/1.0',
        'X-Custom': 'value'
      });

      vi.useFakeTimers();
    });

    it('signs payload with HMAC when secret is provided', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({
        url: 'https://example.com/webhook',
        secret: 'my-secret'
      });

      const event = createMockEvent();
      await webhookManager.deliver(event, 'test');

      const callArgs = fetchMock.mock.calls[0];
      const signature = callArgs[1].headers['X-Webhook-Signature'];

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Verify signature is correct
      const body = callArgs[1].body;
      const expectedHmac = createHmac('sha256', 'my-secret');
      expectedHmac.update(body);
      const expectedSignature = `sha256=${expectedHmac.digest('hex')}`;

      expect(signature).toBe(expectedSignature);

      vi.useFakeTimers();
    });

    it('retries on failure', async () => {
      vi.useRealTimers();

      fetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK'
        });

      const manager = new WebhookManager({
        maxRetries: 3,
        retryBaseDelay: 10 // Short delay for testing
      });

      manager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent();
      const results = await manager.deliver(event, 'test');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      vi.useFakeTimers();
    });

    it('fails after max retries', async () => {
      vi.useRealTimers();

      fetchMock.mockRejectedValue(new Error('Network error'));

      const manager = new WebhookManager({
        maxRetries: 3,
        retryBaseDelay: 10
      });

      manager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent();
      const results = await manager.deliver(event, 'test');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(3);
      expect(results[0].error).toBe('Network error');

      vi.useFakeTimers();
    });

    it('treats non-2xx as failure', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const manager = new WebhookManager({
        maxRetries: 2,
        retryBaseDelay: 10
      });

      manager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent();
      const results = await manager.deliver(event, 'test');

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].statusCode).toBe(500);
      expect(results[0].error).toBe('HTTP 500: Internal Server Error');

      vi.useFakeTimers();
    });

    it('delivers to multiple matching webhooks in parallel', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({ url: 'https://example1.com/webhook' });
      webhookManager.register({ url: 'https://example2.com/webhook' });
      webhookManager.register({ url: 'https://example3.com/webhook' });

      const event = createMockEvent();
      const results = await webhookManager.deliver(event, 'test');

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      vi.useFakeTimers();
    });

    it('includes event id in result', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent({ id: 'custom-event-id' });
      const results = await webhookManager.deliver(event, 'test');

      expect(results[0].eventId).toBe('custom-event-id');

      vi.useFakeTimers();
    });

    it('includes webhook id in result', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const webhook = webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent();
      const results = await webhookManager.deliver(event, 'test');

      expect(results[0].webhookId).toBe(webhook.id);

      vi.useFakeTimers();
    });

    it('measures duration', async () => {
      vi.useRealTimers();

      fetchMock.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          status: 200,
          statusText: 'OK'
        };
      });

      webhookManager.register({
        url: 'https://example.com/webhook'
      });

      const event = createMockEvent();
      const results = await webhookManager.deliver(event, 'test');

      expect(results[0].duration).toBeGreaterThanOrEqual(50);

      vi.useFakeTimers();
    });
  });

  describe('getStats', () => {
    it('returns initial stats', () => {
      const stats = webhookManager.getStats();

      expect(stats).toEqual({
        webhookCount: 0,
        activeWebhookCount: 0,
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0
      });
    });

    it('counts registered webhooks', () => {
      webhookManager.register({ url: 'https://example1.com/webhook' });
      webhookManager.register({ url: 'https://example2.com/webhook' });

      const stats = webhookManager.getStats();

      expect(stats.webhookCount).toBe(2);
      expect(stats.activeWebhookCount).toBe(2);
    });

    it('counts active vs disabled webhooks', () => {
      const webhook1 = webhookManager.register({ url: 'https://example1.com/webhook' });
      webhookManager.register({ url: 'https://example2.com/webhook' });
      const webhook3 = webhookManager.register({ url: 'https://example3.com/webhook' });

      webhookManager.disable(webhook1.id);
      webhookManager.disable(webhook3.id);

      const stats = webhookManager.getStats();

      expect(stats.webhookCount).toBe(3);
      expect(stats.activeWebhookCount).toBe(1);
    });

    it('counts successful deliveries', async () => {
      vi.useRealTimers();

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      webhookManager.register({ url: 'https://example.com/webhook' });

      const event = createMockEvent();
      await webhookManager.deliver(event, 'test');
      await webhookManager.deliver(event, 'test');

      const stats = webhookManager.getStats();

      expect(stats.totalDeliveries).toBe(2);
      expect(stats.successfulDeliveries).toBe(2);
      expect(stats.failedDeliveries).toBe(0);

      vi.useFakeTimers();
    });

    it('counts failed deliveries', async () => {
      vi.useRealTimers();

      fetchMock.mockRejectedValue(new Error('Network error'));

      const manager = new WebhookManager({
        maxRetries: 1,
        retryBaseDelay: 10
      });

      manager.register({ url: 'https://example.com/webhook' });

      const event = createMockEvent();
      await manager.deliver(event, 'test');

      const stats = manager.getStats();

      expect(stats.totalDeliveries).toBe(1);
      expect(stats.successfulDeliveries).toBe(0);
      expect(stats.failedDeliveries).toBe(1);

      vi.useFakeTimers();
    });
  });

  describe('topic pattern matching', () => {
    const testCases = [
      { pattern: '*', topic: 'anything', expected: true },
      { pattern: '*', topic: 'order.created', expected: true },
      { pattern: 'order.*', topic: 'order.created', expected: true },
      { pattern: 'order.*', topic: 'order.updated', expected: true },
      { pattern: 'order.*', topic: 'payment.created', expected: false },
      { pattern: 'order.created', topic: 'order.created', expected: true },
      { pattern: 'order.created', topic: 'order.updated', expected: false },
      { pattern: 'order.*.completed', topic: 'order.payment.completed', expected: true }
    ];

    testCases.forEach(({ pattern, topic, expected }) => {
      it(`pattern "${pattern}" ${expected ? 'matches' : 'does not match'} topic "${topic}"`, async () => {
        vi.useRealTimers();

        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK'
        });

        webhookManager.register({
          url: 'https://example.com/webhook',
          patterns: [pattern]
        });

        const event = createMockEvent();
        const results = await webhookManager.deliver(event, topic);

        expect(results.length > 0).toBe(expected);

        vi.useFakeTimers();
      });
    });
  });
});
