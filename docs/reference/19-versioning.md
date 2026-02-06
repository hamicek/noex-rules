# Versioning

Rule version history tracking with diff capabilities and rollback support. Records snapshots of rules whenever they change, enabling audit trails and restoration to previous states.

## Import

```typescript
import {
  RuleVersionStore,
  // Types
  RuleVersionEntry,
  RuleVersionQuery,
  RuleVersionQueryResult,
  RuleVersionDiff,
  RuleFieldChange,
  RuleChangeType,
  RecordVersionOptions,
  VersioningConfig,
  VersioningStats,
} from '@hamicek/noex-rules';

// StorageAdapter from the core noex package
import { StorageAdapter, SQLiteAdapter } from '@hamicek/noex';
```

---

## RuleVersionStore

In-memory cache with async-persisted storage for rule version history. Uses a write-behind pattern: `recordVersion()` is synchronous (writes to cache), and periodic flushes batch dirty entries to the storage adapter.

### Factory Method

```typescript
static async start(config: VersioningConfig): Promise<RuleVersionStore>
```

Creates and starts a `RuleVersionStore` instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `VersioningConfig` | yes | Configuration with storage adapter and retention settings |

**Returns:** `Promise<RuleVersionStore>` — Initialized version store instance

**Example:**

```typescript
import { RuleVersionStore } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = new SQLiteAdapter({ filename: './versions.db' });
const versionStore = await RuleVersionStore.start({
  adapter,
  maxVersionsPerRule: 50,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
});
```

### recordVersion()

```typescript
recordVersion(
  rule: Rule,
  changeType: RuleChangeType,
  options?: RecordVersionOptions
): RuleVersionEntry
```

Records a new version snapshot for a rule. Synchronous — writes to cache and marks the rule as dirty for the next flush cycle. Automatically enforces retention limits.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| rule | `Rule` | yes | The rule to snapshot |
| changeType | `RuleChangeType` | yes | Type of change that triggered this version |
| options | `RecordVersionOptions` | no | Additional metadata for the version entry |

**Returns:** `RuleVersionEntry` — The created version entry

**Example:**

```typescript
const entry = versionStore.recordVersion(rule, 'updated', {
  description: 'Increased priority for critical alerts',
});

console.log(`Recorded version ${entry.version} at ${entry.timestamp}`);
```

### getVersions()

```typescript
getVersions(ruleId: string): RuleVersionEntry[]
```

Returns all version entries for a rule, sorted oldest-first by version number.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule ID to get version history for |

**Returns:** `RuleVersionEntry[]` — Array of version entries (empty if no history)

**Example:**

```typescript
const versions = versionStore.getVersions('rule-123');
console.log(`Rule has ${versions.length} versions`);
```

### getVersion()

```typescript
getVersion(ruleId: string, version: number): RuleVersionEntry | undefined
```

Returns a specific version entry by version number.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule ID |
| version | `number` | yes | Version number (1-based) |

**Returns:** `RuleVersionEntry | undefined` — The version entry, or `undefined` if not found

**Example:**

```typescript
const v2 = versionStore.getVersion('rule-123', 2);
if (v2) {
  console.log(`Version 2 was a ${v2.changeType} at ${new Date(v2.timestamp)}`);
}
```

### getLatestVersion()

```typescript
getLatestVersion(ruleId: string): RuleVersionEntry | undefined
```

Returns the most recent version entry for a rule.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule ID |

**Returns:** `RuleVersionEntry | undefined` — The latest version entry, or `undefined` if no history

**Example:**

```typescript
const latest = versionStore.getLatestVersion('rule-123');
if (latest) {
  console.log(`Current version: ${latest.version}`);
}
```

### query()

```typescript
query(params: RuleVersionQuery): RuleVersionQueryResult
```

Queries version history with filtering, ordering, and pagination.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params | `RuleVersionQuery` | yes | Query parameters |

**Returns:** `RuleVersionQueryResult` — Paginated query result

**Example:**

```typescript
const result = versionStore.query({
  ruleId: 'rule-123',
  changeTypes: ['updated', 'enabled', 'disabled'],
  order: 'desc',
  limit: 10,
});

console.log(`Found ${result.entries.length} of ${result.totalVersions} versions`);
console.log(`Has more: ${result.hasMore}`);
```

### diff()

```typescript
diff(ruleId: string, fromVersion: number, toVersion: number): RuleVersionDiff | undefined
```

Computes a field-level diff between two version snapshots.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule ID |
| fromVersion | `number` | yes | Version number of the older snapshot |
| toVersion | `number` | yes | Version number of the newer snapshot |

**Returns:** `RuleVersionDiff | undefined` — Diff result, or `undefined` if either version not found

**Example:**

```typescript
const diff = versionStore.diff('rule-123', 1, 3);
if (diff) {
  for (const change of diff.changes) {
    console.log(`${change.field}: ${change.oldValue} -> ${change.newValue}`);
  }
}
```

### getStats()

```typescript
getStats(): VersioningStats
```

Returns statistics about the version store.

**Returns:** `VersioningStats` — Statistics object

**Example:**

```typescript
const stats = versionStore.getStats();
console.log(`Tracking ${stats.trackedRules} rules with ${stats.totalVersions} total versions`);
console.log(`${stats.dirtyRules} rules pending flush`);
```

### flush()

```typescript
async flush(): Promise<void>
```

Flushes all dirty rule version histories to the storage adapter. Each rule is saved under its own key (`rule-version:{ruleId}`).

**Example:**

```typescript
await versionStore.flush();
```

### cleanup()

```typescript
async cleanup(): Promise<number>
```

Removes version entries older than the configured `maxAgeMs` from both memory and storage.

**Returns:** `number` — Total number of entries removed across all rules

**Example:**

```typescript
const removed = await versionStore.cleanup();
console.log(`Cleaned up ${removed} old version entries`);
```

### loadRule()

```typescript
async loadRule(ruleId: string): Promise<void>
```

Loads a rule's version history from storage into the cache. Intended for preloading or restoring state on startup. No-op if already loaded.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule ID to load |

**Example:**

```typescript
await versionStore.loadRule('rule-123');
const versions = versionStore.getVersions('rule-123');
```

### stop()

```typescript
async stop(): Promise<void>
```

Stops the version store: flushes remaining dirty entries and clears the periodic flush timer.

**Example:**

```typescript
await versionStore.stop();
```

---

## RuleChangeType

```typescript
type RuleChangeType =
  | 'registered'
  | 'updated'
  | 'enabled'
  | 'disabled'
  | 'unregistered'
  | 'rolled_back';
```

Type of change that created a version entry.

| Value | Description |
|-------|-------------|
| `'registered'` | Rule was initially registered |
| `'updated'` | Rule definition was modified |
| `'enabled'` | Rule was enabled |
| `'disabled'` | Rule was disabled |
| `'unregistered'` | Rule was removed |
| `'rolled_back'` | Rule was restored to a previous version |

---

## RuleVersionEntry

```typescript
interface RuleVersionEntry {
  version: number;
  ruleSnapshot: Rule;
  timestamp: number;
  changeType: RuleChangeType;
  rolledBackFrom?: number;
  description?: string;
}
```

A single version snapshot of a rule.

| Field | Type | Description |
|-------|------|-------------|
| version | `number` | Sequential version number (1-based) |
| ruleSnapshot | `Rule` | Full snapshot of the rule at this version |
| timestamp | `number` | Unix timestamp when this version was created |
| changeType | `RuleChangeType` | Type of change that created this version |
| rolledBackFrom | `number` | If `changeType` is `'rolled_back'`, the version before rollback |
| description | `string` | Optional human-readable description of the change |

---

## RecordVersionOptions

```typescript
interface RecordVersionOptions {
  rolledBackFrom?: number;
  description?: string;
}
```

Options for `recordVersion()`.

| Field | Type | Description |
|-------|------|-------------|
| rolledBackFrom | `number` | If recording a rollback, the version before rollback |
| description | `string` | Human-readable description of the change |

---

## RuleVersionQuery

```typescript
interface RuleVersionQuery {
  ruleId: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  fromVersion?: number;
  toVersion?: number;
  changeTypes?: RuleChangeType[];
  from?: number;
  to?: number;
}
```

Query parameters for version history.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| ruleId | `string` | — | Rule ID to query versions for |
| limit | `number` | `50` | Maximum number of entries to return |
| offset | `number` | `0` | Number of entries to skip for pagination |
| order | `'asc' \| 'desc'` | `'desc'` | Sort order by version number |
| fromVersion | `number` | — | Filter: minimum version number (inclusive) |
| toVersion | `number` | — | Filter: maximum version number (inclusive) |
| changeTypes | `RuleChangeType[]` | — | Filter: only include specific change types |
| from | `number` | — | Filter: entries created after this timestamp (inclusive) |
| to | `number` | — | Filter: entries created before this timestamp (inclusive) |

---

## RuleVersionQueryResult

```typescript
interface RuleVersionQueryResult {
  entries: RuleVersionEntry[];
  totalVersions: number;
  hasMore: boolean;
}
```

Result of a version history query.

| Field | Type | Description |
|-------|------|-------------|
| entries | `RuleVersionEntry[]` | Matching version entries |
| totalVersions | `number` | Total number of versions for this rule (before filtering) |
| hasMore | `boolean` | Whether more entries exist beyond the current page |

---

## RuleVersionDiff

```typescript
interface RuleVersionDiff {
  ruleId: string;
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}
```

Diff result comparing two versions of a rule.

| Field | Type | Description |
|-------|------|-------------|
| ruleId | `string` | Rule ID being compared |
| fromVersion | `number` | Version number of the older snapshot |
| toVersion | `number` | Version number of the newer snapshot |
| changes | `RuleFieldChange[]` | List of field-level changes |

---

## RuleFieldChange

```typescript
interface RuleFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}
```

A single field-level change between two versions.

| Field | Type | Description |
|-------|------|-------------|
| field | `string` | Name of the changed field (e.g., `'name'`, `'priority'`, `'trigger'`) |
| oldValue | `unknown` | Value in the older version |
| newValue | `unknown` | Value in the newer version |

**Compared fields:** `name`, `description`, `priority`, `enabled`, `tags`, `group`, `trigger`, `conditions`, `actions`

---

## VersioningConfig

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;
  maxVersionsPerRule?: number;
  maxAgeMs?: number;
}
```

Configuration for rule versioning.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter for persisting version history |
| maxVersionsPerRule | `number` | `100` | Maximum number of versions to keep per rule |
| maxAgeMs | `number` | 90 days | Maximum age of version entries in milliseconds |

**Example:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new SQLiteAdapter({ filename: './data/versions.db' }),
    maxVersionsPerRule: 50,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});
```

---

## VersioningStats

```typescript
interface VersioningStats {
  trackedRules: number;
  totalVersions: number;
  dirtyRules: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}
```

Statistics about the versioning service.

| Field | Type | Description |
|-------|------|-------------|
| trackedRules | `number` | Number of rules that have version history |
| totalVersions | `number` | Total number of version entries across all rules |
| dirtyRules | `number` | Number of rules with unsaved changes |
| oldestEntry | `number \| null` | Timestamp of the oldest version entry, or `null` if empty |
| newestEntry | `number \| null` | Timestamp of the newest version entry, or `null` if empty |

---

## Complete Example

```typescript
import { RuleEngine, RuleVersionStore, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// Option 1: Use RuleVersionStore directly
const adapter = new SQLiteAdapter({ filename: './versions.db' });
const versionStore = await RuleVersionStore.start({ adapter });

// Record a version when rule changes
versionStore.recordVersion(rule, 'updated', {
  description: 'Changed threshold from 100 to 150',
});

// Query version history
const result = versionStore.query({
  ruleId: rule.id,
  order: 'desc',
  limit: 5,
});

// View changes between versions
const diff = versionStore.diff(rule.id, 1, 3);
if (diff) {
  for (const change of diff.changes) {
    console.log(`${change.field}: ${JSON.stringify(change.oldValue)} -> ${JSON.stringify(change.newValue)}`);
  }
}

// Option 2: Configure versioning in RuleEngine
const engine = await RuleEngine.start({
  versioning: {
    adapter: new SQLiteAdapter({ filename: './data/versions.db' }),
    maxVersionsPerRule: 100,
  },
});

// Engine automatically records versions on rule changes
// Access version store via engine
const store = engine.getVersionStore();
const history = store?.getVersions('my-rule');
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Uses versioning for automatic version tracking
- [Persistence](./18-persistence.md) — Persistence for rules and timers
- [Audit](./20-audit.md) — Audit logging for all engine operations
- [Configuration](./30-configuration.md) — Full configuration reference
