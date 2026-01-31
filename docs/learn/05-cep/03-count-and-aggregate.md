# Count and Aggregate

Count and aggregate are the two **quantity-sensitive** CEP patterns. A count pattern fires when the number of matching events in a time window crosses a threshold. An aggregate pattern fires when a numeric function (sum, average, min, max) over event field values crosses a threshold. Together they cover frequency-based alerting and value-based monitoring.

## What You'll Learn

- How to define count patterns with `count()`
- The difference between sliding and tumbling windows
- How to define aggregate patterns with `aggregate()`
- All five aggregate functions: sum, avg, min, max, count
- Comparison operators: `gte`, `lte`, `eq`
- Complete examples: brute-force detection (count) and revenue monitoring (aggregate)

## Count Patterns

A count pattern tracks how many matching events occur within a time window and fires when the count crosses a threshold.

### Basic Count

```typescript
import {
  Rule, emit, ref, count,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('brute-force-detection')
    .name('Brute Force Detection')
    .when(count()
      .event('auth.login_failed')
      .threshold(5)
      .window('5m')
      .groupBy('userId')
    )
    .then(emit('security.account_locked', {
      userId: ref('trigger.groupKey'),
    }))
    .build()
);
```

This fires when 5 or more `auth.login_failed` events occur within 5 minutes for the same `userId`.

### Comparison Operators

By default, count uses `gte` (greater than or equal). You can change this:

```typescript
// Fire when EXACTLY 3 events occur
count()
  .event('step.completed')
  .threshold(3)
  .comparison('eq')
  .window('10m')
  .groupBy('processId')

// Fire when fewer than 2 events occur (quiet period)
count()
  .event('heartbeat')
  .threshold(2)
  .comparison('lte')
  .window('5m')
  .groupBy('serviceId')
```

| Operator | Meaning | Use Case |
|----------|---------|----------|
| `'gte'` | count >= threshold (default) | "Too many events" — brute force, rate limiting |
| `'lte'` | count <= threshold | "Too few events" — quiet period, missing heartbeats |
| `'eq'` | count === threshold | "Exact count" — all steps completed |

### Sliding vs Tumbling Windows

Count supports two windowing strategies:

```text
  Tumbling Window (default, sliding: false)
  ──────────────────────────────────────────────────
  │ Window 1 │ Window 2 │ Window 3 │
  │ 00:00-05:00 │ 05:00-10:00 │ 10:00-15:00 │
  │ ●●●       │ ●●●●●    │ ●●          │
  │ count: 3  │ count: 5 ✓│ count: 2    │

  Events are grouped into fixed, non-overlapping intervals.
  Evaluation happens at window boundaries.

  Sliding Window (sliding: true)
  ──────────────────────────────────────────────────
  Each event checks: "How many events in the last 5 minutes?"
       ●  ●  ●  ●  ●
       ← 5m window →
  As soon as the 5th event arrives: count = 5 ✓ (fires immediately)

  The window slides with each new event.
  Evaluation happens on every matching event.
```

**Tumbling** divides time into fixed intervals. It's predictable and lightweight — the count resets at each window boundary. Use it when you need periodic checks.

**Sliding** checks the last N milliseconds on every event. It catches bursts faster because it fires as soon as the threshold is crossed, regardless of window alignment. Use it for real-time alerting.

```typescript
// Tumbling: check every 5-minute block
count()
  .event('api.error')
  .threshold(100)
  .window('5m')
  .groupBy('endpoint')

// Sliding: fire as soon as 100 errors happen in any 5-minute span
count()
  .event('api.error')
  .threshold(100)
  .window('5m')
  .groupBy('endpoint')
  .sliding()
```

### Event Filters

Narrow which events are counted:

```typescript
count()
  .event('auth.login_failed', { method: 'password' })
  .threshold(5)
  .window('5m')
  .groupBy('userId')
```

Only password-based login failures are counted. OAuth or SSO failures are ignored.

### Count Interface

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';  // default: 'gte'
  window: string | number;
  groupBy?: string;
  sliding?: boolean;                   // default: false (tumbling)
}
```

## Aggregate Patterns

An aggregate pattern computes a numeric function over a field in matching events within a time window and fires when the result crosses a threshold.

### Basic Aggregate

```typescript
import {
  Rule, emit, ref, aggregate,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('revenue-spike')
    .name('Revenue Spike Alert')
    .when(aggregate()
      .event('order.paid')
      .field('amount')
      .function('sum')
      .threshold(10000)
      .window('1h')
      .groupBy('region')
    )
    .then(emit('alert.revenue_spike', {
      region: ref('trigger.groupKey'),
      total: ref('trigger.value'),
    }))
    .build()
);
```

This fires when the sum of `amount` values across `order.paid` events exceeds 10,000 within 1 hour, per region.

### Aggregate Functions

Five functions are available:

| Function | Computes | Empty Window |
|----------|----------|--------------|
| `'sum'` | Sum of all values | `0` |
| `'avg'` | Arithmetic mean | `0` |
| `'min'` | Minimum value | `Infinity` |
| `'max'` | Maximum value | `-Infinity` |
| `'count'` | Number of events (ignores field value) | `0` |

```typescript
// Average response time exceeds 500ms
aggregate()
  .event('api.response')
  .field('duration')
  .function('avg')
  .threshold(500)
  .comparison('gte')
  .window('5m')
  .groupBy('endpoint')

// Minimum temperature drops below freezing
aggregate()
  .event('sensor.reading')
  .field('temperature')
  .function('min')
  .threshold(0)
  .comparison('lte')
  .window('10m')
  .groupBy('sensorId')

// Maximum CPU spike
aggregate()
  .event('system.metrics')
  .field('cpu')
  .function('max')
  .threshold(95)
  .comparison('gte')
  .window('1m')
  .groupBy('hostId')
```

### Field Extraction

The `field` parameter uses dot notation to extract nested values from event data:

```typescript
// Event: { data: { transaction: { amount: 250 } } }
aggregate()
  .event('transaction.completed')
  .field('transaction.amount')     // Extracts nested value
  .function('sum')
  .threshold(50000)
  .window('1h')
```

Non-numeric values are silently ignored in the aggregation. Only valid numbers contribute to the result.

### Comparison Operators

Same as count — `gte` (default), `lte`, `eq`:

```typescript
// Sum exceeds threshold
aggregate()
  .event('order.paid')
  .field('amount')
  .function('sum')
  .threshold(10000)
  .comparison('gte')
  .window('1h')

// Average drops below threshold
aggregate()
  .event('sensor.reading')
  .field('quality')
  .function('avg')
  .threshold(0.8)
  .comparison('lte')
  .window('30m')
```

### Windowing

Aggregate uses the same sliding/tumbling window model as count. By default, it's tumbling. The builder doesn't expose a `.sliding()` method directly for aggregate — use the raw pattern if you need sliding aggregate windows:

```typescript
// Raw pattern with sliding window
engine.registerRule({
  id: 'sliding-revenue',
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'aggregate',
      event: { topic: 'order.paid' },
      field: 'amount',
      function: 'sum',
      threshold: 10000,
      comparison: 'gte',
      window: '1h',
      groupBy: 'region',
    },
  },
  conditions: [],
  actions: [
    { type: 'emit_event', topic: 'alert.revenue_spike' },
  ],
});
```

### Aggregate Interface

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;                              // Dot-notation path to numeric field
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';         // default: 'gte'
  window: string | number;
  groupBy?: string;
}
```

## Count vs Aggregate

| Aspect | Count | Aggregate |
|--------|-------|-----------|
| What it measures | Number of events | Numeric function over field values |
| Input | Events matching topic+filter | Events matching topic+filter + numeric field |
| Typical use | Rate limiting, frequency alerts | Revenue, averages, thresholds |
| Functions | N/A (just counting) | sum, avg, min, max, count |
| Sliding windows | `.sliding()` in builder | Raw pattern only |
| Example | "5+ failed logins in 5 min" | "Total orders > $10K in 1 hour" |

Use **count** when you care about *how many* events happened. Use **aggregate** when you care about *what values* those events carried.

## Complete Working Example

A security monitoring system with both count and aggregate patterns:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'security-monitor' });

  // === Brute force detection: 5+ failed logins in 5 minutes ===
  engine.registerRule(
    Rule.create('brute-force')
      .name('Brute Force Detection')
      .priority(200)
      .tags('security', 'auth')
      .when(count()
        .event('auth.login_failed')
        .threshold(5)
        .window('5m')
        .groupBy('userId')
        .sliding()
      )
      .then(setFact('user:${trigger.groupKey}:locked', true))
      .also(emit('security.account_locked', {
        userId: ref('trigger.groupKey'),
        failedAttempts: ref('trigger.count'),
      }))
      .also(log('warn', 'Account locked: ${trigger.groupKey} (${trigger.count} failed attempts)'))
      .build()
  );

  // === Suspicious transaction volume: >$50K in 1 hour per account ===
  engine.registerRule(
    Rule.create('high-volume-transactions')
      .name('High Volume Transaction Alert')
      .priority(200)
      .tags('security', 'transactions')
      .when(aggregate()
        .event('transaction.completed')
        .field('amount')
        .function('sum')
        .threshold(50000)
        .window('1h')
        .groupBy('accountId')
      )
      .then(emit('security.high_volume_alert', {
        accountId: ref('trigger.groupKey'),
        totalAmount: ref('trigger.value'),
      }))
      .also(log('warn', 'High transaction volume: ${trigger.groupKey} = $${trigger.value}'))
      .build()
  );

  // === API error rate: 100+ errors per endpoint in 1 minute ===
  engine.registerRule(
    Rule.create('api-error-rate')
      .name('API Error Rate Alert')
      .priority(150)
      .tags('monitoring', 'api')
      .when(count()
        .event('api.error')
        .threshold(100)
        .window('1m')
        .groupBy('endpoint')
        .sliding()
      )
      .then(emit('alert.api_degraded', {
        endpoint: ref('trigger.groupKey'),
        errorCount: ref('trigger.count'),
      }))
      .build()
  );

  // === Average response time: >500ms over 5 minutes ===
  engine.registerRule(
    Rule.create('slow-endpoint')
      .name('Slow Endpoint Detection')
      .priority(100)
      .tags('monitoring', 'performance')
      .when(aggregate()
        .event('api.response')
        .field('duration')
        .function('avg')
        .threshold(500)
        .window('5m')
        .groupBy('endpoint')
      )
      .then(emit('alert.slow_endpoint', {
        endpoint: ref('trigger.groupKey'),
        avgDuration: ref('trigger.value'),
      }))
      .build()
  );

  // --- React to alerts ---
  engine.registerRule(
    Rule.create('alert-handler')
      .when(onEvent('security.*'))
      .then(log('error', 'SECURITY ALERT: ${event.topic}'))
      .build()
  );

  // --- Test: Brute force ---
  for (let i = 0; i < 5; i++) {
    await engine.emit('auth.login_failed', {
      userId: 'user-42',
      ip: '192.168.1.100',
      method: 'password',
    });
  }
  console.log('Locked:', engine.getFact('user:user-42:locked'));
  // true

  // --- Test: High transaction volume ---
  await engine.emit('transaction.completed', {
    accountId: 'ACC-1',
    amount: 30000,
  });
  await engine.emit('transaction.completed', {
    accountId: 'ACC-1',
    amount: 25000,
  });
  // Total: $55,000 > $50,000 threshold → alert fires

  await engine.stop();
}

main();
```

## Exercise

Build a monitoring dashboard with count and aggregate patterns:

1. **Rate Limiter**: Detect when a single IP address makes more than 60 API requests in 1 minute. Use a sliding window. Emit `rate_limit.exceeded` with the IP and request count.

2. **Revenue Tracker**: Track hourly revenue per product category. When the sum of `order.completed` amounts exceeds $5,000 for a category in 1 hour, emit `revenue.milestone_reached` with the category and total.

3. **Health Check**: Detect when the average `health.check` response time for a service exceeds 1000ms over 2 minutes. Emit `alert.service_degraded`.

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, emit, ref,
  count, aggregate,
} from '@hamicek/noex-rules/dsl';

// 1. Rate Limiter (sliding count)
const rateLimiter = Rule.create('rate-limiter')
  .name('IP Rate Limiter')
  .priority(200)
  .tags('security', 'rate-limiting')
  .when(count()
    .event('api.request')
    .threshold(60)
    .window('1m')
    .groupBy('ip')
    .sliding()
  )
  .then(emit('rate_limit.exceeded', {
    ip: ref('trigger.groupKey'),
    requestCount: ref('trigger.count'),
  }))
  .build();

// 2. Revenue Tracker (aggregate sum)
const revenueTracker = Rule.create('revenue-tracker')
  .name('Hourly Revenue Tracker')
  .priority(100)
  .tags('business', 'revenue')
  .when(aggregate()
    .event('order.completed')
    .field('amount')
    .function('sum')
    .threshold(5000)
    .window('1h')
    .groupBy('category')
  )
  .then(emit('revenue.milestone_reached', {
    category: ref('trigger.groupKey'),
    total: ref('trigger.value'),
  }))
  .build();

// 3. Health Check (aggregate avg)
const healthCheck = Rule.create('health-check')
  .name('Service Health Monitor')
  .priority(150)
  .tags('monitoring', 'health')
  .when(aggregate()
    .event('health.check')
    .field('responseTime')
    .function('avg')
    .threshold(1000)
    .comparison('gte')
    .window('2m')
    .groupBy('serviceId')
  )
  .then(emit('alert.service_degraded', {
    serviceId: ref('trigger.groupKey'),
    avgResponseTime: ref('trigger.value'),
  }))
  .build();

engine.registerRule(rateLimiter);
engine.registerRule(revenueTracker);
engine.registerRule(healthCheck);
```

The rate limiter uses a sliding window for immediate detection. The revenue tracker uses tumbling (default) for clean hourly boundaries. The health check monitors average response time over a rolling 2-minute period.

</details>

## Summary

- **Count** measures how many matching events occur in a time window
- **Aggregate** computes sum, avg, min, max, or count over a numeric field in matching events
- Both support `gte` (default), `lte`, and `eq` comparison operators
- **Tumbling windows** divide time into fixed intervals — predictable and lightweight
- **Sliding windows** check the last N milliseconds on every event — faster burst detection
- `groupBy` isolates tracking per correlation key (e.g., `userId`, `endpoint`, `accountId`)
- Event filters narrow which events participate in the count or aggregation
- Use count for frequency-based alerts; use aggregate for value-based monitoring

---

Next: [CEP Patterns in Practice](./04-cep-patterns.md)
