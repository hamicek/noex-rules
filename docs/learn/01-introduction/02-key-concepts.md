# Key Concepts

Before diving into code, let's establish a clear mental model of how noex-rules works. The engine has a small number of core concepts that compose into powerful behavior. Understanding them now will make everything else straightforward.

## What You'll Learn

- What rules are and how the trigger-condition-action model works
- The difference between facts (persistent state) and events (one-time signals)
- How timers enable scheduled and time-based logic
- What forward chaining means and why the engine uses it
- How Complex Event Processing detects patterns across events

## The Engine at a Glance

```text
                        ┌───────────────────────────────────────────┐
                        │               RULE ENGINE                  │
                        │                                            │
  ┌──────────┐          │  ┌────────────┐       ┌────────────────┐  │
  │  Events  │────────► │  │  Trigger   │──────►│   Condition    │  │
  │ emit()   │          │  │  Matcher   │       │   Evaluator    │  │
  └──────────┘          │  └────────────┘       └───────┬────────┘  │
                        │        ▲                      │           │
  ┌──────────┐          │        │                      ▼           │
  │  Facts   │────────► │  ┌─────┴──────┐       ┌────────────────┐  │
  │ setFact()│          │  │   Rule     │       │    Action      │  │
  └──────────┘          │  │   Store    │       │    Executor    │  │
                        │  └────────────┘       └───────┬────────┘  │
  ┌──────────┐          │        ▲                      │           │
  │  Timers  │────────► │  ┌─────┴──────┐       ┌───────▼────────┐  │
  │ expired  │          │  │  Temporal  │       │   Side Effects │  │
  └──────────┘          │  │ Processor  │       │  set_fact      │  │
                        │  └────────────┘       │  emit_event    │  │
                        │                       │  set_timer     │  │
                        │                       │  call_service  │  │
                        │                       │  log           │  │
                        │                       └────────────────┘  │
                        └───────────────────────────────────────────┘
```

When something happens (an event arrives, a fact changes, a timer expires), the engine finds all rules whose trigger matches, evaluates their conditions, and executes the actions of those that pass.

## Rules

A rule is the fundamental unit. It declares *when* to activate, *whether* to fire, and *what* to do:

```typescript
{
  id: 'order-notification',
  name: 'Notify on Large Orders',
  priority: 100,             // Higher = evaluated first
  enabled: true,
  tags: ['orders', 'notifications'],

  trigger: {                 // WHEN: an order.created event arrives
    type: 'event',
    topic: 'order.created',
  },

  conditions: [              // WHETHER: amount >= 1000
    {
      source: { type: 'event', field: 'amount' },
      operator: 'gte',
      value: 1000,
    },
  ],

  actions: [                 // WHAT: emit a notification event
    {
      type: 'emit_event',
      topic: 'notification.send',
      data: {
        orderId: { ref: 'event.orderId' },
        message: 'Large order received',
      },
    },
  ],
}
```

### Rule Properties

| Property | Purpose |
|----------|---------|
| `id` | Unique identifier |
| `name` | Human-readable label |
| `priority` | Evaluation order — higher numbers first |
| `enabled` | Toggle without removing the rule |
| `tags` | Labels for filtering and organization |
| `group` | Optional group membership for bulk control |
| `trigger` | What activates the rule |
| `conditions` | All must pass for the rule to fire |
| `actions` | What happens when the rule fires |
| `lookups` | Optional external data requirements |

## Triggers

A trigger defines *when* a rule should be considered for evaluation. There are four trigger types:

### Event Trigger

Activates when an event with a matching topic arrives:

```typescript
{ type: 'event', topic: 'order.created' }
```

### Fact Trigger

Activates when a fact matching the pattern changes:

```typescript
{ type: 'fact', pattern: 'customer:*:tier' }
```

The `*` wildcard matches any segment, so this fires for `customer:123:tier`, `customer:456:tier`, etc.

### Timer Trigger

Activates when a named timer expires:

```typescript
{ type: 'timer', name: 'payment-timeout:ORD-123' }
```

### Temporal Trigger

Activates when a Complex Event Processing pattern is detected:

```typescript
{
  type: 'temporal',
  pattern: {
    type: 'sequence',
    events: [
      { topic: 'order.created' },
      { topic: 'payment.received' },
    ],
    within: '30m',
    groupBy: 'orderId',
  },
}
```

We'll cover temporal patterns in depth in [Part 5: CEP](../05-cep/01-what-is-cep.md).

### Trigger Comparison

| Trigger Type | Activates On | Use Case |
|-------------|-------------|----------|
| `event` | Event emitted | React to something that happened |
| `fact` | Fact value changed | React to state changes |
| `timer` | Timer expired | Scheduled/delayed logic |
| `temporal` | Pattern detected | Multi-event correlation |

## Facts

Facts represent the persistent state the engine reasons about. They are key-value pairs that survive across rule evaluations:

```typescript
// Set facts
await engine.setFact('customer:C-100:tier', 'vip');
await engine.setFact('customer:C-100:spending', 4250);
await engine.setFact('inventory:SKU-42:quantity', 15);

// Read facts
const tier = engine.getFact('customer:C-100:tier');  // 'vip'

// Query facts with wildcard patterns
const customerFacts = engine.queryFacts('customer:C-100:*');
// Returns all facts matching the pattern

// Delete facts
engine.deleteFact('customer:C-100:spending');
```

### Key Format Convention

Fact keys use a hierarchical colon-separated format: `entity:id:field`. This enables wildcard queries:

```text
customer:C-100:tier          ──► specific customer field
customer:C-100:*             ──► all fields for customer C-100
customer:*:tier              ──► tier for all customers
order:ORD-1:*                ──► all fields for order ORD-1
```

### Facts vs Events

| | Facts | Events |
|---|-------|--------|
| **Persistence** | Remain until changed or deleted | Fire once and are consumed |
| **Trigger** | Trigger rules when value changes | Trigger rules when emitted |
| **Access** | Readable from conditions at any time | Data available only during triggered evaluation |
| **Analogy** | "The customer *is* VIP" (current state) | "An order *was* created" (something happened) |

**Key insight**: Use facts for state that other rules need to reference later. Use events for signals that drive immediate reactions.

## Events

Events are one-time signals that flow through the engine. When you emit an event, the engine finds all rules whose trigger matches the topic and evaluates them:

```typescript
// Emit an event
await engine.emit('order.created', {
  orderId: 'ORD-123',
  customerId: 'C-100',
  total: 750,
  items: ['SKU-42', 'SKU-17'],
});

// Subscribe to events (including those emitted by rules)
engine.subscribe('order.*', (event) => {
  console.log(event.topic, event.data);
});

// Emit with correlation tracking
await engine.emitCorrelated(
  'payment.received',
  { orderId: 'ORD-123', amount: 750 },
  'correlation-123',  // Links related events together
);
```

Events carry:
- **topic**: A dot-separated string like `order.created`, `payment.failed`
- **data**: An arbitrary payload accessible in conditions and actions
- **timestamp**: When the event was emitted
- **correlationId** (optional): Links related events for tracing

## Conditions

Conditions determine whether a rule should fire. A rule's conditions must *all* pass (logical AND):

```typescript
conditions: [
  // Check a value from the triggering event
  {
    source: { type: 'event', field: 'total' },
    operator: 'gte',
    value: 100,
  },
  // Check a persistent fact
  {
    source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
    operator: 'eq',
    value: 'vip',
  },
]
```

### Condition Sources

| Source | Reads From | Example |
|--------|-----------|---------|
| `event` | Triggering event data | `{ type: 'event', field: 'amount' }` |
| `fact` | Fact store | `{ type: 'fact', pattern: 'customer:123:tier' }` |
| `context` | Engine context variables | `{ type: 'context', key: 'environment' }` |
| `lookup` | External service result | `{ type: 'lookup', name: 'userService' }` |
| `baseline` | Anomaly detection baseline | `{ type: 'baseline', metric: 'avg_order_value', comparison: 'above' }` |

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq`, `neq` | Equality / inequality | `value: 'vip'` |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison | `value: 100` |
| `in`, `not_in` | List membership | `value: ['vip', 'gold']` |
| `contains`, `not_contains` | String/array contains | `value: 'express'` |
| `matches` | Regular expression | `value: '^ORD-\\d+'` |
| `exists`, `not_exists` | Value presence | (value is ignored) |

### References

Instead of static values, conditions can reference other data:

```typescript
{
  source: { type: 'event', field: 'shippingCountry' },
  operator: 'neq',
  value: { ref: 'fact.customer:${event.customerId}:country' },
}
```

This compares the event's shipping country against the customer's stored country — useful for fraud detection.

## Actions

Actions define what happens when a rule fires. They execute in order:

```typescript
actions: [
  // Update persistent state
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:status',
    value: 'approved',
  },
  // Emit an event (can trigger other rules)
  {
    type: 'emit_event',
    topic: 'order.approved',
    data: { orderId: { ref: 'event.orderId' } },
  },
  // Schedule a future action
  {
    type: 'set_timer',
    timer: {
      name: 'shipping-reminder:${event.orderId}',
      duration: '24h',
      onExpire: {
        topic: 'shipping.reminder',
        data: { orderId: { ref: 'event.orderId' } },
      },
    },
  },
  // Log for debugging
  {
    type: 'log',
    level: 'info',
    message: 'Order ${event.orderId} approved',
  },
]
```

### Available Actions

| Action | Effect |
|--------|--------|
| `set_fact` | Create or update a fact |
| `delete_fact` | Remove a fact |
| `emit_event` | Emit a new event (can trigger other rules) |
| `set_timer` | Schedule a future event |
| `cancel_timer` | Cancel a scheduled timer |
| `call_service` | Invoke a registered external service |
| `log` | Write a log message |
| `conditional` | Execute actions conditionally (if/then/else) |

## Timers

Timers schedule future actions. When a timer expires, it emits an event that can trigger rules:

```typescript
// Set a timer via the engine API
await engine.setTimer({
  name: 'payment-timeout:ORD-123',
  duration: '30m',                    // Supports: ms, s, m, h, d, w, y
  onExpire: {
    topic: 'payment.timeout',
    data: { orderId: 'ORD-123' },
  },
});

// Cancel if payment arrives in time
await engine.cancelTimer('payment-timeout:ORD-123');
```

Timers are commonly set and cancelled by rule actions, creating reactive workflows:

```text
  order.created ──► Rule: "Set Payment Timer"
                     └── set_timer('payment-timeout:ORD-X', '30m')

  payment.received ──► Rule: "Cancel Payment Timer"
                        └── cancel_timer('payment-timeout:ORD-X')

  timer expires ──► Rule: "Handle Payment Timeout"
                     └── emit_event('order.cancelled', reason: 'payment_timeout')
```

## Forward Chaining

noex-rules is a **forward chaining** engine. This means evaluation is driven by incoming data, not by querying for conclusions.

```text
FORWARD CHAINING (data-driven)
══════════════════════════════
  Data arrives ──► Engine finds matching rules ──► Evaluates conditions ──► Executes actions
       │                                                                         │
       │                                                                         │
       └────── New facts/events from actions trigger further rule evaluation ─────┘
```

When a rule's action sets a fact or emits an event, this can trigger other rules, creating a chain of inference. The engine handles this automatically.

**Example chain:**

```text
  event: order.created
       │
       ▼
  Rule: "VIP Discount" ──► sets fact: order:ORD-1:discount = 0.1
                                  │
                                  ▼
                            Rule: "Discount Applied" ──► emits event: discount.applied
                                                                │
                                                                ▼
                                                          Rule: "Log Discount" ──► log()
```

The developer registers three independent rules. The engine chains them automatically based on their triggers.

## Complex Event Processing (CEP)

Sometimes a single event isn't enough. You need to detect patterns across multiple events over time:

- **Sequence**: "Order created, then payment received within 30 minutes"
- **Absence**: "Order created, but no payment within 30 minutes"
- **Count**: "More than 5 failed logins within 10 minutes"
- **Aggregate**: "Total transaction amount exceeds $10,000 within 1 hour"

These are temporal patterns, and they're expressed as triggers:

```typescript
// Detect 5+ failed logins in 10 minutes from the same IP
{
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'count',
      event: { topic: 'auth.login_failed' },
      threshold: 5,
      comparison: 'gte',
      window: '10m',
      groupBy: 'ip',
    },
  },
  conditions: [],
  actions: [
    {
      type: 'emit_event',
      topic: 'security.brute_force',
      data: { ip: { ref: 'event.ip' } },
    },
  ],
}
```

We'll explore all four CEP patterns in detail in [Part 5](../05-cep/01-what-is-cep.md).

## How Concepts Map to Real-World Problems

| Concept | Real-World Analogy | Example |
|---------|--------------------|---------|
| **Rule** | A policy in a manual | "If order > $500, apply free shipping" |
| **Event** | Something that happened | "A customer placed an order" |
| **Fact** | Something that's true right now | "Customer C-100 is a VIP" |
| **Timer** | A reminder or deadline | "If not paid in 30 min, cancel order" |
| **Condition** | A check before acting | "Is the customer a VIP?" |
| **Action** | The response | "Apply 10% discount" |
| **Forward Chaining** | Domino effect | "Discount applied" triggers "Send confirmation" |
| **CEP Pattern** | Surveillance camera playback | "5 failed logins in 10 min = lock account" |

## Exercise

Using the concepts from this chapter, classify the following business requirement into the appropriate engine components.

**Requirement**: "When a customer places an order, check if they're a VIP. If they are and the order exceeds $200, apply a 15% discount and send a confirmation email. Also, if the order isn't shipped within 48 hours, notify the warehouse manager."

Identify:
1. What events are involved?
2. What facts does the engine need?
3. How many rules does this need?
4. What triggers, conditions, and actions does each rule have?
5. Where do timers fit in?

<details>
<summary>Solution</summary>

**Events:**
- `order.created` (incoming)
- `discount.applied` (emitted by rule)
- `email.send` (emitted by rule)
- `order.shipped` (incoming, from warehouse)
- `shipping.overdue` (emitted by timer expiration)

**Facts:**
- `customer:{id}:tier` — stores the customer's tier ("vip", "standard")
- `order:{id}:discount` — stores the applied discount

**Rule 1: VIP Discount**
- Trigger: event `order.created`
- Conditions: fact `customer:{customerId}:tier` eq "vip" AND event `total` gt 200
- Actions: set fact `order:{orderId}:discount` = 0.15, emit event `discount.applied`

**Rule 2: Order Confirmation Email**
- Trigger: event `discount.applied`
- Conditions: (none — always send when a discount is applied)
- Actions: emit event `email.send` with template "order_confirmation_vip"

**Rule 3: Set Shipping Timer**
- Trigger: event `order.created`
- Conditions: (none — always set a timer for new orders)
- Actions: set timer `shipping-deadline:{orderId}` for 48h, on expire emit `shipping.overdue`

**Rule 4: Cancel Shipping Timer**
- Trigger: event `order.shipped`
- Conditions: (none)
- Actions: cancel timer `shipping-deadline:{orderId}`

**Rule 5: Notify Warehouse Manager**
- Trigger: event `shipping.overdue`
- Conditions: (none)
- Actions: emit event `email.send` with template "shipping_overdue_alert"

Notice how Rule 1 and Rule 2 form a forward chain: the discount rule emits an event that triggers the email rule. Rules 3-5 demonstrate the timer pattern for deadline enforcement.

</details>

## Summary

- A **rule** is a trigger-condition-action triplet: the engine's fundamental unit
- **Events** are one-time signals ("something happened"), **facts** are persistent state ("something is true")
- **Timers** schedule future events, enabling deadline and reminder workflows
- **Conditions** check event data, facts, context, and external lookups using a rich set of operators
- **Actions** modify facts, emit events, manage timers, call services, and log
- **Forward chaining** means data drives evaluation — new data from actions can trigger further rules
- **CEP patterns** detect temporal correlations: sequences, absences, counts, and aggregates
- All concepts compose naturally: events trigger rules that set facts that trigger more rules

---

Next: [Your First Rule Engine](../02-getting-started/01-first-engine.md)
