import type { GraphQLContext } from '../context.js';
import type { RuleGroup, RuleGroupInput } from '../../../types/group.js';
import { NotFoundError, ConflictError } from '../../middleware/error-handler.js';

interface CreateGroupInput {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
}

interface UpdateGroupInput {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export const groupResolvers = {
  Query: {
    groups: (_: unknown, __: unknown, ctx: GraphQLContext): RuleGroup[] =>
      ctx.engine.getGroups(),

    group: (_: unknown, args: { id: string }, ctx: GraphQLContext): RuleGroup | null =>
      ctx.engine.getGroup(args.id) ?? null,
  },

  Mutation: {
    createGroup: (_: unknown, args: { input: CreateGroupInput }, ctx: GraphQLContext): RuleGroup => {
      const { input } = args;

      if (ctx.engine.getGroup(input.id)) {
        throw new ConflictError(`Group with id '${input.id}' already exists`);
      }

      const groupInput: RuleGroupInput = {
        id: input.id,
        name: input.name,
        ...(input.description !== undefined && { description: input.description }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
      };

      return ctx.engine.createGroup(groupInput);
    },

    updateGroup: (_: unknown, args: { id: string; input: UpdateGroupInput }, ctx: GraphQLContext): RuleGroup => {
      const group = ctx.engine.updateGroup(args.id, args.input);
      if (!group) {
        throw new NotFoundError('Group', args.id);
      }
      return group;
    },

    deleteGroup: (_: unknown, args: { id: string }, ctx: GraphQLContext): boolean => {
      const deleted = ctx.engine.deleteGroup(args.id);
      if (!deleted) {
        throw new NotFoundError('Group', args.id);
      }
      return true;
    },

    enableGroup: (_: unknown, args: { id: string }, ctx: GraphQLContext): RuleGroup => {
      const enabled = ctx.engine.enableGroup(args.id);
      if (!enabled) {
        throw new NotFoundError('Group', args.id);
      }
      return ctx.engine.getGroup(args.id)!;
    },

    disableGroup: (_: unknown, args: { id: string }, ctx: GraphQLContext): RuleGroup => {
      const disabled = ctx.engine.disableGroup(args.id);
      if (!disabled) {
        throw new NotFoundError('Group', args.id);
      }
      return ctx.engine.getGroup(args.id)!;
    },
  },

  RuleGroup: {
    rules: (group: RuleGroup, _: unknown, ctx: GraphQLContext) =>
      ctx.loaders.groupRulesLoader.load(group.id),

    rulesCount: async (group: RuleGroup, _: unknown, ctx: GraphQLContext) => {
      const rules = await ctx.loaders.groupRulesLoader.load(group.id);
      return rules.length;
    },
  },
};
