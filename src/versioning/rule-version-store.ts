import type { StorageAdapter, PersistedState } from '@hamicek/noex';
import type { Rule } from '../types/rule.js';
import type {
  RuleChangeType,
  RuleVersionEntry,
  RuleVersionQuery,
  RuleVersionQueryResult,
  RuleVersionDiff,
  RuleFieldChange,
  RecordVersionOptions,
  VersioningConfig,
  VersioningStats,
} from './types.js';

const DEFAULT_MAX_VERSIONS_PER_RULE = 100;
const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1_000; // 90 days
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

const STORAGE_KEY_PREFIX = 'rule-version:';

/** Persisted state shape for a single rule's version history */
interface RuleVersionBucketState {
  entries: RuleVersionEntry[];
}

/** Fields of Rule to compare in diff (shallow: primitives & arrays by value) */
const DIFF_FIELDS: ReadonlyArray<keyof Rule> = [
  'name',
  'description',
  'priority',
  'enabled',
  'tags',
  'group',
  'trigger',
  'conditions',
  'actions',
];

/**
 * In-memory cache + async-persisted storage for rule version history.
 *
 * Follows the same architectural pattern as `AuditLogService`:
 * - `recordVersion()` is **synchronous** — writes to cache, marks dirty, schedules flush
 * - Periodic flush batches dirty entries to the StorageAdapter
 * - One storage key per rule (`rule-version:{ruleId}`)
 * - Lazy loading from storage on first access per rule
 */
export class RuleVersionStore {
  private readonly adapter: StorageAdapter;
  private readonly maxVersionsPerRule: number;
  private readonly maxAgeMs: number;

  /** In-memory cache: ruleId → version entries (sorted oldest-first by version) */
  private readonly cache = new Map<string, RuleVersionEntry[]>();

  /** Rule IDs with unsaved changes */
  private readonly dirty = new Set<string>();

  /** Rules that have been loaded from storage */
  private readonly loaded = new Set<string>();

  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(config: VersioningConfig) {
    this.adapter = config.adapter;
    this.maxVersionsPerRule = config.maxVersionsPerRule ?? DEFAULT_MAX_VERSIONS_PER_RULE;
    this.maxAgeMs = config.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, DEFAULT_FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  /**
   * Creates and starts a RuleVersionStore instance.
   */
  static async start(config: VersioningConfig): Promise<RuleVersionStore> {
    return new RuleVersionStore(config);
  }

  /**
   * Records a new version snapshot for a rule.
   *
   * Synchronously writes to the in-memory cache and marks the rule as dirty
   * for the next flush cycle. Enforces retention limits after recording.
   */
  recordVersion(
    rule: Rule,
    changeType: RuleChangeType,
    options: RecordVersionOptions = {},
  ): RuleVersionEntry {
    const entries = this.getOrCreateEntries(rule.id);
    const lastVersion = entries.length > 0 ? entries[entries.length - 1]!.version : 0;

    const entry: RuleVersionEntry = {
      version: lastVersion + 1,
      ruleSnapshot: structuredClone(rule),
      timestamp: Date.now(),
      changeType,
      ...(options.rolledBackFrom !== undefined && { rolledBackFrom: options.rolledBackFrom }),
      ...(options.description !== undefined && { description: options.description }),
    };

    entries.push(entry);
    this.dirty.add(rule.id);
    this.trimVersions(rule.id, entries);

    return entry;
  }

  /**
   * Returns all version entries for a rule (oldest-first).
   */
  getVersions(ruleId: string): RuleVersionEntry[] {
    return [...this.getOrCreateEntries(ruleId)];
  }

  /**
   * Returns a specific version entry, or undefined if not found.
   */
  getVersion(ruleId: string, version: number): RuleVersionEntry | undefined {
    return this.getOrCreateEntries(ruleId).find(e => e.version === version);
  }

  /**
   * Returns the most recent version entry for a rule, or undefined if no history.
   */
  getLatestVersion(ruleId: string): RuleVersionEntry | undefined {
    const entries = this.getOrCreateEntries(ruleId);
    return entries.length > 0 ? entries[entries.length - 1] : undefined;
  }

  /**
   * Queries version history with filtering, ordering, and pagination.
   */
  query(params: RuleVersionQuery): RuleVersionQueryResult {
    const allEntries = this.getOrCreateEntries(params.ruleId);
    const totalVersions = allEntries.length;

    let filtered = this.applyFilters(allEntries, params);

    const order = params.order ?? 'desc';
    if (order === 'desc') {
      filtered = filtered.slice().reverse();
    }

    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    const page = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < filtered.length;

    return { entries: page, totalVersions, hasMore };
  }

  /**
   * Computes a field-level diff between two version snapshots.
   *
   * Returns undefined if either version is not found.
   */
  diff(ruleId: string, fromVersion: number, toVersion: number): RuleVersionDiff | undefined {
    const fromEntry = this.getVersion(ruleId, fromVersion);
    const toEntry = this.getVersion(ruleId, toVersion);
    if (!fromEntry || !toEntry) return undefined;

    const changes = diffSnapshots(fromEntry.ruleSnapshot, toEntry.ruleSnapshot);

    return {
      ruleId,
      fromVersion,
      toVersion,
      changes,
    };
  }

  /** Returns statistics about the version store. */
  getStats(): VersioningStats {
    let totalVersions = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entries of this.cache.values()) {
      totalVersions += entries.length;
      if (entries.length > 0) {
        const first = entries[0]!.timestamp;
        const last = entries[entries.length - 1]!.timestamp;
        if (oldestEntry === null || first < oldestEntry) oldestEntry = first;
        if (newestEntry === null || last > newestEntry) newestEntry = last;
      }
    }

    return {
      trackedRules: this.cache.size,
      totalVersions,
      dirtyRules: this.dirty.size,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Flushes all dirty rule version histories to the storage adapter.
   *
   * Each dirty rule is saved under its own key (`rule-version:{ruleId}`).
   * The dirty set is cleared immediately to prevent duplicate writes.
   */
  async flush(): Promise<void> {
    if (this.dirty.size === 0) return;

    const toFlush = [...this.dirty];
    this.dirty.clear();

    for (const ruleId of toFlush) {
      const entries = this.cache.get(ruleId);
      if (!entries || entries.length === 0) continue;

      const persisted: PersistedState<RuleVersionBucketState> = {
        state: { entries },
        metadata: {
          persistedAt: Date.now(),
          serverId: 'rule-version-store',
          schemaVersion: 1,
        },
      };

      await this.adapter.save(`${STORAGE_KEY_PREFIX}${ruleId}`, persisted);
    }
  }

  /**
   * Removes version entries older than the configured maxAgeMs from
   * both memory and storage.
   *
   * @returns Total number of entries removed across all rules.
   */
  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.maxAgeMs;
    let removed = 0;

    for (const [ruleId, entries] of this.cache) {
      const before = entries.length;
      const kept = entries.filter(e => e.timestamp >= cutoff);

      if (kept.length < before) {
        removed += before - kept.length;
        if (kept.length === 0) {
          this.cache.delete(ruleId);
          this.loaded.delete(ruleId);
          await this.adapter.delete(`${STORAGE_KEY_PREFIX}${ruleId}`);
        } else {
          this.cache.set(ruleId, kept);
          this.dirty.add(ruleId);
        }
      }
    }

    if (this.dirty.size > 0) {
      await this.flush();
    }

    return removed;
  }

  /**
   * Loads a rule's version history from the storage adapter into the cache.
   *
   * This is intended for preloading or restoring state on startup.
   * No-op if the rule is already loaded.
   */
  async loadRule(ruleId: string): Promise<void> {
    if (this.loaded.has(ruleId)) return;
    await this.loadFromStorage(ruleId);
  }

  /**
   * Stops the version store: flushes remaining dirty entries and clears the timer.
   */
  async stop(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private getOrCreateEntries(ruleId: string): RuleVersionEntry[] {
    let entries = this.cache.get(ruleId);
    if (!entries) {
      entries = [];
      this.cache.set(ruleId, entries);
    }
    return entries;
  }

  private async loadFromStorage(ruleId: string): Promise<RuleVersionEntry[]> {
    const key = `${STORAGE_KEY_PREFIX}${ruleId}`;
    const persisted = await this.adapter.load<RuleVersionBucketState>(key);
    const entries = persisted ? persisted.state.entries : [];
    this.cache.set(ruleId, entries);
    this.loaded.add(ruleId);
    return entries;
  }

  private trimVersions(ruleId: string, entries: RuleVersionEntry[]): void {
    // Trim by count
    if (entries.length > this.maxVersionsPerRule) {
      const excess = entries.length - this.maxVersionsPerRule;
      entries.splice(0, excess);
    }

    // Trim by age
    const cutoff = Date.now() - this.maxAgeMs;
    while (entries.length > 0 && entries[0]!.timestamp < cutoff) {
      entries.shift();
    }

    // If all entries were removed, clean up the cache entry
    if (entries.length === 0) {
      this.cache.delete(ruleId);
    }
  }

  private applyFilters(entries: RuleVersionEntry[], params: RuleVersionQuery): RuleVersionEntry[] {
    let result = entries;

    if (params.fromVersion !== undefined) {
      result = result.filter(e => e.version >= params.fromVersion!);
    }
    if (params.toVersion !== undefined) {
      result = result.filter(e => e.version <= params.toVersion!);
    }
    if (params.changeTypes && params.changeTypes.length > 0) {
      const allowed = new Set(params.changeTypes);
      result = result.filter(e => allowed.has(e.changeType));
    }
    if (params.from !== undefined) {
      result = result.filter(e => e.timestamp >= params.from!);
    }
    if (params.to !== undefined) {
      result = result.filter(e => e.timestamp <= params.to!);
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Diff utilities
// ---------------------------------------------------------------------------

/**
 * Compares two rule snapshots field-by-field.
 * Uses JSON serialization for deep comparison of complex fields.
 */
function diffSnapshots(from: Rule, to: Rule): RuleFieldChange[] {
  const changes: RuleFieldChange[] = [];

  for (const field of DIFF_FIELDS) {
    const oldValue = from[field];
    const newValue = to[field];

    if (!deepEqual(oldValue, newValue)) {
      changes.push({ field, oldValue, newValue });
    }
  }

  return changes;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined && b === undefined) return true;
  if (a === null && b === null) return true;
  if (a == null || b == null) return false;

  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  return JSON.stringify(a) === JSON.stringify(b);
}
