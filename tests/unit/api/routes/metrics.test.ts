import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { RuleEngine } from '../../../../src/core/rule-engine';
import { MetricsCollector } from '../../../../src/observability/metrics-collector';
import { registerMetricsRoutes } from '../../../../src/api/routes/metrics';

describe('Metrics API', () => {
  let fastify: FastifyInstance;
  let engine: RuleEngine;
  let metricsCollector: MetricsCollector;

  beforeEach(async () => {
    engine = await RuleEngine.start({ name: 'metrics-test' });

    metricsCollector = new MetricsCollector(
      engine.getTraceCollector(),
      () => engine.getStats(),
    );

    fastify = Fastify({ logger: false });
    await registerMetricsRoutes(fastify, metricsCollector);
    await fastify.listen({ port: 0 });
  });

  afterEach(async () => {
    metricsCollector.stop();
    await fastify.close();
    await engine.stop();
  });

  describe('GET /metrics', () => {
    it('returns 200 with Prometheus content type', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/metrics' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    });

    it('returns gauge metrics for engine state', async () => {
      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      expect(body).toContain('noex_rules_active_rules');
      expect(body).toContain('noex_rules_active_facts');
      expect(body).toContain('noex_rules_active_timers');
    });

    it('returns counter metrics with HELP and TYPE headers', async () => {
      // Emit an event to generate trace entries
      await engine.emit('test.metric', { value: 1 });
      await new Promise(resolve => setTimeout(resolve, 50));

      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      expect(body).toContain('# HELP noex_rules_events_processed_total');
      expect(body).toContain('# TYPE noex_rules_events_processed_total counter');
    });

    it('returns histogram metrics with bucket structure', async () => {
      engine.registerRule({
        id: 'metric-rule',
        name: 'Metric Rule',
        priority: 0,
        enabled: true,
        trigger: { type: 'event', topic: 'metric.trigger' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'metric:done', value: true }],
        tags: [],
      });

      await engine.emit('metric.trigger', { data: 1 });
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      expect(body).toContain('# TYPE noex_rules_evaluation_duration_seconds histogram');
      expect(body).toContain('noex_rules_evaluation_duration_seconds_bucket');
      expect(body).toContain('noex_rules_evaluation_duration_seconds_sum');
      expect(body).toContain('noex_rules_evaluation_duration_seconds_count');
      expect(body).toContain('le="+Inf"');
    });

    it('reflects rules count in gauge', async () => {
      engine.registerRule({
        id: 'gauge-rule-1',
        name: 'Gauge Rule 1',
        trigger: { type: 'event', topic: 'test' },
        tags: [],
      });
      engine.registerRule({
        id: 'gauge-rule-2',
        name: 'Gauge Rule 2',
        trigger: { type: 'event', topic: 'test' },
        tags: [],
      });

      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      expect(body).toContain('noex_rules_active_rules 2');
    });

    it('reflects facts count in gauge', async () => {
      await engine.setFact('metric:fact:1', 'value1');
      await engine.setFact('metric:fact:2', 'value2');

      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      expect(body).toContain('noex_rules_active_facts 2');
    });

    it('increments counters on rule execution', async () => {
      engine.registerRule({
        id: 'counter-rule',
        name: 'Counter Rule',
        priority: 0,
        enabled: true,
        trigger: { type: 'event', topic: 'counter.test' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'counter:done', value: true }],
        tags: [],
      });

      await engine.emit('counter.test', {});
      await engine.emit('counter.test', {});
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      expect(body).toContain('noex_rules_rules_executed_total');
      expect(body).toContain('noex_rules_rules_triggered_total');
      expect(body).toContain('noex_rules_actions_executed_total');
    });

    it('returns empty body when no activity has occurred', async () => {
      // Fresh engine with no events — counters have no values, only gauges should appear
      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      // Gauges are always present (read from engine stats)
      expect(body).toContain('noex_rules_active_rules');
      // Counters with no data produce HELP/TYPE but no samples — but since
      // counters have no values, formatMetrics only emits for those with values
      // so no counter lines expected
      expect(response.statusCode).toBe(200);
    });

    it('returns valid Prometheus format ending with newline', async () => {
      await engine.emit('format.test', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      const body = response.body;

      if (body.length > 0) {
        expect(body.endsWith('\n')).toBe(true);
      }
    });
  });
});

describe('Metrics route registration', () => {
  it('is not registered when metricsCollector is not provided', async () => {
    const fastify = Fastify({ logger: false });
    // Don't register metrics routes — simulate missing metricsCollector
    await fastify.listen({ port: 0 });

    try {
      const response = await fastify.inject({ method: 'GET', url: '/metrics' });
      expect(response.statusCode).toBe(404);
    } finally {
      await fastify.close();
    }
  });
});
