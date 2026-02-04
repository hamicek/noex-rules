# ConditionEvaluator

Evaluates rule conditions against runtime context. Retrieves values from various sources (facts, events, lookups, baseline) and compares them using specified operators.

## Import

```typescript
import {
  ConditionEvaluator,
  EvaluationContext,
  EvaluationOptions
} from '@hamicek/noex-rules';
```

## Constructor

```typescript
new ConditionEvaluator()
```

Creates a new ConditionEvaluator instance. The evaluator is stateless — no configuration required.

**Example:**

```typescript
const evaluator = new ConditionEvaluator();
```

---

## Methods

### evaluate()

```typescript
evaluate(
  condition: RuleCondition,
  context: EvaluationContext,
  conditionIndex?: number,
  options?: EvaluationOptions
): boolean
```

Evaluates a single condition against the provided context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `RuleCondition` | yes | Condition to evaluate |
| context | `EvaluationContext` | yes | Runtime context with facts, trigger data, variables |
| conditionIndex | `number` | no | Index for tracing (default: `0`) |
| options | `EvaluationOptions` | no | Tracing callback options |

**Returns:** `boolean` — true if condition passes

**Example:**

```typescript
const context: EvaluationContext = {
  trigger: { type: 'event', data: { amount: 150, currency: 'USD' } },
  facts: factStore,
  variables: new Map()
};

const condition: RuleCondition = {
  source: { type: 'event', field: 'amount' },
  operator: 'gt',
  value: 100
};

const passed = evaluator.evaluate(condition, context);
// passed === true
```

### evaluateAll()

```typescript
evaluateAll(
  conditions: RuleCondition[],
  context: EvaluationContext,
  options?: EvaluationOptions
): boolean
```

Evaluates all conditions using AND logic. Short-circuits on first failure.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| conditions | `RuleCondition[]` | yes | Array of conditions |
| context | `EvaluationContext` | yes | Runtime context |
| options | `EvaluationOptions` | no | Tracing callback options |

**Returns:** `boolean` — true if all conditions pass, false if any fails

**Example:**

```typescript
const conditions: RuleCondition[] = [
  {
    source: { type: 'fact', pattern: 'user:type' },
    operator: 'eq',
    value: 'premium'
  },
  {
    source: { type: 'event', field: 'amount' },
    operator: 'gte',
    value: 100
  }
];

const allPassed = evaluator.evaluateAll(conditions, context);
```

---

## Types

### EvaluationContext

```typescript
interface EvaluationContext {
  trigger: {
    type: 'fact' | 'event' | 'timer' | 'temporal';
    data: Record<string, unknown>;
  };
  facts: FactStore;
  variables: Map<string, unknown>;
  lookups?: Map<string, unknown>;
  baselineStore?: BaselineStore;
}
```

| Field | Type | Description |
|-------|------|-------------|
| trigger | `object` | Trigger information with type and associated data |
| trigger.type | `string` | Type of trigger that activated the rule |
| trigger.data | `object` | Data payload from the trigger (event payload, fact change, timer data) |
| facts | `FactStore` | Fact store instance for fact lookups |
| variables | `Map` | Runtime variables set during rule execution |
| lookups | `Map` | Pre-resolved external lookup results |
| baselineStore | `BaselineStore` | Baseline store for anomaly detection |

### EvaluationOptions

```typescript
interface EvaluationOptions {
  onConditionEvaluated?: ConditionEvaluationCallback;
}
```

| Field | Type | Description |
|-------|------|-------------|
| onConditionEvaluated | `function` | Callback invoked after each condition evaluation |

### ConditionEvaluationCallback

```typescript
type ConditionEvaluationCallback = (result: ConditionEvaluationResult) => void;
```

### ConditionEvaluationResult

```typescript
interface ConditionEvaluationResult {
  conditionIndex: number;
  source: {
    type: 'fact' | 'event' | 'context' | 'lookup' | 'baseline';
    pattern?: string;
    field?: string;
    key?: string;
    name?: string;
    metric?: string;
  };
  operator: string;
  actualValue: unknown;
  expectedValue: unknown;
  result: boolean;
  durationMs: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| conditionIndex | `number` | Position in conditions array |
| source | `object` | Source descriptor (type-specific fields) |
| operator | `string` | Comparison operator used |
| actualValue | `unknown` | Value retrieved from source |
| expectedValue | `unknown` | Value compared against (resolved if reference) |
| result | `boolean` | Whether condition passed |
| durationMs | `number` | Evaluation duration in milliseconds |

---

## Condition Structure

### RuleCondition

```typescript
interface RuleCondition {
  source: ConditionSource;
  operator: ConditionOperator;
  value: unknown | { ref: string };
}
```

---

## Source Types

### fact

Retrieves value from the fact store using pattern matching.

```typescript
{ type: 'fact', pattern: string }
```

| Field | Type | Description |
|-------|------|-------------|
| pattern | `string` | Fact key or pattern with wildcards (`user:*:status`) |

Pattern supports wildcards (`*`) — returns first matching fact's value.

**Example:**

```typescript
{
  source: { type: 'fact', pattern: 'user:123:status' },
  operator: 'eq',
  value: 'active'
}
```

Pattern interpolation is supported:

```typescript
{
  source: { type: 'fact', pattern: 'order:${event.orderId}:total' },
  operator: 'gte',
  value: 100
}
```

### event

Retrieves value from the trigger's data payload.

```typescript
{ type: 'event', field: string }
```

| Field | Type | Description |
|-------|------|-------------|
| field | `string` | Dot-notation path to field (`customer.profile.tier`) |

**Example:**

```typescript
{
  source: { type: 'event', field: 'customer.profile.tier' },
  operator: 'eq',
  value: 'premium'
}
```

Array indexing is supported: `items.0.name`

### context

Retrieves value from runtime variables.

```typescript
{ type: 'context', key: string }
```

| Field | Type | Description |
|-------|------|-------------|
| key | `string` | Variable name |

**Example:**

```typescript
{
  source: { type: 'context', key: 'threshold' },
  operator: 'lte',
  value: 100
}
```

### lookup

Retrieves value from pre-resolved external data.

```typescript
{ type: 'lookup', name: string, field?: string }
```

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Lookup service name |
| field | `string` | Optional dot-notation path within lookup result |

**Example:**

```typescript
// Lookup returns { riskLevel: 'low', score: 0.2 }
{
  source: { type: 'lookup', name: 'fraud', field: 'riskLevel' },
  operator: 'eq',
  value: 'low'
}
```

### baseline

Checks if current value is anomalous compared to baseline statistics.

```typescript
{
  type: 'baseline',
  metric: string,
  comparison: BaselineComparison,
  sensitivity?: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| metric | `string` | Registered baseline metric name |
| comparison | `BaselineComparison` | How to compare: `above`, `below`, `outside`, `above_percentile`, `below_percentile` |
| sensitivity | `number` | Sigma threshold (default: 2.0) |

**Example:**

```typescript
{
  source: {
    type: 'baseline',
    metric: 'response_time',
    comparison: 'above',
    sensitivity: 3
  },
  operator: 'eq',
  value: true
}
```

---

## Operators

### Equality

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Strict equality (`===`) | `value === 'active'` |
| `neq` | Strict inequality (`!==`) | `value !== 'banned'` |

### Numeric Comparison

Requires both values to be numbers. Returns false if type mismatch.

| Operator | Description | Example |
|----------|-------------|---------|
| `gt` | Greater than | `amount > 100` |
| `gte` | Greater than or equal | `amount >= 100` |
| `lt` | Less than | `amount < 1000` |
| `lte` | Less than or equal | `amount <= 1000` |

### List Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Value is in array | `status in ['pending', 'processing']` |
| `not_in` | Value is not in array | `role not_in ['guest', 'banned']` |

### String/Array Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `contains` | String includes substring or array includes element | `tags contains 'urgent'` |
| `not_contains` | String doesn't include or array doesn't include | `tags not_contains 'spam'` |

### Regex

| Operator | Description | Example |
|----------|-------------|---------|
| `matches` | String matches regex pattern | `email matches '^[a-z]+@.*$'` |

Regex patterns are cached for performance. Invalid patterns return false.

### Existence

| Operator | Description | Example |
|----------|-------------|---------|
| `exists` | Value is not undefined and not null | `user.email exists` |
| `not_exists` | Value is undefined or null | `user.deletedAt not_exists` |

---

## Value References

The `value` field supports dynamic references using `{ ref: string }` syntax.

### Reference Syntax

| Prefix | Description | Example |
|--------|-------------|---------|
| `fact.` | Fact value | `{ ref: 'fact.config:min-amount' }` |
| `event.` | Trigger data field | `{ ref: 'event.limits.maxTotal' }` |
| `trigger.` | Alias for event | `{ ref: 'trigger.target' }` |
| `var.` | Context variable | `{ ref: 'var.maxAllowed' }` |
| `lookup.` | Lookup result | `{ ref: 'lookup.profile.address.country' }` |
| `baseline.` | Baseline statistics | `{ ref: 'baseline.response_time.mean' }` |

**Example: Compare event field to fact value**

```typescript
{
  source: { type: 'event', field: 'amount' },
  operator: 'gt',
  value: { ref: 'fact.config:min-amount' }
}
```

**Example: Compare two event fields**

```typescript
{
  source: { type: 'event', field: 'price' },
  operator: 'lte',
  value: { ref: 'event.maxPrice' }
}
```

---

## Tracing

Use `EvaluationOptions.onConditionEvaluated` to trace condition evaluations for debugging.

**Example:**

```typescript
const results: ConditionEvaluationResult[] = [];

const options: EvaluationOptions = {
  onConditionEvaluated: (result) => {
    results.push(result);
    console.log(`Condition ${result.conditionIndex}: ${result.result}`);
    console.log(`  Source: ${result.source.type}`);
    console.log(`  Actual: ${result.actualValue}`);
    console.log(`  Expected: ${result.expectedValue}`);
    console.log(`  Duration: ${result.durationMs}ms`);
  }
};

evaluator.evaluateAll(conditions, context, options);
```

---

## Behavior Notes

### Short-Circuit Evaluation

`evaluateAll()` stops at first failing condition:

```typescript
const conditions = [
  { source: { type: 'fact', pattern: 'missing' }, operator: 'exists', value: null },
  { source: { type: 'event', field: 'field' }, operator: 'eq', value: 'never-checked' }
];

// Second condition is never evaluated
evaluator.evaluateAll(conditions, context);
```

### Empty Conditions

Empty conditions array returns true (no conditions to fail):

```typescript
evaluator.evaluateAll([], context); // true
```

### Missing Values

- Missing fact: returns `undefined`
- Missing event field: returns `undefined`
- Missing variable: returns `undefined`
- Missing lookup: returns `undefined`
- Use `exists`/`not_exists` operators to check for presence

### Type Coercion

No type coercion is performed. Numeric operators require actual numbers:

```typescript
// Returns false — '100' is string, not number
{
  source: { type: 'event', field: 'amount' }, // amount: '100'
  operator: 'gt',
  value: 50
}
```

---

## See Also

- [ActionExecutor](./08-action-executor.md) — Executing rule actions
- [DSL Conditions](./11-dsl-conditions.md) — Fluent condition builders
- [BaselineStore](./22-baseline.md) — Anomaly detection baseline
- [Rule Conditions](../learn/03-rules-deep-dive/02-conditions.md) — Tutorial
