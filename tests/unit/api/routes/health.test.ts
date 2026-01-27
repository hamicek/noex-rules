import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RuleEngineServer } from '../../../../src/api/server';
import type { HealthResponse, StatsResponse } from '../../../../src/api/routes/health';

describe('Health API', () => {
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

  describe('GET /health', () => {
    it('returns ok status when engine is running', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const health: HealthResponse = await response.json();

      expect(response.status).toBe(200);
      expect(health.status).toBe('ok');
      expect(health.engine.running).toBe(true);
    });

    it('returns valid timestamp', async () => {
      const before = Date.now();
      const response = await fetch(`${baseUrl}/health`);
      const health: HealthResponse = await response.json();
      const after = Date.now();

      expect(health.timestamp).toBeGreaterThanOrEqual(before);
      expect(health.timestamp).toBeLessThanOrEqual(after);
    });

    it('returns positive uptime', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const health: HealthResponse = await response.json();

      expect(health.uptime).toBeTypeOf('number');
      expect(health.uptime).toBeGreaterThan(0);
    });

    it('returns version string', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const health: HealthResponse = await response.json();

      expect(health.version).toBe('1.0.0');
    });

    it('returns engine info', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const health: HealthResponse = await response.json();

      expect(health.engine).toEqual({
        name: 'noex-rules',
        running: true
      });
    });

    it('returns complete health response structure', async () => {
      const response = await fetch(`${baseUrl}/health`);
      const health: HealthResponse = await response.json();

      expect(health).toMatchObject({
        status: expect.any(String),
        timestamp: expect.any(Number),
        uptime: expect.any(Number),
        version: expect.any(String),
        engine: {
          name: expect.any(String),
          running: expect.any(Boolean)
        }
      });
    });
  });

  describe('GET /stats', () => {
    it('returns initial stats with zero counts', async () => {
      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(response.status).toBe(200);
      expect(stats.rulesCount).toBe(0);
      expect(stats.factsCount).toBe(0);
      expect(stats.timersCount).toBe(0);
      expect(stats.eventsProcessed).toBe(0);
      expect(stats.rulesExecuted).toBe(0);
      expect(stats.avgProcessingTimeMs).toBe(0);
    });

    it('returns valid timestamp', async () => {
      const before = Date.now();
      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();
      const after = Date.now();

      expect(stats.timestamp).toBeGreaterThanOrEqual(before);
      expect(stats.timestamp).toBeLessThanOrEqual(after);
    });

    it('reflects rules count', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'test-rule-1',
        name: 'Test Rule 1',
        trigger: { type: 'event', topic: 'test' },
        tags: []
      });
      engine.registerRule({
        id: 'test-rule-2',
        name: 'Test Rule 2',
        trigger: { type: 'event', topic: 'test' },
        tags: []
      });

      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats.rulesCount).toBe(2);
    });

    it('reflects facts count', async () => {
      const engine = server.getEngine();
      await engine.setFact('fact:1', 'value1');
      await engine.setFact('fact:2', 'value2');
      await engine.setFact('fact:3', 'value3');

      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats.factsCount).toBe(3);
    });

    it('reflects timers count', async () => {
      const engine = server.getEngine();
      await engine.setTimer({
        name: 'timer-1',
        duration: '1h',
        onExpire: { topic: 'timer.expired', data: {} }
      });
      await engine.setTimer({
        name: 'timer-2',
        duration: '2h',
        onExpire: { topic: 'timer.expired', data: {} }
      });

      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats.timersCount).toBe(2);
    });

    it('reflects events processed count', async () => {
      const engine = server.getEngine();
      await engine.emit('test.event.1', { data: 1 });
      await engine.emit('test.event.2', { data: 2 });
      await engine.emit('test.event.3', { data: 3 });

      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats.eventsProcessed).toBe(3);
    });

    it('reflects rules executed count', async () => {
      const engine = server.getEngine();

      engine.registerRule({
        id: 'counting-rule',
        name: 'Counting Rule',
        priority: 0,
        enabled: true,
        trigger: { type: 'event', topic: 'count.me' },
        conditions: [],
        actions: [
          { type: 'set_fact', key: 'execution:count', value: '{{trigger.count}}' }
        ],
        tags: []
      });

      await engine.emit('count.me', { count: 1 });
      await engine.emit('count.me', { count: 2 });

      // Wait for async rule execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats.rulesExecuted).toBeGreaterThanOrEqual(2);
    });

    it('calculates average processing time', async () => {
      const engine = server.getEngine();
      engine.registerRule({
        id: 'processing-rule',
        name: 'Processing Rule',
        priority: 0,
        enabled: true,
        trigger: { type: 'event', topic: 'process' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'processed', value: true }],
        tags: []
      });

      await engine.emit('process', {});

      // Wait for async rule execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns complete stats response structure', async () => {
      const response = await fetch(`${baseUrl}/stats`);
      const stats: StatsResponse = await response.json();

      expect(stats).toMatchObject({
        rulesCount: expect.any(Number),
        factsCount: expect.any(Number),
        timersCount: expect.any(Number),
        eventsProcessed: expect.any(Number),
        rulesExecuted: expect.any(Number),
        avgProcessingTimeMs: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });
  });
});
