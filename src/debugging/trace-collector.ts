import { generateId } from '../utils/id-generator.js';
import type {
  DebugTraceEntry,
  TraceEntryType,
  TraceFilter,
  TraceSubscriber,
} from './types.js';

/** Configuration options for TraceCollector */
export interface TraceCollectorConfig {
  /** Maximum number of entries to keep in the ring buffer (default: 10000) */
  maxEntries?: number;

  /** Whether tracing is initially enabled (default: false) */
  enabled?: boolean;
}

/**
 * Collects and indexes debug trace entries from the rule engine.
 *
 * Uses a ring buffer to limit memory usage while maintaining efficient
 * lookup by correlation ID, rule ID, and entry type.
 */
export class TraceCollector {
  private readonly maxEntries: number;
  private enabled: boolean;

  private readonly entries: DebugTraceEntry[] = [];
  private readonly byCorrelation = new Map<string, Set<string>>();
  private readonly byRule = new Map<string, Set<string>>();
  private readonly byType = new Map<TraceEntryType, Set<string>>();
  private readonly entriesById = new Map<string, DebugTraceEntry>();

  private readonly subscribers = new Set<TraceSubscriber>();

  constructor(config: TraceCollectorConfig = {}) {
    this.maxEntries = config.maxEntries ?? 10_000;
    this.enabled = config.enabled ?? false;
  }

  /** Enable trace collection */
  enable(): void {
    this.enabled = true;
  }

  /** Disable trace collection */
  disable(): void {
    this.enabled = false;
  }

  /** Check if tracing is currently enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record a new trace entry.
   *
   * If tracing is disabled, this is a no-op.
   * Automatically generates ID and timestamp if not provided.
   */
  record(
    type: TraceEntryType,
    details: Record<string, unknown>,
    options: Partial<
      Pick<
        DebugTraceEntry,
        'id' | 'timestamp' | 'correlationId' | 'causationId' | 'ruleId' | 'ruleName' | 'durationMs'
      >
    > = {}
  ): DebugTraceEntry | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const entry: DebugTraceEntry = {
      id: options.id ?? generateId(),
      timestamp: options.timestamp ?? Date.now(),
      type,
      details,
      ...(options.correlationId && { correlationId: options.correlationId }),
      ...(options.causationId && { causationId: options.causationId }),
      ...(options.ruleId && { ruleId: options.ruleId }),
      ...(options.ruleName && { ruleName: options.ruleName }),
      ...(options.durationMs !== undefined && { durationMs: options.durationMs }),
    };

    this.addEntry(entry);
    this.notifySubscribers(entry);

    return entry;
  }

  /**
   * Get all trace entries for a given correlation ID.
   * Returns entries in chronological order.
   */
  getByCorrelation(correlationId: string): DebugTraceEntry[] {
    const entryIds = this.byCorrelation.get(correlationId);
    if (!entryIds) {
      return [];
    }

    return this.resolveEntries(entryIds);
  }

  /**
   * Get all trace entries for a given rule ID.
   * Returns entries in chronological order.
   */
  getByRule(ruleId: string): DebugTraceEntry[] {
    const entryIds = this.byRule.get(ruleId);
    if (!entryIds) {
      return [];
    }

    return this.resolveEntries(entryIds);
  }

  /**
   * Get all trace entries of a given type.
   * Returns entries in chronological order.
   */
  getByType(type: TraceEntryType): DebugTraceEntry[] {
    const entryIds = this.byType.get(type);
    if (!entryIds) {
      return [];
    }

    return this.resolveEntries(entryIds);
  }

  /**
   * Get the most recent trace entries.
   * Returns entries in reverse chronological order (newest first).
   */
  getRecent(limit = 100): DebugTraceEntry[] {
    const startIndex = Math.max(0, this.entries.length - limit);
    return this.entries.slice(startIndex).reverse();
  }

  /**
   * Query trace entries with flexible filtering.
   */
  query(filter: TraceFilter): DebugTraceEntry[] {
    let candidates: DebugTraceEntry[];

    // Start with the most selective filter
    if (filter.correlationId) {
      candidates = this.getByCorrelation(filter.correlationId);
    } else if (filter.ruleId) {
      candidates = this.getByRule(filter.ruleId);
    } else if (filter.types && filter.types.length === 1 && filter.types[0]) {
      candidates = this.getByType(filter.types[0]);
    } else {
      candidates = [...this.entries];
    }

    // Apply additional filters
    let result = candidates;

    if (filter.types && filter.types.length > 1) {
      const typeSet = new Set(filter.types);
      result = result.filter(e => typeSet.has(e.type));
    }

    if (filter.ruleId && !filter.correlationId) {
      // Already filtered by rule
    } else if (filter.ruleId) {
      result = result.filter(e => e.ruleId === filter.ruleId);
    }

    if (filter.fromTimestamp !== undefined) {
      result = result.filter(e => e.timestamp >= filter.fromTimestamp!);
    }

    if (filter.toTimestamp !== undefined) {
      result = result.filter(e => e.timestamp <= filter.toTimestamp!);
    }

    // Sort by timestamp ascending
    result.sort((a, b) => a.timestamp - b.timestamp);

    if (filter.limit !== undefined && result.length > filter.limit) {
      result = result.slice(-filter.limit);
    }

    return result;
  }

  /**
   * Subscribe to new trace entries in real-time.
   * Returns an unsubscribe function.
   */
  subscribe(subscriber: TraceSubscriber): () => void {
    this.subscribers.add(subscriber);

    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** Get the current number of stored entries */
  get size(): number {
    return this.entries.length;
  }

  /** Get statistics about the trace collector */
  getStats(): { entriesCount: number; maxEntries: number; subscribersCount: number } {
    return {
      entriesCount: this.entries.length,
      maxEntries: this.maxEntries,
      subscribersCount: this.subscribers.size
    };
  }

  /** Clear all stored entries and indexes */
  clear(): void {
    this.entries.length = 0;
    this.entriesById.clear();
    this.byCorrelation.clear();
    this.byRule.clear();
    this.byType.clear();
  }

  /**
   * Create a TraceCollector instance asynchronously.
   * Useful for consistent API with other components.
   */
  static async start(config?: TraceCollectorConfig): Promise<TraceCollector> {
    return new TraceCollector(config);
  }

  private addEntry(entry: DebugTraceEntry): void {
    // Enforce ring buffer limit
    if (this.entries.length >= this.maxEntries) {
      this.evictOldest();
    }

    this.entries.push(entry);
    this.entriesById.set(entry.id, entry);
    this.indexEntry(entry);
  }

  private evictOldest(): void {
    // Remove approximately 10% when limit is reached
    const toRemove = Math.max(1, Math.ceil(this.maxEntries * 0.1));

    for (let i = 0; i < toRemove && this.entries.length > 0; i++) {
      const removed = this.entries.shift()!;
      this.unindexEntry(removed);
      this.entriesById.delete(removed.id);
    }
  }

  private indexEntry(entry: DebugTraceEntry): void {
    // Index by correlation ID
    if (entry.correlationId) {
      let set = this.byCorrelation.get(entry.correlationId);
      if (!set) {
        set = new Set();
        this.byCorrelation.set(entry.correlationId, set);
      }
      set.add(entry.id);
    }

    // Index by rule ID
    if (entry.ruleId) {
      let set = this.byRule.get(entry.ruleId);
      if (!set) {
        set = new Set();
        this.byRule.set(entry.ruleId, set);
      }
      set.add(entry.id);
    }

    // Index by type
    let typeSet = this.byType.get(entry.type);
    if (!typeSet) {
      typeSet = new Set();
      this.byType.set(entry.type, typeSet);
    }
    typeSet.add(entry.id);
  }

  private unindexEntry(entry: DebugTraceEntry): void {
    // Remove from correlation index
    if (entry.correlationId) {
      const set = this.byCorrelation.get(entry.correlationId);
      if (set) {
        set.delete(entry.id);
        if (set.size === 0) {
          this.byCorrelation.delete(entry.correlationId);
        }
      }
    }

    // Remove from rule index
    if (entry.ruleId) {
      const set = this.byRule.get(entry.ruleId);
      if (set) {
        set.delete(entry.id);
        if (set.size === 0) {
          this.byRule.delete(entry.ruleId);
        }
      }
    }

    // Remove from type index
    const typeSet = this.byType.get(entry.type);
    if (typeSet) {
      typeSet.delete(entry.id);
      if (typeSet.size === 0) {
        this.byType.delete(entry.type);
      }
    }
  }

  private resolveEntries(entryIds: Set<string>): DebugTraceEntry[] {
    const result: DebugTraceEntry[] = [];

    for (const id of entryIds) {
      const entry = this.entriesById.get(id);
      if (entry) {
        result.push(entry);
      }
    }

    // Sort by timestamp ascending
    result.sort((a, b) => a.timestamp - b.timestamp);

    return result;
  }

  private notifySubscribers(entry: DebugTraceEntry): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(entry);
      } catch {
        // Ignore subscriber errors to prevent breaking the collector
      }
    }
  }
}
