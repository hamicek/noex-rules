import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Timers API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('GET /api/v1/timers', () => {
    it('returns empty array when no timers exist', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/timers'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns all active timers', async () => {
      await ctx.engine.setTimer({
        name: 'timer-1',
        duration: '10m',
        onExpire: { topic: 'timer.expired', data: {} }
      });

      await ctx.engine.setTimer({
        name: 'timer-2',
        duration: '5m',
        onExpire: { topic: 'timer.expired', data: {} }
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/timers'
      });

      expect(response.statusCode).toBe(200);
      const timers = response.json();
      expect(timers).toHaveLength(2);

      const names = timers.map((t: { name: string }) => t.name);
      expect(names).toContain('timer-1');
      expect(names).toContain('timer-2');
    });
  });

  describe('GET /api/v1/timers/:name', () => {
    it('returns timer by name', async () => {
      await ctx.engine.setTimer({
        name: 'my-timer',
        duration: '30s',
        onExpire: {
          topic: 'reminder.triggered',
          data: { message: 'Hello!' }
        }
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/timers/my-timer'
      });

      expect(response.statusCode).toBe(200);
      const timer = response.json();
      expect(timer.name).toBe('my-timer');
      expect(timer.onExpire.topic).toBe('reminder.triggered');
      expect(timer.onExpire.data).toEqual({ message: 'Hello!' });
      expect(timer.expiresAt).toBeDefined();
    });

    it('returns 404 for non-existent timer', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/timers/non-existent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/timers', () => {
    it('creates a simple timer with string duration', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'new-timer',
          duration: '1h',
          onExpire: {
            topic: 'session.timeout',
            data: { reason: 'inactivity' }
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const timer = response.json();
      expect(timer.name).toBe('new-timer');
      expect(timer.onExpire.topic).toBe('session.timeout');
      expect(timer.expiresAt).toBeDefined();
    });

    it('creates a timer with numeric duration (milliseconds)', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'ms-timer',
          duration: 60000,
          onExpire: {
            topic: 'timer.done',
            data: {}
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const timer = response.json();
      expect(timer.name).toBe('ms-timer');
    });

    it('creates a repeating timer', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'heartbeat',
          duration: '10s',
          onExpire: {
            topic: 'health.check',
            data: { service: 'api' }
          },
          repeat: {
            interval: '10s'
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const timer = response.json();
      expect(timer.name).toBe('heartbeat');
      expect(timer.repeat).toBeDefined();
    });

    it('creates a repeating timer with max count', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'limited-repeat',
          duration: '5s',
          onExpire: {
            topic: 'retry.attempt',
            data: {}
          },
          repeat: {
            interval: '5s',
            maxCount: 3
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const timer = response.json();
      expect(timer.repeat?.maxCount).toBe(3);
    });

    it('creates a timer without onExpire.data', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'minimal-timer',
          duration: '1m',
          onExpire: {
            topic: 'ping'
          }
        }
      });

      expect(response.statusCode).toBe(201);
      const timer = response.json();
      expect(timer.onExpire.data).toEqual({});
    });

    it('returns 400 when name is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          duration: '1m',
          onExpire: { topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when duration is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'no-duration',
          onExpire: { topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when onExpire is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'no-expire',
          duration: '1m'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when onExpire.topic is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'no-topic',
          duration: '1m',
          onExpire: { data: {} }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name is not a string', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 123,
          duration: '1m',
          onExpire: { topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when duration has invalid type', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'bad-duration',
          duration: true,
          onExpire: { topic: 'test' }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when onExpire.data is not an object', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'bad-data',
          duration: '1m',
          onExpire: {
            topic: 'test',
            data: 'invalid'
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when repeat is not an object', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'bad-repeat',
          duration: '1m',
          onExpire: { topic: 'test' },
          repeat: 'invalid'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when repeat.interval is missing', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'missing-interval',
          duration: '1m',
          onExpire: { topic: 'test' },
          repeat: {}
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when repeat.maxCount is not a number', async () => {
      const response = await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/timers',
        payload: {
          name: 'bad-max-count',
          duration: '1m',
          onExpire: { topic: 'test' },
          repeat: {
            interval: '1m',
            maxCount: 'three'
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/timers/:name', () => {
    it('cancels an existing timer', async () => {
      await ctx.engine.setTimer({
        name: 'to-cancel',
        duration: '10m',
        onExpire: { topic: 'test', data: {} }
      });

      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/timers/to-cancel'
      });

      expect(response.statusCode).toBe(204);
      expect(ctx.engine.getTimer('to-cancel')).toBeUndefined();
    });

    it('returns 404 for non-existent timer', async () => {
      const response = await ctx.fastify.inject({
        method: 'DELETE',
        url: '/api/v1/timers/non-existent'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });
});
