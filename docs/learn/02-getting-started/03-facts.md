# Working with Facts

Events are fire-and-forget signals. Facts are the opposite: they persist in memory and represent the current state of your system. Rules can read facts in conditions, set them in actions, and trigger on their changes. This chapter covers the full fact API and fact-triggered rules.

## What You'll Learn

- How to set, get, delete, and query facts
- The key format convention and wildcard patterns
- How fact-triggered rules work
- When to use facts vs events
- How fact changes drive forward chaining

## The Fact API

### Setting Facts

`setFact()` creates or updates a fact. It's async because setting a fact can trigger rule evaluation:

```typescript
// Set a simple value
await engine.setFact('customer:C-100:tier', 'vip');

// Set a numeric value
await engine.setFact('customer:C-100:spending', 4250);

// Set a boolean
await engine.setFact('order:ORD-1:shipped', false);

// Set a complex value
await engine.setFact('customer:C-100:preferences', {
  currency: 'USD',
  language: 'en',
  notifications: true,
});
```

Facts can hold any value: strings, numbers, booleans, objects, arrays.

### Getting Facts

`getFact()` returns the value directly. `getFactFull()` returns the complete fact object with metadata:

```typescript
// Get just the value
const tier = engine.getFact('customer:C-100:tier');
console.log(tier);  // 'vip'

// Get the full fact with metadata
const fact = engine.getFactFull('customer:C-100:tier');
console.log(fact);
// {
//   key: 'customer:C-100:tier',
//   value: 'vip',
//   timestamp: 1706000000000,
//   source: 'api',
//   version: 1,
// }
```

`getFact()` returns `undefined` if the fact doesn't exist.

### Deleting Facts

```typescript
const deleted = engine.deleteFact('customer:C-100:tier');
console.log(deleted);  // true (existed and was removed)
```

### Querying Facts

`queryFacts()` finds facts matching a wildcard pattern:

```typescript
// All facts for a specific customer
const customerFacts = engine.queryFacts('customer:C-100:*');

// All customer tiers
const allTiers = engine.queryFacts('customer:*:tier');

// All facts
const everything = engine.getAllFacts();
```

Each result is a full `Fact` object:

```typescript
const facts = engine.queryFacts('customer:C-100:*');
for (const fact of facts) {
  console.log(`${fact.key} = ${fact.value} (v${fact.version})`);
}
// customer:C-100:tier = vip (v1)
// customer:C-100:spending = 4250 (v1)
```

## Key Format Convention

Fact keys use a hierarchical, colon-separated format: `entity:id:field`. This convention enables meaningful wildcard queries:

```text
┌──────────────────────────────────────────────────────────────┐
│  Format:  entity : identifier : field                        │
│                                                              │
│  customer:C-100:tier           one customer's tier           │
│  customer:C-100:*              all fields for customer C-100 │
│  customer:*:tier               tier for all customers        │
│  order:ORD-1:status            one order's status            │
│  order:*:total                 totals for all orders         │
│  inventory:SKU-42:quantity     stock for one product         │
│  inventory:*:quantity          stock for all products        │
└──────────────────────────────────────────────────────────────┘
```

The convention is not enforced by the engine — you can use any string as a key. But the colon-separated format works well with wildcard queries and string interpolation in rules:

```typescript
// In a condition, interpolate the customer ID from the triggering event
source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }
```

## Fact-Triggered Rules

Facts don't just store state — they can trigger rules. When a fact changes, the engine evaluates all rules whose trigger pattern matches the fact key:

```typescript
engine.registerRule({
  id: 'vip-upgrade-notification',
  name: 'Notify on VIP Upgrade',
  priority: 100,
  enabled: true,
  tags: ['loyalty'],
  trigger: { type: 'fact', pattern: 'customer:*:tier' },
  conditions: [
    {
      source: { type: 'event', field: 'value' },
      operator: 'eq',
      value: 'vip',
    },
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'notification.vip_upgrade',
      data: {
        customerId: { ref: 'event.key' },
        newTier: { ref: 'event.value' },
      },
    },
  ],
});
```

When a fact-triggered rule fires, the "event" context contains:

| Field | Content |
|-------|---------|
| `event.key` | The fact key that changed |
| `event.value` | The new value |
| `event.previousValue` | The previous value (if updating) |
| `event.type` | `'created'`, `'updated'`, or `'deleted'` |

### Wildcard Patterns in Triggers

The `*` wildcard matches any segment between colons:

```typescript
// Fires for ANY customer's tier change
{ type: 'fact', pattern: 'customer:*:tier' }

// Fires for ANY field change on customer C-100
{ type: 'fact', pattern: 'customer:C-100:*' }

// Fires for ANY customer, ANY field
{ type: 'fact', pattern: 'customer:*:*' }
```

## Facts vs Events

| | Facts | Events |
|---|-------|--------|
| **Lifecycle** | Persist until changed or deleted | Fire once, then stored in event log |
| **Value** | Current state, overwritten on update | Immutable after creation |
| **Trigger** | Rules fire on value change | Rules fire on emission |
| **In conditions** | Readable anytime via `{ type: 'fact' }` | Accessible only during triggered evaluation |
| **Use when** | Other rules need this data later | You need to signal that something happened |

**Rules of thumb:**

- If you need to check the value in another rule's condition → make it a fact
- If you need to signal "something happened" → emit an event
- If you need both → set a fact AND emit an event in the same rule

## Forward Chaining with Facts

When a rule action sets a fact, that change can trigger other rules, creating a chain:

```text
  event: purchase.completed
       │
       ▼
  Rule: "Update Spending" ──► setFact('customer:C-100:spending', 5200)
                                      │
                                      ▼
                                Rule: "Check VIP Threshold"
                                      │  condition: spending >= 5000 → PASS
                                      ▼
                                setFact('customer:C-100:tier', 'vip')
                                      │
                                      ▼
                                Rule: "VIP Notification"
                                      └──► emit_event('notification.vip_upgrade')
```

Three independent rules chain automatically through fact changes. No rule knows about the others.

## Complete Working Example

A customer loyalty system that tracks spending, automatically upgrades VIP status, and notifies on tier changes:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'loyalty' });

  // Rule 1: Track cumulative spending
  engine.registerRule({
    id: 'track-spending',
    name: 'Update Customer Spending',
    priority: 100,
    enabled: true,
    tags: ['loyalty'],
    trigger: { type: 'event', topic: 'purchase.completed' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'customer:${event.customerId}:lastPurchase',
        value: { ref: 'event.amount' },
      },
      {
        type: 'emit_event',
        topic: 'spending.updated',
        data: {
          customerId: { ref: 'event.customerId' },
          amount: { ref: 'event.amount' },
        },
      },
    ],
  });

  // Rule 2: VIP upgrade when spending threshold reached
  engine.registerRule({
    id: 'vip-upgrade',
    name: 'Auto VIP Upgrade',
    priority: 100,
    enabled: true,
    tags: ['loyalty', 'vip'],
    trigger: { type: 'fact', pattern: 'customer:*:totalSpending' },
    conditions: [
      {
        source: { type: 'event', field: 'value' },
        operator: 'gte',
        value: 5000,
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'customer:${event.key.split(":")[1]}:tier',
        value: 'vip',
      },
      {
        type: 'log',
        level: 'info',
        message: 'Customer upgraded to VIP based on spending',
      },
    ],
  });

  // Rule 3: Notify on tier changes
  engine.registerRule({
    id: 'tier-change-notify',
    name: 'Tier Change Notification',
    priority: 90,
    enabled: true,
    tags: ['loyalty', 'notifications'],
    trigger: { type: 'fact', pattern: 'customer:*:tier' },
    conditions: [
      {
        source: { type: 'event', field: 'type' },
        operator: 'in',
        value: ['created', 'updated'],
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.tier_changed',
        data: {
          key: { ref: 'event.key' },
          newTier: { ref: 'event.value' },
          previousTier: { ref: 'event.previousValue' },
        },
      },
    ],
  });

  // Subscribe to notifications
  engine.subscribe('notification.*', (event) => {
    console.log('NOTIFICATION:', event.topic, event.data);
  });

  // Set initial customer state
  await engine.setFact('customer:C-100:tier', 'standard');
  await engine.setFact('customer:C-100:totalSpending', 0);

  // Simulate purchases
  await engine.emit('purchase.completed', {
    customerId: 'C-100',
    amount: 2000,
    orderId: 'ORD-001',
  });

  // Manually update total spending (in a real app, this would be calculated)
  await engine.setFact('customer:C-100:totalSpending', 2000);

  await engine.emit('purchase.completed', {
    customerId: 'C-100',
    amount: 3500,
    orderId: 'ORD-002',
  });

  await engine.setFact('customer:C-100:totalSpending', 5500);
  // This triggers Rule 2 (spending >= 5000), which sets tier to 'vip',
  // which triggers Rule 3 (tier changed notification)

  // Verify final state
  console.log('Tier:', engine.getFact('customer:C-100:tier'));
  // Tier: vip

  console.log('Total spending:', engine.getFact('customer:C-100:totalSpending'));
  // Total spending: 5500

  // Query all facts for this customer
  const facts = engine.queryFacts('customer:C-100:*');
  console.log('Customer facts:');
  for (const f of facts) {
    console.log(`  ${f.key} = ${JSON.stringify(f.value)}`);
  }

  await engine.stop();
}

main();
```

## Exercise

Build an inventory monitoring system with these rules:

1. **Low Stock Alert**: When any `inventory:*:quantity` fact changes and the new value is less than 10, emit `alert.low_stock` with the product key and current quantity
2. **Out of Stock**: When any `inventory:*:quantity` fact changes and the new value equals 0, set fact `inventory:{productId}:status` to "out_of_stock" and emit `alert.out_of_stock`
3. **Restock Notification**: When any `inventory:*:status` fact changes to "out_of_stock", emit `notification.reorder` with the product details

Test by setting quantities: 50, then 8, then 0.

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'inventory' });

  // Rule 1: Low stock alert
  engine.registerRule({
    id: 'low-stock-alert',
    name: 'Low Stock Alert',
    priority: 100,
    enabled: true,
    tags: ['inventory', 'alerts'],
    trigger: { type: 'fact', pattern: 'inventory:*:quantity' },
    conditions: [
      {
        source: { type: 'event', field: 'value' },
        operator: 'lt',
        value: 10,
      },
      {
        source: { type: 'event', field: 'value' },
        operator: 'gt',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'alert.low_stock',
        data: {
          factKey: { ref: 'event.key' },
          quantity: { ref: 'event.value' },
        },
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Low stock: ${event.key} = ${event.value}',
      },
    ],
  });

  // Rule 2: Out of stock
  engine.registerRule({
    id: 'out-of-stock',
    name: 'Out of Stock Handler',
    priority: 200,
    enabled: true,
    tags: ['inventory', 'alerts'],
    trigger: { type: 'fact', pattern: 'inventory:*:quantity' },
    conditions: [
      {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'alert.out_of_stock',
        data: {
          factKey: { ref: 'event.key' },
        },
      },
    ],
  });

  // Rule 3: Restock notification on out-of-stock status
  engine.registerRule({
    id: 'restock-notify',
    name: 'Restock Notification',
    priority: 100,
    enabled: true,
    tags: ['inventory', 'notifications'],
    trigger: { type: 'event', topic: 'alert.out_of_stock' },
    conditions: [],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.reorder',
        data: {
          product: { ref: 'event.factKey' },
          message: 'Product is out of stock, reorder required',
        },
      },
      {
        type: 'log',
        level: 'error',
        message: 'REORDER REQUIRED: ${event.factKey}',
      },
    ],
  });

  engine.subscribe('alert.*', (event) => {
    console.log('ALERT:', event.topic, event.data);
  });

  engine.subscribe('notification.*', (event) => {
    console.log('NOTIFICATION:', event.topic, event.data);
  });

  // Test: quantity 50 (no alerts)
  await engine.setFact('inventory:SKU-42:quantity', 50);

  // Test: quantity 8 (low stock alert)
  await engine.setFact('inventory:SKU-42:quantity', 8);

  // Test: quantity 0 (out of stock → restock notification)
  await engine.setFact('inventory:SKU-42:quantity', 0);

  await engine.stop();
}

main();
```

Setting quantity to 50 triggers no alerts. Setting to 8 triggers the low stock alert (8 < 10 and 8 > 0). Setting to 0 triggers the out-of-stock rule (which has higher priority), emitting an event that chains into the restock notification.

</details>

## Summary

- `setFact(key, value)` creates or updates a fact — it's async because it can trigger rules
- `getFact(key)` returns the value; `getFactFull(key)` returns the full fact with metadata
- `queryFacts(pattern)` finds facts matching wildcard patterns like `customer:*:tier`
- Fact keys follow the convention `entity:id:field` for structured queries
- Fact-triggered rules use `{ type: 'fact', pattern: '...' }` and fire on any matching fact change
- The fact change context includes `key`, `value`, `previousValue`, and `type`
- Facts persist in memory until changed or deleted — use them for state that other rules need to reference
- Fact changes drive forward chaining: one rule's `set_fact` action can trigger another rule

---

Next: [Conditions in Depth](./04-conditions.md)
