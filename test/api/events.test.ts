import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Events API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('POST /api/v1/events', () => {
    it('emits an event with topic only', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'user.created' }
      });

      expect(response.statusCode).toBe(201);
      const event = response.json();
      expect(event.id).toBeDefined();
      expect(event.topic).toBe('user.created');
      expect(event.data).toEqual({});
      expect(event.timestamp).toBeDefined();
      expect(event.source).toBe('api');
    });

    it('emits an event with data', async () => {
      const eventData = {
        userId: 123,
        email: 'user@example.com',
        name: 'John Doe'
      };

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {
          topic: 'user.created',
          data: eventData
        }
      });

      expect(response.statusCode).toBe(201);
      const event = response.json();
      expect(event.topic).toBe('user.created');
      expect(event.data).toEqual(eventData);
    });

    it('emits an event with nested data', async () => {
      const nestedData = {
        order: {
          id: 'ord-123',
          items: [
            { sku: 'SKU-1', quantity: 2 },
            { sku: 'SKU-2', quantity: 1 }
          ],
          total: 150.50
        },
        customer: {
          id: 'cust-456',
          tier: 'gold'
        }
      };

      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {
          topic: 'order.placed',
          data: nestedData
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().data).toEqual(nestedData);
    });

    it('notifies subscribers when event is emitted', async () => {
      const receivedEvents: { topic: string; data: Record<string, unknown> }[] = [];

      ctx.engine.subscribe('test.event', (event) => {
        receivedEvents.push({ topic: event.topic, data: event.data });
      });

      await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {
          topic: 'test.event',
          data: { message: 'hello' }
        }
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].topic).toBe('test.event');
      expect(receivedEvents[0].data).toEqual({ message: 'hello' });
    });

    it('returns 400 when topic is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { data: { foo: 'bar' } }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when topic is not a string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 123 }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when data is not an object', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'test', data: 'not-an-object' }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when data is an array', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'test', data: [1, 2, 3] }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when data is null', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'test', data: null }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/events/correlated', () => {
    it('emits a correlated event', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: {
          topic: 'order.step',
          data: { step: 'payment' },
          correlationId: 'saga-123'
        }
      });

      expect(response.statusCode).toBe(201);
      const event = response.json();
      expect(event.topic).toBe('order.step');
      expect(event.correlationId).toBe('saga-123');
      expect(event.causationId).toBeUndefined();
    });

    it('emits a correlated event with causation id', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: {
          topic: 'payment.processed',
          data: { amount: 100 },
          correlationId: 'saga-123',
          causationId: 'event-456'
        }
      });

      expect(response.statusCode).toBe(201);
      const event = response.json();
      expect(event.correlationId).toBe('saga-123');
      expect(event.causationId).toBe('event-456');
    });

    it('emits correlated event without data', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: {
          topic: 'saga.started',
          correlationId: 'new-saga-789'
        }
      });

      expect(response.statusCode).toBe(201);
      const event = response.json();
      expect(event.data).toEqual({});
      expect(event.correlationId).toBe('new-saga-789');
    });

    it('returns 400 when topic is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: { correlationId: 'saga-123' }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when correlationId is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: { topic: 'test.event' }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when correlationId is not a string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: {
          topic: 'test',
          correlationId: 12345
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when causationId is not a string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: {
          topic: 'test',
          correlationId: 'saga-123',
          causationId: 12345
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when data is not an object', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events/correlated',
        payload: {
          topic: 'test',
          correlationId: 'saga-123',
          data: 'invalid'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });
});
