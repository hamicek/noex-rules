import type { StorageAdapter, PersistedState } from '@hamicek/noex';
import { generateId } from '../utils/id-generator.js';
import {
  AUDIT_EVENT_CATEGORIES,
  type AuditCategory,
  type AuditConfig,
  type AuditEntry,
  type AuditEventType,
  type AuditQuery,
  type AuditQueryResult,
  type AuditStats,
  type AuditSubscriber,
} from './types.js';

const DEFAULT_MAX_MEMORY_ENTRIES = 50_000;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

const BUCKET_KEY_PREFIX = 'audit-log:';
const BUCKET_DURATION_MS = 3_600_000;

/** Options for recording an audit entry */
export interface AuditRecordOptions {
  id?: string;
  timestamp?: number;
  summary?: string;
  source?: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  durationMs?: number;
}

/** Internal persistence state for a time-bucketed group of audit entries */
interface AuditBucketState {
  entries: AuditEntry[];
}

/**
 * Formats a timestamp into an hourly time-bucketed storage key.
 *
 * Key format: `audit-log:YYYY-MM-DDTHH`
 */
function formatBucketKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${BUCKET_KEY_PREFIX}${y}-${m}-${day}T${h}`;
}

/**
 * Parses the start-of-hour UTC timestamp from a bucket key.
 * Returns null if the key format is invalid.
 */
function parseBucketTimestamp(key: string): number | null {
  const match = /^audit-log:(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  if (!match) return null;
  const [, year, month, day, hour] = match;
  if (!year || !month || !day || !hour) return null;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour));
}

/**
 * Generates a default human-readable summary from an audit event type.
 *
 * `'rule_registered'` → `'Rule registered'`
 */
function defaultSummary(type: AuditEventType): string {
  const words = type.split('_');
  const first = words[0];
  if (!first) return type;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
}

type IndexKey = 'correlationId' | 'ruleId' | 'source' | 'type' | 'category' | 'none';

/**
 * Persistent audit log service for compliance and production monitoring.
 *
 * Unlike TraceCollector (opt-in, volatile, debugging), AuditLogService
 * is always-on, persists entries to storage via time-bucketed batching,
 * and is focused on compliance and operational visibility.
 *
 * Features:
 * - In-memory ring buffer with multi-index for fast queries
 * - Batched async persistence via StorageAdapter (hourly time buckets)
 * - Real-time subscriber notifications
 * - Automatic retention-based cleanup
 */
export class AuditLogService {
  private readonly maxMemoryEntries: number;
  private readonly retentionMs: number;
  private readonly batchSize: number;
  private readonly adapter: StorageAdapter | null;

  private readonly entries: AuditEntry[] = [];
  private readonly entriesById = new Map<string, AuditEntry>();
  private readonly byCategory = new Map<AuditCategory, Set<string>>();
  private readonly byType = new Map<AuditEventType, Set<string>>();
  private readonly byRule = new Map<string, Set<string>>();
  private readonly bySource = new Map<string, Set<string>>();
  private readonly byCorrelation = new Map<string, Set<string>>();

  private readonly subscribers = new Set<AuditSubscriber>();

  private pendingEntries: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private totalEntries = 0;

  private constructor(adapter: StorageAdapter | null, config: AuditConfig = {}) {
    this.maxMemoryEntries = config.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES;
    this.retentionMs = config.retentionMs ?? DEFAULT_RETENTION_MS;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.adapter = adapter;

    const flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    if (flushIntervalMs > 0 && this.adapter) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, flushIntervalMs);
      this.flushTimer.unref();
    }
  }

  /**
   * Creates and starts an AuditLogService instance.
   *
   * @param adapter - Optional StorageAdapter for persistence. Without it, entries live only in memory.
   * @param config - Optional configuration overrides.
   */
  static async start(adapter?: StorageAdapter, config?: AuditConfig): Promise<AuditLogService> {
    return new AuditLogService(adapter ?? null, config);
  }

  /**
   * Records a new audit entry.
   *
   * The entry is synchronously added to the in-memory buffer and indexes.
   * If a storage adapter is configured, the entry is queued for batched
   * persistence (flushed periodically or when batchSize is reached).
   */
  record(
    type: AuditEventType,
    details: Record<string, unknown>,
    options: AuditRecordOptions = {},
  ): AuditEntry {
    const entry: AuditEntry = {
      id: options.id ?? generateId(),
      timestamp: options.timestamp ?? Date.now(),
      category: AUDIT_EVENT_CATEGORIES[type],
      type,
      summary: options.summary ?? defaultSummary(type),
      source: options.source ?? 'rule-engine',
      details,
      ...(options.ruleId !== undefined && { ruleId: options.ruleId }),
      ...(options.ruleName !== undefined && { ruleName: options.ruleName }),
      ...(options.correlationId !== undefined && { correlationId: options.correlationId }),
      ...(options.durationMs !== undefined && { durationMs: options.durationMs }),
    };

    this.addEntry(entry);
    this.totalEntries++;
    this.notifySubscribers(entry);

    if (this.adapter) {
      this.pendingEntries.push(entry);
      if (this.pendingEntries.length >= this.batchSize) {
        void this.flush();
      }
    }

    return entry;
  }

  /**
   * Queries audit entries with flexible filtering and pagination.
   *
   * Uses the most selective index for initial candidate selection, then
   * applies remaining filters. Results are returned in chronological order.
   */
  query(filter: AuditQuery): AuditQueryResult {
    const startTime = Date.now();

    const [candidates, usedIndex] = this.selectCandidates(filter);
    const filtered = this.applyRemainingFilters(candidates, filter, usedIndex);

    filtered.sort((a, b) => a.timestamp - b.timestamp);

    const totalCount = filtered.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    const page = filtered.slice(offset, offset + limit);

    return {
      entries: page,
      totalCount,
      queryTimeMs: Date.now() - startTime,
      hasMore: offset + limit < totalCount,
    };
  }

  /** Retrieves a single audit entry by ID, or undefined if not found. */
  getById(id: string): AuditEntry | undefined {
    return this.entriesById.get(id);
  }

  /**
   * Subscribes to new audit entries in real-time.
   * Returns an unsubscribe function.
   */
  subscribe(subscriber: AuditSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** Returns statistics about the audit log. */
  getStats(): AuditStats {
    const entriesByCategory: Record<AuditCategory, number> = {
      rule_management: 0,
      rule_execution: 0,
      fact_change: 0,
      event_emitted: 0,
      system: 0,
    };

    for (const [category, ids] of this.byCategory) {
      entriesByCategory[category] = ids.size;
    }

    return {
      totalEntries: this.totalEntries,
      memoryEntries: this.entries.length,
      oldestEntry: this.entries.length > 0 ? this.entries[0]!.timestamp : null,
      newestEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1]!.timestamp : null,
      entriesByCategory,
      subscribersCount: this.subscribers.size,
    };
  }

  /** Current number of entries held in memory. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Flushes pending entries to storage.
   *
   * Entries are grouped into hourly time buckets and merged with any
   * existing bucket data in the adapter. No-op if no adapter is
   * configured or no entries are pending.
   */
  async flush(): Promise<void> {
    if (!this.adapter || this.pendingEntries.length === 0) {
      return;
    }

    const toFlush = this.pendingEntries;
    this.pendingEntries = [];

    const buckets = new Map<string, AuditEntry[]>();
    for (const entry of toFlush) {
      const key = formatBucketKey(entry.timestamp);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }
      bucket.push(entry);
    }

    for (const [key, newEntries] of buckets) {
      const existing = await this.adapter.load<AuditBucketState>(key);
      const merged = existing ? [...existing.state.entries, ...newEntries] : newEntries;

      const persisted: PersistedState<AuditBucketState> = {
        state: { entries: merged },
        metadata: {
          persistedAt: Date.now(),
          serverId: 'audit-log',
          schemaVersion: 1,
        },
      };

      await this.adapter.save(key, persisted);
    }
  }

  /**
   * Removes entries older than the retention period from memory and storage.
   *
   * @param maxAgeMs - Override for retention duration (defaults to configured retentionMs).
   * @returns Number of entries removed from memory.
   */
  async cleanup(maxAgeMs?: number): Promise<number> {
    const cutoff = Date.now() - (maxAgeMs ?? this.retentionMs);
    let removed = 0;

    while (this.entries.length > 0 && this.entries[0]!.timestamp < cutoff) {
      const entry = this.entries.shift()!;
      this.unindexEntry(entry);
      this.entriesById.delete(entry.id);
      removed++;
    }

    if (this.adapter) {
      const keys = await this.adapter.listKeys(BUCKET_KEY_PREFIX);
      for (const key of keys) {
        const bucketStart = parseBucketTimestamp(key);
        if (bucketStart !== null && bucketStart + BUCKET_DURATION_MS < cutoff) {
          await this.adapter.delete(key);
        }
      }
    }

    return removed;
  }

  /**
   * Stops the service: flushes remaining entries and clears the flush timer.
   */
  async stop(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /** Clears all in-memory entries and indexes. */
  clear(): void {
    this.entries.length = 0;
    this.entriesById.clear();
    this.byCategory.clear();
    this.byType.clear();
    this.byRule.clear();
    this.bySource.clear();
    this.byCorrelation.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private addEntry(entry: AuditEntry): void {
    if (this.entries.length >= this.maxMemoryEntries) {
      this.evictOldest();
    }

    this.entries.push(entry);
    this.entriesById.set(entry.id, entry);
    this.indexEntry(entry);
  }

  private evictOldest(): void {
    const count = Math.max(1, Math.ceil(this.maxMemoryEntries * 0.1));
    const removed = this.entries.splice(0, count);

    for (const entry of removed) {
      this.unindexEntry(entry);
      this.entriesById.delete(entry.id);
    }
  }

  private indexEntry(entry: AuditEntry): void {
    this.addToIndex(this.byCategory, entry.category, entry.id);
    this.addToIndex(this.byType, entry.type, entry.id);
    this.addToIndex(this.bySource, entry.source, entry.id);

    if (entry.ruleId) {
      this.addToIndex(this.byRule, entry.ruleId, entry.id);
    }
    if (entry.correlationId) {
      this.addToIndex(this.byCorrelation, entry.correlationId, entry.id);
    }
  }

  private unindexEntry(entry: AuditEntry): void {
    this.removeFromIndex(this.byCategory, entry.category, entry.id);
    this.removeFromIndex(this.byType, entry.type, entry.id);
    this.removeFromIndex(this.bySource, entry.source, entry.id);

    if (entry.ruleId) {
      this.removeFromIndex(this.byRule, entry.ruleId, entry.id);
    }
    if (entry.correlationId) {
      this.removeFromIndex(this.byCorrelation, entry.correlationId, entry.id);
    }
  }

  private addToIndex<K>(index: Map<K, Set<string>>, key: K, id: string): void {
    let set = index.get(key);
    if (!set) {
      set = new Set();
      index.set(key, set);
    }
    set.add(id);
  }

  private removeFromIndex<K>(index: Map<K, Set<string>>, key: K, id: string): void {
    const set = index.get(key);
    if (set) {
      set.delete(id);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }

  private selectCandidates(filter: AuditQuery): [AuditEntry[], IndexKey] {
    if (filter.correlationId) {
      return [this.resolveEntries(this.byCorrelation.get(filter.correlationId)), 'correlationId'];
    }
    if (filter.ruleId) {
      return [this.resolveEntries(this.byRule.get(filter.ruleId)), 'ruleId'];
    }
    if (filter.source) {
      return [this.resolveEntries(this.bySource.get(filter.source)), 'source'];
    }
    if (filter.types && filter.types.length === 1 && filter.types[0]) {
      return [this.resolveEntries(this.byType.get(filter.types[0])), 'type'];
    }
    if (filter.category) {
      return [this.resolveEntries(this.byCategory.get(filter.category)), 'category'];
    }
    return [[...this.entries], 'none'];
  }

  private applyRemainingFilters(
    candidates: AuditEntry[],
    filter: AuditQuery,
    usedIndex: IndexKey,
  ): AuditEntry[] {
    let result = candidates;

    if (filter.category && usedIndex !== 'category') {
      result = result.filter(e => e.category === filter.category);
    }

    if (filter.types && !(filter.types.length === 1 && usedIndex === 'type')) {
      const typeSet = new Set(filter.types);
      result = result.filter(e => typeSet.has(e.type));
    }

    if (filter.ruleId && usedIndex !== 'ruleId') {
      result = result.filter(e => e.ruleId === filter.ruleId);
    }

    if (filter.source && usedIndex !== 'source') {
      result = result.filter(e => e.source === filter.source);
    }

    if (filter.correlationId && usedIndex !== 'correlationId') {
      result = result.filter(e => e.correlationId === filter.correlationId);
    }

    if (filter.from !== undefined) {
      result = result.filter(e => e.timestamp >= filter.from!);
    }

    if (filter.to !== undefined) {
      result = result.filter(e => e.timestamp <= filter.to!);
    }

    return result;
  }

  private resolveEntries(ids: Set<string> | undefined): AuditEntry[] {
    if (!ids) return [];

    const result: AuditEntry[] = [];
    for (const id of ids) {
      const entry = this.entriesById.get(id);
      if (entry) {
        result.push(entry);
      }
    }
    return result;
  }

  private notifySubscribers(entry: AuditEntry): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(entry);
      } catch {
        // Subscriber errors must not break the audit log
      }
    }
  }
}
