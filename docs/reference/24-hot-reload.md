# Hot Reload

Automatic rule synchronization from external sources. HotReloadWatcher monitors YAML files or StorageAdapter for changes and applies them to the running engine without restart.

## Import

```typescript
import {
  HotReloadWatcher,
  // Types
  HotReloadConfig,
  HotReloadStatus,
  ReloadResult,
  RuleDiff,
  RuleSource,
  FileSourceConfig,
  StorageSourceConfig,
  FileRuleSource,
  StorageRuleSource,
} from '@hamicek/noex-rules';
```

---

## HotReloadWatcher

Monitors external rule sources and automatically synchronizes changes to the engine. Uses polling with configurable interval. Changes are detected via SHA-256 hashing of rule definitions.

### Factory Method

```typescript
static async start(
  engine: RuleEngine,
  config: HotReloadConfig
): Promise<HotReloadWatcher>
```

Creates and starts a HotReloadWatcher instance. Initializes baseline hashes from currently registered rules and schedules the first check.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| engine | `RuleEngine` | yes | Engine to synchronize rules to |
| config | `HotReloadConfig` | yes | Hot reload configuration |

**Returns:** `Promise<HotReloadWatcher>` — Running watcher instance

**Example:**

```typescript
import { RuleEngine, HotReloadWatcher } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

const watcher = await HotReloadWatcher.start(engine, {
  intervalMs: 5000,
  files: {
    paths: ['./rules'],
    patterns: ['*.yaml', '*.yml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
});
```

### stop()

```typescript
async stop(): Promise<void>
```

Stops the watcher and releases resources. Cancels pending timer and stops the internal GenServer.

**Example:**

```typescript
await watcher.stop();
```

### getStatus()

```typescript
getStatus(): HotReloadStatus
```

Returns current watcher status including running state, statistics, and configuration.

**Returns:** `HotReloadStatus` — Current watcher status

**Example:**

```typescript
const status = watcher.getStatus();

console.log(`Running: ${status.running}`);
console.log(`Tracked rules: ${status.trackedRulesCount}`);
console.log(`Successful reloads: ${status.reloadCount}`);
console.log(`Failed reloads: ${status.failureCount}`);

if (status.lastReloadAt) {
  console.log(`Last reload: ${new Date(status.lastReloadAt).toISOString()}`);
}
```

### computeRuleHash()

```typescript
static computeRuleHash(rule: RuleInput): string
```

Computes deterministic SHA-256 hash for a rule. Keys are sorted alphabetically to ensure consistency regardless of property order.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| rule | `RuleInput` | yes | Rule to hash |

**Returns:** `string` — Hexadecimal SHA-256 hash

**Example:**

```typescript
const hash = HotReloadWatcher.computeRuleHash({
  id: 'my-rule',
  trigger: { type: 'event', topic: 'user.created' },
  conditions: [],
  actions: [{ type: 'emit_event', topic: 'welcome.send' }],
});

console.log(hash); // '3a7bd...'
```

---

## HotReloadConfig

```typescript
interface HotReloadConfig {
  intervalMs?: number;
  files?: FileSourceConfig;
  storage?: StorageSourceConfig;
  validateBeforeApply?: boolean;
  atomicReload?: boolean;
}
```

Configuration for hot reload behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| intervalMs | `number` | `5000` | Polling interval in milliseconds |
| files | `FileSourceConfig` | — | File source configuration |
| storage | `StorageSourceConfig` | — | Storage adapter source configuration |
| validateBeforeApply | `boolean` | `true` | Validate rules before applying changes |
| atomicReload | `boolean` | `true` | Apply all changes atomically or none |

**Example:**

```typescript
const config: HotReloadConfig = {
  intervalMs: 10000,
  files: {
    paths: ['./rules', './rules-extra'],
    patterns: ['*.yaml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
};
```

---

## FileSourceConfig

```typescript
interface FileSourceConfig {
  paths: string[];
  patterns?: string[];
  recursive?: boolean;
}
```

Configuration for file-based rule sources.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| paths | `string[]` | — | Paths to YAML files or directories |
| patterns | `string[]` | `['*.yaml', '*.yml']` | Glob patterns for filtering |
| recursive | `boolean` | `false` | Recursively traverse directories |

**Example:**

```typescript
const fileConfig: FileSourceConfig = {
  paths: ['./rules', './config/rules.yaml'],
  patterns: ['*.yaml', '*.yml'],
  recursive: true,
};
```

---

## StorageSourceConfig

```typescript
interface StorageSourceConfig {
  adapter: StorageAdapter;
  key?: string;
}
```

Configuration for StorageAdapter-based rule sources.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter for loading rules |
| key | `string` | `'hot-reload:rules'` | Key in storage |

**Example:**

```typescript
import { RedisStorageAdapter } from '@hamicek/noex';

const storageConfig: StorageSourceConfig = {
  adapter: new RedisStorageAdapter({ url: 'redis://localhost:6379' }),
  key: 'myapp:rules',
};
```

---

## HotReloadStatus

```typescript
interface HotReloadStatus {
  running: boolean;
  intervalMs: number;
  trackedRulesCount: number;
  lastReloadAt: number | null;
  reloadCount: number;
  failureCount: number;
}
```

Public status of the hot reload watcher.

| Field | Type | Description |
|-------|------|-------------|
| running | `boolean` | Whether the watcher is actively polling |
| intervalMs | `number` | Configured polling interval |
| trackedRulesCount | `number` | Number of rules being tracked |
| lastReloadAt | `number \| null` | Timestamp of last successful reload |
| reloadCount | `number` | Total successful reload count |
| failureCount | `number` | Total failed reload count |

---

## ReloadResult

```typescript
interface ReloadResult {
  success: boolean;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  durationMs: number;
  error?: string;
  timestamp: number;
}
```

Result of a single reload cycle.

| Field | Type | Description |
|-------|------|-------------|
| success | `boolean` | Whether reload completed successfully |
| addedCount | `number` | Number of rules added |
| removedCount | `number` | Number of rules removed |
| modifiedCount | `number` | Number of rules modified |
| durationMs | `number` | Reload duration in milliseconds |
| error | `string` | Error message if reload failed |
| timestamp | `number` | Timestamp when reload completed |

---

## RuleDiff

```typescript
interface RuleDiff {
  added: RuleInput[];
  removed: string[];
  modified: RuleInput[];
}
```

Result of comparing current and new rules.

| Field | Type | Description |
|-------|------|-------------|
| added | `RuleInput[]` | Rules present in source but not in engine |
| removed | `string[]` | Rule IDs present in engine but not in source |
| modified | `RuleInput[]` | Rules with changed content |

---

## RuleSource

```typescript
interface RuleSource {
  loadRules(): Promise<RuleInput[]>;
  readonly name: string;
}
```

Interface for rule sources. Implement this to create custom sources.

| Member | Type | Description |
|--------|------|-------------|
| loadRules | `() => Promise<RuleInput[]>` | Loads rules from the source |
| name | `string` | Source name for logging and diagnostics |

---

## FileRuleSource

```typescript
class FileRuleSource implements RuleSource {
  readonly name = 'file';
  constructor(config: FileSourceConfig);
  loadRules(): Promise<RuleInput[]>;
}
```

Loads rules from YAML files and directories. Each path can be a file (loaded directly) or directory (scanned for matching files).

**Example:**

```typescript
const source = new FileRuleSource({
  paths: ['./rules'],
  patterns: ['*.yaml'],
  recursive: true,
});

const rules = await source.loadRules();
console.log(`Loaded ${rules.length} rules from files`);
```

---

## StorageRuleSource

```typescript
class StorageRuleSource implements RuleSource {
  readonly name = 'storage';
  constructor(config: StorageSourceConfig);
  loadRules(): Promise<RuleInput[]>;
}
```

Loads rules from an external StorageAdapter. Expects data in format `{ rules: RuleInput[] }`.

**Example:**

```typescript
const source = new StorageRuleSource({
  adapter: myStorageAdapter,
  key: 'app:rules',
});

const rules = await source.loadRules();
```

---

## Complete Example

```typescript
import {
  RuleEngine,
  HotReloadWatcher,
  Rule,
  onEvent,
  emit,
} from '@hamicek/noex-rules';

// Start engine with some initial rules
const engine = await RuleEngine.start();

await engine.registerRule(
  Rule.create('initial-rule')
    .when(onEvent('user.created'))
    .then(emit('welcome.send'))
    .build()
);

// Start hot reload watcher
const watcher = await HotReloadWatcher.start(engine, {
  intervalMs: 5000,
  files: {
    paths: ['./rules'],
    patterns: ['*.yaml', '*.yml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
});

// Monitor status
setInterval(() => {
  const status = watcher.getStatus();
  console.log(`[Hot Reload] Tracked: ${status.trackedRulesCount}, ` +
    `Reloads: ${status.reloadCount}, Failures: ${status.failureCount}`);
}, 30000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await watcher.stop();
  await engine.stop();
});
```

---

## Audit Events

HotReloadWatcher records the following audit events when audit logging is enabled:

| Event | When |
|-------|------|
| `hot_reload_started` | Reload cycle begins with detected changes |
| `hot_reload_completed` | Reload cycle completes successfully |
| `hot_reload_failed` | Reload cycle fails (validation or error) |

**Example audit entry:**

```json
{
  "type": "hot_reload_completed",
  "data": {
    "addedCount": 2,
    "removedCount": 1,
    "modifiedCount": 3,
    "durationMs": 45
  }
}
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [YAML Loader](./14-dsl-yaml.md) — YAML rule loading functions
- [Validation](./17-validation.md) — Rule validation before apply
- [Audit](./20-audit.md) — Audit logging for reload events
- [Persistence](./18-persistence.md) — StorageAdapter interface
