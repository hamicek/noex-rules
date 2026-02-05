# DSL Conditions

Factory functions and builders for creating rule conditions that determine whether a rule's actions execute.

## Import

```typescript
import {
  event,
  fact,
  context,
  lookup,
  baseline,
  SourceExpr,
  BaselineExpr,
  ref
} from '@hamicek/noex-rules';
```

---

## Source Expressions

Source expressions define where to read the value for comparison. Each factory function returns a `SourceExpr` with chainable comparison operators.

### event()

```typescript
function event(field: string): SourceExpr
```

Creates a condition targeting a field from the triggering event's payload.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| field | `string` | yes | Dot-notated path to the event data field |

**Returns:** `SourceExpr` — A builder with chainable comparison operators

**Example:**

```typescript
Rule.create('high-value-order')
  .when(onEvent('order.created'))
  .if(event('amount').gte(1000))
  .then(emit('order.high-value'))
  .build();

Rule.create('vip-purchase')
  .when(onEvent('purchase.completed'))
  .if(event('customer.tier').eq('vip'))
  .if(event('items').contains('premium'))
  .then(emit('vip.purchase'))
  .build();
```

---

### fact()

```typescript
function fact(pattern: string): SourceExpr
```

Creates a condition targeting a value from the fact store.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pattern | `string` | yes | Fact key pattern (supports `${}` interpolation) |

**Returns:** `SourceExpr` — A builder with chainable comparison operators

**Example:**

```typescript
Rule.create('vip-discount')
  .when(onEvent('order.created'))
  .if(fact('customer:${event.customerId}:vip').eq(true))
  .then(emit('discount.applied', { percent: 20 }))
  .build();

Rule.create('credit-check')
  .when(onFact('customer:*:creditScore'))
  .if(fact('${trigger.key}').lt(500))
  .then(emit('credit.alert'))
  .build();
```

---

### context()

```typescript
function context(key: string): SourceExpr
```

Creates a condition targeting a context variable passed during rule evaluation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Name of the context variable |

**Returns:** `SourceExpr` — A builder with chainable comparison operators

**Example:**

```typescript
Rule.create('admin-only')
  .when(onEvent('config.changed'))
  .if(context('currentUser.role').eq('admin'))
  .then(emit('config.updated'))
  .build();

Rule.create('threshold-check')
  .when(onEvent('metric.reported'))
  .if(event('value').gte(ref('context.threshold')))
  .then(emit('threshold.exceeded'))
  .build();
```

---

### lookup()

```typescript
function lookup(nameAndField: string): SourceExpr
```

Creates a condition targeting a resolved external lookup result. Supports plain lookup names and dot-notated field access.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| nameAndField | `string` | yes | Lookup name, optionally with dot-notated field path |

**Returns:** `SourceExpr` — A builder with chainable comparison operators

**Syntax:**

- `lookup('credit')` — Targets the entire lookup result
- `lookup('fraud.riskLevel')` — Targets `riskLevel` field from `fraud` lookup

**Validation Errors:**

- `"lookup() name part must not be empty"`
- `"lookup() field part must not be empty"`

**Example:**

```typescript
Rule.create('credit-approval')
  .when(onEvent('loan.requested'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')]
  })
  .if(lookup('credit').gte(700))
  .then(emit('loan.approved'))
  .build();

Rule.create('fraud-detection')
  .when(onEvent('transaction.initiated'))
  .lookup('fraud', {
    service: 'fraudService',
    method: 'assess',
    args: [ref('event.data')]
  })
  .if(lookup('fraud.riskLevel').neq('high'))
  .then(emit('transaction.approved'))
  .build();
```

---

## Baseline Expressions

Baseline expressions enable anomaly detection by comparing current values against statistical baselines.

### baseline()

```typescript
function baseline(metric: string): BaselineExpr
```

Creates a condition targeting a registered baseline metric for anomaly detection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| metric | `string` | yes | The baseline metric name (must match a configured metric) |

**Returns:** `BaselineExpr` — A builder with anomaly detection methods

**Validation Errors:**

- `"Condition on baseline(\"...\")": comparison not specified. Use .above(), .below(), .outside(), .abovePercentile(), or .belowPercentile()."`

**Example:**

```typescript
Rule.create('error-spike')
  .when(onEvent('metric.error_rate'))
  .if(baseline('error_rate').above(2.5))
  .then(emit('alert.error-spike'))
  .build();

Rule.create('latency-anomaly')
  .when(onEvent('metric.latency'))
  .if(baseline('api_latency').outside(3.0))
  .then(emit('alert.latency-anomaly'))
  .build();
```

---

## SourceExpr Operators

All source expressions (`event()`, `fact()`, `context()`, `lookup()`) share these comparison operators:

### Equality Operators

#### eq()

```typescript
eq<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source value strictly equals `value`.

```typescript
event('status').eq('completed')
fact('user:active').eq(true)
event('type').eq(ref('context.expectedType'))
```

#### neq()

```typescript
neq<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source value does not equal `value`.

```typescript
event('status').neq('cancelled')
lookup('fraud.level').neq('blocked')
```

---

### Comparison Operators

#### gt()

```typescript
gt<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source value is greater than `value`.

```typescript
event('amount').gt(100)
fact('inventory:stock').gt(0)
```

#### gte()

```typescript
gte<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source value is greater than or equal to `value`.

```typescript
event('priority').gte(5)
lookup('credit').gte(ref('context.minScore'))
```

#### lt()

```typescript
lt<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source value is less than `value`.

```typescript
fact('balance').lt(0)
event('age').lt(18)
```

#### lte()

```typescript
lte<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source value is less than or equal to `value`.

```typescript
event('quantity').lte(ref('fact.maxAllowed'))
context('retries').lte(3)
```

---

### Collection Operators

#### in()

```typescript
in<T>(values: ValueOrRef<T[]>): SourceExpr
```

Matches when the source value is contained in `values`.

```typescript
event('status').in(['pending', 'processing', 'shipped'])
event('region').in(ref('context.allowedRegions'))
```

#### notIn()

```typescript
notIn<T>(values: ValueOrRef<T[]>): SourceExpr
```

Matches when the source value is NOT in `values`.

```typescript
event('category').notIn(['restricted', 'banned'])
fact('user:role').notIn(['guest', 'anonymous'])
```

#### contains()

```typescript
contains<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source (array or string) contains `value`.

```typescript
event('tags').contains('urgent')
event('email').contains('@company.com')
```

#### notContains()

```typescript
notContains<T>(value: ValueOrRef<T>): SourceExpr
```

Matches when the source does NOT contain `value`.

```typescript
event('items').notContains('prohibited')
event('message').notContains('spam')
```

---

### Pattern Matching

#### matches()

```typescript
matches(pattern: string | RegExp): SourceExpr
```

Matches when the source string matches the regex `pattern`.

```typescript
event('email').matches('^[a-z]+@example\\.com$')
event('code').matches(/^[A-Z]{2}-\d{4}$/)
fact('user:phone').matches('\\+1\\d{10}')
```

---

### Existence Operators

#### exists()

```typescript
exists(): SourceExpr
```

Matches when the source value is defined (not `undefined` or `null`).

```typescript
event('metadata.trackingId').exists()
fact('session:${event.userId}').exists()
context('override').exists()
```

#### notExists()

```typescript
notExists(): SourceExpr
```

Matches when the source value is `undefined` or `null`.

```typescript
event('error').notExists()
fact('user:${event.userId}:banned').notExists()
```

---

## BaselineExpr Methods

Baseline expressions have specialized methods for anomaly detection:

### above()

```typescript
above(sensitivity: number): BaselineExpr
```

Anomaly when value exceeds `mean + sensitivity * stddev`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| sensitivity | `number` | yes | Number of standard deviations (sigma). Must be positive. |

```typescript
baseline('error_rate').above(2.5)  // > mean + 2.5σ
baseline('cpu_usage').above(3.0)   // > mean + 3.0σ
```

### below()

```typescript
below(sensitivity: number): BaselineExpr
```

Anomaly when value falls below `mean - sensitivity * stddev`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| sensitivity | `number` | yes | Number of standard deviations (sigma). Must be positive. |

```typescript
baseline('throughput').below(2.0)  // < mean - 2.0σ
baseline('revenue').below(2.5)     // < mean - 2.5σ
```

### outside()

```typescript
outside(sensitivity: number): BaselineExpr
```

Anomaly when value deviates from mean in either direction by more than `sensitivity * stddev`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| sensitivity | `number` | yes | Number of standard deviations (sigma). Must be positive. |

```typescript
baseline('latency').outside(3.0)      // |value - mean| > 3.0σ
baseline('request_rate').outside(2.5)
```

### abovePercentile()

```typescript
abovePercentile(percentile: number): BaselineExpr
```

Anomaly when value exceeds the Nth percentile.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| percentile | `number` | yes | Percentile threshold (0–100 exclusive) |

**Validation Errors:**

- `"percentile must be less than 100"`

```typescript
baseline('response_time').abovePercentile(95)  // > p95
baseline('memory_usage').abovePercentile(99)   // > p99
```

### belowPercentile()

```typescript
belowPercentile(percentile: number): BaselineExpr
```

Anomaly when value falls below the Nth percentile.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| percentile | `number` | yes | Percentile threshold (0–100 exclusive) |

**Validation Errors:**

- `"percentile must be less than 100"`

```typescript
baseline('conversion_rate').belowPercentile(5)   // < p5
baseline('engagement').belowPercentile(10)       // < p10
```

---

## Dynamic References

Use `ref()` to create dynamic references resolved at runtime:

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
Rule.create('dynamic-threshold')
  .when(onEvent('metric.value'))
  .if(event('value').gte(ref('context.threshold')))
  .if(event('region').in(ref('fact.allowedRegions')))
  .then(emit('threshold.exceeded'))
  .build();
```

### isRef()

```typescript
function isRef(value: unknown): value is Ref
```

Type-guard that checks whether a value is a `Ref`.

```typescript
const maybeRef = someValue;
if (isRef(maybeRef)) {
  console.log('Reference path:', maybeRef.ref);
}
```

---

## Types

### SourceExpr

```typescript
class SourceExpr implements ConditionBuilder {
  eq<T>(value: ValueOrRef<T>): SourceExpr;
  neq<T>(value: ValueOrRef<T>): SourceExpr;
  gt<T>(value: ValueOrRef<T>): SourceExpr;
  gte<T>(value: ValueOrRef<T>): SourceExpr;
  lt<T>(value: ValueOrRef<T>): SourceExpr;
  lte<T>(value: ValueOrRef<T>): SourceExpr;
  in<T>(values: ValueOrRef<T[]>): SourceExpr;
  notIn<T>(values: ValueOrRef<T[]>): SourceExpr;
  contains<T>(value: ValueOrRef<T>): SourceExpr;
  notContains<T>(value: ValueOrRef<T>): SourceExpr;
  matches(pattern: string | RegExp): SourceExpr;
  exists(): SourceExpr;
  notExists(): SourceExpr;
  build(): RuleCondition;
}
```

Fluent condition expression with chainable comparison operators.

### BaselineExpr

```typescript
class BaselineExpr implements ConditionBuilder {
  above(sensitivity: number): BaselineExpr;
  below(sensitivity: number): BaselineExpr;
  outside(sensitivity: number): BaselineExpr;
  abovePercentile(percentile: number): BaselineExpr;
  belowPercentile(percentile: number): BaselineExpr;
  build(): RuleCondition;
}
```

Fluent builder for baseline anomaly detection conditions.

### ConditionBuilder

```typescript
interface ConditionBuilder {
  build(): RuleCondition;
}
```

Base interface implemented by all condition builders.

### ConditionSource

```typescript
type ConditionSource =
  | { type: 'event'; field: string }
  | { type: 'fact'; pattern: string }
  | { type: 'context'; key: string }
  | { type: 'lookup'; name: string; field?: string }
  | { type: 'baseline'; metric: string; comparison: BaselineComparison; sensitivity?: number };
```

Discriminated union describing the data source for a condition.

### ConditionOperator

```typescript
type ConditionOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'contains' | 'not_contains'
  | 'matches'
  | 'exists' | 'not_exists';
```

Union of all supported condition comparison operators.

### RuleCondition

```typescript
interface RuleCondition {
  source: ConditionSource;
  operator: ConditionOperator;
  value: unknown | { ref: string };
}
```

Complete condition definition used by the rule engine.

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

### BaselineComparison

```typescript
type BaselineComparison =
  | 'above'
  | 'below'
  | 'outside'
  | 'above_percentile'
  | 'below_percentile';
```

Comparison type for baseline anomaly detection.

---

## See Also

- [DSL Builder](./09-dsl-builder.md) — Rule builder API
- [DSL Triggers](./10-dsl-triggers.md) — Trigger builders
- [DSL Actions](./12-dsl-actions.md) — Action builders
- [Condition Evaluator](./07-condition-evaluator.md) — Evaluation engine internals
- [Baseline Store](./22-baseline.md) — Anomaly detection configuration
