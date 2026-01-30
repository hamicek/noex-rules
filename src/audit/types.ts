/**
 * Audit log types for persistent compliance and production monitoring.
 *
 * Unlike TraceCollector (opt-in debugging, volatile, in-memory ring buffer),
 * audit log is always-on, persistently stored, and focused on compliance.
 */

/** Categories of auditable operations */
export type AuditCategory =
  | 'rule_management'
  | 'rule_execution'
  | 'fact_change'
  | 'event_emitted'
  | 'system';

/** Specific types of audit events */
export type AuditEventType =
  | 'rule_registered'
  | 'rule_unregistered'
  | 'rule_enabled'
  | 'rule_disabled'
  | 'rule_rolled_back'
  | 'rule_executed'
  | 'rule_skipped'
  | 'rule_failed'
  | 'group_created'
  | 'group_updated'
  | 'group_deleted'
  | 'group_enabled'
  | 'group_disabled'
  | 'fact_created'
  | 'fact_updated'
  | 'fact_deleted'
  | 'event_emitted'
  | 'engine_started'
  | 'engine_stopped'
  | 'hot_reload_started'
  | 'hot_reload_completed'
  | 'hot_reload_failed';

/** Mapping from event type to its category */
export const AUDIT_EVENT_CATEGORIES: Record<AuditEventType, AuditCategory> = {
  rule_registered: 'rule_management',
  rule_unregistered: 'rule_management',
  rule_enabled: 'rule_management',
  rule_disabled: 'rule_management',
  rule_rolled_back: 'rule_management',
  rule_executed: 'rule_execution',
  rule_skipped: 'rule_execution',
  rule_failed: 'rule_execution',
  group_created: 'rule_management',
  group_updated: 'rule_management',
  group_deleted: 'rule_management',
  group_enabled: 'rule_management',
  group_disabled: 'rule_management',
  fact_created: 'fact_change',
  fact_updated: 'fact_change',
  fact_deleted: 'fact_change',
  event_emitted: 'event_emitted',
  engine_started: 'system',
  engine_stopped: 'system',
  hot_reload_started: 'system',
  hot_reload_completed: 'system',
  hot_reload_failed: 'system',
};

/** A single audit log entry */
export interface AuditEntry {
  /** Unique identifier for this audit entry */
  id: string;

  /** Unix timestamp in milliseconds when the event occurred */
  timestamp: number;

  /** High-level category of the operation */
  category: AuditCategory;

  /** Specific event type */
  type: AuditEventType;

  /** Human-readable summary of what happened */
  summary: string;

  /** Source component that produced the event (e.g. 'rule-engine', 'api') */
  source: string;

  /** ID of the rule involved, if applicable */
  ruleId?: string;

  /** Human-readable name of the rule involved */
  ruleName?: string;

  /** Correlation ID linking related operations */
  correlationId?: string;

  /** Additional contextual data about the operation */
  details: Record<string, unknown>;

  /** Duration of the operation in milliseconds, if applicable */
  durationMs?: number;
}

/** Filter options for querying audit entries */
export interface AuditQuery {
  /** Filter by category */
  category?: AuditCategory;

  /** Filter by event types */
  types?: AuditEventType[];

  /** Filter by rule ID */
  ruleId?: string;

  /** Filter by source component */
  source?: string;

  /** Filter by correlation ID */
  correlationId?: string;

  /** Filter entries after this timestamp (inclusive) */
  from?: number;

  /** Filter entries before this timestamp (inclusive) */
  to?: number;

  /** Maximum number of entries to return (default: 100) */
  limit?: number;

  /** Number of entries to skip for pagination */
  offset?: number;
}

/** Result of an audit query with pagination metadata */
export interface AuditQueryResult {
  /** Matching audit entries */
  entries: AuditEntry[];

  /** Total count of entries matching the filter (before pagination) */
  totalCount: number;

  /** Time spent executing the query in milliseconds */
  queryTimeMs: number;

  /** Whether more entries exist beyond the current page */
  hasMore: boolean;
}

/** Configuration for AuditLogService */
export interface AuditConfig {
  /** Whether audit logging is enabled (default: true) */
  enabled?: boolean;

  /** Maximum entries kept in the in-memory buffer (default: 50000) */
  maxMemoryEntries?: number;

  /** How long to retain entries in milliseconds (default: 30 days) */
  retentionMs?: number;

  /** Number of entries per persistence batch (default: 100) */
  batchSize?: number;

  /** Interval between flush cycles in milliseconds (default: 5000) */
  flushIntervalMs?: number;
}

/** Callback type for real-time audit entry subscriptions */
export type AuditSubscriber = (entry: AuditEntry) => void;

/** Statistics about the audit log service */
export interface AuditStats {
  /** Total number of entries recorded since start */
  totalEntries: number;

  /** Number of entries currently held in memory */
  memoryEntries: number;

  /** Timestamp of the oldest entry in memory, or null if empty */
  oldestEntry: number | null;

  /** Timestamp of the newest entry in memory, or null if empty */
  newestEntry: number | null;

  /** Breakdown of entries by category */
  entriesByCategory: Record<AuditCategory, number>;

  /** Number of active real-time subscribers */
  subscribersCount: number;
}
