# Rule Groups and Tags

When your rule engine grows beyond a handful of rules, you need a way to manage them as logical units. Turning off a feature shouldn't mean finding and disabling 12 individual rules. Rolling out an A/B test shouldn't require tracking which rules belong to variant A. Rule groups give you a **master switch** for sets of related rules, and tags give you a **flexible labeling system** for cross-cutting concerns.

## What You'll Learn

- How to create and manage rule groups
- The `isRuleActive()` semantics and the two-level enable/disable model
- How to assign rules to groups using the fluent builder
- How to use tags for categorization and filtering
- Practical patterns: feature flags, A/B testing, environment-specific rules

## Rule Groups

A rule group is a named container with an `enabled` flag. When a group is disabled, **all rules in that group are deactivated** — regardless of their individual `enabled` state.

### The RuleGroup Interface

```typescript
interface RuleGroup {
  id: string;          // Unique identifier
  name: string;        // Human-readable name
  description?: string;
  enabled: boolean;    // Master switch
  createdAt: number;
  updatedAt: number;
}
```

### Creating and Managing Groups

Groups must be created before rules can reference them:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, log } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Create a group
const group = engine.createGroup({
  id: 'holiday-promotions',
  name: 'Holiday Promotions',
  description: 'Seasonal pricing and discount rules',
  enabled: true,
});

// Register a rule in the group
engine.registerRule(
  Rule.create('holiday-discount')
    .name('Holiday 20% Discount')
    .group('holiday-promotions')
    .when(onEvent('order.created'))
    .if(event('total').gte(50))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.2,
    }))
    .build()
);

// Register another rule in the same group
engine.registerRule(
  Rule.create('holiday-free-shipping')
    .name('Holiday Free Shipping')
    .group('holiday-promotions')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:freeShipping', true))
    .build()
);
```

### Group Lifecycle

```text
  createGroup()         enableGroup()         deleteGroup()
       │                     │                     │
       ▼                     ▼                     ▼
  ┌─────────┐          ┌─────────┐          ┌─────────────┐
  │ enabled │──────────▶│ enabled │          │   deleted   │
  │  true   │          │  true   │          │ rules become│
  └─────────┘          └─────────┘          │  ungrouped  │
       │                     ▲               └─────────────┘
       │ disableGroup()      │                     ▲
       ▼                     │                     │
  ┌─────────┐               │                     │
  │ enabled │───────────────┘                      │
  │  false  │──────────────────────────────────────┘
  └─────────┘
```

**Key behaviors**:
- `createGroup()` — Creates a new group. Throws if the ID already exists. Default: `enabled: true`.
- `enableGroup(id)` / `disableGroup(id)` — Toggles the master switch. Affects all rules in the group immediately.
- `deleteGroup(id)` — Removes the group. Rules that belonged to it become **ungrouped** (their `group` field is cleared), not deleted.
- `updateGroup(id, updates)` — Updates name, description, or enabled state.
- `getGroup(id)` — Returns the group, or `undefined`.
- `getGroups()` — Returns all groups.
- `getGroupRules(id)` — Returns all rules assigned to the group.

### Disabling a Group

```typescript
// Holiday season is over — disable all holiday rules at once
engine.disableGroup('holiday-promotions');

// Both 'holiday-discount' and 'holiday-free-shipping' are now inactive.
// They won't fire even though their individual enabled flag is still true.
```

### Deleting a Group

```typescript
// Remove the group entirely
engine.deleteGroup('holiday-promotions');

// Rules are NOT deleted — they become ungrouped.
// 'holiday-discount' and 'holiday-free-shipping' are now active again
// (assuming their individual enabled flag is true).
```

## The Two-Level Enable/Disable Model

The engine uses a two-level activation check. A rule fires only when **both** levels are active:

```text
  isRuleActive(rule)?
       │
       ├── rule.enabled === false?  ──→  INACTIVE
       │
       ├── rule.group exists?
       │      │
       │      ├── group.enabled === false?  ──→  INACTIVE
       │      │
       │      └── group.enabled === true?   ──→  ACTIVE
       │
       └── no group?  ──→  ACTIVE
```

The implementation is straightforward:

```typescript
isRuleActive(rule: Rule): boolean {
  if (!rule.enabled) return false;
  if (rule.group) {
    const group = this.groups.get(rule.group);
    if (group && !group.enabled) return false;
  }
  return true;
}
```

This means:

| `rule.enabled` | Group exists? | `group.enabled` | Result |
|:-:|:-:|:-:|:-:|
| `false` | — | — | **Inactive** |
| `true` | No | — | **Active** |
| `true` | Yes | `true` | **Active** |
| `true` | Yes | `false` | **Inactive** |

### Why Two Levels?

The two-level model lets you disable individual rules for debugging while keeping the group active, **and** disable entire groups for feature management without touching individual rules:

```typescript
// Debug: disable one problematic rule without affecting the group
engine.disableRule('holiday-discount');
// 'holiday-free-shipping' still fires

// Feature flag: disable the entire feature
engine.disableGroup('holiday-promotions');
// All rules stop, regardless of their individual state

// Re-enable the group — 'holiday-free-shipping' fires again,
// but 'holiday-discount' stays disabled (its own flag is still false)
engine.enableGroup('holiday-promotions');
```

## Tags

Tags are string labels attached to individual rules. Unlike groups, tags have no built-in behavioral effect — they're metadata for **categorization, filtering, and querying**.

### Assigning Tags

```typescript
engine.registerRule(
  Rule.create('fraud-velocity-check')
    .name('Transaction Velocity Check')
    .tags('fraud', 'security', 'payments')
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(1000))
    .then(emit('fraud.check_required', {
      transactionId: ref('event.transactionId'),
    }))
    .build()
);
```

Tags are stored as an array on the rule: `tags: string[]`. A rule can have zero or more tags.

### Tags vs Groups

| Aspect | Groups | Tags |
|--------|--------|------|
| **Cardinality** | A rule belongs to **at most one** group | A rule can have **any number of** tags |
| **Behavioral effect** | Disabling a group deactivates its rules | No built-in effect on rule activation |
| **Purpose** | Lifecycle management (enable/disable sets of rules) | Categorization, filtering, documentation |
| **Hierarchy** | Flat (no nested groups) | Flat (no tag hierarchy) |

### When to Use Which

Use **groups** when you need to:
- Enable/disable multiple rules with a single call
- Implement feature flags or A/B testing
- Separate rules by deployment environment

Use **tags** when you need to:
- Categorize rules across multiple dimensions
- Filter rules in API queries or admin UIs
- Document rule purpose (e.g., `'security'`, `'billing'`, `'notifications'`)

You can combine both — a rule can belong to a group **and** have tags:

```typescript
engine.registerRule(
  Rule.create('beta-fraud-ml')
    .name('ML-Based Fraud Detection (Beta)')
    .group('beta-features')
    .tags('fraud', 'ml', 'beta')
    .when(onEvent('transaction.created'))
    .then(callService('mlFraudService', 'analyze', {
      data: ref('event'),
    }))
    .build()
);
```

## Complete Example: Feature Flags with Groups

A common pattern is using groups as feature flags. This example manages an e-commerce recommendation engine that can be toggled on and off:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, onFact, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Create feature group
engine.createGroup({
  id: 'recommendations',
  name: 'Product Recommendations',
  description: 'AI-powered product recommendation rules',
  enabled: true,
});

// Rule 1: Track browsing behavior
engine.registerRule(
  Rule.create('track-browse')
    .name('Track Product Views')
    .group('recommendations')
    .tags('recommendations', 'tracking')
    .when(onEvent('product.viewed'))
    .then(setFact(
      'customer:${event.customerId}:lastViewed',
      ref('event.productId')
    ))
    .build()
);

// Rule 2: Recommend based on purchase history
engine.registerRule(
  Rule.create('cross-sell')
    .name('Cross-Sell Recommendation')
    .group('recommendations')
    .tags('recommendations', 'sales')
    .priority(5)
    .when(onEvent('order.completed'))
    .then(emit('recommendation.generate', {
      customerId: ref('event.customerId'),
      type: 'cross-sell',
      basedOn: ref('event.items'),
    }))
    .build()
);

// Rule 3: Send recommendation email
engine.registerRule(
  Rule.create('recommend-email')
    .name('Recommendation Email')
    .group('recommendations')
    .tags('recommendations', 'email')
    .priority(1)
    .when(onEvent('recommendation.generated'))
    .then(callService('emailService', 'send', {
      to: ref('event.customerId'),
      template: 'recommendation',
      products: ref('event.products'),
    }))
    .build()
);

// --- Feature management ---

// Check which rules are in the group
const rules = engine.getGroupRules('recommendations');
console.log(`Recommendation rules: ${rules.length}`);
// Recommendation rules: 3

// Disable the feature during a deployment
engine.disableGroup('recommendations');
// All 3 rules stop firing immediately

// Re-enable after deployment
engine.enableGroup('recommendations');
// All 3 rules resume firing
```

## Exercise

Design a rule organization scheme for an e-commerce platform with these requirements:

1. **Pricing rules** (discounts, promotions, coupons) that can be toggled on/off as a unit
2. **Fraud detection rules** that must always be active (never accidentally disabled)
3. **Beta features** (new recommendation algorithm, experimental checkout flow) that only run in staging
4. All rules should be queryable by domain (`pricing`, `fraud`, `checkout`, `recommendations`)

Create the groups, then register one example rule per group with appropriate tags.

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Group 1: Pricing — togglable
engine.createGroup({
  id: 'pricing',
  name: 'Pricing Rules',
  description: 'Discounts, promotions, and coupon rules',
  enabled: true,
});

// Group 2: Fraud — always active (enforce via policy, not code)
// We still use a group for organizational clarity, but never disable it.
engine.createGroup({
  id: 'fraud-detection',
  name: 'Fraud Detection',
  description: 'Transaction monitoring and fraud prevention',
  enabled: true,
});

// Group 3: Beta features — disabled in production
const isProduction = process.env.NODE_ENV === 'production';
engine.createGroup({
  id: 'beta-features',
  name: 'Beta Features',
  description: 'Experimental features for staging only',
  enabled: !isProduction,
});

// Pricing rule
engine.registerRule(
  Rule.create('summer-sale')
    .name('Summer Sale 15% Off')
    .group('pricing')
    .tags('pricing', 'promotions', 'seasonal')
    .when(onEvent('order.created'))
    .if(event('total').gte(30))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.15,
      reason: 'summer-sale',
    }))
    .build()
);

// Fraud rule
engine.registerRule(
  Rule.create('high-value-check')
    .name('High-Value Transaction Check')
    .group('fraud-detection')
    .tags('fraud', 'security', 'payments')
    .priority(100)
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(5000))
    .then(emit('fraud.review_required', {
      transactionId: ref('event.transactionId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// Beta feature rule
engine.registerRule(
  Rule.create('ml-recommendations')
    .name('ML-Based Recommendations')
    .group('beta-features')
    .tags('recommendations', 'ml', 'beta')
    .when(onEvent('product.viewed'))
    .then(callService('mlService', 'recommend', {
      customerId: ref('event.customerId'),
      productId: ref('event.productId'),
    }))
    .build()
);

// Ungrouped rule with tags for checkout domain
engine.registerRule(
  Rule.create('checkout-validation')
    .name('Checkout Address Validation')
    .tags('checkout', 'validation')
    .when(onEvent('checkout.started'))
    .then(callService('addressService', 'validate', {
      address: ref('event.shippingAddress'),
    }))
    .build()
);
```

Key design decisions:
- **Pricing** uses a group so promotions can be toggled during sales events
- **Fraud detection** uses a group for organization but is never disabled — this is a team policy
- **Beta features** use a group with `enabled` controlled by environment
- **Tags** provide cross-cutting queries: find all `'security'` rules, all `'payments'` rules, etc.
- The checkout rule is **ungrouped** but tagged — not everything needs a group

</details>

## Summary

- **Rule groups** provide a master enable/disable switch for sets of related rules
- A rule is active only when `rule.enabled === true` **and** its group (if any) is enabled
- Groups must be created before rules can reference them; deleting a group orphans its rules, not deletes them
- **Tags** are metadata labels with no behavioral effect — use them for categorization and filtering
- A rule belongs to **at most one group** but can have **any number of tags**
- Groups are ideal for feature flags, A/B testing, and environment-specific rule sets
- Tags are ideal for cross-cutting categorization across domains

---

Next: [Priority and Execution Order](./02-priority-and-ordering.md)
