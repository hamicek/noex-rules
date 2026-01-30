import type { GraphQLContext } from '../context.js';
import type { Goal, QueryResult, ProofNode } from '../../../types/backward.js';
import { ValidationError } from '../../middleware/error-handler.js';

interface GoalInput {
  type: 'fact' | 'event';
  key?: string;
  value?: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  topic?: string;
}

function toGoal(input: GoalInput): Goal {
  if (input.type === 'fact') {
    if (!input.key) {
      throw new ValidationError('Field "key" is required for fact goals');
    }
    return {
      type: 'fact',
      key: input.key,
      ...(input.value !== undefined && { value: input.value }),
      ...(input.operator !== undefined && { operator: input.operator }),
    };
  }

  if (!input.topic) {
    throw new ValidationError('Field "topic" is required for event goals');
  }
  return { type: 'event', topic: input.topic };
}

const PROOF_NODE_TYPE_MAP: Record<string, string> = {
  fact_exists: 'FactExistsNode',
  rule: 'RuleProofNode',
  unachievable: 'UnachievableNode',
};

export const backwardResolvers = {
  Query: {
    query: (
      _: unknown,
      args: { goal: GoalInput },
      ctx: GraphQLContext,
    ): QueryResult => ctx.engine.query(toGoal(args.goal)),
  },

  Goal: {
    __resolveType(obj: Goal): string {
      return obj.type === 'fact' ? 'FactGoal' : 'EventGoal';
    },
  },

  ProofNode: {
    __resolveType(obj: ProofNode): string {
      return PROOF_NODE_TYPE_MAP[obj.type] ?? 'UnachievableNode';
    },
  },
};
