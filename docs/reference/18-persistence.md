# Persistence

Rule persistence using external storage adapters. Saves rules to storage (SQLite, file, memory) and enables restoration after restart.

## Import

```typescript
import {
  RulePersistence,
  // Types
  RulePersistenceOptions,
  PersistenceConfig,
  TimerPersistenceConfig,
  AuditPersistenceConfig,
} from '@hamicek/noex-rules';

// StorageAdapter from the core noex package
import { StorageAdapter, SQLiteAdapter, FileAdapter } from '@hamicek/noex';
```

---

## RulePersistence

Persists rules to external storage using a `StorageAdapter`. Supports schema versioning for future migrations.

### Constructor

```typescript
new RulePersistence(adapter: StorageAdapter, options?: RulePersistenceOptions)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| adapter | `StorageAdapter` | yes | Storage adapter instance (SQLite, file, memory) |
| options | `RulePersistenceOptions` | no | Persistence options |

**Example:**

```typescript
import { RulePersistence } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = new SQLiteAdapter({ filename: './rules.db' });
const persistence = new RulePersistence(adapter);
```

### save()

```typescript
async save(rules: Rule[], groups?: RuleGroup[]): Promise<void>
```

Saves rules and optional groups to storage.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| rules | `Rule[]` | yes | Array of rules to persist |
| groups | `RuleGroup[]` | no | Array of rule groups to persist |

**Example:**

```typescript
const rules = engine.getAllRules();
const groups = engine.getAllGroups();

await persistence.save(rules, groups);
```

### load()

```typescript
async load(): Promise<LoadResult>
```

Loads rules and groups from storage. Returns empty arrays if no data exists or schema version mismatch.

**Returns:** `LoadResult` — Object with `rules` and `groups` arrays

**Example:**

```typescript
const { rules, groups } = await persistence.load();

for (const rule of rules) {
  await engine.registerRule(rule);
}

for (const group of groups) {
  engine.createGroup(group);
}
```

### clear()

```typescript
async clear(): Promise<boolean>
```

Deletes all persisted rules from storage.

**Returns:** `boolean` — `true` if data was deleted

**Example:**

```typescript
const deleted = await persistence.clear();
console.log(deleted ? 'Rules cleared' : 'No rules to clear');
```

### exists()

```typescript
async exists(): Promise<boolean>
```

Checks whether saved rules exist in storage.

**Returns:** `boolean` — `true` if persisted rules exist

**Example:**

```typescript
if (await persistence.exists()) {
  const { rules } = await persistence.load();
  console.log(`Loaded ${rules.length} persisted rules`);
}
```

### getKey()

```typescript
getKey(): string
```

Returns the storage key used for persistence.

**Returns:** `string` — Storage key (default: `'rules'`)

### getSchemaVersion()

```typescript
getSchemaVersion(): number
```

Returns the current schema version.

**Returns:** `number` — Schema version (default: `1`)

---

## RulePersistenceOptions

```typescript
interface RulePersistenceOptions {
  key?: string;
  schemaVersion?: number;
}
```

Options for `RulePersistence`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| key | `string` | `'rules'` | Storage key for persistence |
| schemaVersion | `number` | `1` | Schema version for migrations |

**Example:**

```typescript
const persistence = new RulePersistence(adapter, {
  key: 'my-rules',
  schemaVersion: 2,
});
```

---

## LoadResult

```typescript
interface LoadResult {
  rules: Rule[];
  groups: RuleGroup[];
}
```

Result of loading persisted state.

| Field | Type | Description |
|-------|------|-------------|
| rules | `Rule[]` | Loaded rules (empty if none or schema mismatch) |
| groups | `RuleGroup[]` | Loaded groups (empty if none) |

---

## PersistenceConfig

```typescript
interface PersistenceConfig {
  adapter: StorageAdapter;
  key?: string;
  schemaVersion?: number;
}
```

Configuration for rule persistence in `RuleEngineConfig`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter (e.g., `SQLiteAdapter` from `@hamicek/noex`) |
| key | `string` | `'rules'` | Storage key |
| schemaVersion | `number` | `1` | Schema version |

**Example:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  persistence: {
    adapter: new SQLiteAdapter({ filename: './data/rules.db' }),
    key: 'production-rules',
  },
});
```

---

## TimerPersistenceConfig

```typescript
interface TimerPersistenceConfig {
  adapter: StorageAdapter;
  checkIntervalMs?: number;
}
```

Configuration for durable timer persistence.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter for timer metadata |
| checkIntervalMs | `number` | `1000` | Interval for checking expired timers in ms |

**Example:**

```typescript
const engine = await RuleEngine.start({
  timerPersistence: {
    adapter: new SQLiteAdapter({ filename: './data/timers.db' }),
    checkIntervalMs: 500,
  },
});
```

---

## AuditPersistenceConfig

```typescript
interface AuditPersistenceConfig {
  adapter: StorageAdapter;
  retentionMs?: number;
  batchSize?: number;
}
```

Configuration for audit log persistence.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter for audit records |
| retentionMs | `number` | 30 days | How long to retain records in ms |
| batchSize | `number` | `100` | Records per persistence batch |

**Example:**

```typescript
const engine = await RuleEngine.start({
  audit: {
    adapter: new SQLiteAdapter({ filename: './data/audit.db' }),
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    batchSize: 50,
  },
});
```

---

## StorageAdapter Interface

The `StorageAdapter` interface is provided by `@hamicek/noex`. Common implementations:

| Adapter | Package | Description |
|---------|---------|-------------|
| `SQLiteAdapter` | `@hamicek/noex` | SQLite file-based storage |
| `FileAdapter` | `@hamicek/noex` | JSON file storage |
| `MemoryAdapter` | `@hamicek/noex` | In-memory storage (non-persistent) |

```typescript
interface StorageAdapter {
  save<T>(key: string, state: PersistedState<T>): Promise<void>;
  load<T>(key: string): Promise<PersistedState<T> | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

interface PersistedState<T> {
  state: T;
  metadata: StateMetadata;
}

interface StateMetadata {
  persistedAt: number;
  serverId: string;
  schemaVersion: number;
}
```

---

## Complete Example

```typescript
import { RuleEngine, RulePersistence, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// Create storage adapter
const adapter = new SQLiteAdapter({ filename: './rules.db' });

// Option 1: Use RulePersistence directly
const persistence = new RulePersistence(adapter);

// Save rules manually
const rules = engine.getAllRules();
await persistence.save(rules);

// Load rules on startup
if (await persistence.exists()) {
  const { rules, groups } = await persistence.load();
  for (const rule of rules) {
    await engine.registerRule(rule);
  }
}

// Option 2: Configure persistence in RuleEngine
const engine = await RuleEngine.start({
  persistence: {
    adapter: new SQLiteAdapter({ filename: './data/rules.db' }),
  },
  timerPersistence: {
    adapter: new SQLiteAdapter({ filename: './data/timers.db' }),
  },
});

// Engine automatically loads persisted rules on start
// and saves on registerRule/unregisterRule
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Uses persistence for automatic rule loading/saving
- [TimerManager](./04-timer-manager.md) — Uses timer persistence for durable timers
- [Audit](./20-audit.md) — Uses audit persistence for log records
- [Configuration](./30-configuration.md) — Full configuration reference
