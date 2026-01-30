import type { FastifyInstance } from 'fastify';
import type { RuleChangeType, RuleVersionQuery, RuleVersionQueryResult, RuleVersionEntry, RuleVersionDiff } from '../../versioning/types.js';
import type { Rule } from '../../types/rule.js';
import { ServiceUnavailableError, NotFoundError, BadRequestError } from '../middleware/error-handler.js';
import { versionsSchemas } from '../schemas/versions.js';

interface RuleParams {
  id: string;
}

interface VersionParams {
  id: string;
  version: string;
}

interface VersionsQuerystring {
  limit?: string;
  offset?: string;
  order?: string;
  fromVersion?: string;
  toVersion?: string;
  changeTypes?: string;
  from?: string;
  to?: string;
}

interface DiffQuerystring {
  from: string;
  to: string;
}

interface RollbackBody {
  version: number;
}

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseChangeTypes(value: string | undefined): RuleChangeType[] | undefined {
  if (!value) return undefined;
  const items = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  return items.length > 0 ? items as RuleChangeType[] : undefined;
}

export async function registerVersionsRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  const requireVersionStore = (): void => {
    if (!engine.getVersionStore()) {
      throw new ServiceUnavailableError('Rule versioning is not configured');
    }
  };

  // GET /rules/:id/versions — List version history
  fastify.get<{ Params: RuleParams; Querystring: VersionsQuerystring }>(
    '/rules/:id/versions',
    { schema: versionsSchemas.list },
    async (request): Promise<RuleVersionQueryResult> => {
      requireVersionStore();

      const { id } = request.params;
      const qs = request.query;

      const params: Omit<RuleVersionQuery, 'ruleId'> = {};

      const limit = parseNumeric(qs.limit);
      if (limit !== undefined) params.limit = limit;

      const offset = parseNumeric(qs.offset);
      if (offset !== undefined) params.offset = offset;

      if (qs.order === 'asc' || qs.order === 'desc') params.order = qs.order;

      const fromVersion = parseNumeric(qs.fromVersion);
      if (fromVersion !== undefined) params.fromVersion = fromVersion;

      const toVersion = parseNumeric(qs.toVersion);
      if (toVersion !== undefined) params.toVersion = toVersion;

      const changeTypes = parseChangeTypes(qs.changeTypes);
      if (changeTypes) params.changeTypes = changeTypes;

      const from = parseNumeric(qs.from);
      if (from !== undefined) params.from = from;

      const to = parseNumeric(qs.to);
      if (to !== undefined) params.to = to;

      return engine.getRuleVersions(id, params);
    }
  );

  // GET /rules/:id/versions/:version — Get specific version
  fastify.get<{ Params: VersionParams }>(
    '/rules/:id/versions/:version',
    { schema: versionsSchemas.get },
    async (request): Promise<RuleVersionEntry> => {
      requireVersionStore();

      const { id, version: versionStr } = request.params;
      const version = Number(versionStr);

      const entry = engine.getRuleVersion(id, version);
      if (!entry) {
        throw new NotFoundError('Rule version', `${id}@${version}`);
      }
      return entry;
    }
  );

  // POST /rules/:id/rollback — Rollback to a previous version
  fastify.post<{ Params: RuleParams; Body: RollbackBody }>(
    '/rules/:id/rollback',
    { schema: versionsSchemas.rollback },
    async (request): Promise<Rule> => {
      requireVersionStore();

      const { id } = request.params;
      const { version } = request.body;

      try {
        return engine.rollbackRule(id, version);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('not found')) {
          throw new NotFoundError('Rule version', `${id}@${version}`);
        }
        throw new BadRequestError(message);
      }
    }
  );

  // GET /rules/:id/diff — Diff two versions
  fastify.get<{ Params: RuleParams; Querystring: DiffQuerystring }>(
    '/rules/:id/diff',
    { schema: versionsSchemas.diff },
    async (request): Promise<RuleVersionDiff> => {
      requireVersionStore();

      const { id } = request.params;
      const fromVersion = Number(request.query.from);
      const toVersion = Number(request.query.to);

      const diff = engine.diffRuleVersions(id, fromVersion, toVersion);
      if (!diff) {
        throw new NotFoundError('Rule version', `${id}@${fromVersion} or ${id}@${toVersion}`);
      }
      return diff;
    }
  );
}
