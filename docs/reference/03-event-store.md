# EventStore

In-memory event storage with correlation, topic indexing, and time-range queries. Used by RuleEngine internally for CEP (Complex Event Processing) patterns; access via `engine.getEventStore()` for debugging or analysis.

## Import

```typescript
import { EventStore } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: EventStoreConfig): Promise<EventStore>
```

Creates a new EventStore instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `EventStoreConfig` | no | Store configuration |

**Returns:** `Promise<EventStore>` — store instance

**Example:**

```typescript
const store = await EventStore.start({
  maxEvents: 50000,
  maxAgeMs: 12 * 60 * 60 * 1000, // 12 hours
});
```

---

## Methods

### store()

```typescript
store(event: Event): void
```

Stores an event and indexes it by correlation ID and topic. Automatically prunes oldest events when `maxEvents` limit is exceeded.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| event | `Event` | yes | Event to store |

**Returns:** `void`

**Example:**

```typescript
store.store({
  id: 'evt-001',
  topic: 'order.created',
  data: { orderId: 'ORD-123', amount: 99.99 },
  timestamp: Date.now(),
  source: 'order-service',
  correlationId: 'session-abc',
});
```

### get()

```typescript
get(id: string): Event | undefined
```

Returns an event by its ID.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | `string` | yes | Event ID |

**Returns:** `Event | undefined` — event or undefined if not found

**Example:**

```typescript
const event = store.get('evt-001');
if (event) {
  console.log(`Topic: ${event.topic}, Data:`, event.data);
}
```

### getByCorrelation()

```typescript
getByCorrelation(correlationId: string): Event[]
```

Finds all events sharing the same correlation ID. Useful for tracing related events across a workflow or user session.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| correlationId | `string` | yes | Correlation ID |

**Returns:** `Event[]` — events with matching correlation ID

**Example:**

```typescript
const sessionEvents = store.getByCorrelation('session-abc');
console.log(`Found ${sessionEvents.length} events in session`);
```

### getByTopic()

```typescript
getByTopic(topic: string): Event[]
```

Returns all events for a specific topic.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic |

**Returns:** `Event[]` — events with matching topic

**Example:**

```typescript
const orderEvents = store.getByTopic('order.created');
```

### getByTopicPattern()

```typescript
getByTopicPattern(pattern: string): Event[]
```

Returns events matching a topic pattern with wildcard support. Results are sorted by timestamp (oldest first).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| pattern | `string` | yes | Topic pattern with wildcards |

**Returns:** `Event[]` — matching events sorted by timestamp

**Pattern syntax:**

| Pattern | Matches |
|---------|---------|
| `order.*` | `order.created`, `order.shipped` (single segment) |
| `order.**` | `order.created`, `order.item.added` (any depth) |
| `*.created` | `order.created`, `user.created` |
| `**` | All events |

**Example:**

```typescript
// All order-related events
const orderEvents = store.getByTopicPattern('order.*');

// All events in payment namespace (any depth)
const paymentEvents = store.getByTopicPattern('payment.**');
```

### getInTimeRange()

```typescript
getInTimeRange(topic: string, from: number, to: number): Event[]
```

Finds events within a time range for a specific topic.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic |
| from | `number` | yes | Start timestamp (inclusive) |
| to | `number` | yes | End timestamp (inclusive) |

**Returns:** `Event[]` — events within the time range

**Example:**

```typescript
const now = Date.now();
const lastHour = now - 60 * 60 * 1000;
const recentOrders = store.getInTimeRange('order.created', lastHour, now);
```

### countInWindow()

```typescript
countInWindow(topic: string, windowMs: number): number
```

Counts events for a topic within a sliding time window ending at current time.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic |
| windowMs | `number` | yes | Window size in milliseconds |

**Returns:** `number` — count of events in window

**Example:**

```typescript
// Count login attempts in last 5 minutes
const loginCount = store.countInWindow('user.login', 5 * 60 * 1000);
if (loginCount > 10) {
  console.log('High login activity detected');
}
```

### getAllEvents()

```typescript
getAllEvents(): Event[]
```

Returns all stored events sorted by timestamp (oldest first).

**Returns:** `Event[]` — all events sorted by timestamp

### prune()

```typescript
prune(maxAgeMs: number): number
```

Removes events older than the specified age.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| maxAgeMs | `number` | yes | Maximum age in milliseconds |

**Returns:** `number` — count of pruned events

**Example:**

```typescript
// Remove events older than 1 hour
const pruned = store.prune(60 * 60 * 1000);
console.log(`Pruned ${pruned} old events`);
```

### clear()

```typescript
clear(): void
```

Removes all events and clears all indexes.

---

## Properties

### size

```typescript
get size(): number
```

Returns the number of stored events.

**Example:**

```typescript
console.log(`Events count: ${store.size}`);
```

---

## Types

### Event

```typescript
interface Event {
  id: string;
  topic: string;
  data: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  source: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique event identifier |
| topic | `string` | Event topic (e.g., `order.created`, `payment.received`) |
| data | `Record<string, unknown>` | Event payload |
| timestamp | `number` | Unix timestamp when event occurred |
| correlationId | `string` | Optional ID linking related events |
| causationId | `string` | Optional ID of the event that caused this one |
| source | `string` | Identifier of the event producer |

### EventStoreConfig

```typescript
interface EventStoreConfig {
  name?: string;
  maxEvents?: number;
  maxAgeMs?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | `string` | — | Store name for logging |
| maxEvents | `number` | `10000` | Maximum events in memory (auto-prunes 10% when exceeded) |
| maxAgeMs | `number` | `86400000` (24h) | Maximum event age for auto-pruning |

---

## Automatic Pruning

EventStore automatically manages memory by pruning old events:

1. **Capacity pruning**: When `maxEvents` is exceeded, the oldest 10% of events are removed
2. **Age pruning**: Use `prune(maxAgeMs)` to manually remove events older than a threshold

**Example configuration:**

```typescript
const store = await EventStore.start({
  maxEvents: 100000,    // Keep max 100k events
  maxAgeMs: 3600000,    // Events expire after 1 hour
});
```

---

## Indexing

EventStore maintains three indexes for efficient queries:

| Index | Lookup | Use Case |
|-------|--------|----------|
| Primary (by ID) | O(1) | `get(id)` |
| By correlation | O(1) + O(k) | `getByCorrelation()` |
| By topic | O(1) + O(k) | `getByTopic()`, `getInTimeRange()` |

Where k = number of events matching the correlation/topic.

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [FactStore](./02-fact-store.md) — Fact storage
- [TemporalProcessor](./06-temporal-processor.md) — CEP patterns
- [Rules and Events](../learn/02-getting-started/02-rules-and-events.md) — Tutorial
