import type { GraphQLContext } from '../context.js';
import type { Rule } from '../../../types/rule.js';
import type {
  RuleVersionEntry,
  RuleVersionQueryResult,
  RuleVersionDiff,
  RuleChangeType,
} from '../../../versioning/types.js';
import { NotFoundError, ServiceUnavailableError } from '../../middleware/error-handler.js';

interface RuleVersionQueryInput {
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  fromVersion?: number;
  toVersion?: number;
  changeTypes?: RuleChangeType[];
  from?: number;
  to?: number;
}

function ensureVersioning(ctx: GraphQLContext): void {
  if (!ctx.engine.getVersionStore()) {
    throw new ServiceUnavailableError('Rule versioning is not configured');
  }
}

export const versionResolvers = {
  Query: {
    ruleVersions: (
      _: unknown,
      args: { ruleId: string; query?: RuleVersionQueryInput },
      ctx: GraphQLContext,
    ): RuleVersionQueryResult => {
      ensureVersioning(ctx);
      return ctx.engine.getRuleVersions(args.ruleId, args.query);
    },

    ruleVersion: (
      _: unknown,
      args: { ruleId: string; version: number },
      ctx: GraphQLContext,
    ): RuleVersionEntry | null => {
      ensureVersioning(ctx);
      return ctx.engine.getRuleVersion(args.ruleId, args.version) ?? null;
    },

    ruleVersionDiff: (
      _: unknown,
      args: { ruleId: string; fromVersion: number; toVersion: number },
      ctx: GraphQLContext,
    ): RuleVersionDiff | null => {
      ensureVersioning(ctx);
      return ctx.engine.diffRuleVersions(args.ruleId, args.fromVersion, args.toVersion) ?? null;
    },
  },

  Mutation: {
    rollbackRule: (
      _: unknown,
      args: { id: string; version: number },
      ctx: GraphQLContext,
    ): Rule => {
      ensureVersioning(ctx);

      if (!ctx.engine.getRule(args.id)) {
        throw new NotFoundError('Rule', args.id);
      }

      return ctx.engine.rollbackRule(args.id, args.version);
    },
  },
};
