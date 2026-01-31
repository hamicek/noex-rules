# Why a Rule Engine?

Every application starts with simple business logic. A discount here, a notification there. But business logic grows faster than the code that surrounds it. Before long, you're maintaining a tangled web of conditions that no single person fully understands.

A rule engine separates *what should happen* from *how the application works*, making business logic explicit, testable, and changeable without touching application code.

## What You'll Learn

- Why hardcoded business logic becomes a maintenance burden
- How scattered conditions create hidden coupling
- What the trigger-condition-action model offers instead
- How a rule engine changes who can modify business behavior

## The Problems

### Hardcoded Logic Grows Into a Tangle

Consider an e-commerce order processing function:

```typescript
async function processOrder(order: Order) {
  let discount = 0;

  // VIP customers get 10% off
  if (order.customer.tier === 'vip') {
    discount = 0.1;
  }

  // Orders over $500 get free shipping
  if (order.total > 500) {
    order.shipping = 0;
  }

  // Flash sale: 20% off electronics (but not for items already on sale)
  if (
    order.category === 'electronics' &&
    !order.isOnSale &&
    isFlashSaleActive()
  ) {
    discount = Math.max(discount, 0.2);
  }

  // Loyalty points: 2x during holidays
  const pointsMultiplier = isHolidaySeason() ? 2 : 1;
  const points = Math.floor(order.total * pointsMultiplier);

  // Flag high-value orders for manual review
  if (order.total > 10000) {
    await flagForReview(order, 'high_value');
  }

  // Fraud check: new customer + high value + international shipping
  if (
    order.customer.accountAgeDays < 30 &&
    order.total > 1000 &&
    order.shipping.country !== order.customer.country
  ) {
    await flagForReview(order, 'potential_fraud');
  }

  order.discount = discount;
  await applyOrder(order);
  await addLoyaltyPoints(order.customer.id, points);
}
```

This is six rules embedded in one function. Next month, marketing wants a seventh. The month after, compliance adds an eighth. Each rule touches different concerns (pricing, fraud, loyalty), yet they're all fused into a single code path.

### Scattered Conditions Create Hidden Coupling

Business rules rarely live in one place. The same discount logic often appears across multiple services:

```text
┌──────────────────────────────────────────────────────┐
│                   ORDER SERVICE                       │
│   if (customer.tier === 'vip') discount = 0.1        │
│   if (order.total > 500) shipping = 0                │
└──────────────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
┌──────────────────┐    ┌──────────────────────────────┐
│  PRICING SERVICE │    │      NOTIFICATION SERVICE     │
│  if (tier==='vip')│    │  if (total > 10000)           │
│    applyDiscount  │    │    sendReviewAlert            │
│  if (flashSale)   │    │  if (tier==='vip')            │
│    applyFlash     │    │    sendVIPConfirmation        │
└──────────────────┘    └──────────────────────────────┘
        │
        ▼
┌──────────────────┐
│ ANALYTICS SERVICE│
│  if (tier==='vip')│
│    trackVIP       │
│  if (flashSale)   │
│    trackFlash     │
└──────────────────┘
```

Now someone asks: "What happens when a VIP customer places an order?" You have to search three services to assemble the answer. And when the VIP threshold changes, you have to update all of them.

### The Consequences

| Problem | Effect |
|---------|--------|
| Rules mixed with application code | Changing a business rule means a code deploy |
| Duplicate conditions across services | A policy change requires updating N places |
| No central view of active rules | Nobody knows all the rules that apply |
| Testing requires full integration | Can't test a pricing rule without running the order service |
| Business stakeholders can't read the logic | Every change goes through developers |
| Side effects are implicit | No clear picture of what a rule triggers |

## The Solution: Trigger-Condition-Action

A rule engine replaces scattered if/else logic with declarative rules. Each rule is a self-contained unit with three parts:

```text
┌─────────────────────────────────────────────────────────┐
│                         RULE                             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  TRIGGER     "When does this rule activate?"             │
│  ─────────────────────────────────────────               │
│  An event occurs, a fact changes, or a timer expires.    │
│                                                          │
│  CONDITION   "Should this rule fire?"                    │
│  ─────────────────────────────────────────               │
│  Check event data, facts, or external context.           │
│  All conditions must pass.                               │
│                                                          │
│  ACTION      "What should happen?"                       │
│  ─────────────────────────────────────────               │
│  Emit events, update facts, set timers, call services.   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

Here's the VIP discount from the previous example, expressed as a rule:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({ name: 'ecommerce' });

engine.registerRule({
  id: 'vip-discount',
  name: 'VIP Customer Discount',
  priority: 100,
  enabled: true,
  tags: ['pricing', 'vip'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    {
      source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
      operator: 'eq',
      value: 'vip',
    },
  ],
  actions: [
    {
      type: 'set_fact',
      key: 'order:${event.orderId}:discount',
      value: 0.1,
    },
    {
      type: 'emit_event',
      topic: 'discount.applied',
      data: {
        orderId: { ref: 'event.orderId' },
        discount: 0.1,
        reason: 'VIP customer',
      },
    },
  ],
});
```

The rule is self-describing. Anyone — including non-developers — can understand what it does. It lives outside the order service, can be enabled or disabled without a deploy, and can be tested in isolation.

## Hardcoded vs Rule Engine

The following table compares the two approaches across key dimensions:

| Dimension | Hardcoded (if/else) | Rule Engine |
|-----------|-------------------|-------------|
| **Where rules live** | Scattered in application code | Centralized, each rule is a data structure |
| **Changing a rule** | Code change + deploy | Update rule object, optionally hot-reload |
| **Testing** | Integration tests for the whole flow | Unit test each rule independently |
| **Visibility** | Read the source code | Query active rules, filter by tag/group |
| **Who can change rules** | Developers only | Anyone who understands the schema |
| **Auditing** | Add logging manually | Built-in audit trail for every rule change |
| **Temporal logic** | Manual timer/cron management | Declarative timers and CEP patterns |
| **Side effects** | Implicit in function body | Explicit in the action list |

## Request Flow: With and Without a Rule Engine

```text
WITHOUT RULE ENGINE
───────────────────
  Request ──► Order Service ──► if/else ──► if/else ──► if/else ──► Response
                                   │           │           │
                                   ▼           ▼           ▼
                              Pricing DB   Fraud API   Email Service


WITH RULE ENGINE
────────────────
  Request ──► Order Service ──► engine.emit('order.created', data)
                                         │
                                         ▼
                                ┌─────────────────┐
                                │   Rule Engine    │
                                │                  │
                                │  Rule: VIP       │──► set_fact (discount)
                                │  Rule: Shipping  │──► set_fact (free shipping)
                                │  Rule: Fraud     │──► emit_event (review alert)
                                │  Rule: Loyalty   │──► call_service (add points)
                                │  Rule: Notify    │──► emit_event (confirmation)
                                └─────────────────┘
```

The application code shrinks to a single `emit()` call. The engine evaluates all matching rules and executes their actions. Adding or removing a rule doesn't touch the application.

## Complete Working Example

A minimal but complete example with three rules: a VIP discount, free shipping for large orders, and a fraud alert for suspicious patterns.

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'ecommerce-demo' });

  // Rule 1: VIP customers get 10% discount
  engine.registerRule({
    id: 'vip-discount',
    name: 'VIP Customer Discount',
    priority: 100,
    enabled: true,
    tags: ['pricing'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'eq',
        value: 'vip',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:discount',
        value: 0.1,
      },
      {
        type: 'log',
        level: 'info',
        message: 'VIP discount applied to order ${event.orderId}',
      },
    ],
  });

  // Rule 2: Free shipping for orders over $500
  engine.registerRule({
    id: 'free-shipping',
    name: 'Free Shipping Over $500',
    priority: 90,
    enabled: true,
    tags: ['shipping'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gte',
        value: 500,
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:freeShipping',
        value: true,
      },
    ],
  });

  // Rule 3: Fraud alert for new accounts with high-value international orders
  engine.registerRule({
    id: 'fraud-alert',
    name: 'Suspicious Order Detection',
    priority: 200,
    enabled: true,
    tags: ['fraud', 'security'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 1000,
      },
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:accountAgeDays' },
        operator: 'lt',
        value: 30,
      },
      {
        source: { type: 'event', field: 'isInternational' },
        operator: 'eq',
        value: true,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'fraud.alert',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          reason: 'New account, high value, international',
        },
      },
    ],
  });

  // Subscribe to fraud alerts
  engine.subscribe('fraud.*', (event) => {
    console.log('FRAUD ALERT:', event.data);
  });

  // Set up customer facts
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-100:accountAgeDays', 365);

  await engine.setFact('customer:C-200:tier', 'standard');
  await engine.setFact('customer:C-200:accountAgeDays', 7);

  // Process orders
  await engine.emit('order.created', {
    orderId: 'ORD-1',
    customerId: 'C-100',
    total: 750,
    isInternational: false,
  });
  // Result: VIP discount applied, free shipping applied

  await engine.emit('order.created', {
    orderId: 'ORD-2',
    customerId: 'C-200',
    total: 2000,
    isInternational: true,
  });
  // Result: Free shipping applied, fraud alert emitted

  await engine.stop();
}

main();
```

## What Changed?

Compare the two approaches:

**Before** (hardcoded):
- 6 rules embedded in `processOrder()`, each requiring different context
- Adding a rule means modifying a critical function and redeploying
- Testing one rule requires setting up the entire order flow

**After** (rule engine):
- Each rule is a standalone declaration with its own trigger, conditions, and actions
- Rules can be added, modified, or disabled at runtime
- Each rule can be tested by emitting a single event with matching facts

## Exercise

Below is a function with five hardcoded business rules. Identify each rule and rewrite it as a trigger-condition-action triplet (plain text, not code).

```typescript
function handleUserActivity(userId: string, action: string, metadata: any) {
  const user = getUser(userId);

  // 1) Send welcome email after first login
  if (action === 'login' && user.loginCount === 1) {
    sendEmail(userId, 'welcome');
  }

  // 2) Lock account after 5 failed login attempts
  if (action === 'login_failed' && user.failedAttempts >= 5) {
    lockAccount(userId);
  }

  // 3) Award badge after 100 posts
  if (action === 'post_created' && user.postCount >= 100) {
    awardBadge(userId, 'prolific_writer');
  }

  // 4) Send inactivity reminder if last login > 30 days ago
  if (action === 'daily_check' && daysSince(user.lastLogin) > 30) {
    sendEmail(userId, 'we_miss_you');
  }

  // 5) Upgrade to premium if spending > $1000 in last 90 days
  if (action === 'purchase' && user.spending90d > 1000) {
    upgradeTier(userId, 'premium');
  }
}
```

<details>
<summary>Solution</summary>

**Rule 1: Welcome Email**
- Trigger: event `user.login`
- Condition: fact `user:{userId}:loginCount` equals 1
- Action: emit event `email.send` with template "welcome"

**Rule 2: Account Lockout**
- Trigger: event `user.login_failed`
- Condition: fact `user:{userId}:failedAttempts` >= 5
- Action: set fact `user:{userId}:locked` to true, emit event `security.account_locked`

**Rule 3: Prolific Writer Badge**
- Trigger: event `post.created`
- Condition: fact `user:{userId}:postCount` >= 100
- Action: emit event `badge.award` with badge "prolific_writer"

**Rule 4: Inactivity Reminder**
- Trigger: timer `inactivity-check:{userId}` (set for 30 days after last login)
- Condition: fact `user:{userId}:lastLoginDays` > 30
- Action: emit event `email.send` with template "we_miss_you"

**Rule 5: Premium Upgrade**
- Trigger: event `user.purchase`
- Condition: fact `user:{userId}:spending90d` > 1000
- Action: set fact `user:{userId}:tier` to "premium", emit event `tier.upgraded`

Notice how each rule is now independent. Rule 4 is particularly interesting: a timer is a better fit than a periodic check, because the engine can schedule it when the user logs in and cancel it if they log in again.

</details>

## Summary

- Hardcoded business logic starts simple but grows into scattered, coupled, untestable tangles
- Every if/else chain is a rule hiding in application code
- The trigger-condition-action model makes each rule explicit and self-contained
- A rule engine centralizes business logic so it can be inspected, tested, and changed independently
- The application code reduces to emitting events and managing facts — the engine handles the rest

---

Next: [Key Concepts](./02-key-concepts.md)
