# Fluent Builder API

The fluent builder is the primary way to write rules in TypeScript. It provides full autocompletion, compile-time type checking, and a readable chaining syntax that mirrors how you think about rules: "when this happens, if these conditions hold, then do these things."

## What You'll Learn

- How to create rules with `Rule.create()` and method chaining
- Trigger helpers: `onEvent()`, `onFact()`, `onTimer()`
- Condition helpers: `event()`, `fact()`, `context()`, `lookup()` with comparison operators
- Action helpers: `emit()`, `setFact()`, `deleteFact()`, `setTimer()`, `cancelTimer()`, `callService()`, `log()`
- The `ref()` function for dynamic value references
- How the builder compares to raw object notation

## Why a Builder?

Consider this rule written as a plain object:

```typescript
engine.registerRule({
  id: 'large-order-alert',
  name: 'Large Order Alert',
  priority: 100,
  enabled: true,
  tags: ['orders', 'alerts'],
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
      topic: 'alert.large_order',
      data: {
        orderId: { ref: 'event.orderId' },
        total: { ref: 'event.total' },
      },
    },
    {
      type: 'log',
      level: 'info',
      message: 'Large order ${event.orderId} detected (${event.total})',
    },
  ],
});
```

The same rule with the fluent builder:

```typescript
import {
  Rule, onEvent, event,
  emit, log, ref,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('large-order-alert')
    .name('Large Order Alert')
    .priority(100)
    .tags('orders', 'alerts')
    .when(onEvent('order.created'))
    .if(event('total').gte(1000))
    .then(emit('alert.large_order', {
      orderId: ref('event.orderId'),
      total: ref('event.total'),
    }))
    .also(log.info('Large order ${event.orderId} detected (${event.total})'))
    .build()
);
```

The builder version is shorter, easier to read, and catches mistakes at compile time — misspelling `onEvent` as `onEvnt` is a TypeScript error, while misspelling `'event'` as `'evnt'` in an object literal passes silently.

## Builder Structure

Every builder chain follows the same pattern:

```text
  Rule.create(id)          ─── required entry point
      │
      ├── .name()          ─── metadata (optional)
      ├── .description()
      ├── .priority()
      ├── .enabled()
      ├── .tags()
      ├── .group()
      ├── .lookup()
      │
      ├── .when()          ─── trigger (required, exactly one)
      │
      ├── .if()            ─── conditions (optional, zero or more)
      ├── .and()
      │
      ├── .then()          ─── actions (required, at least one)
      ├── .also()
      │
      └── .build()         ─── produces the final RuleInput
```

All methods except `.build()` return `this`, so they can be chained in any order. However, the recommended order is: metadata → trigger → conditions → actions → build. This reads naturally and matches the engine's evaluation flow.

## Metadata Methods

```typescript
Rule.create('order-workflow')       // required: unique rule ID
  .name('Order Processing')         // human-readable name (defaults to ID)
  .description('Handles new orders') // free-text description
  .priority(100)                    // evaluation order (higher = first)
  .enabled(true)                    // enable/disable (default: true)
  .tags('orders', 'workflow')       // categorization tags (additive, call multiple times)
  .group('order-rules')             // assign to a rule group
```

### Tags

Tags are additive — calling `.tags()` multiple times appends rather than replaces:

```typescript
Rule.create('my-rule')
  .tags('orders')
  .tags('vip', 'priority')
  // resulting tags: ['orders', 'vip', 'priority']
```

### Priority

Higher priority rules evaluate first. When multiple rules match the same event, the engine evaluates them in descending priority order:

```typescript
// Evaluates before rules with priority < 200
Rule.create('fraud-check').priority(200)

// Evaluates after fraud-check
Rule.create('order-confirm').priority(50)
```

## Trigger Helpers

The `.when()` method accepts a trigger helper or a raw trigger object.

### onEvent(topic)

Triggers when an event with a matching topic is emitted. Supports wildcard patterns:

```typescript
.when(onEvent('order.created'))      // exact match
.when(onEvent('order.*'))            // wildcard: order.created, order.updated, etc.
```

### onFact(pattern)

Triggers when a fact matching the pattern is created or updated:

```typescript
.when(onFact('customer:*:tier'))     // any customer tier change
.when(onFact('config:mode'))         // specific fact key
```

### onTimer(name)

Triggers when a named timer expires:

```typescript
.when(onTimer('payment-timeout'))    // specific timer name
```

### Temporal Patterns

For complex event processing, use the temporal trigger builders (covered in detail in Part 5):

```typescript
import { sequence, absence, count, aggregate } from '@hamicek/noex-rules/dsl';

// Ordered events within a time window
.when(sequence()
  .event('order.created')
  .event('payment.received')
  .within('15m')
  .groupBy('orderId')
)

// Missing expected event
.when(absence()
  .after('order.created')
  .expected('payment.received')
  .within('30m')
  .groupBy('orderId')
)

// Frequency threshold
.when(count()
  .event('auth.login_failed')
  .threshold(5)
  .window('5m')
  .groupBy('userId')
  .sliding()
)

// Numeric aggregation
.when(aggregate()
  .event('order.paid')
  .field('amount')
  .function('sum')
  .threshold(10000)
  .window('1h')
  .groupBy('region')
)
```

## Condition Helpers

The `.if()` and `.and()` methods add conditions. Each condition starts with a source helper and chains a comparison operator.

### Source Helpers

| Helper | Reads From | Example |
|--------|-----------|---------|
| `event(field)` | Triggering event's data | `event('total')`, `event('customer.tier')` |
| `fact(pattern)` | Fact store value | `fact('customer:\${event.customerId}:tier')` |
| `context(key)` | Engine context variable | `context('environment')` |
| `lookup(name)` | Data requirement result | `lookup('credit.score')` |

### Comparison Operators

Every source helper returns a `SourceExpr` with these chainable operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `.eq(value)` | Equal | `event('status').eq('active')` |
| `.neq(value)` | Not equal | `event('type').neq('test')` |
| `.gt(value)` | Greater than | `event('amount').gt(0)` |
| `.gte(value)` | Greater than or equal | `event('total').gte(100)` |
| `.lt(value)` | Less than | `event('quantity').lt(1000)` |
| `.lte(value)` | Less than or equal | `event('age').lte(18)` |
| `.in(values)` | Value in array | `event('country').in(['US', 'CA', 'GB'])` |
| `.notIn(values)` | Value not in array | `event('status').notIn(['cancelled', 'refunded'])` |
| `.contains(value)` | String/array contains | `event('tags').contains('vip')` |
| `.notContains(value)` | Does not contain | `event('name').notContains('test')` |
| `.matches(pattern)` | Regex match | `event('email').matches(/^.+@company\.com$/)` |
| `.exists()` | Value is defined | `event('couponCode').exists()` |
| `.notExists()` | Value is undefined/null | `event('deletedAt').notExists()` |

### Multiple Conditions

Conditions combine with AND logic. Use `.if()` for the first, `.and()` for additional:

```typescript
Rule.create('vip-large-order')
  .when(onEvent('order.created'))
  .if(event('total').gte(500))
  .and(event('customer.tier').eq('vip'))
  .and(event('currency').in(['USD', 'EUR']))
  .then(emit('order.priority'))
  .build();
```

### Cross-Source Conditions

Conditions can reference different sources in the same rule:

```typescript
Rule.create('credit-check')
  .when(onEvent('order.created'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')],
    cache: { ttl: '5m' },
  })
  .if(event('total').gte(1000))
  .and(lookup('credit').gte(700))
  .then(emit('order.approved'))
  .build();
```

### Comparing to References

Operator values can be `ref()` references instead of literals, enabling dynamic comparisons:

```typescript
.if(event('requestedQuantity').lte(ref('fact.inventory:${event.productId}:stock')))
```

## Action Helpers

The `.then()` and `.also()` methods add actions. `.then()` adds the first action, `.also()` adds subsequent ones. They're functionally identical — the distinction is purely for readability.

### emit(topic, data?)

Emits a new event:

```typescript
.then(emit('order.confirmed', {
  orderId: ref('event.orderId'),
  total: ref('event.total'),
  confirmedAt: new Date().toISOString(),
}))
```

Data values can be literals or `ref()` references. The topic supports `${}` interpolation.

### setFact(key, value)

Creates or updates a fact:

```typescript
.then(setFact('order:${event.orderId}:status', 'confirmed'))
.also(setFact('order:${event.orderId}:total', ref('event.total')))
```

The key supports `${}` interpolation. The value can be a literal or `ref()`.

### deleteFact(key)

Removes a fact:

```typescript
.then(deleteFact('order:${event.orderId}:pending'))
```

### setTimer(config)

Schedules a timer. Two syntax options:

**Object config:**

```typescript
.then(setTimer({
  name: 'payment-timeout:${event.orderId}',
  duration: '15m',
  onExpire: {
    topic: 'order.payment_timeout',
    data: { orderId: ref('event.orderId') },
  },
}))
```

**Fluent config:**

```typescript
.then(setTimer('payment-timeout:${event.orderId}')
  .after('15m')
  .emit('order.payment_timeout', { orderId: ref('event.orderId') })
)
```

Both produce the same result. The fluent syntax is shorter for simple timers.

**Repeating timers:**

```typescript
.then(setTimer({
  name: 'health-check',
  duration: '1m',
  onExpire: { topic: 'system.health_check' },
  repeat: { interval: '1m', maxCount: 10 },
}))
```

### cancelTimer(name)

Cancels a pending timer:

```typescript
.then(cancelTimer('payment-timeout:${event.orderId}'))
```

### callService(service)

Calls a registered external service. Two syntax options:

**Fluent:**

```typescript
.then(callService('emailService')
  .method('send')
  .args(ref('event.email'), 'Order Confirmed')
)
```

**Direct:**

```typescript
.then(callService('emailService', 'send', [
  ref('event.email'),
  'Order Confirmed',
]))
```

### log(level, message) / log.level(message)

Outputs a log message:

```typescript
.then(log('info', 'Order ${event.orderId} confirmed'))

// Shorthand helpers:
.then(log.debug('Evaluating rule for ${event.orderId}'))
.then(log.info('Order confirmed'))
.then(log.warn('Unusual amount: ${event.total}'))
.then(log.error('Processing failed for ${event.orderId}'))
```

### conditional(condition)

Executes different actions based on a runtime condition:

```typescript
import { conditional } from '@hamicek/noex-rules/dsl';

.then(conditional(event('total').gte(1000))
  .then(emit('order.premium'))
  .else(emit('order.standard'))
)
```

You can chain `.elseIf()` for multi-branch logic:

```typescript
.then(conditional(event('total').gte(1000))
  .then(emit('order.premium'))
  .elseIf(event('total').gte(100))
  .then(emit('order.standard'))
  .else(emit('order.basic'))
)
```

## The ref() Function

`ref()` creates a runtime reference to a dynamic value. It produces a `{ ref: 'path' }` object that the engine resolves when the action executes.

```typescript
import { ref } from '@hamicek/noex-rules/dsl';

ref('event.orderId')           // triggering event's orderId field
ref('event.customer.name')     // nested field access
ref('fact.config:mode')        // current fact value
ref('matched.0.data.amount')   // first matched event in a temporal pattern
ref('context.environment')     // engine context variable
ref('lookup.credit')           // data requirement result
```

### ref() vs String Interpolation

Both embed dynamic values, but they serve different purposes:

| Feature | `ref('event.total')` | `'${event.total}'` |
|---------|---------------------|---------------------|
| Preserves type | Yes (number stays number) | No (always string) |
| Used in | `data` values, `value` fields | `topic`, `key`, `message` strings |
| Syntax | `{ ref: 'path' }` object | Inline in string |

```typescript
// ref() — total stays as a number
emit('order.confirmed', { total: ref('event.total') })

// interpolation — total becomes a string inside the topic
emit('order.tier_${event.tier}')
```

## Data Requirements (Lookups)

Lookups fetch external data before conditions are evaluated, making it possible to condition on values that aren't in the event or fact store:

```typescript
Rule.create('credit-gate')
  .when(onEvent('loan.requested'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')],
    cache: { ttl: '5m' },
  })
  .if(lookup('credit').gte(700))
  .then(emit('loan.approved'))
  .build();
```

### Lookup Configuration

| Property | Type | Description |
|----------|------|-------------|
| `service` | `string` | Registered service name |
| `method` | `string` | Method to call on the service |
| `args` | `unknown[]` | Arguments (can use `ref()`) |
| `cache.ttl` | `string \| number` | Cache duration (e.g. `'5m'`) |
| `onError` | `'skip' \| 'fail'` | What to do if the lookup fails |

When `onError` is `'skip'`, the rule silently skips if the lookup fails. When `'fail'`, the rule evaluation throws an error.

## Complete Working Example

An e-commerce order pipeline with five rules demonstrating the full range of builder features:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, onTimer,
  event, fact, lookup,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log,
  ref,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({
    name: 'order-pipeline',
    services: {
      emailService: {
        send: async (to: string, subject: string, body: string) => {
          console.log(`Email to ${to}: ${subject}`);
        },
      },
    },
  });

  // Rule 1: Initialize order and start payment timer
  engine.registerRule(
    Rule.create('order-init')
      .name('Initialize Order')
      .priority(200)
      .tags('orders', 'workflow')
      .when(onEvent('order.created'))
      .if(event('total').gt(0))
      .then(setFact('order:${event.orderId}:status', 'pending'))
      .also(setFact('order:${event.orderId}:total', ref('event.total')))
      .also(setTimer({
        name: 'payment-timeout:${event.orderId}',
        duration: '15m',
        onExpire: {
          topic: 'order.payment_timeout',
          data: { orderId: ref('event.orderId') },
        },
      }))
      .also(log.info('Order ${event.orderId} initialized'))
      .build()
  );

  // Rule 2: Process payment — cancel timer, update status, notify
  engine.registerRule(
    Rule.create('payment-received')
      .name('Process Payment')
      .priority(150)
      .tags('orders', 'payments')
      .when(onEvent('payment.confirmed'))
      .if(fact('order:${event.orderId}:status').eq('pending'))
      .then(cancelTimer('payment-timeout:${event.orderId}'))
      .also(setFact('order:${event.orderId}:status', 'paid'))
      .also(emit('order.paid', {
        orderId: ref('event.orderId'),
        amount: ref('event.amount'),
      }))
      .also(log.info('Payment received for order ${event.orderId}'))
      .build()
  );

  // Rule 3: Handle payment timeout — cancel order
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout')
      .priority(100)
      .tags('orders', 'timeout')
      .when(onEvent('order.payment_timeout'))
      .if(fact('order:${event.orderId}:status').eq('pending'))
      .then(setFact('order:${event.orderId}:status', 'cancelled'))
      .also(deleteFact('order:${event.orderId}:total'))
      .also(log.warn('Order ${event.orderId} cancelled due to payment timeout'))
      .build()
  );

  // Rule 4: Send confirmation email on successful payment
  engine.registerRule(
    Rule.create('send-confirmation')
      .name('Send Confirmation Email')
      .priority(50)
      .tags('orders', 'notifications')
      .when(onEvent('order.paid'))
      .then(callService('emailService')
        .method('send')
        .args(ref('event.email'), 'Order Confirmed', 'Your order has been paid.')
      )
      .build()
  );

  // Rule 5: Log all order status transitions
  engine.registerRule(
    Rule.create('status-audit')
      .name('Order Status Audit')
      .priority(10)
      .tags('orders', 'audit')
      .when(onFact('order:*:status'))
      .then(log.info('Status change: ${event.key} → ${event.value}'))
      .build()
  );

  // --- Run the pipeline ---
  console.log('--- Place order ---');
  await engine.emit('order.created', {
    orderId: 'ORD-100',
    total: 249.99,
    email: 'customer@example.com',
  });

  console.log('Status:', engine.getFact('order:ORD-100:status'));
  // "pending"

  console.log('\n--- Confirm payment ---');
  await engine.emit('payment.confirmed', {
    orderId: 'ORD-100',
    amount: 249.99,
    email: 'customer@example.com',
  });

  console.log('Status:', engine.getFact('order:ORD-100:status'));
  // "paid"

  await engine.stop();
}

main();
```

### Execution Flow

```text
  order.created
      │
      ▼
  Rule 1 (order-init)
  ├── setFact  order:ORD-100:status = "pending"
  ├── setFact  order:ORD-100:total = 249.99
  ├── setTimer payment-timeout:ORD-100 (15m)
  └── log      "Order ORD-100 initialized"
      │
      ├──────── fact change triggers Rule 5 (status-audit)
      │         └── log "Status change: order:ORD-100:status → pending"
      │
      ▼
  payment.confirmed
      │
      ▼
  Rule 2 (payment-received)
  ├── cancelTimer payment-timeout:ORD-100
  ├── setFact     order:ORD-100:status = "paid"
  ├── emit        order.paid
  └── log         "Payment received for order ORD-100"
      │
      ├──────── fact change triggers Rule 5
      │         └── log "Status change: order:ORD-100:status → paid"
      │
      ├──────── order.paid triggers Rule 4 (send-confirmation)
      │         └── callService emailService.send(...)
      │
      ▼
  Pipeline complete
```

## Exercise

Convert the following three raw-object rules into fluent builder syntax. The rules implement a customer loyalty tier system:

1. When `purchase.completed` fires and the purchase `amount` is >= 50, set a fact `loyalty:${customerId}:points` to the event's `points` value and emit `loyalty.updated`.
2. When `loyalty.updated` fires and `fact loyalty:${customerId}:points` >= 1000, set fact `loyalty:${customerId}:tier` to `'gold'` and log an info message.
3. When a fact matching `loyalty:*:tier` changes, emit `notification.tier_change` with the customer data.

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, onEvent, onFact,
  event, fact,
  emit, setFact, log, ref,
} from '@hamicek/noex-rules/dsl';

// Rule 1: Earn points
const earnPoints = Rule.create('earn-points')
  .name('Earn Loyalty Points')
  .priority(100)
  .tags('loyalty')
  .when(onEvent('purchase.completed'))
  .if(event('amount').gte(50))
  .then(setFact('loyalty:${event.customerId}:points', ref('event.points')))
  .also(emit('loyalty.updated', {
    customerId: ref('event.customerId'),
    points: ref('event.points'),
  }))
  .build();

// Rule 2: Gold tier upgrade
const goldUpgrade = Rule.create('gold-upgrade')
  .name('Gold Tier Upgrade')
  .priority(80)
  .tags('loyalty', 'tiers')
  .when(onEvent('loyalty.updated'))
  .if(fact('loyalty:${event.customerId}:points').gte(1000))
  .then(setFact('loyalty:${event.customerId}:tier', 'gold'))
  .also(log.info('Customer ${event.customerId} upgraded to gold'))
  .build();

// Rule 3: Tier change notification
const tierNotify = Rule.create('tier-notify')
  .name('Tier Change Notification')
  .priority(50)
  .tags('loyalty', 'notifications')
  .when(onFact('loyalty:*:tier'))
  .then(emit('notification.tier_change', {
    factKey: ref('trigger.fact.key'),
    newTier: ref('trigger.fact.value'),
  }))
  .build();

// Register all rules
[earnPoints, goldUpgrade, tierNotify].forEach(r => engine.registerRule(r));
```

The builder version is roughly 40% shorter than the raw object equivalent and catches structural errors (missing trigger, no actions) at build time via `DslValidationError`.

</details>

## Summary

- `Rule.create(id)` starts a builder chain; `.build()` produces a validated `RuleInput`
- Metadata methods (`.name()`, `.priority()`, `.tags()`, `.group()`, `.enabled()`, `.description()`) are optional and chainable
- Trigger helpers `onEvent()`, `onFact()`, `onTimer()` replace raw trigger objects
- Temporal triggers (`sequence()`, `absence()`, `count()`, `aggregate()`) handle complex event processing patterns
- Condition helpers (`event()`, `fact()`, `context()`, `lookup()`) provide type-safe operators: `.eq()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`, `.in()`, `.notIn()`, `.contains()`, `.notContains()`, `.matches()`, `.exists()`, `.notExists()`
- `.if()` sets the first condition, `.and()` adds more (all conditions use AND logic)
- Action helpers `emit()`, `setFact()`, `deleteFact()`, `setTimer()`, `cancelTimer()`, `callService()`, `log()` replace raw action objects
- `.then()` sets the first action, `.also()` adds more
- `ref('path')` creates a typed runtime reference; `${}` interpolation works in string fields (topics, keys, messages)
- The `.lookup()` method declares data requirements fetched before condition evaluation
- `conditional()` enables if/then/else branching within actions
- The builder throws `DslValidationError` on invalid input (missing ID, trigger, or actions)

---

Next: [Tagged Template Literals](./02-tagged-templates.md)
