import type { GraphQLContext } from '../context.js';

interface TracingStatus {
  enabled: boolean;
  entriesCount: number;
  maxEntries: number;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptime: number;
  version: string;
  engine: {
    name: string;
    running: boolean;
  };
}

function getTracingStatus(ctx: GraphQLContext): TracingStatus {
  const tc = ctx.engine.getTraceCollector();
  const stats = tc.getStats();
  return {
    enabled: tc.isEnabled(),
    entriesCount: stats.entriesCount,
    maxEntries: stats.maxEntries,
  };
}

export const engineResolvers = {
  Query: {
    health: (_: unknown, __: unknown, ctx: GraphQLContext): HealthResponse => ({
      status: ctx.engine.isRunning ? 'ok' : 'error',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: '1.0.0',
      engine: {
        name: 'noex-rules',
        running: ctx.engine.isRunning,
      },
    }),

    stats: (_: unknown, __: unknown, ctx: GraphQLContext) => ({
      ...ctx.engine.getStats(),
      timestamp: Date.now(),
    }),

    tracingStatus: (_: unknown, __: unknown, ctx: GraphQLContext): TracingStatus =>
      getTracingStatus(ctx),
  },

  Mutation: {
    enableTracing: (_: unknown, __: unknown, ctx: GraphQLContext): TracingStatus => {
      ctx.engine.enableTracing();
      return getTracingStatus(ctx);
    },

    disableTracing: (_: unknown, __: unknown, ctx: GraphQLContext): TracingStatus => {
      ctx.engine.disableTracing();
      return getTracingStatus(ctx);
    },
  },
};
