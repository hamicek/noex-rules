# DSL Triggers

Factory functions and builders for creating rule triggers that determine when rules fire.

## Import

```typescript
import {
  onEvent,
  onFact,
  onTimer,
  sequence,
  absence,
  count,
  aggregate,
  TriggerBuilder
} from '@hamicek/noex-rules';
```

---

## Simple Triggers

### onEvent()

```typescript
function onEvent(topic: string): TriggerBuilder
```

Creates a trigger that fires when an event with the specified topic is emitted.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic pattern (supports wildcards like `"order.*"`) |

**Returns:** `TriggerBuilder` — A builder that produces `{ type: 'event'; topic: string }`

**Example:**

```typescript
// Exact topic match
Rule.create('order-handler')
  .when(onEvent('order.created'))
  .then(emit('order.processed'))
  .build();

// Wildcard — any payment event
Rule.create('payment-logger')
  .when(onEvent('payment.*'))
  .then(log('Payment event received'))
  .build();
```

---

### onFact()

```typescript
function onFact(pattern: string): TriggerBuilder
```

Creates a trigger that fires when a fact matching the specified pattern changes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pattern | `string` | yes | Fact key pattern (supports `*` wildcard) |

**Returns:** `TriggerBuilder` — A builder that produces `{ type: 'fact'; pattern: string }`

**Example:**

```typescript
// Exact fact key
Rule.create('credit-monitor')
  .when(onFact('customer:123:creditScore'))
  .then(emit('credit.changed'))
  .build();

// Wildcard — any customer's credit score
Rule.create('credit-alert')
  .when(onFact('customer:*:creditScore'))
  .if(fact('${trigger.key}').lt(500))
  .then(emit('credit.low'))
  .build();

// Composite wildcard
Rule.create('stock-monitor')
  .when(onFact('inventory:warehouse-*:stock'))
  .if(fact('${trigger.key}').lt(10))
  .then(emit('stock.low'))
  .build();
```

---

### onTimer()

```typescript
function onTimer(name: string): TriggerBuilder
```

Creates a trigger that fires when the specified timer expires.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer name to listen for |

**Returns:** `TriggerBuilder` — A builder that produces `{ type: 'timer'; name: string }`

**Example:**

```typescript
// React to a payment timeout
Rule.create('payment-timeout')
  .when(onTimer('payment-timeout'))
  .then(emit('order.cancelled'))
  .build();

// Entity-scoped timer with interpolation
Rule.create('order-reminder')
  .when(onTimer('order:*:reminder'))
  .then(emit('notification.reminder'))
  .build();
```

---

## Temporal Pattern Builders

Temporal patterns enable Complex Event Processing (CEP) — detecting patterns across multiple events over time windows.

### sequence()

```typescript
function sequence(): SequenceBuilder
```

Creates a builder for sequence patterns that detect ordered events within a time window.

**Returns:** `SequenceBuilder` — A fluent builder for sequence patterns

#### SequenceBuilder Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `event()` | `(topic: string, filter?: Record<string, unknown>, as?: string): this` | Appends an expected event to the sequence |
| `within()` | `(value: string \| number): this` | Sets the time window (e.g., `"5m"`, `"1h"`) |
| `groupBy()` | `(field: string): this` | Groups by field (dot-notated path) |
| `strict()` | `(value?: boolean): this` | Enables strict mode (no unrelated events between) |
| `build()` | `(): RuleTrigger` | Builds the trigger |

**Validation Errors:**
- `"sequence() requires at least one .event()"`
- `"sequence() requires .within() to set the time window"`

**Example:**

```typescript
// Order completion sequence
Rule.create('order-completed')
  .when(
    sequence()
      .event('order.created')
      .event('payment.received')
      .event('order.shipped')
      .within('24h')
      .groupBy('orderId')
      .build()
  )
  .then(emit('order.completed'))
  .build();

// Failed login detection with strict ordering
Rule.create('brute-force-detection')
  .when(
    sequence()
      .event('auth.login_failed', { method: 'password' })
      .event('auth.login_failed', { method: 'password' })
      .event('auth.login_failed', { method: 'password' })
      .within('5m')
      .groupBy('userId')
      .strict()
      .build()
  )
  .then(emit('security.brute-force-detected'))
  .build();

// Using event aliases for action references
Rule.create('fraud-detection')
  .when(
    sequence()
      .event('order.created', {}, 'firstOrder')
      .event('order.created', {}, 'secondOrder')
      .within('1m')
      .groupBy('customerId')
      .build()
  )
  .then(emit('fraud.rapid-orders', {
    firstOrderId: ref('matched.firstOrder.orderId'),
    secondOrderId: ref('matched.secondOrder.orderId')
  }))
  .build();
```

---

### absence()

```typescript
function absence(): AbsenceBuilder
```

Creates a builder for absence patterns that detect when an expected event does not occur within a time window after a trigger event.

**Returns:** `AbsenceBuilder` — A fluent builder for absence patterns

#### AbsenceBuilder Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `after()` | `(topic: string, filter?: Record<string, unknown>): this` | Sets the initiating event |
| `expected()` | `(topic: string, filter?: Record<string, unknown>): this` | Sets the expected event whose absence is detected |
| `within()` | `(value: string \| number): this` | Sets the time window duration |
| `groupBy()` | `(field: string): this` | Groups by field (dot-notated path) |
| `build()` | `(): RuleTrigger` | Builds the trigger |

**Validation Errors:**
- `"absence() requires .after() to set the trigger event"`
- `"absence() requires .expected() to set the awaited event"`
- `"absence() requires .within() to set the time window"`

**Example:**

```typescript
// Payment timeout detection
Rule.create('payment-timeout')
  .when(
    absence()
      .after('order.created')
      .expected('payment.received')
      .within('15m')
      .groupBy('orderId')
      .build()
  )
  .then(emit('order.payment-timeout'))
  .build();

// Registration abandonment
Rule.create('registration-abandoned')
  .when(
    absence()
      .after('registration.started', { source: 'web' })
      .expected('registration.completed')
      .within('24h')
      .groupBy('userId')
      .build()
  )
  .then(emit('user.registration-abandoned'))
  .build();
```

---

### count()

```typescript
function count(): CountBuilder
```

Creates a builder for count patterns that detect when event occurrences reach a threshold within a time window.

**Returns:** `CountBuilder` — A fluent builder for count patterns

#### CountBuilder Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `event()` | `(topic: string, filter?: Record<string, unknown>): this` | Sets the event to count |
| `threshold()` | `(value: number): this` | Sets the count threshold (non-negative) |
| `comparison()` | `(op: 'gte' \| 'lte' \| 'eq'): this` | Sets comparison operator (default: `'gte'`) |
| `window()` | `(value: string \| number): this` | Sets the time window |
| `groupBy()` | `(field: string): this` | Groups by field (dot-notated path) |
| `sliding()` | `(value?: boolean): this` | Enables sliding window (default: tumbling) |
| `build()` | `(): RuleTrigger` | Builds the trigger |

**Validation Errors:**
- `"count().threshold() must be a non-negative finite number"`
- `"count().comparison() must be 'gte', 'lte', or 'eq', got '{op}'"`
- `"count() requires .event() to set the counted event"`
- `"count() requires .threshold() to set the count threshold"`
- `"count() requires .window() to set the time window"`

**Example:**

```typescript
// Failed login threshold
Rule.create('account-lockout')
  .when(
    count()
      .event('auth.login_failed')
      .threshold(5)
      .window('10m')
      .groupBy('userId')
      .build()
  )
  .then(setFact('user:${trigger.userId}:locked', true))
  .also(emit('security.account-locked'))
  .build();

// API error rate monitoring with sliding window
Rule.create('api-error-spike')
  .when(
    count()
      .event('api.error', { statusCode: 500 })
      .threshold(100)
      .comparison('gte')
      .window('1m')
      .sliding()
      .build()
  )
  .then(emit('alert.api-errors'))
  .build();

// Low activity detection
Rule.create('low-activity')
  .when(
    count()
      .event('user.activity')
      .threshold(1)
      .comparison('lte')
      .window('1h')
      .groupBy('userId')
      .build()
  )
  .then(emit('user.inactive'))
  .build();
```

---

### aggregate()

```typescript
function aggregate(): AggregateBuilder
```

Creates a builder for aggregate patterns that compute aggregations over event field values and trigger when a threshold is reached.

**Returns:** `AggregateBuilder` — A fluent builder for aggregate patterns

#### AggregateBuilder Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `event()` | `(topic: string, filter?: Record<string, unknown>): this` | Sets the event to aggregate |
| `field()` | `(path: string): this` | Sets the field to aggregate (dot-notated) |
| `function()` | `(fn: 'sum' \| 'avg' \| 'min' \| 'max' \| 'count'): this` | Sets the aggregate function |
| `threshold()` | `(value: number): this` | Sets the threshold value |
| `comparison()` | `(op: 'gte' \| 'lte' \| 'eq'): this` | Sets comparison operator (default: `'gte'`) |
| `window()` | `(value: string \| number): this` | Sets the time window |
| `groupBy()` | `(field: string): this` | Groups by field (dot-notated path) |
| `build()` | `(): RuleTrigger` | Builds the trigger |

**Validation Errors:**
- `"aggregate().function() must be one of sum, avg, min, max, count, got '{fn}'"`
- `"aggregate().threshold() must be a finite number"`
- `"aggregate().comparison() must be 'gte', 'lte', or 'eq', got '{op}'"`
- `"aggregate() requires .event() to set the source event"`
- `"aggregate() requires .field() to set the aggregated field"`
- `"aggregate() requires .function() to set the aggregate function"`
- `"aggregate() requires .threshold() to set the threshold value"`
- `"aggregate() requires .window() to set the time window"`

**Example:**

```typescript
// High-value order total
Rule.create('high-value-customer')
  .when(
    aggregate()
      .event('order.paid')
      .field('amount')
      .function('sum')
      .threshold(10000)
      .window('1h')
      .groupBy('customerId')
      .build()
  )
  .then(emit('customer.high-value'))
  .build();

// API response time monitoring
Rule.create('slow-api')
  .when(
    aggregate()
      .event('api.response')
      .field('responseTime')
      .function('avg')
      .threshold(500)
      .comparison('gte')
      .window('5m')
      .groupBy('endpoint')
      .build()
  )
  .then(emit('alert.slow-endpoint'))
  .build();

// Maximum transaction detection
Rule.create('large-transaction')
  .when(
    aggregate()
      .event('transaction.completed')
      .field('amount')
      .function('max')
      .threshold(50000)
      .window('24h')
      .groupBy('accountId')
      .build()
  )
  .then(emit('compliance.large-transaction'))
  .build();
```

---

## Types

### TriggerBuilder

```typescript
interface TriggerBuilder {
  build(): RuleTrigger;
}
```

Base interface implemented by all trigger builders.

### RuleTrigger

```typescript
type RuleTrigger =
  | { type: 'event'; topic: string }
  | { type: 'fact'; pattern: string }
  | { type: 'timer'; name: string }
  | { type: 'temporal'; pattern: TemporalPattern };
```

Discriminated union of all trigger types.

### TemporalPattern

```typescript
type TemporalPattern =
  | SequencePattern
  | AbsencePattern
  | CountPattern
  | AggregatePattern;
```

Union of all temporal pattern types.

### SequencePattern

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];
  within: string | number;
  groupBy?: string;
  strict?: boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | `'sequence'` | Pattern discriminator |
| events | `EventMatcher[]` | Ordered list of expected events |
| within | `string \| number` | Time window (`"5m"`, `3600000`) |
| groupBy | `string` | Optional grouping field |
| strict | `boolean` | If true, no unrelated events allowed between |

### AbsencePattern

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;
  expected: EventMatcher;
  within: string | number;
  groupBy?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | `'absence'` | Pattern discriminator |
| after | `EventMatcher` | Trigger event that starts the window |
| expected | `EventMatcher` | Event whose absence is detected |
| within | `string \| number` | Time window duration |
| groupBy | `string` | Optional grouping field |

### CountPattern

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
  sliding?: boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | `'count'` | Pattern discriminator |
| event | `EventMatcher` | Event to count |
| threshold | `number` | Count threshold |
| comparison | `'gte' \| 'lte' \| 'eq'` | Comparison operator |
| window | `string \| number` | Time window |
| groupBy | `string` | Optional grouping field |
| sliding | `boolean` | If true, uses sliding window |

### AggregatePattern

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | `'aggregate'` | Pattern discriminator |
| event | `EventMatcher` | Event to aggregate |
| field | `string` | Field to aggregate (dot-notated) |
| function | `AggregateFn` | Aggregate function |
| threshold | `number` | Threshold value |
| comparison | `'gte' \| 'lte' \| 'eq'` | Comparison operator |
| window | `string \| number` | Time window |
| groupBy | `string` | Optional grouping field |

### EventMatcher

```typescript
interface EventMatcher {
  topic: string;
  filter?: Record<string, unknown>;
  as?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| topic | `string` | Event topic pattern |
| filter | `Record<string, unknown>` | Optional payload filter |
| as | `string` | Optional alias for referencing in actions |

---

## See Also

- [DSL Builder](./09-dsl-builder.md) — Rule builder API
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders
- [DSL Actions](./12-dsl-actions.md) — Action builders
- [Temporal Processor](./06-temporal-processor.md) — CEP engine internals
- [Complex Event Processing](../learn/06-cep/01-introduction.md) — Tutorial
