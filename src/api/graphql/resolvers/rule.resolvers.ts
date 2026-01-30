import type { GraphQLContext } from '../context.js';
import type { Rule, RuleInput } from '../../../types/rule.js';
import { NotFoundError, ConflictError } from '../../middleware/error-handler.js';

interface CreateRuleInput {
  id: string;
  name: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags?: string[];
  group?: string;
  trigger: Rule['trigger'];
  conditions?: Rule['conditions'];
  actions: Rule['actions'];
  lookups?: Rule['lookups'];
}

interface UpdateRuleInput {
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags?: string[];
  group?: string;
  trigger?: Rule['trigger'];
  conditions?: Rule['conditions'];
  actions?: Rule['actions'];
  lookups?: Rule['lookups'];
}

export const ruleResolvers = {
  Query: {
    rules: (_: unknown, __: unknown, ctx: GraphQLContext): Rule[] =>
      ctx.engine.getRules(),

    rule: (_: unknown, args: { id: string }, ctx: GraphQLContext): Rule | null =>
      ctx.engine.getRule(args.id) ?? null,
  },

  Mutation: {
    createRule: (_: unknown, args: { input: CreateRuleInput }, ctx: GraphQLContext): Rule => {
      const { input } = args;

      if (ctx.engine.getRule(input.id)) {
        throw new ConflictError(`Rule with id '${input.id}' already exists`);
      }

      const ruleInput: RuleInput = {
        id: input.id,
        name: input.name,
        priority: input.priority ?? 0,
        enabled: input.enabled ?? true,
        tags: input.tags ?? [],
        trigger: input.trigger,
        conditions: input.conditions ?? [],
        actions: input.actions,
        ...(input.description !== undefined && { description: input.description }),
        ...(input.group !== undefined && { group: input.group }),
        ...(input.lookups !== undefined && { lookups: input.lookups }),
      };

      return ctx.engine.registerRule(ruleInput);
    },

    updateRule: (_: unknown, args: { id: string; input: UpdateRuleInput }, ctx: GraphQLContext): Rule => {
      if (!ctx.engine.getRule(args.id)) {
        throw new NotFoundError('Rule', args.id);
      }
      // Strip undefined values — exactOptionalPropertyTypes requires
      // that we don't pass `undefined` for optional properties.
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args.input)) {
        if (v !== undefined) {
          updates[k] = v;
        }
      }
      return ctx.engine.updateRule(args.id, updates);
    },

    deleteRule: (_: unknown, args: { id: string }, ctx: GraphQLContext): boolean => {
      const deleted = ctx.engine.unregisterRule(args.id);
      if (!deleted) {
        throw new NotFoundError('Rule', args.id);
      }
      return true;
    },

    enableRule: (_: unknown, args: { id: string }, ctx: GraphQLContext): Rule => {
      const enabled = ctx.engine.enableRule(args.id);
      if (!enabled) {
        throw new NotFoundError('Rule', args.id);
      }
      return ctx.engine.getRule(args.id)!;
    },

    disableRule: (_: unknown, args: { id: string }, ctx: GraphQLContext): Rule => {
      const disabled = ctx.engine.disableRule(args.id);
      if (!disabled) {
        throw new NotFoundError('Rule', args.id);
      }
      return ctx.engine.getRule(args.id)!;
    },
  },

  Rule: {
    // Map TS Rule.group (string) → GraphQL Rule.groupId (String)
    groupId: (rule: Rule): string | null => rule.group ?? null,
    // Prevent auto-resolution of group field (string → RuleGroup);
    // full resolution deferred to field resolvers (step 5)
    group: (): null => null,
    // Deferred to field resolvers (step 5)
    versions: (): null => null,
    auditEntries: (): [] => [],
  },
};
