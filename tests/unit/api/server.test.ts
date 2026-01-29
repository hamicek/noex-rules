import { describe, it, expect, afterEach, vi } from 'vitest';
import { RuleEngineServer } from '../../../src/api/server';
import { RuleEngine } from '../../../src/core/rule-engine';
import { MetricsCollector } from '../../../src/observability/metrics-collector';

describe('RuleEngineServer', () => {
  let server: RuleEngineServer | undefined;
  let externalEngine: RuleEngine | undefined;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = undefined;
    }
    if (externalEngine) {
      await externalEngine.stop();
      externalEngine = undefined;
    }
  });

  describe('start and stop', () => {
    it('starts server with default configuration', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false }
      });

      expect(server.address).toMatch(/^http:\/\//);
      expect(server.getEngine()).toBeDefined();
      expect(server.getEngine().isRunning).toBe(true);
    });

    it('stops server and internal engine', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false }
      });

      const engine = server.getEngine();

      await server.stop();
      server = undefined;

      expect(engine.isRunning).toBe(false);
    });

    it('uses provided engine and does not stop it', async () => {
      externalEngine = await RuleEngine.start({ name: 'external' });

      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engine: externalEngine
      });

      expect(server.getEngine()).toBe(externalEngine);

      await server.stop();
      server = undefined;

      expect(externalEngine.isRunning).toBe(true);
    });

    it('respects custom port configuration', async () => {
      const port = 9876;
      server = await RuleEngineServer.start({
        server: { port, logger: false }
      });

      expect(server.port).toBe(port);
      expect(server.address).toContain(`:${port}`);
    });
  });

  describe('health endpoint', () => {
    it('returns health status', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false }
      });

      const response = await fetch(`${server.address}/api/v1/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeTypeOf('number');
      expect(data.uptime).toBeTypeOf('number');
    });
  });

  describe('stats endpoint', () => {
    it('returns engine statistics', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false }
      });

      const engine = server.getEngine();
      await engine.setFact('test', 'value');
      await engine.emit('test.event', { data: 1 });

      const response = await fetch(`${server.address}/api/v1/stats`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.factsCount).toBe(1);
      expect(data.eventsProcessed).toBe(1);
      expect(data.rulesCount).toBe(0);
    });
  });

  describe('configuration', () => {
    it('uses custom API prefix', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false, apiPrefix: '/custom/api' }
      });

      const healthRes = await fetch(`${server.address}/custom/api/health`);
      expect(healthRes.status).toBe(200);

      const defaultRes = await fetch(`${server.address}/api/v1/health`);
      expect(defaultRes.status).toBe(404);
    });

    it('enables CORS by default', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });

      expect(response.headers.get('access-control-allow-origin')).toBeDefined();
    });

    it('disables CORS when configured', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false, cors: false }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        headers: {
          'Origin': 'http://example.com'
        }
      });

      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('respects custom CORS origin', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          cors: { origin: 'https://allowed.com' }
        }
      });

      const allowedResponse = await fetch(`${server.address}/api/v1/health`, {
        headers: {
          'Origin': 'https://allowed.com'
        }
      });

      expect(allowedResponse.headers.get('access-control-allow-origin')).toBe('https://allowed.com');
    });

    it('handles preflight requests with custom methods', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          cors: { methods: ['GET', 'POST'] }
        }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.com',
          'Access-Control-Request-Method': 'POST'
        }
      });

      const allowMethods = response.headers.get('access-control-allow-methods');
      expect(allowMethods).toContain('GET');
      expect(allowMethods).toContain('POST');
    });

    it('sets credentials header when enabled', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          cors: {
            origin: 'https://myapp.com',
            credentials: true
          }
        }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        headers: {
          'Origin': 'https://myapp.com'
        }
      });

      expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('sets max-age header from configuration', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          cors: { maxAge: 7200 }
        }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });

      expect(response.headers.get('access-control-max-age')).toBe('7200');
    });

    it('exposes custom headers', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          cors: { exposedHeaders: ['X-Custom-Id', 'X-Request-Id'] }
        }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        headers: {
          'Origin': 'http://example.com'
        }
      });

      const exposed = response.headers.get('access-control-expose-headers');
      expect(exposed).toContain('X-Custom-Id');
      expect(exposed).toContain('X-Request-Id');
    });

    it('allows custom request headers', async () => {
      server = await RuleEngineServer.start({
        server: {
          port: 0,
          logger: false,
          cors: { allowedHeaders: ['X-Api-Key', 'Content-Type'] }
        }
      });

      const response = await fetch(`${server.address}/api/v1/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'X-Api-Key'
        }
      });

      const allowHeaders = response.headers.get('access-control-allow-headers');
      expect(allowHeaders).toContain('X-Api-Key');
      expect(allowHeaders).toContain('Content-Type');
    });

    it('passes engine config to created engine', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engineConfig: { name: 'custom-engine' }
      });

      expect(server.getEngine().isRunning).toBe(true);
    });
  });

  describe('metrics integration', () => {
    it('exposes /metrics when engine has metrics enabled', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engineConfig: { metrics: { enabled: true } },
      });

      expect(server.getMetricsCollector()).toBeInstanceOf(MetricsCollector);

      const response = await fetch(`${server.address}/api/v1/metrics`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
    });

    it('exposes /metrics when server metricsConfig is provided', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        metricsConfig: { enabled: true },
      });

      expect(server.getMetricsCollector()).toBeInstanceOf(MetricsCollector);

      const response = await fetch(`${server.address}/api/v1/metrics`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
    });

    it('does not expose /metrics without metrics config', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
      });

      expect(server.getMetricsCollector()).toBeNull();

      const response = await fetch(`${server.address}/api/v1/metrics`);
      expect(response.status).toBe(404);
    });

    it('prefers engine MetricsCollector over server metricsConfig', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engineConfig: { metrics: { enabled: true } },
        metricsConfig: { enabled: true },
      });

      // MetricsCollector pochází z enginu, ne ze server config
      const collector = server.getMetricsCollector();
      expect(collector).toBe(server.getEngine().getMetricsCollector());
    });

    it('returns gauge data in /metrics response', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        metricsConfig: { enabled: true },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'srv-gauge',
        name: 'Server Gauge Rule',
        trigger: { type: 'event', topic: 'srv.test' },
        tags: [],
      });

      const response = await fetch(`${server.address}/api/v1/metrics`);
      const body = await response.text();

      expect(body).toContain('noex_rules_active_rules 1');
    });

    it('returns counter data after events in /metrics response', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        metricsConfig: { enabled: true },
      });

      const engine = server.getEngine();
      engine.registerRule({
        id: 'srv-counter',
        name: 'Server Counter Rule',
        priority: 0,
        enabled: true,
        trigger: { type: 'event', topic: 'srv.counter' },
        conditions: [],
        actions: [{ type: 'set_fact', key: 'srv:done', value: true }],
        tags: [],
      });

      await engine.emit('srv.counter', {});
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await fetch(`${server.address}/api/v1/metrics`);
      const body = await response.text();

      expect(body).toContain('noex_rules_rules_executed_total');
      expect(body).toContain('noex_rules_rules_triggered_total');
    });

    it('stops server-owned MetricsCollector on server stop', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        metricsConfig: { enabled: true },
      });

      const collector = server.getMetricsCollector()!;
      const stopSpy = vi.spyOn(collector, 'stop');

      await server.stop();
      server = undefined;

      expect(stopSpy).toHaveBeenCalledOnce();
    });

    it('does not stop engine-owned MetricsCollector on server stop', async () => {
      externalEngine = await RuleEngine.start({
        name: 'ext-metrics',
        metrics: { enabled: true },
      });

      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        engine: externalEngine,
      });

      const collector = server.getMetricsCollector()!;
      const stopSpy = vi.spyOn(collector, 'stop');

      await server.stop();
      server = undefined;

      // Server nesmí zastavit MetricsCollector, který vlastní engine
      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('ignores metricsConfig when enabled is false', async () => {
      server = await RuleEngineServer.start({
        server: { port: 0, logger: false },
        metricsConfig: { enabled: false },
      });

      expect(server.getMetricsCollector()).toBeNull();

      const response = await fetch(`${server.address}/api/v1/metrics`);
      expect(response.status).toBe(404);
    });
  });
});
