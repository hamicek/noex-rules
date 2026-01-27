import type { FastifyReply } from 'fastify';
import type { Event } from '../../types/event.js';

/**
 * Reprezentuje SSE klienta s jeho topic filtry.
 */
export interface SSEClient {
  /** Unikátní ID připojení */
  id: string;
  /** Fastify response object */
  reply: FastifyReply;
  /** Topic patterny pro filtrování eventů (podporuje wildcardy) */
  patterns: string[];
  /** Timestamp připojení */
  connectedAt: number;
}

/**
 * Konfigurace SSE Manageru.
 */
export interface SSEManagerConfig {
  /** Interval pro heartbeat v ms (výchozí: 30000) */
  heartbeatInterval?: number;
}

/**
 * Statistiky SSE Manageru.
 */
export interface SSEManagerStats {
  /** Počet aktivních připojení */
  activeConnections: number;
  /** Celkový počet odeslaných eventů */
  totalEventsSent: number;
}

/**
 * Manager pro Server-Sent Events připojení.
 *
 * Umožňuje klientům přihlásit se k real-time streamu eventů z RuleEngine.
 * Podporuje filtrování podle topic patternů včetně wildcardů.
 *
 * @example
 * ```typescript
 * const sseManager = new SSEManager();
 *
 * // V route handleru:
 * sseManager.addConnection(connectionId, reply, ['order.*', 'payment.completed']);
 *
 * // V engine subscriberu:
 * engine.subscribe('*', (event, topic) => {
 *   sseManager.broadcast(event, topic);
 * });
 * ```
 */
export class SSEManager {
  private readonly clients: Map<string, SSEClient> = new Map();
  private readonly heartbeatInterval: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private totalEventsSent = 0;

  constructor(config: SSEManagerConfig = {}) {
    this.heartbeatInterval = config.heartbeatInterval ?? 30000;
  }

  /**
   * Spustí heartbeat timer pro udržení připojení.
   */
  start(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);

    // Nechceme blokovat ukončení procesu
    this.heartbeatTimer.unref();
  }

  /**
   * Zastaví heartbeat timer a uzavře všechna připojení.
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Uzavřít všechna připojení
    for (const client of this.clients.values()) {
      this.closeConnection(client);
    }
    this.clients.clear();
  }

  /**
   * Přidá nové SSE připojení.
   *
   * @param id - Unikátní ID připojení
   * @param reply - Fastify response object
   * @param patterns - Topic patterny pro filtrování (výchozí: ['*'] = všechny eventy)
   */
  addConnection(id: string, reply: FastifyReply, patterns: string[] = ['*']): void {
    // Nastavit SSE hlavičky
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no' // Pro nginx
    });

    const client: SSEClient = {
      id,
      reply,
      patterns: patterns.length > 0 ? patterns : ['*'],
      connectedAt: Date.now()
    };

    this.clients.set(id, client);

    // Odeslat úvodní komentář (potvrzení připojení)
    this.sendComment(client, `connected:${id}`);

    // Handler pro odpojení klienta
    reply.raw.on('close', () => {
      this.removeConnection(id);
    });
  }

  /**
   * Odebere SSE připojení.
   */
  removeConnection(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      this.closeConnection(client);
      this.clients.delete(id);
    }
  }

  /**
   * Broadcastuje event všem relevantním klientům.
   *
   * @param event - Event k odeslání
   * @param topic - Topic eventu (pro filtrování)
   */
  broadcast(event: Event, topic: string): void {
    const data = this.formatEventData(event, topic);

    for (const client of this.clients.values()) {
      if (this.matchesAnyPattern(topic, client.patterns)) {
        if (this.sendData(client, data)) {
          this.totalEventsSent++;
        }
      }
    }
  }

  /**
   * Vrátí počet aktivních připojení.
   */
  get connectionCount(): number {
    return this.clients.size;
  }

  /**
   * Vrátí statistiky manageru.
   */
  getStats(): SSEManagerStats {
    return {
      activeConnections: this.clients.size,
      totalEventsSent: this.totalEventsSent
    };
  }

  /**
   * Vrátí seznam aktivních připojení (pro debugging/admin).
   */
  getConnections(): Array<{ id: string; patterns: string[]; connectedAt: number }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      patterns: client.patterns,
      connectedAt: client.connectedAt
    }));
  }

  /**
   * Kontroluje, zda se topic shoduje s některým z patternů.
   */
  private matchesAnyPattern(topic: string, patterns: string[]): boolean {
    return patterns.some(pattern => this.matchesTopicPattern(topic, pattern));
  }

  /**
   * Kontroluje shodu topic s patternem (podporuje wildcardy).
   *
   * Příklady:
   * - '*' matchuje všechno
   * - 'order.*' matchuje 'order.created', 'order.updated'
   * - 'order.created' matchuje pouze 'order.created'
   */
  private matchesTopicPattern(topic: string, pattern: string): boolean {
    if (pattern === '*') return true;

    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const topicPart = topicParts[i];

      if (patternPart === '*') {
        // Wildcard matchuje jeden segment - musí existovat
        if (topicPart === undefined) return false;
        // Wildcard na konci matchuje zbytek
        if (i === patternParts.length - 1) return true;
        continue;
      }

      if (patternPart !== topicPart) return false;
    }

    return patternParts.length === topicParts.length;
  }

  /**
   * Formátuje event data pro SSE.
   */
  private formatEventData(event: Event, topic: string): string {
    return JSON.stringify({
      id: event.id,
      topic,
      data: event.data,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
      source: event.source
    });
  }

  /**
   * Odešle data klientovi.
   */
  private sendData(client: SSEClient, data: string): boolean {
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
   * Odešle komentář (pro heartbeat nebo metadata).
   */
  private sendComment(client: SSEClient, comment: string): boolean {
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
   * Odešle heartbeat všem klientům.
   */
  private sendHeartbeat(): void {
    const deadClients: string[] = [];

    for (const client of this.clients.values()) {
      if (!this.sendComment(client, 'heartbeat')) {
        deadClients.push(client.id);
      }
    }

    // Cleanup mrtvých připojení
    for (const id of deadClients) {
      this.clients.delete(id);
    }
  }

  /**
   * Bezpečně uzavře připojení klienta.
   */
  private closeConnection(client: SSEClient): void {
    try {
      if (!client.reply.raw.writableEnded) {
        client.reply.raw.end();
      }
    } catch {
      // Ignorovat chyby při zavírání
    }
  }
}
