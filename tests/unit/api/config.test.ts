import { describe, it, expect } from 'vitest';
import { resolveConfig, resolveCorsConfig, type CorsConfig } from '../../../src/api/config';

describe('Server Config', () => {
  describe('resolveConfig', () => {
    it('uses default values when no input provided', () => {
      const config = resolveConfig();

      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.apiPrefix).toBe('/api/v1');
      expect(config.cors).toBe(true);
      expect(config.logger).toBe(true);
    });

    it('uses default values for empty object', () => {
      const config = resolveConfig({});

      expect(config.port).toBe(3000);
      expect(config.host).toBe('0.0.0.0');
      expect(config.apiPrefix).toBe('/api/v1');
    });

    it('overrides specific values', () => {
      const config = resolveConfig({
        port: 8080,
        apiPrefix: '/v2'
      });

      expect(config.port).toBe(8080);
      expect(config.apiPrefix).toBe('/v2');
      expect(config.host).toBe('0.0.0.0');
      expect(config.cors).toBe(true);
    });

    it('allows disabling CORS', () => {
      const config = resolveConfig({ cors: false });

      expect(config.cors).toBe(false);
    });

    it('allows disabling logger', () => {
      const config = resolveConfig({ logger: false });

      expect(config.logger).toBe(false);
    });

    it('preserves fastify options', () => {
      const fastifyOptions = {
        trustProxy: true,
        maxParamLength: 200
      };

      const config = resolveConfig({ fastifyOptions });

      expect(config.fastifyOptions).toEqual(fastifyOptions);
    });

    it('allows custom host', () => {
      const config = resolveConfig({ host: '127.0.0.1' });

      expect(config.host).toBe('127.0.0.1');
    });

    it('accepts detailed CORS configuration', () => {
      const corsConfig: CorsConfig = {
        origin: 'https://example.com',
        credentials: true,
        maxAge: 3600
      };

      const config = resolveConfig({ cors: corsConfig });

      expect(config.cors).toEqual(corsConfig);
    });
  });

  describe('resolveCorsConfig', () => {
    it('returns false when CORS is disabled', () => {
      const result = resolveCorsConfig(false);
      expect(result).toBe(false);
    });

    it('returns default config when CORS is true', () => {
      const result = resolveCorsConfig(true);

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toBe(true);
        expect(result.methods).toEqual(['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']);
        expect(result.allowedHeaders).toEqual(['Content-Type', 'Authorization', 'X-Requested-With']);
        expect(result.exposedHeaders).toEqual(['X-Request-Id']);
        expect(result.credentials).toBe(false);
        expect(result.maxAge).toBe(86400);
        expect(result.preflightContinue).toBe(false);
        expect(result.optionsSuccessStatus).toBe(204);
      }
    });

    it('returns default config when CORS is undefined', () => {
      const result = resolveCorsConfig(undefined);

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toBe(true);
        expect(result.credentials).toBe(false);
      }
    });

    it('merges partial config with defaults', () => {
      const result = resolveCorsConfig({
        origin: 'https://myapp.com',
        credentials: true
      });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toBe('https://myapp.com');
        expect(result.credentials).toBe(true);
        expect(result.methods).toEqual(['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']);
        expect(result.maxAge).toBe(86400);
      }
    });

    it('accepts string origin', () => {
      const result = resolveCorsConfig({ origin: 'https://example.com' });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toBe('https://example.com');
      }
    });

    it('accepts array of origins', () => {
      const origins = ['https://app1.com', 'https://app2.com'];
      const result = resolveCorsConfig({ origin: origins });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toEqual(origins);
      }
    });

    it('accepts RegExp origin', () => {
      const pattern = /\.example\.com$/;
      const result = resolveCorsConfig({ origin: pattern });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toBe(pattern);
      }
    });

    it('accepts function origin', () => {
      const originFn = (origin: string) => origin.endsWith('.example.com');
      const result = resolveCorsConfig({ origin: originFn });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.origin).toBe(originFn);
      }
    });

    it('allows custom methods', () => {
      const result = resolveCorsConfig({ methods: ['GET', 'POST'] });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.methods).toEqual(['GET', 'POST']);
      }
    });

    it('allows custom headers', () => {
      const result = resolveCorsConfig({
        allowedHeaders: ['X-Custom-Header', 'Content-Type'],
        exposedHeaders: ['X-Response-Id']
      });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.allowedHeaders).toEqual(['X-Custom-Header', 'Content-Type']);
        expect(result.exposedHeaders).toEqual(['X-Response-Id']);
      }
    });

    it('allows custom maxAge', () => {
      const result = resolveCorsConfig({ maxAge: 7200 });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.maxAge).toBe(7200);
      }
    });

    it('allows preflight continue', () => {
      const result = resolveCorsConfig({ preflightContinue: true });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.preflightContinue).toBe(true);
      }
    });

    it('allows custom options success status', () => {
      const result = resolveCorsConfig({ optionsSuccessStatus: 200 });

      expect(result).not.toBe(false);
      if (result !== false) {
        expect(result.optionsSuccessStatus).toBe(200);
      }
    });
  });
});
