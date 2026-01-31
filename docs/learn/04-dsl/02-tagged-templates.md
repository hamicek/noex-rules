# Tagged Template Literals

The `rule` tagged template provides a compact, line-oriented syntax for defining rules. Each rule fits in a single template literal — no imports for helpers, no chaining, just structured text. It's ideal for quick prototyping, inline rule definitions, and situations where brevity matters more than full type safety.

## What You'll Learn

- The `rule` tagged template function and its syntax
- WHEN, IF, AND, THEN keywords and what they parse to
- Property declarations: `id`, `name`, `priority`, `tags`, `description`, `enabled`
- Inline data objects and automatic reference detection
- JavaScript/TypeScript interpolation with `${variable}`
- Supported actions: `emit`, `setFact`, `deleteFact`, `log`, `cancelTimer`
- When tagged templates are the right choice and when they're not

## Basic Syntax

A tagged template rule is a JavaScript template literal prefixed with the `rule` tag:

```typescript
import { rule } from '@hamicek/noex-rules/dsl';

const orderAlert = rule`
  id: order-alert
  name: Order Alert
  priority: 100
  tags: orders, alerts

  WHEN event order.created
  IF event.total >= 1000
  THEN emit alert.large_order { orderId: event.orderId, total: event.total }
  THEN log info "Large order received"
`;
```

This produces the exact same `RuleInput` object as the equivalent fluent builder or raw object definition. You register it with `engine.registerRule(orderAlert)`.

## Line-by-Line Breakdown

The parser processes each line independently. Blank lines and comments (`#` or `//`) are ignored.

### Properties

Properties use `key: value` syntax. All are optional except `id`:

```text
id: order-alert              → rule ID (required)
name: Order Alert            → human-readable name (defaults to ID)
description: Alerts on big   → free-text description
priority: 100                → evaluation priority (number)
tags: orders, alerts         → comma-separated tags
enabled: true                → enable/disable (true or false)
```

### WHEN — Trigger

Exactly one `WHEN` line is required:

```text
WHEN event order.created     → triggers on event topic "order.created"
WHEN fact customer:*:tier    → triggers on fact matching pattern
WHEN timer payment-timeout   → triggers on timer expiration
```

### IF / AND — Conditions

Zero or more condition lines. `IF` starts the first condition, `AND` adds more:

```text
IF event.total >= 1000
AND event.status == "confirmed"
AND event.country in [US, CA, GB]
AND fact.customer:vip exists
```

### Condition Syntax

Each condition follows the pattern: `<source>.<field> <operator> [value]`

**Sources:**

| Prefix | Maps To |
|--------|---------|
| `event.field` | Event data field |
| `fact.key` | Fact store value |
| `context.key` | Engine context variable |

**Operators:**

| Template | Maps To | Example |
|----------|---------|---------|
| `==` | `eq` | `event.status == "active"` |
| `!=` | `neq` | `event.type != "test"` |
| `>` | `gt` | `event.amount > 0` |
| `>=` | `gte` | `event.total >= 100` |
| `<` | `lt` | `event.count < 10` |
| `<=` | `lte` | `event.age <= 18` |
| `in` | `in` | `event.country in [US, CA]` |
| `not_in` | `not_in` | `event.role not_in [admin, root]` |
| `contains` | `contains` | `event.tags contains "vip"` |
| `not_contains` | `not_contains` | `event.name not_contains "test"` |
| `matches` | `matches` | `event.email matches /^.+@co\.com$/` |
| `exists` | `exists` | `event.coupon exists` |
| `not_exists` | `not_exists` | `event.deletedAt not_exists` |

**Values** are auto-parsed:
- Numbers: `100`, `3.14`
- Booleans: `true`, `false`
- Null: `null`
- Strings: `"quoted"` or `'quoted'`
- Arrays: `[US, CA, 100, true]`
- Regex: `/pattern/`

### THEN — Actions

One or more `THEN` lines, each defining an action:

```text
THEN emit notification.send { orderId: event.orderId }
THEN setFact order:X:status confirmed
THEN deleteFact order:X:pending
THEN log info "Order processed"
THEN cancelTimer payment-timeout:X
```

## Action Syntax

### emit

```text
THEN emit <topic>
THEN emit <topic> { key: value, key2: value2 }
```

Data values prefixed with `event.`, `fact.`, or `context.` are automatically converted to `{ ref: 'path' }` references:

```text
THEN emit order.confirmed { orderId: event.orderId, total: event.total }
```

Produces:
```typescript
{
  type: 'emit_event',
  topic: 'order.confirmed',
  data: {
    orderId: { ref: 'event.orderId' },
    total: { ref: 'event.total' },
  },
}
```

Literal values stay as literals:

```text
THEN emit alert.created { level: "high", code: 500 }
```

### setFact

```text
THEN setFact <key> <value>
```

```text
THEN setFact order:X:status confirmed        → value = "confirmed"
THEN setFact order:X:total 249.99            → value = 249.99
THEN setFact order:X:paid true               → value = true
THEN setFact order:X:total event.total       → value = { ref: 'event.total' }
```

### deleteFact

```text
THEN deleteFact <key>
```

```text
THEN deleteFact order:X:pending
```

### log

```text
THEN log <level> <message>
```

Levels: `debug`, `info`, `warn`, `error`. The message can be quoted or unquoted:

```text
THEN log info "Order processed successfully"
THEN log warn Order total is zero
THEN log error "Payment failed for order X"
```

### cancelTimer

```text
THEN cancelTimer <name>
```

```text
THEN cancelTimer payment-timeout:ORD-100
```

## JavaScript Interpolation

Since `rule` is a tagged template, you can use `${expression}` to inject JavaScript values:

```typescript
const topic = 'order.created';
const minAmount = 100;
const alertLevel = 'warn';

const myRule = rule`
  id: dynamic-order-check
  priority: ${50 + 50}

  WHEN event ${topic}
  IF event.amount >= ${minAmount}
  THEN log ${alertLevel} "Large order detected"
`;
```

Interpolated values are stringified and spliced into the template before parsing. This is standard JavaScript template literal behavior — `${expression}` is evaluated at definition time, not at rule execution time.

### Interpolation vs Runtime Resolution

Don't confuse template interpolation (definition-time) with runtime string interpolation (execution-time):

```typescript
const threshold = 500;

const myRule = rule`
  id: mixed-example
  WHEN event order.created
  IF event.total >= ${threshold}
  THEN log info "Order received"
`;
// ${threshold} is replaced with "500" BEFORE parsing
// The parser sees: IF event.total >= 500
```

For runtime-dynamic values (values that depend on the triggering event), use the `event.field` syntax in data objects and conditions — those are resolved when the rule fires, not when it's defined.

## Comments

Lines starting with `#` or `//` are ignored:

```typescript
const myRule = rule`
  id: commented-rule
  # This is a comment
  // So is this
  WHEN event order.created
  THEN log info "Order received"
`;
```

## Complete Working Example

A three-rule notification pipeline using tagged templates:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { rule } from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'notification-demo' });

  // Rule 1: Classify incoming orders by size
  engine.registerRule(rule`
    id: classify-order
    name: Classify Order Size
    priority: 100
    tags: orders, classification

    WHEN event order.created
    IF event.total >= 500
    THEN setFact order:${'{'}event.orderId${'}'}:class premium
    THEN emit order.classified { orderId: event.orderId, class: "premium" }
    THEN log info "Premium order classified"
  `);

  // Rule 2: Standard orders (no condition on amount)
  engine.registerRule(rule`
    id: standard-order
    name: Standard Order
    priority: 50
    tags: orders, classification

    WHEN event order.created
    IF event.total < 500
    THEN setFact order:${'{'}event.orderId${'}'}:class standard
    THEN emit order.classified { orderId: event.orderId, class: "standard" }
  `);

  // Rule 3: Log all classifications
  engine.registerRule(rule`
    id: classification-log
    name: Log Classification
    priority: 10
    tags: orders, audit

    WHEN event order.classified
    THEN log info "Order classified"
  `);

  // Test
  await engine.emit('order.created', { orderId: 'ORD-1', total: 750 });
  console.log('Class:', engine.getFact('order:ORD-1:class'));
  // "premium"

  await engine.emit('order.created', { orderId: 'ORD-2', total: 120 });
  console.log('Class:', engine.getFact('order:ORD-2:class'));
  // "standard"

  await engine.stop();
}

main();
```

## Limitations

The tagged template syntax trades completeness for brevity. It does **not** support:

| Feature | Tagged Template | Fluent Builder |
|---------|:-:|:-:|
| Event/fact/timer triggers | Yes | Yes |
| All condition operators | Yes | Yes |
| `emit`, `setFact`, `deleteFact`, `log`, `cancelTimer` | Yes | Yes |
| `setTimer` (with `onExpire` config) | No | Yes |
| `callService` | No | Yes |
| Temporal patterns (sequence, absence, count, aggregate) | No | Yes |
| Conditional actions (if/then/else) | No | Yes |
| Data requirements (lookups) | No | Yes |
| Rule groups | No | Yes |
| TypeScript type checking | No | Yes |

If you need any of the unsupported features, use the fluent builder or raw objects instead.

## Exercise

Write three rules using the `rule` tagged template:

1. **Stock Alert**: When `inventory.updated` fires and `event.quantity` <= 10, emit `alert.low_stock` with the product ID, and log a warning.
2. **Restock Confirmation**: When `inventory.restocked` fires, set fact `product:${productId}:inStock` to `true`.
3. **Price Change Audit**: When `product.price_changed` fires and the new price != the old price, log an info message about the change.

<details>
<summary>Solution</summary>

```typescript
import { rule } from '@hamicek/noex-rules/dsl';

// Rule 1: Stock alert
const stockAlert = rule`
  id: stock-alert
  name: Low Stock Alert
  priority: 100
  tags: inventory, alerts

  WHEN event inventory.updated
  IF event.quantity <= 10
  THEN emit alert.low_stock { productId: event.productId, quantity: event.quantity }
  THEN log warn "Low stock for product"
`;

// Rule 2: Restock confirmation
const restockConfirm = rule`
  id: restock-confirm
  name: Restock Confirmation
  priority: 80
  tags: inventory

  WHEN event inventory.restocked
  THEN setFact product:restocked:inStock true
  THEN log info "Product restocked"
`;

// Rule 3: Price change audit
const priceAudit = rule`
  id: price-audit
  name: Price Change Audit
  priority: 50
  tags: products, audit

  WHEN event product.price_changed
  IF event.newPrice != event.oldPrice
  THEN log info "Price changed"
`;

[stockAlert, restockConfirm, priceAudit].forEach(r => engine.registerRule(r));
```

Each rule is self-contained in a single template literal. The parser converts the text into the same `RuleInput` objects that `Rule.create().build()` produces.

</details>

## Summary

- `rule` is a tagged template function that parses a line-oriented DSL into a `RuleInput` object
- Properties (`id`, `name`, `priority`, `tags`, `description`, `enabled`) use `key: value` syntax
- `WHEN event|fact|timer <target>` defines the trigger (exactly one required)
- `IF` and `AND` define conditions with operators: `==`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not_in`, `contains`, `not_contains`, `matches`, `exists`, `not_exists`
- `THEN` defines actions: `emit`, `setFact`, `deleteFact`, `log`, `cancelTimer`
- Values prefixed with `event.`, `fact.`, or `context.` in data objects automatically become `{ ref: 'path' }` references
- JavaScript `${expression}` interpolation is evaluated at definition time, not at runtime
- Comments (`#`, `//`) and blank lines are ignored
- The parser throws `ParseError` with line numbers on syntax errors and `Error` if required fields are missing
- Use tagged templates for prototyping and simple rules; switch to the fluent builder for timers, services, temporal patterns, and full type safety

---

Next: [YAML Rules](./03-yaml-rules.md)
