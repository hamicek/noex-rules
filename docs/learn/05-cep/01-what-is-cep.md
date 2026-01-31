# What is CEP?

Everything you've built so far reacts to a single event or a single fact change. That's powerful, but real-world business logic often cares about **relationships between events over time**. Did the customer pay within 15 minutes of placing an order? Were there five failed login attempts in the last minute? Has the average sensor temperature exceeded a safety threshold over the past hour? Complex Event Processing (CEP) lets you express these temporal patterns as declarative rules, without writing imperative polling loops or maintaining manual state.

## What You'll Learn

- Why single-event rules can't capture temporal business logic
- The four CEP pattern types and when to use each one
- How the TemporalProcessor fits into the engine architecture
- How to recognize CEP requirements in real-world problems

## The Limits of Single-Event Rules

Consider a payment timeout scenario. After an order is created, the customer has 15 minutes to pay. If the payment doesn't arrive, the order should be cancelled.

With single-event rules, you'd need something like:

```typescript
// Rule 1: When order is created, start a timer
engine.registerRule(
  Rule.create('start-payment-timer')
    .when(onEvent('order.created'))
    .then(setTimer({
      name: 'payment-timeout:${event.orderId}',
      duration: '15m',
      onExpire: {
        topic: 'order.payment_timeout',
        data: { orderId: ref('event.orderId') },
      },
    }))
    .build()
);

// Rule 2: When payment arrives, cancel the timer
engine.registerRule(
  Rule.create('cancel-payment-timer')
    .when(onEvent('payment.received'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .build()
);

// Rule 3: When timeout fires, cancel the order
engine.registerRule(
  Rule.create('cancel-unpaid-order')
    .when(onEvent('order.payment_timeout'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .build()
);
```

Three rules, manual timer management, and the business intent — "if payment doesn't follow order within 15 minutes" — is scattered across all of them. With CEP, the same logic is a single declaration:

```typescript
engine.registerRule(
  Rule.create('payment-timeout')
    .when(absence()
      .after('order.created')
      .expected('payment.received')
      .within('15m')
      .groupBy('orderId')
    )
    .then(setFact('order:${trigger.after.orderId}:status', 'cancelled'))
    .build()
);
```

One rule. One intent. The engine handles the timer, the cancellation, and the grouping.

## The Four Pattern Types

CEP in noex-rules provides four temporal pattern types. Each one detects a different kind of relationship between events over time:

```text
  ┌─────────────────────────────────────────────────────────────────┐
  │                    CEP Pattern Types                            │
  ├─────────────┬───────────────────────────────────────────────────┤
  │  SEQUENCE   │  Events arrive in a specific order               │
  │             │  "A happened, then B happened, within 5 minutes" │
  ├─────────────┼───────────────────────────────────────────────────┤
  │  ABSENCE    │  An expected event never arrived                 │
  │             │  "A happened, but B didn't follow within 15 min" │
  ├─────────────┼───────────────────────────────────────────────────┤
  │  COUNT      │  Too many (or too few) events in a time window   │
  │             │  "5+ failed logins within 1 minute"              │
  ├─────────────┼───────────────────────────────────────────────────┤
  │  AGGREGATE  │  A numeric aggregate crosses a threshold         │
  │             │  "Sum of order amounts exceeds $10,000 in 1 hour"│
  └─────────────┴───────────────────────────────────────────────────┘
```

### Sequence

Detects events arriving in a specific order within a time window. Use it for multi-step workflows where you need to confirm that each step happened in the right order.

**Examples**: order → payment → shipment flow, user registration → email verification → first login.

### Absence

Detects that an expected event did **not** arrive within a time window after a triggering event. Use it for timeout detection and SLA monitoring.

**Examples**: order created but no payment within 15 minutes, support ticket opened but no response within 1 hour.

### Count

Detects when the number of matching events in a time window crosses a threshold. Use it for frequency-based alerting and rate limiting.

**Examples**: 5+ failed logins in 5 minutes (brute force), 100+ API errors in 1 minute (outage detection).

### Aggregate

Detects when a numeric aggregate (sum, average, min, max) of event field values crosses a threshold within a time window. Use it for value-based monitoring.

**Examples**: total revenue > $10,000 in 1 hour, average response time > 500ms over 5 minutes.

## How CEP Fits Into the Architecture

The TemporalProcessor is a dedicated component that sits alongside the engine's standard rule evaluation:

```text
  Event arrives
       │
       ▼
  ┌─────────────┐
  │ RuleEngine  │
  │             │
  │  ┌─────────────────────────┐
  │  │ Standard Rule Evaluator │──── event/fact triggers → conditions → actions
  │  └─────────────────────────┘
  │             │
  │  ┌─────────────────────────┐
  │  │ TemporalProcessor       │──── CEP pattern matching
  │  │                         │
  │  │  SequenceMatcher        │──── tracks ordered event chains
  │  │  AbsenceMatcher         │──── tracks missing events + timeouts
  │  │  CountMatcher           │──── tracks event frequency windows
  │  │  AggregateMatcher       │──── tracks numeric aggregation windows
  │  └─────────────────────────┘
  │             │
  │  ┌─────────────────────────┐
  │  │ TimerManager            │──── manages timeout callbacks
  │  └─────────────────────────┘
  │             │
  │  ┌─────────────────────────┐
  │  │ EventStore              │──── event history for time-range queries
  │  └─────────────────────────┘
  └─────────────┘
       │
       ▼
  Pattern match → rule conditions evaluated → actions executed
```

**Key components**:

| Component | Role |
|-----------|------|
| `TemporalProcessor` | Coordinates all four matchers, registers rules, routes events |
| `SequenceMatcher` | Manages sequence instances, tracks matched events in order |
| `AbsenceMatcher` | Manages absence instances, triggers on timeout |
| `CountMatcher` | Manages count windows (sliding and tumbling) |
| `AggregateMatcher` | Manages aggregate windows, computes sum/avg/min/max |
| `TimerManager` | Creates and cancels timers for sequence/absence deadlines |
| `EventStore` | Stores recent events for count/aggregate time-range queries |

When a CEP rule is registered, its temporal trigger is parsed and handed to the appropriate matcher. As events flow through the engine, the TemporalProcessor checks each one against all active patterns. When a pattern matches, the engine evaluates the rule's conditions and — if they pass — executes its actions.

## Pattern Lifecycle

Every CEP pattern maintains **instances** — one per unique group (defined by `groupBy`). Each instance goes through a state machine:

```text
  Sequence:   pending ──→ matching ──→ completed
                                  └──→ expired

  Absence:    pending ──→ waiting  ──→ completed  (timeout, no event)
                                  └──→ cancelled  (expected event arrived)

  Count:      active ──→ triggered
                    └──→ expired

  Aggregate:  active ──→ triggered
                    └──→ expired
```

Instances are automatically cleaned up on completion or expiration. The `groupBy` field ensures that each logical group (e.g., each `orderId`) has its own independent instance.

## Recognizing CEP Requirements

When analyzing business requirements, look for these phrases:

| Phrase | Pattern |
|--------|---------|
| "A followed by B within X time" | **Sequence** |
| "A then B then C in order" | **Sequence** |
| "If B doesn't happen within X after A" | **Absence** |
| "No response within X" | **Absence** |
| "More than N events in X time" | **Count** |
| "Rate exceeds N per minute/hour" | **Count** |
| "Total/average/sum exceeds X in time window" | **Aggregate** |
| "When the sum of ... crosses a threshold" | **Aggregate** |

## Real-World Examples

### E-Commerce: Order Fulfillment

"An order must be shipped within 48 hours of payment confirmation."

→ **Absence** pattern: after `payment.confirmed`, expect `shipment.dispatched` within `48h`, grouped by `orderId`.

### Security: Brute Force Detection

"Lock an account after 5 failed login attempts within 5 minutes."

→ **Count** pattern: count `auth.login_failed` events, threshold 5, window `5m`, grouped by `userId`.

### Finance: Transaction Monitoring

"Alert if total transaction amount exceeds $50,000 within 1 hour for the same account."

→ **Aggregate** pattern: aggregate `transaction.completed` on field `amount`, function `sum`, threshold 50000, window `1h`, grouped by `accountId`.

### IoT: Multi-Step Failure

"Alert if a sensor reports high temperature, then high pressure, then vibration — in that order within 10 minutes."

→ **Sequence** pattern: events `sensor.high_temp`, `sensor.high_pressure`, `sensor.vibration`, within `10m`, grouped by `sensorId`.

## Exercise

For each business requirement, identify the correct CEP pattern type and explain why:

1. "If a user adds items to cart but doesn't check out within 30 minutes, send a reminder email."
2. "Alert the security team when a single IP address makes more than 100 API requests in 1 minute."
3. "Track the payment pipeline: order created → payment authorized → payment captured, all within 10 minutes."
4. "Notify warehouse when total weight of orders pending shipment exceeds 500 kg in the last 2 hours."

<details>
<summary>Solution</summary>

1. **Absence** — after `cart.item_added`, expect `checkout.completed` within `30m`, grouped by `userId`. The key is "doesn't happen within" → absence.

2. **Count** — count `api.request` events, threshold 100, window `1m`, grouped by `ipAddress`. The key is "more than N events in time" → count.

3. **Sequence** — events `order.created` → `payment.authorized` → `payment.captured`, within `10m`, grouped by `orderId`. The key is "A then B then C in order" → sequence.

4. **Aggregate** — aggregate `order.pending_shipment` on field `weight`, function `sum`, threshold 500, window `2h`. The key is "total exceeds threshold in time" → aggregate.

</details>

## Summary

- Single-event rules can't express temporal relationships between events
- CEP provides four pattern types: **sequence**, **absence**, **count**, and **aggregate**
- Each pattern type solves a distinct category of temporal business logic
- The TemporalProcessor coordinates pattern matching alongside standard rule evaluation
- Pattern instances are isolated by `groupBy` and follow well-defined state machines
- Look for temporal keywords in requirements ("within", "followed by", "doesn't happen", "rate", "total exceeds") to identify CEP opportunities

---

Next: [Sequence and Absence](./02-sequence-and-absence.md)
