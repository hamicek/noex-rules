# TemporalProcessor

CEP (Complex Event Processing) engine for temporal patterns. Detects sequences, absences, counts, and aggregates over time windows.

## Import

```typescript
import {
  TemporalProcessor,
  TemporalProcessorConfig,
  PatternInstance,
  PatternInstanceState,
  PatternMatch,
  TemporalPattern,
  SequencePattern,
  AbsencePattern,
  CountPattern,
  AggregatePattern,
  EventMatcher
} from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(
  eventStore: EventStore,
  timerManager: TimerManager,
  config?: TemporalProcessorConfig
): Promise<TemporalProcessor>
```

Creates a new TemporalProcessor instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| eventStore | `EventStore` | yes | Event store for querying historical events |
| timerManager | `TimerManager` | yes | Timer manager for scheduling timeouts |
| config | `TemporalProcessorConfig` | no | Configuration options |

**Returns:** `Promise<TemporalProcessor>` — processor instance

**Example:**

```typescript
const eventStore = await EventStore.start();
const timerManager = await TimerManager.start();
const processor = await TemporalProcessor.start(eventStore, timerManager, {
  timerPrefix: 'cep'
});
```

---

## Match Callback

### onMatch()

```typescript
onMatch(callback: (match: PatternMatch) => void | Promise<void>): void
```

Sets the callback invoked when a pattern matches. The callback receives the match details including matched events and any computed values.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| callback | `function` | yes | Function called on pattern match |

**Example:**

```typescript
processor.onMatch(async (match) => {
  console.log(`Pattern matched for rule: ${match.ruleId}`);
  console.log(`Events: ${match.matchedEvents.length}`);

  if (match.aggregateValue !== undefined) {
    console.log(`Aggregate value: ${match.aggregateValue}`);
  }
});
```

---

## Rule Management

### registerRule()

```typescript
registerRule(rule: Rule): void
```

Registers a rule with a temporal trigger. The processor will track pattern instances for this rule.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| rule | `Rule` | yes | Rule with `trigger.type === 'temporal'` |

**Throws:** `Error` if rule does not have a temporal trigger

**Example:**

```typescript
processor.registerRule({
  id: 'payment-timeout',
  name: 'Payment Timeout',
  priority: 100,
  enabled: true,
  tags: ['payments'],
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'absence',
      after: { topic: 'order.created' },
      expected: { topic: 'payment.received' },
      within: '30m',
      groupBy: 'orderId'
    }
  },
  conditions: [],
  actions: [{ type: 'emit_event', topic: 'payment.timeout', payload: {} }]
});
```

### unregisterRule()

```typescript
unregisterRule(ruleId: string): boolean
```

Removes a rule and cancels all its active pattern instances.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |

**Returns:** `boolean` — true if rule was found and removed

**Example:**

```typescript
const removed = processor.unregisterRule('payment-timeout');
```

---

## Event Processing

### processEvent()

```typescript
async processEvent(event: Event): Promise<PatternMatch[]>
```

Processes an incoming event against all registered temporal patterns. Returns any patterns that matched as a result of this event.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| event | `Event` | yes | Incoming event to process |

**Returns:** `Promise<PatternMatch[]>` — array of pattern matches triggered by this event

**Example:**

```typescript
const matches = await processor.processEvent({
  id: 'evt-123',
  topic: 'order.created',
  data: { orderId: 'ORD-456', amount: 99.99 },
  timestamp: Date.now()
});

for (const match of matches) {
  console.log(`Rule ${match.ruleId} matched`);
}
```

### handleTimeout()

```typescript
async handleTimeout(instanceId: string): Promise<PatternMatch | undefined>
```

Handles timeout expiration for a pattern instance. For absence patterns, timeout means the expected event did not arrive — this triggers a match. For other patterns, timeout means the pattern expired without completing.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| instanceId | `string` | yes | Pattern instance identifier |

**Returns:** `Promise<PatternMatch | undefined>` — match result for absence patterns, undefined otherwise

**Example:**

```typescript
const match = await processor.handleTimeout('instance-123');
if (match) {
  console.log(`Absence pattern triggered for ${match.ruleId}`);
}
```

---

## Instance Queries

### getActiveInstances()

```typescript
getActiveInstances(): PatternInstance[]
```

Returns all active pattern instances across all rules.

**Returns:** `PatternInstance[]` — array of active instances

**Example:**

```typescript
const instances = processor.getActiveInstances();
console.log(`${instances.length} patterns in progress`);

for (const instance of instances) {
  console.log(`  ${instance.ruleId}: ${instance.state} (${instance.matchedEvents.length} events)`);
}
```

### getInstancesForRule()

```typescript
getInstancesForRule(ruleId: string): PatternInstance[]
```

Returns active instances for a specific rule.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |

**Returns:** `PatternInstance[]` — instances for this rule

**Example:**

```typescript
const instances = processor.getInstancesForRule('payment-timeout');
console.log(`${instances.length} orders awaiting payment`);
```

---

## Properties

### size

```typescript
get size(): number
```

Returns the number of active pattern instances.

**Example:**

```typescript
console.log(`Active patterns: ${processor.size}`);
```

---

## Cleanup

### clear()

```typescript
clear(): void
```

Removes all active pattern instances and cancels their timers.

**Example:**

```typescript
processor.clear();
```

---

## Types

### TemporalProcessorConfig

```typescript
interface TemporalProcessorConfig {
  timerPrefix?: string;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| timerPrefix | `string` | `'temporal'` | Prefix for timer names |

### PatternInstanceState

```typescript
type PatternInstanceState = 'pending' | 'matching' | 'completed' | 'expired';
```

| State | Description |
|-------|-------------|
| `pending` | Instance created, waiting for first matching event |
| `matching` | At least one event matched, waiting for more |
| `completed` | Pattern fully matched |
| `expired` | Timeout reached without completing |

### PatternInstance

```typescript
interface PatternInstance {
  id: string;
  ruleId: string;
  pattern: TemporalPattern;
  state: PatternInstanceState;
  matchedEvents: Event[];
  startedAt: number;
  expiresAt: number;
  groupKey?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique instance identifier |
| ruleId | `string` | Associated rule identifier |
| pattern | `TemporalPattern` | The pattern being tracked |
| state | `PatternInstanceState` | Current instance state |
| matchedEvents | `Event[]` | Events matched so far |
| startedAt | `number` | Unix timestamp when instance started |
| expiresAt | `number` | Unix timestamp when instance expires |
| groupKey | `string` | Group key if pattern uses `groupBy` |

### PatternMatch

```typescript
interface PatternMatch {
  ruleId: string;
  instanceId: string;
  pattern: TemporalPattern;
  matchedEvents: Event[];
  groupKey?: string;
  aggregateValue?: number;
  count?: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| ruleId | `string` | Rule that matched |
| instanceId | `string` | Instance identifier |
| pattern | `TemporalPattern` | The matched pattern |
| matchedEvents | `Event[]` | All events in the match |
| groupKey | `string` | Group key if pattern uses `groupBy` |
| aggregateValue | `number` | Computed aggregate value (for aggregate patterns) |
| count | `number` | Event count (for count/aggregate patterns) |

---

## Pattern Types

### EventMatcher

```typescript
interface EventMatcher {
  topic: string;
  filter?: Record<string, unknown>;
  as?: string;
}
```

Defines criteria for matching events within temporal patterns.

| Field | Type | Description |
|-------|------|-------------|
| topic | `string` | Topic pattern (supports wildcards: `order.*`) |
| filter | `object` | Optional payload filter: `{ status: 'failed' }` |
| as | `string` | Alias for referencing matched event in actions |

### SequencePattern

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];
  within: string | number;
  groupBy?: string;
  strict?: boolean;
}
```

Detects events occurring in a specific order within a time window.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| type | `'sequence'` | — | Pattern type discriminator |
| events | `EventMatcher[]` | — | Ordered list of expected events |
| within | `string \| number` | — | Time window: `'5m'`, `'1h'`, `30000` |
| groupBy | `string` | — | Group by payload field (e.g., `'orderId'`) |
| strict | `boolean` | `false` | If true, no other events allowed between sequence events |

**Example: Order → Payment → Shipment**

```typescript
const pattern: SequencePattern = {
  type: 'sequence',
  events: [
    { topic: 'order.created' },
    { topic: 'payment.received' },
    { topic: 'order.shipped' }
  ],
  within: '24h',
  groupBy: 'orderId'
};
```

### AbsencePattern

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;
  expected: EventMatcher;
  within: string | number;
  groupBy?: string;
}
```

Detects when an expected event does NOT occur after a trigger event.

| Field | Type | Description |
|-------|------|-------------|
| type | `'absence'` | Pattern type discriminator |
| after | `EventMatcher` | Trigger event that starts the wait |
| expected | `EventMatcher` | Event we expect but don't receive |
| within | `string \| number` | Time window to wait |
| groupBy | `string` | Group by payload field |

**Example: Payment not received after order**

```typescript
const pattern: AbsencePattern = {
  type: 'absence',
  after: { topic: 'order.created' },
  expected: { topic: 'payment.received' },
  within: '30m',
  groupBy: 'orderId'
};
```

### CountPattern

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
  sliding?: boolean;
}
```

Detects when event count reaches a threshold within a time window.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| type | `'count'` | — | Pattern type discriminator |
| event | `EventMatcher` | — | Which events to count |
| threshold | `number` | — | Threshold value |
| comparison | `string` | `'gte'` | How to compare: `gte`, `lte`, `eq` |
| window | `string \| number` | — | Time window |
| groupBy | `string` | — | Group by payload field |
| sliding | `boolean` | `false` | Use sliding window (vs tumbling) |

**Example: 5+ failed logins in 1 minute**

```typescript
const pattern: CountPattern = {
  type: 'count',
  event: { topic: 'auth.login_failed' },
  threshold: 5,
  comparison: 'gte',
  window: '1m',
  groupBy: 'userId'
};
```

### AggregatePattern

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
}
```

Applies aggregation functions over event payload values.

| Field | Type | Description |
|-------|------|-------------|
| type | `'aggregate'` | Pattern type discriminator |
| event | `EventMatcher` | Which events to aggregate |
| field | `string` | Payload field to aggregate (dot notation) |
| function | `string` | Aggregation: `sum`, `avg`, `min`, `max`, `count` |
| threshold | `number` | Threshold value |
| comparison | `string` | How to compare: `gte`, `lte`, `eq` |
| window | `string \| number` | Time window |
| groupBy | `string` | Group by payload field |

**Example: Total purchases > $1000 in 1 hour**

```typescript
const pattern: AggregatePattern = {
  type: 'aggregate',
  event: { topic: 'order.completed' },
  field: 'amount',
  function: 'sum',
  threshold: 1000,
  comparison: 'gte',
  window: '1h',
  groupBy: 'customerId'
};
```

### TemporalPattern

```typescript
type TemporalPattern =
  | SequencePattern
  | AbsencePattern
  | CountPattern
  | AggregatePattern;
```

Union type of all temporal pattern types.

---

## Pattern Behavior

### Grouping with groupBy

When `groupBy` is specified, separate pattern instances are maintained for each unique value of that field. This enables per-entity tracking (e.g., per order, per user).

```typescript
// Each orderId gets its own pattern instance
const pattern: AbsencePattern = {
  type: 'absence',
  after: { topic: 'order.created' },
  expected: { topic: 'payment.received' },
  within: '30m',
  groupBy: 'orderId'  // event.data.orderId
};
```

### Strict Sequences

With `strict: true`, a sequence fails if any non-matching event arrives between expected events (for the same group).

```typescript
const pattern: SequencePattern = {
  type: 'sequence',
  events: [
    { topic: 'step.one' },
    { topic: 'step.two' }
  ],
  within: '5m',
  strict: true  // 'step.other' between one and two fails the sequence
};
```

### Event Filtering

Use `filter` to match only events with specific payload values:

```typescript
const pattern: CountPattern = {
  type: 'count',
  event: {
    topic: 'order.*',
    filter: { status: 'failed' }  // only failed orders
  },
  threshold: 3,
  comparison: 'gte',
  window: '1h',
  groupBy: 'customerId'
};
```

---

## Duration Syntax

Time windows accept duration strings or milliseconds:

| Format | Example | Milliseconds |
|--------|---------|--------------|
| Milliseconds | `500` | 500 |
| Seconds | `'30s'` | 30000 |
| Minutes | `'5m'` | 300000 |
| Hours | `'1h'` | 3600000 |
| Days | `'1d'` | 86400000 |
| Combined | `'1h30m'` | 5400000 |

---

## See Also

- [RuleManager](./05-rule-manager.md) — Rule storage with temporal index
- [EventStore](./03-event-store.md) — Event persistence for time-range queries
- [TimerManager](./04-timer-manager.md) — Timer scheduling for timeouts
- [DSL Triggers](./10-dsl-triggers.md) — Fluent builders for temporal patterns
- [CEP Patterns](../learn/08-complex-event-processing/01-introduction.md) — Tutorial
