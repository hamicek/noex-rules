# Debugging Rules

When a rule doesn't fire and you don't know why, you need to see inside the engine. noex-rules provides three debugging tools that work together: **TraceCollector** records every evaluation step into a ring buffer with fast correlation-based lookups, **DebugController** adds IDE-like breakpoints and snapshots on top of traces, and **HistoryService** lets you explore event context and follow causation chains backwards.

## What You'll Learn

- How to enable `TraceCollector` and record trace entries
- All 16 trace entry types and what they capture
- How to query traces by correlation, rule, type, and time range
- Using `DebugController` for breakpoints, pause/resume, and snapshots
- Exploring event history and causation chains with `HistoryService`
- Exporting traces as JSON or Mermaid diagrams

## TraceCollector

The trace collector is a ring buffer that records every internal engine step — rule triggers, condition evaluations, action executions, fact changes, timer operations, and more. It uses multi-index data structures for fast lookups by correlation ID, rule ID, or entry type.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│  Ring Buffer     │
  │               │     │                 │     │  (max 10,000)    │
  └──────────────┘     └────────┬────────┘     └──────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────▼─────┐ ┌──▼──────┐ ┌──▼──────────┐
              │ By corr.  │ │ By rule │ │ By type     │
              │ ID index  │ │ index   │ │ index       │
              └───────────┘ └─────────┘ └─────────────┘
```

### Enabling Tracing

Pass `tracing` to `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  tracing: {
    enabled: true,      // Enable trace collection
    maxEntries: 10_000, // Ring buffer size (default: 10,000)
  },
});
```

When the buffer is full, the oldest entries are overwritten. This keeps memory bounded regardless of how long the engine runs.

### Trace Entry Types

Every recorded entry has a `type` field that categorizes what happened:

| Type | When recorded |
|------|---------------|
| `rule_triggered` | A rule's trigger matched an event/fact/timer |
| `rule_executed` | A rule's conditions passed and actions ran |
| `rule_skipped` | A rule's conditions evaluated to false |
| `condition_evaluated` | A single condition was checked (pass/fail) |
| `action_started` | An action began execution |
| `action_completed` | An action finished successfully |
| `action_failed` | An action threw an error |
| `fact_changed` | A fact was set or deleted |
| `event_emitted` | An event was emitted (including from actions) |
| `timer_set` | A timer was created |
| `timer_cancelled` | A timer was cancelled |
| `timer_expired` | A timer fired |
| `lookup_resolved` | A data requirement lookup completed |
| `backward_goal_evaluated` | A backward chaining goal was evaluated |
| `backward_rule_explored` | A backward chaining rule was explored |

### Trace Entry Structure

Each entry carries context about what happened:

```typescript
interface DebugTraceEntry {
  id: string;                          // Unique entry ID
  timestamp: number;                   // When it happened
  type: TraceEntryType;                // One of the 16 types above
  correlationId?: string;              // Links related entries together
  causationId?: string;                // What directly caused this entry
  ruleId?: string;                     // Which rule was involved
  ruleName?: string;                   // Human-readable rule name
  details: Record<string, unknown>;    // Type-specific payload
  durationMs?: number;                 // How long it took (for timed entries)
}
```

The `correlationId` is the key to understanding trace data. When an event triggers a rule, the event's correlation ID propagates through all resulting traces — rule evaluation, condition checks, actions, emitted events, and any cascading rule triggers.

### Querying Traces

The collector provides multiple query methods:

```typescript
// Get all traces for a specific event processing chain
const chain = engine.traceCollector.getByCorrelation('corr-123');

// Get all traces for a specific rule
const ruleTraces = engine.traceCollector.getByRule('fraud-check');

// Get all action failures
const failures = engine.traceCollector.getByType('action_failed');

// Get the 50 most recent entries
const recent = engine.traceCollector.getRecent(50);

// Flexible query with multiple filters
const results = engine.traceCollector.query({
  ruleId: 'fraud-check',
  types: ['rule_executed', 'action_failed'],
  fromTimestamp: Date.now() - 60_000,  // Last minute
  limit: 100,
});
```

### Real-Time Subscription

Subscribe to trace entries as they're recorded:

```typescript
const unsubscribe = engine.traceCollector.subscribe((entry) => {
  if (entry.type === 'action_failed') {
    console.error(`Action failed in rule ${entry.ruleId}:`, entry.details);
  }
});

// Later: stop receiving entries
unsubscribe();
```

## DebugController

The debug controller provides IDE-like debugging capabilities: breakpoints, pause/resume, and engine state snapshots. It's designed for development-time use where you want to stop the engine at specific points and inspect its state.

### Debug Sessions

All debugging happens within sessions. A session holds breakpoints, snapshots, and execution state:

```typescript
// Create a debug session
const session = engine.debugController.createSession();
console.log(session.id); // 'debug-session-abc123'

// List all active sessions
const sessions = engine.debugController.getSessions();

// End a session (cleans up breakpoints)
engine.debugController.endSession(session.id);
```

### Breakpoints

Breakpoints halt or log when specific conditions are met. Four breakpoint types target different engine operations:

| Type | Condition field | Matches when |
|------|----------------|--------------|
| `rule` | `ruleId` | A specific rule is triggered |
| `event` | `topic` | An event with the given topic is processed |
| `fact` | `factPattern` | A fact matching the pattern changes |
| `action` | `actionType` | An action of the given type executes |

Each breakpoint has an action: `pause` stops execution, `log` records a trace entry, or `snapshot` captures engine state.

```typescript
// Pause when a specific rule triggers
engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'fraud-check' },
  action: 'pause',
});

// Log when any payment event arrives
engine.debugController.addBreakpoint(session.id, {
  type: 'event',
  condition: { topic: 'payment.*' },
  action: 'log',
});

// Take a snapshot when any fact matching 'user:*' changes
engine.debugController.addBreakpoint(session.id, {
  type: 'fact',
  condition: { factPattern: 'user:*' },
  action: 'snapshot',
});
```

### Pause, Resume, and Step

When a `pause` breakpoint fires, the engine pauses:

```typescript
// Check if the engine is paused
if (engine.debugController.isPaused()) {
  // Get the session to see which breakpoint was hit
  const session = engine.debugController.getSession(sessionId);
  console.log(`Paused: ${session.paused}, Total hits: ${session.totalHits}`);

  // Resume execution
  engine.debugController.resume(sessionId);

  // Or step to the next breakpoint
  engine.debugController.step(sessionId);
}
```

### Snapshots

A snapshot captures the current engine state — all facts and recent traces — at a point in time:

```typescript
// Take a manual snapshot
const snapshot = engine.debugController.takeSnapshot(session.id, 'before-fraud-check');

console.log(snapshot.facts);         // Array of { key, value } pairs
console.log(snapshot.recentTraces);  // Recent DebugTraceEntry[]
console.log(snapshot.label);         // 'before-fraud-check'
console.log(snapshot.timestamp);     // When the snapshot was taken

// Retrieve a snapshot later
const retrieved = engine.debugController.getSnapshot(session.id, snapshot.id);

// Clear all snapshots
engine.debugController.clearSnapshots(session.id);
```

## HistoryService

The history service provides event-level querying with full trace context. While the trace collector operates at the entry level, the history service answers higher-level questions: "What rules did this event trigger?" and "What caused this event to be emitted?"

### Querying Event History

```typescript
// Find recent events for a topic
const result = engine.historyService.query({
  topic: 'order.created',
  from: Date.now() - 3600_000,  // Last hour
  limit: 20,
  includeContext: true,          // Attach trace and rule data
});

for (const event of result.events) {
  console.log(`${event.topic} at ${event.timestamp}`);
  // With includeContext, each event has:
  console.log(`  Triggered rules: ${event.triggeredRules?.length}`);
  console.log(`  Caused events: ${event.causedEvents?.length}`);
}
```

### Correlation Timelines

Build a merged timeline of events and traces for a correlation ID:

```typescript
const timeline = engine.historyService.getCorrelationTimeline('corr-456');

for (const entry of timeline) {
  const indent = '  '.repeat(entry.depth);
  if (entry.type === 'event') {
    console.log(`${indent}[EVENT] ${entry.entry.topic}`);
  } else {
    console.log(`${indent}[TRACE] ${entry.entry.type}: ${entry.entry.ruleName}`);
  }
}
```

### Causation Chains

Follow the chain of events backwards to find root causes:

```typescript
// Start from an alert event and trace back to the original trigger
const chain = engine.historyService.getCausationChain('event-789');

for (const event of chain) {
  console.log(`${event.topic} -> caused by: ${event.causationId}`);
}
```

### Exporting Traces

Export a correlation chain for external analysis:

```typescript
// Export as structured JSON
const jsonExport = engine.historyService.exportTrace('corr-456', 'json');

// Export as a Mermaid sequence diagram
const mermaid = engine.historyService.exportTrace('corr-456', 'mermaid');
console.log(mermaid);
// sequenceDiagram
//   participant E as Events
//   participant R as Rules
//   E->>R: order.created
//   R->>E: payment.requested
//   ...
```

## Complete Example: Debugging a Fraud Detection Pipeline

This example demonstrates using all three debugging tools together to investigate why a fraud alert didn't fire:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

// Start engine with tracing enabled
const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 50_000 },
});

// --- Register fraud detection rules ---

engine.registerRule(
  Rule.create('velocity-check')
    .name('Transaction Velocity Check')
    .priority(10)
    .when(onEvent('transaction.completed'))
    .if(fact('user:${event.userId}:txCount30m').gt(5))
    .then(emit('fraud.velocity_alert', {
      userId: ref('event.userId'),
      amount: ref('event.amount'),
      txCount: ref('fact.value'),
    }))
    .also(log('Velocity alert for user ${event.userId}: ${fact.value} txns in 30m'))
    .build()
);

engine.registerRule(
  Rule.create('tx-counter')
    .name('Transaction Counter')
    .priority(20)
    .when(onEvent('transaction.completed'))
    .then(setFact(
      'user:${event.userId}:txCount30m',
      '${(parseInt(fact.value || "0") + 1)}'
    ))
    .build()
);

// --- Set up a debug session ---

const session = engine.debugController.createSession();

// Pause when the velocity check triggers
engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'velocity-check' },
  action: 'snapshot',
});

// Subscribe to real-time trace failures
engine.traceCollector.subscribe((entry) => {
  if (entry.type === 'rule_skipped' && entry.ruleId === 'velocity-check') {
    console.log('Velocity check skipped — conditions not met');
    console.log('Details:', JSON.stringify(entry.details, null, 2));
  }
});

// --- Simulate transactions ---

for (let i = 0; i < 7; i++) {
  await engine.emit('transaction.completed', {
    userId: 'u-42',
    amount: 150,
    merchant: 'online-store',
  });
}

// --- Investigate with traces ---

// Find all traces for the velocity-check rule
const velocityTraces = engine.traceCollector.getByRule('velocity-check');
console.log(`Velocity check traces: ${velocityTraces.length}`);

const executed = velocityTraces.filter(t => t.type === 'rule_executed');
const skipped = velocityTraces.filter(t => t.type === 'rule_skipped');
console.log(`  Executed: ${executed.length}, Skipped: ${skipped.length}`);
// Executed: 1, Skipped: 6
// (Only the 7th transaction exceeds the threshold of 5)

// --- Check profiling data ---

const profile = engine.profiler.getRuleProfile('velocity-check');
if (profile) {
  console.log(`Pass rate: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`Avg evaluation time: ${profile.avgTimeMs.toFixed(2)}ms`);
}

// --- Inspect snapshots ---

const snapshots = engine.debugController.getSession(session.id)?.snapshots;
if (snapshots?.length) {
  const snap = snapshots[0];
  console.log(`Snapshot "${snap.label}" at ${new Date(snap.timestamp).toISOString()}`);
  console.log(`Facts: ${snap.facts.length}`);
  for (const f of snap.facts) {
    console.log(`  ${f.key} = ${f.value}`);
  }
}

// --- Clean up ---

engine.debugController.endSession(session.id);
await engine.stop();
```

## REST API Endpoints

When the engine runs with `RuleEngineServer`, all debug features are accessible via HTTP:

### Tracing

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/debug/traces` | Get recent trace entries |
| `GET` | `/debug/tracing` | Get tracing status |
| `POST` | `/debug/tracing/enable` | Enable tracing |
| `POST` | `/debug/tracing/disable` | Disable tracing |

### Event History

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/debug/history` | Query event history |
| `GET` | `/debug/history/:eventId` | Get event with context |
| `GET` | `/debug/correlation/:id` | Get correlation chain |
| `GET` | `/debug/correlation/:id/timeline` | Visual timeline |
| `GET` | `/debug/correlation/:id/export` | Export JSON/Mermaid |

### Debug Sessions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/debug/sessions` | Create session |
| `GET` | `/debug/sessions` | Get all sessions |
| `GET` | `/debug/sessions/:id` | Get session |
| `DELETE` | `/debug/sessions/:id` | End session |
| `POST` | `/debug/sessions/:id/resume` | Resume execution |
| `POST` | `/debug/sessions/:id/step` | Step execution |
| `POST` | `/debug/sessions/:id/breakpoints` | Add breakpoint |
| `DELETE` | `/debug/sessions/:id/breakpoints/:bpId` | Remove breakpoint |
| `POST` | `/debug/sessions/:id/snapshot` | Take snapshot |
| `GET` | `/debug/sessions/:id/snapshots/:snapId` | Get snapshot |

### Live SSE Stream

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/debug/stream` | SSE stream of trace entries |
| `GET` | `/debug/stream/connections` | Active SSE connections |

The SSE stream supports query-parameter filters: `?types=rule_executed,action_failed&ruleIds=fraud-check&minDurationMs=10`.

## Exercise

Build a debugging setup for an order processing pipeline:

1. Create an engine with tracing enabled (max 20,000 entries)
2. Register three rules:
   - `order-validator` that checks if `event.total > 0` and emits `order.validated`
   - `inventory-check` that emits `order.ready` when `order.validated` is received and `fact inventory:${event.productId}:stock` is greater than 0
   - `order-fulfiller` that emits `order.fulfilled` when `order.ready` is received
3. Create a debug session with a breakpoint that takes a snapshot when `inventory-check` triggers
4. Emit an `order.created` event and use `getByCorrelation()` to trace the full processing chain
5. Check the snapshot to see the facts at the time `inventory-check` evaluated

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 20_000 },
});

// Rule 1: Validate order
engine.registerRule(
  Rule.create('order-validator')
    .name('Order Validator')
    .priority(10)
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(emit('order.validated', {
      orderId: ref('event.orderId'),
      productId: ref('event.productId'),
      total: ref('event.total'),
    }))
    .build()
);

// Rule 2: Check inventory
engine.registerRule(
  Rule.create('inventory-check')
    .name('Inventory Check')
    .priority(10)
    .when(onEvent('order.validated'))
    .if(fact('inventory:${event.productId}:stock').gt(0))
    .then(emit('order.ready', {
      orderId: ref('event.orderId'),
      productId: ref('event.productId'),
    }))
    .build()
);

// Rule 3: Fulfill order
engine.registerRule(
  Rule.create('order-fulfiller')
    .name('Order Fulfiller')
    .priority(10)
    .when(onEvent('order.ready'))
    .then(emit('order.fulfilled', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Set up debugging
const session = engine.debugController.createSession();

engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'inventory-check' },
  action: 'snapshot',
});

// Set initial inventory
engine.setFact('inventory:prod-1:stock', 10);

// Emit order
await engine.emit('order.created', {
  orderId: 'ord-100',
  productId: 'prod-1',
  total: 49.99,
});

// Trace the full chain
const events = engine.traceCollector.getRecent(50);
const correlationId = events.find(e => e.type === 'event_emitted')?.correlationId;

if (correlationId) {
  const chain = engine.traceCollector.getByCorrelation(correlationId);
  console.log(`Full chain (${chain.length} entries):`);
  for (const entry of chain) {
    const rule = entry.ruleName ? ` [${entry.ruleName}]` : '';
    console.log(`  ${entry.type}${rule} (${entry.durationMs ?? 0}ms)`);
  }
}

// Check snapshots
const sess = engine.debugController.getSession(session.id);
if (sess?.snapshots.length) {
  const snap = sess.snapshots[0];
  console.log(`\nSnapshot at inventory-check:`);
  for (const f of snap.facts) {
    console.log(`  ${f.key} = ${f.value}`);
  }
  // inventory:prod-1:stock = 10
}

engine.debugController.endSession(session.id);
await engine.stop();
```

The correlation chain shows the complete flow: `order.created` -> `order-validator` -> `order.validated` -> `inventory-check` -> `order.ready` -> `order-fulfiller` -> `order.fulfilled`. The snapshot at `inventory-check` captures the fact state at that exact point.

</details>

## Summary

- **`TraceCollector`** records every engine step into a bounded ring buffer (default 10,000 entries)
- Enable tracing via `tracing: { enabled: true }` in `RuleEngine.start()`
- **16 trace entry types** cover the full lifecycle: triggers, conditions, actions, facts, timers, and backward chaining
- **`correlationId`** links all trace entries from the same event processing chain
- Query traces by correlation, rule, type, or time range with `getByCorrelation()`, `getByRule()`, `getByType()`, and `query()`
- **`DebugController`** adds breakpoints (rule, event, fact, action) with pause, log, or snapshot actions
- **Snapshots** capture engine facts and recent traces at a point in time
- **`HistoryService`** provides event-level queries with causation chains and timeline views
- Export traces as **JSON or Mermaid diagrams** for external analysis
- All features are accessible via **REST API** endpoints when using `RuleEngineServer`

---

Next: [Profiling Performance](./02-profiling.md)
