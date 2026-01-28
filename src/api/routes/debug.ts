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
import { Profiler, type RuleProfile, type ProfilingSummary } from '../../debugging/profiler.js';
import {
  DebugSSEManager,
  type DebugSSEFilter,
  type DebugSSEManagerStats
} from '../notifications/debug-sse-manager.js';
import {
  DebugController,
  type DebugSession,
  type Breakpoint,
  type Snapshot,
  type BreakpointInput
} from '../../debugging/debug-controller.js';
import { NotFoundError } from '../middleware/error-handler.js';
import { debugSchemas } from '../schemas/debug.js';
import { generateId } from '../../utils/id-generator.js';

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

interface RuleIdParams {
  ruleId: string;
}

interface ProfileQuerystring {
  limit?: number;
}

interface StreamQuerystring {
  types?: string;
  ruleIds?: string;
  correlationIds?: string;
  minDurationMs?: number;
}

interface SessionIdParams {
  sessionId: string;
}

interface BreakpointIdParams {
  sessionId: string;
  breakpointId: string;
}

interface SnapshotIdParams {
  sessionId: string;
  snapshotId: string;
}

interface CreateBreakpointBody {
  type: 'rule' | 'event' | 'fact' | 'action';
  condition: {
    ruleId?: string;
    topic?: string;
    factPattern?: string;
    actionType?: string;
  };
  action: 'pause' | 'log' | 'snapshot';
  enabled?: boolean;
}

interface TakeSnapshotBody {
  label?: string;
}

export async function registerDebugRoutes(fastify: FastifyInstance): Promise<void> {
  const engine = fastify.engine;
  let profiler: Profiler | null = null;
  let debugSSEManager: DebugSSEManager | null = null;
  let debugController: DebugController | null = null;

  const getHistoryService = (): HistoryService => {
    return new HistoryService(engine.getEventStore(), engine.getTraceCollector());
  };

  const getProfiler = (): Profiler => {
    if (!profiler) {
      profiler = new Profiler(engine.getTraceCollector());
    }
    return profiler;
  };

  const getDebugSSEManager = (): DebugSSEManager => {
    if (!debugSSEManager) {
      debugSSEManager = new DebugSSEManager();
      debugSSEManager.start(engine.getTraceCollector());
    }
    return debugSSEManager;
  };

  const getDebugController = (): DebugController => {
    if (!debugController) {
      debugController = new DebugController(
        engine.getTraceCollector(),
        engine.getFactStore()
      );
    }
    return debugController;
  };

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    if (debugSSEManager) {
      debugSSEManager.stop();
      debugSSEManager = null;
    }
    if (profiler) {
      profiler.stop();
      profiler = null;
    }
    if (debugController) {
      debugController.stop();
      debugController = null;
    }
  });

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

  // GET /debug/profile - All rule profiles
  fastify.get(
    '/debug/profile',
    { schema: debugSchemas.getAllProfiles },
    async (): Promise<RuleProfile[]> => {
      return getProfiler().getRuleProfiles();
    }
  );

  // GET /debug/profile/summary - Profiling summary
  fastify.get(
    '/debug/profile/summary',
    { schema: debugSchemas.getProfilingSummary },
    async (): Promise<ProfilingSummary> => {
      return getProfiler().getSummary();
    }
  );

  // GET /debug/profile/slowest - Slowest rules
  fastify.get<{ Querystring: ProfileQuerystring }>(
    '/debug/profile/slowest',
    { schema: debugSchemas.getSlowestRules },
    async (request): Promise<RuleProfile[]> => {
      const limit = request.query.limit ?? 10;
      return getProfiler().getSlowestRules(limit);
    }
  );

  // GET /debug/profile/hottest - Most triggered rules
  fastify.get<{ Querystring: ProfileQuerystring }>(
    '/debug/profile/hottest',
    { schema: debugSchemas.getHottestRules },
    async (request): Promise<RuleProfile[]> => {
      const limit = request.query.limit ?? 10;
      return getProfiler().getHottestRules(limit);
    }
  );

  // GET /debug/profile/:ruleId - Specific rule profile
  fastify.get<{ Params: RuleIdParams }>(
    '/debug/profile/:ruleId',
    { schema: debugSchemas.getRuleProfile },
    async (request): Promise<RuleProfile> => {
      const profile = getProfiler().getRuleProfile(request.params.ruleId);
      if (!profile) {
        throw new NotFoundError('Rule profile', request.params.ruleId);
      }
      return profile;
    }
  );

  // POST /debug/profile/reset - Reset profiling data
  fastify.post(
    '/debug/profile/reset',
    { schema: debugSchemas.resetProfile },
    async (): Promise<{ reset: boolean }> => {
      getProfiler().reset();
      return { reset: true };
    }
  );

  // GET /debug/stream - SSE stream of trace entries
  fastify.get<{ Querystring: StreamQuerystring }>(
    '/debug/stream',
    { schema: debugSchemas.stream },
    async (request, reply): Promise<void> => {
      const { types, ruleIds, correlationIds, minDurationMs } = request.query;

      const filter: DebugSSEFilter = {};

      if (types) {
        filter.types = types.split(',').map(t => t.trim()) as TraceEntryType[];
      }
      if (ruleIds) {
        filter.ruleIds = ruleIds.split(',').map(id => id.trim());
      }
      if (correlationIds) {
        filter.correlationIds = correlationIds.split(',').map(id => id.trim());
      }
      if (minDurationMs !== undefined) {
        filter.minDurationMs = minDurationMs;
      }

      const connectionId = generateId();
      getDebugSSEManager().addConnection(connectionId, reply, filter);

      // Prevent Fastify from closing the connection
      return reply.hijack();
    }
  );

  // GET /debug/stream/connections - Get active SSE connections
  fastify.get(
    '/debug/stream/connections',
    { schema: debugSchemas.streamConnections },
    async (): Promise<Array<{ id: string; filter: DebugSSEFilter; connectedAt: number }>> => {
      return getDebugSSEManager().getConnections();
    }
  );

  // GET /debug/stream/stats - Get SSE stream statistics
  fastify.get(
    '/debug/stream/stats',
    { schema: debugSchemas.streamStats },
    async (): Promise<DebugSSEManagerStats> => {
      return getDebugSSEManager().getStats();
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //                          DEBUG SESSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /debug/sessions - Create debug session
  fastify.post(
    '/debug/sessions',
    { schema: debugSchemas.createSession },
    async (): Promise<DebugSession> => {
      return getDebugController().createSession();
    }
  );

  // GET /debug/sessions - Get all sessions
  fastify.get(
    '/debug/sessions',
    { schema: debugSchemas.getSessions },
    async (): Promise<DebugSession[]> => {
      return getDebugController().getSessions();
    }
  );

  // GET /debug/sessions/:sessionId - Get session
  fastify.get<{ Params: SessionIdParams }>(
    '/debug/sessions/:sessionId',
    { schema: debugSchemas.getSession },
    async (request): Promise<DebugSession> => {
      const session = getDebugController().getSession(request.params.sessionId);
      if (!session) {
        throw new NotFoundError('Session', request.params.sessionId);
      }
      return session;
    }
  );

  // DELETE /debug/sessions/:sessionId - End session
  fastify.delete<{ Params: SessionIdParams }>(
    '/debug/sessions/:sessionId',
    { schema: debugSchemas.endSession },
    async (request): Promise<{ deleted: boolean }> => {
      const deleted = getDebugController().endSession(request.params.sessionId);
      if (!deleted) {
        throw new NotFoundError('Session', request.params.sessionId);
      }
      return { deleted: true };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //                          BREAKPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /debug/sessions/:sessionId/breakpoints - Add breakpoint
  fastify.post<{ Params: SessionIdParams; Body: CreateBreakpointBody }>(
    '/debug/sessions/:sessionId/breakpoints',
    { schema: debugSchemas.addBreakpoint },
    async (request): Promise<Breakpoint> => {
      const input: BreakpointInput = {
        type: request.body.type,
        condition: request.body.condition,
        action: request.body.action,
        enabled: request.body.enabled,
      };

      const breakpoint = getDebugController().addBreakpoint(
        request.params.sessionId,
        input
      );

      if (!breakpoint) {
        throw new NotFoundError('Session', request.params.sessionId);
      }

      return breakpoint;
    }
  );

  // DELETE /debug/sessions/:sessionId/breakpoints/:breakpointId - Remove breakpoint
  fastify.delete<{ Params: BreakpointIdParams }>(
    '/debug/sessions/:sessionId/breakpoints/:breakpointId',
    { schema: debugSchemas.removeBreakpoint },
    async (request): Promise<{ deleted: boolean }> => {
      const deleted = getDebugController().removeBreakpoint(
        request.params.sessionId,
        request.params.breakpointId
      );

      if (!deleted) {
        throw new NotFoundError('Breakpoint', request.params.breakpointId);
      }

      return { deleted: true };
    }
  );

  // POST /debug/sessions/:sessionId/breakpoints/:breakpointId/enable - Enable breakpoint
  fastify.post<{ Params: BreakpointIdParams }>(
    '/debug/sessions/:sessionId/breakpoints/:breakpointId/enable',
    { schema: debugSchemas.enableBreakpoint },
    async (request): Promise<{ enabled: boolean }> => {
      const enabled = getDebugController().enableBreakpoint(
        request.params.sessionId,
        request.params.breakpointId
      );

      if (!enabled) {
        throw new NotFoundError('Breakpoint', request.params.breakpointId);
      }

      return { enabled: true };
    }
  );

  // POST /debug/sessions/:sessionId/breakpoints/:breakpointId/disable - Disable breakpoint
  fastify.post<{ Params: BreakpointIdParams }>(
    '/debug/sessions/:sessionId/breakpoints/:breakpointId/disable',
    { schema: debugSchemas.disableBreakpoint },
    async (request): Promise<{ disabled: boolean }> => {
      const disabled = getDebugController().disableBreakpoint(
        request.params.sessionId,
        request.params.breakpointId
      );

      if (!disabled) {
        throw new NotFoundError('Breakpoint', request.params.breakpointId);
      }

      return { disabled: true };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //                          EXECUTION CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /debug/sessions/:sessionId/resume - Resume execution
  fastify.post<{ Params: SessionIdParams }>(
    '/debug/sessions/:sessionId/resume',
    { schema: debugSchemas.resumeSession },
    async (request): Promise<{ resumed: boolean }> => {
      const resumed = getDebugController().resume(request.params.sessionId);
      return { resumed };
    }
  );

  // POST /debug/sessions/:sessionId/step - Step execution
  fastify.post<{ Params: SessionIdParams }>(
    '/debug/sessions/:sessionId/step',
    { schema: debugSchemas.stepSession },
    async (request): Promise<{ stepped: boolean }> => {
      const stepped = getDebugController().step(request.params.sessionId);
      return { stepped };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //                          SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /debug/sessions/:sessionId/snapshot - Take snapshot
  fastify.post<{ Params: SessionIdParams; Body: TakeSnapshotBody }>(
    '/debug/sessions/:sessionId/snapshot',
    { schema: debugSchemas.takeSnapshot },
    async (request): Promise<Snapshot> => {
      const snapshot = getDebugController().takeSnapshot(
        request.params.sessionId,
        request.body.label
      );

      if (!snapshot) {
        throw new NotFoundError('Session', request.params.sessionId);
      }

      return snapshot;
    }
  );

  // GET /debug/sessions/:sessionId/snapshots/:snapshotId - Get snapshot
  fastify.get<{ Params: SnapshotIdParams }>(
    '/debug/sessions/:sessionId/snapshots/:snapshotId',
    { schema: debugSchemas.getSnapshot },
    async (request): Promise<Snapshot> => {
      const snapshot = getDebugController().getSnapshot(
        request.params.sessionId,
        request.params.snapshotId
      );

      if (!snapshot) {
        throw new NotFoundError('Snapshot', request.params.snapshotId);
      }

      return snapshot;
    }
  );

  // DELETE /debug/sessions/:sessionId/snapshots - Clear snapshots
  fastify.delete<{ Params: SessionIdParams }>(
    '/debug/sessions/:sessionId/snapshots',
    { schema: debugSchemas.clearSnapshots },
    async (request): Promise<{ cleared: boolean }> => {
      const cleared = getDebugController().clearSnapshots(request.params.sessionId);

      if (!cleared) {
        throw new NotFoundError('Session', request.params.sessionId);
      }

      return { cleared: true };
    }
  );
}
