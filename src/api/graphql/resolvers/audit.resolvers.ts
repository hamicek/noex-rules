import type { GraphQLContext } from '../context.js';
import type { AuditCategory, AuditEventType, AuditQuery, AuditQueryResult } from '../../../audit/types.js';

interface AuditQueryInput {
  category?: string;
  types?: string[];
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

const EMPTY_RESULT: AuditQueryResult = {
  entries: [],
  totalCount: 0,
  queryTimeMs: 0,
  hasMore: false,
};

function toAuditQuery(input?: AuditQueryInput): AuditQuery {
  if (!input) return {};

  // Strip undefined values — exactOptionalPropertyTypes requires
  // that we don't pass `undefined` for optional properties.
  const query: Record<string, unknown> = {};

  if (input.category !== undefined) query['category'] = input.category as AuditCategory;
  if (input.types !== undefined) query['types'] = input.types as AuditEventType[];
  if (input.ruleId !== undefined) query['ruleId'] = input.ruleId;
  if (input.source !== undefined) query['source'] = input.source;
  if (input.correlationId !== undefined) query['correlationId'] = input.correlationId;
  if (input.from !== undefined) query['from'] = input.from;
  if (input.to !== undefined) query['to'] = input.to;
  if (input.limit !== undefined) query['limit'] = input.limit;
  if (input.offset !== undefined) query['offset'] = input.offset;

  return query as AuditQuery;
}

export const auditResolvers = {
  Query: {
    auditEntries: (
      _: unknown,
      args: { query?: AuditQueryInput },
      ctx: GraphQLContext,
    ): AuditQueryResult => {
      const log = ctx.engine.getAuditLog();
      if (!log) return EMPTY_RESULT;
      return log.query(toAuditQuery(args.query));
    },
  },
};
