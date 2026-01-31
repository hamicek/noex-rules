# Durable Timers

A rule that schedules a payment timeout for 30 minutes is useless if the timer disappears when the process restarts. By default, noex-rules uses `setTimeout` for timers — fast and simple, but volatile. When you need timers that survive crashes and restarts, enable **durable mode** through `TimerPersistenceConfig`.

## What You'll Learn

- The difference between fallback (volatile) and durable timer modes
- How to configure `TimerPersistenceConfig`
- How timer metadata is persisted and restored
- Recurring timers with fire count tracking in durable mode
- When to use durable timers and when volatile timers are sufficient

## Two Timer Modes

The `TimerManager` operates in one of two modes depending on whether a storage adapter is provided:

```text
  ┌─────────────────────────────────────────────────────────┐
  │                     TimerManager                         │
  │                                                         │
  │  ┌───────────────────┐    ┌───────────────────────────┐ │
  │  │   Fallback Mode   │    │       Durable Mode        │ │
  │  │                   │    │                           │ │
  │  │  setTimeout()     │    │  TimerService (noex)      │ │
  │  │  In-memory only   │    │  StorageAdapter backed    │ │
  │  │  Lost on restart  │    │  Survives restarts        │ │
  │  │                   │    │  GenServer receiver       │ │
  │  │  No adapter       │    │  Requires adapter         │ │
  │  └───────────────────┘    └───────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘
```

| Aspect | Fallback Mode | Durable Mode |
|--------|:---:|:---:|
| Storage | In-memory (`setTimeout`) | `StorageAdapter` via `TimerService` |
| Survives restart | No | Yes |
| Recurring timer tracking | Limited | Full (fire count, maxCount) |
| Configuration | No adapter needed | `timerPersistence.adapter` required |
| Use case | Development, short-lived timers | Production, critical timeouts |

## TimerPersistenceConfig

Enable durable timers by passing `timerPersistence` to `RuleEngine.start()`:

```typescript
interface TimerPersistenceConfig {
  /** Storage adapter for storing timer metadata */
  adapter: StorageAdapter;

  /** Interval for checking expired timers in ms (default: from TimerService) */
  checkIntervalMs?: number;
}
```

### Setup

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/engine.db' });

const engine = await RuleEngine.start({
  // Rule persistence (separate concern)
  persistence: { adapter },

  // Timer persistence
  timerPersistence: {
    adapter,
    checkIntervalMs: 1000,  // Check for expired timers every second
  },
});
```

You can share the same `StorageAdapter` instance for both rule persistence and timer persistence — they use different storage keys internally (`'rules'` vs `'timer-manager:metadata'`).

## How Durable Mode Works

When durable mode is active, the `TimerManager` delegates scheduling to the `TimerService` from `@hamicek/noex` and persists timer metadata for recovery:

```text
  setTimer('payment-timeout', '30m')
       │
       ▼
  ┌──────────────────┐
  │ TimerManager      │
  │ (durable mode)   │
  └────────┬─────────┘
           │
     ┌─────┼──────────────────────┐
     │     │                      │
     ▼     ▼                      ▼
  ┌──────┐ ┌──────────────┐  ┌──────────────────┐
  │Timer │ │ TimerService  │  │ persistMetadata() │
  │ Map  │ │  .schedule()  │  │                  │
  └──────┘ └──────┬───────┘  └────────┬─────────┘
                  │                    │
                  ▼                    ▼
           ┌────────────┐      ┌──────────────┐
           │ Durable    │      │ StorageAdapter│
           │ scheduling │      │ key: timer-   │
           │ (survives  │      │ manager:      │
           │  restart)  │      │ metadata      │
           └──────┬─────┘      └──────────────┘
                  │
                  ▼ (on expiry)
           ┌────────────┐
           │ GenServer   │
           │ receiver    │
           │ handleCast  │
           └──────┬─────┘
                  │
                  ▼
           onExpireCallback(timer)
```

### Timer Metadata

For each active timer, the manager persists metadata needed for recovery:

```typescript
interface TimerMetadata {
  name: string;            // Timer name (lookup key)
  durableTimerId: string;  // ID from TimerService
  timerId: string;         // noex-rules timer ID
  onExpire: {              // What to emit on expiry
    topic: string;
    data: Record<string, unknown>;
  };
  fireCount: number;       // How many times this timer has fired
  correlationId?: string;  // Optional correlation
  maxCount?: number;       // Max repetitions (for recurring)
  repeatIntervalMs?: number; // Repeat interval (for recurring)
}
```

### Restore Process

On startup with a storage adapter, the timer manager:

1. Starts a GenServer receiver for timer expiry messages
2. Starts the `TimerService` with the adapter
3. Loads persisted metadata from key `'timer-manager:metadata'`
4. For each persisted timer entry:
   - Looks up the durable timer in `TimerService`
   - Cancels the old timer (it targeted the previous receiver)
   - Calculates remaining time: `max(0, fireAt - now)`
   - Reschedules with the current receiver
   - Restores the in-memory `Timer` and `TimerMetadata`
5. Persists updated metadata (new durable timer IDs)

This means timers pick up where they left off. A 30-minute timer that had 10 minutes remaining before a crash will fire after those remaining 10 minutes on restart.

## Recurring Timers in Durable Mode

Durable mode provides full tracking for recurring timers:

```typescript
import { Rule } from '@hamicek/noex-rules';
import { onEvent, setTimer, ref } from '@hamicek/noex-rules/dsl';

// Schedule a recurring health check every 5 minutes, max 12 times (1 hour)
engine.registerRule(
  Rule.create('schedule-health-check')
    .name('Schedule Periodic Health Check')
    .when(onEvent('monitoring.started'))
    .then(setTimer({
      name: 'health-check:${event.serviceId}',
      duration: '5m',
      repeat: {
        interval: '5m',
        maxCount: 12,
      },
      onExpire: {
        topic: 'health.check_due',
        data: { serviceId: ref('event.serviceId') },
      },
    }))
    .build()
);
```

In durable mode, the `fireCount` is tracked in persisted metadata. If the process restarts after 6 fires, the timer resumes and will fire 6 more times before reaching `maxCount: 12`.

In fallback mode, `maxCount` tracking is not fully supported — the fire count resets on restart.

## Complete Example: Payment Timeout with Durable Timers

A payment flow where orders must be paid within 15 minutes, with a 10-minute reminder:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, onTimer, emit, setFact, setTimer, cancelTimer,
  log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/payments.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 1000 },
});

// Rule 1: Start payment timer when order is created
engine.registerRule(
  Rule.create('start-payment-timer')
    .name('Start Payment Timer')
    .tags('payments', 'timers')
    .when(onEvent('order.created'))
    .then(setTimer({
      name: 'payment-timeout:${event.orderId}',
      duration: '15m',
      onExpire: {
        topic: 'payment.timeout',
        data: { orderId: ref('event.orderId') },
      },
    }))
    .also(setTimer({
      name: 'payment-reminder:${event.orderId}',
      duration: '10m',
      onExpire: {
        topic: 'payment.reminder',
        data: {
          orderId: ref('event.orderId'),
          customerId: ref('event.customerId'),
        },
      },
    }))
    .also(setFact('order:${event.orderId}:status', 'awaiting_payment'))
    .also(log('Payment timers set for order ${event.orderId}'))
    .build()
);

// Rule 2: Cancel timers when payment is received
engine.registerRule(
  Rule.create('payment-received')
    .name('Payment Received - Cancel Timers')
    .tags('payments', 'timers')
    .priority(100)
    .when(onEvent('payment.completed'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .also(cancelTimer('payment-reminder:${event.orderId}'))
    .also(setFact('order:${event.orderId}:status', 'paid'))
    .also(log('Payment received for order ${event.orderId}, timers cancelled'))
    .build()
);

// Rule 3: Send reminder when 10-minute timer fires
engine.registerRule(
  Rule.create('payment-reminder')
    .name('Send Payment Reminder')
    .tags('payments', 'notifications')
    .when(onEvent('payment.reminder'))
    .then(emit('notification.send', {
      type: 'payment-reminder',
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
      message: 'Your order is awaiting payment. 5 minutes remaining.',
    }))
    .build()
);

// Rule 4: Cancel order when payment times out
engine.registerRule(
  Rule.create('payment-timeout')
    .name('Cancel Order on Payment Timeout')
    .tags('payments', 'orders')
    .when(onEvent('payment.timeout'))
    .if(fact('order:${event.orderId}:status').eq('awaiting_payment'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .also(emit('order.cancelled', {
      orderId: ref('event.orderId'),
      reason: 'payment_timeout',
    }))
    .also(log('Order ${event.orderId} cancelled due to payment timeout'))
    .build()
);

// --- Usage ---

await engine.emit('order.created', {
  orderId: 'ord-100',
  customerId: 'cust-42',
  total: 99.99,
});

// If the process crashes and restarts within 15 minutes,
// the payment-timeout and payment-reminder timers are restored
// with their remaining durations. No orders slip through.

await engine.stop();
```

Without `timerPersistence`, a process restart would silently drop both timers. The order would stay in `awaiting_payment` forever — no reminder, no cancellation.

## When to Use Durable Timers

| Scenario | Durable? | Why |
|----------|:---:|-----|
| Payment timeouts | Yes | Missing a timeout means lost revenue or stuck orders |
| SLA breach escalation | Yes | SLA violations must fire even after deployment |
| Session expiry | Maybe | Often acceptable to reset on restart |
| Rate limit cooldown | No | Short-lived, resets are fine |
| Development/testing | No | Adds complexity without benefit |
| Debounce timers | No | Sub-second timers, not worth persisting |

A good heuristic: if a missed timer means **data inconsistency or business impact**, use durable mode.

## Exercise

Build a subscription renewal system with durable timers:

1. Start the engine with both rule persistence and timer persistence
2. Create a rule that sets a 30-day renewal timer when `subscription.activated` is received
3. Create a rule that sets a 7-day reminder timer from the same event
4. Create a rule that processes the reminder (emits a `notification.renewal_reminder` event)
5. Create a rule that processes the renewal timeout (emits `subscription.expired` and updates the fact)
6. Test that stopping and restarting the engine preserves the timers

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, setTimer, cancelTimer,
  log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/subscriptions.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 5000 },
});

// Rule 1: Set renewal and reminder timers
engine.registerRule(
  Rule.create('subscription-timers')
    .name('Set Subscription Timers')
    .tags('subscriptions', 'timers')
    .when(onEvent('subscription.activated'))
    .then(setTimer({
      name: 'renewal:${event.subscriptionId}',
      duration: '30d',
      onExpire: {
        topic: 'subscription.renewal_due',
        data: {
          subscriptionId: ref('event.subscriptionId'),
          customerId: ref('event.customerId'),
        },
      },
    }))
    .also(setTimer({
      name: 'renewal-reminder:${event.subscriptionId}',
      duration: '23d',
      onExpire: {
        topic: 'subscription.reminder_due',
        data: {
          subscriptionId: ref('event.subscriptionId'),
          customerId: ref('event.customerId'),
        },
      },
    }))
    .also(setFact('subscription:${event.subscriptionId}:status', 'active'))
    .also(log('Subscription ${event.subscriptionId} activated, timers set'))
    .build()
);

// Rule 2: Send renewal reminder
engine.registerRule(
  Rule.create('renewal-reminder')
    .name('Send Renewal Reminder')
    .tags('subscriptions', 'notifications')
    .when(onEvent('subscription.reminder_due'))
    .if(fact('subscription:${event.subscriptionId}:status').eq('active'))
    .then(emit('notification.renewal_reminder', {
      subscriptionId: ref('event.subscriptionId'),
      customerId: ref('event.customerId'),
      message: 'Your subscription expires in 7 days.',
    }))
    .build()
);

// Rule 3: Handle renewal timeout
engine.registerRule(
  Rule.create('renewal-timeout')
    .name('Expire Subscription')
    .tags('subscriptions', 'lifecycle')
    .when(onEvent('subscription.renewal_due'))
    .if(fact('subscription:${event.subscriptionId}:status').eq('active'))
    .then(setFact('subscription:${event.subscriptionId}:status', 'expired'))
    .also(emit('subscription.expired', {
      subscriptionId: ref('event.subscriptionId'),
      customerId: ref('event.customerId'),
    }))
    .also(log('Subscription ${event.subscriptionId} expired'))
    .build()
);

// Rule 4: Cancel timers on manual renewal
engine.registerRule(
  Rule.create('manual-renewal')
    .name('Cancel Timers on Manual Renewal')
    .tags('subscriptions', 'timers')
    .when(onEvent('subscription.renewed'))
    .then(cancelTimer('renewal:${event.subscriptionId}'))
    .also(cancelTimer('renewal-reminder:${event.subscriptionId}'))
    .also(setFact('subscription:${event.subscriptionId}:status', 'active'))
    .also(log('Subscription ${event.subscriptionId} renewed, timers reset'))
    .build()
);

// --- Test ---

await engine.emit('subscription.activated', {
  subscriptionId: 'sub-001',
  customerId: 'cust-42',
  plan: 'premium',
});

console.log(`Active timers: ${engine.getTimers().length}`);
// Active timers: 2

// Simulate restart
await engine.stop();

const engine2 = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 5000 },
});

console.log(`Rules after restart: ${engine2.getStats().rules.total}`);
// Rules after restart: 4

// Timers are restored with remaining durations
console.log(`Timers after restart: ${engine2.getTimers().length}`);
// Timers after restart: 2

await engine2.stop();
```

Both the rules (via `persistence`) and the timers (via `timerPersistence`) survive the restart. The subscription system operates correctly across process boundaries.

</details>

## Summary

- noex-rules has two timer modes: **fallback** (`setTimeout`, volatile) and **durable** (`TimerService`, persistent)
- Enable durable mode by passing `timerPersistence: { adapter }` to `RuleEngine.start()`
- Durable timers persist metadata under key `'timer-manager:metadata'` in the storage adapter
- On restart, timers are restored with their **remaining duration** — a 30-minute timer with 10 minutes left fires after 10 minutes
- Recurring timers track `fireCount` in durable mode, ensuring `maxCount` is respected across restarts
- You can share the same `StorageAdapter` for rule persistence and timer persistence
- Use durable timers when a missed timer means business impact (payment timeouts, SLA escalation)
- For short-lived or development timers, fallback mode is sufficient

---

Next: [Hot Reload](./03-hot-reload.md)
