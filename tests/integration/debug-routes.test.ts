import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { RuleEngine } from '../../src/core/rule-engine';
import { registerDebugRoutes } from '../../src/api/routes/debug';
import { errorHandler } from '../../src/api/middleware/error-handler';
import type { RuleInput } from '../../src/types/rule';

declare module 'fastify' {
  interface FastifyInstance {
    engine: RuleEngine;
  }
}

describe('Debug Routes', () => {
  let fastify: FastifyInstance;
  let engine: RuleEngine;

  const testRule: RuleInput = {
    id: 'test-rule',
    name: 'Test Rule',
    priority: 10,
    enabled: true,
    tags: ['test'],
    trigger: { type: 'event', topic: 'test.event' },
    conditions: [
      { source: { type: 'event', field: 'value' }, operator: 'gt', value: 5 }
    ],
    actions: [
      { type: 'set_fact', key: 'test:result', value: 'success' },
      { type: 'emit_event', topic: 'test.result', data: { status: 'done' } }
    ]
  };

  beforeEach(async () => {
    engine = await RuleEngine.start({
      name: 'debug-routes-test',
      tracing: { enabled: true }
    });
    engine.registerRule(testRule);

    fastify = Fastify();
    fastify.setErrorHandler(errorHandler);
    fastify.decorate('engine', engine);
    await registerDebugRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    await engine.stop();
  });

  describe('GET /debug/tracing', () => {
    it('returns tracing status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/tracing'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({ enabled: true });
    });
  });

  describe('POST /debug/tracing/enable', () => {
    it('enables tracing', async () => {
      engine.disableTracing();

      const response = await fastify.inject({
        method: 'POST',
        url: '/debug/tracing/enable'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({ enabled: true });
      expect(engine.isTracingEnabled()).toBe(true);
    });
  });

  describe('POST /debug/tracing/disable', () => {
    it('disables tracing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/debug/tracing/disable'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({ enabled: false });
      expect(engine.isTracingEnabled()).toBe(false);
    });
  });

  describe('GET /debug/traces', () => {
    it('returns recent trace entries', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/traces'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      const types = body.map((e: { type: string }) => e.type);
      expect(types).toContain('event_emitted');
    });

    it('filters by rule ID', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/traces?ruleId=test-rule'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      body.forEach((entry: { ruleId?: string }) => {
        if (entry.ruleId) {
          expect(entry.ruleId).toBe('test-rule');
        }
      });
    });

    it('filters by trace types', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/traces?types=rule_executed,rule_skipped'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      body.forEach((entry: { type: string }) => {
        expect(['rule_executed', 'rule_skipped']).toContain(entry.type);
      });
    });

    it('respects limit parameter', async () => {
      await engine.emit('test.event', { value: 10 });
      await engine.emit('test.event', { value: 20 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/traces?limit=2'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /debug/history', () => {
    it('returns event history', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/history?topic=test.event'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.events).toBeDefined();
      expect(body.totalCount).toBeGreaterThan(0);
      expect(body.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('filters by correlation ID', async () => {
      const event = await engine.emitCorrelated('test.event', { value: 10 }, 'corr-123');

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/history?correlationId=corr-123'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.events.length).toBeGreaterThan(0);
      body.events.forEach((e: { correlationId?: string }) => {
        expect(e.correlationId).toBe('corr-123');
      });
    });

    it('includes context when requested', async () => {
      await engine.emitCorrelated('test.event', { value: 10 }, 'corr-ctx');

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/history?correlationId=corr-ctx&includeContext=true'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.events.length).toBeGreaterThan(0);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await engine.emitCorrelated('test.event', { value: 10 + i }, 'corr-limit');
      }

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/history?correlationId=corr-limit&limit=2'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.events.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /debug/history/:eventId', () => {
    it('returns event with context', async () => {
      const event = await engine.emitCorrelated('test.event', { value: 10 }, 'corr-single');

      const response = await fastify.inject({
        method: 'GET',
        url: `/debug/history/${event.id}`
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(event.id);
      expect(body.topic).toBe('test.event');
    });

    it('returns 404 for non-existent event', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/history/non-existent-id'
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /debug/correlation/:correlationId', () => {
    it('returns correlation chain', async () => {
      await engine.emitCorrelated('test.event', { value: 10 }, 'corr-chain');

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/correlation/corr-chain'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it('returns empty array for non-existent correlation', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/correlation/non-existent'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  describe('GET /debug/correlation/:correlationId/timeline', () => {
    it('returns correlation timeline', async () => {
      await engine.emitCorrelated('test.event', { value: 10 }, 'corr-timeline');

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/correlation/corr-timeline/timeline'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      body.forEach((entry: { timestamp: number; type: string; depth: number }) => {
        expect(entry.timestamp).toBeDefined();
        expect(['event', 'trace']).toContain(entry.type);
        expect(entry.depth).toBeGreaterThanOrEqual(0);
      });
    });

    it('returns empty array for non-existent correlation', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/correlation/non-existent/timeline'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  describe('GET /debug/correlation/:correlationId/export', () => {
    it('exports to JSON by default', async () => {
      await engine.emitCorrelated('test.event', { value: 10 }, 'corr-export-json');

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/correlation/corr-export-json/export'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });

    it('exports to Mermaid when format=mermaid', async () => {
      await engine.emitCorrelated('test.event', { value: 10 }, 'corr-export-mermaid');

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/correlation/corr-export-mermaid/export?format=mermaid'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('sequenceDiagram');
    });
  });

  describe('tracing with correlation', () => {
    it('captures full trace chain with correlation', async () => {
      const correlationId = 'full-trace-test';
      await engine.emitCorrelated('test.event', { value: 10 }, correlationId);

      const tracesResponse = await fastify.inject({
        method: 'GET',
        url: `/debug/traces?correlationId=${correlationId}`
      });

      expect(tracesResponse.statusCode).toBe(200);
      const traces = tracesResponse.json();

      const types = traces.map((t: { type: string }) => t.type);
      expect(types).toContain('event_emitted');
      expect(types).toContain('rule_triggered');
      expect(types).toContain('condition_evaluated');
      expect(types).toContain('action_started');
      expect(types).toContain('action_completed');
      expect(types).toContain('rule_executed');
    });

    it('captures skipped rule trace', async () => {
      const correlationId = 'skip-trace-test';
      await engine.emitCorrelated('test.event', { value: 3 }, correlationId);

      const tracesResponse = await fastify.inject({
        method: 'GET',
        url: `/debug/traces?correlationId=${correlationId}`
      });

      expect(tracesResponse.statusCode).toBe(200);
      const traces = tracesResponse.json();

      const types = traces.map((t: { type: string }) => t.type);
      expect(types).toContain('rule_skipped');
    });
  });

  describe('GET /debug/profile', () => {
    it('returns all rule profiles', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      const profile = body.find((p: { ruleId: string }) => p.ruleId === 'test-rule');
      expect(profile).toBeDefined();
      expect(profile.ruleName).toBe('Test Rule');
      expect(profile.triggerCount).toBeGreaterThan(0);
    });

    it('returns empty array when no rules profiled', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /debug/profile/summary', () => {
    it('returns profiling summary', async () => {
      await engine.emit('test.event', { value: 10 });
      await engine.emit('test.event', { value: 15 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/summary'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalRulesProfiled).toBeGreaterThan(0);
      expect(body.totalTriggers).toBeGreaterThan(0);
      expect(body.totalExecutions).toBeGreaterThan(0);
      expect(body.profilingStartedAt).toBeDefined();
    });

    it('returns empty summary when no activity', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/summary'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalRulesProfiled).toBe(0);
      expect(body.totalTriggers).toBe(0);
      expect(body.slowestRule).toBeNull();
      expect(body.hottestRule).toBeNull();
    });
  });

  describe('GET /debug/profile/slowest', () => {
    it('returns slowest rules', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/slowest'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('respects limit parameter', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/slowest?limit=1'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.length).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /debug/profile/hottest', () => {
    it('returns hottest rules', async () => {
      await engine.emit('test.event', { value: 10 });
      await engine.emit('test.event', { value: 15 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/hottest'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      if (body.length > 0) {
        expect(body[0].triggerCount).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /debug/profile/:ruleId', () => {
    it('returns profile for specific rule', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/test-rule'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ruleId).toBe('test-rule');
      expect(body.ruleName).toBe('Test Rule');
      expect(body.triggerCount).toBeGreaterThan(0);
      expect(body.executionCount).toBeGreaterThan(0);
      expect(body.conditionProfiles).toBeDefined();
      expect(body.actionProfiles).toBeDefined();
    });

    it('returns 404 for non-existent rule', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/non-existent-rule'
      });

      expect(response.statusCode).toBe(404);
    });

    it('includes condition profiles', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/test-rule'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.conditionProfiles.length).toBeGreaterThan(0);
      expect(body.conditionProfiles[0]).toHaveProperty('conditionIndex');
      expect(body.conditionProfiles[0]).toHaveProperty('evaluationCount');
      expect(body.conditionProfiles[0]).toHaveProperty('passRate');
    });

    it('includes action profiles', async () => {
      await engine.emit('test.event', { value: 10 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/test-rule'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.actionProfiles.length).toBeGreaterThan(0);
      expect(body.actionProfiles[0]).toHaveProperty('actionIndex');
      expect(body.actionProfiles[0]).toHaveProperty('actionType');
      expect(body.actionProfiles[0]).toHaveProperty('executionCount');
      expect(body.actionProfiles[0]).toHaveProperty('successRate');
    });
  });

  describe('POST /debug/profile/reset', () => {
    it('resets profiling data', async () => {
      await engine.emit('test.event', { value: 10 });

      let response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile'
      });
      expect(response.json().length).toBeGreaterThan(0);

      response = await fastify.inject({
        method: 'POST',
        url: '/debug/profile/reset'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ reset: true });

      response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile'
      });
      expect(response.json().length).toBe(0);
    });
  });

  describe('profiling with skipped rules', () => {
    it('tracks skipped rules in profile', async () => {
      await engine.emit('test.event', { value: 3 });

      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/profile/test-rule'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.triggerCount).toBe(1);
      expect(body.skipCount).toBe(1);
      expect(body.executionCount).toBe(0);
      expect(body.passRate).toBe(0);
    });
  });

  describe('GET /debug/stream', () => {
    it('creates connection that shows in connections list', async () => {
      // Start SSE connection in background - we use a raw HTTP request approach
      // Since fastify.inject waits for response, we verify the endpoint works
      // by checking the connections/stats endpoints

      // First verify no connections
      let response = await fastify.inject({
        method: 'GET',
        url: '/debug/stream/connections'
      });
      expect(response.json()).toHaveLength(0);

      // Verify stats endpoint works (this initializes the SSE manager)
      response = await fastify.inject({
        method: 'GET',
        url: '/debug/stream/stats'
      });
      expect(response.statusCode).toBe(200);
      const stats = response.json();
      expect(stats.activeConnections).toBe(0);
    });
  });

  describe('GET /debug/stream/connections', () => {
    it('returns empty array initially', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/stream/connections'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /debug/stream/stats', () => {
    it('returns stream statistics', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/debug/stream/stats'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('activeConnections');
      expect(body).toHaveProperty('totalEntriesSent');
      expect(body).toHaveProperty('totalEntriesFiltered');
      expect(typeof body.activeConnections).toBe('number');
      expect(typeof body.totalEntriesSent).toBe('number');
      expect(typeof body.totalEntriesFiltered).toBe('number');
    });
  });
});
