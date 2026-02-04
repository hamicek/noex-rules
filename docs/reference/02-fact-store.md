# FactStore

Fast in-memory fact storage with pattern matching and change notifications. Used by RuleEngine internally; access via `engine.getFactStore()` for debugging or snapshots.

## Import

```typescript
import { FactStore } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: FactStoreConfig): Promise<FactStore>
```

Creates a new FactStore instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `FactStoreConfig` | no | Store configuration |

**Returns:** `Promise<FactStore>` — store instance

**Example:**

```typescript
const store = await FactStore.start({
  name: 'my-facts',
  onFactChange: (event) => {
    console.log(`Fact ${event.type}: ${event.fact.key}`);
  },
});
```

---

## Methods

### set()

```typescript
set(key: string, value: unknown, source?: string): Fact
```

Sets a fact value. Creates or updates the fact and triggers change notification.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key (supports hierarchical keys like `customer:123:age`) |
| value | `unknown` | yes | Fact value |
| source | `string` | no | Source identifier (default: `'system'`) |

**Returns:** `Fact` — stored fact with metadata

**Example:**

```typescript
const fact = store.set('customer:123:premium', true, 'billing-service');
console.log(fact.version); // 1 (increments on update)
```

### get()

```typescript
get(key: string): Fact | undefined
```

Returns complete fact with metadata by key.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key |

**Returns:** `Fact | undefined` — fact with metadata or undefined if not found

**Example:**

```typescript
const fact = store.get('customer:123:premium');
if (fact) {
  console.log(`Value: ${fact.value}, Version: ${fact.version}`);
}
```

### delete()

```typescript
delete(key: string): boolean
```

Deletes a fact and triggers change notification.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key |

**Returns:** `boolean` — true if fact was found and deleted

### query()

```typescript
query(pattern: string): Fact[]
```

Finds facts matching a pattern. Supports wildcards for flexible queries.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pattern | `string` | yes | Pattern with optional wildcards (`*`) |

**Returns:** `Fact[]` — matching facts

**Pattern syntax:**

| Pattern | Matches |
|---------|---------|
| `customer:123:*` | All facts for customer 123 |
| `customer:*:age` | Age of all customers |
| `*` | All facts |
| `order:*:status` | Status of all orders |

**Example:**

```typescript
// Get all facts for a specific customer
const customerFacts = store.query('customer:123:*');

// Get all premium status facts
const premiumFacts = store.query('customer:*:premium');
```

### filter()

```typescript
filter(predicate: (fact: Fact) => boolean): Fact[]
```

Returns facts matching a predicate function.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| predicate | `(fact: Fact) => boolean` | yes | Filter function |

**Returns:** `Fact[]` — matching facts

**Example:**

```typescript
// Find all facts with numeric values greater than 100
const highValues = store.filter((fact) =>
  typeof fact.value === 'number' && fact.value > 100
);
```

### getAll()

```typescript
getAll(): Fact[]
```

Returns all stored facts.

**Returns:** `Fact[]` — all facts

### clear()

```typescript
clear(): void
```

Removes all facts from the store.

---

## Properties

### size

```typescript
get size(): number
```

Returns the number of stored facts.

**Example:**

```typescript
console.log(`Facts count: ${store.size}`);
```

---

## Types

### Fact

```typescript
interface Fact {
  key: string;
  value: unknown;
  timestamp: number;
  source: string;
  version: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| key | `string` | Hierarchical key (e.g., `customer:123:age`) |
| value | `unknown` | Fact value |
| timestamp | `number` | Unix timestamp when set |
| source | `string` | Identifier of the setter |
| version | `number` | Version number (increments on update) |

### FactStoreConfig

```typescript
interface FactStoreConfig {
  name?: string;
  onFactChange?: FactChangeListener;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | `string` | `'facts'` | Store name for logging |
| onFactChange | `FactChangeListener` | — | Callback for change notifications |

### FactChangeEvent

```typescript
interface FactChangeEvent {
  type: FactChangeType;
  fact: Fact;
  previousValue?: unknown;
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | `FactChangeType` | Type of change |
| fact | `Fact` | The affected fact |
| previousValue | `unknown` | Previous value (for updates) |

### FactChangeType

```typescript
type FactChangeType = 'created' | 'updated' | 'deleted';
```

### FactChangeListener

```typescript
type FactChangeListener = (event: FactChangeEvent) => void;
```

---

## Pattern Matching

FactStore uses prefix indexing for efficient pattern matching. Keys are expected to use `:` as delimiter.

**Performance characteristics:**

| Pattern | Performance |
|---------|-------------|
| Exact key (`customer:123:age`) | O(1) |
| Prefix pattern (`customer:123:*`) | O(k) where k = keys with prefix |
| Wildcard prefix (`*:age`) | O(n) full scan |

**Example keys:**

```typescript
store.set('customer:123:name', 'John');
store.set('customer:123:age', 30);
store.set('customer:123:premium', true);
store.set('customer:456:name', 'Jane');
store.set('order:ORD-001:status', 'pending');
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [EventStore](./03-event-store.md) — Event storage
- [Utilities](./31-utilities.md) — Pattern matching functions
- [Facts and State](../learn/02-core-concepts/03-facts-and-state.md) — Tutorial
