# Audit

Persistent audit log service for compliance and production monitoring. Unlike TraceCollector (opt-in, volatile, debugging), AuditLogService is always-on, persists entries to storage via time-bucketed batching, and is focused on compliance and operational visibility.

## Import

```typescript
import {
  AuditLogService,
  // Types
  AuditEntry,
  AuditQuery,
  AuditQueryResult,
  AuditConfig,
  AuditSubscriber,
  AuditStats,
  AuditCategory,
  AuditEventType,
  AuditRecordOptions,
  AUDIT_EVENT_CATEGORIES,
} from '@hamicek/noex-rules';

// StorageAdapter from the core noex package
import { StorageAdapter, SQLiteAdapter } from '@hamicek/noex';
```

---

## AuditLogService

In-memory ring buffer with multi-index for fast queries, combined with batched async persistence via StorageAdapter (hourly time buckets). Supports real-time subscriber notifications and automatic retention-based cleanup.

### Factory Method

```typescript
static async start(adapter?: StorageAdapter, config?: AuditConfig): Promise<AuditLogService>
```

Creates and starts an `AuditLogService` instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| adapter | `StorageAdapter` | no | Storage adapter for persistence. Without it, entries live only in memory |
| config | `AuditConfig` | no | Configuration overrides |

**Returns:** `Promise<AuditLogService>` — Initialized audit log service instance

**Example:**

```typescript
import { AuditLogService } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// With persistence
const adapter = new SQLiteAdapter({ filename: './audit.db' });
const auditLog = await AuditLogService.start(adapter, {
  maxMemoryEntries: 100_000,
  retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days
});

// In-memory only
const memoryAuditLog = await AuditLogService.start();
```

### record()

```typescript
record(
  type: AuditEventType,
  details: Record<string, unknown>,
  options?: AuditRecordOptions
): AuditEntry
```

Records a new audit entry. Synchronously adds to the in-memory buffer and indexes. If a storage adapter is configured, the entry is queued for batched persistence.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| type | `AuditEventType` | yes | Type of audit event |
| details | `Record<string, unknown>` | yes | Additional contextual data about the operation |
| options | `AuditRecordOptions` | no | Additional metadata for the entry |

**Returns:** `AuditEntry` — The created audit entry

**Example:**

```typescript
const entry = auditLog.record('rule_registered', {
  ruleId: 'temperature-alert',
  ruleName: 'Temperature Alert',
  priority: 100,
}, {
  ruleId: 'temperature-alert',
  ruleName: 'Temperature Alert',
  source: 'api',
});

console.log(`Recorded entry ${entry.id} at ${entry.timestamp}`);
```

### query()

```typescript
query(filter: AuditQuery): AuditQueryResult
```

Queries audit entries with flexible filtering and pagination. Uses the most selective index for initial candidate selection, then applies remaining filters. Results are returned in chronological order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filter | `AuditQuery` | yes | Query filter parameters |

**Returns:** `AuditQueryResult` — Paginated query result

**Example:**

```typescript
const result = auditLog.query({
  category: 'rule_execution',
  types: ['rule_executed', 'rule_failed'],
  from: Date.now() - 3600_000, // last hour
  limit: 50,
});

console.log(`Found ${result.entries.length} of ${result.totalCount} entries`);
console.log(`Query took ${result.queryTimeMs}ms`);
console.log(`Has more: ${result.hasMore}`);
```

### getById()

```typescript
getById(id: string): AuditEntry | undefined
```

Retrieves a single audit entry by ID.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | `string` | yes | Audit entry ID |

**Returns:** `AuditEntry | undefined` — The entry, or `undefined` if not found

**Example:**

```typescript
const entry = auditLog.getById('aud_abc123');
if (entry) {
  console.log(`Found entry: ${entry.summary}`);
}
```

### subscribe()

```typescript
subscribe(subscriber: AuditSubscriber): () => void
```

Subscribes to new audit entries in real-time. Returns an unsubscribe function.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| subscriber | `AuditSubscriber` | yes | Callback invoked for each new entry |

**Returns:** `() => void` — Unsubscribe function

**Example:**

```typescript
const unsubscribe = auditLog.subscribe((entry) => {
  if (entry.type === 'rule_failed') {
    console.error(`Rule failed: ${entry.ruleId} - ${entry.summary}`);
    // Send alert, log to external system, etc.
  }
});

// Later: stop listening
unsubscribe();
```

### getStats()

```typescript
getStats(): AuditStats
```

Returns statistics about the audit log.

**Returns:** `AuditStats` — Statistics object

**Example:**

```typescript
const stats = auditLog.getStats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`In memory: ${stats.memoryEntries}`);
console.log(`Subscribers: ${stats.subscribersCount}`);
console.log(`By category:`, stats.entriesByCategory);
```

### size

```typescript
get size(): number
```

Current number of entries held in memory.

**Example:**

```typescript
console.log(`Memory entries: ${auditLog.size}`);
```

### flush()

```typescript
async flush(): Promise<void>
```

Flushes pending entries to storage. Entries are grouped into hourly time buckets and merged with any existing bucket data in the adapter. No-op if no adapter is configured or no entries are pending.

**Example:**

```typescript
await auditLog.flush();
```

### cleanup()

```typescript
async cleanup(maxAgeMs?: number): Promise<number>
```

Removes entries older than the retention period from memory and storage.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| maxAgeMs | `number` | no | Override for retention duration (defaults to configured retentionMs) |

**Returns:** `number` — Number of entries removed from memory

**Example:**

```typescript
// Use configured retention
const removed = await auditLog.cleanup();

// Or override with custom retention
const removed7d = await auditLog.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days

console.log(`Cleaned up ${removed} old entries`);
```

### clear()

```typescript
clear(): void
```

Clears all in-memory entries and indexes. Does not affect persisted data.

**Example:**

```typescript
auditLog.clear();
```

### stop()

```typescript
async stop(): Promise<void>
```

Stops the service: flushes remaining entries and clears the flush timer.

**Example:**

```typescript
await auditLog.stop();
```

---

## AuditCategory

```typescript
type AuditCategory =
  | 'rule_management'
  | 'rule_execution'
  | 'fact_change'
  | 'event_emitted'
  | 'system';
```

High-level categories of auditable operations.

| Value | Description |
|-------|-------------|
| `'rule_management'` | Rule and group lifecycle operations (register, enable, disable, etc.) |
| `'rule_execution'` | Rule evaluation and execution events |
| `'fact_change'` | Fact store modifications |
| `'event_emitted'` | Events emitted by rules or the engine |
| `'system'` | Engine lifecycle and system-level operations |

---

## AuditEventType

```typescript
type AuditEventType =
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
  | 'hot_reload_failed'
  | 'baseline_registered'
  | 'baseline_recalculated'
  | 'baseline_anomaly_detected'
  | 'backward_query_started'
  | 'backward_query_completed';
```

Specific types of audit events.

| Event | Category | Description |
|-------|----------|-------------|
| `rule_registered` | rule_management | Rule was registered |
| `rule_unregistered` | rule_management | Rule was removed |
| `rule_enabled` | rule_management | Rule was enabled |
| `rule_disabled` | rule_management | Rule was disabled |
| `rule_rolled_back` | rule_management | Rule was restored to a previous version |
| `rule_executed` | rule_execution | Rule was executed successfully |
| `rule_skipped` | rule_execution | Rule evaluation was skipped |
| `rule_failed` | rule_execution | Rule execution failed |
| `group_created` | rule_management | Rule group was created |
| `group_updated` | rule_management | Rule group was updated |
| `group_deleted` | rule_management | Rule group was deleted |
| `group_enabled` | rule_management | Rule group was enabled |
| `group_disabled` | rule_management | Rule group was disabled |
| `fact_created` | fact_change | Fact was created |
| `fact_updated` | fact_change | Fact was updated |
| `fact_deleted` | fact_change | Fact was deleted |
| `event_emitted` | event_emitted | Event was emitted |
| `engine_started` | system | Engine was started |
| `engine_stopped` | system | Engine was stopped |
| `hot_reload_started` | system | Hot reload process started |
| `hot_reload_completed` | system | Hot reload completed successfully |
| `hot_reload_failed` | system | Hot reload failed |
| `baseline_registered` | system | Baseline metric was registered |
| `baseline_recalculated` | system | Baseline was recalculated |
| `baseline_anomaly_detected` | rule_execution | Anomaly was detected |
| `backward_query_started` | system | Backward chaining query started |
| `backward_query_completed` | system | Backward chaining query completed |

---

## AUDIT_EVENT_CATEGORIES

```typescript
const AUDIT_EVENT_CATEGORIES: Record<AuditEventType, AuditCategory>
```

Mapping from event type to its category. Used internally to automatically assign categories when recording entries.

**Example:**

```typescript
import { AUDIT_EVENT_CATEGORIES } from '@hamicek/noex-rules';

const category = AUDIT_EVENT_CATEGORIES['rule_executed']; // 'rule_execution'
```

---

## AuditEntry

```typescript
interface AuditEntry {
  id: string;
  timestamp: number;
  category: AuditCategory;
  type: AuditEventType;
  summary: string;
  source: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  details: Record<string, unknown>;
  durationMs?: number;
}
```

A single audit log entry.

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique identifier for this audit entry |
| timestamp | `number` | Unix timestamp in milliseconds when the event occurred |
| category | `AuditCategory` | High-level category of the operation |
| type | `AuditEventType` | Specific event type |
| summary | `string` | Human-readable summary of what happened |
| source | `string` | Source component that produced the event (e.g., `'rule-engine'`, `'api'`) |
| ruleId | `string` | ID of the rule involved, if applicable |
| ruleName | `string` | Human-readable name of the rule involved |
| correlationId | `string` | Correlation ID linking related operations |
| details | `Record<string, unknown>` | Additional contextual data about the operation |
| durationMs | `number` | Duration of the operation in milliseconds, if applicable |

---

## AuditRecordOptions

```typescript
interface AuditRecordOptions {
  id?: string;
  timestamp?: number;
  summary?: string;
  source?: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  durationMs?: number;
}
```

Options for `record()`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| id | `string` | auto-generated | Custom ID for the entry |
| timestamp | `number` | `Date.now()` | Custom timestamp |
| summary | `string` | auto-generated | Human-readable summary |
| source | `string` | `'rule-engine'` | Source component identifier |
| ruleId | `string` | — | ID of the related rule |
| ruleName | `string` | — | Name of the related rule |
| correlationId | `string` | — | Correlation ID for linking operations |
| durationMs | `number` | — | Duration of the operation |

---

## AuditQuery

```typescript
interface AuditQuery {
  category?: AuditCategory;
  types?: AuditEventType[];
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}
```

Filter options for querying audit entries.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| category | `AuditCategory` | — | Filter by category |
| types | `AuditEventType[]` | — | Filter by event types |
| ruleId | `string` | — | Filter by rule ID |
| source | `string` | — | Filter by source component |
| correlationId | `string` | — | Filter by correlation ID |
| from | `number` | — | Filter entries after this timestamp (inclusive) |
| to | `number` | — | Filter entries before this timestamp (inclusive) |
| limit | `number` | `100` | Maximum number of entries to return |
| offset | `number` | `0` | Number of entries to skip for pagination |

---

## AuditQueryResult

```typescript
interface AuditQueryResult {
  entries: AuditEntry[];
  totalCount: number;
  queryTimeMs: number;
  hasMore: boolean;
}
```

Result of an audit query with pagination metadata.

| Field | Type | Description |
|-------|------|-------------|
| entries | `AuditEntry[]` | Matching audit entries |
| totalCount | `number` | Total count of entries matching the filter (before pagination) |
| queryTimeMs | `number` | Time spent executing the query in milliseconds |
| hasMore | `boolean` | Whether more entries exist beyond the current page |

---

## AuditConfig

```typescript
interface AuditConfig {
  enabled?: boolean;
  maxMemoryEntries?: number;
  retentionMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}
```

Configuration for AuditLogService.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `true` | Whether audit logging is enabled |
| maxMemoryEntries | `number` | `50000` | Maximum entries kept in the in-memory buffer |
| retentionMs | `number` | 30 days | How long to retain entries in milliseconds |
| batchSize | `number` | `100` | Number of entries per persistence batch |
| flushIntervalMs | `number` | `5000` | Interval between flush cycles in milliseconds |

**Example:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  audit: {
    enabled: true,
    maxMemoryEntries: 100_000,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    batchSize: 200,
    flushIntervalMs: 10_000,
  },
});
```

---

## AuditStats

```typescript
interface AuditStats {
  totalEntries: number;
  memoryEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  entriesByCategory: Record<AuditCategory, number>;
  subscribersCount: number;
}
```

Statistics about the audit log service.

| Field | Type | Description |
|-------|------|-------------|
| totalEntries | `number` | Total number of entries recorded since start |
| memoryEntries | `number` | Number of entries currently held in memory |
| oldestEntry | `number \| null` | Timestamp of the oldest entry in memory, or `null` if empty |
| newestEntry | `number \| null` | Timestamp of the newest entry in memory, or `null` if empty |
| entriesByCategory | `Record<AuditCategory, number>` | Breakdown of entries by category |
| subscribersCount | `number` | Number of active real-time subscribers |

---

## AuditSubscriber

```typescript
type AuditSubscriber = (entry: AuditEntry) => void;
```

Callback type for real-time audit entry subscriptions.

**Example:**

```typescript
const subscriber: AuditSubscriber = (entry) => {
  console.log(`[${entry.category}] ${entry.type}: ${entry.summary}`);
};
```

---

## Complete Example

```typescript
import { RuleEngine, AuditLogService } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// Option 1: Use AuditLogService directly
const adapter = new SQLiteAdapter({ filename: './audit.db' });
const auditLog = await AuditLogService.start(adapter, {
  maxMemoryEntries: 100_000,
  retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
});

// Record custom audit events
auditLog.record('rule_registered', {
  ruleId: 'temp-alert',
  ruleName: 'Temperature Alert',
  triggersOn: 'sensor.temperature',
}, {
  ruleId: 'temp-alert',
  ruleName: 'Temperature Alert',
  source: 'api',
});

// Subscribe to real-time events
const unsubscribe = auditLog.subscribe((entry) => {
  if (entry.category === 'rule_execution' && entry.type === 'rule_failed') {
    console.error(`ALERT: Rule ${entry.ruleId} failed - ${entry.summary}`);
  }
});

// Query audit history
const result = auditLog.query({
  category: 'rule_management',
  from: Date.now() - 24 * 60 * 60 * 1000, // last 24 hours
  limit: 100,
});

for (const entry of result.entries) {
  console.log(`${new Date(entry.timestamp).toISOString()} - ${entry.summary}`);
}

// Get statistics
const stats = auditLog.getStats();
console.log(`Total entries: ${stats.totalEntries}`);

// Cleanup
unsubscribe();
await auditLog.stop();

// Option 2: Configure audit in RuleEngine
const engine = await RuleEngine.start({
  audit: {
    enabled: true,
    maxMemoryEntries: 50_000,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
  },
});

// Engine automatically records audit events for all operations
// Access audit log via engine
const engineAuditLog = engine.getAuditLog();
const recentEvents = engineAuditLog?.query({
  types: ['rule_executed', 'rule_failed'],
  limit: 10,
});
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Uses audit logging for automatic event recording
- [Versioning](./19-versioning.md) — Version history for rules
- [Observability](./21-observability.md) — Metrics and tracing
- [Configuration](./30-configuration.md) — Full configuration reference
