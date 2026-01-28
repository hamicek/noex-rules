import type { Event } from '../types/event.js';

export interface EventStoreConfig {
  name?: string;
  maxEvents?: number;           // Max počet eventů v paměti
  maxAgeMs?: number;            // Max stáří eventu
  // persistence?: PersistenceConfig;  // TODO
}

/**
 * Úložiště pro eventy s podporou korelace a časových dotazů.
 */
export class EventStore {
  private events: Map<string, Event> = new Map();
  private byCorrelation: Map<string, string[]> = new Map();
  private byTopic: Map<string, string[]> = new Map();
  private readonly config: EventStoreConfig;

  constructor(config: EventStoreConfig = {}) {
    this.config = {
      maxEvents: config.maxEvents ?? 10000,
      maxAgeMs: config.maxAgeMs ?? 24 * 60 * 60 * 1000, // 24h default
      ...config
    };
  }

  static async start(config: EventStoreConfig = {}): Promise<EventStore> {
    return new EventStore(config);
  }

  store(event: Event): void {
    this.events.set(event.id, event);

    // Indexovat podle correlationId
    if (event.correlationId) {
      const existing = this.byCorrelation.get(event.correlationId) ?? [];
      this.byCorrelation.set(event.correlationId, [...existing, event.id]);
    }

    // Indexovat podle topic
    const topicEvents = this.byTopic.get(event.topic) ?? [];
    this.byTopic.set(event.topic, [...topicEvents, event.id]);

    // Auto-prune pokud překročíme max
    if (this.config.maxEvents && this.events.size > this.config.maxEvents) {
      this.pruneOldest(Math.floor(this.config.maxEvents * 0.1)); // Smaž 10%
    }
  }

  get(id: string): Event | undefined {
    return this.events.get(id);
  }

  /**
   * Najde eventy podle korelace.
   */
  getByCorrelation(correlationId: string): Event[] {
    const ids = this.byCorrelation.get(correlationId) ?? [];
    return ids
      .map(id => this.events.get(id))
      .filter((e): e is Event => e !== undefined);
  }

  /**
   * Najde eventy v časovém rozmezí.
   */
  getInTimeRange(topic: string, from: number, to: number): Event[] {
    const ids = this.byTopic.get(topic) ?? [];
    return ids
      .map(id => this.events.get(id))
      .filter((e): e is Event => e !== undefined && e.timestamp >= from && e.timestamp <= to);
  }

  /**
   * Počet eventů v časovém okně.
   */
  countInWindow(topic: string, windowMs: number): number {
    const now = Date.now();
    return this.getInTimeRange(topic, now - windowMs, now).length;
  }

  /**
   * Vrátí všechny eventy seřazené podle timestamp (nejstarší první).
   */
  getAllEvents(): Event[] {
    return [...this.events.values()].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Vrátí všechny eventy pro daný topic.
   */
  getByTopic(topic: string): Event[] {
    const ids = this.byTopic.get(topic) ?? [];
    return ids
      .map(id => this.events.get(id))
      .filter((e): e is Event => e !== undefined);
  }

  /**
   * Vrátí eventy odpovídající topic patternu (*, **).
   * @param pattern - Topic pattern s wildcard podporou (* = single segment, ** = any segments)
   */
  getByTopicPattern(pattern: string): Event[] {
    if (!pattern.includes('*')) {
      return this.getByTopic(pattern);
    }

    const regex = this.buildTopicRegex(pattern);
    const results: Event[] = [];

    for (const [topic, ids] of this.byTopic) {
      if (regex.test(topic)) {
        for (const id of ids) {
          const event = this.events.get(id);
          if (event) {
            results.push(event);
          }
        }
      }
    }

    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Builds a regex for topic pattern matching.
   */
  private buildTopicRegex(pattern: string): RegExp {
    const GLOBSTAR = '\x00GLOBSTAR\x00';
    const STAR = '\x00STAR\x00';

    const regexPattern = pattern
      .replace(/\*\*/g, GLOBSTAR)
      .replace(/\*/g, STAR)
      .replace(/\./g, '\\.')
      .replace(new RegExp(GLOBSTAR, 'g'), '.*')
      .replace(new RegExp(STAR, 'g'), '[^.]*');

    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Čištění starých eventů.
   */
  prune(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;

    for (const [id, event] of this.events) {
      if (event.timestamp < cutoff) {
        this.events.delete(id);
        pruned++;
      }
    }

    // TODO: Vyčistit i indexy

    return pruned;
  }

  /**
   * Smaže N nejstarších eventů.
   */
  private pruneOldest(count: number): void {
    const sorted = [...this.events.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < count && i < sorted.length; i++) {
      const entry = sorted[i];
      if (entry) {
        this.events.delete(entry[0]);
      }
    }
  }

  /**
   * Počet eventů.
   */
  get size(): number {
    return this.events.size;
  }

  /**
   * Vymaže všechny eventy.
   */
  clear(): void {
    this.events.clear();
    this.byCorrelation.clear();
    this.byTopic.clear();
  }
}
