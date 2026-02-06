# Utilities

Utility functions for ID generation, duration parsing, pattern matching, interpolation, and condition evaluation.

## Import

```typescript
import {
  generateId,
  parseDuration,
  formatDuration,
  matchesTopic,
  matchesFactPattern,
  matchesTimerPattern,
  matchesFilter,
  getNestedValue,
  interpolate,
  resolve,
  resolveRef,
  resolveObject,
  evaluateCondition,
  clearPatternCache,
  clearMatchesCache,
} from '@hamicek/noex-rules';

import type { InterpolationContext } from '@hamicek/noex-rules';
```

---

## ID Generation

### generateId()

Generates a unique identifier.

```typescript
function generateId(): string
```

**Returns:** `string` — Unique ID in format `{timestamp36}-{random9}`

**Example:**

```typescript
import { generateId } from '@hamicek/noex-rules';

const id = generateId();
// "lxk5m8p2-abc123def"
```

---

## Duration Parsing

### parseDuration()

Parses a duration string to milliseconds.

```typescript
function parseDuration(duration: string | number): number
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| duration | `string \| number` | yes | Duration string or raw milliseconds |

**Returns:** `number` — Duration in milliseconds

**Throws:** `Error` if duration format is invalid

**Supported units:**

| Unit | Meaning | Example |
|------|---------|---------|
| `ms` | milliseconds | `500ms` → 500 |
| `s` | seconds | `30s` → 30,000 |
| `m` | minutes | `5m` → 300,000 |
| `h` | hours | `2h` → 7,200,000 |
| `d` | days | `7d` → 604,800,000 |
| `w` | weeks | `1w` → 604,800,000 |
| `y` | years | `1y` → 31,536,000,000 |

**Example:**

```typescript
import { parseDuration } from '@hamicek/noex-rules';

parseDuration('5m');     // 300000
parseDuration('1h');     // 3600000
parseDuration('30s');    // 30000
parseDuration(5000);     // 5000 (passthrough)
parseDuration('invalid'); // throws Error
```

---

### formatDuration()

Formats milliseconds to a human-readable duration string.

```typescript
function formatDuration(ms: number): string
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ms | `number` | yes | Duration in milliseconds |

**Returns:** `string` — Formatted duration string

**Example:**

```typescript
import { formatDuration } from '@hamicek/noex-rules';

formatDuration(500);      // "500ms"
formatDuration(30000);    // "30s"
formatDuration(300000);   // "5m"
formatDuration(7200000);  // "2h"
formatDuration(86400000); // "1d"
```

---

## Pattern Matching

### matchesTopic()

Checks if a topic matches a pattern with wildcard support.

```typescript
function matchesTopic(topic: string, pattern: string): boolean
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Topic name to check |
| pattern | `string` | yes | Pattern with optional wildcards |

**Returns:** `boolean` — `true` if topic matches the pattern

**Wildcard syntax:**
- `*` matches any single segment (separated by `.`)
- `order.*` matches `order.created`, `order.updated`, etc.
- `*.error` matches `payment.error`, `auth.error`, etc.

**Example:**

```typescript
import { matchesTopic } from '@hamicek/noex-rules';

matchesTopic('order.created', 'order.created');  // true
matchesTopic('order.created', 'order.*');        // true
matchesTopic('order.created', 'payment.*');      // false
matchesTopic('user.auth.login', 'user.*.login'); // true
```

---

### matchesFactPattern()

Checks if a fact key matches a pattern with wildcard support.

```typescript
function matchesFactPattern(key: string, pattern: string): boolean
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key to check |
| pattern | `string` | yes | Pattern with optional wildcards |

**Returns:** `boolean` — `true` if key matches the pattern

**Wildcard syntax:**
- `*` matches any single segment (separated by `:`)
- `customer:*:status` matches `customer:123:status`, `customer:abc:status`

**Example:**

```typescript
import { matchesFactPattern } from '@hamicek/noex-rules';

matchesFactPattern('customer:123:age', 'customer:123:age');    // true
matchesFactPattern('customer:123:age', 'customer:*:age');      // true
matchesFactPattern('customer:123:age', 'customer:*');          // true
matchesFactPattern('order:456:status', 'customer:*:status');   // false
```

---

### matchesTimerPattern()

Checks if a timer name matches a pattern with wildcard support.

```typescript
function matchesTimerPattern(name: string, pattern: string): boolean
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer name to check |
| pattern | `string` | yes | Pattern with optional wildcards |

**Returns:** `boolean` — `true` if name matches the pattern

**Example:**

```typescript
import { matchesTimerPattern } from '@hamicek/noex-rules';

matchesTimerPattern('payment-timeout:order123', 'payment-timeout:*'); // true
matchesTimerPattern('reminder:user:456', 'reminder:*:456');           // true
```

---

### matchesFilter()

Checks if data matches a filter object.

```typescript
function matchesFilter(
  data: Record<string, unknown>,
  filter: Record<string, unknown>
): boolean
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| data | `Record<string, unknown>` | yes | Data object to check |
| filter | `Record<string, unknown>` | yes | Filter criteria (all must match) |

**Returns:** `boolean` — `true` if all filter conditions match

**Example:**

```typescript
import { matchesFilter } from '@hamicek/noex-rules';

const event = { type: 'order', status: 'paid', amount: 100 };

matchesFilter(event, { type: 'order' });                  // true
matchesFilter(event, { type: 'order', status: 'paid' });  // true
matchesFilter(event, { type: 'payment' });                // false
```

---

### getNestedValue()

Retrieves a nested value from an object using dot notation.

```typescript
function getNestedValue(obj: unknown, path: string): unknown
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| obj | `unknown` | yes | Source object |
| path | `string` | yes | Dot-separated path to the value |

**Returns:** `unknown` — Value at the path, or `undefined` if not found

**Example:**

```typescript
import { getNestedValue } from '@hamicek/noex-rules';

const data = {
  user: {
    profile: {
      name: 'Alice',
      age: 30
    }
  }
};

getNestedValue(data, 'user.profile.name'); // "Alice"
getNestedValue(data, 'user.profile.age');  // 30
getNestedValue(data, 'user.address');      // undefined
```

---

### clearPatternCache()

Clears the internal regex cache used by pattern matching functions. Useful for testing.

```typescript
function clearPatternCache(): void
```

---

## Interpolation

### InterpolationContext

Context object for interpolation and reference resolution.

```typescript
interface InterpolationContext {
  trigger: {
    type: string;
    data: Record<string, unknown>;
  };
  facts: {
    get(key: string): { value: unknown } | undefined;
  };
  matchedEvents?: Array<{ data: Record<string, unknown> }>;
  variables: Map<string, unknown>;
  lookups?: Map<string, unknown>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| trigger | `{ type: string; data: Record<string, unknown> }` | Triggering event data |
| facts | `{ get(key: string): { value: unknown } \| undefined }` | Fact store accessor |
| matchedEvents | `Array<{ data: Record<string, unknown> }>` | Matched events for temporal patterns |
| variables | `Map<string, unknown>` | Context variables |
| lookups | `Map<string, unknown>` | Lookup service results |

---

### interpolate()

Interpolates a template string with values from the context.

```typescript
function interpolate(template: string, ctx: InterpolationContext): string
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| template | `string` | yes | Template string with `${...}` expressions |
| ctx | `InterpolationContext` | yes | Interpolation context |

**Returns:** `string` — Interpolated string

**Template syntax:**
- `${trigger.field}` — Value from trigger data
- `${event.field}` — Alias for trigger
- `${fact.key}` — Value from a fact
- `${var.name}` — Value from a context variable
- `${matched.0.field}` — Value from matched events
- `${lookup.service.field}` — Value from lookup results

**Example:**

```typescript
import { interpolate, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: {
    type: 'event',
    data: { orderId: 'ORD-123', customerId: 'C-456' }
  },
  facts: {
    get: (key) => key === 'customer:C-456:name' ? { value: 'Alice' } : undefined
  },
  variables: new Map(),
};

interpolate('order:${trigger.orderId}:status', ctx);
// "order:ORD-123:status"

interpolate('Processing order for ${trigger.customerId}', ctx);
// "Processing order for C-456"
```

---

### resolve()

Resolves a reference object `{ ref: "..." }` to its actual value.

```typescript
function resolve(value: unknown, ctx: InterpolationContext): unknown
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `unknown` | yes | Value that may be a reference object |
| ctx | `InterpolationContext` | yes | Interpolation context |

**Returns:** `unknown` — Resolved value, or original value if not a reference

**Example:**

```typescript
import { resolve, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: { type: 'event', data: { amount: 99.50 } },
  facts: { get: () => undefined },
  variables: new Map(),
};

resolve({ ref: 'trigger.amount' }, ctx);  // 99.50
resolve('static value', ctx);             // "static value"
resolve(42, ctx);                         // 42
```

---

### resolveRef()

Resolves a reference string to its value.

```typescript
function resolveRef(ref: string, ctx: InterpolationContext): unknown
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ref | `string` | yes | Reference string |
| ctx | `InterpolationContext` | yes | Interpolation context |

**Returns:** `unknown` — Resolved value

**Throws:** `Error` if reference source is unknown

**Reference sources:**

| Prefix | Description | Example |
|--------|-------------|---------|
| `event.*` | Trigger/event data | `event.orderId` |
| `trigger.*` | Alias for event | `trigger.amount` |
| `fact.*` | Fact value | `fact.customer:123:status` |
| `var.*` | Context variable | `var.computedValue` |
| `matched.*` | Matched events array | `matched.0.timestamp` |
| `lookup.*` | Lookup results | `lookup.userService.email` |

**Example:**

```typescript
import { resolveRef, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: { type: 'event', data: { orderId: 'ORD-123' } },
  facts: { get: () => undefined },
  variables: new Map([['total', 250]]),
};

resolveRef('trigger.orderId', ctx);  // "ORD-123"
resolveRef('var.total', ctx);        // 250
```

---

### resolveObject()

Resolves all reference values in an object.

```typescript
function resolveObject(
  obj: Record<string, unknown>,
  ctx: InterpolationContext
): Record<string, unknown>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| obj | `Record<string, unknown>` | yes | Object with possible references |
| ctx | `InterpolationContext` | yes | Interpolation context |

**Returns:** `Record<string, unknown>` — Object with all references resolved

**Example:**

```typescript
import { resolveObject, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: { type: 'event', data: { orderId: 'ORD-123', amount: 99.50 } },
  facts: { get: () => undefined },
  variables: new Map(),
};

resolveObject({
  id: { ref: 'trigger.orderId' },
  total: { ref: 'trigger.amount' },
  static: 'value'
}, ctx);
// { id: "ORD-123", total: 99.50, static: "value" }
```

---

## Condition Evaluation

### evaluateCondition()

Evaluates a condition with the given value and comparison value.

```typescript
function evaluateCondition(
  condition: RuleCondition,
  value: unknown,
  compareValue: unknown
): boolean
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| condition | `RuleCondition` | yes | Condition object with operator |
| value | `unknown` | yes | Actual value to test |
| compareValue | `unknown` | yes | Expected/comparison value |

**Returns:** `boolean` — `true` if condition is satisfied

**Supported operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals (strict) | `value === compareValue` |
| `neq` | Not equals | `value !== compareValue` |
| `gt` | Greater than | `value > compareValue` |
| `gte` | Greater than or equal | `value >= compareValue` |
| `lt` | Less than | `value < compareValue` |
| `lte` | Less than or equal | `value <= compareValue` |
| `in` | Value in array | `compareValue.includes(value)` |
| `not_in` | Value not in array | `!compareValue.includes(value)` |
| `contains` | String/array contains | `value.includes(compareValue)` |
| `not_contains` | String/array doesn't contain | `!value.includes(compareValue)` |
| `matches` | Regex match | `new RegExp(compareValue).test(value)` |
| `exists` | Value exists | `value !== undefined && value !== null` |
| `not_exists` | Value doesn't exist | `value === undefined \|\| value === null` |

**Example:**

```typescript
import { evaluateCondition } from '@hamicek/noex-rules';

evaluateCondition({ operator: 'gt' }, 100, 50);           // true
evaluateCondition({ operator: 'eq' }, 'active', 'active'); // true
evaluateCondition({ operator: 'in' }, 'a', ['a', 'b']);   // true
evaluateCondition({ operator: 'matches' }, 'hello', '^h'); // true
evaluateCondition({ operator: 'exists' }, null, true);    // false
```

---

### clearMatchesCache()

Clears the internal regex cache used by the `matches` operator. Useful for testing.

```typescript
function clearMatchesCache(): void
```

---

## See Also

- [ConditionEvaluator](./07-condition-evaluator.md) — Condition evaluation engine
- [ActionExecutor](./08-action-executor.md) — Action execution with interpolation
- [TimerManager](./04-timer-manager.md) — Duration syntax usage
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders
