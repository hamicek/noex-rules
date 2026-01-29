import type { FastifyReply } from 'fastify';
import type { AuditCategory, AuditEntry, AuditEventType } from '../../audit/types.js';
import type { AuditLogService } from '../../audit/audit-log-service.js';

/**
 * Filter options for audit SSE stream.
 */
export interface AuditSSEFilter {
  /** Filter by audit categories */
  categories?: AuditCategory[];

  /** Filter by audit event types */
  types?: AuditEventType[];

  /** Filter by rule IDs */
  ruleIds?: string[];

  /** Filter by source components */
  sources?: string[];
}

/**
 * Represents an audit SSE client with filters.
 */
export interface AuditSSEClient {
  /** Unique connection ID */
  id: string;

  /** Fastify response object */
  reply: FastifyReply;

  /** Filters for audit entries */
  filter: AuditSSEFilter;

  /** Connection timestamp */
  connectedAt: number;
}

/**
 * Configuration for AuditSSEManager.
 */
export interface AuditSSEManagerConfig {
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
}

/**
 * Statistics for AuditSSEManager.
 */
export interface AuditSSEManagerStats {
  /** Number of active connections */
  activeConnections: number;

  /** Total audit entries sent */
  totalEntriesSent: number;

  /** Total entries filtered out */
  totalEntriesFiltered: number;
}

/**
 * Manager for Server-Sent Events streaming of audit log entries.
 *
 * Allows clients to subscribe to real-time audit entries from the rule engine
 * with flexible filtering by category, event type, rule ID, and source.
 *
 * @example
 * ```typescript
 * const auditSSE = new AuditSSEManager();
 * auditSSE.start(auditLogService);
 *
 * // In route handler:
 * auditSSE.addConnection(id, reply, {
 *   categories: ['rule_execution'],
 *   types: ['rule_failed'],
 * });
 * ```
 */
export class AuditSSEManager {
  private readonly clients = new Map<string, AuditSSEClient>();
  private readonly heartbeatInterval: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  private totalEntriesSent = 0;
  private totalEntriesFiltered = 0;

  constructor(config: AuditSSEManagerConfig = {}) {
    this.heartbeatInterval = config.heartbeatInterval ?? 30000;
  }

  /**
   * Start the manager and subscribe to audit log service.
   */
  start(auditLog: AuditLogService): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);

    this.heartbeatTimer.unref();

    this.unsubscribe = auditLog.subscribe((entry) => {
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
   * @param filter - Filter options for audit entries
   */
  addConnection(id: string, reply: FastifyReply, filter: AuditSSEFilter = {}): void {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const client: AuditSSEClient = {
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
   * Broadcast an audit entry to all matching clients.
   */
  broadcast(entry: AuditEntry): void {
    const data = JSON.stringify(entry);

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
  getStats(): AuditSSEManagerStats {
    return {
      activeConnections: this.clients.size,
      totalEntriesSent: this.totalEntriesSent,
      totalEntriesFiltered: this.totalEntriesFiltered
    };
  }

  /**
   * Get list of active connections (for admin/debugging).
   */
  getConnections(): Array<{ id: string; filter: AuditSSEFilter; connectedAt: number }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      filter: client.filter,
      connectedAt: client.connectedAt
    }));
  }

  /**
   * Check if an audit entry matches the client's filter.
   * All specified criteria must match (AND logic).
   */
  private matchesFilter(entry: AuditEntry, filter: AuditSSEFilter): boolean {
    if (filter.categories && filter.categories.length > 0) {
      if (!filter.categories.includes(entry.category)) {
        return false;
      }
    }

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

    if (filter.sources && filter.sources.length > 0) {
      if (!filter.sources.includes(entry.source)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Describe filter for connection comment.
   */
  private describeFilter(filter: AuditSSEFilter): string {
    const parts: string[] = [];

    if (filter.categories && filter.categories.length > 0) {
      parts.push(`categories=${filter.categories.join(',')}`);
    }
    if (filter.types && filter.types.length > 0) {
      parts.push(`types=${filter.types.join(',')}`);
    }
    if (filter.ruleIds && filter.ruleIds.length > 0) {
      parts.push(`ruleIds=${filter.ruleIds.join(',')}`);
    }
    if (filter.sources && filter.sources.length > 0) {
      parts.push(`sources=${filter.sources.join(',')}`);
    }

    return parts.join(';');
  }

  /**
   * Send data to a client.
   */
  private sendData(client: AuditSSEClient, data: string): boolean {
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
  private sendComment(client: AuditSSEClient, comment: string): boolean {
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
  private closeConnection(client: AuditSSEClient): void {
    try {
      if (!client.reply.raw.writableEnded) {
        client.reply.raw.end();
      }
    } catch {
      // Ignore errors when closing
    }
  }
}
