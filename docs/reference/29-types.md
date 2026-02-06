# Types

Complete reference of all exported types and interfaces from `@hamicek/noex-rules`.

## Import

```typescript
import type {
  Rule, RuleInput, RuleTrigger, RuleCondition, RuleAction,
  Fact, Event, Timer,
  EngineStats, RuleEngineConfig,
  // ... other types
} from '@hamicek/noex-rules';
```

---

## Core Types

Fundamental types for rules, facts, events, and timers.

| Type | Module | Description |
|------|--------|-------------|
| [`Rule`](#rule) | types | Complete rule with metadata |
| [`RuleInput`](#ruleinput) | types | Rule definition for registration |
| [`RuleTrigger`](#ruletrigger) | types | Trigger definition (event, fact, timer, temporal) |
| [`RuleCondition`](#rulecondition) | types | Condition with source, operator, value |
| [`RuleAction`](#ruleaction) | types | Action definition (emit, set_fact, etc.) |
| [`Fact`](#fact) | types | Stored fact with metadata |
| [`Event`](#event) | types | Event with topic and payload |
| [`Timer`](#timer) | types | Timer with expiration and repeat config |
| [`TimerConfig`](#timerconfig) | types | Timer creation options |
| [`TimerMetadata`](#timermetadata) | types | Internal timer persistence metadata |

### Rule

```typescript
interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  version: number;
  tags: string[];
  group?: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  lookups?: DataRequirement[];
  createdAt: number;
  updatedAt: number;
}
```

### RuleInput

```typescript
type RuleInput = Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>;
```

Rule definition without auto-generated fields. Used for `registerRule()`.

### RuleTrigger

```typescript
type RuleTrigger =
  | { type: 'fact'; pattern: string }
  | { type: 'event'; topic: string }
  | { type: 'timer'; name: string }
  | { type: 'temporal'; pattern: TemporalPattern };
```

### RuleCondition

```typescript
interface RuleCondition {
  source:
    | { type: 'fact'; pattern: string }
    | { type: 'event'; field: string }
    | { type: 'context'; key: string }
    | { type: 'lookup'; name: string; field?: string }
    | { type: 'baseline'; metric: string; comparison: BaselineComparison; sensitivity?: number };
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' |
            'contains' | 'not_contains' | 'matches' | 'exists' | 'not_exists';
  value: unknown | { ref: string };
}
```

### RuleAction

```typescript
type RuleAction =
  | { type: 'set_fact'; key: string; value: unknown | { ref: string } }
  | { type: 'delete_fact'; key: string }
  | { type: 'emit_event'; topic: string; data: Record<string, unknown | { ref: string }> }
  | { type: 'set_timer'; timer: TimerConfig }
  | { type: 'cancel_timer'; name: string }
  | { type: 'call_service'; service: string; method: string; args: unknown[] }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  | { type: 'conditional'; conditions: RuleCondition[]; then: RuleAction[]; else?: RuleAction[] };
```

### Fact

```typescript
interface Fact {
  key: string;
  value: unknown;
  timestamp: number;
  source: string;
  version: number;
}
```

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

### Timer

```typescript
interface Timer {
  id: string;
  name: string;
  expiresAt: number;
  onExpire: { topic: string; data: Record<string, unknown> };
  repeat?: { interval: number; maxCount?: number };
  correlationId?: string;
}
```

### TimerConfig

```typescript
interface TimerConfig {
  name: string;
  duration: string | number;
  onExpire: { topic: string; data: Record<string, unknown | { ref: string }> };
  repeat?: { interval: string | number; maxCount?: number };
}
```

### TimerMetadata

```typescript
interface TimerMetadata {
  name: string;
  durableTimerId: string;
  timerId: string;
  onExpire: { topic: string; data: Record<string, unknown> };
  correlationId?: string;
  maxCount?: number;
  fireCount: number;
  repeatIntervalMs?: number;
}
```

---

## Group Types

Types for rule groups.

| Type | Module | Description |
|------|--------|-------------|
| [`RuleGroup`](#rulegroup) | types | Rule group with metadata |
| [`RuleGroupInput`](#rulegroupinput) | types | Group creation input |

### RuleGroup

```typescript
interface RuleGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### RuleGroupInput

```typescript
interface RuleGroupInput {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
}
```

---

## Temporal Pattern Types

Types for Complex Event Processing (CEP) patterns.

| Type | Module | Description |
|------|--------|-------------|
| [`TemporalPattern`](#temporalpattern) | types | Union of all temporal patterns |
| [`SequencePattern`](#sequencepattern) | types | Events in order |
| [`AbsencePattern`](#absencepattern) | types | Expected event not received |
| [`CountPattern`](#countpattern) | types | N events in time window |
| [`AggregatePattern`](#aggregatepattern) | types | Aggregation over events |
| [`EventMatcher`](#eventmatcher) | types | Event matching criteria |

### TemporalPattern

```typescript
type TemporalPattern =
  | SequencePattern
  | AbsencePattern
  | CountPattern
  | AggregatePattern;
```

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

### EventMatcher

```typescript
interface EventMatcher {
  topic: string;
  filter?: Record<string, unknown>;
  as?: string;
}
```

---

## Action Result Types

Types for action execution results.

| Type | Module | Description |
|------|--------|-------------|
| [`ActionResult`](#actionresult) | types | Single action execution result |
| [`ConditionalActionResult`](#conditionalactionresult) | types | Conditional action result |

### ActionResult

```typescript
interface ActionResult {
  action: RuleAction;
  success: boolean;
  result?: unknown;
  error?: string;
}
```

### ConditionalActionResult

```typescript
interface ConditionalActionResult {
  conditionMet: boolean;
  branchExecuted: 'then' | 'else' | 'none';
  results: ActionResult[];
}
```

---

## Lookup Types

Types for external data lookups.

| Type | Module | Description |
|------|--------|-------------|
| [`DataRequirement`](#datarequirement) | types | Lookup declaration |
| [`LookupCacheConfig`](#lookupcacheconfig) | types | Cache configuration |
| [`LookupErrorStrategy`](#lookuperrorstrategy) | types | Error handling strategy |

### DataRequirement

```typescript
interface DataRequirement {
  name: string;
  service: string;
  method: string;
  args: unknown[];
  cache?: LookupCacheConfig;
  onError?: LookupErrorStrategy;
}
```

### LookupCacheConfig

```typescript
interface LookupCacheConfig {
  ttl: string | number;
}
```

### LookupErrorStrategy

```typescript
type LookupErrorStrategy = 'skip' | 'fail';
```

---

## Configuration Types

Engine and module configuration.

| Type | Module | Description |
|------|--------|-------------|
| [`RuleEngineConfig`](#ruleengineconfig) | types | Main engine configuration |
| [`PersistenceConfig`](#persistenceconfig) | types | Rule persistence |
| [`TimerPersistenceConfig`](#timerpersistenceconfig) | types | Timer persistence |
| [`TracingConfig`](#tracingconfig) | types | Debug tracing |
| [`AuditPersistenceConfig`](#auditpersistenceconfig) | types | Audit log persistence |
| [`MetricsConfig`](#metricsconfig) | observability | Prometheus metrics |
| [`OpenTelemetryConfig`](#opentelemetryconfig) | observability | OpenTelemetry tracing |
| [`VersioningConfig`](#versioningconfig) | versioning | Rule version history |
| [`BaselineConfig`](#baselineconfig) | types | Anomaly detection |
| [`BackwardChainingConfig`](#backwardchainingconfig) | types | Backward chaining |
| [`HotReloadConfig`](#hotreloadconfig) | hot-reload | Live rule updates |

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

See [Configuration](./30-configuration.md) for field descriptions.

### PersistenceConfig

```typescript
interface PersistenceConfig {
  adapter: StorageAdapter;
  key?: string;
  schemaVersion?: number;
}
```

### TimerPersistenceConfig

```typescript
interface TimerPersistenceConfig {
  adapter: StorageAdapter;
  checkIntervalMs?: number;
}
```

### TracingConfig

```typescript
interface TracingConfig {
  enabled?: boolean;
  maxEntries?: number;
}
```

### AuditPersistenceConfig

```typescript
interface AuditPersistenceConfig {
  adapter: StorageAdapter;
  retentionMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxMemoryEntries?: number;
}
```

### MetricsConfig

```typescript
interface MetricsConfig {
  enabled?: boolean;
  perRuleMetrics?: boolean;
  maxLabeledRules?: number;
  histogramBuckets?: number[];
  prefix?: string;
}
```

### OpenTelemetryConfig

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;
  serviceName?: string;
  traceConditions?: boolean;
}
```

### VersioningConfig

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;
  maxVersionsPerRule?: number;
  maxAgeMs?: number;
}
```

### BaselineConfig

```typescript
interface BaselineConfig {
  metrics: BaselineMetricConfig[];
  defaultSensitivity?: number;
  ewmaAlpha?: number;
  minSamples?: number;
}
```

### BackwardChainingConfig

```typescript
interface BackwardChainingConfig {
  maxDepth?: number;
  maxExploredRules?: number;
}
```

### HotReloadConfig

```typescript
interface HotReloadConfig {
  intervalMs?: number;
  files?: FileSourceConfig;
  storage?: StorageSourceConfig;
  validateBeforeApply?: boolean;
  atomicReload?: boolean;
}
```

---

## Statistics Types

Types for engine and module statistics.

| Type | Module | Description |
|------|--------|-------------|
| [`EngineStats`](#enginestats) | types | Engine statistics |
| [`TracingStats`](#tracingstats) | types | Tracing statistics |
| [`ProfilingStats`](#profilingstats) | types | Profiling statistics |
| [`AuditStats`](#auditstats) | audit | Audit log statistics |
| [`VersioningStats`](#versioningstats) | versioning | Versioning statistics |

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

### TracingStats

```typescript
interface TracingStats {
  enabled: boolean;
  entriesCount: number;
  maxEntries: number;
}
```

### ProfilingStats

```typescript
interface ProfilingStats {
  totalRulesProfiled: number;
  totalTriggers: number;
  totalExecutions: number;
  totalTimeMs: number;
  avgRuleTimeMs: number;
  slowestRule: { ruleId: string; ruleName: string; avgTimeMs: number } | null;
  hottestRule: { ruleId: string; ruleName: string; triggerCount: number } | null;
}
```

### AuditStats

```typescript
interface AuditStats {
  totalEntries: number;
  memoryEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  entriesByCategory: Record<AuditCategory, number>;
  subscribersCount: number;
}
```

### VersioningStats

```typescript
interface VersioningStats {
  trackedRules: number;
  totalVersions: number;
  dirtyRules: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}
```

---

## Validation Types

Types for rule validation.

| Type | Module | Description |
|------|--------|-------------|
| [`ValidationResult`](#validationresult) | validation | Validation result |
| [`ValidationIssue`](#validationissue) | validation | Single validation issue |
| [`ValidatorOptions`](#validatoroptions) | validation | Validator options |

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
```

### ValidationIssue

```typescript
interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
```

### ValidatorOptions

```typescript
interface ValidatorOptions {
  strict?: boolean;
}
```

---

## Versioning Types

Types for rule version history.

| Type | Module | Description |
|------|--------|-------------|
| [`RuleVersionEntry`](#ruleversionentry) | versioning | Version snapshot |
| [`RuleChangeType`](#rulechangetype) | versioning | Type of change |
| [`RuleVersionQuery`](#ruleversionquery) | versioning | Version query parameters |
| [`RuleVersionQueryResult`](#ruleversionqueryresult) | versioning | Query result |
| [`RuleVersionDiff`](#ruleversiondiff) | versioning | Version diff |
| [`RuleFieldChange`](#rulefieldchange) | versioning | Field-level change |

### RuleVersionEntry

```typescript
interface RuleVersionEntry {
  version: number;
  ruleSnapshot: Rule;
  timestamp: number;
  changeType: RuleChangeType;
  rolledBackFrom?: number;
  description?: string;
}
```

### RuleChangeType

```typescript
type RuleChangeType =
  | 'registered'
  | 'updated'
  | 'enabled'
  | 'disabled'
  | 'unregistered'
  | 'rolled_back';
```

### RuleVersionQuery

```typescript
interface RuleVersionQuery {
  ruleId: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  fromVersion?: number;
  toVersion?: number;
  changeTypes?: RuleChangeType[];
  from?: number;
  to?: number;
}
```

### RuleVersionQueryResult

```typescript
interface RuleVersionQueryResult {
  entries: RuleVersionEntry[];
  totalVersions: number;
  hasMore: boolean;
}
```

### RuleVersionDiff

```typescript
interface RuleVersionDiff {
  ruleId: string;
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}
```

### RuleFieldChange

```typescript
interface RuleFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}
```

---

## Audit Types

Types for audit logging.

| Type | Module | Description |
|------|--------|-------------|
| [`AuditEntry`](#auditentry) | audit | Audit log entry |
| [`AuditCategory`](#auditcategory) | audit | Entry category |
| [`AuditEventType`](#auditeventtype) | audit | Event type |
| [`AuditQuery`](#auditquery) | audit | Query parameters |
| [`AuditQueryResult`](#auditqueryresult) | audit | Query result |
| [`AuditConfig`](#auditconfig) | audit | Audit configuration |
| [`AuditSubscriber`](#auditsubscriber) | audit | Subscription callback |

### AuditEntry

```typescript
interface AuditEntry {
  id: string;
  timestamp: number;
  category: AuditCategory;
  type: AuditEventType;
  summary: string;
  source: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  details: Record<string, unknown>;
  durationMs?: number;
}
```

### AuditCategory

```typescript
type AuditCategory =
  | 'rule_management'
  | 'rule_execution'
  | 'fact_change'
  | 'event_emitted'
  | 'system';
```

### AuditEventType

```typescript
type AuditEventType =
  | 'rule_registered' | 'rule_unregistered' | 'rule_enabled' | 'rule_disabled'
  | 'rule_rolled_back' | 'rule_executed' | 'rule_skipped' | 'rule_failed'
  | 'group_created' | 'group_updated' | 'group_deleted' | 'group_enabled' | 'group_disabled'
  | 'fact_created' | 'fact_updated' | 'fact_deleted'
  | 'event_emitted'
  | 'engine_started' | 'engine_stopped'
  | 'hot_reload_started' | 'hot_reload_completed' | 'hot_reload_failed'
  | 'baseline_registered' | 'baseline_recalculated' | 'baseline_anomaly_detected'
  | 'backward_query_started' | 'backward_query_completed';
```

### AuditQuery

```typescript
interface AuditQuery {
  category?: AuditCategory;
  types?: AuditEventType[];
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}
```

### AuditQueryResult

```typescript
interface AuditQueryResult {
  entries: AuditEntry[];
  totalCount: number;
  queryTimeMs: number;
  hasMore: boolean;
}
```

### AuditConfig

```typescript
interface AuditConfig {
  enabled?: boolean;
  maxMemoryEntries?: number;
  retentionMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}
```

### AuditSubscriber

```typescript
type AuditSubscriber = (entry: AuditEntry) => void;
```

---

## Baseline Types

Types for anomaly detection.

| Type | Module | Description |
|------|--------|-------------|
| [`BaselineMetricConfig`](#baselinemetricconfig) | types | Metric configuration |
| [`BaselineStats`](#baselinestats) | types | Computed baseline |
| [`BaselineMethod`](#baselinemethod) | types | Calculation method |
| [`BaselineComparison`](#baselinecomparison) | types | Anomaly comparison |
| [`BaselineAggregation`](#baselineaggregation) | types | Aggregation function |
| [`SeasonalPeriod`](#seasonalperiod) | types | Seasonal period |
| [`AnomalyResult`](#anomalyresult) | types | Detection result |

### BaselineMetricConfig

```typescript
interface BaselineMetricConfig {
  name: string;
  topic: string;
  field: string;
  function: BaselineAggregation;
  sampleWindow: string | number;
  trainingPeriod: string | number;
  recalcInterval: string | number;
  method: BaselineMethod;
  groupBy?: string;
  seasonal?: SeasonalPeriod;
  filter?: Record<string, unknown>;
}
```

### BaselineStats

```typescript
interface BaselineStats {
  metric: string;
  mean: number;
  stddev: number;
  median: number;
  percentiles: Record<number, number>;
  ewma?: number;
  sampleCount: number;
  min: number;
  max: number;
  computedAt: number;
  dataFrom: number;
  dataTo: number;
  groupKey?: string;
  seasonalBucket?: string;
}
```

### BaselineMethod

```typescript
type BaselineMethod = 'moving_average' | 'ewma' | 'zscore' | 'percentile';
```

### BaselineComparison

```typescript
type BaselineComparison =
  | 'above'
  | 'below'
  | 'outside'
  | 'above_percentile'
  | 'below_percentile';
```

### BaselineAggregation

```typescript
type BaselineAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';
```

### SeasonalPeriod

```typescript
type SeasonalPeriod = 'hourly' | 'daily' | 'weekly' | 'none';
```

### AnomalyResult

```typescript
interface AnomalyResult {
  isAnomaly: boolean;
  currentValue: number;
  baseline: BaselineStats;
  zScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}
```

---

## Backward Chaining Types

Types for goal-driven queries.

| Type | Module | Description |
|------|--------|-------------|
| [`Goal`](#goal) | types | Query goal |
| [`FactGoal`](#factgoal) | types | Fact-based goal |
| [`EventGoal`](#eventgoal) | types | Event-based goal |
| [`QueryResult`](#queryresult) | types | Query result |
| [`ProofNode`](#proofnode) | types | Proof tree node |

### Goal

```typescript
type Goal = FactGoal | EventGoal;
```

### FactGoal

```typescript
interface FactGoal {
  type: 'fact';
  key: string;
  value?: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
}
```

### EventGoal

```typescript
interface EventGoal {
  type: 'event';
  topic: string;
}
```

### QueryResult

```typescript
interface QueryResult {
  goal: Goal;
  achievable: boolean;
  proof: ProofNode;
  exploredRules: number;
  maxDepthReached: boolean;
  durationMs: number;
}
```

### ProofNode

```typescript
type ProofNode =
  | FactExistsNode
  | RuleProofNode
  | UnachievableNode;

interface FactExistsNode {
  type: 'fact_exists';
  key: string;
  currentValue: unknown;
  satisfied: boolean;
}

interface RuleProofNode {
  type: 'rule';
  ruleId: string;
  ruleName: string;
  satisfied: boolean;
  conditions: ConditionProofNode[];
  children: ProofNode[];
}

interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}
```

---

## Hot Reload Types

Types for live rule updates.

| Type | Module | Description |
|------|--------|-------------|
| [`FileSourceConfig`](#filesourceconfig) | hot-reload | File source configuration |
| [`StorageSourceConfig`](#storagesourceconfig) | hot-reload | Storage source configuration |
| [`HotReloadStatus`](#hotreloadstatus) | hot-reload | Watcher status |
| [`ReloadResult`](#reloadresult) | hot-reload | Reload cycle result |
| [`RuleDiff`](#rulediff) | hot-reload | Rule diff |

### FileSourceConfig

```typescript
interface FileSourceConfig {
  paths: string[];
  patterns?: string[];
  recursive?: boolean;
}
```

### StorageSourceConfig

```typescript
interface StorageSourceConfig {
  adapter: StorageAdapter;
  key?: string;
}
```

### HotReloadStatus

```typescript
interface HotReloadStatus {
  running: boolean;
  intervalMs: number;
  trackedRulesCount: number;
  lastReloadAt: number | null;
  reloadCount: number;
  failureCount: number;
}
```

### ReloadResult

```typescript
interface ReloadResult {
  success: boolean;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  durationMs: number;
  error?: string;
  timestamp: number;
}
```

### RuleDiff

```typescript
interface RuleDiff {
  added: RuleInput[];
  removed: string[];
  modified: RuleInput[];
}
```

---

## Observability Types

Types for metrics and tracing.

| Type | Module | Description |
|------|--------|-------------|
| [`MetricLabels`](#metriclabels) | observability | Metric labels |
| [`LabeledValue`](#labeledvalue) | observability | Value with labels |
| [`CounterMetric`](#countermetric) | observability | Counter metric |
| [`GaugeMetric`](#gaugemetric) | observability | Gauge metric |
| [`HistogramMetric`](#histogrammetric) | observability | Histogram metric |
| [`HistogramSample`](#histogramsample) | observability | Histogram sample |

### MetricLabels

```typescript
type MetricLabels = Record<string, string>;
```

### LabeledValue

```typescript
interface LabeledValue {
  labels: MetricLabels;
  value: number;
}
```

### CounterMetric

```typescript
interface CounterMetric {
  name: string;
  help: string;
  values: LabeledValue[];
}
```

### GaugeMetric

```typescript
interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}
```

### HistogramMetric

```typescript
interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  samples: HistogramSample[];
}
```

### HistogramSample

```typescript
interface HistogramSample {
  labels: MetricLabels;
  count: number;
  sum: number;
  bucketCounts: number[];
}
```

---

## DSL Types

Types for the fluent builder API.

| Type | Module | Description |
|------|--------|-------------|
| [`Ref`](#ref) | dsl | Runtime value reference |
| [`ValueOrRef`](#valueorref) | dsl | Value or reference |
| [`ConditionBuilder`](#conditionbuilder) | dsl | Condition builder interface |
| [`TriggerBuilder`](#triggerbuilder) | dsl | Trigger builder interface |
| [`ActionBuilder`](#actionbuilder) | dsl | Action builder interface |
| [`GoalBuilder`](#goalbuilder) | dsl | Goal builder interface |
| [`LookupConfig`](#lookupconfig) | dsl | Lookup configuration |
| [`BuiltRule`](#builtrule) | dsl | Built rule (alias for RuleInput) |
| [`SetTimerOptions`](#settimeroptions) | dsl | Timer action options |

### Ref

```typescript
interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}
```

### ValueOrRef

```typescript
type ValueOrRef<T> = T | Ref<T>;
```

### ConditionBuilder

```typescript
interface ConditionBuilder {
  build(): RuleCondition;
}
```

### TriggerBuilder

```typescript
interface TriggerBuilder {
  build(): RuleTrigger;
}
```

### ActionBuilder

```typescript
interface ActionBuilder {
  build(): RuleAction;
}
```

### GoalBuilder

```typescript
interface GoalBuilder {
  build(): Goal;
}
```

### LookupConfig

```typescript
interface LookupConfig {
  service: string;
  method: string;
  args?: unknown[];
  cache?: LookupCacheConfig;
  onError?: LookupErrorStrategy;
}
```

### BuiltRule

```typescript
type BuiltRule = RuleInput;
```

### SetTimerOptions

```typescript
interface SetTimerOptions {
  repeat?: { interval: string | number; maxCount?: number };
  correlationId?: string;
}
```

---

## Template Types

Types for rule templates.

| Type | Module | Description |
|------|--------|-------------|
| [`TemplateParamType`](#templateparamtype) | template | Parameter type |
| [`TemplateParameterDef`](#templateparameterdef) | template | Parameter definition |
| [`TemplateParamMarker`](#templateparammarker) | template | Placeholder marker |
| [`TemplateParams`](#templateparams) | template | Parameter values |
| [`TemplateInstantiateOptions`](#templateinstantiateoptions) | template | Instantiation options |
| [`TemplateBlueprintData`](#templateblueprintdata) | template | Rule blueprint |
| [`RuleTemplateDefinition`](#ruletemplatedefinition) | template | Template definition |
| [`TemplateParamOptions`](#templateparamoptions) | template | Parameter options |

### TemplateParamType

```typescript
type TemplateParamType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
```

### TemplateParameterDef

```typescript
interface TemplateParameterDef {
  name: string;
  type?: TemplateParamType;
  default?: unknown;
  validate?: (value: unknown) => string | undefined;
  description?: string;
}
```

### TemplateParamMarker

```typescript
interface TemplateParamMarker {
  readonly __templateParam: true;
  readonly paramName: string;
}
```

### TemplateParams

```typescript
type TemplateParams = Record<string, unknown>;
```

### TemplateInstantiateOptions

```typescript
interface TemplateInstantiateOptions {
  skipValidation?: boolean;
}
```

### TemplateBlueprintData

```typescript
interface TemplateBlueprintData {
  id: string | ((params: TemplateParams) => string);
  name?: string | ((params: TemplateParams) => string);
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags: string[];
  trigger?: unknown;
  conditions: unknown[];
  actions: unknown[];
}
```

### RuleTemplateDefinition

```typescript
interface RuleTemplateDefinition {
  templateId: string;
  templateName?: string;
  templateDescription?: string;
  templateVersion?: string;
  templateTags?: string[];
  parameters: TemplateParameterDef[];
  blueprint: TemplateBlueprintData;
}
```

### TemplateParamOptions

```typescript
interface TemplateParamOptions {
  default?: unknown;
  validate?: (value: unknown) => string | undefined;
  description?: string;
}
```

---

## Server Types

Types for the HTTP server.

| Type | Module | Description |
|------|--------|-------------|
| [`ServerOptions`](#serveroptions) | api | Server start options |
| [`ServerConfig`](#serverconfig) | api | Full server configuration |
| [`CorsConfig`](#corsconfig) | api | CORS configuration |
| [`GraphQLConfig`](#graphqlconfig) | api | GraphQL configuration |
| [`ApiError`](#apierror) | api | API error interface |

### ServerOptions

```typescript
interface ServerOptions {
  port?: number;
  host?: string;
  engine?: RuleEngine;
  engineConfig?: RuleEngineConfig;
  cors?: CorsConfig | boolean;
  graphql?: GraphQLConfig | boolean;
  swagger?: boolean;
}
```

### ServerConfig

```typescript
interface ServerConfig {
  port: number;
  host: string;
  cors: CorsConfig;
  graphql: GraphQLConfig;
  swagger: boolean;
}
```

### CorsConfig

```typescript
interface CorsConfig {
  enabled: boolean;
  origins?: string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
}
```

### GraphQLConfig

```typescript
interface GraphQLConfig {
  enabled: boolean;
  path?: string;
  playground?: boolean;
}
```

### ApiError

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
```

---

## Error Classes

Error classes thrown by the library.

| Class | Module | Description |
|-------|--------|-------------|
| `RuleValidationError` | validation | Rule validation failed |
| `DslError` | dsl | DSL builder error |
| `DslValidationError` | dsl | DSL validation error |
| `YamlLoadError` | dsl/yaml | YAML parsing error |
| `YamlValidationError` | dsl/yaml | YAML validation error |
| `TemplateValidationError` | dsl/template | Template validation error |
| `TemplateInstantiationError` | dsl/template | Template instantiation error |
| `ParseError` | dsl/tagged | Tagged template parse error |
| `NotFoundError` | api | Resource not found (404) |
| `ValidationError` | api | Request validation failed (400) |
| `ConflictError` | api | Resource conflict (409) |
| `BadRequestError` | api | Bad request (400) |
| `ServiceUnavailableError` | api | Service unavailable (503) |

---

## Constants

Exported constants.

| Constant | Module | Description |
|----------|--------|-------------|
| `TRIGGER_TYPES` | validation | Valid trigger types |
| `TEMPORAL_PATTERN_TYPES` | validation | Valid temporal pattern types |
| `CONDITION_OPERATORS` | validation | Valid condition operators |
| `CONDITION_SOURCE_TYPES` | validation | Valid condition source types |
| `ACTION_TYPES` | validation | Valid action types |
| `LOG_LEVELS` | validation | Valid log levels |
| `AGGREGATE_FUNCTIONS` | validation | Valid aggregate functions |
| `COMPARISONS` | validation | Valid comparison operators |
| `UNARY_OPERATORS` | validation | Valid unary operators |
| `DURATION_RE` | validation | Duration regex pattern |
| `DEFAULT_HISTOGRAM_BUCKETS` | observability | Default histogram buckets |
| `DEFAULT_METRICS_PREFIX` | observability | Default metrics prefix |
| `DEFAULT_MAX_LABELED_RULES` | observability | Default max labeled rules |
| `AUDIT_EVENT_CATEGORIES` | audit | Event type to category mapping |

---

## See Also

- [Configuration](./30-configuration.md) — All configuration options
- [Utilities](./31-utilities.md) — Helper functions
- [Errors](./32-errors.md) — Error classes and codes
- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [Fluent Builder](./09-dsl-builder.md) — Rule.create() DSL
