import type { Event } from '../types/event.js';
import type { EventStore } from '../core/event-store.js';
import type { TraceCollector } from './trace-collector.js';
import type { DebugTraceEntry } from './types.js';

/**
 * Query parameters for filtering event history.
 */
export interface HistoryQuery {
  /** Filter by event topic (exact match or wildcard pattern) */
  topic?: string;

  /** Filter by correlation ID */
  correlationId?: string;

  /** Filter events after this timestamp (inclusive) */
  from?: number;

  /** Filter events before this timestamp (inclusive) */
  to?: number;

  /** Maximum number of events to return */
  limit?: number;

  /** Include trace context (related trace entries) */
  includeContext?: boolean;
}

/**
 * Extended event with optional trace context.
 */
export interface EventWithContext extends Event {
  /** Related trace entries for this event */
  traceEntries?: DebugTraceEntry[];

  /** Rules that were triggered by this event */
  triggeredRules?: Array<{
    ruleId: string;
    ruleName?: string;
    executed: boolean;
    durationMs?: number;
  }>;

  /** Events caused by this event (via rules) */
  causedEvents?: Event[];
}

/**
 * Result of a history query.
 */
export interface HistoryResult {
  /** Matching events */
  events: EventWithContext[];

  /** Total count before limit applied */
  totalCount: number;

  /** Query execution time in milliseconds */
  queryTimeMs: number;
}

/**
 * Entry in a correlation timeline.
 */
export interface TimelineEntry {
  /** Unix timestamp */
  timestamp: number;

  /** Type of entry: 'event' for Event, 'trace' for DebugTraceEntry */
  type: 'event' | 'trace';

  /** The actual entry */
  entry: Event | DebugTraceEntry;

  /** Depth in the causation chain (0 = root) */
  depth: number;

  /** ID of the parent entry (causationId) */
  parentId?: string;
}

/**
 * Service for querying event history and exploring correlation chains.
 *
 * Combines data from EventStore and TraceCollector to provide rich
 * debugging context for events.
 */
export class HistoryService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly traceCollector: TraceCollector
  ) {}

  /**
   * Query event history with flexible filtering.
   */
  query(query: HistoryQuery): HistoryResult {
    const startTime = performance.now();

    let events: Event[];

    if (query.correlationId) {
      events = this.eventStore.getByCorrelation(query.correlationId);

      if (query.topic) {
        events = events.filter(e => this.matchesTopic(e.topic, query.topic!));
      }
      if (query.from !== undefined) {
        events = events.filter(e => e.timestamp >= query.from!);
      }
      if (query.to !== undefined) {
        events = events.filter(e => e.timestamp <= query.to!);
      }
    } else {
      events = this.getAllEventsFiltered(query);
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    const totalCount = events.length;

    if (query.limit !== undefined && events.length > query.limit) {
      events = events.slice(-query.limit);
    }

    let result: EventWithContext[];

    if (query.includeContext) {
      result = events.map(event => this.enrichWithContext(event));
    } else {
      result = events;
    }

    return {
      events: result,
      totalCount,
      queryTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Get a timeline of all activities for a correlation ID.
   *
   * Returns events and trace entries merged and sorted chronologically,
   * with depth information showing the causation chain.
   */
  getCorrelationTimeline(correlationId: string): TimelineEntry[] {
    const events = this.eventStore.getByCorrelation(correlationId);
    const traces = this.traceCollector.getByCorrelation(correlationId);

    const timeline: TimelineEntry[] = [];

    const eventDepths = this.calculateEventDepths(events);

    for (const event of events) {
      timeline.push({
        timestamp: event.timestamp,
        type: 'event',
        entry: event,
        depth: eventDepths.get(event.id) ?? 0,
        parentId: event.causationId,
      });
    }

    for (const trace of traces) {
      const parentEvent = events.find(e => e.id === trace.causationId);
      const depth = parentEvent
        ? (eventDepths.get(parentEvent.id) ?? 0) + 1
        : 0;

      timeline.push({
        timestamp: trace.timestamp,
        type: 'trace',
        entry: trace,
        depth,
        parentId: trace.causationId,
      });
    }

    timeline.sort((a, b) => a.timestamp - b.timestamp);

    return timeline;
  }

  /**
   * Export a correlation trace to JSON or Mermaid sequence diagram.
   */
  exportTrace(correlationId: string, format: 'json' | 'mermaid'): string {
    const timeline = this.getCorrelationTimeline(correlationId);

    if (format === 'json') {
      return JSON.stringify(timeline, null, 2);
    }

    return this.generateMermaidSequenceDiagram(timeline, correlationId);
  }

  /**
   * Get a single event with full context.
   */
  getEventWithContext(eventId: string): EventWithContext | undefined {
    const event = this.eventStore.get(eventId);
    if (!event) {
      return undefined;
    }

    return this.enrichWithContext(event);
  }

  /**
   * Follow the causation chain backwards from an event.
   */
  getCausationChain(eventId: string): Event[] {
    const chain: Event[] = [];
    let currentId: string | undefined = eventId;

    while (currentId) {
      const event = this.eventStore.get(currentId);
      if (!event) {
        break;
      }

      chain.unshift(event);
      currentId = event.causationId;
    }

    return chain;
  }

  private getAllEventsFiltered(query: HistoryQuery): Event[] {
    let events: Event[];

    if (query.topic) {
      if (query.topic.includes('*')) {
        events = this.eventStore.getByTopicPattern(query.topic);
      } else if (query.from !== undefined || query.to !== undefined) {
        events = this.eventStore.getInTimeRange(
          query.topic,
          query.from ?? 0,
          query.to ?? Date.now()
        );
      } else {
        events = this.eventStore.getByTopic(query.topic);
      }
    } else {
      events = this.eventStore.getAllEvents();
    }

    if (query.from !== undefined) {
      events = events.filter(e => e.timestamp >= query.from!);
    }

    if (query.to !== undefined) {
      events = events.filter(e => e.timestamp <= query.to!);
    }

    return events;
  }

  private matchesTopic(eventTopic: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
      return eventTopic === pattern;
    }

    // Use placeholders to prevent ** and * from interfering with each other
    const GLOBSTAR = '\x00GLOBSTAR\x00';
    const STAR = '\x00STAR\x00';

    const regexPattern = pattern
      .replace(/\*\*/g, GLOBSTAR)
      .replace(/\*/g, STAR)
      .replace(/\./g, '\\.')
      .replace(new RegExp(GLOBSTAR, 'g'), '.*')
      .replace(new RegExp(STAR, 'g'), '[^.]*');

    return new RegExp(`^${regexPattern}$`).test(eventTopic);
  }

  private enrichWithContext(event: Event): EventWithContext {
    const result: EventWithContext = { ...event };

    const traces = this.traceCollector.query({
      correlationId: event.correlationId,
    });

    const relevantTraces = traces.filter(
      t => t.causationId === event.id || t.details['eventId'] === event.id
    );

    if (relevantTraces.length > 0) {
      result.traceEntries = relevantTraces;
    }

    const triggeredRules: EventWithContext['triggeredRules'] = [];
    for (const trace of relevantTraces) {
      if (trace.type === 'rule_executed' || trace.type === 'rule_skipped') {
        triggeredRules.push({
          ruleId: trace.ruleId!,
          ruleName: trace.ruleName,
          executed: trace.type === 'rule_executed',
          durationMs: trace.durationMs,
        });
      }
    }

    if (triggeredRules.length > 0) {
      result.triggeredRules = triggeredRules;
    }

    if (event.correlationId) {
      const allCorrelatedEvents = this.eventStore.getByCorrelation(event.correlationId);
      const causedEvents = allCorrelatedEvents.filter(e => e.causationId === event.id);

      if (causedEvents.length > 0) {
        result.causedEvents = causedEvents;
      }
    }

    return result;
  }

  private calculateEventDepths(events: Event[]): Map<string, number> {
    const depths = new Map<string, number>();
    const eventsById = new Map(events.map(e => [e.id, e]));

    const getDepth = (event: Event): number => {
      if (depths.has(event.id)) {
        return depths.get(event.id)!;
      }

      if (!event.causationId) {
        depths.set(event.id, 0);
        return 0;
      }

      const parent = eventsById.get(event.causationId);
      if (!parent) {
        depths.set(event.id, 0);
        return 0;
      }

      const parentDepth = getDepth(parent);
      const depth = parentDepth + 1;
      depths.set(event.id, depth);
      return depth;
    };

    for (const event of events) {
      getDepth(event);
    }

    return depths;
  }

  private generateMermaidSequenceDiagram(timeline: TimelineEntry[], correlationId: string): string {
    const lines: string[] = [
      'sequenceDiagram',
      `    title Correlation: ${correlationId}`,
      '',
    ];

    const participants = new Set<string>();

    for (const entry of timeline) {
      if (entry.type === 'event') {
        const event = entry.entry as Event;
        participants.add(event.source);
        participants.add(`topic:${event.topic}`);
      } else {
        const trace = entry.entry as DebugTraceEntry;
        if (trace.ruleId) {
          participants.add(`rule:${trace.ruleId}`);
        }
      }
    }

    for (const participant of participants) {
      lines.push(`    participant ${this.sanitizeMermaidId(participant)}`);
    }

    lines.push('');

    for (const entry of timeline) {
      if (entry.type === 'event') {
        const event = entry.entry as Event;
        const from = this.sanitizeMermaidId(event.source);
        const to = this.sanitizeMermaidId(`topic:${event.topic}`);
        lines.push(`    ${from}->>+${to}: ${event.topic}`);
      } else {
        const trace = entry.entry as DebugTraceEntry;
        if (trace.ruleId && trace.type === 'rule_executed') {
          const ruleId = this.sanitizeMermaidId(`rule:${trace.ruleId}`);
          lines.push(`    Note over ${ruleId}: ${trace.type} (${trace.durationMs ?? 0}ms)`);
        }
      }
    }

    return lines.join('\n');
  }

  private sanitizeMermaidId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
