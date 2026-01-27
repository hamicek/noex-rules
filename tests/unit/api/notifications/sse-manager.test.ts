import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEManager, type SSEClient } from '../../../../src/api/notifications/sse-manager';
import type { Event } from '../../../../src/types/event';

function createMockReply(): {
  reply: SSEClient['reply'];
  writtenData: string[];
  headers: Record<string, unknown>;
  ended: boolean;
} {
  const writtenData: string[] = [];
  let headers: Record<string, unknown> = {};
  let ended = false;
  const closeHandlers: Array<() => void> = [];

  const reply = {
    raw: {
      writeHead: vi.fn((status: number, hdrs: Record<string, unknown>) => {
        headers = hdrs;
      }),
      write: vi.fn((data: string) => {
        if (ended) throw new Error('Write after end');
        writtenData.push(data);
        return true;
      }),
      end: vi.fn(() => {
        ended = true;
      }),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandlers.push(handler);
        }
      }),
      get writableEnded() {
        return ended;
      }
    },
    triggerClose: () => {
      closeHandlers.forEach((h) => h());
    }
  } as unknown as SSEClient['reply'] & { triggerClose: () => void };

  return { reply, writtenData, headers, ended };
}

function createMockEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-123',
    data: { key: 'value' },
    timestamp: Date.now(),
    source: 'test',
    ...overrides
  };
}

describe('SSEManager', () => {
  let sseManager: SSEManager;

  beforeEach(() => {
    vi.useFakeTimers();
    sseManager = new SSEManager({ heartbeatInterval: 1000 });
  });

  afterEach(() => {
    sseManager.stop();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates manager with default heartbeat interval', () => {
      const manager = new SSEManager();
      expect(manager.connectionCount).toBe(0);
      manager.stop();
    });

    it('creates manager with custom heartbeat interval', () => {
      const manager = new SSEManager({ heartbeatInterval: 5000 });
      expect(manager.connectionCount).toBe(0);
      manager.stop();
    });
  });

  describe('start/stop', () => {
    it('starts heartbeat timer', () => {
      sseManager.start();
      const { reply, writtenData } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      // Advance time to trigger heartbeat
      vi.advanceTimersByTime(1000);

      // Should have connection comment + heartbeat
      expect(writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
    });

    it('does not start heartbeat twice', () => {
      sseManager.start();
      sseManager.start(); // Should not throw or create duplicate timers

      const { reply, writtenData } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      vi.advanceTimersByTime(1000);

      // Should only have one heartbeat (not two from duplicate timers)
      const heartbeats = writtenData.filter((d) => d.includes('heartbeat'));
      expect(heartbeats.length).toBe(1);
    });

    it('stops heartbeat timer', () => {
      sseManager.start();
      const { reply, writtenData } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      sseManager.stop();

      vi.advanceTimersByTime(2000);

      // No more heartbeats after stop
      const heartbeats = writtenData.filter((d) => d.includes('heartbeat'));
      expect(heartbeats.length).toBe(0);
    });

    it('closes all connections on stop', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply);
      sseManager.addConnection('conn-2', mock2.reply);

      expect(sseManager.connectionCount).toBe(2);

      sseManager.stop();

      expect(sseManager.connectionCount).toBe(0);
      expect(mock1.reply.raw.end).toHaveBeenCalled();
      expect(mock2.reply.raw.end).toHaveBeenCalled();
    });
  });

  describe('addConnection', () => {
    it('adds connection with SSE headers', () => {
      const { reply, headers } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      expect(reply.raw.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
    });

    it('sends connection confirmation comment', () => {
      const { reply, writtenData } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      expect(writtenData.length).toBe(1);
      expect(writtenData[0]).toContain(': connected:conn-1');
    });

    it('uses default wildcard pattern when no patterns specified', () => {
      const { reply } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      const connections = sseManager.getConnections();
      expect(connections[0].patterns).toEqual(['*']);
    });

    it('uses provided patterns', () => {
      const { reply } = createMockReply();
      sseManager.addConnection('conn-1', reply, ['order.*', 'payment.completed']);

      const connections = sseManager.getConnections();
      expect(connections[0].patterns).toEqual(['order.*', 'payment.completed']);
    });

    it('uses wildcard when empty patterns array provided', () => {
      const { reply } = createMockReply();
      sseManager.addConnection('conn-1', reply, []);

      const connections = sseManager.getConnections();
      expect(connections[0].patterns).toEqual(['*']);
    });

    it('increments connection count', () => {
      expect(sseManager.connectionCount).toBe(0);

      const { reply: reply1 } = createMockReply();
      sseManager.addConnection('conn-1', reply1);
      expect(sseManager.connectionCount).toBe(1);

      const { reply: reply2 } = createMockReply();
      sseManager.addConnection('conn-2', reply2);
      expect(sseManager.connectionCount).toBe(2);
    });

    it('registers close handler for automatic cleanup', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply);

      expect(sseManager.connectionCount).toBe(1);

      // Simulate client disconnect
      (mock.reply as unknown as { triggerClose: () => void }).triggerClose();

      expect(sseManager.connectionCount).toBe(0);
    });
  });

  describe('removeConnection', () => {
    it('removes existing connection', () => {
      const { reply } = createMockReply();
      sseManager.addConnection('conn-1', reply);
      expect(sseManager.connectionCount).toBe(1);

      sseManager.removeConnection('conn-1');
      expect(sseManager.connectionCount).toBe(0);
    });

    it('ends the connection stream', () => {
      const { reply } = createMockReply();
      sseManager.addConnection('conn-1', reply);

      sseManager.removeConnection('conn-1');

      expect(reply.raw.end).toHaveBeenCalled();
    });

    it('does nothing for non-existent connection', () => {
      sseManager.removeConnection('non-existent');
      expect(sseManager.connectionCount).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('sends event to all matching clients', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply, ['*']);
      sseManager.addConnection('conn-2', mock2.reply, ['*']);

      const event = createMockEvent();
      sseManager.broadcast(event, 'order.created');

      // Both should receive the event (skip first connection comment)
      expect(mock1.writtenData.length).toBe(2);
      expect(mock2.writtenData.length).toBe(2);
      expect(mock1.writtenData[1]).toContain('order.created');
      expect(mock2.writtenData[1]).toContain('order.created');
    });

    it('filters events by pattern', () => {
      const mockOrder = createMockReply();
      const mockPayment = createMockReply();

      sseManager.addConnection('conn-order', mockOrder.reply, ['order.*']);
      sseManager.addConnection('conn-payment', mockPayment.reply, ['payment.*']);

      const event = createMockEvent();
      sseManager.broadcast(event, 'order.created');

      // Only order client receives the event
      expect(mockOrder.writtenData.length).toBe(2);
      expect(mockPayment.writtenData.length).toBe(1); // Only connection comment
    });

    it('matches exact topic pattern', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply, ['order.created']);

      const event = createMockEvent();
      sseManager.broadcast(event, 'order.created');
      sseManager.broadcast(event, 'order.updated');

      // Should receive only the exact match
      expect(mock.writtenData.length).toBe(2);
      expect(mock.writtenData[1]).toContain('order.created');
    });

    it('matches wildcard at end of pattern', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply, ['order.*']);

      const event = createMockEvent();
      sseManager.broadcast(event, 'order.created');
      sseManager.broadcast(event, 'order.updated');
      sseManager.broadcast(event, 'payment.completed');

      // Should receive both order events
      expect(mock.writtenData.length).toBe(3);
    });

    it('matches global wildcard', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply, ['*']);

      const event = createMockEvent();
      sseManager.broadcast(event, 'order.created');
      sseManager.broadcast(event, 'payment.completed');
      sseManager.broadcast(event, 'user.login');

      // Should receive all events
      expect(mock.writtenData.length).toBe(4);
    });

    it('increments totalEventsSent counter', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply, ['*']);

      const initialStats = sseManager.getStats();
      expect(initialStats.totalEventsSent).toBe(0);

      const event = createMockEvent();
      sseManager.broadcast(event, 'test.event');

      const stats = sseManager.getStats();
      expect(stats.totalEventsSent).toBe(1);
    });

    it('counts events per client', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply, ['*']);
      sseManager.addConnection('conn-2', mock2.reply, ['*']);

      const event = createMockEvent();
      sseManager.broadcast(event, 'test.event');

      // Each client receives the event, so counter increments by 2
      const stats = sseManager.getStats();
      expect(stats.totalEventsSent).toBe(2);
    });

    it('formats event data correctly', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply, ['*']);

      const event = createMockEvent({
        id: 'evt-456',
        data: { orderId: '123', amount: 99.99 },
        timestamp: 1700000000000,
        correlationId: 'corr-789',
        source: 'test-source'
      });
      sseManager.broadcast(event, 'order.created');

      const eventData = mock.writtenData[1];
      expect(eventData).toContain('data: ');
      expect(eventData).toContain('"id":"evt-456"');
      expect(eventData).toContain('"topic":"order.created"');
      expect(eventData).toContain('"orderId":"123"');
      expect(eventData).toContain('"correlationId":"corr-789"');
      expect(eventData).toContain('"source":"test-source"');
    });

    it('removes dead connections during broadcast', () => {
      const mock = createMockReply();
      sseManager.addConnection('conn-1', mock.reply, ['*']);

      // Simulate connection being closed
      mock.reply.raw.end();

      const event = createMockEvent();
      sseManager.broadcast(event, 'test.event');

      // Dead connection should be removed
      expect(sseManager.connectionCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns correct stats', () => {
      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply);
      sseManager.addConnection('conn-2', mock2.reply);

      const event = createMockEvent();
      sseManager.broadcast(event, 'test');

      const stats = sseManager.getStats();
      expect(stats).toEqual({
        activeConnections: 2,
        totalEventsSent: 2
      });
    });
  });

  describe('getConnections', () => {
    it('returns list of active connections', () => {
      vi.useRealTimers();
      const beforeConnect = Date.now();

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply, ['order.*']);
      sseManager.addConnection('conn-2', mock2.reply, ['payment.*', 'refund.*']);

      const afterConnect = Date.now();
      const connections = sseManager.getConnections();

      expect(connections).toHaveLength(2);
      expect(connections[0]).toMatchObject({
        id: 'conn-1',
        patterns: ['order.*']
      });
      expect(connections[0].connectedAt).toBeGreaterThanOrEqual(beforeConnect);
      expect(connections[0].connectedAt).toBeLessThanOrEqual(afterConnect);

      expect(connections[1]).toMatchObject({
        id: 'conn-2',
        patterns: ['payment.*', 'refund.*']
      });

      vi.useFakeTimers();
    });
  });

  describe('heartbeat', () => {
    it('sends heartbeat to all connections', () => {
      sseManager.start();

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply);
      sseManager.addConnection('conn-2', mock2.reply);

      vi.advanceTimersByTime(1000);

      expect(mock1.writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
      expect(mock2.writtenData.some((d) => d.includes('heartbeat'))).toBe(true);
    });

    it('removes dead connections during heartbeat', () => {
      sseManager.start();

      const mock1 = createMockReply();
      const mock2 = createMockReply();

      sseManager.addConnection('conn-1', mock1.reply);
      sseManager.addConnection('conn-2', mock2.reply);

      // Simulate first connection being closed
      mock1.reply.raw.end();

      vi.advanceTimersByTime(1000);

      // Dead connection should be cleaned up
      expect(sseManager.connectionCount).toBe(1);
      const connections = sseManager.getConnections();
      expect(connections[0].id).toBe('conn-2');
    });
  });

  describe('topic pattern matching', () => {
    const testCases = [
      { pattern: '*', topic: 'anything', expected: true },
      { pattern: '*', topic: 'order.created', expected: true },
      { pattern: '*', topic: 'a.b.c.d', expected: true },
      { pattern: 'order.*', topic: 'order.created', expected: true },
      { pattern: 'order.*', topic: 'order.updated', expected: true },
      { pattern: 'order.*', topic: 'order', expected: false },
      { pattern: 'order.*', topic: 'orders.created', expected: false },
      { pattern: 'order.*', topic: 'payment.created', expected: false },
      { pattern: 'order.created', topic: 'order.created', expected: true },
      { pattern: 'order.created', topic: 'order.updated', expected: false },
      { pattern: 'order.*.completed', topic: 'order.payment.completed', expected: true },
      { pattern: 'order.*.completed', topic: 'order.shipping.completed', expected: true },
      { pattern: 'order.*.completed', topic: 'order.completed', expected: false }
    ];

    testCases.forEach(({ pattern, topic, expected }) => {
      it(`pattern "${pattern}" ${expected ? 'matches' : 'does not match'} topic "${topic}"`, () => {
        const mock = createMockReply();
        sseManager.addConnection('conn-1', mock.reply, [pattern]);

        const event = createMockEvent();
        sseManager.broadcast(event, topic);

        const receivedEvent = mock.writtenData.length > 1;
        expect(receivedEvent).toBe(expected);
      });
    });
  });
});
