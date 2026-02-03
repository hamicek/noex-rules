# RuleEngine

Main orchestrator connecting all rule engine components. Manages rules, facts, events, and timers with automatic forward chaining evaluation.

## Import

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: RuleEngineConfig): Promise<RuleEngine>
```

Creates and starts a new RuleEngine instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `RuleEngineConfig` | no | Engine configuration |

**Returns:** `Promise<RuleEngine>` — running engine instance

**Example:**

```typescript
const engine = await RuleEngine.start({
  name: 'my-engine',
  maxConcurrency: 5,
  services: { userService, emailService },
});
```

---

## Rule Management

### registerRule()

```typescript
registerRule(input: RuleInput, options?: { skipValidation?: boolean }): Rule
```

Registers a new rule. Input is validated before registration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input | `RuleInput` | yes | Rule definition |
| options.skipValidation | `boolean` | no | Skip validation for trusted sources (e.g., DSL builder) |

**Returns:** `Rule` — registered rule with metadata

**Throws:** `RuleValidationError` if validation fails

**Example:**

```typescript
import { Rule, onEvent, emit } from '@hamicek/noex-rules';

const rule = engine.registerRule(
  Rule.create('order-placed')
    .when(onEvent('order:created'))
    .then(emit('inventory:reserve'))
    .build()
);
```

### unregisterRule()

```typescript
unregisterRule(ruleId: string): boolean
```

Removes a rule from the engine.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |

**Returns:** `boolean` — true if rule was found and removed

### enableRule()

```typescript
enableRule(ruleId: string): boolean
```

Enables a disabled rule.

**Returns:** `boolean` — true if rule was found and enabled

### disableRule()

```typescript
disableRule(ruleId: string): boolean
```

Disables a rule without removing it.

**Returns:** `boolean` — true if rule was found and disabled

### updateRule()

```typescript
updateRule(ruleId: string, updates: Partial<RuleInput>): Rule
```

Updates an existing rule by merging with new values. Creates a single version entry.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |
| updates | `Partial<RuleInput>` | yes | Fields to update |

**Returns:** `Rule` — updated rule

**Throws:** `Error` if rule not found, `RuleValidationError` if validation fails

### rollbackRule()

```typescript
rollbackRule(ruleId: string, targetVersion: number): Rule
```

Reverts a rule to a previous version from history.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |
| targetVersion | `number` | yes | Version number to restore |

**Returns:** `Rule` — restored rule with new version number

**Throws:** `Error` if versioning not configured or version not found

### validateRule()

```typescript
validateRule(input: unknown): ValidationResult
```

Validates rule input without registering (dry-run).

**Returns:** `ValidationResult` — `{ valid: boolean, errors: ValidationIssue[], warnings: ValidationIssue[] }`

### getRule()

```typescript
getRule(ruleId: string): Rule | undefined
```

Returns a rule by ID.

### getRules()

```typescript
getRules(): Rule[]
```

Returns all registered rules.

---

## Group Management

### createGroup()

```typescript
createGroup(input: RuleGroupInput): RuleGroup
```

Creates a new rule group.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input | `RuleGroupInput` | yes | Group definition with `id`, optional `name`, `description`, `enabled` |

**Returns:** `RuleGroup` — created group

**Throws:** `RuleValidationError` if group already exists

**Example:**

```typescript
engine.createGroup({
  id: 'notifications',
  name: 'Notification Rules',
  enabled: true,
});

engine.registerRule(
  Rule.create('notify-order')
    .group('notifications')
    .when(onEvent('order:shipped'))
    .then(emit('email:send'))
    .build()
);
```

### deleteGroup()

```typescript
deleteGroup(groupId: string): boolean
```

Deletes a group. Rules in the group become ungrouped.

### enableGroup()

```typescript
enableGroup(groupId: string): boolean
```

Enables all rules in a group.

### disableGroup()

```typescript
disableGroup(groupId: string): boolean
```

Disables all rules in a group.

### updateGroup()

```typescript
updateGroup(groupId: string, updates: { name?: string; description?: string; enabled?: boolean }): RuleGroup | undefined
```

Updates group properties.

### getGroup()

```typescript
getGroup(groupId: string): RuleGroup | undefined
```

Returns a group by ID.

### getGroups()

```typescript
getGroups(): RuleGroup[]
```

Returns all groups.

### getGroupRules()

```typescript
getGroupRules(groupId: string): Rule[]
```

Returns all rules in a group.

---

## Rule Versioning

Versioning must be enabled in configuration to use these methods.

### getRuleVersions()

```typescript
getRuleVersions(ruleId: string, params?: Omit<RuleVersionQuery, 'ruleId'>): RuleVersionQueryResult
```

Queries version history with filtering and pagination.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |
| params.changeType | `RuleChangeType` | no | Filter by change type |
| params.limit | `number` | no | Max results |
| params.offset | `number` | no | Skip entries |

**Returns:** `RuleVersionQueryResult` — `{ entries: RuleVersionEntry[], total: number, hasMore: boolean }`

### getRuleVersion()

```typescript
getRuleVersion(ruleId: string, version: number): RuleVersionEntry | undefined
```

Returns a specific version entry.

### diffRuleVersions()

```typescript
diffRuleVersions(ruleId: string, fromVersion: number, toVersion: number): RuleVersionDiff | undefined
```

Returns field-level diff between two versions.

### getVersionStore()

```typescript
getVersionStore(): RuleVersionStore | null
```

Returns the version store for direct access. Null if versioning not configured.

---

## Fact Management

### setFact()

```typescript
async setFact(key: string, value: unknown): Promise<Fact>
```

Sets a fact and triggers evaluation of matching rules.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key (supports hierarchical keys like `user.123.status`) |
| value | `unknown` | yes | Fact value |

**Returns:** `Promise<Fact>` — stored fact with metadata

**Example:**

```typescript
await engine.setFact('user.123.premium', true);
await engine.setFact('cart.total', 150.00);
```

### getFact()

```typescript
getFact(key: string): unknown | undefined
```

Returns fact value by key.

### getFactFull()

```typescript
getFactFull(key: string): Fact | undefined
```

Returns complete fact with metadata (key, value, updatedAt, source).

### deleteFact()

```typescript
deleteFact(key: string): boolean
```

Deletes a fact.

### queryFacts()

```typescript
queryFacts(pattern: string): Fact[]
```

Finds facts by pattern. Supports wildcards: `user.*`, `cart.*.items`.

**Example:**

```typescript
const userFacts = engine.queryFacts('user.123.*');
const allCarts = engine.queryFacts('cart.*');
```

### getAllFacts()

```typescript
getAllFacts(): Fact[]
```

Returns all facts.

---

## Event Emission

### emit()

```typescript
async emit(topic: string, data?: Record<string, unknown>): Promise<Event>
```

Emits an event and triggers evaluation of matching rules.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic |
| data | `Record<string, unknown>` | no | Event payload |

**Returns:** `Promise<Event>` — emitted event with ID and timestamp

**Example:**

```typescript
await engine.emit('order:created', {
  orderId: 'ORD-001',
  userId: '123',
  total: 99.99,
});
```

### emitCorrelated()

```typescript
async emitCorrelated(
  topic: string,
  data: Record<string, unknown>,
  correlationId: string,
  causationId?: string
): Promise<Event>
```

Emits an event with correlation tracking for distributed tracing.

**Example:**

```typescript
await engine.emitCorrelated(
  'payment:processed',
  { amount: 99.99 },
  'txn-abc-123',
  'evt-xyz-789'
);
```

---

## Timer Management

### setTimer()

```typescript
async setTimer(config: {
  name: string;
  duration: string | number;
  onExpire: { topic: string; data: Record<string, unknown> };
  repeat?: { interval: string | number; maxCount?: number };
}): Promise<Timer>
```

Sets a timer that emits an event on expiration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer identifier |
| duration | `string \| number` | yes | Time until expiration (`'5m'`, `'1h30m'`, or ms) |
| onExpire.topic | `string` | yes | Event topic to emit |
| onExpire.data | `Record<string, unknown>` | yes | Event payload |
| repeat.interval | `string \| number` | no | Repeat interval |
| repeat.maxCount | `number` | no | Max repetitions |

**Returns:** `Promise<Timer>` — created timer

**Example:**

```typescript
await engine.setTimer({
  name: 'session-timeout',
  duration: '30m',
  onExpire: {
    topic: 'session:expired',
    data: { userId: '123' },
  },
});

// Repeating timer
await engine.setTimer({
  name: 'daily-cleanup',
  duration: '24h',
  onExpire: { topic: 'cleanup:run', data: {} },
  repeat: { interval: '24h' },
});
```

### cancelTimer()

```typescript
async cancelTimer(name: string): Promise<boolean>
```

Cancels an active timer.

### getTimer()

```typescript
getTimer(name: string): Timer | undefined
```

Returns a timer by name.

### getTimers()

```typescript
getTimers(): Timer[]
```

Returns all active timers.

---

## Subscriptions

### subscribe()

```typescript
subscribe(topicPattern: string, handler: EventHandler): Unsubscribe
```

Subscribes to events matching a topic pattern.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topicPattern | `string` | yes | Topic or pattern (`order:*`, `*`) |
| handler | `(event: Event, topic: string) => void \| Promise<void>` | yes | Event handler |

**Returns:** `() => void` — unsubscribe function

**Example:**

```typescript
const unsubscribe = engine.subscribe('order:*', (event, topic) => {
  console.log(`Received ${topic}:`, event.data);
});

// Later: unsubscribe();
```

---

## Statistics

### getStats()

```typescript
getStats(): EngineStats
```

Returns engine statistics including optional tracing, profiling, audit, versioning, and baseline data.

**Example:**

```typescript
const stats = engine.getStats();
console.log(`Rules: ${stats.rulesCount}`);
console.log(`Facts: ${stats.factsCount}`);
console.log(`Events processed: ${stats.eventsProcessed}`);
console.log(`Avg processing time: ${stats.avgProcessingTimeMs}ms`);
```

---

## Tracing

### enableTracing()

```typescript
enableTracing(): void
```

Enables debugging tracing.

### disableTracing()

```typescript
disableTracing(): void
```

Disables debugging tracing.

### isTracingEnabled()

```typescript
isTracingEnabled(): boolean
```

Returns whether tracing is enabled.

### getTraceCollector()

```typescript
getTraceCollector(): TraceCollector
```

Returns TraceCollector for direct access to trace entries.

### getEventStore()

```typescript
getEventStore(): EventStore
```

Returns EventStore for debugging and history queries.

### getFactStore()

```typescript
getFactStore(): FactStore
```

Returns FactStore for debugging and snapshots.

### getAuditLog()

```typescript
getAuditLog(): AuditLogService | null
```

Returns AuditLogService. Null if audit not configured.

---

## Profiling

### enableProfiling()

```typescript
enableProfiling(): Profiler
```

Enables performance profiling. Aggregates statistics from trace entries.

**Returns:** `Profiler` — profiler instance

### disableProfiling()

```typescript
disableProfiling(): void
```

Disables profiling and releases the profiler.

### isProfilingEnabled()

```typescript
isProfilingEnabled(): boolean
```

Returns whether profiling is enabled.

### getProfiler()

```typescript
getProfiler(): Profiler | null
```

Returns Profiler for direct access. Null if profiling not enabled.

---

## Baseline (Anomaly Detection)

### getBaselineStore()

```typescript
getBaselineStore(): BaselineStore | null
```

Returns BaselineStore. Null if baseline not configured.

### getBaseline()

```typescript
getBaseline(metricName: string, groupKey?: string): BaselineStats | undefined
```

Returns baseline statistics for a metric.

### recalculateBaseline()

```typescript
async recalculateBaseline(metricName: string, groupKey?: string): Promise<BaselineStats>
```

Forces baseline recalculation.

**Throws:** `Error` if baseline not configured or metric not found

---

## Backward Chaining

### query()

```typescript
query(goal: Goal | GoalBuilder): QueryResult
```

Performs backward chaining query. Determines if a goal is achievable from current facts and rules.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| goal | `Goal \| GoalBuilder` | yes | Target goal (raw or from DSL) |

**Returns:** `QueryResult` — `{ achievable, proof, exploredRules, maxDepthReached, durationMs }`

**Example:**

```typescript
import { factGoal } from '@hamicek/noex-rules';

const result = engine.query(
  factGoal('user.123.premium').equals(true)
);

if (result.achievable) {
  console.log('Goal is achievable');
  console.log('Proof:', result.proof);
}
```

---

## Metrics

### getMetricsCollector()

```typescript
getMetricsCollector(): MetricsCollector | null
```

Returns MetricsCollector for Prometheus metrics. Null if metrics not enabled.

---

## Lifecycle

### stop()

```typescript
async stop(): Promise<void>
```

Stops the engine and releases all resources. Waits for pending rule executions.

**Example:**

```typescript
await engine.stop();
```

### waitForProcessingQueue()

```typescript
waitForProcessingQueue(): Promise<void>
```

Waits for currently processing rules to complete. Useful for safe rule updates.

### getHotReloadWatcher()

```typescript
getHotReloadWatcher(): HotReloadWatcher | null
```

Returns HotReloadWatcher. Null if hot-reload not configured.

### getLookupCache()

```typescript
getLookupCache(): LookupCache
```

Returns LookupCache for external data cache statistics and management.

### isRunning

```typescript
get isRunning(): boolean
```

Returns whether the engine is running.

---

## Types

### RuleEngineConfig

```typescript
interface RuleEngineConfig {
  name?: string;
  maxConcurrency?: number;
  debounceMs?: number;
  persistence?: PersistenceConfig;
  services?: Record<string, unknown>;
  tracing?: TracingConfig;
  timerPersistence?: TimerPersistenceConfig;
  audit?: AuditPersistenceConfig;
  metrics?: MetricsConfig;
  opentelemetry?: OpenTelemetryConfig;
  hotReload?: HotReloadConfig;
  versioning?: VersioningConfig;
  baseline?: BaselineConfig;
  backwardChaining?: BackwardChainingConfig;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | `string` | `'rule-engine'` | Engine name for logging |
| maxConcurrency | `number` | `10` | Max parallel rule evaluations |
| debounceMs | `number` | `0` | Debounce for fact changes |
| persistence | `PersistenceConfig` | — | Rule persistence |
| services | `Record<string, unknown>` | `{}` | External services for call_service |
| tracing | `TracingConfig` | — | Debugging tracing |
| timerPersistence | `TimerPersistenceConfig` | — | Durable timers |
| audit | `AuditPersistenceConfig` | — | Audit log |
| metrics | `MetricsConfig` | — | Prometheus metrics |
| opentelemetry | `OpenTelemetryConfig` | — | OpenTelemetry tracing |
| hotReload | `HotReloadConfig` | — | Hot-reload from files |
| versioning | `VersioningConfig` | — | Rule version history |
| baseline | `BaselineConfig` | — | Anomaly detection |
| backwardChaining | `BackwardChainingConfig` | — | Backward chaining options |

### EngineStats

```typescript
interface EngineStats {
  rulesCount: number;
  factsCount: number;
  timersCount: number;
  eventsProcessed: number;
  rulesExecuted: number;
  avgProcessingTimeMs: number;
  tracing?: TracingStats;
  profiling?: ProfilingStats;
  audit?: AuditStats;
  versioning?: VersioningStats;
  baseline?: { metricsCount: number; totalRecalculations: number; anomaliesDetected: number };
}
```

---

## See Also

- [FactStore](./02-fact-store.md) — Fact management
- [EventStore](./03-event-store.md) — Event storage
- [TimerManager](./04-timer-manager.md) — Timer management
- [RuleManager](./05-rule-manager.md) — Rule indexing
- [Fluent Builder](./09-dsl-builder.md) — Rule.create() DSL
- [Configuration](./30-configuration.md) — All config options
- [Getting Started](../learn/01-getting-started/01-first-rule.md) — Tutorial
