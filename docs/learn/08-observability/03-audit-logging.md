# Audit Logging

Debugging and profiling are development tools. In production, you need something else: a permanent, queryable record of everything the engine does. The **AuditLogService** provides always-on logging with persistent storage, covering 26 event types across 5 categories — from rule registration and execution to fact changes and system lifecycle events.

## What You'll Learn

- How `AuditLogService` differs from `TraceCollector`
- Configuring audit persistence with `AuditPersistenceConfig`
- All 26 audit event types and 5 categories
- Querying audit entries with filtering and pagination
- Real-time streaming via SSE
- Retention policies and cleanup

## Audit vs Tracing

Both audit logging and tracing record engine activity, but they serve different purposes:

| Aspect | TraceCollector | AuditLogService |
|--------|----------------|-----------------|
| **Purpose** | Development debugging | Production compliance |
| **Default state** | Disabled | Enabled |
| **Storage** | In-memory ring buffer | Persistent (disk/DB) |
| **Granularity** | Every evaluation step | Significant events only |
| **Retention** | Bounded by buffer size | Time-based (default: 30 days) |
| **Query model** | By correlation/rule/type | By category/type/rule/time + pagination |

Use tracing to debug rule behavior during development. Use audit logging to maintain a compliance trail in production.

## AuditPersistenceConfig

Configure audit logging by passing `audit` to `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/audit.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,                    // Required: storage backend
    retentionMs: 30 * 24 * 60 * 60 * 1000,  // 30 days (default)
    batchSize: 100,             // Entries per flush batch (default: 100)
    flushIntervalMs: 5_000,     // Flush to storage every 5s (default: 5,000)
    maxMemoryEntries: 50_000,   // In-memory ring buffer size (default: 50,000)
  },
});
```

### Without Persistence

If you don't provide an `audit` config, the audit service still runs with an in-memory buffer. You can query recent entries, but they won't survive restarts:

```typescript
// No adapter — in-memory only
const engine = await RuleEngine.start({});

// The audit service is still active with 50,000 entry buffer
const stats = engine.auditLog.getStats();
```

## Audit Event Types

The audit service records 26 event types organized into 5 categories:

### Rule Management (`rule_management`)

| Event Type | When |
|-----------|------|
| `rule_registered` | A rule is added to the engine |
| `rule_unregistered` | A rule is removed from the engine |
| `rule_enabled` | A rule is enabled |
| `rule_disabled` | A rule is disabled |
| `rule_rolled_back` | A rule version is rolled back |

### Rule Execution (`rule_execution`)

| Event Type | When |
|-----------|------|
| `rule_executed` | A rule's conditions passed and actions completed |
| `rule_skipped` | A rule's conditions did not pass |
| `rule_failed` | A rule's actions threw an error |

### Fact Changes (`fact_change`)

| Event Type | When |
|-----------|------|
| `fact_created` | A new fact is set (key didn't exist before) |
| `fact_updated` | An existing fact's value is changed |
| `fact_deleted` | A fact is removed |

### Event Emitted (`event_emitted`)

| Event Type | When |
|-----------|------|
| `event_emitted` | An event is emitted (user or action-generated) |

### System (`system`)

| Event Type | When |
|-----------|------|
| `engine_started` | The engine starts |
| `engine_stopped` | The engine stops |
| `group_created` | A rule group is created |
| `group_updated` | A rule group's metadata is updated |
| `group_deleted` | A rule group is deleted |
| `group_enabled` | A rule group is enabled |
| `group_disabled` | A rule group is disabled |
| `hot_reload_started` | A hot reload cycle begins |
| `hot_reload_completed` | A hot reload cycle succeeds |
| `hot_reload_failed` | A hot reload cycle fails |
| `baseline_registered` | A baseline metric is registered |
| `baseline_recalculated` | A baseline metric is recalculated |
| `baseline_anomaly_detected` | A baseline anomaly is detected |
| `backward_query_started` | A backward chaining query begins |
| `backward_query_completed` | A backward chaining query completes |

## Audit Entry Structure

Each audit entry contains:

```typescript
interface AuditEntry {
  id: string;                          // Unique entry ID
  timestamp: number;                   // When it occurred
  category: AuditCategory;            // One of the 5 categories
  type: AuditEventType;               // One of the 26 types
  summary: string;                     // Human-readable description
  source: string;                      // What component generated it
  ruleId?: string;                     // Associated rule (if applicable)
  ruleName?: string;                   // Human-readable rule name
  correlationId?: string;              // Links to trace data
  details: Record<string, unknown>;    // Type-specific payload
  durationMs?: number;                 // How long the operation took
}
```

## Querying Audit Entries

The audit service provides flexible querying with filtering and pagination:

```typescript
// Query recent rule executions
const result = engine.auditLog.query({
  category: 'rule_execution',
  limit: 50,
});

console.log(`Found ${result.totalCount} entries (showing ${result.entries.length})`);
console.log(`Has more: ${result.hasMore}`);
console.log(`Query time: ${result.queryTimeMs}ms`);

for (const entry of result.entries) {
  console.log(`[${entry.type}] ${entry.summary}`);
}
```

### Filter Options

```typescript
interface AuditQuery {
  category?: AuditCategory;       // Filter by category
  types?: AuditEventType[];       // Filter by specific event types
  ruleId?: string;                // Filter by rule ID
  source?: string;                // Filter by source component
  correlationId?: string;         // Filter by correlation ID
  from?: number;                  // Start timestamp
  to?: number;                    // End timestamp
  limit?: number;                 // Max entries to return (default: 100)
  offset?: number;                // Pagination offset
}
```

### Common Query Patterns

```typescript
// All changes to a specific rule
const ruleHistory = engine.auditLog.query({
  ruleId: 'fraud-check',
  types: ['rule_registered', 'rule_enabled', 'rule_disabled', 'rule_rolled_back'],
});

// All fact changes in the last hour
const factChanges = engine.auditLog.query({
  category: 'fact_change',
  from: Date.now() - 3600_000,
});

// Failed rule executions today
const failures = engine.auditLog.query({
  types: ['rule_failed'],
  from: new Date().setHours(0, 0, 0, 0),
});

// Paginate through all entries
let offset = 0;
const pageSize = 50;
let hasMore = true;

while (hasMore) {
  const page = engine.auditLog.query({ limit: pageSize, offset });
  for (const entry of page.entries) {
    // process entry
  }
  offset += pageSize;
  hasMore = page.hasMore;
}
```

### Get a Single Entry

```typescript
const entry = engine.auditLog.getById('audit-entry-123');
if (entry) {
  console.log(`${entry.type}: ${entry.summary}`);
  console.log('Details:', JSON.stringify(entry.details, null, 2));
}
```

## Real-Time Subscription

Subscribe to audit entries as they're recorded:

```typescript
const unsubscribe = engine.auditLog.subscribe((entry) => {
  if (entry.category === 'rule_execution' && entry.type === 'rule_failed') {
    console.error(`[AUDIT] Rule failed: ${entry.ruleName} — ${entry.summary}`);
  }
});

// Later
unsubscribe();
```

## Audit Statistics

Get an overview of the audit service state:

```typescript
const stats = engine.auditLog.getStats();

console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Memory entries: ${stats.memoryEntries}`);
console.log(`Oldest: ${stats.oldestEntry ? new Date(stats.oldestEntry).toISOString() : 'none'}`);
console.log(`Newest: ${stats.newestEntry ? new Date(stats.newestEntry).toISOString() : 'none'}`);
console.log(`Subscribers: ${stats.subscribersCount}`);

console.log('By category:');
for (const [category, count] of Object.entries(stats.entriesByCategory)) {
  console.log(`  ${category}: ${count}`);
}
```

## Persistence and Retention

### How Storage Works

The audit service uses time-bucketed persistence. Entries accumulate in memory and are flushed to storage periodically (default: every 5 seconds) in batches (default: 100 entries per batch). Storage keys are organized by hour:

```text
audit:2025-01-15T14  →  [entries from 14:00-14:59]
audit:2025-01-15T15  →  [entries from 15:00-15:59]
audit:2025-01-15T16  →  [entries from 16:00-16:59]
```

### Manual Flush

Force a flush of pending entries to storage:

```typescript
await engine.auditLog.flush();
```

### Retention Cleanup

Entries older than the retention period (default: 30 days) are removed during cleanup. Cleanup runs automatically, but you can trigger it manually:

```typescript
// Remove entries older than the configured retention
await engine.auditLog.cleanup();

// Or specify a custom max age
await engine.auditLog.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days
```

## Complete Example: Compliance Dashboard for Financial Rules

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/compliance.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days for financial compliance
    flushIntervalMs: 2_000,                  // Flush every 2 seconds
  },
});

// --- Transaction rules ---

engine.registerRule(
  Rule.create('large-transaction-flag')
    .name('Flag Large Transactions')
    .when(onEvent('transaction.completed'))
    .if(event('amount').gte(10_000))
    .then(emit('compliance.large_transaction', {
      transactionId: ref('event.transactionId'),
      amount: ref('event.amount'),
      userId: ref('event.userId'),
    }))
    .also(setFact(
      'user:${event.userId}:largeTransactionCount',
      '${(parseInt(fact.value || "0") + 1)}'
    ))
    .also(log('Large transaction flagged: $${event.amount} by user ${event.userId}'))
    .build()
);

engine.registerRule(
  Rule.create('suspicious-pattern')
    .name('Suspicious Activity Alert')
    .when(onEvent('transaction.completed'))
    .if(fact('user:${event.userId}:largeTransactionCount').gte(3))
    .then(emit('compliance.suspicious_activity', {
      userId: ref('event.userId'),
      largeTransactions: ref('fact.value'),
    }))
    .build()
);

// --- Simulate transactions ---

for (let i = 0; i < 20; i++) {
  await engine.emit('transaction.completed', {
    transactionId: `tx-${i}`,
    userId: 'u-42',
    amount: 5000 + Math.random() * 15000, // 5,000-20,000
  });
}

// --- Compliance queries ---

// 1. All rule management changes (who registered/changed rules?)
const ruleChanges = engine.auditLog.query({
  category: 'rule_management',
});
console.log(`Rule management events: ${ruleChanges.totalCount}`);

// 2. All rule executions for the flagging rule
const flagExecutions = engine.auditLog.query({
  ruleId: 'large-transaction-flag',
  types: ['rule_executed'],
});
console.log(`Large transaction flags: ${flagExecutions.totalCount}`);

// 3. Any rule failures?
const failures = engine.auditLog.query({
  types: ['rule_failed'],
});
console.log(`Rule failures: ${failures.totalCount}`);

// 4. Audit statistics
const stats = engine.auditLog.getStats();
console.log(`\nAudit overview:`);
console.log(`  Total entries: ${stats.totalEntries}`);
for (const [cat, count] of Object.entries(stats.entriesByCategory)) {
  if (count > 0) {
    console.log(`  ${cat}: ${count}`);
  }
}

// 5. Real-time monitoring
engine.auditLog.subscribe((entry) => {
  if (entry.type === 'rule_failed') {
    console.error(`[COMPLIANCE ALERT] Rule failure: ${entry.summary}`);
  }
});

// Ensure everything is flushed before stopping
await engine.auditLog.flush();
await engine.stop();
```

## REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/audit/entries` | Query audit entries (supports all filter params) |
| `GET` | `/audit/entries/:id` | Get a single audit entry |
| `GET` | `/audit/stats` | Get audit service statistics |
| `GET` | `/audit/stream` | SSE real-time stream of audit entries |
| `GET` | `/audit/stream/stats` | SSE stream statistics |
| `GET` | `/audit/export` | Export entries as JSON or CSV |
| `POST` | `/audit/cleanup` | Manual cleanup of old entries |

### SSE Stream Filters

The audit SSE stream at `/audit/stream` supports query parameter filters:

```
GET /audit/stream?categories=rule_execution&types=rule_failed&ruleIds=fraud-check
```

Available filter parameters:
- `categories` — comma-separated `AuditCategory` values
- `types` — comma-separated `AuditEventType` values
- `ruleIds` — comma-separated rule IDs
- `sources` — comma-separated source identifiers

## Exercise

Build an audit-based compliance report for an e-commerce rule engine:

1. Start an engine with audit persistence (SQLite, 60-day retention)
2. Register rules for:
   - Discount application on orders over $100
   - VIP tier upgrade when total spending exceeds $5,000
3. Create a rule group `pricing` and assign the discount rule to it
4. Simulate 50 orders with varying totals
5. Generate a compliance report that shows:
   - Total audit entries by category
   - All rule management events (rule registrations, group creation)
   - Total rule executions vs skips for each rule
   - Any rule failures

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, ref, event, fact } from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/ecommerce-audit.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,
    retentionMs: 60 * 24 * 60 * 60 * 1000, // 60 days
  },
});

// Create group
engine.createGroup({
  id: 'pricing',
  name: 'Pricing Rules',
  enabled: true,
});

// Discount rule
engine.registerRule(
  Rule.create('order-discount')
    .name('Order Discount')
    .group('pricing')
    .when(onEvent('order.created'))
    .if(event('total').gte(100))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.1,
    }))
    .build()
);

// VIP upgrade rule
engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP Upgrade')
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:totalSpent').gte(5000))
    .then(setFact('customer:${event.customerId}:tier', 'vip'))
    .build()
);

// Simulate orders
engine.setFact('customer:c-1:totalSpent', 4800);

for (let i = 0; i < 50; i++) {
  await engine.emit('order.created', {
    orderId: `ord-${i}`,
    customerId: 'c-1',
    total: 50 + Math.random() * 150, // 50-200
  });
}

// --- Compliance Report ---

console.log('=== E-Commerce Compliance Report ===\n');

// 1. Overview by category
const stats = engine.auditLog.getStats();
console.log('Entries by category:');
for (const [cat, count] of Object.entries(stats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

// 2. Rule management events
const mgmt = engine.auditLog.query({ category: 'rule_management' });
console.log(`\nRule management events (${mgmt.totalCount}):`);
for (const entry of mgmt.entries) {
  console.log(`  [${entry.type}] ${entry.summary}`);
}

// 3. System events (group creation, engine lifecycle)
const sys = engine.auditLog.query({ category: 'system' });
console.log(`\nSystem events (${sys.totalCount}):`);
for (const entry of sys.entries) {
  console.log(`  [${entry.type}] ${entry.summary}`);
}

// 4. Rule execution stats
for (const ruleId of ['order-discount', 'vip-upgrade']) {
  const executed = engine.auditLog.query({ ruleId, types: ['rule_executed'] });
  const skipped = engine.auditLog.query({ ruleId, types: ['rule_skipped'] });
  const failed = engine.auditLog.query({ ruleId, types: ['rule_failed'] });
  console.log(`\n${ruleId}: executed=${executed.totalCount}, skipped=${skipped.totalCount}, failed=${failed.totalCount}`);
}

// 5. Any failures?
const failures = engine.auditLog.query({ types: ['rule_failed'] });
console.log(`\nTotal rule failures: ${failures.totalCount}`);

await engine.auditLog.flush();
await engine.stop();
```

</details>

## Summary

- **`AuditLogService`** provides always-on, persistent logging of all significant engine events
- Unlike `TraceCollector`, audit logging is **enabled by default** and designed for **production compliance**
- Configure persistent storage via `audit` in `RuleEngine.start()` with a `StorageAdapter`
- **26 audit event types** across **5 categories**: rule management, rule execution, fact changes, events, and system
- Each entry includes `id`, `timestamp`, `category`, `type`, `summary`, `source`, and optional `ruleId`/`correlationId`
- Query entries with **flexible filtering** by category, type, rule, source, time range, and **pagination** via `limit`/`offset`
- **Subscribe** to real-time audit entries for immediate alerting on failures
- Storage uses **hourly time buckets** with configurable batch flush (default: every 5 seconds)
- **Retention** defaults to 30 days — entries are cleaned up automatically or via `cleanup()`
- All audit data is accessible through **REST API endpoints** and **SSE streaming**

---

Next: [Metrics and Tracing](./04-metrics.md)
