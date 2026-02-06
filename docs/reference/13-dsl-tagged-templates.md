# DSL Tagged Templates

Tagged template literal syntax for defining rules in a compact, readable text format.

## Import

```typescript
import { rule, parseRuleTemplate, ParseError } from '@hamicek/noex-rules';
```

---

## rule

```typescript
function rule(strings: TemplateStringsArray, ...values: unknown[]): RuleInput
```

Tagged template literal that parses a rule definition string into a `RuleInput` object ready for engine registration. Interpolated values are stringified and spliced into the template before parsing.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| strings | `TemplateStringsArray` | yes | Static template string segments |
| values | `unknown[]` | yes | Interpolated values |

**Returns:** `RuleInput` — A validated rule input object

**Throws:**

- `ParseError` — On syntax errors (includes line number and source)
- `Error` — If required fields (`id`, `WHEN`, `THEN`) are missing

**Basic Example:**

```typescript
const myRule = rule`
  id: order-notification
  name: Send Order Notification
  priority: 100

  WHEN event order.created
  IF event.amount >= 100
  THEN emit notification.send { orderId: event.orderId }
`;

engine.registerRule(myRule);
```

**Interpolation Example:**

```typescript
const topic = 'order.created';
const threshold = 100;

const myRule = rule`
  id: dynamic-rule
  WHEN event ${topic}
  IF event.amount >= ${threshold}
  THEN emit result
`;
```

---

## parseRuleTemplate()

```typescript
function parseRuleTemplate(input: string): RuleInput
```

Parses a rule template string into a `RuleInput` object. This is the underlying parser used by the `rule` tagged template — use it directly when working with strings from files or other sources.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input | `string` | yes | The raw template string |

**Returns:** `RuleInput` — A validated rule input object

**Throws:**

- `ParseError` — On syntax errors (includes line number)
- `Error` — If `id`, `WHEN`, or `THEN` are missing

**Example:**

```typescript
const ruleText = `
  id: from-string
  WHEN event test.trigger
  THEN emit test.result
`;

const ruleInput = parseRuleTemplate(ruleText);
engine.registerRule(ruleInput);
```

---

## Template Syntax

The template format is line-oriented. Each line is one of:

- **Property** — `key: value`
- **Trigger** — `WHEN event|fact|timer <target>`
- **Condition** — `IF <source> <operator> <value>` or `AND ...`
- **Action** — `THEN emit|setFact|deleteFact|log|cancelTimer ...`
- **Comment** — Lines starting with `#` or `//`
- **Blank lines** — Ignored

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | `string` | yes | Unique rule identifier |
| name | `string` | no | Human-readable name (defaults to `id`) |
| description | `string` | no | Rule description |
| priority | `number` | no | Execution priority (defaults to `0`) |
| enabled | `boolean` | no | Whether rule is active (defaults to `true`) |
| tags | `string` | no | Comma-separated list of tags |

**Example:**

```
id: order-processor
name: Process Large Orders
description: Routes large orders to premium processing
priority: 100
enabled: true
tags: orders, notifications, premium
```

### Triggers (WHEN)

The `WHEN` clause defines what activates the rule.

| Syntax | Description |
|--------|-------------|
| `WHEN event <topic>` | Triggered by an event on the specified topic |
| `WHEN fact <pattern>` | Triggered by a fact change matching the pattern |
| `WHEN timer <name>` | Triggered when the named timer expires |

**Examples:**

```
WHEN event order.created
WHEN fact customer:*:status
WHEN timer payment-timeout
```

### Conditions (IF / AND)

Conditions filter when the rule should fire. Multiple conditions use `AND` — all must be true.

**Syntax:** `IF|AND <source>.<field> <operator> <value>`

**Source Types:**

| Prefix | Description |
|--------|-------------|
| `event.` | Field from the triggering event |
| `fact.` | Value from fact store (key as field) |
| `context.` | Context variable |

**Operators:**

| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `in` | Value is in array |
| `not_in` | Value is not in array |
| `contains` | String/array contains value |
| `not_contains` | String/array does not contain value |
| `matches` | Regex match |
| `exists` | Field exists (unary) |
| `not_exists` | Field does not exist (unary) |

**Value Formats:**

| Format | Example | Description |
|--------|---------|-------------|
| Number | `100`, `3.14` | Numeric literal |
| String | `"confirmed"`, `'pending'` | Quoted string |
| Boolean | `true`, `false` | Boolean literal |
| Null | `null` | Null value |
| Array | `[1, 2, 3]`, `["a", "b"]` | Array literal |
| Regex | `/pattern/` | Regular expression |

**Examples:**

```
IF event.amount >= 100
AND event.status == "confirmed"
AND event.type in ["premium", "vip"]
AND fact.customer:active exists
```

### Actions (THEN)

Actions define what happens when the rule fires. Multiple actions are supported.

#### emit

Emits a new event.

```
THEN emit <topic>
THEN emit <topic> { key: value, ... }
```

**Examples:**

```
THEN emit notification.send
THEN emit order.processed { orderId: event.orderId, status: "completed" }
```

Reference syntax (`event.field`, `fact.key`, `context.var`) in object values creates dynamic references resolved at runtime.

#### setFact

Sets a fact in the fact store.

```
THEN setFact <key> <value>
```

**Examples:**

```
THEN setFact order:status "processed"
THEN setFact customer:vip true
THEN setFact order:amount event.amount
```

#### deleteFact

Deletes a fact from the fact store.

```
THEN deleteFact <key>
```

**Example:**

```
THEN deleteFact order:pending
```

#### log

Logs a message at the specified level.

```
THEN log <level> <message>
```

**Levels:** `debug`, `info`, `warn`, `error`

**Examples:**

```
THEN log info "Order processed successfully"
THEN log warn "High-value order detected"
```

#### cancelTimer

Cancels a running timer.

```
THEN cancelTimer <name>
```

**Example:**

```
THEN cancelTimer payment-timeout
```

---

## Complete Example

```typescript
const orderRule = rule`
  # Order processing rule
  id: process-large-orders
  name: Large Order Handler
  description: Routes orders over $100 to premium processing
  priority: 100
  tags: orders, premium

  WHEN event order.created
  IF event.amount >= 100
  AND event.status == "confirmed"
  THEN emit premium.process { orderId: event.orderId, amount: event.amount }
  THEN setFact order:${event.orderId}:tier "premium"
  THEN log info "Premium order received"
`;

engine.registerRule(orderRule);
```

### Multi-Condition Example

```typescript
const vipRule = rule`
  id: vip-customer-alert
  WHEN event purchase.completed
  IF event.total >= 1000
  AND fact.customer:vip == true
  AND context.region in ["us", "eu"]
  THEN emit vip.alert { customerId: event.customerId }
  THEN log info "VIP purchase alert"
`;
```

### Fact Trigger Example

```typescript
const stockRule = rule`
  id: low-stock-alert
  WHEN fact inventory:*:quantity
  IF fact.${trigger.key} < 10
  THEN emit inventory.low { product: trigger.key }
`;
```

---

## ParseError

```typescript
class ParseError extends DslError {
  readonly line: number;
  readonly source: string;

  constructor(message: string, line: number, source: string);
}
```

Thrown when the rule template parser encounters a syntax error. Includes the offending line number and source text for diagnostics.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| line | `number` | Line number where the error occurred (1-indexed) |
| source | `string` | The source text of the offending line |
| message | `string` | Full error message including line info |
| name | `string` | Always `'ParseError'` |

**Error Handling:**

```typescript
import { rule, ParseError, DslError } from '@hamicek/noex-rules';

try {
  const badRule = rule`
    id: broken-rule
    WHEN event test
    IF unknown.field badoperator value
    THEN emit result
  `;
} catch (err) {
  if (err instanceof ParseError) {
    console.error(`Syntax error on line ${err.line}: ${err.message}`);
    console.error(`Source: ${err.source}`);
  } else if (err instanceof DslError) {
    console.error('DSL error:', err.message);
  }
}
```

**Common Errors:**

| Error | Cause |
|-------|-------|
| `Unknown property "..."` | Invalid property key |
| `Invalid WHEN clause` | Missing trigger type or target |
| `Unknown trigger type "..."` | Trigger type not `event`, `fact`, or `timer` |
| `Invalid source "..."` | Condition source not `event.`, `fact.`, or `context.` |
| `Unknown operator "..."` | Invalid comparison operator |
| `Unknown action "..."` | Action type not recognized |
| `Rule template: "id" property is required` | Missing `id` property |
| `WHEN clause is required` | Missing `WHEN` line |
| `at least one THEN clause is required` | Missing `THEN` line |

---

## Types

### RuleInput

```typescript
interface RuleInput {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  tags: string[];
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
}
```

The output produced by `rule` and `parseRuleTemplate()`. Ready for direct registration with `engine.registerRule()`.

---

## Comparison with Fluent Builder

| Feature | Tagged Template | Fluent Builder |
|---------|-----------------|----------------|
| Type safety | Runtime validation | Compile-time types |
| IDE support | Syntax highlighting only | Full autocomplete |
| Readability | Very high for simple rules | Good for complex rules |
| Dynamic values | String interpolation | Native JavaScript |
| Temporal patterns | Not supported | Full support |
| Conditional actions | Not supported | Full support |

Use tagged templates for simple, readable rule definitions. Use the fluent builder for complex rules with temporal patterns, conditional actions, or when you need full type safety.

---

## See Also

- [DSL Builder](./09-dsl-builder.md) — Type-safe fluent builder API
- [DSL Triggers](./10-dsl-triggers.md) — Trigger builders including temporal patterns
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders
- [DSL Actions](./12-dsl-actions.md) — Action builders
- [YAML Loader](./14-dsl-yaml.md) — Load rules from YAML files
- [Validation](./17-validation.md) — Rule validation
