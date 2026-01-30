import type { GraphQLContext } from '../context.js';
import type { Fact } from '../../../types/fact.js';
import { NotFoundError } from '../../middleware/error-handler.js';

export const factResolvers = {
  Query: {
    facts: (_: unknown, __: unknown, ctx: GraphQLContext): Fact[] =>
      ctx.engine.getAllFacts(),

    fact: (_: unknown, args: { key: string }, ctx: GraphQLContext): Fact | null =>
      ctx.engine.getFactFull(args.key) ?? null,

    factsQuery: (_: unknown, args: { pattern: string }, ctx: GraphQLContext): Fact[] => {
      if (args.pattern === '*') {
        return ctx.engine.getAllFacts();
      }
      return ctx.engine.queryFacts(args.pattern);
    },
  },

  Mutation: {
    setFact: async (
      _: unknown,
      args: { key: string; value: unknown },
      ctx: GraphQLContext,
    ): Promise<Fact> => {
      return ctx.engine.setFact(args.key, args.value);
    },

    deleteFact: (_: unknown, args: { key: string }, ctx: GraphQLContext): boolean => {
      const deleted = ctx.engine.deleteFact(args.key);
      if (!deleted) {
        throw new NotFoundError('Fact', args.key);
      }
      return true;
    },
  },
};
