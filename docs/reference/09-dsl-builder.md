# DSL Builder

Fluent builder API for assembling type-safe rule definitions with IDE autocompletion and compile-time validation.

## Import

```typescript
import { Rule, RuleBuilder } from '@hamicek/noex-rules';
```

## Factory Method

### Rule.create()

```typescript
static create(id: string): RuleBuilder
```

Creates a new rule builder with the given unique identifier.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | `string` | yes | Unique rule identifier (must be non-empty) |

**Returns:** `RuleBuilder` — A fresh builder instance for chaining

**Throws:** `DslValidationError` if `id` is empty or not a string

**Example:**

```typescript
const rule = Rule.create('order-notification')
  .name('Send Order Notification')
  .when(onEvent('order.created'))
  .then(emit('notification.send'))
  .build();
```

---

## Methods

### name()

```typescript
name(value: string): this
```

Sets a human-readable name for the rule.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `string` | yes | Display name (defaults to rule ID if not set) |

**Returns:** `this` for chaining

### description()

```typescript
description(value: string): this
```

Sets an optional description for the rule.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `string` | yes | Free-text description |

**Returns:** `this` for chaining

### priority()

```typescript
priority(value: number): this
```

Sets the evaluation priority (higher value = evaluated sooner).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `number` | yes | A finite number (defaults to `0`) |

**Returns:** `this` for chaining

**Throws:** `DslValidationError` if `value` is not a finite number

### enabled()

```typescript
enabled(value: boolean): this
```

Enables or disables the rule.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `boolean` | yes | `true` to enable, `false` to disable (defaults to `true`) |

**Returns:** `this` for chaining

### tags()

```typescript
tags(...values: string[]): this
```

Appends one or more tags for categorization and filtering.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| values | `string[]` | yes | Tag strings to add |

**Returns:** `this` for chaining

**Example:**

```typescript
Rule.create('my-rule')
  .tags('orders', 'notifications', 'high-priority')
  // ...
```

### group()

```typescript
group(groupId: string): this
```

Assigns the rule to a logical group. A rule is active only when both its own `enabled` flag and its group's `enabled` flag are `true`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| groupId | `string` | yes | The ID of the group this rule belongs to |

**Returns:** `this` for chaining

**Throws:** `DslValidationError` if `groupId` is not a non-empty string

### lookup()

```typescript
lookup(name: string, config: LookupConfig): this
```

Declares an external data lookup to be resolved before condition evaluation. Lookups are resolved in parallel after the trigger fires but before conditions are evaluated.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Unique name for this lookup (used to access the result) |
| config | `LookupConfig` | yes | Lookup configuration |

**Returns:** `this` for chaining

**Throws:** `DslValidationError` if name is empty, duplicated, or required config fields are missing

**Example:**

```typescript
Rule.create('check-credit')
  .when(onEvent('order.created'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')],
    cache: { ttl: '5m' },
  })
  .if(lookup('credit').gte(700))
  .then(emit('order.approved'))
  .build();
```

### when()

```typescript
when(trigger: TriggerBuilder | RuleTrigger): this
```

Sets the trigger that determines when the rule fires.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| trigger | `TriggerBuilder \| RuleTrigger` | yes | A trigger builder (e.g. `onEvent`, `sequence`) or a raw `RuleTrigger` object |

**Returns:** `this` for chaining

**Example:**

```typescript
// Using trigger builder
Rule.create('my-rule')
  .when(onEvent('order.created'))
  // ...

// Using raw trigger object
Rule.create('my-rule')
  .when({ type: 'event', topic: 'order.created' })
  // ...
```

### if()

```typescript
if(condition: ConditionBuilder | RuleCondition): this
```

Adds a condition that must be satisfied for the rule to execute. Multiple `if()` calls are combined with logical AND.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `ConditionBuilder \| RuleCondition` | yes | A condition builder (e.g. `event('x').gte(1)`) or a raw `RuleCondition` object |

**Returns:** `this` for chaining

**Example:**

```typescript
Rule.create('high-value-order')
  .when(onEvent('order.created'))
  .if(event('amount').gte(1000))
  .if(event('status').eq('pending'))
  .then(emit('order.high-value'))
  .build();
```

### and()

```typescript
and(condition: ConditionBuilder | RuleCondition): this
```

Alias for `if()` — adds another condition (logical AND). Improves readability when chaining multiple conditions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `ConditionBuilder \| RuleCondition` | yes | A condition builder or raw `RuleCondition` |

**Returns:** `this` for chaining

**Example:**

```typescript
Rule.create('vip-large-order')
  .when(onEvent('order.created'))
  .if(event('amount').gte(1000))
  .and(fact('customer:${event.customerId}:tier').eq('vip'))
  .then(emit('order.vip-priority'))
  .build();
```

### then()

```typescript
then(action: ActionBuilder | RuleAction): this
```

Adds an action to execute when the rule fires.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| action | `ActionBuilder \| RuleAction` | yes | An action builder (e.g. `emit(...)`) or a raw `RuleAction` object |

**Returns:** `this` for chaining

**Example:**

```typescript
Rule.create('order-workflow')
  .when(onEvent('order.created'))
  .then(setFact('order:${event.orderId}:status', 'processing'))
  .then(emit('order.processing', { orderId: ref('event.orderId') }))
  .build();
```

### also()

```typescript
also(action: ActionBuilder | RuleAction): this
```

Alias for `then()` — adds another action. Improves readability when chaining multiple actions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| action | `ActionBuilder \| RuleAction` | yes | An action builder or raw `RuleAction` |

**Returns:** `this` for chaining

**Example:**

```typescript
Rule.create('order-complete')
  .when(onEvent('order.shipped'))
  .then(setFact('order:${event.orderId}:status', 'shipped'))
  .also(emit('notification.send', { type: 'shipped', orderId: ref('event.orderId') }))
  .also(cancelTimer('order-timeout:${event.orderId}'))
  .build();
```

### build()

```typescript
build(): BuiltRule
```

Validates the accumulated state and returns the final rule definition.

**Returns:** `BuiltRule` — A rule definition ready to be registered with the engine

**Throws:** `DslValidationError` if:
- Rule ID is missing
- Trigger is not set (no `when()` call)
- No actions are defined (no `then()` call)

**Example:**

```typescript
const rule = Rule.create('my-rule')
  .name('My Rule')
  .when(onEvent('order.created'))
  .then(emit('order.processed'))
  .build();

// Register with engine
engine.registerRule(rule);
```

---

## Types

### LookupConfig

```typescript
interface LookupConfig {
  service: string;
  method: string;
  args?: unknown[];
  cache?: LookupCacheConfig;
  onError?: LookupErrorStrategy;
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| service | `string` | yes | Registered service name |
| method | `string` | yes | Method name on the service |
| args | `unknown[]` | no | Arguments (may contain `Ref` values for runtime resolution) |
| cache | `LookupCacheConfig` | no | Caching configuration |
| onError | `LookupErrorStrategy` | no | Behavior on error: `'skip'` (default) or `'fail'` |

### LookupCacheConfig

```typescript
interface LookupCacheConfig {
  ttl: string | number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| ttl | `string \| number` | Time-to-live: duration string (`'5m'`, `'1h'`) or milliseconds |

### LookupErrorStrategy

```typescript
type LookupErrorStrategy = 'skip' | 'fail';
```

| Value | Description |
|-------|-------------|
| `'skip'` | Skip the rule if lookup fails (default) |
| `'fail'` | Throw an exception if lookup fails |

### BuiltRule

```typescript
type BuiltRule = RuleInput;
```

The output of `build()` — an alias for the core `RuleInput` type. Contains all rule configuration ready for registration.

### TriggerBuilder

```typescript
interface TriggerBuilder {
  build(): RuleTrigger;
}
```

Builder interface implemented by trigger factories (`onEvent`, `onFact`, `onTimer`, `sequence`, etc.).

### ConditionBuilder

```typescript
interface ConditionBuilder {
  build(): RuleCondition;
}
```

Builder interface implemented by condition expressions (`event()`, `fact()`, `context()`, `lookup()`, `baseline()`).

### ActionBuilder

```typescript
interface ActionBuilder {
  build(): RuleAction;
}
```

Builder interface implemented by action factories (`emit`, `setFact`, `deleteFact`, `setTimer`, etc.).

### Ref

```typescript
interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}
```

A dynamic reference to a runtime value. Created using the `ref()` helper function.

| Field | Type | Description |
|-------|------|-------------|
| ref | `string` | Dot-notated path to the value |
| __type | `T` | Phantom type for compile-time safety (not used at runtime) |

### ValueOrRef

```typescript
type ValueOrRef<T> = T | Ref<T>;
```

A value that may be either a literal `T` or a `Ref` resolved at runtime.

---

## Helper Functions

### ref()

```typescript
function ref<T = unknown>(path: string): Ref<T>
```

Creates a dynamic reference to a runtime value.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | `string` | yes | Dot-notated path (e.g. `'event.orderId'`, `'fact.user:balance'`) |

**Returns:** `Ref<T>` — A reference object

**Example:**

```typescript
ref('event.orderId')      // Reference to event data
ref('fact.user:123')      // Reference to a fact value
ref('lookup.credit.score') // Reference to lookup result
ref('matched.0.amount')    // Reference to first matched event
```

### isRef()

```typescript
function isRef(value: unknown): value is Ref
```

Type-guard that checks whether a value is a `Ref`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `unknown` | yes | The value to test |

**Returns:** `boolean` — `true` if value is a `Ref` object

---

## Errors

### DslValidationError

Thrown when the builder receives invalid input or is in an invalid state at build time.

```typescript
class DslValidationError extends DslError {
  constructor(message: string);
}
```

**Common causes:**
- Empty rule ID: `Rule.create('')`
- Invalid priority: `rule.priority(NaN)`
- Empty group ID: `rule.group('')`
- Missing trigger: `build()` without `when()`
- Missing actions: `build()` without `then()`
- Duplicate lookup name
- Missing lookup service/method

**Example:**

```typescript
import { DslValidationError, Rule } from '@hamicek/noex-rules';

try {
  Rule.create('').build();
} catch (err) {
  if (err instanceof DslValidationError) {
    console.error('Invalid rule:', err.message);
  }
}
```

---

## Complete Example

```typescript
import {
  Rule,
  onEvent,
  event,
  fact,
  lookup,
  emit,
  setFact,
  setTimer,
  cancelTimer,
  ref
} from '@hamicek/noex-rules';

// Simple rule with event trigger and condition
const orderNotification = Rule.create('order-notification')
  .name('Send Order Notification')
  .description('Sends notification for high-value orders')
  .priority(100)
  .tags('orders', 'notifications')
  .group('order-processing')
  .when(onEvent('order.created'))
  .if(event('amount').gte(100))
  .then(emit('notification.send', {
    orderId: ref('event.orderId'),
    message: 'New order received!'
  }))
  .build();

// Rule with external lookup
const creditCheck = Rule.create('credit-check')
  .name('Credit Check')
  .when(onEvent('loan.application'))
  .lookup('score', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.applicantId')],
    cache: { ttl: '10m' },
    onError: 'skip'
  })
  .if(lookup('score').gte(700))
  .then(emit('loan.approved', { applicantId: ref('event.applicantId') }))
  .build();

// Rule with multiple conditions and actions
const orderWorkflow = Rule.create('order-workflow')
  .name('Order Processing Workflow')
  .priority(50)
  .when(onEvent('order.created'))
  .if(event('status').eq('pending'))
  .and(event('paymentVerified').eq(true))
  .and(fact('inventory:${event.productId}:available').gte(1))
  .then(setFact('order:${event.orderId}:status', 'processing'))
  .also(emit('order.processing', {
    orderId: ref('event.orderId'),
    customerId: ref('event.customerId')
  }))
  .also(setTimer('order-timeout:${event.orderId}', '24h', {
    topic: 'order.timeout',
    data: { orderId: ref('event.orderId') }
  }))
  .also(cancelTimer('cart-abandon:${event.customerId}'))
  .build();

// Register rules with engine
engine.registerRule(orderNotification);
engine.registerRule(creditCheck);
engine.registerRule(orderWorkflow);
```

---

## See Also

- [DSL Triggers](./10-dsl-triggers.md) — Trigger builders (`onEvent`, `onFact`, `onTimer`, temporal patterns)
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders (`event`, `fact`, `context`, `lookup`, `baseline`)
- [DSL Actions](./12-dsl-actions.md) — Action builders (`emit`, `setFact`, `setTimer`, etc.)
- [Rule Engine](./01-rule-engine.md) — Registering and managing rules
- [Rules Deep Dive](../learn/03-rules-deep-dive/01-anatomy-of-a-rule.md) — Tutorial
