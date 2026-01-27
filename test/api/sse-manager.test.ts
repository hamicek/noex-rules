import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEManager } from '../../src/api/notifications/sse-manager.js';
import type { Event } from '../../src/types/event.js';
import type { FastifyReply } from 'fastify';

/**
 * Vytvoří mock FastifyReply pro testování SSE.
 */
function createMockReply(): {
  reply: FastifyReply;
  written: string[];
  headers: Record<string, unknown>;
  isClosed: () => boolean;
  onClose: () => void;
} {
  const written: string[] = [];
  const headers: Record<string, unknown> = {};
  let closed = false;
  let closeCallback: (() => void) | null = null;

  const raw = {
    writableEnded: false,
    writeHead: vi.fn((statusCode: number, headersObj: Record<string, unknown>) => {
      Object.assign(headers, { statusCode, ...headersObj });
    }),
    write: vi.fn((data: string) => {
      if (closed) throw new Error('Stream closed');
      written.push(data);
      return true;
    }),
    end: vi.fn(() => {
      closed = true;
      raw.writableEnded = true;
    }),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'close') {
        closeCallback = callback;
      }
    })
  };

  return {
    reply: { raw } as unknown as FastifyReply,
    written,
    headers,
    isClosed: () => closed,
    onClose: () => {
      closed = true;
      raw.writableEnded = true;
      closeCallback?.();
    }
  };
}

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

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager({ heartbeatInterval: 100 });
  });

  afterEach(() => {
    manager.stop();
  });

  describe('constructor', () => {
    it('creates manager with default config', () => {
      const m = new SSEManager();
      expect(m.connectionCount).toBe(0);
      m.stop();
    });

    it('creates manager with custom heartbeat interval', () => {
      const m = new SSEManager({ heartbeatInterval: 5000 });
      expect(m.connectionCount).toBe(0);
      m.stop();
    });
  });

  describe('addConnection', () => {
    it('adds a new connection', () => {
      const { reply } = createMockReply();

      manager.addConnection('conn-1', reply);

      expect(manager.connectionCount).toBe(1);
    });

    it('sets correct SSE headers', () => {
      const { reply, headers } = createMockReply();

      manager.addConnection('conn-1', reply);

      expect(headers).toMatchObject({
        statusCode: 200,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
    });

    it('sends connection confirmation comment', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply);

      expect(written).toContain(': connected:conn-1\n\n');
    });

    it('registers close handler', () => {
      const { reply, onClose } = createMockReply();

      manager.addConnection('conn-1', reply);
      expect(manager.connectionCount).toBe(1);

      onClose();
      expect(manager.connectionCount).toBe(0);
    });

    it('uses wildcard pattern by default', () => {
      const { reply } = createMockReply();

      manager.addConnection('conn-1', reply);

      const connections = manager.getConnections();
      expect(connections[0].patterns).toEqual(['*']);
    });

    it('accepts custom patterns', () => {
      const { reply } = createMockReply();

      manager.addConnection('conn-1', reply, ['order.*', 'payment.completed']);

      const connections = manager.getConnections();
      expect(connections[0].patterns).toEqual(['order.*', 'payment.completed']);
    });

    it('falls back to wildcard when empty patterns provided', () => {
      const { reply } = createMockReply();

      manager.addConnection('conn-1', reply, []);

      const connections = manager.getConnections();
      expect(connections[0].patterns).toEqual(['*']);
    });
  });

  describe('removeConnection', () => {
    it('removes existing connection', () => {
      const { reply } = createMockReply();

      manager.addConnection('conn-1', reply);
      expect(manager.connectionCount).toBe(1);

      manager.removeConnection('conn-1');
      expect(manager.connectionCount).toBe(0);
    });

    it('handles non-existent connection gracefully', () => {
      expect(() => manager.removeConnection('non-existent')).not.toThrow();
    });

    it('closes the reply stream', () => {
      const { reply, isClosed } = createMockReply();

      manager.addConnection('conn-1', reply);
      manager.removeConnection('conn-1');

      expect(isClosed()).toBe(true);
    });
  });

  describe('broadcast', () => {
    it('sends event to all connected clients with wildcard pattern', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      manager.addConnection('conn-1', mock1.reply);
      manager.addConnection('conn-2', mock2.reply);

      const event = createEvent({ topic: 'order.created' });
      manager.broadcast(event, 'order.created');

      expect(mock1.written.some(w => w.includes('data:'))).toBe(true);
      expect(mock2.written.some(w => w.includes('data:'))).toBe(true);
    });

    it('filters events by topic pattern', () => {
      const orderClient = createMockReply();
      const paymentClient = createMockReply();

      manager.addConnection('order-conn', orderClient.reply, ['order.*']);
      manager.addConnection('payment-conn', paymentClient.reply, ['payment.*']);

      const event = createEvent({ topic: 'order.created' });
      manager.broadcast(event, 'order.created');

      const orderDataMessages = orderClient.written.filter(w => w.startsWith('data:'));
      const paymentDataMessages = paymentClient.written.filter(w => w.startsWith('data:'));

      expect(orderDataMessages).toHaveLength(1);
      expect(paymentDataMessages).toHaveLength(0);
    });

    it('sends correctly formatted SSE data', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply);

      const event = createEvent({
        id: 'evt-456',
        topic: 'test.topic',
        data: { key: 'value' },
        timestamp: 1704067200000,
        correlationId: 'corr-789',
        source: 'test'
      });

      manager.broadcast(event, 'test.topic');

      const dataMessage = written.find(w => w.startsWith('data:'));
      expect(dataMessage).toBeDefined();

      const parsed = JSON.parse(dataMessage!.replace('data: ', '').trim());
      expect(parsed).toEqual({
        id: 'evt-456',
        topic: 'test.topic',
        data: { key: 'value' },
        timestamp: 1704067200000,
        correlationId: 'corr-789',
        source: 'test'
      });
    });

    it('handles closed connections gracefully', () => {
      const { reply, onClose } = createMockReply();

      manager.addConnection('conn-1', reply);
      onClose();

      const event = createEvent();

      expect(() => manager.broadcast(event, 'test.event')).not.toThrow();
    });

    it('increments totalEventsSent counter', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      manager.addConnection('conn-1', mock1.reply);
      manager.addConnection('conn-2', mock2.reply);

      manager.broadcast(createEvent(), 'test.event');

      expect(manager.getStats().totalEventsSent).toBe(2);
    });
  });

  describe('topic pattern matching', () => {
    it('matches exact topic', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply, ['order.created']);

      manager.broadcast(createEvent(), 'order.created');
      manager.broadcast(createEvent(), 'order.updated');

      const dataMessages = written.filter(w => w.startsWith('data:'));
      expect(dataMessages).toHaveLength(1);
    });

    it('matches wildcard at end of pattern', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply, ['order.*']);

      manager.broadcast(createEvent(), 'order.created');
      manager.broadcast(createEvent(), 'order.updated');
      manager.broadcast(createEvent(), 'payment.completed');

      const dataMessages = written.filter(w => w.startsWith('data:'));
      expect(dataMessages).toHaveLength(2);
    });

    it('matches global wildcard', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply, ['*']);

      manager.broadcast(createEvent(), 'order.created');
      manager.broadcast(createEvent(), 'payment.completed');
      manager.broadcast(createEvent(), 'user.login');

      const dataMessages = written.filter(w => w.startsWith('data:'));
      expect(dataMessages).toHaveLength(3);
    });

    it('matches multiple patterns', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply, ['order.created', 'payment.*']);

      manager.broadcast(createEvent(), 'order.created');
      manager.broadcast(createEvent(), 'order.updated');
      manager.broadcast(createEvent(), 'payment.completed');
      manager.broadcast(createEvent(), 'payment.failed');

      const dataMessages = written.filter(w => w.startsWith('data:'));
      expect(dataMessages).toHaveLength(3);
    });

    it('does not match longer topics without wildcard', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply, ['order']);

      manager.broadcast(createEvent(), 'order');
      manager.broadcast(createEvent(), 'order.created');

      const dataMessages = written.filter(w => w.startsWith('data:'));
      expect(dataMessages).toHaveLength(1);
    });

    it('matches multi-segment topics with wildcard', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply, ['system.event.*']);

      manager.broadcast(createEvent(), 'system.event.started');
      manager.broadcast(createEvent(), 'system.event.stopped');
      manager.broadcast(createEvent(), 'system.error.critical');

      const dataMessages = written.filter(w => w.startsWith('data:'));
      expect(dataMessages).toHaveLength(2);
    });
  });

  describe('heartbeat', () => {
    it('sends heartbeat to all clients', async () => {
      const { reply, written } = createMockReply();

      manager.start();
      manager.addConnection('conn-1', reply);

      // Čekat na heartbeat (interval je 100ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      const heartbeats = written.filter(w => w.includes('heartbeat'));
      expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    });

    it('removes dead connections during heartbeat', async () => {
      const { reply, onClose } = createMockReply();

      manager.start();
      manager.addConnection('conn-1', reply);

      expect(manager.connectionCount).toBe(1);

      // Simulovat odpojení
      onClose();

      // Čekat na heartbeat
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(manager.connectionCount).toBe(0);
    });
  });

  describe('stop', () => {
    it('clears all connections', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      manager.addConnection('conn-1', mock1.reply);
      manager.addConnection('conn-2', mock2.reply);

      expect(manager.connectionCount).toBe(2);

      manager.stop();

      expect(manager.connectionCount).toBe(0);
    });

    it('closes all reply streams', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      manager.addConnection('conn-1', mock1.reply);
      manager.addConnection('conn-2', mock2.reply);

      manager.stop();

      expect(mock1.isClosed()).toBe(true);
      expect(mock2.isClosed()).toBe(true);
    });

    it('stops heartbeat timer', async () => {
      const { reply, written } = createMockReply();

      manager.start();
      manager.addConnection('conn-1', reply);
      manager.stop();

      const countBefore = written.filter(w => w.includes('heartbeat')).length;

      await new Promise(resolve => setTimeout(resolve, 150));

      const countAfter = written.filter(w => w.includes('heartbeat')).length;

      expect(countAfter).toBe(countBefore);
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      manager.addConnection('conn-1', mock1.reply);
      manager.addConnection('conn-2', mock2.reply);

      manager.broadcast(createEvent(), 'test.event');

      const stats = manager.getStats();

      expect(stats.activeConnections).toBe(2);
      expect(stats.totalEventsSent).toBe(2);
    });

    it('returns zero stats for empty manager', () => {
      const stats = manager.getStats();

      expect(stats.activeConnections).toBe(0);
      expect(stats.totalEventsSent).toBe(0);
    });
  });

  describe('getConnections', () => {
    it('returns list of active connections', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      const before = Date.now();

      manager.addConnection('conn-1', mock1.reply, ['order.*']);
      manager.addConnection('conn-2', mock2.reply, ['payment.*']);

      const connections = manager.getConnections();

      expect(connections).toHaveLength(2);
      expect(connections).toContainEqual(
        expect.objectContaining({
          id: 'conn-1',
          patterns: ['order.*']
        })
      );
      expect(connections).toContainEqual(
        expect.objectContaining({
          id: 'conn-2',
          patterns: ['payment.*']
        })
      );

      for (const conn of connections) {
        expect(conn.connectedAt).toBeGreaterThanOrEqual(before);
      }
    });

    it('returns empty array when no connections', () => {
      expect(manager.getConnections()).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles multiple connects and disconnects', () => {
      const mocks = Array.from({ length: 5 }, () => createMockReply());

      for (let i = 0; i < 5; i++) {
        manager.addConnection(`conn-${i}`, mocks[i].reply);
      }

      expect(manager.connectionCount).toBe(5);

      manager.removeConnection('conn-2');
      manager.removeConnection('conn-4');

      expect(manager.connectionCount).toBe(3);

      manager.broadcast(createEvent(), 'test.event');

      expect(manager.getStats().totalEventsSent).toBe(3);
    });

    it('handles connection with same id', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      manager.addConnection('conn-1', mock1.reply);
      manager.addConnection('conn-1', mock2.reply);

      // Druhé připojení přepíše první
      expect(manager.connectionCount).toBe(1);
    });

    it('handles event with undefined correlationId', () => {
      const { reply, written } = createMockReply();

      manager.addConnection('conn-1', reply);

      const event = createEvent({ correlationId: undefined });
      manager.broadcast(event, 'test.event');

      const dataMessage = written.find(w => w.startsWith('data:'));
      const parsed = JSON.parse(dataMessage!.replace('data: ', '').trim());

      expect(parsed.correlationId).toBeUndefined();
    });
  });
});
