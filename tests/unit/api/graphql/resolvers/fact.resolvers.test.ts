import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { factResolvers } from '../../../../../src/api/graphql/resolvers/fact.resolvers';
import { NotFoundError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext } from './setup';

const { Query, Mutation } = factResolvers;

describe('factResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query ────────────────────────────────────────────────────────

  describe('Query.facts', () => {
    it('returns empty array when no facts exist', () => {
      const result = Query.facts(null, null, ctx);
      expect(result).toEqual([]);
    });

    it('returns all facts', async () => {
      await ctx.engine.setFact('user:age', 30);
      await ctx.engine.setFact('user:name', 'Alice');

      const result = Query.facts(null, null, ctx);
      expect(result).toHaveLength(2);
      expect(result.map(f => f.key)).toContain('user:age');
      expect(result.map(f => f.key)).toContain('user:name');
    });
  });

  describe('Query.fact', () => {
    it('returns null for non-existent fact', () => {
      const result = Query.fact(null, { key: 'missing' }, ctx);
      expect(result).toBeNull();
    });

    it('returns fact by key', async () => {
      await ctx.engine.setFact('color', 'blue');

      const result = Query.fact(null, { key: 'color' }, ctx);
      expect(result).not.toBeNull();
      expect(result!.key).toBe('color');
      expect(result!.value).toBe('blue');
      expect(result!.version).toBeTypeOf('number');
      expect(result!.timestamp).toBeTypeOf('number');
    });
  });

  describe('Query.factsQuery', () => {
    it('returns facts matching pattern', async () => {
      await ctx.engine.setFact('user:1:age', 25);
      await ctx.engine.setFact('user:2:age', 30);
      await ctx.engine.setFact('order:1:total', 100);

      const result = Query.factsQuery(null, { pattern: 'user:*:age' }, ctx);
      expect(result).toHaveLength(2);
      expect(result.every(f => f.key.startsWith('user:'))).toBe(true);
    });

    it('returns all facts for wildcard pattern', async () => {
      await ctx.engine.setFact('a', 1);
      await ctx.engine.setFact('b', 2);

      const result = Query.factsQuery(null, { pattern: '*' }, ctx);
      expect(result).toHaveLength(2);
    });
  });

  // ─── Mutation ─────────────────────────────────────────────────────

  describe('Mutation.setFact', () => {
    it('creates a new fact', async () => {
      const result = await Mutation.setFact(null, { key: 'score', value: 42 }, ctx);

      expect(result.key).toBe('score');
      expect(result.value).toBe(42);
      expect(result.version).toBe(1);
    });

    it('updates existing fact', async () => {
      await ctx.engine.setFact('score', 10);
      const result = await Mutation.setFact(null, { key: 'score', value: 99 }, ctx);

      expect(result.value).toBe(99);
      expect(result.version).toBeGreaterThanOrEqual(2);
    });

    it('supports complex values', async () => {
      const value = { items: [1, 2, 3], nested: { a: true } };
      const result = await Mutation.setFact(null, { key: 'data', value }, ctx);

      expect(result.value).toEqual(value);
    });
  });

  describe('Mutation.deleteFact', () => {
    it('deletes existing fact and returns true', async () => {
      await ctx.engine.setFact('temp', 1);

      const result = Mutation.deleteFact(null, { key: 'temp' }, ctx);
      expect(result).toBe(true);
      expect(ctx.engine.getFactFull('temp')).toBeUndefined();
    });

    it('throws NotFoundError for non-existent fact', () => {
      expect(() =>
        Mutation.deleteFact(null, { key: 'missing' }, ctx),
      ).toThrow(NotFoundError);
    });
  });
});
