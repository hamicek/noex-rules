import type { FastifyReply } from 'fastify';
import type { DebugTraceEntry, TraceEntryType } from '../../debugging/types.js';
import type { TraceCollector } from '../../debugging/trace-collector.js';

/**
 * Filter options for debug SSE stream.
 */
export interface DebugSSEFilter {
  /** Filter by trace entry types */
  types?: TraceEntryType[];

  /** Filter by rule IDs */
  ruleIds?: string[];

  /** Filter by correlation IDs */
  correlationIds?: string[];

  /** Minimum duration in ms to include entry */
  minDurationMs?: number;
}

/**
 * Represents a debug SSE client with filters.
 */
export interface DebugSSEClient {
  /** Unique connection ID */
  id: string;

  /** Fastify response object */
  reply: FastifyReply;

  /** Filters for trace entries */
  filter: DebugSSEFilter;

  /** Connection timestamp */
  connectedAt: number;
}

/**
 * Configuration for DebugSSEManager.
 */
export interface DebugSSEManagerConfig {
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
}

/**
 * Statistics for DebugSSEManager.
 */
export interface DebugSSEManagerStats {
  /** Number of active connections */
  activeConnections: number;

  /** Total trace entries sent */
  totalEntriesSent: number;

  /** Total entries filtered out */
  totalEntriesFiltered: number;
}

/**
 * Manager for Server-Sent Events streaming of debug trace entries.
 *
 * Allows clients to subscribe to real-time trace entries from the rule engine
 * with flexible filtering options.
 *
 * @example
 * ```typescript
 * const debugSSE = new DebugSSEManager();
 * debugSSE.start(traceCollector);
 *
 * // In route handler:
 * debugSSE.addConnection(id, reply, {
 *   types: ['rule_executed', 'action_failed'],
 *   minDurationMs: 100
 * });
 * ```
 */
export class DebugSSEManager {
  private readonly clients = new Map<string, DebugSSEClient>();
  private readonly heartbeatInterval: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  private totalEntriesSent = 0;
  private totalEntriesFiltered = 0;

  constructor(config: DebugSSEManagerConfig = {}) {
    this.heartbeatInterval = config.heartbeatInterval ?? 30000;
  }

  /**
   * Start the manager and subscribe to trace collector.
   */
  start(traceCollector: TraceCollector): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);

    this.heartbeatTimer.unref();

    this.unsubscribe = traceCollector.subscribe((entry) => {
      this.broadcast(entry);
    });
  }

  /**
   * Stop the manager, close all connections and unsubscribe.
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    for (const client of this.clients.values()) {
      this.closeConnection(client);
    }
    this.clients.clear();
  }

  /**
   * Add a new SSE connection.
   *
   * @param id - Unique connection ID
   * @param reply - Fastify response object
   * @param filter - Filter options for trace entries
   */
  addConnection(id: string, reply: FastifyReply, filter: DebugSSEFilter = {}): void {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const client: DebugSSEClient = {
      id,
      reply,
      filter,
      connectedAt: Date.now()
    };

    this.clients.set(id, client);

    this.sendComment(client, `connected:${id}`);

    const filterDesc = this.describeFilter(filter);
    if (filterDesc) {
      this.sendComment(client, `filter:${filterDesc}`);
    }

    reply.raw.on('close', () => {
      this.removeConnection(id);
    });
  }

  /**
   * Remove an SSE connection.
   */
  removeConnection(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      this.closeConnection(client);
      this.clients.delete(id);
    }
  }

  /**
   * Broadcast a trace entry to all matching clients.
   */
  broadcast(entry: DebugTraceEntry): void {
    const data = this.formatEntryData(entry);

    for (const client of this.clients.values()) {
      if (this.matchesFilter(entry, client.filter)) {
        if (this.sendData(client, data)) {
          this.totalEntriesSent++;
        }
      } else {
        this.totalEntriesFiltered++;
      }
    }
  }

  /**
   * Get number of active connections.
   */
  get connectionCount(): number {
    return this.clients.size;
  }

  /**
   * Get manager statistics.
   */
  getStats(): DebugSSEManagerStats {
    return {
      activeConnections: this.clients.size,
      totalEntriesSent: this.totalEntriesSent,
      totalEntriesFiltered: this.totalEntriesFiltered
    };
  }

  /**
   * Get list of active connections (for debugging/admin).
   */
  getConnections(): Array<{ id: string; filter: DebugSSEFilter; connectedAt: number }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      filter: client.filter,
      connectedAt: client.connectedAt
    }));
  }

  /**
   * Check if a trace entry matches the client's filter.
   */
  private matchesFilter(entry: DebugTraceEntry, filter: DebugSSEFilter): boolean {
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(entry.type)) {
        return false;
      }
    }

    if (filter.ruleIds && filter.ruleIds.length > 0) {
      if (!entry.ruleId || !filter.ruleIds.includes(entry.ruleId)) {
        return false;
      }
    }

    if (filter.correlationIds && filter.correlationIds.length > 0) {
      if (!entry.correlationId || !filter.correlationIds.includes(entry.correlationId)) {
        return false;
      }
    }

    if (filter.minDurationMs !== undefined) {
      if (entry.durationMs === undefined || entry.durationMs < filter.minDurationMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format trace entry for SSE transmission.
   */
  private formatEntryData(entry: DebugTraceEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Describe filter for connection comment.
   */
  private describeFilter(filter: DebugSSEFilter): string {
    const parts: string[] = [];

    if (filter.types && filter.types.length > 0) {
      parts.push(`types=${filter.types.join(',')}`);
    }
    if (filter.ruleIds && filter.ruleIds.length > 0) {
      parts.push(`ruleIds=${filter.ruleIds.join(',')}`);
    }
    if (filter.correlationIds && filter.correlationIds.length > 0) {
      parts.push(`correlationIds=${filter.correlationIds.join(',')}`);
    }
    if (filter.minDurationMs !== undefined) {
      parts.push(`minDurationMs=${filter.minDurationMs}`);
    }

    return parts.join(';');
  }

  /**
   * Send data to a client.
   */
  private sendData(client: DebugSSEClient, data: string): boolean {
    try {
      if (client.reply.raw.writableEnded) {
        this.clients.delete(client.id);
        return false;
      }
      client.reply.raw.write(`data: ${data}\n\n`);
      return true;
    } catch {
      this.clients.delete(client.id);
      return false;
    }
  }

  /**
   * Send comment to a client (for heartbeat or metadata).
   */
  private sendComment(client: DebugSSEClient, comment: string): boolean {
    try {
      if (client.reply.raw.writableEnded) {
        this.clients.delete(client.id);
        return false;
      }
      client.reply.raw.write(`: ${comment}\n\n`);
      return true;
    } catch {
      this.clients.delete(client.id);
      return false;
    }
  }

  /**
   * Send heartbeat to all clients.
   */
  private sendHeartbeat(): void {
    const deadClients: string[] = [];

    for (const client of this.clients.values()) {
      if (!this.sendComment(client, 'heartbeat')) {
        deadClients.push(client.id);
      }
    }

    for (const id of deadClients) {
      this.clients.delete(id);
    }
  }

  /**
   * Safely close a client connection.
   */
  private closeConnection(client: DebugSSEClient): void {
    try {
      if (!client.reply.raw.writableEnded) {
        client.reply.raw.end();
      }
    } catch {
      // Ignore errors when closing
    }
  }
}
