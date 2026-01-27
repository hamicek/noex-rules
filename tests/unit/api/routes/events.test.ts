import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { Event } from '../../../../src/types/event';

describe('Events API', () => {
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

  describe('POST /events', () => {
    it('emits event with topic and data', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'order.created',
          data: { orderId: '123', amount: 1500 }
        })
      });
      const event: Event = await response.json();

      expect(response.status).toBe(201);
      expect(event.id).toBeTypeOf('string');
      expect(event.topic).toBe('order.created');
      expect(event.data).toEqual({ orderId: '123', amount: 1500 });
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.source).toBe('api');
    });

    it('emits event with topic only (empty data)', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'system.heartbeat' })
      });
      const event: Event = await response.json();

      expect(response.status).toBe(201);
      expect(event.topic).toBe('system.heartbeat');
      expect(event.data).toEqual({});
    });

    it('returns 400 when topic is missing', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { foo: 'bar' } })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('topic');
    });

    it('returns 400 when topic is empty string', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: '' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when topic is not a string', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 123 })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when data is not an object', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test', data: 'not-an-object' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('data');
    });

    it('returns 400 when data is an array', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test', data: [1, 2, 3] })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when data is null', async () => {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test', data: null })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('handles complex nested data', async () => {
      const complexData = {
        user: { id: 1, name: 'Alice', roles: ['admin', 'user'] },
        metadata: { timestamp: Date.now(), nested: { deep: { value: true } } }
      };

      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'complex.event', data: complexData })
      });
      const event: Event = await response.json();

      expect(response.status).toBe(201);
      expect(event.data).toEqual(complexData);
    });

    it('generates unique event IDs', async () => {
      const responses = await Promise.all([
        fetch(`${baseUrl}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: 'test' })
        }),
        fetch(`${baseUrl}/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: 'test' })
        })
      ]);

      const events: Event[] = await Promise.all(responses.map(r => r.json()));
      expect(events[0].id).not.toBe(events[1].id);
    });
  });

  describe('POST /events/correlated', () => {
    it('emits correlated event with all fields', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'payment.processed',
          data: { amount: 1500, currency: 'CZK' },
          correlationId: 'order-123',
          causationId: 'event-456'
        })
      });
      const event: Event = await response.json();

      expect(response.status).toBe(201);
      expect(event.id).toBeTypeOf('string');
      expect(event.topic).toBe('payment.processed');
      expect(event.data).toEqual({ amount: 1500, currency: 'CZK' });
      expect(event.correlationId).toBe('order-123');
      expect(event.causationId).toBe('event-456');
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.source).toBe('api');
    });

    it('emits correlated event without causationId', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'order.shipped',
          correlationId: 'order-789'
        })
      });
      const event: Event = await response.json();

      expect(response.status).toBe(201);
      expect(event.correlationId).toBe('order-789');
      expect(event.causationId).toBeUndefined();
    });

    it('emits correlated event with empty data', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'notification.sent',
          correlationId: 'flow-001'
        })
      });
      const event: Event = await response.json();

      expect(response.status).toBe(201);
      expect(event.data).toEqual({});
    });

    it('returns 400 when topic is missing', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correlationId: 'order-123' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('topic');
    });

    it('returns 400 when correlationId is missing', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'order.created' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('correlationId');
    });

    it('returns 400 when correlationId is empty string', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test', correlationId: '' })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when correlationId is not a string', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'test', correlationId: 123 })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when data is not an object', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'test',
          correlationId: 'corr-1',
          data: 'invalid'
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
    });

    it('returns 400 when causationId is not a string', async () => {
      const response = await fetch(`${baseUrl}/events/correlated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'test',
          correlationId: 'corr-1',
          causationId: 123
        })
      });
      const error = await response.json();

      expect(response.status).toBe(400);
      expect(error.error).toBe('Bad Request');
      expect(error.message).toContain('causationId');
    });
  });

  describe('event triggering rules', () => {
    it('triggers rule when matching event is emitted', async () => {
      const engine = server.getEngine();

      engine.registerRule({
        id: 'test-rule',
        name: 'Test Rule',
        priority: 0,
        enabled: true,
        tags: [],
        trigger: { type: 'event', topic: 'order.created' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'order:triggered', value: true }
        ]
      });

      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'order.created', data: {} })
      });

      expect(response.status).toBe(201);

      // Wait for async rule execution
      await new Promise(resolve => setTimeout(resolve, 100));

      const fact = engine.getFact('order:triggered');
      expect(fact).toBe(true);
    });
  });
});
