# Sequence and Absence

Sequence and absence are the two **order-sensitive** CEP patterns. A sequence detects that events arrived in a specific order within a time window. An absence detects that an expected event did *not* arrive after a triggering event. Together they cover the most common temporal business logic: multi-step workflows and timeout detection.

## What You'll Learn

- How to define sequence patterns with `sequence()`
- How strict mode affects intermediate events
- How to use `groupBy` and `as` (named events) in sequences
- How to define absence patterns with `absence()`
- The full lifecycle of sequence and absence instances
- Complete examples: payment flow (sequence) and timeout detection (absence)

## Sequence Patterns

A sequence pattern matches when events arrive **in a specific order** within a time window. The simplest example: "order created, then payment received, within 5 minutes."

### Basic Sequence

```typescript
import {
  Rule, emit, ref, sequence,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('order-payment-flow')
    .name('Order Payment Flow')
    .when(sequence()
      .event('order.created')
      .event('payment.received')
      .within('5m')
    )
    .then(emit('order.confirmed', {
      orderId: ref('trigger.events.0.orderId'),
    }))
    .build()
);
```

When `order.created` fires, the matcher starts tracking. If `payment.received` fires within 5 minutes, the sequence completes and the rule fires. If 5 minutes pass without `payment.received`, the instance expires silently.

### GroupBy

Without `groupBy`, the matcher treats all events as one global stream. In practice, you almost always want to group by a correlation field — so that order A's payment doesn't accidentally complete order B's sequence:

```typescript
sequence()
  .event('order.created')
  .event('payment.received')
  .within('5m')
  .groupBy('orderId')
```

Each unique `orderId` value gets its own independent sequence instance. Order `ORD-1` and `ORD-2` are tracked separately.

### Strict Mode

By default (`strict: false`), intermediate events that don't match the next expected step are **ignored**. The matcher waits patiently for the right event:

```text
  strict: false (default)
  ─────────────────────────────────────────────────
  order.created ──→ [inventory.checked] ──→ payment.received  ✓ MATCH
                     (ignored — not next in sequence)

  strict: true
  ─────────────────────────────────────────────────
  order.created ──→ [inventory.checked] ──→ payment.received  ✗ CANCELLED
                     (unrelated event cancels the sequence)
```

Use strict mode when intermediate events signal that the expected flow has been disrupted:

```typescript
sequence()
  .event('order.created')
  .event('payment.received')
  .within('5m')
  .groupBy('orderId')
  .strict(true)
```

### Event Filters

Each event in the sequence can specify a filter to match only events with specific data:

```typescript
sequence()
  .event('order.created', { type: 'premium' })
  .event('payment.received', { method: 'credit_card' })
  .within('10m')
  .groupBy('orderId')
```

This sequence only starts on premium orders and only completes with credit card payments.

### Named Events (as)

Use the `as` parameter to give matched events names, making them easier to reference in actions:

```typescript
sequence()
  .event('order.created', undefined, 'order')
  .event('payment.received', undefined, 'payment')
  .within('5m')
  .groupBy('orderId')
```

The three arguments to `.event()` are: `topic`, `filter`, `as`.

### Multi-Step Sequences

Sequences can have any number of steps:

```typescript
engine.registerRule(
  Rule.create('full-order-lifecycle')
    .name('Complete Order Lifecycle')
    .when(sequence()
      .event('order.created')
      .event('payment.authorized')
      .event('payment.captured')
      .event('shipment.dispatched')
      .within('48h')
      .groupBy('orderId')
    )
    .then(emit('order.fulfilled'))
    .build()
);
```

Each step must match in order. The instance advances one step at a time, and the full time window applies from the first event to the last.

### Sequence Interface

The raw `SequencePattern` type for reference:

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];     // Ordered list of expected events
  within: string | number;    // Time window: "5m", "1h", or milliseconds
  groupBy?: string;           // Group by field (e.g., "orderId")
  strict?: boolean;           // Reject intermediate events (default: false)
}

interface EventMatcher {
  topic: string;                     // Topic pattern: "order.*", "payment.received"
  filter?: Record<string, unknown>;  // Data filter: { status: 'failed' }
  as?: string;                       // Alias for referencing in actions
}
```

## Absence Patterns

An absence pattern fires when an expected event does **not** arrive within a time window after a triggering event. It's the inverse of a sequence — you're detecting what *didn't* happen.

### Basic Absence

```typescript
import {
  Rule, emit, setFact, absence,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('payment-timeout')
    .name('Payment Timeout')
    .when(absence()
      .after('order.created')
      .expected('payment.received')
      .within('15m')
      .groupBy('orderId')
    )
    .then(setFact('order:${trigger.after.orderId}:status', 'cancelled'))
    .also(emit('order.cancelled', { reason: 'payment_timeout' }))
    .build()
);
```

When `order.created` fires, the matcher starts a 15-minute timer. If `payment.received` arrives with the same `orderId` before the timer expires, the instance is cancelled (success — the customer paid). If the timer expires without `payment.received`, the absence pattern matches and the rule fires.

### Lifecycle

```text
  order.created (orderId: "ORD-1")
       │
       ▼
  AbsenceMatcher creates instance
  State: WAITING
  Timer: 15 minutes
       │
       ├──── payment.received (orderId: "ORD-1") arrives within 15m
       │     └── Instance CANCELLED (expected event arrived, no action)
       │
       └──── 15 minutes pass, no payment.received for "ORD-1"
             └── Instance COMPLETED (absence detected)
                 └── Rule fires → set fact "cancelled", emit event
```

### Filters on Absence

Both `after` and `expected` support filters:

```typescript
absence()
  .after('order.created', { priority: 'high' })
  .expected('payment.received')
  .within('5m')
  .groupBy('orderId')
```

This only tracks high-priority orders. Regular orders don't start the absence timer.

### Absence Interface

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;       // Triggering event
  expected: EventMatcher;    // Expected event that should follow
  within: string | number;   // Time window
  groupBy?: string;          // Group by field
}
```

## Time Window Formats

Both sequence and absence accept time windows as strings or milliseconds:

| Format | Meaning | Example |
|--------|---------|---------|
| `"30s"` | 30 seconds | Short timeout |
| `"5m"` | 5 minutes | Payment timeout |
| `"1h"` | 1 hour | SLA monitoring |
| `"2d"` | 2 days | Shipping deadline |
| `"1w"` | 1 week | Long-term tracking |
| `30000` | 30,000 ms | Exact milliseconds |

## Complete Working Example

An e-commerce payment pipeline with both sequence and absence patterns:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  sequence, absence,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'payment-pipeline' });

  // === Track the happy path: order → payment → confirmation ===
  engine.registerRule(
    Rule.create('order-confirmed')
      .name('Order Confirmed')
      .priority(100)
      .tags('orders', 'payments')
      .when(sequence()
        .event('order.created')
        .event('payment.received')
        .within('15m')
        .groupBy('orderId')
      )
      .then(setFact('order:${trigger.events.0.orderId}:status', 'confirmed'))
      .also(emit('order.confirmed', {
        orderId: ref('trigger.events.0.orderId'),
        amount: ref('trigger.events.1.amount'),
      }))
      .also(log('info', 'Order confirmed: ${trigger.events.0.orderId}'))
      .build()
  );

  // === Detect payment timeout ===
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout')
      .priority(200)
      .tags('orders', 'timeouts')
      .when(absence()
        .after('order.created')
        .expected('payment.received')
        .within('15m')
        .groupBy('orderId')
      )
      .then(setFact('order:${trigger.after.orderId}:status', 'cancelled'))
      .also(emit('order.cancelled', {
        orderId: ref('trigger.after.orderId'),
        reason: 'payment_timeout',
      }))
      .also(log('warn', 'Payment timeout: ${trigger.after.orderId}'))
      .build()
  );

  // === React to confirmed orders ===
  engine.registerRule(
    Rule.create('notify-confirmation')
      .name('Send Confirmation')
      .when(onEvent('order.confirmed'))
      .then(log('info', 'Sending confirmation for ${event.orderId}'))
      .build()
  );

  // === React to cancelled orders ===
  engine.registerRule(
    Rule.create('notify-cancellation')
      .name('Send Cancellation Notice')
      .when(onEvent('order.cancelled'))
      .then(log('warn', 'Sending cancellation for ${event.orderId}'))
      .build()
  );

  // --- Test: Happy path ---
  await engine.emit('order.created', {
    orderId: 'ORD-1',
    customerId: 'C-1',
    total: 299.99,
  });

  // Payment arrives within 15 minutes
  await engine.emit('payment.received', {
    orderId: 'ORD-1',
    amount: 299.99,
    method: 'credit_card',
  });

  console.log('ORD-1 status:', engine.getFact('order:ORD-1:status'));
  // "confirmed"

  // --- Test: Timeout path ---
  await engine.emit('order.created', {
    orderId: 'ORD-2',
    customerId: 'C-2',
    total: 149.99,
  });

  // No payment for ORD-2... after 15 minutes:
  // Engine will automatically fire the absence pattern
  // ORD-2 status → "cancelled"

  await engine.stop();
}

main();
```

### What Happens Step by Step

1. `order.created (ORD-1)` → sequence matcher starts tracking, absence matcher starts 15m timer
2. `payment.received (ORD-1)` → sequence completes (fires `order.confirmed`), absence cancels (payment arrived)
3. `order.created (ORD-2)` → sequence starts, absence starts 15m timer
4. 15 minutes pass → absence fires for ORD-2 (no payment), sequence expires (incomplete)

The two CEP rules work together naturally: the sequence catches the happy path and the absence catches the timeout — both grouped by `orderId` so they don't interfere with each other.

## Exercise

Build a user onboarding flow with both patterns:

1. **Registration Sequence**: Detect when a user completes the full onboarding: `user.registered` → `email.verified` → `profile.completed`, all within 24 hours, grouped by `userId`. When the sequence completes, set fact `user:${userId}:onboarded` to `true`.

2. **Verification Timeout**: If `email.verified` doesn't follow `user.registered` within 1 hour, emit `reminder.send_verification` with the user's email.

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, emit, setFact, ref,
  sequence, absence,
} from '@hamicek/noex-rules/dsl';

// 1. Full onboarding sequence
const onboardingComplete = Rule.create('onboarding-complete')
  .name('Onboarding Complete')
  .priority(100)
  .tags('onboarding')
  .when(sequence()
    .event('user.registered')
    .event('email.verified')
    .event('profile.completed')
    .within('24h')
    .groupBy('userId')
  )
  .then(setFact('user:${trigger.events.0.userId}:onboarded', true))
  .also(emit('user.onboarded', {
    userId: ref('trigger.events.0.userId'),
  }))
  .build();

// 2. Email verification timeout
const verificationReminder = Rule.create('verification-reminder')
  .name('Send Verification Reminder')
  .priority(200)
  .tags('onboarding', 'reminders')
  .when(absence()
    .after('user.registered')
    .expected('email.verified')
    .within('1h')
    .groupBy('userId')
  )
  .then(emit('reminder.send_verification', {
    userId: ref('trigger.after.userId'),
    email: ref('trigger.after.email'),
  }))
  .build();

engine.registerRule(onboardingComplete);
engine.registerRule(verificationReminder);
```

The sequence tracks the full three-step flow. The absence independently watches for the first step's timeout. Both are grouped by `userId`, so each user gets their own tracking instance.

</details>

## Summary

- **Sequence** detects events arriving in a specific order within a time window
- Use `groupBy` to isolate instances per correlation key (e.g., `orderId`, `userId`)
- `strict: true` cancels the sequence if unrelated events arrive between steps
- Event filters narrow which events match each step; `as` names matched events for reference
- **Absence** detects that an expected event did not arrive after a trigger within a time window
- Absence completes (fires) on timeout, cancels when the expected event arrives
- Time windows accept human-readable strings (`"5m"`, `"1h"`, `"2d"`) or milliseconds
- Sequence and absence work together naturally for happy path + timeout patterns

---

Next: [Count and Aggregate](./03-count-and-aggregate.md)
