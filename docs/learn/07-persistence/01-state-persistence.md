# Persisting Rules and Facts

Without persistence, every engine restart means re-registering all rules from code. That works for development, but in production — where rules are created dynamically through APIs, admin UIs, or hot reload — you need rules to survive restarts. noex-rules integrates with the `StorageAdapter` interface from `@hamicek/noex` to save and restore rules and groups automatically.

## What You'll Learn

- How `PersistenceConfig` connects the engine to a storage backend
- The automatic save/restore lifecycle
- How debounced persistence batches rapid changes
- Schema versioning for safe migrations
- The `RulePersistence` class internals

## The StorageAdapter Interface

noex-rules doesn't implement its own storage layer. Instead, it delegates to the `StorageAdapter` interface from `@hamicek/noex`, which provides pluggable storage backends:

```text
  ┌──────────────┐       ┌──────────────────┐
  │  RuleEngine   │──────▶│  RulePersistence  │
  └──────────────┘       └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  StorageAdapter   │ (interface from @hamicek/noex)
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
              │  SQLite    │ │  File   │ │   Memory    │
              │  Adapter   │ │ Adapter │ │   Adapter   │
              └───────────┘ └─────────┘ └─────────────┘
```

Any adapter that implements `save()`, `load()`, `delete()`, and `exists()` works. The most common choice is `SQLiteAdapter` from `@hamicek/noex`.

## PersistenceConfig

To enable persistence, pass a `persistence` option to `RuleEngine.start()`:

```typescript
interface PersistenceConfig {
  /** Storage adapter (e.g., SQLiteAdapter from @hamicek/noex) */
  adapter: StorageAdapter;

  /** Key for storage in database (default: 'rules') */
  key?: string;

  /** Schema version for migrations (default: 1) */
  schemaVersion?: number;
}
```

### Minimal Setup

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/rules.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});
```

That's it. The engine will:
1. Restore any previously saved rules and groups on startup
2. Automatically save rules on every change (debounced)
3. Perform a final save on `engine.stop()`

### Custom Key and Schema Version

If you run multiple engines against the same database, use different keys:

```typescript
const engine = await RuleEngine.start({
  persistence: {
    adapter,
    key: 'pricing-rules',       // Separate namespace
    schemaVersion: 2,           // Ignore data from version 1
  },
});
```

When `schemaVersion` doesn't match the persisted data, the engine starts with an empty rule set. This provides a safe migration path: bump the version when your rule format changes.

## The Save/Restore Lifecycle

The persistence lifecycle is fully automatic:

```text
  RuleEngine.start()
       │
       ▼
  ┌─────────────────┐
  │ Create adapter   │
  │ Create RulePers. │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐     ┌──────────────────────────────┐
  │ restore()       │────▶│ Load rules + groups from DB   │
  │                 │     │ Register groups first          │
  │                 │     │ Register rules (may ref groups)│
  └────────┬────────┘     └──────────────────────────────┘
           │
           ▼
  ┌─────────────────┐
  │ Engine running   │◀──── registerRule(), disableGroup(), etc.
  │                 │────▶ schedulePersist() (10ms debounce)
  └────────┬────────┘
           │
           ▼ engine.stop()
  ┌─────────────────┐
  │ persist()       │────▶ Final save of all rules + groups
  └─────────────────┘
```

### Automatic Debounced Persistence

Every mutation triggers a debounced save with a 10ms delay:

- `registerRule()` — saves after new rule is added
- `unregisterRule()` — saves after rule is removed
- `enableRule()` / `disableRule()` — saves after rule state changes
- `createGroup()` / `deleteGroup()` — saves after group changes
- `enableGroup()` / `disableGroup()` — saves after group state changes
- `updateGroup()` — saves after group metadata changes

The 10ms debounce batches rapid changes (e.g., registering 50 rules in a loop) into a single write. If the engine stops before the debounce fires, `engine.stop()` forces an immediate save.

### Restore Order

On startup, the restore process loads groups before rules. This matters because rules may reference groups via the `group` field. If a rule references group `"pricing"`, that group must already exist for the reference to be valid.

The restore also tracks the highest version number among loaded rules and sets `nextVersion = maxVersion + 1`, ensuring new rules always get a higher version than restored ones.

## What Gets Persisted

The engine persists the complete state of all rules and groups:

```typescript
// Internally, RulePersistence saves this structure:
interface PersistedRulesState {
  state: {
    rules: Rule[];        // All registered rules
    groups?: RuleGroup[]; // All groups (omitted if empty)
  };
  metadata: {
    persistedAt: number;      // Timestamp
    serverId: 'rule-engine';  // Fixed identifier
    schemaVersion: number;    // For migration safety
  };
}
```

**What IS persisted:**
- Rule definitions (id, name, trigger, conditions, actions, priority, tags, group, enabled)
- Rule groups (id, name, description, enabled, timestamps)
- Schema metadata for versioning

**What is NOT persisted:**
- Facts (fact store is in-memory; use a separate storage strategy if needed)
- Event history (events are ephemeral by design)
- Timers (use `timerPersistence` for that — see next chapter)
- Runtime state (processing queue, subscribers, profiler data)

## Complete Example: User Onboarding with Persistent Rules

This example demonstrates an onboarding system where rules are created dynamically and must survive restarts:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, onFact, emit, setFact, setTimer, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

// --- Setup with persistence ---

const adapter = await SQLiteAdapter.start({ path: './data/onboarding.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});

// --- Create a group for onboarding rules ---

engine.createGroup({
  id: 'onboarding',
  name: 'User Onboarding',
  description: 'Welcome flow and reminder rules',
  enabled: true,
});

// --- Rule 1: Welcome email on registration ---

engine.registerRule(
  Rule.create('welcome-email')
    .name('Send Welcome Email')
    .group('onboarding')
    .tags('onboarding', 'email')
    .when(onEvent('user.registered'))
    .then(emit('email.send', {
      to: ref('event.email'),
      template: 'welcome',
      name: ref('event.name'),
    }))
    .also(setFact('user:${event.userId}:onboardingStep', 'registered'))
    .also(log('User ${event.userId} registered, welcome email queued'))
    .build()
);

// --- Rule 2: Set reminder timer if profile not completed ---

engine.registerRule(
  Rule.create('profile-reminder-timer')
    .name('Schedule Profile Completion Reminder')
    .group('onboarding')
    .tags('onboarding', 'reminders')
    .when(onEvent('user.registered'))
    .then(setTimer({
      name: 'profile-reminder:${event.userId}',
      duration: '24h',
      onExpire: {
        topic: 'onboarding.reminder_due',
        data: { userId: ref('event.userId'), email: ref('event.email') },
      },
    }))
    .build()
);

// --- Rule 3: Cancel reminder when profile completed ---

engine.registerRule(
  Rule.create('profile-completed')
    .name('Cancel Reminder on Profile Completion')
    .group('onboarding')
    .tags('onboarding', 'reminders')
    .when(onFact('user:*:profileCompleted'))
    .then(setFact('user:${fact.key.split(":")[1]}:onboardingStep', 'completed'))
    .build()
);

// --- Rule 4: Send reminder email ---

engine.registerRule(
  Rule.create('send-reminder')
    .name('Send Profile Reminder Email')
    .group('onboarding')
    .tags('onboarding', 'email', 'reminders')
    .when(onEvent('onboarding.reminder_due'))
    .if(fact('user:${event.userId}:onboardingStep').neq('completed'))
    .then(emit('email.send', {
      to: ref('event.email'),
      template: 'profile-reminder',
      userId: ref('event.userId'),
    }))
    .also(log('Profile reminder sent to user ${event.userId}'))
    .build()
);

// --- Simulate usage ---

// Register a user
await engine.emit('user.registered', {
  userId: 'u-42',
  email: 'alice@example.com',
  name: 'Alice',
});

console.log(engine.getStats().rules.total);
// 4

// --- Restart simulation ---
// On next startup, RuleEngine.start() with the same adapter
// will restore all 4 rules and the 'onboarding' group automatically.

await engine.stop();
```

After `engine.stop()`, the four rules and the `onboarding` group are saved to SQLite. On the next `RuleEngine.start()` with the same adapter, they're restored automatically — no need to re-register from code.

## API Reference

### RulePersistence Class

The engine creates this internally when `persistence` is configured. You don't instantiate it yourself, but understanding the API helps with debugging:

| Method | Description |
|--------|-------------|
| `save(rules, groups?)` | Persists all rules and groups to storage |
| `load()` | Returns `{ rules: Rule[], groups: RuleGroup[] }` |
| `clear()` | Deletes all persisted data. Returns `true` on success |
| `exists()` | Checks if persisted data exists |
| `getKey()` | Returns the storage key (default: `'rules'`) |
| `getSchemaVersion()` | Returns the schema version (default: `1`) |

### Schema Version Behavior

| Persisted version | Config version | Result |
|:-:|:-:|:--|
| 1 | 1 | Rules restored normally |
| 1 | 2 | Empty restore (version mismatch) |
| — (no data) | any | Empty restore (no data yet) |

## Exercise

Build a persistent notification rules system:

1. Create a `SQLiteAdapter` and start the engine with persistence
2. Create a group called `notifications` with three rules:
   - A rule that emits `notification.email` when `order.shipped` is received
   - A rule that emits `notification.sms` when `delivery.failed` is received
   - A rule that sets a fact `customer:{customerId}:lastNotified` on any notification event
3. Stop the engine, start a new instance with the same adapter, and verify all rules were restored

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, ref, event } from '@hamicek/noex-rules/dsl';

// First run: create and persist rules
const adapter = await SQLiteAdapter.start({ path: './data/notifications.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});

engine.createGroup({
  id: 'notifications',
  name: 'Customer Notifications',
  description: 'Email and SMS notification rules',
  enabled: true,
});

engine.registerRule(
  Rule.create('ship-email')
    .name('Shipping Email Notification')
    .group('notifications')
    .tags('notifications', 'email', 'shipping')
    .when(onEvent('order.shipped'))
    .then(emit('notification.email', {
      customerId: ref('event.customerId'),
      template: 'order-shipped',
      orderId: ref('event.orderId'),
    }))
    .build()
);

engine.registerRule(
  Rule.create('delivery-sms')
    .name('Delivery Failure SMS')
    .group('notifications')
    .tags('notifications', 'sms', 'delivery')
    .when(onEvent('delivery.failed'))
    .then(emit('notification.sms', {
      customerId: ref('event.customerId'),
      message: 'Delivery failed for order ${event.orderId}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('track-notification')
    .name('Track Last Notification')
    .group('notifications')
    .tags('notifications', 'tracking')
    .when(onEvent('notification.*'))
    .then(setFact(
      'customer:${event.customerId}:lastNotified',
      Date.now()
    ))
    .build()
);

console.log(`Rules before stop: ${engine.getStats().rules.total}`);
// Rules before stop: 3

await engine.stop();

// Second run: restore from persistence
const engine2 = await RuleEngine.start({
  persistence: { adapter },
});

console.log(`Rules after restart: ${engine2.getStats().rules.total}`);
// Rules after restart: 3

const groups = engine2.getGroups();
console.log(`Groups: ${groups.map(g => g.id).join(', ')}`);
// Groups: notifications

await engine2.stop();
```

The key insight: the second engine instance doesn't register any rules manually. Everything is restored from the database.

</details>

## Summary

- **`PersistenceConfig`** connects the engine to a `StorageAdapter` for rule persistence
- Rules and groups are **automatically restored** on `RuleEngine.start()` and **saved on `engine.stop()`**
- Every rule/group mutation triggers a **debounced save** (10ms), batching rapid changes
- Groups restore before rules so that group references remain valid
- **`schemaVersion`** provides a migration safety net — version mismatches result in a clean start
- Facts, events, and timers are **not persisted** by this mechanism (timers have their own — see next chapter)
- Use different `key` values to isolate multiple engines sharing the same database

---

Next: [Durable Timers](./02-timer-persistence.md)
