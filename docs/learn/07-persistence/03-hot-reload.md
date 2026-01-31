# Hot Reload

In a running production system, you sometimes need to update rules without restarting the engine. A non-developer might edit a YAML file with new pricing rules. A deployment pipeline might push updated rules to a database. Hot reload watches external sources for changes and applies them to the engine automatically — with validation and atomic safety.

## What You'll Learn

- How to configure `HotReloadConfig` with file and storage sources
- How polling-based change detection works
- Atomic vs non-atomic reload behavior
- Validation before apply to prevent broken rules
- Monitoring hot reload status

## HotReloadConfig

Enable hot reload by passing `hotReload` to `RuleEngine.start()`:

```typescript
interface HotReloadConfig {
  /** Interval for checking changes in ms (default: 5000) */
  intervalMs?: number;

  /** File source configuration */
  files?: FileSourceConfig;

  /** Storage adapter source configuration */
  storage?: StorageSourceConfig;

  /** Validate rules before applying (default: true) */
  validateBeforeApply?: boolean;

  /** Atomic reload - all changes apply or none (default: true) */
  atomicReload?: boolean;
}

interface FileSourceConfig {
  /** Paths to YAML files or directories */
  paths: string[];

  /** Glob patterns for filtering (default: ['*.yaml', '*.yml']) */
  patterns?: string[];

  /** Recursive directory traversal (default: false) */
  recursive?: boolean;
}

interface StorageSourceConfig {
  /** Storage adapter for loading rules */
  adapter: StorageAdapter;

  /** Storage key (default: 'hot-reload:rules') */
  key?: string;
}
```

You can configure one or both source types. The watcher merges rules from all sources before computing diffs.

## Source Types

### File Source

Loads rules from YAML files on disk. Ideal for rules managed by non-developers or version-controlled in a Git repository:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 10000,   // Check every 10 seconds
    files: {
      paths: ['./rules'],
      patterns: ['*.yaml', '*.yml'],
      recursive: true,
    },
  },
});
```

The file source scans each path in the `paths` array:
- If a path is a **file**, it loads rules directly from it
- If a path is a **directory**, it scans for files matching the patterns

### Storage Source

Loads rules from a `StorageAdapter`. Useful when rules are pushed to a shared database by a deployment pipeline or admin UI:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/engine.db' });

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 5000,
    storage: {
      adapter,
      key: 'hot-reload:rules',  // Default key
    },
  },
});
```

The storage source expects rules stored in this format:

```typescript
// What the storage adapter returns:
{
  state: { rules: RuleInput[] },
  metadata: { persistedAt: number, serverId: string, schemaVersion: number }
}
```

### Combined Sources

You can watch both files and storage simultaneously:

```typescript
const engine = await RuleEngine.start({
  hotReload: {
    files: {
      paths: ['./rules/base', './rules/overrides'],
      recursive: true,
    },
    storage: {
      adapter,
      key: 'dynamic-rules',
    },
  },
});
```

Rules from all sources are merged into a single list before diffing against the engine's current rules.

## How Change Detection Works

The hot reload watcher uses a polling model implemented via GenServer:

```text
  HotReloadWatcher.start()
       │
       ▼
  ┌───────────────────────┐
  │ Initialize hash cache  │ ◀── SHA-256 of each current rule
  │ Start GenServer        │
  │ Schedule first check   │
  └───────────┬───────────┘
              │
              ▼ (every intervalMs)
  ┌───────────────────────┐
  │ Load rules from all    │
  │ sources (files+storage)│
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐     ┌────────────────────────┐
  │ Compute diff           │────▶│ Compare SHA-256 hashes  │
  │                       │     │ against cached versions │
  └───────────┬───────────┘     └────────────────────────┘
              │
    ┌─────────┼─────────┐
    │ No changes?        │── Yes ──▶ Schedule next check
    │                    │
    │ Changes detected:  │
    │ - added[]          │
    │ - removed[]        │
    │ - modified[]       │
    └─────────┬──────────┘
              │
              ▼
  ┌───────────────────────┐
  │ Validate (if enabled)  │── Fail ──▶ Increment failureCount
  └───────────┬───────────┘             Schedule next check
              │ Pass
              ▼
  ┌───────────────────────┐
  │ Apply changes          │
  │ 1. Remove deleted      │
  │ 2. Update modified     │
  │ 3. Add new             │
  │ 4. Update hash cache   │
  └───────────┬───────────┘
              │
              ▼
  Schedule next check
```

### SHA-256 Hashing

Each rule is hashed using SHA-256 of its serialized form. The watcher maintains a `Map<ruleId, hash>` cache. On each check cycle:

- **Added rules**: Rule ID exists in source but not in cache
- **Removed rules**: Rule ID exists in cache but not in source
- **Modified rules**: Rule ID exists in both, but hashes differ

This is efficient — only IDs and hashes are compared, not full rule objects.

## Atomic Reload

When `atomicReload: true` (the default), changes are applied as an all-or-nothing operation:

```text
  Atomic mode (default):

  ┌─────────────────────────────────────────┐
  │ Transaction                              │
  │                                         │
  │  1. Remove rule-A     ──┐               │
  │  2. Update rule-B     ──┤  All succeed  │──▶ Commit
  │  3. Add rule-C        ──┘               │
  │                                         │
  │  If ANY step fails    ──────────────────│──▶ Rollback (no changes)
  └─────────────────────────────────────────┘

  Non-atomic mode:

  1. Remove rule-A     ──▶ Applied (even if step 2 fails)
  2. Update rule-B     ──▶ Failed! (partial state)
  3. Add rule-C        ──▶ Not attempted
```

Atomic mode prevents the engine from ending up in an inconsistent state where some rules are updated and others aren't. In non-atomic mode, each change is applied independently — a failure in one doesn't prevent the others.

Use atomic mode (the default) unless you have a specific reason not to.

## Validation Before Apply

When `validateBeforeApply: true` (the default), all new and modified rules are validated before any changes are applied:

```typescript
const engine = await RuleEngine.start({
  hotReload: {
    files: { paths: ['./rules'] },
    validateBeforeApply: true,  // Default
  },
});
```

The validation checks:
- Required fields (id, trigger, at least one action)
- Trigger format (valid event patterns, fact patterns, timer patterns)
- Condition structure (valid operators, proper source references)
- Action structure (valid action types, required parameters)

If validation fails, the entire reload cycle is skipped and the `failureCount` is incremented. The existing rules remain unchanged.

## Monitoring Hot Reload

The watcher exposes its status through `getHotReloadStatus()`:

```typescript
interface HotReloadStatus {
  running: boolean;          // Is the watcher actively polling?
  intervalMs: number;        // Polling interval
  trackedRulesCount: number; // Number of rules in the hash cache
  lastReloadAt: number | null; // Timestamp of last successful reload
  reloadCount: number;       // Total successful reloads
  failureCount: number;      // Total failed reload attempts
}
```

```typescript
const status = engine.getHotReloadStatus();
console.log(status);
// {
//   running: true,
//   intervalMs: 5000,
//   trackedRulesCount: 12,
//   lastReloadAt: 1706886400000,
//   reloadCount: 3,
//   failureCount: 0,
// }
```

## Complete Example: YAML-Driven Pricing Rules

A pricing system where business users edit YAML files and the engine picks up changes automatically:

```yaml
# rules/pricing/summer-sale.yaml
- id: summer-discount
  name: Summer Sale 20% Off
  tags: [pricing, seasonal]
  trigger:
    type: event
    topic: order.created
  conditions:
    - source: event
      field: total
      operator: gte
      value: 50
  actions:
    - type: emit_event
      topic: discount.applied
      data:
        orderId: "${event.orderId}"
        discount: 0.2
        reason: summer-sale

- id: summer-free-shipping
  name: Summer Free Shipping
  tags: [pricing, seasonal, shipping]
  trigger:
    type: event
    topic: order.created
  conditions:
    - source: event
      field: total
      operator: gte
      value: 100
  actions:
    - type: set_fact
      key: "order:${event.orderId}:freeShipping"
      value: true
```

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/pricing.db' });

const engine = await RuleEngine.start({
  // Persist engine state
  persistence: { adapter },

  // Watch for YAML changes
  hotReload: {
    intervalMs: 5000,
    files: {
      paths: ['./rules/pricing'],
      patterns: ['*.yaml'],
      recursive: false,
    },
    validateBeforeApply: true,
    atomicReload: true,
  },
});

// Subscribe to pricing events
engine.subscribe('discount.applied', (event) => {
  console.log(`Discount applied: ${event.data.discount * 100}% on order ${event.data.orderId}`);
});

// The engine now monitors ./rules/pricing/ every 5 seconds.
// Edit summer-sale.yaml to change the discount from 0.2 to 0.3 —
// the watcher detects the change, validates the new rules,
// and applies them atomically.

// Check status
setInterval(() => {
  const status = engine.getHotReloadStatus();
  if (status.reloadCount > 0) {
    console.log(`Last reload: ${new Date(status.lastReloadAt!).toISOString()}`);
    console.log(`Rules tracked: ${status.trackedRulesCount}`);
  }
}, 30000);

// Graceful shutdown stops the watcher
// await engine.stop();
```

When a business user edits `summer-sale.yaml`, the watcher:
1. Detects the hash change on the next poll cycle
2. Validates both rules in the file
3. Atomically updates the modified rule(s) in the engine
4. Updates the hash cache

No restart needed. No API calls. Just edit and save.

## Hot Reload vs Persistence

Hot reload and rule persistence are complementary, not competing:

| Aspect | Persistence | Hot Reload |
|--------|-------------|------------|
| **Direction** | Engine state -> storage | External sources -> engine |
| **When** | On rule changes + shutdown | On polling interval |
| **Purpose** | Survive restarts | Update from external sources |
| **Source of truth** | Engine's internal state | YAML files or storage |

A typical production setup uses both:
- **Persistence** ensures rules survive restarts
- **Hot reload** picks up changes from YAML files or a deployment pipeline

When both are active and a hot reload updates a rule, the change is picked up by the regular persistence mechanism (debounced save) and persisted automatically.

## Exercise

Build a hot-reloadable notification system:

1. Create a `rules/notifications/` directory with a YAML file containing two rules:
   - A rule that emits `alert.email` when `system.error` is received with `severity >= 3`
   - A rule that emits `alert.slack` when `system.error` is received with `severity >= 5`
2. Start the engine with hot reload watching that directory
3. Subscribe to both alert topics and log received events
4. Describe what happens when you edit the YAML to change the severity threshold from 5 to 4

<details>
<summary>Solution</summary>

First, the YAML file (`rules/notifications/alerts.yaml`):

```yaml
- id: email-alert
  name: Email Alert on System Error
  tags: [alerts, email]
  trigger:
    type: event
    topic: system.error
  conditions:
    - source: event
      field: severity
      operator: gte
      value: 3
  actions:
    - type: emit_event
      topic: alert.email
      data:
        message: "${event.message}"
        severity: "${event.severity}"
        service: "${event.service}"

- id: slack-alert
  name: Slack Alert on Critical Error
  tags: [alerts, slack]
  trigger:
    type: event
    topic: system.error
  conditions:
    - source: event
      field: severity
      operator: gte
      value: 5
  actions:
    - type: emit_event
      topic: alert.slack
      data:
        message: "${event.message}"
        severity: "${event.severity}"
        service: "${event.service}"
        channel: "#incidents"
```

Then, the engine setup:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 3000,
    files: {
      paths: ['./rules/notifications'],
      patterns: ['*.yaml'],
    },
    validateBeforeApply: true,
    atomicReload: true,
  },
});

// Subscribe to alert events
engine.subscribe('alert.email', (event) => {
  console.log(`[EMAIL] ${event.data.service}: ${event.data.message} (severity: ${event.data.severity})`);
});

engine.subscribe('alert.slack', (event) => {
  console.log(`[SLACK] #incidents - ${event.data.service}: ${event.data.message} (severity: ${event.data.severity})`);
});

// Test: emit an error with severity 4
await engine.emit('system.error', {
  message: 'Database connection pool exhausted',
  severity: 4,
  service: 'api-gateway',
});
// Output: [EMAIL] api-gateway: Database connection pool exhausted (severity: 4)
// (No Slack alert — severity 4 < threshold 5)

// Now edit alerts.yaml: change slack-alert severity from 5 to 4
// The watcher detects the change within 3 seconds, validates, and applies.

// After reload, the same event would also trigger Slack:
// [EMAIL] api-gateway: ... (severity: 4)
// [SLACK] #incidents - api-gateway: ... (severity: 4)

const status = engine.getHotReloadStatus();
console.log(`Reloads: ${status.reloadCount}, Failures: ${status.failureCount}`);
```

When the YAML threshold changes from 5 to 4:
1. The watcher computes a new SHA-256 hash for `slack-alert`
2. The hash differs from the cached version — rule is marked as **modified**
3. Validation passes (the new rule is structurally valid)
4. The engine unregisters the old `slack-alert` and registers the new one
5. The hash cache is updated
6. Future `system.error` events with severity 4 now trigger both alerts

</details>

## Summary

- **Hot reload** watches external sources (YAML files, storage adapters) and applies rule changes without engine restart
- Configure via `hotReload` in `RuleEngine.start()` with `files`, `storage`, or both
- Change detection uses **SHA-256 hashing** — efficient comparison without full object diffing
- **Atomic reload** (default) applies all changes or none, preventing inconsistent state
- **Validation before apply** (default) rejects invalid rules before they reach the engine
- The watcher uses a **polling model** via GenServer, with configurable interval (default: 5000ms)
- Monitor status through `getHotReloadStatus()` — track reload count, failures, and last reload time
- Hot reload complements persistence: reload brings external changes in, persistence saves state out

---

Next: [Debugging Rules](../08-observability/01-debugging.md)
