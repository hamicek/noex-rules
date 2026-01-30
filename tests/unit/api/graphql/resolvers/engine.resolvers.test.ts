import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { engineResolvers } from '../../../../../src/api/graphql/resolvers/engine.resolvers';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext, createTestRule } from './setup';

const { Query, Mutation } = engineResolvers;

describe('engineResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query ────────────────────────────────────────────────────────

  describe('Query.health', () => {
    it('returns ok status for running engine', () => {
      const result = Query.health(null, null, ctx);

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeTypeOf('number');
      expect(result.uptime).toBeTypeOf('number');
      expect(result.version).toBe('1.0.0');
      expect(result.engine.name).toBe('noex-rules');
      expect(result.engine.running).toBe(true);
    });
  });

  describe('Query.stats', () => {
    it('returns engine statistics with timestamp', () => {
      const result = Query.stats(null, null, ctx);

      expect(result.rulesCount).toBe(0);
      expect(result.factsCount).toBe(0);
      expect(result.timersCount).toBe(0);
      expect(result.eventsProcessed).toBeTypeOf('number');
      expect(result.rulesExecuted).toBeTypeOf('number');
      expect(result.avgProcessingTimeMs).toBeTypeOf('number');
      expect(result.timestamp).toBeTypeOf('number');
    });

    it('reflects registered rules in count', () => {
      ctx.engine.registerRule(createTestRule({ id: 's-1' }));
      ctx.engine.registerRule(createTestRule({ id: 's-2' }));

      const result = Query.stats(null, null, ctx);
      expect(result.rulesCount).toBe(2);
    });
  });

  describe('Query.tracingStatus', () => {
    it('returns tracing status', () => {
      const result = Query.tracingStatus(null, null, ctx);

      expect(result.enabled).toBeTypeOf('boolean');
      expect(result.entriesCount).toBeTypeOf('number');
      expect(result.maxEntries).toBeTypeOf('number');
    });
  });

  // ─── Mutation ─────────────────────────────────────────────────────

  describe('Mutation.enableTracing', () => {
    it('enables tracing and returns status', () => {
      const result = Mutation.enableTracing(null, null, ctx);

      expect(result.enabled).toBe(true);
      expect(result.entriesCount).toBeTypeOf('number');
      expect(result.maxEntries).toBeTypeOf('number');
    });
  });

  describe('Mutation.disableTracing', () => {
    it('disables tracing and returns status', () => {
      // Enable first, then disable
      ctx.engine.enableTracing();

      const result = Mutation.disableTracing(null, null, ctx);

      expect(result.enabled).toBe(false);
    });
  });
});
