# Priority and Execution Order

When multiple rules match the same trigger, the engine needs to decide which one to evaluate first. A discount rule that sets a fact might need to run before a notification rule that reads it. A validation rule should reject invalid data before downstream rules process it. The `priority` field gives you explicit control over evaluation order, and the engine's concurrency settings let you tune how triggers cascade through rule chains.

## What You'll Learn

- How priority controls rule evaluation order
- How rule chaining works when actions trigger other rules
- How to avoid infinite loops with `maxConcurrency`
- How `debounceMs` batches rapid fact changes
- Design patterns for predictable rule evaluation

## Priority

Every rule has a `priority` field — a number that determines evaluation order when multiple rules match the same trigger. **Higher priority = evaluated first**.

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, setFact, emit, log, ref, event } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Validation runs first (priority 100)
engine.registerRule(
  Rule.create('validate-order')
    .name('Validate Order')
    .priority(100)
    .when(onEvent('order.created'))
    .if(event('total').lte(0))
    .then(emit('order.rejected', {
      orderId: ref('event.orderId'),
      reason: 'invalid-total',
    }))
    .build()
);

// Business logic runs second (priority 50)
engine.registerRule(
  Rule.create('apply-discount')
    .name('Apply Loyalty Discount')
    .priority(50)
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:tier').eq('gold'))
    .then(setFact('order:${event.orderId}:discount', 0.1))
    .build()
);

// Notification runs last (priority 10)
engine.registerRule(
  Rule.create('notify-order')
    .name('Order Confirmation Email')
    .priority(10)
    .when(onEvent('order.created'))
    .then(callService('emailService', 'send', {
      to: ref('event.customerId'),
      template: 'order-confirmation',
    }))
    .build()
);
```

### Priority Rules

| Property | Value |
|----------|-------|
| **Type** | Finite number (`number`, no `Infinity` or `NaN`) |
| **Default** | `0` |
| **Direction** | Higher number = evaluated first |
| **Scope** | Per-trigger — priority only matters among rules sharing the same trigger |
| **Ties** | Rules with equal priority have no guaranteed order relative to each other |

### Priority Ranges

There's no enforced range, but a consistent convention helps:

```text
  ┌────────────────┬───────────────────────────────────┐
  │  Priority      │  Typical Use                      │
  ├────────────────┼───────────────────────────────────┤
  │  100+          │  Validation, security checks      │
  │  50-99         │  Core business logic              │
  │  10-49         │  Secondary effects, calculations  │
  │  1-9           │  Notifications, logging           │
  │  0 (default)   │  Rules where order doesn't matter │
  │  negative      │  Cleanup, fallback handlers       │
  └────────────────┴───────────────────────────────────┘
```

### Priority in the Fluent Builder

```typescript
Rule.create('my-rule')
  .priority(75)    // Must be a finite number
  .when(/* ... */)
  .then(/* ... */)
  .build()
```

The builder validates the value at build time:

```typescript
Rule.create('bad-priority')
  .priority(Infinity)  // Throws DslValidationError: Priority must be a finite number
```

## Rule Chaining

When a rule's action emits an event, sets a fact, or fires a timer, other rules that match the new trigger will evaluate. This is **rule chaining** — also known as forward chaining.

```text
  Event: order.created
       │
       ▼
  ┌─────────────────────┐
  │ validate-order       │  priority: 100
  │ (passes)            │
  └─────────────────────┘
       │
       ▼
  ┌─────────────────────┐
  │ apply-discount       │  priority: 50
  │ action: setFact()   │──→ fact change triggers more rules
  └─────────────────────┘
       │                        │
       ▼                        ▼
  ┌─────────────────────┐  ┌──────────────────────┐
  │ notify-order         │  │ recalculate-total     │  triggered by
  │ priority: 10        │  │ fact: order:*:discount │  the fact change
  └─────────────────────┘  └──────────────────────┘
```

Rule chaining is powerful but requires care — a chain of actions can trigger an unbounded cascade.

## Controlling Concurrency and Cascades

The `RuleEngine.start()` configuration provides two parameters for managing rule chains:

```typescript
const engine = await RuleEngine.start({
  maxConcurrency: 10,  // Max parallel rule evaluations (default: 10)
  debounceMs: 0,       // Debounce for fact change triggers (default: 0)
});
```

### maxConcurrency

Limits the number of rule evaluations that can be in progress simultaneously. This prevents runaway chains from consuming unbounded resources:

```typescript
const engine = await RuleEngine.start({
  maxConcurrency: 5,
});
```

When the limit is reached, additional trigger processing is queued and executes as earlier evaluations complete.

### debounceMs

When a rule's action changes a fact, and another rule triggers on that fact pattern, `debounceMs` controls how quickly the cascading trigger fires. A value of `0` means immediate evaluation:

```typescript
const engine = await RuleEngine.start({
  debounceMs: 50,  // Wait 50ms before evaluating cascading fact triggers
});
```

This is useful when multiple facts change in rapid succession — the debounce coalesces them into fewer trigger evaluations.

## Avoiding Infinite Loops

The most common pitfall in rule chaining is an infinite loop: Rule A sets a fact, Rule B triggers on that fact and emits an event, Rule A triggers on that event and sets the fact again.

```text
  ┌─────────┐  setFact()  ┌─────────┐  emit()  ┌─────────┐
  │ Rule A  │────────────▶│ Rule B  │─────────▶│ Rule A  │ ← loop!
  └─────────┘             └─────────┘          └─────────┘
```

### Prevention Strategies

**1. Use conditions to break the cycle**

The simplest approach — add a condition that becomes false after the first iteration:

```typescript
// Rule A: only set fact if not already set
engine.registerRule(
  Rule.create('calculate-total')
    .name('Calculate Order Total')
    .when(onEvent('order.items_changed'))
    .if(fact('order:${event.orderId}:totalCalculated').neq(true))
    .then(
      setFact('order:${event.orderId}:total', ref('event.newTotal')),
      setFact('order:${event.orderId}:totalCalculated', true),
    )
    .build()
);
```

**2. Use different trigger types to avoid cycles**

Structure rules so fact-triggered rules don't produce fact changes that trigger more fact-triggered rules:

```text
  Events  ──→  Rules  ──→  Facts  ──→  Rules  ──→  Events (or services)
                                                     (no more fact changes)
```

**3. Use priority to enforce one-directional flow**

Higher-priority rules produce data, lower-priority rules consume it:

```typescript
// High priority: produces facts
engine.registerRule(
  Rule.create('enrich-order')
    .priority(80)
    .when(onEvent('order.created'))
    .then(
      setFact('order:${event.orderId}:region', ref('event.region')),
      setFact('order:${event.orderId}:currency', ref('event.currency')),
    )
    .build()
);

// Low priority: consumes facts, produces events (no more fact changes)
engine.registerRule(
  Rule.create('route-order')
    .priority(20)
    .when(onEvent('order.created'))
    .if(fact('order:${event.orderId}:region').eq('EU'))
    .then(emit('order.routed', {
      orderId: ref('event.orderId'),
      warehouse: 'eu-central',
    }))
    .build()
);
```

## Complete Example: Order Processing Pipeline

This example demonstrates a layered rule pipeline with explicit priority tiers:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, setFact, emit, log, setTimer,
  ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  maxConcurrency: 10,
  debounceMs: 0,
});

// ── Tier 1: Validation (priority 100) ──────────────────────

engine.registerRule(
  Rule.create('validate-order-amount')
    .name('Validate Order Amount')
    .priority(100)
    .tags('validation', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').lte(0))
    .then(
      emit('order.invalid', {
        orderId: ref('event.orderId'),
        reason: 'Total must be positive',
      }),
      log('warn', 'Invalid order ${event.orderId}: non-positive total'),
    )
    .build()
);

// ── Tier 2: Enrichment (priority 70) ───────────────────────

engine.registerRule(
  Rule.create('classify-order')
    .name('Classify Order by Value')
    .priority(70)
    .tags('enrichment', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(setFact('order:${event.orderId}:tier',
      ref('event.total >= 500 ? "premium" : event.total >= 100 ? "standard" : "basic"'),
    ))
    .build()
);

// ── Tier 3: Business Logic (priority 50) ───────────────────

engine.registerRule(
  Rule.create('premium-express')
    .name('Premium Orders Get Express Shipping')
    .priority(50)
    .tags('shipping', 'orders')
    .when(onFact('order:*:tier'))
    .if(fact('${trigger.key}').eq('premium'))
    .then(setFact(
      'order:${trigger.key.split(":")[1]}:shipping',
      'express',
    ))
    .build()
);

// ── Tier 4: Side Effects (priority 10) ─────────────────────

engine.registerRule(
  Rule.create('order-confirmation')
    .name('Send Order Confirmation')
    .priority(10)
    .tags('notifications', 'orders')
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(emit('notification.send', {
      type: 'order-confirmation',
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
    }))
    .build()
);

// ── Tier 5: Monitoring (priority -10) ──────────────────────

engine.registerRule(
  Rule.create('log-order')
    .name('Log All Orders')
    .priority(-10)
    .tags('monitoring', 'orders')
    .when(onEvent('order.created'))
    .then(log('info', 'Order ${event.orderId} processed (total: ${event.total})'))
    .build()
);
```

## Exercise

You have three rules that handle user registration:

1. **Validate email format** — reject invalid emails
2. **Create welcome bonus** — give new users 100 points
3. **Send welcome email** — send confirmation email via external service

The welcome email should include the bonus amount. Design the priority and trigger structure so that:
- Validation runs first and can prevent further processing
- The bonus is set as a fact before the email rule reads it
- No infinite loops are possible

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, onFact, setFact, emit, ref, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Priority 100: Validation — reject bad emails, emit rejection event
engine.registerRule(
  Rule.create('validate-email')
    .name('Validate Email Format')
    .priority(100)
    .when(onEvent('user.registered'))
    .if(event('email').not_matches('^[^@]+@[^@]+\\.[^@]+$'))
    .then(emit('user.registration_rejected', {
      userId: ref('event.userId'),
      reason: 'invalid-email',
    }))
    .build()
);

// Priority 50: Business logic — set welcome bonus as a fact
engine.registerRule(
  Rule.create('welcome-bonus')
    .name('Create Welcome Bonus')
    .priority(50)
    .when(onEvent('user.registered'))
    .if(event('email').matches('^[^@]+@[^@]+\\.[^@]+$'))
    .then(setFact('user:${event.userId}:bonusPoints', 100))
    .build()
);

// Priority 10: Notification — reads the bonus fact, sends email
// Triggers on the fact set by welcome-bonus, not on the original event.
// This guarantees the bonus is set before the email is sent.
engine.registerRule(
  Rule.create('welcome-email')
    .name('Send Welcome Email')
    .priority(10)
    .when(onFact('user:*:bonusPoints'))
    .then(callService('emailService', 'send', {
      to: ref('trigger.key').replace(':bonusPoints', ''),
      template: 'welcome',
      bonusPoints: ref('trigger.value'),
    }))
    .build()
);
```

**Why this works**:
- Validation (100) runs first on `user.registered` — if email is invalid, the rejection event fires but doesn't trigger any of our other rules
- Welcome bonus (50) runs second on `user.registered` — sets a fact
- Welcome email (10) triggers on the **fact change**, not the event — it's guaranteed the bonus exists
- No infinite loops: events → facts → service call (terminal, no more triggers)

</details>

## Summary

- **Priority** is a finite number; higher values mean earlier evaluation among rules sharing the same trigger
- Default priority is `0`; use consistent ranges (100 for validation, 50 for business logic, 10 for notifications)
- Rules with equal priority have no guaranteed relative order
- **Rule chaining** occurs when actions emit events, set facts, or fire timers that trigger other rules
- `maxConcurrency` limits parallel rule evaluations (default: 10) to prevent resource exhaustion
- `debounceMs` coalesces rapid fact changes before triggering dependent rules
- Prevent infinite loops by using conditions, separating trigger types, or enforcing one-directional data flow through priority tiers

---

Next: [Rule Versioning](./03-versioning.md)
