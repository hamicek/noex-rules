# Core Actions

Every rule ends with actions — the concrete steps the engine executes when a rule fires. noex-rules ships with four fundamental action types that cover event emission, state management, and logging. This chapter explains each one, shows how string interpolation and references make actions dynamic, and walks through a complete multi-action example.

## What You'll Learn

- The four core action types: `emit_event`, `set_fact`, `delete_fact`, `log`
- How string interpolation (`${expression}`) works in action strings
- How reference resolution (`{ ref: 'path' }`) works in action values
- How multiple actions execute in sequence within a single rule
- How actions from one rule can trigger other rules (forward chaining)

## Action Execution Pipeline

When a rule fires, the engine processes its actions array sequentially, from first to last:

```text
  Rule fires
      │
      ▼
  ┌──────────────────────────────────┐
  │  Action 1: set_fact              │
  │  ┌────────────────────────────┐  │
  │  │ 1. Interpolate key string  │  │
  │  │ 2. Resolve value references│  │
  │  │ 3. Write to FactStore      │  │
  │  └────────────────────────────┘  │
  │           ▼ success              │
  │  Action 2: emit_event            │
  │  ┌────────────────────────────┐  │
  │  │ 1. Interpolate topic       │  │
  │  │ 2. Resolve data references │  │
  │  │ 3. Emit into EventStore    │  │
  │  └────────────────────────────┘  │
  │           ▼ success              │
  │  Action 3: log                   │
  │  ┌────────────────────────────┐  │
  │  │ 1. Interpolate message     │  │
  │  │ 2. Output to console       │  │
  │  └────────────────────────────┘  │
  └──────────────────────────────────┘
      │
      ▼
  ActionResult[] returned
```

Each action produces an `ActionResult` with `success`, optional `result`, and optional `error`. If one action fails, the remaining actions still execute — there is no implicit rollback.

## emit_event

Emits a new event into the engine. This is the primary mechanism for rule chaining: one rule's action becomes another rule's trigger.

```typescript
{
  type: 'emit_event',
  topic: 'order.confirmed',
  data: {
    orderId: { ref: 'event.orderId' },
    total: { ref: 'event.total' },
    confirmedAt: 'now',
  },
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `topic` | `string` | Event topic. Supports `${expression}` interpolation. |
| `data` | `Record<string, unknown>` | Event payload. Each value can be a literal or `{ ref: 'path' }`. |

### How It Works

1. The topic string is interpolated (e.g., `'order.${event.type}'` becomes `'order.payment'`)
2. Each value in `data` is resolved — `{ ref: 'event.orderId' }` becomes the actual orderId
3. The engine assigns a unique ID and timestamp to the new event
4. If the triggering event had a `correlationId`, it propagates to the emitted event
5. The new event enters the engine and can trigger other rules

### Dynamic Topics

```typescript
{
  type: 'emit_event',
  topic: 'notification.${event.channel}',
  data: {
    message: 'Order ${event.orderId} processed',
  },
}
```

If `event.channel` is `'email'`, the emitted topic becomes `'notification.email'`.

## set_fact

Creates or updates a fact in the fact store. Facts persist in memory and are available to all rules.

```typescript
{
  type: 'set_fact',
  key: 'order:${event.orderId}:status',
  value: 'confirmed',
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Fact key. Supports `${expression}` interpolation. |
| `value` | `unknown \| { ref: string }` | Value to store. Can be a literal or a reference. |

### Static and Dynamic Values

```typescript
// Static value
{ type: 'set_fact', key: 'config:mode', value: 'production' }

// Reference to event data
{ type: 'set_fact', key: 'order:${event.orderId}:total', value: { ref: 'event.total' } }

// Reference to another fact
{ type: 'set_fact', key: 'customer:${event.customerId}:lastOrder', value: { ref: 'event.orderId' } }

// Complex values
{ type: 'set_fact', key: 'order:${event.orderId}:summary', value: { status: 'paid', items: 3 } }
```

### Forward Chaining

Setting a fact can trigger rules with `trigger: { type: 'fact', pattern: '...' }`. This creates a chain reaction:

```text
  Event arrives → Rule A fires → set_fact('order:X:status', 'paid')
                                        │
                                        ▼ fact change
                              Rule B triggers on fact 'order:*:status'
                                        │
                                        ▼
                              Rule B fires → emit_event('shipping.ready')
```

This is forward chaining: data flows forward through rules automatically.

## delete_fact

Removes a fact from the fact store.

```typescript
{
  type: 'delete_fact',
  key: 'order:${event.orderId}:pending',
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Fact key to delete. Supports `${expression}` interpolation. |

Deleting a fact that doesn't exist is a no-op — it succeeds silently.

### Cleanup Patterns

```typescript
// Remove temporary processing flag
{ type: 'delete_fact', key: 'order:${event.orderId}:processing' }

// Clear a cached value
{ type: 'delete_fact', key: 'cache:customer:${event.customerId}:profile' }
```

## log

Outputs a message to the console at a specified level. Useful for debugging, audit trails, and monitoring rule execution.

```typescript
{
  type: 'log',
  level: 'info',
  message: 'Order ${event.orderId} confirmed for customer ${event.customerId}',
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | Log severity level. |
| `message` | `string` | Message text. Supports `${expression}` interpolation. |

### Log Levels

| Level | Use For |
|-------|---------|
| `debug` | Detailed execution tracing, development only |
| `info` | Normal operational events (rule fired, fact set) |
| `warn` | Unexpected but non-fatal situations |
| `error` | Failures requiring attention |

```typescript
// Debug: trace rule execution
{ type: 'log', level: 'debug', message: 'Evaluating order ${event.orderId}, total: ${event.total}' }

// Info: business event occurred
{ type: 'log', level: 'info', message: 'VIP upgrade applied to customer ${event.customerId}' }

// Warn: unexpected state
{ type: 'log', level: 'warn', message: 'Order ${event.orderId} total is zero' }

// Error: something went wrong
{ type: 'log', level: 'error', message: 'Payment failed for order ${event.orderId}' }
```

## String Interpolation in Actions

Any string field in an action (topic, key, message) supports `${expression}` interpolation. The expression is evaluated at execution time against the current context.

### Available Sources

| Expression | Resolves To |
|------------|-------------|
| `${event.fieldName}` | Triggering event's data field |
| `${fact.factKey}` | Current value of a fact |
| `${var.name}` | Execution variable |
| `${matched.0.data.field}` | Data from matched event in temporal patterns |
| `${lookup.name}` | Result from a data requirement lookup |

### Examples

```typescript
actions: [
  // Event data in topic
  {
    type: 'emit_event',
    topic: 'notification.${event.channel}',
    data: { message: 'Hello' },
  },
  // Event data in fact key
  {
    type: 'set_fact',
    key: 'customer:${event.customerId}:lastOrderDate',
    value: { ref: 'event.date' },
  },
  // Fact value in log message
  {
    type: 'log',
    level: 'info',
    message: 'Customer ${event.customerId} tier: ${fact.customer:${event.customerId}:tier}',
  },
]
```

## Reference Resolution in Actions

References use the `{ ref: 'path' }` syntax for non-string values. Unlike interpolation (which produces strings), references preserve the original type — numbers stay numbers, objects stay objects.

### Interpolation vs References

```typescript
// String interpolation — result is always a string
{ type: 'log', level: 'info', message: 'Total: ${event.total}' }
// message = "Total: 1500"

// Reference — preserves the original type (number)
{ type: 'set_fact', key: 'order:X:total', value: { ref: 'event.total' } }
// value = 1500 (number, not string)
```

Use interpolation for strings that embed values. Use references when you need the actual typed value.

### Reference Paths

| Path | Reads From |
|------|-----------|
| `event.fieldName` | `trigger.data.fieldName` |
| `fact.factKey` | Fact store value at key |
| `var.name` | Execution variable |
| `matched.N.data.field` | Nth matched event from temporal pattern |
| `lookup.name` | Data requirement result |

## Multiple Actions per Rule

A rule's `actions` array can contain any number of actions. They execute in order, and each one can use the results of preceding side effects (like facts set by earlier actions):

```typescript
actions: [
  // 1. Mark the order as confirmed
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:status',
    value: 'confirmed',
  },
  // 2. Record the timestamp
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:confirmedAt',
    value: { ref: 'event.timestamp' },
  },
  // 3. Notify downstream systems
  {
    type: 'emit_event',
    topic: 'order.confirmed',
    data: {
      orderId: { ref: 'event.orderId' },
      customerId: { ref: 'event.customerId' },
    },
  },
  // 4. Log for observability
  {
    type: 'log',
    level: 'info',
    message: 'Order ${event.orderId} confirmed',
  },
]
```

### Execution Order Matters

Actions execute top to bottom. If you need a fact to exist before emitting an event (because the event triggers a rule that reads that fact), order them accordingly.

## Complete Working Example

An e-commerce order processing pipeline with four rules that chain together through events and facts:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'order-pipeline' });

  // Rule 1: When an order is placed, validate and set initial status
  engine.registerRule({
    id: 'order-init',
    name: 'Initialize Order',
    priority: 200,
    enabled: true,
    tags: ['orders'],
    trigger: { type: 'event', topic: 'order.placed' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'pending',
      },
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:total',
        value: { ref: 'event.total' },
      },
      {
        type: 'emit_event',
        topic: 'order.validated',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          total: { ref: 'event.total' },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Order ${event.orderId} initialized (total: ${event.total})',
      },
    ],
  });

  // Rule 2: When order is validated, apply discount for VIP customers
  engine.registerRule({
    id: 'vip-discount',
    name: 'VIP Discount',
    priority: 100,
    enabled: true,
    tags: ['orders', 'pricing'],
    trigger: { type: 'event', topic: 'order.validated' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'eq',
        value: 'vip',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:discount',
        value: 0.1,
      },
      {
        type: 'log',
        level: 'info',
        message: 'Applied 10% VIP discount to order ${event.orderId}',
      },
    ],
  });

  // Rule 3: When order is validated, emit confirmation
  engine.registerRule({
    id: 'order-confirm',
    name: 'Confirm Order',
    priority: 50,
    enabled: true,
    tags: ['orders'],
    trigger: { type: 'event', topic: 'order.validated' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'confirmed',
      },
      {
        type: 'emit_event',
        topic: 'order.confirmed',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
        },
      },
    ],
  });

  // Rule 4: When order status changes, log the transition
  engine.registerRule({
    id: 'status-logger',
    name: 'Order Status Logger',
    priority: 10,
    enabled: true,
    tags: ['orders', 'audit'],
    trigger: { type: 'fact', pattern: 'order:*:status' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Order status changed: ${event.key} = ${event.value} (was: ${event.previousValue})',
      },
    ],
  });

  // Set up customer data
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-200:tier', 'standard');

  // Subscribe to all events for visibility
  engine.subscribe('order.*', (event) => {
    console.log(`[${event.topic}]`, event.data);
  });

  // Place an order for a VIP customer
  console.log('--- VIP Order ---');
  await engine.emit('order.placed', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 250,
  });

  // Check resulting facts
  console.log('Status:', engine.getFact('order:ORD-001:status'));
  // "confirmed"
  console.log('Discount:', engine.getFact('order:ORD-001:discount'));
  // 0.1

  // Place an order for a standard customer
  console.log('\n--- Standard Order ---');
  await engine.emit('order.placed', {
    orderId: 'ORD-002',
    customerId: 'C-200',
    total: 80,
  });

  console.log('Status:', engine.getFact('order:ORD-002:status'));
  // "confirmed"
  console.log('Discount:', engine.getFact('order:ORD-002:discount'));
  // undefined (no VIP discount)

  await engine.stop();
}

main();
```

### What Happens

1. `order.placed` triggers Rule 1, which sets two facts and emits `order.validated`
2. Rule 4 triggers on the fact change `order:ORD-001:status` → logs "pending"
3. `order.validated` triggers Rule 2 (VIP check) and Rule 3 (confirmation)
4. Rule 2 runs first (priority 100 > 50), sets the discount fact
5. Rule 3 updates the status to "confirmed" and emits `order.confirmed`
6. Rule 4 triggers again on the status change → logs "confirmed"

This is forward chaining in action: each step flows naturally into the next without explicit orchestration.

## Exercise

Build a customer loyalty points system with these rules:

1. **Earn Points**: When `purchase.completed` fires, set a fact `loyalty:${customerId}:points` to the event's `points` value. Also emit `loyalty.points_earned` with the customer ID and points.
2. **Log Earn**: When `loyalty.points_earned` fires, log an info message: "Customer X earned Y points".
3. **Cleanup**: When `customer.deactivated` fires, delete both `loyalty:${customerId}:points` and `loyalty:${customerId}:tier` facts. Log a warn message about the deactivation.

Test with: a purchase for customer C-100 with 150 points, then deactivate C-100.

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'loyalty' });

  // Rule 1: Earn points on purchase
  engine.registerRule({
    id: 'earn-points',
    name: 'Earn Loyalty Points',
    priority: 100,
    enabled: true,
    tags: ['loyalty'],
    trigger: { type: 'event', topic: 'purchase.completed' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'loyalty:${event.customerId}:points',
        value: { ref: 'event.points' },
      },
      {
        type: 'emit_event',
        topic: 'loyalty.points_earned',
        data: {
          customerId: { ref: 'event.customerId' },
          points: { ref: 'event.points' },
        },
      },
    ],
  });

  // Rule 2: Log earned points
  engine.registerRule({
    id: 'log-earn',
    name: 'Log Points Earned',
    priority: 100,
    enabled: true,
    tags: ['loyalty', 'audit'],
    trigger: { type: 'event', topic: 'loyalty.points_earned' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Customer ${event.customerId} earned ${event.points} points',
      },
    ],
  });

  // Rule 3: Cleanup on deactivation
  engine.registerRule({
    id: 'deactivate-cleanup',
    name: 'Deactivation Cleanup',
    priority: 100,
    enabled: true,
    tags: ['loyalty', 'lifecycle'],
    trigger: { type: 'event', topic: 'customer.deactivated' },
    conditions: [],
    actions: [
      {
        type: 'delete_fact',
        key: 'loyalty:${event.customerId}:points',
      },
      {
        type: 'delete_fact',
        key: 'loyalty:${event.customerId}:tier',
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Customer ${event.customerId} deactivated — loyalty data cleared',
      },
    ],
  });

  // Test: purchase earns points
  await engine.emit('purchase.completed', { customerId: 'C-100', points: 150 });
  console.log('Points:', engine.getFact('loyalty:C-100:points'));
  // 150

  // Test: deactivation clears data
  await engine.setFact('loyalty:C-100:tier', 'gold');
  await engine.emit('customer.deactivated', { customerId: 'C-100' });
  console.log('Points after deactivation:', engine.getFact('loyalty:C-100:points'));
  // undefined
  console.log('Tier after deactivation:', engine.getFact('loyalty:C-100:tier'));
  // undefined

  await engine.stop();
}

main();
```

Rule 1 sets the fact and emits an event. Rule 2 reacts to that event with a log. Rule 3 deletes two facts and logs a warning. After deactivation, both facts are gone.

</details>

## Summary

- Four core actions: `emit_event` (chain rules), `set_fact` (persist state), `delete_fact` (clean up), `log` (observe)
- Actions execute sequentially within a rule — order matters when later rules depend on preceding side effects
- String interpolation `${expression}` works in all string fields: topics, keys, messages
- References `{ ref: 'path' }` preserve the original type — use them for non-string values in `data` and `value` fields
- Available interpolation sources: `event`, `fact`, `var`, `matched`, `lookup`
- `emit_event` creates forward chains: Rule A emits → Rule B triggers → Rule C emits → ...
- `set_fact` can trigger fact-based rules, creating implicit chains
- Each action produces an `ActionResult` — failures don't stop subsequent actions

---

Next: [Timers and Scheduling](./02-timers.md)
