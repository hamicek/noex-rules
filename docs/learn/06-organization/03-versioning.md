# Rule Versioning

Rules change. A threshold gets adjusted, a condition is added, a broken rule needs to be rolled back to yesterday's version. Without version history, these changes are invisible — you can't answer "what changed?" or "who changed it?" or "can we undo this?". The versioning system in noex-rules automatically records a snapshot of every rule change, lets you diff any two versions, and supports one-command rollback.

## What You'll Learn

- How to enable and configure the versioning system
- What changes are tracked and when versions are created
- How to query version history with filtering and pagination
- How to diff two versions of a rule at the field level
- How to rollback a rule to a previous version

## Enabling Versioning

Versioning requires a `StorageAdapter` (from `@hamicek/noex`) for persisting version history. Enable it through the `versioning` config:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { MemoryAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new MemoryAdapter(),
    maxVersionsPerRule: 100,  // Keep last 100 versions per rule (default)
    maxAgeMs: 90 * 24 * 60 * 60 * 1000,  // Retain for 90 days (default)
  },
});
```

### VersioningConfig

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;        // Required: where to store version history
  maxVersionsPerRule?: number;    // Max versions per rule (default: 100)
  maxAgeMs?: number;              // Max age in ms (default: 90 days)
}
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `adapter` | — | Storage backend (`MemoryAdapter`, `FileAdapter`, etc.) |
| `maxVersionsPerRule` | `100` | Oldest versions are pruned when limit is exceeded |
| `maxAgeMs` | 90 days | Versions older than this are pruned |

## What Gets Tracked

Once versioning is enabled, the engine automatically records a version entry whenever a rule changes. No explicit calls needed — every rule mutation is captured:

| Operation | Change Type | When |
|-----------|-------------|------|
| `registerRule()` | `'registered'` | New rule created |
| `updateRule()` | `'updated'` | Rule properties changed |
| `enableRule()` | `'enabled'` | Rule activated |
| `disableRule()` | `'disabled'` | Rule deactivated |
| `unregisterRule()` | `'unregistered'` | Rule deleted |
| `rollbackRule()` | `'rolled_back'` | Rule restored from history |

### The Version Entry

Each version entry contains a full snapshot of the rule at that point in time:

```typescript
interface RuleVersionEntry {
  version: number;            // Sequential within this rule (1-based)
  ruleSnapshot: Rule;         // Complete rule state at this version
  timestamp: number;          // When this version was created
  changeType: RuleChangeType; // What triggered the version
  rolledBackFrom?: number;    // Previous global version (if rolled back)
  description?: string;       // Optional human-readable note
}
```

```text
  registerRule()     updateRule()      disableRule()     rollbackRule(v1)
       │                 │                 │                  │
       ▼                 ▼                 ▼                  ▼
  ┌──────────┐     ┌──────────┐     ┌──────────┐      ┌──────────┐
  │ version 1│     │ version 2│     │ version 3│      │ version 4│
  │ registered│    │ updated  │     │ disabled │      │ rolled_back│
  │ snapshot │     │ snapshot │     │ snapshot │      │ snapshot  │
  └──────────┘     └──────────┘     └──────────┘      └──────────┘
```

## Querying Version History

Use `getRuleVersions()` to query a rule's history with filtering and pagination:

```typescript
// Get recent history (default: last 50 versions, newest first)
const history = engine.getRuleVersions('fraud-velocity-check');

console.log(history.totalVersions);  // Total versions for this rule
console.log(history.hasMore);        // Whether more pages exist
console.log(history.entries.length); // Entries in this page

for (const entry of history.entries) {
  console.log(
    `v${entry.version} [${entry.changeType}] at ${new Date(entry.timestamp).toISOString()}`
  );
}
```

### Query Parameters

```typescript
interface RuleVersionQuery {
  ruleId: string;                   // Required
  limit?: number;                   // Max entries (default: 50)
  offset?: number;                  // Skip for pagination
  order?: 'asc' | 'desc';          // By version number (default: 'desc')
  fromVersion?: number;             // Min version (inclusive)
  toVersion?: number;               // Max version (inclusive)
  changeTypes?: RuleChangeType[];   // Filter by change type
  from?: number;                    // After timestamp (inclusive)
  to?: number;                      // Before timestamp (inclusive)
}
```

### Filtering Examples

```typescript
// Only updates — skip registration and enable/disable
const updates = engine.getRuleVersions('fraud-velocity-check', {
  changeTypes: ['updated'],
});

// Last 24 hours
const recent = engine.getRuleVersions('fraud-velocity-check', {
  from: Date.now() - 24 * 60 * 60 * 1000,
});

// Paginate through full history (oldest first)
const page1 = engine.getRuleVersions('fraud-velocity-check', {
  order: 'asc',
  limit: 10,
  offset: 0,
});
const page2 = engine.getRuleVersions('fraud-velocity-check', {
  order: 'asc',
  limit: 10,
  offset: 10,
});
```

## Getting a Specific Version

```typescript
const entry = engine.getRuleVersion('fraud-velocity-check', 3);
if (entry) {
  console.log(entry.changeType);              // 'updated'
  console.log(entry.ruleSnapshot.priority);   // 100
  console.log(entry.ruleSnapshot.conditions); // [...conditions at v3...]
}
```

## Comparing Versions (Diff)

`diffRuleVersions()` produces a field-level diff between any two versions of a rule:

```typescript
const diff = engine.diffRuleVersions('fraud-velocity-check', 1, 3);
if (diff) {
  console.log(`Comparing v${diff.fromVersion} → v${diff.toVersion}`);
  for (const change of diff.changes) {
    console.log(`  ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
  }
}
```

### The Diff Result

```typescript
interface RuleVersionDiff {
  ruleId: string;
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}

interface RuleFieldChange {
  field: string;       // e.g., 'name', 'priority', 'trigger.type'
  oldValue: unknown;   // Value in the older version
  newValue: unknown;   // Value in the newer version
}
```

### Diff Example Output

```typescript
// After changing priority from 50 to 100 and adding a tag:
const diff = engine.diffRuleVersions('my-rule', 1, 2);
// diff.changes:
// [
//   { field: 'priority', oldValue: 50, newValue: 100 },
//   { field: 'tags', oldValue: ['fraud'], newValue: ['fraud', 'critical'] },
// ]
```

## Rolling Back

`rollbackRule()` restores a rule to a previous version's state. The restored rule gets a **new global version number** — it doesn't rewrite history:

```typescript
// Current state: version 5 with a broken condition
// Roll back to version 3 (the last known good version)
const restored = engine.rollbackRule('fraud-velocity-check', 3);

console.log(restored.version);  // New global version (e.g., 42)
// The rule's state (conditions, actions, priority, etc.) matches version 3
```

### Rollback Semantics

```text
  Version History:
  v1: registered  (original)
  v2: updated     (added condition)
  v3: updated     (changed priority)
  v4: updated     (broken condition)      ← current
  v5: rolled_back (restored from v2)      ← after rollbackRule('rule', 2)
```

- The rollback creates a **new version entry** with `changeType: 'rolled_back'`
- The `rolledBackFrom` field records the version number before the rollback
- The rule snapshot at v5 matches v2's snapshot
- The rule gets a new global version number (different from v2)
- You can rollback a rollback — the history is always append-only

### Safety

```typescript
// Rollback requires versioning to be configured
// Throws: 'Rule versioning is not configured'
engine.rollbackRule('rule', 1);

// Throws if the version doesn't exist
// Throws: 'Version 99 not found for rule "fraud-velocity-check"'
engine.rollbackRule('fraud-velocity-check', 99);
```

## Complete Example: Rule Lifecycle with Versioning

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, ref, event } from '@hamicek/noex-rules/dsl';
import { MemoryAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new MemoryAdapter(),
    maxVersionsPerRule: 50,
  },
});

// v1: Register the initial rule
engine.registerRule(
  Rule.create('high-value-alert')
    .name('High-Value Transaction Alert')
    .priority(50)
    .tags('fraud', 'alerts')
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(10000))
    .then(emit('alert.high_value', {
      transactionId: ref('event.transactionId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// v2: Lower the threshold based on new fraud data
engine.updateRule('high-value-alert', {
  conditions: [{
    source: 'event',
    field: 'amount',
    operator: 'gte',
    value: 5000,  // Lowered from 10000
  }],
});

// v3: Add a critical tag
engine.updateRule('high-value-alert', {
  tags: ['fraud', 'alerts', 'critical'],
});

// v4: Accidentally break the rule (wrong operator)
engine.updateRule('high-value-alert', {
  conditions: [{
    source: 'event',
    field: 'amount',
    operator: 'lte',  // Bug: should be 'gte'
    value: 5000,
  }],
});

// --- Investigate the issue ---

// What changed?
const history = engine.getRuleVersions('high-value-alert');
for (const entry of history.entries) {
  console.log(`v${entry.version} [${entry.changeType}] at ${new Date(entry.timestamp).toISOString()}`);
}
// v4 [updated] at 2025-...
// v3 [updated] at 2025-...
// v2 [updated] at 2025-...
// v1 [registered] at 2025-...

// What changed between v3 (good) and v4 (broken)?
const diff = engine.diffRuleVersions('high-value-alert', 3, 4);
for (const change of diff!.changes) {
  console.log(`${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
}
// conditions: [...gte 5000...] → [...lte 5000...]

// --- Fix it ---

// Roll back to v3 (last known good version)
const restored = engine.rollbackRule('high-value-alert', 3);
console.log(restored.version);  // New global version

// Verify the fix
const current = engine.getRule('high-value-alert')!;
console.log(current.conditions[0].operator);  // 'gte' — fixed!

// Version history now shows the rollback
const afterRollback = engine.getRuleVersions('high-value-alert');
for (const entry of afterRollback.entries) {
  console.log(`v${entry.version} [${entry.changeType}]`);
}
// v5 [rolled_back]
// v4 [updated]
// v3 [updated]
// v2 [updated]
// v1 [registered]
```

## Storage and Retention

Version entries are stored using the configured `StorageAdapter`. The store maintains an in-memory cache for fast reads and flushes to the adapter periodically.

### Retention Policy

Two limits control how much history is kept:

- **`maxVersionsPerRule`** (default: 100) — When a rule exceeds this number of versions, the oldest entries are pruned.
- **`maxAgeMs`** (default: 90 days) — Entries older than this are pruned regardless of count.

Both limits are enforced during writes, keeping the store bounded.

### Versioning Statistics

```typescript
const store = engine.getVersionStore();
if (store) {
  const stats = store.getStats();
  console.log(stats.trackedRules);   // Number of rules with history
  console.log(stats.totalVersions);  // Total entries across all rules
  console.log(stats.dirtyRules);     // Rules with unsaved changes
  console.log(stats.oldestEntry);    // Timestamp of oldest entry
  console.log(stats.newestEntry);    // Timestamp of newest entry
}
```

## Exercise

You have a rule `rate-limiter` that was updated several times. Write code to:

1. Query only the `'updated'` versions, ordered oldest-first
2. Find the diff between the first and last `'updated'` versions
3. If the diff shows the `priority` field changed, rollback to the first `'updated'` version

<details>
<summary>Solution</summary>

```typescript
// 1. Query only 'updated' versions, oldest first
const updates = engine.getRuleVersions('rate-limiter', {
  changeTypes: ['updated'],
  order: 'asc',
});

if (updates.entries.length >= 2) {
  const firstUpdate = updates.entries[0];
  const lastUpdate = updates.entries[updates.entries.length - 1];

  // 2. Diff the first and last updated versions
  const diff = engine.diffRuleVersions(
    'rate-limiter',
    firstUpdate.version,
    lastUpdate.version,
  );

  if (diff) {
    // 3. Check if priority changed, rollback if so
    const priorityChanged = diff.changes.some(c => c.field === 'priority');

    if (priorityChanged) {
      const restored = engine.rollbackRule('rate-limiter', firstUpdate.version);
      console.log(
        `Rolled back to v${firstUpdate.version}, new version: ${restored.version}`
      );
    }
  }
}
```

Key points:
- `changeTypes: ['updated']` filters out registration, enable/disable, and rollback entries
- `order: 'asc'` gives oldest first, so `entries[0]` is the first update
- The diff's `changes` array lists only fields that differ between the two versions
- `rollbackRule()` creates a new version entry — it never rewrites history

</details>

## Summary

- Enable versioning by passing a `VersioningConfig` with a `StorageAdapter` to `RuleEngine.start()`
- Every rule mutation (`registerRule`, `updateRule`, `enableRule`, `disableRule`, `unregisterRule`, `rollbackRule`) automatically creates a version entry
- Each version entry contains the full rule snapshot, timestamp, and change type
- Query history with `getRuleVersions()` — supports filtering by change type, version range, timestamp range, and pagination
- Use `diffRuleVersions()` for field-level comparison between any two versions
- `rollbackRule()` restores a rule from a historical snapshot and creates a new version entry — history is append-only
- Retention is controlled by `maxVersionsPerRule` (default: 100) and `maxAgeMs` (default: 90 days)

---

Next: [Persisting Rules and Facts](../07-persistence/01-state-persistence.md)
