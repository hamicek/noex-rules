# DSL Goal Builders

Fluent builders for defining backward chaining query goals. Goals specify what the engine should try to achieve or prove.

## Import

```typescript
import {
  factGoal,
  eventGoal,
  FactGoalBuilder,
  EventGoalBuilder,
} from '@hamicek/noex-rules/dsl';
```

---

## factGoal()

```typescript
function factGoal(key: string): FactGoalBuilder
```

Creates a builder for a backward chaining fact goal. A fact goal asks: "Can this fact be achieved (produced by some rule chain)?"

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key or pattern to query |

**Returns:** `FactGoalBuilder` — A builder with fluent operator methods

**Throws:**

- `DslValidationError` — If `key` is empty or not a string

**Example:**

```typescript
import { factGoal, RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Query if a fact can be achieved with any value
const result1 = engine.query(factGoal('customer:123:tier'));

// Query if a fact can be achieved with a specific value
const result2 = engine.query(factGoal('customer:123:tier').equals('vip'));

// Query if a numeric fact exceeds a threshold
const result3 = engine.query(factGoal('sensor:temp').gte(100));
```

---

## FactGoalBuilder

Fluent builder for backward chaining fact goals. Provides operator methods to specify how the fact value should be evaluated.

### exists()

```typescript
exists(): FactGoalBuilder
```

Checks that the fact exists with any value. This is the default behavior — calling `exists()` is optional and serves only as a readability aid.

**Returns:** `this` — The builder for chaining

**Example:**

```typescript
// These are equivalent:
factGoal('order:456:status')
factGoal('order:456:status').exists()
```

### equals()

```typescript
equals(value: unknown): FactGoalBuilder
```

Checks that the fact value equals the expected value.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `unknown` | yes | Expected value to match |

**Returns:** `this` — The builder for chaining

**Example:**

```typescript
factGoal('customer:tier').equals('vip')
factGoal('order:status').equals('completed')
factGoal('config:debug').equals(true)
```

### neq()

```typescript
neq(value: unknown): FactGoalBuilder
```

Checks that the fact value does not equal the given value.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `unknown` | yes | Value that must not match |

**Returns:** `this` — The builder for chaining

**Example:**

```typescript
factGoal('order:status').neq('cancelled')
```

### gt()

```typescript
gt(value: number): FactGoalBuilder
```

Checks that the fact value is greater than the given number.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `number` | yes | Threshold (exclusive) |

**Returns:** `this` — The builder for chaining

**Throws:**

- `DslValidationError` — If `value` is not a finite number

**Example:**

```typescript
factGoal('account:balance').gt(0)
```

### gte()

```typescript
gte(value: number): FactGoalBuilder
```

Checks that the fact value is greater than or equal to the given number.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `number` | yes | Threshold (inclusive) |

**Returns:** `this` — The builder for chaining

**Throws:**

- `DslValidationError` — If `value` is not a finite number

**Example:**

```typescript
factGoal('sensor:temp').gte(100)
factGoal('user:age').gte(18)
```

### lt()

```typescript
lt(value: number): FactGoalBuilder
```

Checks that the fact value is less than the given number.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `number` | yes | Threshold (exclusive) |

**Returns:** `this` — The builder for chaining

**Throws:**

- `DslValidationError` — If `value` is not a finite number

**Example:**

```typescript
factGoal('inventory:stock').lt(10)
```

### lte()

```typescript
lte(value: number): FactGoalBuilder
```

Checks that the fact value is less than or equal to the given number.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `number` | yes | Threshold (inclusive) |

**Returns:** `this` — The builder for chaining

**Throws:**

- `DslValidationError` — If `value` is not a finite number

**Example:**

```typescript
factGoal('queue:size').lte(100)
```

### build()

```typescript
build(): FactGoal
```

Builds and returns the underlying `FactGoal` object.

**Returns:** `FactGoal` — The constructed goal object

**Example:**

```typescript
const goal = factGoal('customer:tier').equals('vip').build();
// { type: 'fact', key: 'customer:tier', value: 'vip', operator: 'eq' }
```

---

## eventGoal()

```typescript
function eventGoal(topic: string): EventGoalBuilder
```

Creates a builder for a backward chaining event goal. An event goal asks: "Can this event be emitted by some rule chain?"

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic to query |

**Returns:** `EventGoalBuilder` — A builder for the event goal

**Throws:**

- `DslValidationError` — If `topic` is empty or not a string

**Example:**

```typescript
import { eventGoal, RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Query if an event can be emitted
const result = engine.query(eventGoal('order.completed'));

if (result.achievable) {
  console.log('Order completion is achievable via:', result.proof);
}
```

---

## EventGoalBuilder

Fluent builder for backward chaining event goals. Simpler than `FactGoalBuilder` as events are queried by topic only.

### build()

```typescript
build(): EventGoal
```

Builds and returns the underlying `EventGoal` object.

**Returns:** `EventGoal` — The constructed goal object

**Example:**

```typescript
const goal = eventGoal('notification.sent').build();
// { type: 'event', topic: 'notification.sent' }
```

---

## Types

### Goal

```typescript
type Goal = FactGoal | EventGoal;
```

Union type representing any backward chaining goal.

### FactGoal

```typescript
interface FactGoal {
  type: 'fact';
  key: string;
  value?: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
}
```

Goal for verifying or achieving a fact.

| Field | Type | Description |
|-------|------|-------------|
| type | `'fact'` | Discriminator |
| key | `string` | Fact key or pattern |
| value | `unknown` | Expected value (omit for existence check) |
| operator | `string` | Comparison operator (default: `'eq'`) |

### EventGoal

```typescript
interface EventGoal {
  type: 'event';
  topic: string;
}
```

Goal for achieving event emission.

| Field | Type | Description |
|-------|------|-------------|
| type | `'event'` | Discriminator |
| topic | `string` | Event topic |

### GoalBuilder

```typescript
interface GoalBuilder {
  build(): Goal;
}
```

Common interface implemented by both `FactGoalBuilder` and `EventGoalBuilder`.

---

## Complete Example

```typescript
import { Rule, RuleEngine, factGoal, eventGoal, onFact, emit, setFact } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Rule: When customer becomes VIP, send notification
engine.registerRule(
  Rule.create('vip-notification')
    .when(onFact('customer:*:tier'))
    .if(fact('customer:*:tier').equals('vip'))
    .then(emit('notification.vip', { customerId: ref('event.key') }))
    .build()
);

// Rule: High spenders become VIP
engine.registerRule(
  Rule.create('vip-promotion')
    .when(onFact('customer:*:totalSpent'))
    .if(fact('customer:*:totalSpent').gte(10000))
    .then(setFact(ref('event.key').replace(':totalSpent', ':tier'), 'vip'))
    .build()
);

// Query: Can customer 123 become VIP?
const factResult = engine.query(factGoal('customer:123:tier').equals('vip'));

if (factResult.achievable) {
  console.log('VIP tier is achievable!');
  console.log('Proof tree:', JSON.stringify(factResult.proof, null, 2));
  console.log('Rules explored:', factResult.exploredRules);
}

// Query: Can VIP notification be sent?
const eventResult = engine.query(eventGoal('notification.vip'));

if (eventResult.achievable) {
  console.log('VIP notification can be triggered');
}
```

---

## See Also

- [Backward Chaining](./23-backward-chaining.md) — BackwardChainer API and QueryResult
- [DSL Builder](./09-dsl-builder.md) — Fluent builder API for rules
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders with similar operators
- [Fact Store](./02-fact-store.md) — Fact storage and retrieval
