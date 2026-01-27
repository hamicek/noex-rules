import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../../../src/api/config';

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
  });
});
