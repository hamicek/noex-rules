# Rules and Events

Rules are the engine's fundamental unit. Events are the primary way to trigger them. In this chapter, you'll learn how to register rules, emit events, subscribe to results, and understand the evaluation flow.

## What You'll Learn

- The complete anatomy of a rule
- How to register, enable, disable, and remove rules
- How to emit events and subscribe to event topics
- How the engine evaluates rules when an event arrives
- How to use string interpolation in actions

## Rule Anatomy

Every rule has the same structure:

```typescript
{
  // Identity
  id: 'order-notification',       // Unique identifier
  name: 'Notify on Large Orders', // Human-readable label
  description: 'Send alert when order exceeds $1000',

  // Behavior
  priority: 100,                  // Higher = evaluated first
  enabled: true,                  // Can be toggled at runtime
  tags: ['orders', 'alerts'],     // Labels for filtering
  group: 'order-rules',           // Optional group for bulk control

  // Logic
  trigger: { ... },               // WHEN to evaluate
  conditions: [ ... ],            // WHETHER to fire
  actions: [ ... ],               // WHAT to do

  // External data (optional)
  lookups: [ ... ],               // Data to fetch before evaluation
}
```

### Required vs Optional Fields

| Field | Required | Notes |
|-------|----------|-------|
| `id` | Yes | Must be unique across all rules |
| `name` | Yes | For display and debugging |
| `priority` | Yes | Determines evaluation order |
| `enabled` | Yes | `false` skips the rule entirely |
| `tags` | Yes | Can be an empty array `[]` |
| `trigger` | Yes | One of: event, fact, timer, temporal |
| `conditions` | Yes | Can be an empty array (always fires) |
| `actions` | Yes | Can be an empty array (no-op rule) |
| `description` | No | Longer description for documentation |
| `group` | No | Links to a `RuleGroup` |
| `lookups` | No | External data requirements |

## Registering Rules

Use `registerRule()` to add a rule to the engine:

```typescript
const rule = engine.registerRule({
  id: 'welcome-email',
  name: 'Send Welcome Email',
  priority: 100,
  enabled: true,
  tags: ['onboarding'],
  trigger: { type: 'event', topic: 'user.registered' },
  conditions: [],
  actions: [
    {
      type: 'emit_event',
      topic: 'email.send',
      data: {
        to: { ref: 'event.email' },
        template: 'welcome',
      },
    },
  ],
});

console.log(rule.id);      // 'welcome-email'
console.log(rule.version);  // 1 (auto-assigned)
```

The returned `Rule` object includes auto-generated fields: `version`, `createdAt`, and `updatedAt`.

### Managing Rules at Runtime

```typescript
// Disable a rule (stops it from firing, but keeps it registered)
engine.disableRule('welcome-email');

// Re-enable it
engine.enableRule('welcome-email');

// Update rule properties
engine.updateRule('welcome-email', {
  priority: 200,
  tags: ['onboarding', 'email'],
});

// Remove a rule entirely
engine.unregisterRule('welcome-email');

// Retrieve a rule
const r = engine.getRule('welcome-email');

// List all rules
const allRules = engine.getRules();
```

### Rule Validation

The engine validates rules on registration. If the rule structure is invalid, `registerRule()` throws an error. You can also validate without registering:

```typescript
const result = engine.validateRule({
  id: 'test',
  name: 'Test Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'event', topic: 'test' },
  conditions: [],
  actions: [],
});

console.log(result.valid);   // true or false
console.log(result.errors);  // array of validation error strings
```

## Emitting Events

Events are the primary way to drive the engine. An event is a one-time signal with a topic and a data payload:

```typescript
const event = await engine.emit('order.created', {
  orderId: 'ORD-001',
  customerId: 'C-100',
  total: 750,
  items: ['SKU-42', 'SKU-17'],
});

console.log(event.id);        // auto-generated UUID
console.log(event.topic);     // 'order.created'
console.log(event.timestamp); // milliseconds since epoch
```

When you call `emit()`, the engine:

1. Creates an `Event` object with auto-generated `id` and `timestamp`
2. Stores the event in the event store
3. Finds all rules whose trigger matches the topic
4. Sorts matching rules by priority (highest first)
5. Evaluates conditions for each matching rule
6. Executes actions for rules whose conditions pass

### Event Topic Conventions

Topics use a dot-separated naming convention:

```text
order.created       ──► Something was created
order.updated       ──► Something was updated
order.cancelled     ──► Something was cancelled
payment.received    ──► A payment arrived
payment.failed      ──► A payment failed
notification.send   ──► Request to send a notification
```

The engine matches topics exactly. `order.created` triggers only rules with `trigger: { type: 'event', topic: 'order.created' }`.

### Correlated Events

Use `emitCorrelated()` to link related events for tracing:

```typescript
// First event in a flow
const orderEvent = await engine.emit('order.created', {
  orderId: 'ORD-001',
});

// Subsequent event, linked to the first
await engine.emitCorrelated(
  'payment.received',
  { orderId: 'ORD-001', amount: 750 },
  'correlation-ORD-001',   // Links this to the order flow
  orderEvent.id,           // Causation: this was caused by the order event
);
```

## Subscribing to Events

Subscribe to events using topic patterns. This lets you observe what the engine produces:

```typescript
// Subscribe to a specific topic
const unsubscribe = engine.subscribe('order.created', (event) => {
  console.log('New order:', event.data.orderId);
});

// Subscribe to all events under a namespace
engine.subscribe('order.*', (event) => {
  console.log(`Order event: ${event.topic}`);
});

// Subscribe to everything
engine.subscribe('*', (event) => {
  console.log(`[${event.topic}]`, event.data);
});

// Unsubscribe when done
unsubscribe();
```

Subscriptions see all events — both those emitted by your code and those emitted by rule actions.

## Event-Driven Evaluation Flow

Here's what happens when an event enters the engine:

```text
  engine.emit('order.created', { total: 750, customerId: 'C-100' })
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │  1. Create Event object (id, timestamp)       │
  │  2. Store in EventStore                       │
  │  3. Find rules with trigger topic match       │
  └──────────────────┬───────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
  ┌─────────────┐        ┌─────────────┐
  │ Rule: Fraud │ p:200  │ Rule: VIP   │ p:100
  │             │        │             │
  │ conditions: │        │ conditions: │
  │  total > 1k │ FAIL   │  tier = vip │ PASS
  │             │        │             │
  │ (skipped)   │        │ actions:    │
  └─────────────┘        │  set_fact   │
                         │  emit_event │
                         └─────────────┘
```

Rules are sorted by priority (highest first) and evaluated in order. Only rules whose conditions all pass have their actions executed.

## String Interpolation in Actions

Actions support `${expression}` interpolation for dynamic values:

```typescript
actions: [
  {
    type: 'log',
    level: 'info',
    message: 'Order ${event.orderId} placed by customer ${event.customerId}',
  },
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:status',
    value: 'received',
  },
]
```

The `event` prefix accesses the triggering event's data. You can also reference facts:

```typescript
key: 'customer:${event.customerId}:lastOrder'
```

For dynamic values that aren't strings, use `{ ref: 'path' }`:

```typescript
data: {
  orderId: { ref: 'event.orderId' },   // Resolves to actual value, not string
  total: { ref: 'event.total' },       // Preserves number type
}
```

The distinction matters: `${...}` produces strings, `{ ref: '...' }` preserves the original type.

## Complete Working Example

An e-commerce order notification system with three rules that demonstrate event-triggered evaluation, multi-rule matching, and event chaining:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'ecommerce' });

  // Rule 1: Log every order (low priority, runs last)
  engine.registerRule({
    id: 'order-log',
    name: 'Log All Orders',
    priority: 10,
    enabled: true,
    tags: ['logging'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Order ${event.orderId}: $${event.total} from ${event.customerId}',
      },
    ],
  });

  // Rule 2: Alert on high-value orders (medium priority)
  engine.registerRule({
    id: 'high-value-alert',
    name: 'High Value Order Alert',
    priority: 100,
    enabled: true,
    tags: ['alerts', 'orders'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gte',
        value: 1000,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'alert.high_value_order',
        data: {
          orderId: { ref: 'event.orderId' },
          total: { ref: 'event.total' },
          message: 'High-value order requires review',
        },
      },
    ],
  });

  // Rule 3: React to high-value alert (chained from Rule 2)
  engine.registerRule({
    id: 'alert-handler',
    name: 'Handle High Value Alert',
    priority: 100,
    enabled: true,
    tags: ['alerts'],
    trigger: { type: 'event', topic: 'alert.high_value_order' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:needsReview',
        value: true,
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Order ${event.orderId} flagged for review (total: $${event.total})',
      },
    ],
  });

  // Observe all alerts
  engine.subscribe('alert.*', (event) => {
    console.log('ALERT:', event.topic, event.data);
  });

  // Small order: only Rule 1 fires
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 50,
  });

  // Large order: Rule 1 + Rule 2 fire, Rule 2 emits event that triggers Rule 3
  await engine.emit('order.created', {
    orderId: 'ORD-002',
    customerId: 'C-200',
    total: 2500,
  });

  // Verify the chained fact was set
  const needsReview = engine.getFact('order:ORD-002:needsReview');
  console.log('ORD-002 needs review:', needsReview);
  // ORD-002 needs review: true

  const stats = engine.getStats();
  console.log('Events processed:', stats.eventsProcessed);
  console.log('Rules executed:', stats.rulesExecuted);

  await engine.stop();
}

main();
```

### What Happens

1. **ORD-001** ($50): Only "Log All Orders" fires — the high-value condition (total >= 1000) doesn't pass
2. **ORD-002** ($2500): Three rules execute in a chain:
   - "High Value Order Alert" (priority 100) fires first, emitting `alert.high_value_order`
   - "Log All Orders" (priority 10) fires second, logging the order
   - The emitted `alert.high_value_order` triggers "Handle High Value Alert", which sets a fact

This demonstrates **forward chaining**: Rule 2's action creates a new event that triggers Rule 3 automatically.

## Exercise

Build a user registration pipeline with three rules:

1. **Welcome Rule**: When `user.registered` fires, emit `email.send` with template "welcome" and the user's email from the event
2. **Admin Notification**: When `user.registered` fires and `event.role` equals "admin", emit `notification.admin_created` with the user ID
3. **Email Logger**: When any `email.*` event fires, log the email template and recipient

Test with two events:
- A regular user registration (`role: 'user'`)
- An admin registration (`role: 'admin'`)

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'registration' });

  // Rule 1: Welcome email for all users
  engine.registerRule({
    id: 'welcome-email',
    name: 'Send Welcome Email',
    priority: 100,
    enabled: true,
    tags: ['onboarding', 'email'],
    trigger: { type: 'event', topic: 'user.registered' },
    conditions: [],
    actions: [
      {
        type: 'emit_event',
        topic: 'email.send',
        data: {
          to: { ref: 'event.email' },
          template: 'welcome',
          userId: { ref: 'event.userId' },
        },
      },
    ],
  });

  // Rule 2: Extra notification for admin registrations
  engine.registerRule({
    id: 'admin-notification',
    name: 'Notify on Admin Registration',
    priority: 200,
    enabled: true,
    tags: ['onboarding', 'security'],
    trigger: { type: 'event', topic: 'user.registered' },
    conditions: [
      {
        source: { type: 'event', field: 'role' },
        operator: 'eq',
        value: 'admin',
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.admin_created',
        data: {
          userId: { ref: 'event.userId' },
          email: { ref: 'event.email' },
        },
      },
    ],
  });

  // Rule 3: Log all email events
  engine.registerRule({
    id: 'email-logger',
    name: 'Log Email Events',
    priority: 50,
    enabled: true,
    tags: ['logging'],
    trigger: { type: 'event', topic: 'email.send' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Email sent: template=${event.template} to=${event.to}',
      },
    ],
  });

  // Test 1: Regular user
  await engine.emit('user.registered', {
    userId: 'U-001',
    email: 'alice@example.com',
    role: 'user',
  });
  // Result: Rule 1 fires → emits email.send → Rule 3 fires (logs the email)

  // Test 2: Admin user
  await engine.emit('user.registered', {
    userId: 'U-002',
    email: 'bob@example.com',
    role: 'admin',
  });
  // Result: Rule 2 fires (admin), Rule 1 fires → emits email.send → Rule 3 fires

  console.log(engine.getStats());
  await engine.stop();
}

main();
```

For the regular user, Rules 1 and 3 execute (welcome email + log). For the admin, Rules 1, 2, and 3 all execute. Rule 3 fires as a chain reaction from Rule 1's emitted event in both cases.

</details>

## Summary

- A rule has identity (`id`, `name`), behavior (`priority`, `enabled`, `tags`), and logic (`trigger`, `conditions`, `actions`)
- `registerRule()` adds a rule; `unregisterRule()`, `enableRule()`, `disableRule()`, `updateRule()` manage it at runtime
- `emit(topic, data)` sends an event that triggers matching rules
- `subscribe(pattern, handler)` observes events — both user-emitted and rule-emitted
- Rules evaluate in priority order (highest first); all conditions must pass for actions to execute
- `${expression}` interpolates strings in actions; `{ ref: 'path' }` preserves the original type
- Rule actions can emit events that trigger other rules — this is forward chaining

---

Next: [Working with Facts](./03-facts.md)
