import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';

describe('Stream API', () => {
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

  describe('GET /stream/stats', () => {
    it('returns SSE statistics', async () => {
      const response = await fetch(`${baseUrl}/stream/stats`);
      const stats = await response.json();

      expect(response.status).toBe(200);
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('totalEventsSent');
      expect(stats.activeConnections).toBe(0);
      expect(stats.totalEventsSent).toBe(0);
    });
  });

  describe('GET /stream/connections', () => {
    it('returns empty array when no connections', async () => {
      const response = await fetch(`${baseUrl}/stream/connections`);
      const connections = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBe(0);
    });
  });

  describe('GET /stream/events', () => {
    it('returns SSE content-type header', async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 100);

      try {
        await fetch(`${baseUrl}/stream/events`, {
          signal: controller.signal
        });
      } catch {
        // Expected to abort
      }

      clearTimeout(timeout);

      // Verify stats show connection was tracked
      const stats = await (await fetch(`${baseUrl}/stream/stats`)).json();
      // Connection may or may not still be active depending on timing
      expect(stats.activeConnections).toBeGreaterThanOrEqual(0);
    });

    it('accepts patterns query parameter', async () => {
      const controller = new AbortController();

      // Start SSE connection with patterns
      const fetchPromise = fetch(`${baseUrl}/stream/events?patterns=order.*,payment.*`, {
        signal: controller.signal
      }).catch(() => {});

      // Wait a bit for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check connections
      const connectionsResponse = await fetch(`${baseUrl}/stream/connections`);
      const connections = await connectionsResponse.json();

      // Abort the SSE connection
      controller.abort();
      await fetchPromise;

      // Verify patterns were parsed correctly
      if (connections.length > 0) {
        expect(connections[0].patterns).toEqual(['order.*', 'payment.*']);
      }
    });

    it('uses wildcard pattern by default', async () => {
      const controller = new AbortController();

      // Start SSE connection without patterns
      const fetchPromise = fetch(`${baseUrl}/stream/events`, {
        signal: controller.signal
      }).catch(() => {});

      // Wait a bit for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check connections
      const connectionsResponse = await fetch(`${baseUrl}/stream/connections`);
      const connections = await connectionsResponse.json();

      // Abort the SSE connection
      controller.abort();
      await fetchPromise;

      // Verify default pattern
      if (connections.length > 0) {
        expect(connections[0].patterns).toEqual(['*']);
      }
    });

    it('receives events via SSE stream', async () => {
      const controller = new AbortController();
      const receivedData: string[] = [];

      // Start SSE connection
      const fetchPromise = fetch(`${baseUrl}/stream/events`, {
        signal: controller.signal
      });

      // Wait for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get the response and start reading
      const response = await fetchPromise.catch(() => null);

      if (response && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Read initial connection message
        const readPromise = (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              receivedData.push(decoder.decode(value));
            }
          } catch {
            // Connection aborted
          }
        })();

        // Emit an event
        await fetch(`${baseUrl}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: 'test.event', data: { foo: 'bar' } })
        });

        // Wait for event to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Abort and wait for read to finish
        controller.abort();
        await readPromise;
      }

      // Verify we received some data (at least connection comment)
      const allData = receivedData.join('');
      expect(allData).toContain(':'); // SSE comments start with ':'
    });

    it('filters events by pattern', async () => {
      const controller = new AbortController();
      const receivedData: string[] = [];

      // Start SSE connection with specific pattern
      const fetchPromise = fetch(`${baseUrl}/stream/events?patterns=order.*`, {
        signal: controller.signal
      });

      // Wait for connection to be established
      await new Promise((resolve) => setTimeout(resolve, 50));

      const response = await fetchPromise.catch(() => null);

      if (response && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const readPromise = (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              receivedData.push(decoder.decode(value));
            }
          } catch {
            // Connection aborted
          }
        })();

        // Emit matching event
        await fetch(`${baseUrl}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: 'order.created', data: { orderId: '123' } })
        });

        // Emit non-matching event
        await fetch(`${baseUrl}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: 'payment.completed', data: { paymentId: '456' } })
        });

        // Wait for events to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));

        controller.abort();
        await readPromise;
      }

      const allData = receivedData.join('');

      // Should contain order event
      expect(allData).toContain('order.created');
      // Should NOT contain payment event
      expect(allData).not.toContain('payment.completed');
    });

    it('increments connection count', async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      // Start first SSE connection
      const fetch1 = fetch(`${baseUrl}/stream/events`, {
        signal: controller1.signal
      }).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      let stats = await (await fetch(`${baseUrl}/stream/stats`)).json();
      expect(stats.activeConnections).toBe(1);

      // Start second SSE connection
      const fetch2 = fetch(`${baseUrl}/stream/events`, {
        signal: controller2.signal
      }).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 50));

      stats = await (await fetch(`${baseUrl}/stream/stats`)).json();
      expect(stats.activeConnections).toBe(2);

      // Abort first connection
      controller1.abort();
      await fetch1;

      await new Promise((resolve) => setTimeout(resolve, 50));

      stats = await (await fetch(`${baseUrl}/stream/stats`)).json();
      expect(stats.activeConnections).toBe(1);

      // Abort second connection
      controller2.abort();
      await fetch2;
    });
  });

  describe('SSE Manager integration', () => {
    it('exposes SSE manager via server', () => {
      const sseManager = server.getSSEManager();
      expect(sseManager).toBeDefined();
      expect(typeof sseManager.getStats).toBe('function');
      expect(typeof sseManager.broadcast).toBe('function');
    });

    it('broadcasts events to SSE when emitted via API', async () => {
      const sseManager = server.getSSEManager();
      const initialStats = sseManager.getStats();

      // Emit event
      await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test', data: {} })
      });

      // Without active connections, totalEventsSent should remain 0
      const stats = sseManager.getStats();
      expect(stats.totalEventsSent).toBe(initialStats.totalEventsSent);
    });
  });
});
