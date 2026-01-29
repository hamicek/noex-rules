import type { FastifyInstance } from 'fastify';
import type { AuditLogService } from '../../audit/audit-log-service.js';
import type {
  AuditCategory,
  AuditEntry,
  AuditEventType,
  AuditQuery,
  AuditQueryResult,
  AuditStats,
} from '../../audit/types.js';
import {
  AuditSSEManager,
  type AuditSSEFilter,
  type AuditSSEManagerStats,
} from '../notifications/audit-sse-manager.js';
import { ServiceUnavailableError, NotFoundError } from '../middleware/error-handler.js';
import { auditSchemas } from '../schemas/audit.js';
import { generateId } from '../../utils/id-generator.js';

interface AuditQuerystring {
  category?: AuditCategory;
  types?: string;
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
}

interface AuditEntryParams {
  id: string;
}

interface AuditStreamQuerystring {
  categories?: string;
  types?: string;
  ruleIds?: string;
  sources?: string;
}

interface AuditExportQuerystring {
  format?: 'json' | 'csv';
  category?: AuditCategory;
  types?: string;
  ruleId?: string;
  source?: string;
  from?: string;
  to?: string;
}

function parseCommaSeparated(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  return items.length > 0 ? items : undefined;
}

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildAuditQuery(qs: AuditQuerystring): AuditQuery {
  const query: AuditQuery = {};

  if (qs.category) query.category = qs.category;
  if (qs.ruleId) query.ruleId = qs.ruleId;
  if (qs.source) query.source = qs.source;
  if (qs.correlationId) query.correlationId = qs.correlationId;

  const from = parseNumeric(qs.from);
  if (from !== undefined) query.from = from;

  const to = parseNumeric(qs.to);
  if (to !== undefined) query.to = to;

  const limit = parseNumeric(qs.limit);
  if (limit !== undefined) query.limit = limit;

  const offset = parseNumeric(qs.offset);
  if (offset !== undefined) query.offset = offset;

  const parsedTypes = parseCommaSeparated(qs.types);
  if (parsedTypes) query.types = parsedTypes as AuditEventType[];

  return query;
}

function formatCsvRow(entry: AuditEntry): string {
  const escape = (v: string): string => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  return [
    escape(entry.id),
    entry.timestamp.toString(),
    escape(entry.category),
    escape(entry.type),
    escape(entry.summary),
    escape(entry.source),
    escape(entry.ruleId ?? ''),
    escape(entry.ruleName ?? ''),
    escape(entry.correlationId ?? ''),
    escape(JSON.stringify(entry.details)),
    entry.durationMs?.toString() ?? '',
  ].join(',');
}

const CSV_HEADER = 'id,timestamp,category,type,summary,source,ruleId,ruleName,correlationId,details,durationMs';

export async function registerAuditRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;
  let auditSSEManager: AuditSSEManager | null = null;

  const requireAuditLog = (): AuditLogService => {
    const auditLog = engine.getAuditLog();
    if (!auditLog) {
      throw new ServiceUnavailableError('Audit log is not configured');
    }
    return auditLog;
  };

  const getAuditSSEManager = (): AuditSSEManager => {
    if (!auditSSEManager) {
      const auditLog = requireAuditLog();
      auditSSEManager = new AuditSSEManager();
      auditSSEManager.start(auditLog);
    }
    return auditSSEManager;
  };

  fastify.addHook('onClose', async () => {
    if (auditSSEManager) {
      auditSSEManager.stop();
      auditSSEManager = null;
    }
  });

  // GET /audit/entries — Query audit entries
  fastify.get<{ Querystring: AuditQuerystring }>(
    '/audit/entries',
    { schema: auditSchemas.list },
    async (request): Promise<AuditQueryResult> => {
      const auditLog = requireAuditLog();
      return auditLog.query(buildAuditQuery(request.query));
    }
  );

  // GET /audit/entries/:id — Get single audit entry
  fastify.get<{ Params: AuditEntryParams }>(
    '/audit/entries/:id',
    { schema: auditSchemas.get },
    async (request): Promise<AuditEntry> => {
      const auditLog = requireAuditLog();
      const entry = auditLog.getById(request.params.id);
      if (!entry) {
        throw new NotFoundError('Audit entry', request.params.id);
      }
      return entry;
    }
  );

  // GET /audit/stats — Audit statistics
  fastify.get(
    '/audit/stats',
    { schema: auditSchemas.stats },
    async (): Promise<AuditStats> => {
      const auditLog = requireAuditLog();
      return auditLog.getStats();
    }
  );

  // GET /audit/stream — SSE real-time stream
  fastify.get<{ Querystring: AuditStreamQuerystring }>(
    '/audit/stream',
    { schema: auditSchemas.stream },
    async (request, reply): Promise<void> => {
      const manager = getAuditSSEManager();
      const { categories, types, ruleIds, sources } = request.query;

      const filter: AuditSSEFilter = {};

      const parsedCategories = parseCommaSeparated(categories);
      if (parsedCategories) filter.categories = parsedCategories as AuditCategory[];

      const parsedTypes = parseCommaSeparated(types);
      if (parsedTypes) filter.types = parsedTypes as AuditEventType[];

      const parsedRuleIds = parseCommaSeparated(ruleIds);
      if (parsedRuleIds) filter.ruleIds = parsedRuleIds;

      const parsedSources = parseCommaSeparated(sources);
      if (parsedSources) filter.sources = parsedSources;

      const connectionId = generateId();
      manager.addConnection(connectionId, reply, filter);

      return reply.hijack();
    }
  );

  // GET /audit/stream/stats — SSE connection statistics
  fastify.get(
    '/audit/stream/stats',
    { schema: auditSchemas.streamStats },
    async (): Promise<AuditSSEManagerStats> => {
      const manager = getAuditSSEManager();
      return manager.getStats();
    }
  );

  // GET /audit/export — Export audit entries
  fastify.get<{ Querystring: AuditExportQuerystring }>(
    '/audit/export',
    { schema: auditSchemas.export },
    async (request, reply): Promise<string> => {
      const auditLog = requireAuditLog();
      const { format = 'json', ...filterParams } = request.query;

      const query: AuditQuery = {};
      if (filterParams.category) query.category = filterParams.category;
      if (filterParams.ruleId) query.ruleId = filterParams.ruleId;
      if (filterParams.source) query.source = filterParams.source;

      const exportFrom = parseNumeric(filterParams.from);
      if (exportFrom !== undefined) query.from = exportFrom;

      const exportTo = parseNumeric(filterParams.to);
      if (exportTo !== undefined) query.to = exportTo;

      const exportTypes = parseCommaSeparated(filterParams.types);
      if (exportTypes) query.types = exportTypes as AuditEventType[];
      query.limit = 10_000;

      const result = auditLog.query(query);

      if (format === 'csv') {
        reply.type('text/csv');
        reply.header('Content-Disposition', 'attachment; filename="audit-export.csv"');
        const lines = [CSV_HEADER, ...result.entries.map(formatCsvRow)];
        return lines.join('\n');
      }

      reply.type('application/json');
      reply.header('Content-Disposition', 'attachment; filename="audit-export.json"');
      return JSON.stringify(result.entries, null, 2);
    }
  );

  // POST /audit/cleanup — Manual cleanup of old entries
  fastify.post(
    '/audit/cleanup',
    { schema: auditSchemas.cleanup },
    async (): Promise<{ removedCount: number; remainingCount: number }> => {
      const auditLog = requireAuditLog();
      const removedCount = await auditLog.cleanup();
      const stats = auditLog.getStats();
      return {
        removedCount,
        remainingCount: stats.memoryEntries,
      };
    }
  );
}
