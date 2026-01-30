import type { GraphQLContext } from '../context.js';
import type { Timer } from '../../../types/timer.js';
import { NotFoundError } from '../../middleware/error-handler.js';

interface CreateTimerInput {
  name: string;
  duration: string;
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string;
    maxCount?: number;
  };
}

export const timerResolvers = {
  Query: {
    timers: (_: unknown, __: unknown, ctx: GraphQLContext): Timer[] =>
      ctx.engine.getTimers(),

    timer: (_: unknown, args: { name: string }, ctx: GraphQLContext): Timer | null =>
      ctx.engine.getTimer(args.name) ?? null,
  },

  Mutation: {
    createTimer: async (
      _: unknown,
      args: { input: CreateTimerInput },
      ctx: GraphQLContext,
    ): Promise<Timer> => {
      const { name, duration, onExpire, repeat } = args.input;

      const config: {
        name: string;
        duration: string;
        onExpire: { topic: string; data: Record<string, unknown> };
        repeat?: { interval: string; maxCount?: number };
      } = {
        name,
        duration,
        onExpire: { topic: onExpire.topic, data: onExpire.data ?? {} },
      };

      if (repeat) {
        config.repeat = repeat;
      }

      return ctx.engine.setTimer(config);
    },

    cancelTimer: async (
      _: unknown,
      args: { name: string },
      ctx: GraphQLContext,
    ): Promise<boolean> => {
      const cancelled = await ctx.engine.cancelTimer(args.name);
      if (!cancelled) {
        throw new NotFoundError('Timer', args.name);
      }
      return true;
    },
  },
};
