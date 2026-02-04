# TimerManager

Timer scheduling with support for repeating timers and durable persistence. Used by RuleEngine internally for scheduled actions; access via `engine.getTimerManager()` for debugging or manual timer control.

## Import

```typescript
import { TimerManager } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: TimerManagerConfig): Promise<TimerManager>
```

Creates a new TimerManager instance. Without adapter, uses in-memory setTimeout (non-durable). With adapter, uses DurableTimerService from `@hamicek/noex` for timers that survive process restarts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `TimerManagerConfig` | no | Manager configuration |

**Returns:** `Promise<TimerManager>` — manager instance

**Example:**

```typescript
// In-memory mode (non-durable)
const manager = await TimerManager.start();

// Durable mode (survives restarts)
const manager = await TimerManager.start({
  adapter: new FileAdapter('./data'),
  checkIntervalMs: 1000,
});
```

---

## Methods

### onExpire()

```typescript
onExpire(callback: TimerCallback): void
```

Registers a callback to be invoked when any timer expires. Only one callback can be registered; subsequent calls replace the previous callback.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| callback | `TimerCallback` | yes | Function to call on expiration |

**Returns:** `void`

**Example:**

```typescript
manager.onExpire(async (timer) => {
  console.log(`Timer ${timer.name} expired`);
  await processExpiredTimer(timer);
});
```

### setTimer()

```typescript
async setTimer(config: TimerConfig, correlationId?: string): Promise<Timer>
```

Creates a new timer. If a timer with the same name already exists, it is cancelled first.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `TimerConfig` | yes | Timer configuration |
| correlationId | `string` | no | Optional ID for correlation tracking |

**Returns:** `Promise<Timer>` — created timer

**Example:**

```typescript
// One-shot timer
const timer = await manager.setTimer({
  name: 'payment-timeout:ORD-123',
  duration: '15m',
  onExpire: {
    topic: 'payment.timeout',
    data: { orderId: 'ORD-123' },
  },
});

// Repeating timer with limit
const heartbeat = await manager.setTimer({
  name: 'session-heartbeat:user-abc',
  duration: '30s',
  onExpire: {
    topic: 'session.heartbeat',
    data: { userId: 'user-abc' },
  },
  repeat: {
    interval: '30s',
    maxCount: 10,
  },
});
```

### cancelTimer()

```typescript
async cancelTimer(name: string): Promise<boolean>
```

Cancels a timer by name.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer name |

**Returns:** `Promise<boolean>` — true if timer was found and cancelled

**Example:**

```typescript
const cancelled = await manager.cancelTimer('payment-timeout:ORD-123');
if (cancelled) {
  console.log('Timer cancelled');
}
```

### getTimer()

```typescript
getTimer(name: string): Timer | undefined
```

Returns a timer by its name.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer name |

**Returns:** `Timer | undefined` — timer or undefined if not found

**Example:**

```typescript
const timer = manager.getTimer('payment-timeout:ORD-123');
if (timer) {
  const remaining = timer.expiresAt - Date.now();
  console.log(`Expires in ${remaining}ms`);
}
```

### getAll()

```typescript
getAll(): Timer[]
```

Returns all active timers.

**Returns:** `Timer[]` — array of active timers

**Example:**

```typescript
const timers = manager.getAll();
console.log(`Active timers: ${timers.length}`);
for (const timer of timers) {
  console.log(`- ${timer.name}: expires at ${new Date(timer.expiresAt)}`);
}
```

### stop()

```typescript
async stop(): Promise<void>
```

Stops all timers and releases resources. In durable mode, also stops the underlying DurableTimerService.

**Returns:** `Promise<void>`

**Example:**

```typescript
await manager.stop();
```

---

## Properties

### size

```typescript
get size(): number
```

Returns the number of active timers.

**Example:**

```typescript
console.log(`Active timers: ${manager.size}`);
```

---

## Types

### Timer

```typescript
interface Timer {
  id: string;
  name: string;
  expiresAt: number;
  onExpire: {
    topic: string;
    data: Record<string, unknown>;
  };
  repeat?: {
    interval: number;
    maxCount?: number;
  };
  correlationId?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique timer identifier |
| name | `string` | Logical name for lookup and cancellation |
| expiresAt | `number` | Unix timestamp when timer expires |
| onExpire.topic | `string` | Event topic to emit on expiration |
| onExpire.data | `Record<string, unknown>` | Event payload |
| repeat.interval | `number` | Repeat interval in milliseconds |
| repeat.maxCount | `number` | Maximum repeat count (undefined = infinite) |
| correlationId | `string` | Optional correlation ID for tracking |

### TimerConfig

```typescript
interface TimerConfig {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data: Record<string, unknown | { ref: string }>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Unique timer name (used for cancellation) |
| duration | `string \| number` | Duration until expiration (see Duration Syntax) |
| onExpire.topic | `string` | Event topic to emit |
| onExpire.data | `Record<string, unknown>` | Event payload (supports `{ ref: string }` for dynamic values) |
| repeat.interval | `string \| number` | Repeat interval (see Duration Syntax) |
| repeat.maxCount | `number` | Maximum repeat count |

### TimerManagerConfig

```typescript
interface TimerManagerConfig {
  adapter?: StorageAdapter;
  checkIntervalMs?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter for durable mode |
| checkIntervalMs | `number` | `1000` | Interval for checking expired timers (durable mode) |

### TimerCallback

```typescript
type TimerCallback = (timer: Timer) => void | Promise<void>;
```

Callback function invoked when a timer expires.

---

## Duration Syntax

Durations can be specified as a number (milliseconds) or as a string with a unit suffix:

| Unit | Meaning | Example | Milliseconds |
|------|---------|---------|--------------|
| `ms` | Milliseconds | `500ms` | 500 |
| `s` | Seconds | `30s` | 30,000 |
| `m` | Minutes | `15m` | 900,000 |
| `h` | Hours | `2h` | 7,200,000 |
| `d` | Days | `7d` | 604,800,000 |
| `w` | Weeks | `1w` | 604,800,000 |
| `y` | Years | `1y` | 31,536,000,000 |

**Examples:**

```typescript
'30s'    // 30 seconds
'15m'    // 15 minutes
'2h'     // 2 hours
'7d'     // 7 days
5000     // 5000 milliseconds
```

---

## Operating Modes

### In-Memory Mode (Default)

Without a storage adapter, TimerManager uses `setTimeout` for scheduling:

- Timers are lost on process restart
- Suitable for development and short-lived processes
- Lower overhead

```typescript
const manager = await TimerManager.start();
```

### Durable Mode

With a storage adapter, TimerManager uses DurableTimerService from `@hamicek/noex`:

- Timers survive process restarts
- Suitable for production workloads
- Automatic recovery on startup

```typescript
import { FileAdapter } from '@hamicek/noex';

const manager = await TimerManager.start({
  adapter: new FileAdapter('./data/timers'),
  checkIntervalMs: 500, // Check every 500ms
});
```

**Recovery behavior:**

On startup in durable mode, TimerManager:
1. Loads persisted timer metadata
2. Reschedules timers with correct remaining time
3. Continues from where it left off

---

## Timer Naming Convention

Use descriptive names with context identifiers for easy management:

```typescript
// Pattern: {purpose}:{entity-id}
'payment-timeout:ORD-123'
'session-heartbeat:user-abc'
'retry:webhook:hook-456'
'escalation:ticket-789'
```

This allows:
- Easy lookup: `manager.getTimer('payment-timeout:ORD-123')`
- Easy cancellation: `manager.cancelTimer('payment-timeout:ORD-123')`
- Debugging: clear understanding of what each timer does

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [DSL Actions](./12-dsl-actions.md) — setTimer() and cancelTimer() actions
- [Timers](../learn/05-timers-persistence/01-timers.md) — Tutorial
