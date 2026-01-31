# Timers and Scheduling

Not everything happens instantly. Payments have deadlines. Reminders need delays. Subscriptions expire after a period. Timers let you schedule future work: set a timer, and when it expires, it emits an event that can trigger rules. Combined with `cancel_timer`, you can build timeout flows, retry patterns, and scheduled maintenance — all driven by rules.

## What You'll Learn

- How to create timers with `set_timer` and cancel them with `cancel_timer`
- The duration syntax for specifying time periods
- How `onExpire` links timers to events
- How timer-triggered rules work
- How repeating timers work with `repeat`
- A complete payment timeout flow with three cooperating rules

## Timer Lifecycle

```text
  set_timer action
      │
      ▼
  ┌──────────────────────────────────┐
  │  Timer Active                    │
  │                                  │
  │  name: "payment-timeout:ORD-1"   │
  │  expiresAt: now + duration       │
  │  onExpire: { topic, data }       │
  └──────────┬───────────┬──────────┘
             │           │
     timer expires    cancel_timer
             │           │
             ▼           ▼
  ┌──────────────┐  ┌──────────────┐
  │ Emit onExpire│  │ Timer Removed│
  │ event        │  │ (no event)   │
  └──────┬───────┘  └──────────────┘
         │
         ▼
  Other rules trigger
  on the emitted event
```

A timer is a named countdown. When it expires, it emits the configured event. If cancelled before expiration, nothing happens.

## Duration Syntax

Durations can be specified as strings with a unit suffix or as plain milliseconds:

| Format | Unit | Example | Milliseconds |
|--------|------|---------|-------------|
| `ms` | Milliseconds | `500ms` | 500 |
| `s` | Seconds | `30s` | 30,000 |
| `m` | Minutes | `15m` | 900,000 |
| `h` | Hours | `2h` | 7,200,000 |
| `d` | Days | `7d` | 604,800,000 |
| `w` | Weeks | `1w` | 604,800,000 |
| `y` | Years | `1y` | 31,536,000,000 |

```typescript
// All valid duration values
'500ms'   // half a second
'30s'     // thirty seconds
'15m'     // fifteen minutes
'2h'      // two hours
'7d'      // seven days
'1w'      // one week
'1y'      // one year
900000    // plain milliseconds (15 minutes)
```

The string format is recommended for readability.

## set_timer

Creates a timer that emits an event when it expires.

```typescript
{
  type: 'set_timer',
  timer: {
    name: 'payment-timeout:${event.orderId}',
    duration: '15m',
    onExpire: {
      topic: 'order.payment_timeout',
      data: {
        orderId: { ref: 'event.orderId' },
        customerId: { ref: 'event.customerId' },
      },
    },
  },
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique timer name. Supports `${expression}`. Used for cancellation. |
| `duration` | `string \| number` | Time until expiration. String (`'15m'`) or milliseconds. |
| `onExpire.topic` | `string` | Event topic emitted on expiration. |
| `onExpire.data` | `Record<string, unknown>` | Event data. Values support `{ ref: 'path' }`. |
| `repeat` | `object` | Optional. Repeating timer configuration. |
| `repeat.interval` | `string \| number` | Time between repetitions. |
| `repeat.maxCount` | `number` | Maximum repetitions before auto-cancel. |

### Timer Names

Timer names should be unique and descriptive. Include identifying data to make cancellation precise:

```typescript
// Good: includes the order ID — can cancel this specific timer
name: 'payment-timeout:${event.orderId}'

// Bad: no identifier — can't cancel for a specific order
name: 'payment-timeout'
```

### onExpire Event

When the timer expires, the engine emits the configured event. References in `onExpire.data` are resolved at timer creation time, not at expiration time:

```typescript
// At creation: event.orderId = 'ORD-001'
timer: {
  name: 'reminder:ORD-001',
  duration: '24h',
  onExpire: {
    topic: 'order.reminder',
    data: {
      orderId: { ref: 'event.orderId' },  // Resolved to 'ORD-001' now
    },
  },
}
// 24 hours later: emits { topic: 'order.reminder', data: { orderId: 'ORD-001' } }
```

## cancel_timer

Cancels a running timer by name. If the timer has already expired or doesn't exist, this is a no-op.

```typescript
{
  type: 'cancel_timer',
  name: 'payment-timeout:${event.orderId}',
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Timer name to cancel. Supports `${expression}`. |

### Cancel Patterns

```typescript
// Cancel a specific order's payment timeout
{ type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' }

// Cancel a customer's inactivity timer
{ type: 'cancel_timer', name: 'inactivity:${event.customerId}' }
```

## Timer-Triggered Rules

Rules can trigger on timer expiration events just like any other event. Use the topic configured in `onExpire`:

```typescript
engine.registerRule({
  id: 'handle-payment-timeout',
  name: 'Handle Payment Timeout',
  priority: 100,
  enabled: true,
  tags: ['payments'],
  trigger: { type: 'event', topic: 'order.payment_timeout' },
  conditions: [
    // Only act if the order is still pending
    {
      source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
      operator: 'eq',
      value: 'pending_payment',
    },
  ],
  actions: [
    {
      type: 'set_fact',
      key: 'order:${event.orderId}:status',
      value: 'cancelled',
    },
    {
      type: 'emit_event',
      topic: 'order.cancelled',
      data: {
        orderId: { ref: 'event.orderId' },
        reason: 'payment_timeout',
      },
    },
  ],
});
```

## Repeating Timers

Timers can repeat at a fixed interval until cancelled or until a maximum count is reached:

```typescript
{
  type: 'set_timer',
  timer: {
    name: 'heartbeat:${event.serviceId}',
    duration: '1m',
    onExpire: {
      topic: 'service.heartbeat',
      data: {
        serviceId: { ref: 'event.serviceId' },
      },
    },
    repeat: {
      interval: '1m',
      maxCount: 60,  // Stop after 60 repetitions (1 hour)
    },
  },
}
```

### Repeat Behavior

1. Timer fires after `duration` (initial delay)
2. After each expiration, timer reschedules with `repeat.interval`
3. If `maxCount` is set, timer auto-cancels after that many fires
4. If `maxCount` is omitted, timer repeats indefinitely until cancelled

### Escalation Pattern

Combine repeating timers with conditions to build escalation:

```typescript
// Repeat a reminder every 5 minutes, up to 3 times
timer: {
  name: 'reminder:${event.ticketId}',
  duration: '5m',
  onExpire: {
    topic: 'ticket.reminder',
    data: { ticketId: { ref: 'event.ticketId' } },
  },
  repeat: {
    interval: '5m',
    maxCount: 3,
  },
}
```

## Complete Working Example

A payment timeout flow with three rules: one starts the timer when an order is placed, one cancels the timer when payment arrives, and one handles the timeout.

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'payment-flow' });

  // Rule 1: When order is placed, start a 15-minute payment timer
  engine.registerRule({
    id: 'start-payment-timer',
    name: 'Start Payment Timer',
    priority: 100,
    enabled: true,
    tags: ['payments', 'timers'],
    trigger: { type: 'event', topic: 'order.placed' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'pending_payment',
      },
      {
        type: 'set_timer',
        timer: {
          name: 'payment-timeout:${event.orderId}',
          duration: '15m',
          onExpire: {
            topic: 'order.payment_timeout',
            data: {
              orderId: { ref: 'event.orderId' },
              customerId: { ref: 'event.customerId' },
            },
          },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Payment timer started for order ${event.orderId} (15 min)',
      },
    ],
  });

  // Rule 2: When payment is received, cancel the timer
  engine.registerRule({
    id: 'payment-received',
    name: 'Payment Received',
    priority: 200,
    enabled: true,
    tags: ['payments'],
    trigger: { type: 'event', topic: 'payment.completed' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
        operator: 'eq',
        value: 'pending_payment',
      },
    ],
    actions: [
      {
        type: 'cancel_timer',
        name: 'payment-timeout:${event.orderId}',
      },
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'paid',
      },
      {
        type: 'emit_event',
        topic: 'order.paid',
        data: {
          orderId: { ref: 'event.orderId' },
          amount: { ref: 'event.amount' },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Payment received for ${event.orderId} — timer cancelled',
      },
    ],
  });

  // Rule 3: When timer expires, cancel the order
  engine.registerRule({
    id: 'handle-timeout',
    name: 'Handle Payment Timeout',
    priority: 100,
    enabled: true,
    tags: ['payments', 'timers'],
    trigger: { type: 'event', topic: 'order.payment_timeout' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
        operator: 'eq',
        value: 'pending_payment',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'cancelled',
      },
      {
        type: 'emit_event',
        topic: 'order.cancelled',
        data: {
          orderId: { ref: 'event.orderId' },
          reason: 'payment_timeout',
        },
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Order ${event.orderId} cancelled — payment timeout',
      },
    ],
  });

  // Subscribe to observe the flow
  engine.subscribe('order.*', (event) => {
    console.log(`[${event.topic}]`, event.data);
  });

  // --- Scenario A: Payment arrives before timeout ---
  console.log('=== Scenario A: Payment on time ===');
  await engine.emit('order.placed', {
    orderId: 'ORD-001',
    customerId: 'C-100',
  });
  console.log('Status:', engine.getFact('order:ORD-001:status'));
  // "pending_payment"

  // Simulate payment arriving
  await engine.emit('payment.completed', {
    orderId: 'ORD-001',
    amount: 99.99,
  });
  console.log('Status:', engine.getFact('order:ORD-001:status'));
  // "paid" — timer was cancelled, no timeout will occur

  // --- Scenario B: Payment doesn't arrive (timeout) ---
  console.log('\n=== Scenario B: Payment timeout ===');
  await engine.emit('order.placed', {
    orderId: 'ORD-002',
    customerId: 'C-200',
  });
  console.log('Status:', engine.getFact('order:ORD-002:status'));
  // "pending_payment"

  // In a real app, we'd wait 15 minutes. The timer expiration
  // would emit 'order.payment_timeout', triggering Rule 3,
  // which sets status to 'cancelled'.

  await engine.stop();
}

main();
```

### Flow Diagram

```text
  order.placed
      │
      ├──── set_fact: status = "pending_payment"
      ├──── set_timer: "payment-timeout:ORD-001" (15m)
      │
      ▼
  ┌───────────────────────────────────────┐
  │         Timer counting down           │
  │                                       │
  │  payment.completed arrives?           │
  │  ┌─────┐           ┌──────┐          │
  │  │ YES │           │  NO  │          │
  │  └──┬──┘           └──┬───┘          │
  │     │                  │              │
  │  cancel_timer       timer expires     │
  │  status = "paid"    emit timeout      │
  │  emit order.paid    status = "cancel" │
  │                     emit order.cancel │
  └───────────────────────────────────────┘
```

## Exercise

Build a user onboarding reminder system:

1. **Start Onboarding**: When `user.registered` fires, set fact `user:${userId}:onboardingStep` to `1`. Set a timer named `onboarding-reminder:${userId}` that fires after `24h` and emits `onboarding.reminder` with `userId` and `step: 1`. The timer should repeat every `24h` with `maxCount: 3`.
2. **Handle Reminder**: When `onboarding.reminder` fires, check that the user's onboarding step fact is less than `4` (i.e., they haven't finished). If so, emit `notification.send` with the userId and a message "Complete your onboarding!".
3. **Complete Onboarding**: When `user.onboarding_complete` fires, cancel the timer `onboarding-reminder:${userId}` and set the onboarding step to `4`.

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'onboarding' });

  // Rule 1: Start onboarding with reminder timer
  engine.registerRule({
    id: 'start-onboarding',
    name: 'Start Onboarding',
    priority: 100,
    enabled: true,
    tags: ['onboarding'],
    trigger: { type: 'event', topic: 'user.registered' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'user:${event.userId}:onboardingStep',
        value: 1,
      },
      {
        type: 'set_timer',
        timer: {
          name: 'onboarding-reminder:${event.userId}',
          duration: '24h',
          onExpire: {
            topic: 'onboarding.reminder',
            data: {
              userId: { ref: 'event.userId' },
              step: 1,
            },
          },
          repeat: {
            interval: '24h',
            maxCount: 3,
          },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Onboarding started for user ${event.userId}',
      },
    ],
  });

  // Rule 2: Handle reminder
  engine.registerRule({
    id: 'handle-reminder',
    name: 'Handle Onboarding Reminder',
    priority: 100,
    enabled: true,
    tags: ['onboarding', 'notifications'],
    trigger: { type: 'event', topic: 'onboarding.reminder' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'user:${event.userId}:onboardingStep' },
        operator: 'lt',
        value: 4,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.send',
        data: {
          userId: { ref: 'event.userId' },
          message: 'Complete your onboarding!',
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Reminder sent to user ${event.userId}',
      },
    ],
  });

  // Rule 3: Complete onboarding — cancel timer
  engine.registerRule({
    id: 'complete-onboarding',
    name: 'Complete Onboarding',
    priority: 200,
    enabled: true,
    tags: ['onboarding'],
    trigger: { type: 'event', topic: 'user.onboarding_complete' },
    conditions: [],
    actions: [
      {
        type: 'cancel_timer',
        name: 'onboarding-reminder:${event.userId}',
      },
      {
        type: 'set_fact',
        key: 'user:${event.userId}:onboardingStep',
        value: 4,
      },
      {
        type: 'log',
        level: 'info',
        message: 'Onboarding completed for user ${event.userId} — reminders cancelled',
      },
    ],
  });

  // Test
  engine.subscribe('notification.*', (event) => {
    console.log('NOTIFICATION:', event.data);
  });

  await engine.emit('user.registered', { userId: 'U-100' });
  console.log('Step:', engine.getFact('user:U-100:onboardingStep'));
  // 1

  // User completes onboarding before any reminder fires
  await engine.emit('user.onboarding_complete', { userId: 'U-100' });
  console.log('Step:', engine.getFact('user:U-100:onboardingStep'));
  // 4 — timer cancelled, no reminders will fire

  await engine.stop();
}

main();
```

Rule 1 sets the initial step and schedules a repeating reminder. Rule 2 sends notifications until onboarding is done. Rule 3 cancels the timer and marks completion. If the user completes onboarding before any reminder fires, the timer is cancelled and no notifications are sent.

</details>

## Summary

- `set_timer` creates a named countdown that emits an event on expiration
- `cancel_timer` stops a timer by name before it fires — a no-op if already expired
- Duration syntax: `ms`, `s`, `m`, `h`, `d`, `w`, `y` or plain milliseconds
- `onExpire` configures the event topic and data emitted when the timer fires
- References in `onExpire.data` are resolved at creation time, not at expiration time
- Timer names support `${expression}` interpolation — include identifiers for precise cancellation
- Repeating timers use `repeat: { interval, maxCount }` for periodic work
- Timer-triggered rules are just event-triggered rules listening on the `onExpire.topic`
- Common patterns: payment timeouts, onboarding reminders, heartbeat checks, escalation flows

---

Next: [Calling External Services](./03-external-services.md)
