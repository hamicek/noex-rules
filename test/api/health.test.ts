import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, closeTestServer, type TestContext } from './setup.js';

describe('Health API', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestServer();
  });

  afterEach(async () => {
    await closeTestServer(ctx);
  });

  describe('GET /api/v1/health', () => {
    it('returns health status', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/health'
      });

      expect(response.statusCode).toBe(200);
      const health = response.json();

      expect(health.status).toBe('ok');
      expect(health.timestamp).toBeDefined();
      expect(typeof health.timestamp).toBe('number');
      expect(health.uptime).toBeDefined();
      expect(typeof health.uptime).toBe('number');
      expect(health.version).toBe('1.0.0');
      expect(health.engine).toEqual({
        name: 'noex-rules',
        running: true
      });
    });

    it('returns timestamp close to current time', async () => {
      const before = Date.now();

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/health'
      });

      const after = Date.now();
      const health = response.json();

      expect(health.timestamp).toBeGreaterThanOrEqual(before);
      expect(health.timestamp).toBeLessThanOrEqual(after);
    });

    it('returns positive uptime', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/health'
      });

      const health = response.json();
      expect(health.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/stats', () => {
    it('returns initial stats with zero counters', async () => {
      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      expect(response.statusCode).toBe(200);
      const stats = response.json();

      expect(stats.rulesCount).toBe(0);
      expect(stats.factsCount).toBe(0);
      expect(stats.timersCount).toBe(0);
      expect(stats.eventsProcessed).toBe(0);
      expect(stats.rulesExecuted).toBe(0);
      expect(stats.avgProcessingTimeMs).toBe(0);
      expect(stats.timestamp).toBeDefined();
    });

    it('reflects registered rules count', async () => {
      ctx.engine.registerRule({
        id: 'rule-1',
        name: 'Rule 1',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      ctx.engine.registerRule({
        id: 'rule-2',
        name: 'Rule 2',
        trigger: { type: 'event', topic: 'test' },
        conditions: [],
        actions: [],
        tags: []
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      expect(response.json().rulesCount).toBe(2);
    });

    it('reflects facts count', async () => {
      await ctx.engine.setFact('fact.one', 1);
      await ctx.engine.setFact('fact.two', 2);
      await ctx.engine.setFact('fact.three', 3);

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      expect(response.json().factsCount).toBe(3);
    });

    it('reflects timers count', async () => {
      await ctx.engine.setTimer({
        name: 'timer-1',
        duration: '10m',
        onExpire: { topic: 'test', data: {} }
      });

      await ctx.engine.setTimer({
        name: 'timer-2',
        duration: '20m',
        onExpire: { topic: 'test', data: {} }
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      expect(response.json().timersCount).toBe(2);
    });

    it('increments eventsProcessed on event emission', async () => {
      await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'test.event.1' }
      });

      await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'test.event.2' }
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      expect(response.json().eventsProcessed).toBe(2);
    });

    it('tracks rule execution stats', async () => {
      // Create rule via API to ensure proper registration
      await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/rules',
        payload: {
          id: 'counting-rule',
          name: 'Counting Rule',
          trigger: { type: 'event', topic: 'count.me' },
          conditions: [],
          actions: [
            {
              type: 'set_fact',
              key: 'count',
              value: 1
            }
          ]
        }
      });

      await ctx.fastify.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { topic: 'count.me' }
      });

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      const stats = response.json();
      expect(stats.rulesExecuted).toBe(1);
      expect(stats.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns timestamp in stats', async () => {
      const before = Date.now();

      const response = await ctx.fastify.inject({
        method: 'GET',
        url: '/api/v1/stats'
      });

      const after = Date.now();
      const stats = response.json();

      expect(stats.timestamp).toBeGreaterThanOrEqual(before);
      expect(stats.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
