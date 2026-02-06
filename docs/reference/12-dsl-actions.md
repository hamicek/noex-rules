# DSL Actions

Factory functions and builders for creating rule actions executed when a rule fires.

## Import

```typescript
import {
  emit,
  setFact,
  deleteFact,
  setTimer,
  cancelTimer,
  callService,
  log,
  conditional,
  ref,
  isRef
} from '@hamicek/noex-rules';
```

---

## Event Actions

### emit()

```typescript
function emit(topic: string, data?: Record<string, unknown>): ActionBuilder
```

Creates an action that emits a new event when the rule fires.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Topic for the emitted event |
| data | `Record<string, unknown>` | no | Event payload (values may use `ref()` for dynamic resolution) |

**Returns:** `ActionBuilder` — Builder for use with `RuleBuilder.then()`

**Validation Errors:**

- `"emit() topic must be a non-empty string"`

**Example:**

```typescript
Rule.create('order-notification')
  .when(onEvent('order.created'))
  .then(emit('notification.send', {
    orderId: ref('event.orderId'),
    message: 'Order received!'
  }))
  .build();

Rule.create('simple-forward')
  .when(onEvent('payment.completed'))
  .then(emit('invoice.generate'))
  .build();
```

---

## Fact Actions

### setFact()

```typescript
function setFact<T>(key: string, value: ValueOrRef<T>): ActionBuilder
```

Creates an action that sets (upserts) a fact in the fact store.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key (supports `${}` interpolation at runtime) |
| value | `ValueOrRef<T>` | yes | Fact value (may use `ref()` for dynamic resolution) |

**Returns:** `ActionBuilder` — Builder for use with `RuleBuilder.then()`

**Validation Errors:**

- `"setFact() key must be a non-empty string"`

**Example:**

```typescript
Rule.create('mark-processed')
  .when(onEvent('order.shipped'))
  .then(setFact('order:${event.orderId}:status', 'shipped'))
  .build();

Rule.create('copy-vip-status')
  .when(onEvent('customer.updated'))
  .then(setFact('customer:vip', ref('event.isVip')))
  .build();
```

---

### deleteFact()

```typescript
function deleteFact(key: string): ActionBuilder
```

Creates an action that deletes a fact from the fact store.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key to delete (supports `${}` interpolation at runtime) |

**Returns:** `ActionBuilder` — Builder for use with `RuleBuilder.then()`

**Validation Errors:**

- `"deleteFact() key must be a non-empty string"`

**Example:**

```typescript
Rule.create('cleanup-pending')
  .when(onEvent('order.completed'))
  .then(deleteFact('order:${event.orderId}:pending'))
  .build();
```

---

## Timer Actions

### setTimer()

```typescript
function setTimer(config: SetTimerOptions): ActionBuilder
function setTimer(name: string): TimerFluentBuilder
```

Creates an action that sets a timer. Supports two usage styles.

**Options Object Form:**

Pass a complete `SetTimerOptions` object:

```typescript
setTimer({
  name: 'payment-timeout',
  duration: '15m',
  onExpire: {
    topic: 'order.payment_timeout',
    data: { orderId: ref('event.orderId') }
  }
})
```

**Fluent API Form:**

Pass just the timer name and chain methods:

```typescript
setTimer('payment-timeout')
  .after('15m')
  .emit('order.payment_timeout', { orderId: ref('event.orderId') })
  .repeat('5m', 3)
```

**Returns:** `ActionBuilder` (options form) or `TimerFluentBuilder` (string form)

**Validation Errors:**

- `"setTimer() config.name must be a non-empty string"`
- `"setTimer() config.duration must be a valid duration"`
- `"setTimer() config.onExpire.topic must be a non-empty string"`
- `"Timer \"...\" requires onExpire topic. Use .emit(topic, data) to set it."`

**Full Example:**

```typescript
Rule.create('payment-reminder')
  .when(onEvent('order.created'))
  .then(setTimer('payment-timeout')
    .after('15m')
    .emit('order.payment_timeout', { orderId: ref('event.orderId') })
  )
  .build();

Rule.create('recurring-check')
  .when(onEvent('subscription.started'))
  .then(setTimer({
    name: 'subscription-check',
    duration: '24h',
    onExpire: { topic: 'subscription.check' },
    repeat: { interval: '24h', maxCount: 30 }
  }))
  .build();
```

---

### TimerFluentBuilder

Fluent builder returned by `setTimer(name)`.

#### after()

```typescript
after(duration: string | number): TimerFluentBuilder
```

Sets the duration before the timer expires.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| duration | `string \| number` | yes | Duration string (e.g. `"15m"`, `"24h"`) or milliseconds |

**Returns:** `this` for chaining

---

#### emit()

```typescript
emit(topic: string, data?: Record<string, unknown>): TimerFluentBuilder
```

Sets the event emitted when the timer expires.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Topic of the emitted event |
| data | `Record<string, unknown>` | no | Optional payload (values may use `ref()`) |

**Returns:** `this` for chaining

---

#### repeat()

```typescript
repeat(interval: string | number, maxCount?: number): TimerFluentBuilder
```

Configures the timer to repeat after each expiration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interval | `string \| number` | yes | Repeat interval (string or milliseconds) |
| maxCount | `number` | no | Maximum number of repetitions |

**Returns:** `this` for chaining

---

### cancelTimer()

```typescript
function cancelTimer(name: string): ActionBuilder
```

Creates an action that cancels a running timer.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer name to cancel (supports `${}` interpolation) |

**Returns:** `ActionBuilder` — Builder for use with `RuleBuilder.then()`

**Validation Errors:**

- `"cancelTimer() name must be a non-empty string"`

**Example:**

```typescript
Rule.create('payment-received')
  .when(onEvent('payment.completed'))
  .then(cancelTimer('payment-timeout'))
  .then(emit('order.confirmed'))
  .build();

Rule.create('cancel-dynamic')
  .when(onEvent('order.cancelled'))
  .then(cancelTimer('payment-timeout:${event.orderId}'))
  .build();
```

---

## Service Actions

### callService()

```typescript
function callService(service: string): CallServiceFluentBuilder
function callService(service: string, method: string, args?: unknown[]): ActionBuilder
```

Creates an action that invokes a method on an external service. Supports two usage styles.

**Fluent API Form:**

```typescript
callService('paymentService')
  .method('processPayment')
  .args(ref('event.orderId'), 100)
```

**Direct Call Form:**

```typescript
callService('paymentService', 'processPayment', [ref('event.orderId'), 100])
```

**Returns:** `CallServiceFluentBuilder` (fluent form) or `ActionBuilder` (direct form)

**Validation Errors:**

- `"callService() service must be a non-empty string"`
- `"callService() method must be a non-empty string"`
- `"callService(\"...\") requires method name. Use .method(name) to set it."`

**Example:**

```typescript
Rule.create('process-payment')
  .when(onEvent('checkout.completed'))
  .then(callService('paymentService')
    .method('charge')
    .args(ref('event.customerId'), ref('event.amount'))
  )
  .build();

Rule.create('send-email')
  .when(onEvent('user.registered'))
  .then(callService('emailService', 'sendWelcome', [
    ref('event.email'),
    ref('event.name')
  ]))
  .build();
```

---

### CallServiceFluentBuilder

Fluent builder returned by `callService(service)`.

#### method()

```typescript
method(name: string): CallServiceFluentBuilder
```

Sets the method to invoke on the service.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Method name |

**Returns:** `this` for chaining

---

#### args()

```typescript
args(...args: unknown[]): CallServiceFluentBuilder
```

Sets the arguments for the method call.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| args | `unknown[]` | yes | Method arguments (values may use `ref()`) |

**Returns:** `this` for chaining

---

## Log Actions

### log()

```typescript
function log(level: LogLevel, message: string): ActionBuilder
```

Creates a logging action. The message supports `${}` interpolation resolved at runtime.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| level | `LogLevel` | yes | Log level: `'debug'`, `'info'`, `'warn'`, or `'error'` |
| message | `string` | yes | Message to log (supports `${}` interpolation) |

**Returns:** `ActionBuilder` — Builder for use with `RuleBuilder.then()`

**Validation Errors:**

- `"log() level must be a non-empty string"`
- `"log() level must be one of: debug, info, warn, error — got \"...\""`
- `"log() message must be a string"`

**Example:**

```typescript
Rule.create('audit-order')
  .when(onEvent('order.created'))
  .then(log('info', 'Processing order ${event.orderId}'))
  .build();

Rule.create('error-handler')
  .when(onEvent('payment.failed'))
  .then(log('error', 'Payment failed for customer ${event.customerId}'))
  .build();
```

---

### Shorthand Methods

Convenience methods for common log levels:

```typescript
log.debug(message: string): ActionBuilder
log.info(message: string): ActionBuilder
log.warn(message: string): ActionBuilder
log.error(message: string): ActionBuilder
```

**Example:**

```typescript
Rule.create('debug-rule')
  .when(onEvent('debug.trigger'))
  .then(log.debug('Rule triggered at ${context.timestamp}'))
  .build();

Rule.create('warn-low-stock')
  .when(onFact('inventory:*:stock'))
  .if(fact('${trigger.key}').lt(10))
  .then(log.warn('Low stock warning for ${trigger.key}'))
  .build();
```

---

## Conditional Actions

### conditional()

```typescript
function conditional(condition: ConditionInput): ConditionalBuilder
```

Creates a conditional (if/then/else) action for use inside a rule's action list.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `ConditionInput` | yes | Initial condition (builder or raw object) |

**Returns:** `ConditionalBuilder` — Fluent builder for configuring branches

**Example:**

```typescript
Rule.create('order-routing')
  .when(onEvent('order.created'))
  .then(conditional(event('amount').gte(100))
    .then(emit('premium.process', { orderId: ref('event.orderId') }))
    .else(emit('standard.process', { orderId: ref('event.orderId') }))
  )
  .build();
```

---

### ConditionalBuilder

Fluent builder for conditional (if/then/else) actions.

#### and()

```typescript
and(condition: ConditionInput): ConditionalBuilder
```

Adds another condition with AND semantics — all conditions must be met for the `then` branch to execute.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `ConditionInput` | yes | Condition builder or raw condition object |

**Returns:** `this` for chaining

**Example:**

```typescript
conditional(event('amount').gte(100))
  .and(fact('customer:vip').eq(true))
  .then(emit('vip.premium'))
```

---

#### then()

```typescript
then(action: ActionInput): ConditionalBuilder
```

Adds an action to the `then` branch (executed when all conditions are met). Can be called multiple times to add several actions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| action | `ActionInput` | yes | Action builder or raw action object |

**Returns:** `this` for chaining

---

#### else()

```typescript
else(action: ActionInput): ConditionalBuilder
```

Adds an action to the `else` branch (executed when conditions are not met). Can be called multiple times.

Cannot be used after `elseIf()` — the else-if chain already defines the else branch.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| action | `ActionInput` | yes | Action builder or raw action object |

**Returns:** `this` for chaining

**Throws:** `DslValidationError` if called after `.elseIf()`

---

#### elseIf()

```typescript
elseIf(condition: ConditionInput): ConditionalBuilder
```

Starts an else-if chain by nesting a new conditional action inside the current `else` branch. Returns the inner builder so subsequent `.then()` / `.else()` / `.elseIf()` calls apply to it.

Cannot be used after `else()` — explicit else actions already occupy the else branch.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `ConditionInput` | yes | Condition for the nested branch |

**Returns:** Inner `ConditionalBuilder` for further chaining

**Throws:** `DslValidationError` if called after `.else()`

**Example:**

```typescript
conditional(event('tier').eq('gold'))
  .then(emit('gold.process'))
  .elseIf(event('tier').eq('silver'))
  .then(emit('silver.process'))
  .else(emit('default.process'))
```

---

## Dynamic References

Use `ref()` to create dynamic references resolved at runtime. Values in action payloads can reference event data, facts, or context variables.

### ref()

```typescript
function ref<T = unknown>(path: string): Ref<T>
```

Creates a dynamic reference to a runtime value.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | `string` | yes | Dot-notated path (e.g., `"event.orderId"`, `"fact.customer:123"`) |

**Returns:** `Ref<T>` — A reference object for runtime resolution

**Path Prefixes:**

| Prefix | Description |
|--------|-------------|
| `event.` | Field from the triggering event |
| `fact.` | Value from fact store |
| `context.` | Context variable |
| `matched.` | Matched temporal event (CEP) |

**Example:**

```typescript
emit('order.processed', {
  orderId: ref('event.orderId'),
  customerName: ref('fact.customer:${event.customerId}:name'),
  processedBy: ref('context.currentUser')
})
```

---

### isRef()

```typescript
function isRef(value: unknown): value is Ref
```

Type-guard that checks whether a value is a `Ref`.

**Example:**

```typescript
const maybeRef = someValue;
if (isRef(maybeRef)) {
  console.log('Reference path:', maybeRef.ref);
}
```

---

## Types

### ActionBuilder

```typescript
interface ActionBuilder {
  build(): RuleAction;
}
```

Base interface implemented by all action builders.

### SetTimerOptions

```typescript
interface SetTimerOptions {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

Configuration object for `setTimer()` when using the options-based overload.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | `string` | yes | Unique timer name |
| duration | `string \| number` | yes | Duration until expiration (string or milliseconds) |
| onExpire.topic | `string` | yes | Topic of the event emitted on expiration |
| onExpire.data | `Record<string, unknown>` | no | Optional event payload |
| repeat.interval | `string \| number` | no | Interval between repetitions |
| repeat.maxCount | `number` | no | Maximum number of repetitions |

### LogLevel

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

Valid log levels for the `log()` action.

### ConditionInput

```typescript
type ConditionInput = ConditionBuilder | RuleCondition;
```

Input accepted wherever a condition is expected — either a fluent builder or a raw condition object.

### ActionInput

```typescript
type ActionInput = ActionBuilder | RuleAction;
```

Input accepted wherever an action is expected — either a fluent builder or a raw action object.

### RuleAction

```typescript
type RuleAction =
  | { type: 'emit_event'; topic: string; data?: Record<string, unknown> }
  | { type: 'set_fact'; key: string; value: unknown }
  | { type: 'delete_fact'; key: string }
  | { type: 'set_timer'; timer: TimerConfig }
  | { type: 'cancel_timer'; name: string }
  | { type: 'call_service'; service: string; method: string; args?: unknown[] }
  | { type: 'log'; level: LogLevel; message: string }
  | { type: 'conditional'; conditions: RuleCondition[]; then: RuleAction[]; else?: RuleAction[] };
```

Discriminated union of all action types used by the rule engine.

### Ref

```typescript
interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}
```

A dynamic reference to a runtime value resolved during rule evaluation.

### ValueOrRef

```typescript
type ValueOrRef<T> = T | Ref<T>;
```

A value that may be either a literal or a reference resolved at runtime.

---

## See Also

- [DSL Builder](./09-dsl-builder.md) — Rule builder API
- [DSL Triggers](./10-dsl-triggers.md) — Trigger builders
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders
- [Action Executor](./08-action-executor.md) — Action execution engine internals
- [Timer Manager](./04-timer-manager.md) — Timer management
