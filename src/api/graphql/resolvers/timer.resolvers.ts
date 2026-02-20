import type { GraphQLContext } from '../context.js';
import type { Timer } from '../../../types/timer.js';
import { NotFoundError } from '../../middleware/error-handler.js';

interface CreateTimerInput {
  name: string;
  duration?: string;
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string;
    maxCount?: number;
  };
  cron?: string;
  maxCount?: number;
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
      const { name, duration, onExpire, repeat, cron, maxCount } = args.input;

      const config: {
        name: string;
        duration?: string;
        onExpire: { topic: string; data: Record<string, unknown> };
        repeat?: { interval: string; maxCount?: number };
        cron?: string;
        maxCount?: number;
      } = {
        name,
        onExpire: { topic: onExpire.topic, data: onExpire.data ?? {} },
      };

      if (cron) {
        config.cron = cron;
        if (maxCount !== undefined) {
          config.maxCount = maxCount;
        }
      } else {
        if (duration !== undefined) {
          config.duration = duration;
        }
        if (repeat) {
          config.repeat = repeat;
        }
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
