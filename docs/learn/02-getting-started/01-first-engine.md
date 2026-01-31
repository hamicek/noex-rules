# Your First Rule Engine

In this chapter, you'll install noex-rules, create a running engine, and verify it works. By the end, you'll have a fully functional engine processing events and executing rules.

## What You'll Learn

- How to install noex-rules and set up TypeScript
- How to create and start an engine with `RuleEngine.start()`
- What configuration options are available
- How to check engine status and shut down cleanly

## Installation

Install the package:

```bash
npm install @hamicek/noex-rules
```

noex-rules is written in TypeScript and ships with type declarations. No additional `@types` package needed.

### TypeScript Configuration

Ensure your `tsconfig.json` has these settings:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  }
}
```

The engine uses async/await and ESM imports, so `ES2022` or later is recommended.

## Starting the Engine

The entry point is `RuleEngine.start()` — a static factory method that creates and initializes the engine:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();
```

That's it. You now have a running engine with sensible defaults. The `start()` method is async because it initializes internal stores and, if configured, loads persisted state.

### With Configuration

Pass a config object to customize behavior:

```typescript
const engine = await RuleEngine.start({
  name: 'my-app',
  maxConcurrency: 20,
  debounceMs: 50,
});
```

### Configuration Options

| Option | Default | Purpose |
|--------|---------|---------|
| `name` | `'rule-engine'` | Instance name, useful when running multiple engines |
| `maxConcurrency` | `10` | Maximum parallel rule evaluations |
| `debounceMs` | `0` | Debounce delay for fact changes (ms) |
| `services` | `{}` | External services for `call_service` actions |
| `tracing` | — | Enable debug tracing |
| `persistence` | — | Persist rules and facts to storage |
| `timerPersistence` | — | Persist timers across restarts |
| `audit` | — | Audit logging for rule changes |
| `versioning` | — | Rule version history and rollback |
| `hotReload` | — | Auto-reload rules from files |
| `metrics` | — | Prometheus metrics collection |
| `opentelemetry` | — | OpenTelemetry tracing integration |
| `baseline` | — | Baseline anomaly detection |
| `backwardChaining` | — | Enable goal-driven queries |

We'll cover the advanced options in later chapters. For now, `name` and `maxConcurrency` are all you need.

## Engine Lifecycle

```text
  RuleEngine.start(config)
         │
         ▼
  ┌─────────────────┐
  │  Engine Running  │◄──── engine.isRunning === true
  │                  │
  │  • Register rules│
  │  • Emit events   │
  │  • Set facts     │
  │  • Set timers    │
  └────────┬────────┘
           │
    engine.stop()
           │
           ▼
  ┌─────────────────┐
  │  Engine Stopped  │◄──── engine.isRunning === false
  │                  │
  │  Timers cleared  │
  │  Listeners freed │
  └─────────────────┘
```

### Checking Status

```typescript
if (engine.isRunning) {
  console.log('Engine is active');
}
```

### Engine Statistics

The engine tracks key metrics from the moment it starts:

```typescript
const stats = engine.getStats();
console.log(stats);
// {
//   rulesCount: 0,
//   factsCount: 0,
//   timersCount: 0,
//   eventsProcessed: 0,
//   rulesExecuted: 0,
//   avgProcessingTimeMs: 0,
// }
```

### Stopping the Engine

Always stop the engine when you're done. This clears all timers, flushes pending operations, and releases resources:

```typescript
await engine.stop();
```

After `stop()`, calling `emit()`, `setFact()`, or `setTimer()` will have no effect.

## Complete Working Example

A minimal script that starts an engine, registers one rule, processes one event, and shuts down:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  // 1. Start the engine
  const engine = await RuleEngine.start({
    name: 'hello-rules',
  });

  console.log('Engine started:', engine.isRunning);
  // Engine started: true

  // 2. Register a simple rule
  engine.registerRule({
    id: 'hello-world',
    name: 'Hello World Rule',
    priority: 100,
    enabled: true,
    tags: ['demo'],
    trigger: { type: 'event', topic: 'greeting' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Hello from the rule engine! Received: ${event.name}',
      },
    ],
  });

  console.log('Rules registered:', engine.getStats().rulesCount);
  // Rules registered: 1

  // 3. Subscribe to all events
  engine.subscribe('*', (event) => {
    console.log(`Event: ${event.topic}`, event.data);
  });

  // 4. Emit an event to trigger the rule
  await engine.emit('greeting', { name: 'World' });

  // 5. Check statistics
  const stats = engine.getStats();
  console.log('Events processed:', stats.eventsProcessed);
  console.log('Rules executed:', stats.rulesExecuted);

  // 6. Shut down
  await engine.stop();
  console.log('Engine stopped:', !engine.isRunning);
}

main();
```

### What Happens Step by Step

1. `RuleEngine.start()` creates the engine and initializes all internal stores
2. `registerRule()` adds a rule that triggers on the `greeting` topic
3. `subscribe('*', ...)` registers a listener for all events (including engine-internal ones)
4. `emit('greeting', { name: 'World' })` sends an event into the engine
5. The engine matches the event topic against all rule triggers
6. The "Hello World Rule" matches, its (empty) conditions pass, and its log action executes
7. `stop()` tears down the engine cleanly

## Exercise

Create a script that:

1. Starts an engine named `'exercise-01'` with `maxConcurrency: 5`
2. Registers two rules:
   - Rule A: triggers on `app.start`, logs "Application started"
   - Rule B: triggers on `app.stop`, logs "Application shutting down"
3. Emits `app.start`, then `app.stop`
4. Prints `engine.getStats()` before shutting down
5. Stops the engine

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({
    name: 'exercise-01',
    maxConcurrency: 5,
  });

  engine.registerRule({
    id: 'app-start-log',
    name: 'Log App Start',
    priority: 100,
    enabled: true,
    tags: ['lifecycle'],
    trigger: { type: 'event', topic: 'app.start' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Application started',
      },
    ],
  });

  engine.registerRule({
    id: 'app-stop-log',
    name: 'Log App Stop',
    priority: 100,
    enabled: true,
    tags: ['lifecycle'],
    trigger: { type: 'event', topic: 'app.stop' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Application shutting down',
      },
    ],
  });

  await engine.emit('app.start', {});
  await engine.emit('app.stop', {});

  console.log(engine.getStats());
  // { rulesCount: 2, eventsProcessed: 2, rulesExecuted: 2, ... }

  await engine.stop();
}

main();
```

Both rules trigger on different topics and execute independently. The stats show 2 events processed and 2 rules executed.

</details>

## Summary

- Install with `npm install @hamicek/noex-rules` — no extra type packages needed
- `RuleEngine.start(config)` is the single entry point — it returns a running engine
- `name` and `maxConcurrency` are the most common config options
- `engine.isRunning` checks whether the engine is active
- `engine.getStats()` provides runtime metrics: rule count, event count, execution time
- `engine.stop()` shuts down cleanly — always call it when done
- The engine is fully async: `start()`, `emit()`, `setFact()`, and `stop()` return promises

---

Next: [Rules and Events](./02-rules-and-events.md)
