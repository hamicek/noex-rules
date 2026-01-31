# CEP Patterns in Practice

You've learned the four individual CEP pattern types. Real-world systems rarely use them in isolation — they combine multiple patterns, mix CEP with regular rules, and layer detection stages to build comprehensive monitoring pipelines. This chapter shows you how to compose patterns for production scenarios.

## What You'll Learn

- How to combine CEP patterns with regular event and fact rules
- How to build multi-stage detection pipelines
- A complete IoT monitoring pipeline example
- Performance considerations for temporal patterns
- Debugging strategies for CEP rules

## Combining CEP with Regular Rules

CEP rules produce events just like any other rule. This means you can chain CEP output into regular event-triggered rules, fact-triggered rules, or even other CEP patterns:

```text
  CEP Rule                    Regular Rule                 CEP Rule
  ┌──────────────┐            ┌──────────────┐            ┌──────────────┐
  │ count()      │──emits──→  │ onEvent()    │──sets──→   │ aggregate()  │
  │ 5 failures   │  "alert"   │ enriches     │  fact      │ risk score   │
  │ in 5 min     │            │ with context │            │ threshold    │
  └──────────────┘            └──────────────┘            └──────────────┘
```

### Pattern: CEP → Enrichment → Action

A common pattern is to use a CEP rule to detect a condition, then a regular rule to enrich the detection with additional context before taking action:

```typescript
import {
  Rule, onEvent, event, fact,
  emit, setFact, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// Stage 1: CEP detects brute force
engine.registerRule(
  Rule.create('detect-brute-force')
    .priority(200)
    .tags('security', 'detection')
    .when(count()
      .event('auth.login_failed')
      .threshold(5)
      .window('5m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('security.brute_force_detected', {
      userId: ref('trigger.groupKey'),
      attempts: ref('trigger.count'),
    }))
    .build()
);

// Stage 2: Regular rule enriches with user context
engine.registerRule(
  Rule.create('enrich-brute-force')
    .priority(150)
    .tags('security', 'enrichment')
    .when(onEvent('security.brute_force_detected'))
    .then(setFact('security:${event.userId}:threat', 'brute_force'))
    .also(emit('security.threat_assessed', {
      userId: ref('event.userId'),
      threat: 'brute_force',
      attempts: ref('event.attempts'),
    }))
    .build()
);

// Stage 3: Regular rule takes action based on enriched data
engine.registerRule(
  Rule.create('lock-account')
    .priority(100)
    .tags('security', 'response')
    .when(onEvent('security.threat_assessed'))
    .if(event('threat').eq('brute_force'))
    .then(setFact('user:${event.userId}:locked', true))
    .also(log('warn', 'Account locked: ${event.userId}'))
    .build()
);
```

### Pattern: CEP + Fact Conditions

CEP rules can have additional conditions that check facts, giving you context-aware pattern matching:

```typescript
// Only alert on brute force for non-admin users
engine.registerRule(
  Rule.create('brute-force-non-admin')
    .priority(200)
    .when(count()
      .event('auth.login_failed')
      .threshold(5)
      .window('5m')
      .groupBy('userId')
      .sliding()
    )
    .if(fact('user:${trigger.groupKey}:role').neq('admin'))
    .then(emit('security.alert', { userId: ref('trigger.groupKey') }))
    .build()
);
```

The CEP pattern triggers on frequency, but the action only fires if the user's role fact is not `admin`.

## Multi-Stage Detection Pipeline

Complex security or monitoring systems use multiple CEP patterns in a pipeline. Each stage detects a different aspect and feeds into the next:

```text
  ┌───────────────────────────────────────────────────────┐
  │              Multi-Stage Fraud Detection               │
  │                                                       │
  │  Stage 1: Pattern Detection                           │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
  │  │ count()     │  │ aggregate() │  │ sequence()  │  │
  │  │ Failed      │  │ High-value  │  │ Unusual     │  │
  │  │ logins      │  │ transfers   │  │ flow        │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
  │         │                │                │          │
  │  Stage 2: Risk Scoring                               │
  │         ▼                ▼                ▼          │
  │  ┌────────────────────────────────────────────────┐  │
  │  │ Each detection sets a risk score fact           │  │
  │  │ risk:userId:login = 30                          │  │
  │  │ risk:userId:transfer = 50                       │  │
  │  │ risk:userId:flow = 20                           │  │
  │  └─────────────────────┬──────────────────────────┘  │
  │                        │                              │
  │  Stage 3: Aggregation                                │
  │                        ▼                              │
  │  ┌────────────────────────────────────────────────┐  │
  │  │ aggregate() on risk score events               │  │
  │  │ Sum of risk scores > 70 in 1 hour → ALERT      │  │
  │  └────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────┘
```

```typescript
// Stage 1a: Failed login frequency
engine.registerRule(
  Rule.create('risk-failed-logins')
    .priority(200)
    .tags('fraud', 'stage-1')
    .when(count()
      .event('auth.login_failed')
      .threshold(3)
      .window('10m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'login',
      score: 30,
    }))
    .build()
);

// Stage 1b: High-value transfers
engine.registerRule(
  Rule.create('risk-high-transfers')
    .priority(200)
    .tags('fraud', 'stage-1')
    .when(aggregate()
      .event('transfer.completed')
      .field('amount')
      .function('sum')
      .threshold(20000)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'transfer',
      score: 50,
    }))
    .build()
);

// Stage 1c: Unusual login → transfer sequence
engine.registerRule(
  Rule.create('risk-unusual-flow')
    .priority(200)
    .tags('fraud', 'stage-1')
    .when(sequence()
      .event('auth.login', { newDevice: true })
      .event('transfer.completed')
      .within('30m')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.events.0.userId'),
      category: 'flow',
      score: 40,
    }))
    .build()
);

// Stage 2: Accumulate risk scores
engine.registerRule(
  Rule.create('accumulate-risk')
    .priority(150)
    .tags('fraud', 'stage-2')
    .when(onEvent('risk.score_added'))
    .then(setFact(
      'risk:${event.userId}:${event.category}',
      ref('event.score'),
    ))
    .build()
);

// Stage 3: Aggregate risk scores
engine.registerRule(
  Rule.create('risk-threshold')
    .priority(100)
    .tags('fraud', 'stage-3')
    .when(aggregate()
      .event('risk.score_added')
      .field('score')
      .function('sum')
      .threshold(70)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('fraud.alert', {
      userId: ref('trigger.groupKey'),
      totalRisk: ref('trigger.value'),
    }))
    .also(log('error', 'FRAUD ALERT: user ${trigger.groupKey}, risk score ${trigger.value}'))
    .build()
);
```

## Complete Example: IoT Monitoring Pipeline

A comprehensive IoT monitoring system that uses all four CEP pattern types:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event, fact,
  emit, setFact, log, ref,
  sequence, absence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'iot-monitor' });

  // ================================================================
  // STAGE 1: Individual sensor pattern detection
  // ================================================================

  // 1a. Temperature spike: average temp > 80°C over 5 minutes
  engine.registerRule(
    Rule.create('temp-spike')
      .name('Temperature Spike')
      .priority(200)
      .tags('iot', 'temperature')
      .when(aggregate()
        .event('sensor.temperature')
        .field('value')
        .function('avg')
        .threshold(80)
        .window('5m')
        .groupBy('sensorId')
      )
      .then(emit('alert.temp_high', {
        sensorId: ref('trigger.groupKey'),
        avgTemp: ref('trigger.value'),
      }))
      .also(setFact('sensor:${trigger.groupKey}:status', 'warning'))
      .build()
  );

  // 1b. Heartbeat monitoring: no reading in 2 minutes
  engine.registerRule(
    Rule.create('sensor-offline')
      .name('Sensor Offline Detection')
      .priority(200)
      .tags('iot', 'health')
      .when(absence()
        .after('sensor.heartbeat')
        .expected('sensor.heartbeat')
        .within('2m')
        .groupBy('sensorId')
      )
      .then(emit('alert.sensor_offline', {
        sensorId: ref('trigger.after.sensorId'),
      }))
      .also(setFact('sensor:${trigger.after.sensorId}:status', 'offline'))
      .build()
  );

  // 1c. Rapid fluctuation: 10+ readings in 1 minute (sensor malfunction)
  engine.registerRule(
    Rule.create('rapid-fluctuation')
      .name('Rapid Sensor Fluctuation')
      .priority(150)
      .tags('iot', 'diagnostics')
      .when(count()
        .event('sensor.temperature', { anomaly: true })
        .threshold(10)
        .window('1m')
        .groupBy('sensorId')
        .sliding()
      )
      .then(emit('alert.sensor_malfunction', {
        sensorId: ref('trigger.groupKey'),
        readingCount: ref('trigger.count'),
      }))
      .also(setFact('sensor:${trigger.groupKey}:status', 'malfunction'))
      .build()
  );

  // 1d. Failure cascade: temp spike → pressure spike → vibration alert
  engine.registerRule(
    Rule.create('failure-cascade')
      .name('Multi-Sensor Failure Cascade')
      .priority(250)
      .tags('iot', 'critical')
      .when(sequence()
        .event('alert.temp_high')
        .event('alert.pressure_high')
        .event('alert.vibration_high')
        .within('10m')
        .groupBy('zoneId')
      )
      .then(emit('alert.critical_failure', {
        zoneId: ref('trigger.events.0.zoneId'),
      }))
      .also(setFact('zone:${trigger.events.0.zoneId}:status', 'critical'))
      .also(log('error', 'CRITICAL: Failure cascade in zone ${trigger.events.0.zoneId}'))
      .build()
  );

  // ================================================================
  // STAGE 2: Alert routing and escalation
  // ================================================================

  // Escalate critical failures
  engine.registerRule(
    Rule.create('escalate-critical')
      .name('Escalate Critical Alerts')
      .priority(300)
      .tags('iot', 'escalation')
      .when(onEvent('alert.critical_failure'))
      .then(emit('notification.page_oncall', {
        zoneId: ref('event.zoneId'),
        severity: 'critical',
        message: 'Failure cascade detected in zone ${event.zoneId}',
      }))
      .build()
  );

  // Log all alerts
  engine.registerRule(
    Rule.create('log-alerts')
      .name('Alert Logger')
      .priority(10)
      .tags('iot', 'logging')
      .when(onEvent('alert.*'))
      .then(log('warn', 'IOT ALERT: ${event.topic}'))
      .build()
  );

  // ================================================================
  // STAGE 3: Dashboard state management
  // ================================================================

  // Track zone health in facts
  engine.registerRule(
    Rule.create('zone-health')
      .name('Zone Health Tracker')
      .when(onEvent('alert.*'))
      .if(event('zoneId').exists())
      .then(setFact('zone:${event.zoneId}:lastAlert', ref('event.topic')))
      .build()
  );

  // --- Simulate sensor data ---
  const sensors = ['S-1', 'S-2', 'S-3'];

  for (const sensorId of sensors) {
    // Normal heartbeat
    await engine.emit('sensor.heartbeat', { sensorId });

    // Temperature reading
    await engine.emit('sensor.temperature', {
      sensorId,
      zoneId: 'ZONE-A',
      value: 85, // above threshold
    });
  }

  console.log('S-1 status:', engine.getFact('sensor:S-1:status'));
  // "warning" (temp spike detected)

  await engine.stop();
}

main();
```

### Architecture Notes

This pipeline demonstrates several important patterns:

1. **Layered detection**: Stage 1 detects individual patterns, Stage 2 routes and escalates, Stage 3 manages state for dashboards.

2. **Event topics as contracts**: Each stage communicates via well-known event topics (`alert.temp_high`, `alert.critical_failure`, `notification.page_oncall`). New rules can subscribe to any stage.

3. **Facts as shared state**: Sensor and zone status facts create a queryable view of system health that dashboards and APIs can read.

4. **Priority ordering**: Critical patterns (cascade detection, priority 250) evaluate before lower-priority patterns (logging, priority 10).

## Performance Considerations

### EventStore Size

The EventStore keeps recent events in memory for count and aggregate queries. Configure retention based on your longest time window:

```typescript
const engine = await RuleEngine.start({
  name: 'production',
  events: {
    maxEvents: 50000,   // Max events in memory
    maxAgeMs: 86400000, // 24 hours
  },
});
```

If your longest CEP window is 1 hour, you don't need 24 hours of retention. Reduce `maxAgeMs` to free memory.

### GroupBy Cardinality

Each unique `groupBy` value creates a separate pattern instance. High-cardinality fields (like `requestId` or `sessionId`) can create thousands of instances:

```typescript
// Good: bounded cardinality
count().event('api.error').groupBy('endpoint')     // ~50 endpoints
aggregate().event('order.paid').groupBy('region')  // ~10 regions

// Careful: potentially high cardinality
count().event('api.error').groupBy('userId')       // ~100K users
aggregate().event('tx.completed').groupBy('txId')  // unbounded!
```

For high-cardinality fields, prefer sliding windows (which clean up after each evaluation) and keep time windows short.

### Window Size vs Memory

Larger windows require storing more events:

| Window | Event Rate | Memory Impact |
|--------|------------|---------------|
| 1 minute | 100/sec | ~6,000 events |
| 5 minutes | 100/sec | ~30,000 events |
| 1 hour | 100/sec | ~360,000 events |
| 24 hours | 100/sec | ~8.6M events |

Use the shortest window that satisfies your business requirement. If you need long windows with high event rates, consider pre-aggregating at shorter intervals.

### Pattern Count

Each registered CEP pattern adds processing overhead per event. The engine evaluates every incoming event against all active patterns. For systems with hundreds of CEP rules, consider:

- Using event filters to narrow matching
- Organizing rules with tags and groups for selective enabling
- Pre-filtering events before they reach the engine

## Debugging CEP Rules

### Common Issues

**Pattern never fires**:
1. Check the event topic matches exactly (including wildcards)
2. Verify `groupBy` field exists in event data
3. Verify the time window is long enough for your test data
4. For count/aggregate: check that enough events have been emitted
5. For sequence: verify events arrive in the correct order
6. For absence: wait for the full timeout duration

**Pattern fires too often**:
1. Check `groupBy` — missing `groupBy` treats all events as one group
2. Verify filters are restrictive enough
3. For sliding count: each event re-evaluates, may fire on every event above threshold

**Pattern fires with wrong data**:
1. Check `ref()` paths match the trigger type (e.g., `trigger.events.0` for sequence, `trigger.after` for absence, `trigger.groupKey` for count/aggregate)
2. Verify field names in event data match what the pattern expects

### Inspecting Active Instances

The TemporalProcessor exposes its state for debugging:

```typescript
// Get all active pattern instances
const instances = engine.temporalProcessor.getActiveInstances();
console.log('Active instances:', instances.length);

for (const inst of instances) {
  console.log(`  ${inst.id}: ${inst.pattern.type} [${inst.state}]`);
  console.log(`    Rule: ${inst.ruleId}`);
  console.log(`    Group: ${inst.groupKey}`);
  console.log(`    Expires: ${new Date(inst.expiresAt).toISOString()}`);
}

// Get instances for a specific rule
const ruleInstances = engine.temporalProcessor.getInstancesForRule('brute-force');
```

### Tracing Events Through Patterns

Enable tracing to see how events flow through CEP matchers:

```typescript
engine.on('temporal.match', (match) => {
  console.log('Pattern matched:', {
    ruleId: match.ruleId,
    pattern: match.pattern.type,
    groupKey: match.groupKey,
    matchedEvents: match.matchedEvents.length,
    aggregateValue: match.aggregateValue,
    count: match.count,
  });
});
```

## Exercise

Design a complete e-commerce fraud detection system using multiple CEP patterns. The system should detect:

1. **Rapid Orders**: More than 3 orders from the same user in 10 minutes (suspicious automation)
2. **High-Value Spike**: Total order amount exceeds $5,000 for a user in 1 hour
3. **New Device + Large Purchase**: User logs in from a new device, then places an order over $500, within 30 minutes
4. **Risk Aggregation**: When the combined risk score (from the above detections) exceeds 60 for a user in 1 hour, emit a fraud alert

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  sequence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

// 1. Rapid Orders (count)
engine.registerRule(
  Rule.create('rapid-orders')
    .priority(200)
    .tags('fraud', 'detection')
    .when(count()
      .event('order.created')
      .threshold(3)
      .window('10m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'rapid_orders',
      score: 25,
    }))
    .also(log('warn', 'Rapid orders detected: ${trigger.groupKey}'))
    .build()
);

// 2. High-Value Spike (aggregate)
engine.registerRule(
  Rule.create('high-value-spike')
    .priority(200)
    .tags('fraud', 'detection')
    .when(aggregate()
      .event('order.created')
      .field('total')
      .function('sum')
      .threshold(5000)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'high_value',
      score: 35,
    }))
    .also(log('warn', 'High-value spike: ${trigger.groupKey} = $${trigger.value}'))
    .build()
);

// 3. New Device + Large Purchase (sequence)
engine.registerRule(
  Rule.create('new-device-purchase')
    .priority(200)
    .tags('fraud', 'detection')
    .when(sequence()
      .event('auth.login', { newDevice: true })
      .event('order.created', { total: { $gte: 500 } })
      .within('30m')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.events.0.userId'),
      category: 'new_device',
      score: 40,
    }))
    .also(log('warn', 'New device purchase: ${trigger.events.0.userId}'))
    .build()
);

// 4. Risk Aggregation (aggregate over risk scores)
engine.registerRule(
  Rule.create('fraud-alert')
    .priority(100)
    .tags('fraud', 'response')
    .when(aggregate()
      .event('risk.score_added')
      .field('score')
      .function('sum')
      .threshold(60)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('fraud.alert', {
      userId: ref('trigger.groupKey'),
      totalRisk: ref('trigger.value'),
    }))
    .also(setFact('user:${trigger.groupKey}:fraudAlert', true))
    .also(log('error', 'FRAUD ALERT: ${trigger.groupKey}, risk = ${trigger.value}'))
    .build()
);

// Response: lock account on fraud alert
engine.registerRule(
  Rule.create('fraud-lockout')
    .priority(50)
    .tags('fraud', 'response')
    .when(onEvent('fraud.alert'))
    .then(setFact('user:${event.userId}:locked', true))
    .also(log('error', 'Account locked due to fraud: ${event.userId}'))
    .build()
);
```

The system works in layers: three detection rules (count, aggregate, sequence) each emit `risk.score_added` events with different scores. The aggregation rule sums those scores per user over 1 hour. When the total crosses 60, a fraud alert fires and the response rule locks the account.

This architecture is extensible — adding a new detection pattern only requires adding a new rule that emits `risk.score_added`. No existing rules need to change.

</details>

## Summary

- CEP patterns produce events that regular rules can consume, enabling **multi-stage pipelines**
- The **CEP → enrichment → action** pattern separates detection from response
- **Fact conditions** on CEP rules add context-aware matching
- Layer patterns into **stages**: detection → scoring → aggregation → response
- Configure **EventStore** retention based on your longest time window
- Watch **groupBy cardinality** — high-cardinality fields create many instances
- Use **short windows** and **event filters** to minimize memory and CPU overhead
- Debug with `getActiveInstances()` and `temporal.match` event listener
- Common issues: missing `groupBy`, wrong `ref()` paths, insufficient time window

---

Next: [Rule Groups and Tags](../06-organization/01-groups-and-tags.md)
