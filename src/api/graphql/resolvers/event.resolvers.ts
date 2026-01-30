import type { GraphQLContext } from '../context.js';
import type { Event } from '../../../types/event.js';

interface EmitEventInput {
  topic: string;
  data?: Record<string, unknown>;
}

interface EmitCorrelatedEventInput {
  topic: string;
  data?: Record<string, unknown>;
  correlationId: string;
  causationId?: string;
}

export const eventResolvers = {
  Mutation: {
    emitEvent: async (
      _: unknown,
      args: { input: EmitEventInput },
      ctx: GraphQLContext,
    ): Promise<Event> => {
      const { topic, data } = args.input;
      return ctx.engine.emit(topic, data ?? {});
    },

    emitCorrelatedEvent: async (
      _: unknown,
      args: { input: EmitCorrelatedEventInput },
      ctx: GraphQLContext,
    ): Promise<Event> => {
      const { topic, data, correlationId, causationId } = args.input;
      return ctx.engine.emitCorrelated(topic, data ?? {}, correlationId, causationId);
    },
  },
};
