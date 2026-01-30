import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { timerResolvers } from '../../../../../src/api/graphql/resolvers/timer.resolvers';
import { NotFoundError } from '../../../../../src/api/middleware/error-handler';
import type { GraphQLContext } from '../../../../../src/api/graphql/context';
import { createTestContext, teardownContext } from './setup';

const { Query, Mutation } = timerResolvers;

describe('timerResolvers', () => {
  let ctx: GraphQLContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    await teardownContext(ctx);
  });

  // ─── Query ────────────────────────────────────────────────────────

  describe('Query.timers', () => {
    it('returns empty array when no timers exist', () => {
      const result = Query.timers(null, null, ctx);
      expect(result).toEqual([]);
    });

    it('returns all active timers', async () => {
      await ctx.engine.setTimer({
        name: 'timeout-1',
        duration: '10m',
        onExpire: { topic: 'timer.expired', data: {} },
      });

      const result = Query.timers(null, null, ctx);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('timeout-1');
    });
  });

  describe('Query.timer', () => {
    it('returns null for non-existent timer', () => {
      const result = Query.timer(null, { name: 'missing' }, ctx);
      expect(result).toBeNull();
    });

    it('returns timer by name', async () => {
      await ctx.engine.setTimer({
        name: 'lookup-timer',
        duration: '5m',
        onExpire: { topic: 'done', data: { key: 'val' } },
      });

      const result = Query.timer(null, { name: 'lookup-timer' }, ctx);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('lookup-timer');
      expect(result!.expiresAt).toBeTypeOf('number');
      expect(result!.onExpire.topic).toBe('done');
    });
  });

  // ─── Mutation ─────────────────────────────────────────────────────

  describe('Mutation.createTimer', () => {
    it('creates a timer and returns it', async () => {
      const result = await Mutation.createTimer(null, {
        input: {
          name: 'new-timer',
          duration: '30m',
          onExpire: { topic: 'timeout', data: { order: '123' } },
        },
      }, ctx);

      expect(result.name).toBe('new-timer');
      expect(result.expiresAt).toBeTypeOf('number');
      expect(result.onExpire.topic).toBe('timeout');
    });

    it('creates a timer with repeat config', async () => {
      const result = await Mutation.createTimer(null, {
        input: {
          name: 'repeating',
          duration: '1m',
          onExpire: { topic: 'tick', data: {} },
          repeat: { interval: '1m', maxCount: 5 },
        },
      }, ctx);

      expect(result.name).toBe('repeating');
      expect(result.repeat).toBeDefined();
    });

    it('creates timer with empty data when data is omitted', async () => {
      const result = await Mutation.createTimer(null, {
        input: {
          name: 'no-data',
          duration: '10s',
          onExpire: { topic: 'ping' },
        },
      }, ctx);

      expect(result.onExpire.data).toEqual({});
    });
  });

  describe('Mutation.cancelTimer', () => {
    it('cancels existing timer and returns true', async () => {
      await ctx.engine.setTimer({
        name: 'cancel-me',
        duration: '10m',
        onExpire: { topic: 'x', data: {} },
      });

      const result = await Mutation.cancelTimer(null, { name: 'cancel-me' }, ctx);
      expect(result).toBe(true);
      expect(ctx.engine.getTimer('cancel-me')).toBeUndefined();
    });

    it('throws NotFoundError for non-existent timer', async () => {
      await expect(
        Mutation.cancelTimer(null, { name: 'missing' }, ctx),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
