# Conditions in Depth

Conditions are the gatekeepers of rule execution. A rule's trigger decides *when* to evaluate it, but conditions decide *whether* it fires. This chapter covers every operator, every source type, dynamic references, and string interpolation — everything you need to write precise rule targeting.

## What You'll Learn

- All 12 condition operators and when to use each
- The four condition source types
- How to use dynamic references to compare values from different sources
- How string interpolation works in fact patterns
- How conditions combine (AND logic)

## Condition Structure

Every condition has three parts:

```typescript
{
  source: { type: 'event', field: 'total' },  // WHERE to read the value
  operator: 'gte',                              // HOW to compare
  value: 1000,                                  // WHAT to compare against
}
```

The engine reads the value from `source`, applies `operator`, and compares against `value`. If the comparison is true, the condition passes.

All conditions in a rule must pass for the rule to fire (logical AND). There is no built-in OR — use separate rules instead.

## Operators

### Equality

```typescript
// Exact match
{ source: { type: 'event', field: 'status' }, operator: 'eq', value: 'active' }

// Not equal
{ source: { type: 'event', field: 'status' }, operator: 'neq', value: 'cancelled' }
```

`eq` uses strict equality (`===`). Works with strings, numbers, booleans, and `null`.

### Numeric Comparison

```typescript
// Greater than
{ source: { type: 'event', field: 'total' }, operator: 'gt', value: 1000 }

// Greater than or equal
{ source: { type: 'event', field: 'total' }, operator: 'gte', value: 1000 }

// Less than
{ source: { type: 'event', field: 'quantity' }, operator: 'lt', value: 10 }

// Less than or equal
{ source: { type: 'event', field: 'quantity' }, operator: 'lte', value: 10 }
```

These operators require both sides to be numbers. If either value isn't a number, the condition fails.

### List Membership

```typescript
// Value is one of the listed items
{ source: { type: 'event', field: 'tier' }, operator: 'in', value: ['vip', 'gold', 'platinum'] }

// Value is not in the list
{ source: { type: 'event', field: 'category' }, operator: 'not_in', value: ['test', 'internal'] }
```

`in` checks whether the source value exists in the array. `not_in` is its negation.

### Contains

```typescript
// String contains substring
{ source: { type: 'event', field: 'email' }, operator: 'contains', value: '@company.com' }

// Array contains element
{ source: { type: 'event', field: 'tags' }, operator: 'contains', value: 'urgent' }

// Negation
{ source: { type: 'event', field: 'name' }, operator: 'not_contains', value: 'test' }
```

`contains` works on both strings and arrays:
- For strings: `value.includes(compareValue)`
- For arrays: `value.includes(compareValue)`

### Regular Expression

```typescript
// Match pattern
{ source: { type: 'event', field: 'orderId' }, operator: 'matches', value: '^ORD-\\d{3,}$' }

// Email format
{ source: { type: 'event', field: 'email' }, operator: 'matches', value: '^[\\w.]+@[\\w.]+\\.[a-z]{2,}$' }
```

`matches` compiles the value string as a regular expression and tests it against the source value. The regex is cached for performance.

### Existence

```typescript
// Value exists (not undefined and not null)
{ source: { type: 'fact', pattern: 'customer:C-100:tier' }, operator: 'exists', value: null }

// Value doesn't exist
{ source: { type: 'fact', pattern: 'customer:C-100:discount' }, operator: 'not_exists', value: null }
```

For `exists` and `not_exists`, the `value` field is ignored — you can set it to `null` or any value.

### Operator Reference

| Operator | Type | Condition Passes When |
|----------|------|----------------------|
| `eq` | Any | `source === value` |
| `neq` | Any | `source !== value` |
| `gt` | Number | `source > value` |
| `gte` | Number | `source >= value` |
| `lt` | Number | `source < value` |
| `lte` | Number | `source <= value` |
| `in` | Any / Array | `value.includes(source)` |
| `not_in` | Any / Array | `!value.includes(source)` |
| `contains` | String or Array | `source.includes(value)` |
| `not_contains` | String or Array | `!source.includes(value)` |
| `matches` | String | `/value/.test(source)` |
| `exists` | Any | `source !== undefined && source !== null` |
| `not_exists` | Any | `source === undefined \|\| source === null` |

## Source Types

The `source` field determines where the condition reads its value from.

### Event Source

Reads from the triggering event's `data` object:

```typescript
{ type: 'event', field: 'total' }           // event.data.total
{ type: 'event', field: 'customer.name' }    // event.data.customer.name (nested)
```

Available when the rule is triggered by an event. For fact-triggered rules, the "event" contains fact change data (`key`, `value`, `previousValue`, `type`).

### Fact Source

Reads from the fact store:

```typescript
{ type: 'fact', pattern: 'customer:C-100:tier' }                       // Static key
{ type: 'fact', pattern: 'customer:${event.customerId}:tier' }         // Dynamic key
```

The fact source reads the fact value at evaluation time. If the fact doesn't exist, the value is `undefined`.

### Context Source

Reads from engine context variables:

```typescript
{ type: 'context', key: 'environment' }
{ type: 'context', key: 'region' }
```

Context variables are metadata about the engine instance, not about specific events or facts.

### Lookup Source

Reads from external service results (requires `lookups` in the rule):

```typescript
// Rule with a lookup
{
  lookups: [
    {
      name: 'userProfile',
      service: 'userService',
      method: 'getProfile',
      args: [{ ref: 'event.userId' }],
      cache: { ttl: '5m' },
      onError: 'skip',
    },
  ],
  conditions: [
    {
      source: { type: 'lookup', name: 'userProfile', field: 'isVerified' },
      operator: 'eq',
      value: true,
    },
  ],
}
```

Lookups are evaluated before conditions. If a lookup fails and `onError` is `'skip'`, the rule is skipped entirely.

## Dynamic References

Instead of comparing against a static value, you can compare against another dynamic source using `{ ref: 'path' }`:

```typescript
// Compare shipping country against customer's stored country
{
  source: { type: 'event', field: 'shippingCountry' },
  operator: 'neq',
  value: { ref: 'fact.customer:${event.customerId}:country' },
}
```

### Reference Paths

| Prefix | Resolves To |
|--------|-------------|
| `event.fieldName` | Triggering event data |
| `fact.factKey` | Fact store value |
| `context.key` | Engine context variable |
| `lookup.name` or `lookup.name.field` | Lookup result |

### Example: Cross-Source Comparison

```typescript
// Alert when order amount differs from customer's usual spending pattern
conditions: [
  {
    source: { type: 'event', field: 'amount' },
    operator: 'gt',
    value: { ref: 'fact.customer:${event.customerId}:avgOrderAmount' },
  },
]
```

This compares the event's amount against a fact value — no hardcoded threshold needed.

## String Interpolation

Fact pattern keys and string values support `${expression}` interpolation:

```typescript
// Dynamic fact key from event data
source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }

// Dynamic reference
value: { ref: 'fact.order:${event.orderId}:discount' }
```

The expression inside `${...}` can reference:
- `event.fieldName` — triggering event data
- Any valid JavaScript path into the available context

This is evaluated at rule evaluation time, not at registration time.

## Combining Conditions

All conditions in a rule use AND logic. Every condition must pass:

```typescript
conditions: [
  // Condition 1: order total is high
  {
    source: { type: 'event', field: 'total' },
    operator: 'gte',
    value: 1000,
  },
  // Condition 2: customer is VIP
  {
    source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
    operator: 'eq',
    value: 'vip',
  },
  // Condition 3: not a test order
  {
    source: { type: 'event', field: 'tags' },
    operator: 'not_contains',
    value: 'test',
  },
]
// All three must pass for the rule to fire
```

### Implementing OR Logic

For OR logic, create separate rules with the same actions:

```typescript
// Rule A: fire if customer is VIP
engine.registerRule({
  id: 'discount-vip',
  name: 'VIP Discount',
  priority: 100,
  enabled: true,
  tags: ['pricing'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    { source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }, operator: 'eq', value: 'vip' },
  ],
  actions: [
    { type: 'set_fact', key: 'order:${event.orderId}:discount', value: 0.1 },
  ],
});

// Rule B: fire if order total > $5000 (regardless of tier)
engine.registerRule({
  id: 'discount-large-order',
  name: 'Large Order Discount',
  priority: 100,
  enabled: true,
  tags: ['pricing'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    { source: { type: 'event', field: 'total' }, operator: 'gt', value: 5000 },
  ],
  actions: [
    { type: 'set_fact', key: 'order:${event.orderId}:discount', value: 0.1 },
  ],
});
```

Either condition being true will result in the discount being applied.

## Complete Working Example

A multi-condition order processing system that demonstrates all operator categories:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'order-processor' });

  // Rule 1: International fraud check
  // Combines numeric, equality, existence, and reference conditions
  engine.registerRule({
    id: 'international-fraud-check',
    name: 'International Fraud Detection',
    priority: 200,
    enabled: true,
    tags: ['fraud', 'security'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      // Numeric: order above $500
      {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 500,
      },
      // Equality: shipping country differs from customer's country
      {
        source: { type: 'event', field: 'shippingCountry' },
        operator: 'neq',
        value: { ref: 'fact.customer:${event.customerId}:country' },
      },
      // Existence: customer must have a country on file
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:country' },
        operator: 'exists',
        value: null,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'fraud.international_mismatch',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          shippingCountry: { ref: 'event.shippingCountry' },
        },
      },
    ],
  });

  // Rule 2: Express shipping eligibility
  // Uses contains and in operators
  engine.registerRule({
    id: 'express-shipping',
    name: 'Express Shipping Eligibility',
    priority: 100,
    enabled: true,
    tags: ['shipping'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      // In: customer must be VIP or Gold tier
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'in',
        value: ['vip', 'gold'],
      },
      // Contains: order must have 'express' in shipping options
      {
        source: { type: 'event', field: 'shippingOptions' },
        operator: 'contains',
        value: 'express',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:expressEligible',
        value: true,
      },
      {
        type: 'log',
        level: 'info',
        message: 'Express shipping approved for order ${event.orderId}',
      },
    ],
  });

  // Rule 3: Suspicious email pattern
  // Uses matches (regex)
  engine.registerRule({
    id: 'suspicious-email',
    name: 'Suspicious Email Pattern',
    priority: 150,
    enabled: true,
    tags: ['fraud'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      // Matches: email looks like a temporary/disposable address
      {
        source: { type: 'event', field: 'email' },
        operator: 'matches',
        value: '(tempmail|throwaway|guerrilla|mailinator)',
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'fraud.suspicious_email',
        data: {
          orderId: { ref: 'event.orderId' },
          email: { ref: 'event.email' },
        },
      },
    ],
  });

  // Set up customer facts
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-100:country', 'US');

  await engine.setFact('customer:C-200:tier', 'standard');
  await engine.setFact('customer:C-200:country', 'US');

  // Subscribe to fraud events
  engine.subscribe('fraud.*', (event) => {
    console.log('FRAUD:', event.topic, event.data);
  });

  // Test 1: Normal VIP order with express shipping
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 300,
    shippingCountry: 'US',
    shippingOptions: ['standard', 'express'],
    email: 'alice@example.com',
  });
  // Result: Express shipping rule fires (VIP + express option)
  console.log('ORD-001 express:', engine.getFact('order:ORD-001:expressEligible'));
  // true

  // Test 2: International order from US customer
  await engine.emit('order.created', {
    orderId: 'ORD-002',
    customerId: 'C-200',
    total: 800,
    shippingCountry: 'DE',
    shippingOptions: ['standard'],
    email: 'bob@example.com',
  });
  // Result: International fraud check fires (total > 500, DE != US)

  // Test 3: Order with suspicious email
  await engine.emit('order.created', {
    orderId: 'ORD-003',
    customerId: 'C-100',
    total: 100,
    shippingCountry: 'US',
    shippingOptions: ['standard'],
    email: 'user@tempmail.org',
  });
  // Result: Suspicious email rule fires (matches regex)

  await engine.stop();
}

main();
```

## Exercise

Create an order validation system with these rules:

1. **Minimum Order**: When `order.created` fires, check that `event.total` is greater than 0. If not, emit `order.rejected` with reason "invalid_total".
2. **Country Restriction**: When `order.created` fires, check that `event.shippingCountry` is NOT in the list `['XX', 'YY', 'ZZ']` (sanctioned countries). If it is, emit `order.rejected` with reason "restricted_country".
3. **Premium Product Check**: When `order.created` fires, check that `event.items` contains "PREMIUM-001" AND the customer tier fact is "vip" or "gold". If both conditions pass, set fact `order:{orderId}:premiumApproved` to true.

Test each rule with appropriate events.

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'validation' });

  // Rule 1: Reject orders with invalid total
  engine.registerRule({
    id: 'minimum-order',
    name: 'Minimum Order Validation',
    priority: 300,
    enabled: true,
    tags: ['validation'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'lte',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'order.rejected',
        data: {
          orderId: { ref: 'event.orderId' },
          reason: 'invalid_total',
          total: { ref: 'event.total' },
        },
      },
    ],
  });

  // Rule 2: Reject orders to restricted countries
  engine.registerRule({
    id: 'country-restriction',
    name: 'Country Restriction Check',
    priority: 300,
    enabled: true,
    tags: ['validation', 'compliance'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'shippingCountry' },
        operator: 'in',
        value: ['XX', 'YY', 'ZZ'],
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'order.rejected',
        data: {
          orderId: { ref: 'event.orderId' },
          reason: 'restricted_country',
          country: { ref: 'event.shippingCountry' },
        },
      },
    ],
  });

  // Rule 3: Premium product approval
  engine.registerRule({
    id: 'premium-product-check',
    name: 'Premium Product Check',
    priority: 100,
    enabled: true,
    tags: ['products'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'items' },
        operator: 'contains',
        value: 'PREMIUM-001',
      },
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'in',
        value: ['vip', 'gold'],
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:premiumApproved',
        value: true,
      },
    ],
  });

  engine.subscribe('order.rejected', (event) => {
    console.log('REJECTED:', event.data);
  });

  // Setup
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-200:tier', 'standard');

  // Test 1: Invalid total
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: -5,
    shippingCountry: 'US',
    items: ['SKU-1'],
  });
  // REJECTED: { orderId: 'ORD-001', reason: 'invalid_total', total: -5 }

  // Test 2: Restricted country
  await engine.emit('order.created', {
    orderId: 'ORD-002',
    customerId: 'C-100',
    total: 100,
    shippingCountry: 'XX',
    items: ['SKU-1'],
  });
  // REJECTED: { orderId: 'ORD-002', reason: 'restricted_country', country: 'XX' }

  // Test 3: Premium product - VIP customer (approved)
  await engine.emit('order.created', {
    orderId: 'ORD-003',
    customerId: 'C-100',
    total: 500,
    shippingCountry: 'US',
    items: ['SKU-1', 'PREMIUM-001'],
  });
  console.log('Premium approved:', engine.getFact('order:ORD-003:premiumApproved'));
  // Premium approved: true

  // Test 4: Premium product - Standard customer (not approved)
  await engine.emit('order.created', {
    orderId: 'ORD-004',
    customerId: 'C-200',
    total: 500,
    shippingCountry: 'US',
    items: ['PREMIUM-001'],
  });
  console.log('Premium approved:', engine.getFact('order:ORD-004:premiumApproved'));
  // Premium approved: undefined (rule didn't fire - tier is 'standard')

  await engine.stop();
}

main();
```

Rule 1 uses `lte` to catch zero and negative totals. Rule 2 uses `in` to check against a blocklist. Rule 3 combines `contains` (array membership) with `in` (tier check) — both conditions must pass.

</details>

## Summary

- Every condition has `source`, `operator`, and `value` — the engine reads, compares, and gates
- 12 operators cover equality, numeric comparison, list membership, containment, regex, and existence
- Four source types: `event` (trigger data), `fact` (persistent state), `context` (engine metadata), `lookup` (external services)
- Dynamic references `{ ref: 'path' }` compare against other sources instead of static values
- String interpolation `${expression}` resolves at evaluation time — use it in fact patterns and references
- Conditions combine with AND logic — use separate rules for OR
- `matches` compiles regexes with caching for performance
- `exists` / `not_exists` check presence, ignoring the `value` field

---

Next: [Core Actions](../03-actions/01-core-actions.md)
