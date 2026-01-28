import type { FastifyInstance } from 'fastify';
import type { Event } from '../../types/event.js';
import type { DebugTraceEntry, TraceEntryType } from '../../debugging/types.js';
import {
  HistoryService,
  type HistoryQuery,
  type HistoryResult,
  type EventWithContext,
  type TimelineEntry
} from '../../debugging/history-service.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { debugSchemas } from '../schemas/debug.js';

interface HistoryQuerystring {
  topic?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  includeContext?: boolean;
}

interface EventIdParams {
  eventId: string;
}

interface CorrelationParams {
  correlationId: string;
}

interface ExportQuerystring {
  format?: 'json' | 'mermaid';
}

interface TraceQuerystring {
  correlationId?: string;
  ruleId?: string;
  types?: string;
  limit?: number;
}

export async function registerDebugRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;

  const getHistoryService = (): HistoryService => {
    return new HistoryService(engine.getEventStore(), engine.getTraceCollector());
  };

  // GET /debug/history - Query event history
  fastify.get<{ Querystring: HistoryQuerystring }>(
    '/debug/history',
    { schema: debugSchemas.queryHistory },
    async (request): Promise<HistoryResult> => {
      const { topic, correlationId, from, to, limit, includeContext } = request.query;

      const query: HistoryQuery = {};
      if (topic) query.topic = topic;
      if (correlationId) query.correlationId = correlationId;
      if (from !== undefined) query.from = from;
      if (to !== undefined) query.to = to;
      if (limit !== undefined) query.limit = limit;
      if (includeContext !== undefined) query.includeContext = includeContext;

      return getHistoryService().query(query);
    }
  );

  // GET /debug/history/:eventId - Event with full context
  fastify.get<{ Params: EventIdParams }>(
    '/debug/history/:eventId',
    { schema: debugSchemas.getEvent },
    async (request): Promise<EventWithContext> => {
      const event = getHistoryService().getEventWithContext(request.params.eventId);
      if (!event) {
        throw new NotFoundError('Event', request.params.eventId);
      }
      return event;
    }
  );

  // GET /debug/correlation/:correlationId - Correlation chain
  fastify.get<{ Params: CorrelationParams }>(
    '/debug/correlation/:correlationId',
    { schema: debugSchemas.getCorrelation },
    async (request): Promise<Event[]> => {
      const historyService = getHistoryService();
      const result = historyService.query({ correlationId: request.params.correlationId });
      return result.events;
    }
  );

  // GET /debug/correlation/:correlationId/timeline - Visual timeline
  fastify.get<{ Params: CorrelationParams }>(
    '/debug/correlation/:correlationId/timeline',
    { schema: debugSchemas.getTimeline },
    async (request): Promise<TimelineEntry[]> => {
      return getHistoryService().getCorrelationTimeline(request.params.correlationId);
    }
  );

  // GET /debug/correlation/:correlationId/export - Export JSON/Mermaid
  fastify.get<{ Params: CorrelationParams; Querystring: ExportQuerystring }>(
    '/debug/correlation/:correlationId/export',
    { schema: debugSchemas.exportCorrelation },
    async (request, reply): Promise<string> => {
      const format = request.query.format ?? 'json';
      const exported = getHistoryService().exportTrace(request.params.correlationId, format);

      if (format === 'mermaid') {
        reply.type('text/plain');
      } else {
        reply.type('application/json');
      }

      return exported;
    }
  );

  // GET /debug/traces - Get recent trace entries
  fastify.get<{ Querystring: TraceQuerystring }>(
    '/debug/traces',
    { schema: debugSchemas.getTraces },
    async (request): Promise<DebugTraceEntry[]> => {
      const { correlationId, ruleId, types, limit } = request.query;
      const traceCollector = engine.getTraceCollector();

      const parsedTypes = types
        ? types.split(',').map(t => t.trim()) as TraceEntryType[]
        : undefined;

      return traceCollector.query({
        correlationId,
        ruleId,
        types: parsedTypes,
        limit: limit ?? 100
      });
    }
  );

  // GET /debug/tracing - Get tracing status
  fastify.get(
    '/debug/tracing',
    { schema: debugSchemas.getTracingStatus },
    async (): Promise<{ enabled: boolean }> => {
      return { enabled: engine.isTracingEnabled() };
    }
  );

  // POST /debug/tracing/enable - Enable tracing
  fastify.post(
    '/debug/tracing/enable',
    { schema: debugSchemas.enableTracing },
    async (): Promise<{ enabled: boolean }> => {
      engine.enableTracing();
      return { enabled: true };
    }
  );

  // POST /debug/tracing/disable - Disable tracing
  fastify.post(
    '/debug/tracing/disable',
    { schema: debugSchemas.disableTracing },
    async (): Promise<{ enabled: boolean }> => {
      engine.disableTracing();
      return { enabled: false };
    }
  );
}
