# Migration Guide: Raw Objects to DSL

This guide shows how to convert rule definitions from raw `RuleInput` objects to the fluent DSL builder API.
Both approaches produce identical output — the DSL is purely syntactic sugar.

## Import

```typescript
// Raw objects — only types needed
import type { RuleInput } from '@hamicek/noex-rules';

// DSL — import helpers you need
import {
  Rule, onEvent, onFact, onTimer,
  sequence, absence, count, aggregate,
  event, fact, context,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log,
  ref,
} from '@hamicek/noex-rules/dsl';
```

---

## Triggers

### Event trigger

```typescript
// Before
trigger: { type: 'event', topic: 'order.created' }

// After
.when(onEvent('order.created'))
```

### Fact trigger

```typescript
// Before
trigger: { type: 'fact', pattern: 'customer:*:totalSpent' }

// After
.when(onFact('customer:*:totalSpent'))
```

### Timer trigger

```typescript
// Before
trigger: { type: 'timer', name: 'payment-timeout:*' }

// After
.when(onTimer('payment-timeout:*'))
```

### Sequence (CEP)

```typescript
// Before
trigger: {
  type: 'temporal',
  pattern: {
    type: 'sequence',
    events: [
      { topic: 'auth.login_failed' },
      { topic: 'auth.login_failed' },
      { topic: 'auth.login_failed' },
    ],
    within: '5m',
    groupBy: 'data.userId',
  },
}

// After
.when(
  sequence()
    .event('auth.login_failed')
    .event('auth.login_failed')
    .event('auth.login_failed')
    .within('5m')
    .groupBy('data.userId')
)
```

### Absence (CEP)

```typescript
// Before
trigger: {
  type: 'temporal',
  pattern: {
    type: 'absence',
    after: { topic: 'order.created' },
    expected: { topic: 'payment.received' },
    within: '15m',
    groupBy: 'orderId',
  },
}

// After
.when(
  absence()
    .after('order.created')
    .expected('payment.received')
    .within('15m')
    .groupBy('orderId')
)
```

### Count (CEP)

```typescript
// Before
trigger: {
  type: 'temporal',
  pattern: {
    type: 'count',
    event: { topic: 'error.*', filter: { severity: 'critical' } },
    threshold: 10,
    comparison: 'gte',
    window: '1m',
    sliding: true,
  },
}

// After
.when(
  count()
    .event('error.*', { severity: 'critical' })
    .threshold(10)
    .comparison('gte')
    .window('1m')
    .sliding()
)
```

### Aggregate (CEP)

```typescript
// Before
trigger: {
  type: 'temporal',
  pattern: {
    type: 'aggregate',
    event: { topic: 'transaction.completed' },
    field: 'data.amount',
    function: 'sum',
    threshold: 10000,
    comparison: 'gte',
    window: '1h',
    groupBy: 'data.accountId',
  },
}

// After
.when(
  aggregate()
    .event('transaction.completed')
    .field('data.amount')
    .function('sum')
    .threshold(10000)
    .comparison('gte')
    .window('1h')
    .groupBy('data.accountId')
)
```

---

## Conditions

All conditions use source selectors (`event()`, `fact()`, `context()`) followed by an operator.

### Source selectors

```typescript
// Before
{ source: { type: 'event', field: 'amount' }, ... }
{ source: { type: 'fact', pattern: 'order:${event.orderId}:status' }, ... }
{ source: { type: 'context', key: 'threshold' }, ... }

// After
event('amount')
fact('order:${event.orderId}:status')
context('threshold')
```

### Operators

| Raw `operator` | DSL method | Example |
|---|---|---|
| `'eq'` | `.eq(value)` | `event('status').eq('active')` |
| `'neq'` | `.neq(value)` | `fact('...status').neq('cancelled')` |
| `'gt'` | `.gt(value)` | `event('count').gt(0)` |
| `'gte'` | `.gte(value)` | `event('amount').gte(100)` |
| `'lt'` | `.lt(value)` | `event('quantity').lt(50)` |
| `'lte'` | `.lte(value)` | `context('threshold').lte(ref('event.amount'))` |
| `'in'` | `.in(array)` | `fact('...status').in(['paid', 'processing'])` |
| `'not_in'` | `.notIn(array)` | `event('tier').notIn(['banned'])` |
| `'contains'` | `.contains(value)` | `event('tags').contains('urgent')` |
| `'not_contains'` | `.notContains(value)` | `event('roles').notContains('admin')` |
| `'matches'` | `.matches(regex)` | `event('email').matches(/^[a-z]+@example\.com$/)` |
| `'exists'` | `.exists()` | `fact('...paymentId').exists()` |
| `'not_exists'` | `.notExists()` | `context('override').notExists()` |

### Multiple conditions

Use `.if()` for the first condition and `.and()` for subsequent ones. All conditions use AND logic.

```typescript
// Before
conditions: [
  { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 100 },
  { source: { type: 'event', field: 'currency' }, operator: 'eq', value: 'USD' },
]

// After
.if(event('amount').gte(100))
.and(event('currency').eq('USD'))
```

### Dynamic references in condition values

Use `ref()` instead of `{ ref: '...' }`:

```typescript
// Before
{ source: { type: 'context', key: 'threshold' }, operator: 'lte', value: { ref: 'event.amount' } }

// After
.if(context('threshold').lte(ref('event.amount')))
```

---

## Actions

### Emit event

```typescript
// Before
{
  type: 'emit_event',
  topic: 'notification.send',
  data: {
    orderId: { ref: 'event.orderId' },
    message: 'Order received!',
  },
}

// After
emit('notification.send', {
  orderId: ref('event.orderId'),
  message: 'Order received!',
})
```

### Set fact

```typescript
// Before (literal)
{ type: 'set_fact', key: 'order:${event.orderId}:status', value: 'paid' }

// After (literal)
setFact('order:${event.orderId}:status', 'paid')

// Before (ref)
{ type: 'set_fact', key: 'order:${event.orderId}:paidAt', value: { ref: 'event.timestamp' } }

// After (ref)
setFact('order:${event.orderId}:paidAt', ref('event.timestamp'))
```

### Delete fact

```typescript
// Before
{ type: 'delete_fact', key: 'temp:${event.id}' }

// After
deleteFact('temp:${event.id}')
```

### Set timer

Two styles available — options object or fluent API.

```typescript
// Before
{
  type: 'set_timer',
  timer: {
    name: 'payment-timeout:${event.orderId}',
    duration: '15m',
    onExpire: {
      topic: 'order.payment_timeout',
      data: { orderId: { ref: 'event.orderId' } },
    },
  },
}

// After (options object — direct translation)
setTimer({
  name: 'payment-timeout:${event.orderId}',
  duration: '15m',
  onExpire: {
    topic: 'order.payment_timeout',
    data: { orderId: ref('event.orderId') },
  },
})

// After (fluent — more readable for complex timers)
setTimer('payment-timeout:${event.orderId}')
  .after('15m')
  .emit('order.payment_timeout', { orderId: ref('event.orderId') })
```

Fluent style also supports repeat configuration:

```typescript
setTimer('reminder:${event.userId}')
  .after('24h')
  .emit('user.reminder', { userId: ref('event.userId') })
  .repeat('1h', 3)
```

### Cancel timer

```typescript
// Before
{ type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' }

// After
cancelTimer('payment-timeout:${event.orderId}')
```

### Call service

```typescript
// Before
{
  type: 'call_service',
  service: 'emailService',
  method: 'send',
  args: [{ ref: 'event.email' }, 'Welcome!'],
}

// After (direct)
callService('emailService', 'send', [ref('event.email'), 'Welcome!'])

// After (fluent)
callService('paymentService')
  .method('processRefund')
  .args(ref('event.orderId'), ref('event.amount'))
```

### Log

```typescript
// Before
{ type: 'log', level: 'info', message: 'Order ${event.orderId} processed' }

// After
log('info', 'Order ${event.orderId} processed')

// Shorthand
log.info('Order ${event.orderId} processed')
log.error('Payment failed for ${event.customerId}')
```

---

## Multiple actions

Use `.then()` for the first action and `.also()` for subsequent ones.

```typescript
// Before
actions: [
  { type: 'set_fact', key: 'user:${event.userId}:active', value: true },
  { type: 'emit_event', topic: 'welcome.send', data: { userId: { ref: 'event.userId' } } },
  { type: 'log', level: 'info', message: 'User ${event.userId} registered' },
]

// After
.then(setFact('user:${event.userId}:active', true))
.also(emit('welcome.send', { userId: ref('event.userId') }))
.also(log('info', 'User ${event.userId} registered'))
```

---

## Rule metadata

```typescript
// Before
{
  id: 'order-notification',
  name: 'Send Order Notification',
  description: 'Notifies on large orders',
  priority: 100,
  enabled: true,
  tags: ['orders', 'notifications'],
  trigger: ...,
  conditions: [...],
  actions: [...],
}

// After
Rule.create('order-notification')
  .name('Send Order Notification')
  .description('Notifies on large orders')
  .priority(100)
  .tags('orders', 'notifications')
  .when(...)
  .if(...)
  .then(...)
  .build()
```

Defaults applied by the builder when methods are omitted:

| Field | Default |
|---|---|
| `name` | Same as `id` |
| `priority` | `0` |
| `enabled` | `true` |
| `tags` | `[]` |
| `conditions` | `[]` |

---

## Complete example: Order flow

### Before (raw objects)

```typescript
const rules: RuleInput[] = [
  {
    id: 'order-created-init',
    name: 'Initialize Order',
    priority: 100,
    enabled: true,
    tags: ['order', 'init'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [
      { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'pending_payment' },
      { type: 'set_fact', key: 'order:${event.orderId}:customerId', value: { ref: 'event.customerId' } },
      { type: 'set_fact', key: 'order:${event.orderId}:amount', value: { ref: 'event.amount' } },
      {
        type: 'set_timer',
        timer: {
          name: 'payment-timeout:${event.orderId}',
          duration: '15m',
          onExpire: {
            topic: 'order.payment_timeout',
            data: { orderId: { ref: 'event.orderId' } }
          }
        }
      }
    ]
  },

  {
    id: 'payment-received',
    name: 'Handle Payment',
    priority: 100,
    enabled: true,
    tags: ['order', 'payment'],
    trigger: { type: 'event', topic: 'payment.confirmed' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
        operator: 'eq',
        value: 'pending_payment'
      }
    ],
    actions: [
      { type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' },
      { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'paid' },
      { type: 'set_fact', key: 'order:${event.orderId}:paidAt', value: { ref: 'event.timestamp' } },
      { type: 'set_fact', key: 'order:${event.orderId}:paymentId', value: { ref: 'event.paymentId' } },
      {
        type: 'emit_event',
        topic: 'order.paid',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          amount: { ref: 'event.amount' }
        }
      }
    ]
  },

  {
    id: 'vip-benefits',
    name: 'VIP Benefits',
    priority: 80,
    enabled: true,
    tags: ['order', 'vip'],
    trigger: { type: 'event', topic: 'order.paid' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'eq',
        value: 'vip'
      }
    ],
    actions: [
      { type: 'set_fact', key: 'order:${event.orderId}:vipDiscount', value: 10 },
      {
        type: 'emit_event',
        topic: 'vip.benefit_applied',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          benefit: 'discount'
        }
      }
    ]
  },
];

for (const rule of rules) {
  engine.registerRule(rule);
}
```

### After (DSL)

```typescript
engine.registerRule(
  Rule.create('order-created-init')
    .name('Initialize Order')
    .priority(100)
    .tags('order', 'init')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending_payment'))
    .also(setFact('order:${event.orderId}:customerId', ref('event.customerId')))
    .also(setFact('order:${event.orderId}:amount', ref('event.amount')))
    .also(setTimer({
      name: 'payment-timeout:${event.orderId}',
      duration: '15m',
      onExpire: {
        topic: 'order.payment_timeout',
        data: { orderId: ref('event.orderId') },
      },
    }))
    .build()
);

engine.registerRule(
  Rule.create('payment-received')
    .name('Handle Payment')
    .priority(100)
    .tags('order', 'payment')
    .when(onEvent('payment.confirmed'))
    .if(fact('order:${event.orderId}:status').eq('pending_payment'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .also(setFact('order:${event.orderId}:status', 'paid'))
    .also(setFact('order:${event.orderId}:paidAt', ref('event.timestamp')))
    .also(setFact('order:${event.orderId}:paymentId', ref('event.paymentId')))
    .also(emit('order.paid', {
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
      amount: ref('event.amount'),
    }))
    .build()
);

engine.registerRule(
  Rule.create('vip-benefits')
    .name('VIP Benefits')
    .priority(80)
    .tags('order', 'vip')
    .when(onEvent('order.paid'))
    .if(fact('customer:${event.customerId}:tier').eq('vip'))
    .then(setFact('order:${event.orderId}:vipDiscount', 10))
    .also(emit('vip.benefit_applied', {
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
      benefit: 'discount',
    }))
    .build()
);
```

---

## Interoperability

The builder's `.when()`, `.if()`, and `.then()` methods accept both builder objects and raw objects. You can mix both styles:

```typescript
Rule.create('mixed')
  .when(onEvent('order.created'))                          // DSL trigger
  .if({ source: { type: 'event', field: 'amount' },       // raw condition
        operator: 'gte', value: 100 })
  .then(emit('order.large'))                               // DSL action
  .also({ type: 'log', level: 'info',                     // raw action
          message: 'Large order detected' })
  .build();
```

This allows incremental migration — convert rules one at a time, and within each rule, convert components individually.
