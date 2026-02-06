# Typy

Kompletní přehled všech exportovaných typů a rozhraní z `@hamicek/noex-rules`.

## Import

```typescript
import type {
  Rule, RuleInput, RuleTrigger, RuleCondition, RuleAction,
  Fact, Event, Timer,
  EngineStats, RuleEngineConfig,
  // ... další typy
} from '@hamicek/noex-rules';
```

---

## Základní typy

Fundamentální typy pro pravidla, fakta, události a časovače.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`Rule`](#rule) | types | Kompletní pravidlo s metadaty |
| [`RuleInput`](#ruleinput) | types | Definice pravidla pro registraci |
| [`RuleTrigger`](#ruletrigger) | types | Definice triggeru (event, fact, timer, temporal) |
| [`RuleCondition`](#rulecondition) | types | Podmínka se zdrojem, operátorem a hodnotou |
| [`RuleAction`](#ruleaction) | types | Definice akce (emit, set_fact, atd.) |
| [`Fact`](#fact) | types | Uložený fakt s metadaty |
| [`Event`](#event) | types | Událost s topicem a payloadem |
| [`Timer`](#timer) | types | Časovač s expirací a konfigurací opakování |
| [`TimerConfig`](#timerconfig) | types | Možnosti vytvoření časovače |
| [`TimerMetadata`](#timermetadata) | types | Interní metadata persistence časovače |

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

Definice pravidla bez automaticky generovaných polí. Používá se pro `registerRule()`.

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

## Typy skupin

Typy pro skupiny pravidel.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`RuleGroup`](#rulegroup) | types | Skupina pravidel s metadaty |
| [`RuleGroupInput`](#rulegroupinput) | types | Vstup pro vytvoření skupiny |

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

## Temporální vzory

Typy pro Complex Event Processing (CEP) vzory.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`TemporalPattern`](#temporalpattern) | types | Union všech temporálních vzorů |
| [`SequencePattern`](#sequencepattern) | types | Události v pořadí |
| [`AbsencePattern`](#absencepattern) | types | Očekávaná událost nepřišla |
| [`CountPattern`](#countpattern) | types | N událostí v časovém okně |
| [`AggregatePattern`](#aggregatepattern) | types | Agregace nad událostmi |
| [`EventMatcher`](#eventmatcher) | types | Kritéria pro matching událostí |

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

## Typy výsledků akcí

Typy pro výsledky provedení akcí.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`ActionResult`](#actionresult) | types | Výsledek provedení jedné akce |
| [`ConditionalActionResult`](#conditionalactionresult) | types | Výsledek podmíněné akce |

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

## Typy lookupů

Typy pro externí data lookupy.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`DataRequirement`](#datarequirement) | types | Deklarace lookupu |
| [`LookupCacheConfig`](#lookupcacheconfig) | types | Konfigurace cache |
| [`LookupErrorStrategy`](#lookuperrorstrategy) | types | Strategie při chybě |

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

## Konfigurační typy

Konfigurace enginu a modulů.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`RuleEngineConfig`](#ruleengineconfig) | types | Hlavní konfigurace enginu |
| [`PersistenceConfig`](#persistenceconfig) | types | Persistence pravidel |
| [`TimerPersistenceConfig`](#timerpersistenceconfig) | types | Persistence časovačů |
| [`TracingConfig`](#tracingconfig) | types | Debug tracing |
| [`AuditPersistenceConfig`](#auditpersistenceconfig) | types | Persistence audit logu |
| [`MetricsConfig`](#metricsconfig) | observability | Prometheus metriky |
| [`OpenTelemetryConfig`](#opentelemetryconfig) | observability | OpenTelemetry tracing |
| [`VersioningConfig`](#versioningconfig) | versioning | Historie verzí pravidel |
| [`BaselineConfig`](#baselineconfig) | types | Detekce anomálií |
| [`BackwardChainingConfig`](#backwardchainingconfig) | types | Zpětné řetězení |
| [`HotReloadConfig`](#hotreloadconfig) | hot-reload | Živé aktualizace pravidel |

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

Viz [Konfigurace](./30-configuration.md) pro popis polí.

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

## Statistické typy

Typy pro statistiky enginu a modulů.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`EngineStats`](#enginestats) | types | Statistiky enginu |
| [`TracingStats`](#tracingstats) | types | Statistiky tracingu |
| [`ProfilingStats`](#profilingstats) | types | Statistiky profilingu |
| [`AuditStats`](#auditstats) | audit | Statistiky audit logu |
| [`VersioningStats`](#versioningstats) | versioning | Statistiky verzování |

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

## Validační typy

Typy pro validaci pravidel.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`ValidationResult`](#validationresult) | validation | Výsledek validace |
| [`ValidationIssue`](#validationissue) | validation | Jednotlivý validační problém |
| [`ValidatorOptions`](#validatoroptions) | validation | Možnosti validátoru |

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

## Typy verzování

Typy pro historii verzí pravidel.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`RuleVersionEntry`](#ruleversionentry) | versioning | Snapshot verze |
| [`RuleChangeType`](#rulechangetype) | versioning | Typ změny |
| [`RuleVersionQuery`](#ruleversionquery) | versioning | Parametry dotazu na verze |
| [`RuleVersionQueryResult`](#ruleversionqueryresult) | versioning | Výsledek dotazu |
| [`RuleVersionDiff`](#ruleversiondiff) | versioning | Diff verzí |
| [`RuleFieldChange`](#rulefieldchange) | versioning | Změna na úrovni pole |

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

## Typy auditu

Typy pro audit logging.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`AuditEntry`](#auditentry) | audit | Záznam v audit logu |
| [`AuditCategory`](#auditcategory) | audit | Kategorie záznamu |
| [`AuditEventType`](#auditeventtype) | audit | Typ události |
| [`AuditQuery`](#auditquery) | audit | Parametry dotazu |
| [`AuditQueryResult`](#auditqueryresult) | audit | Výsledek dotazu |
| [`AuditConfig`](#auditconfig) | audit | Konfigurace auditu |
| [`AuditSubscriber`](#auditsubscriber) | audit | Callback pro subscription |

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

## Typy baseline

Typy pro detekci anomálií.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`BaselineMetricConfig`](#baselinemetricconfig) | types | Konfigurace metriky |
| [`BaselineStats`](#baselinestats) | types | Vypočtená baseline |
| [`BaselineMethod`](#baselinemethod) | types | Metoda výpočtu |
| [`BaselineComparison`](#baselinecomparison) | types | Porovnání anomálie |
| [`BaselineAggregation`](#baselineaggregation) | types | Agregační funkce |
| [`SeasonalPeriod`](#seasonalperiod) | types | Sezónní perioda |
| [`AnomalyResult`](#anomalyresult) | types | Výsledek detekce |

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

## Typy zpětného řetězení

Typy pro cílově řízené dotazy.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`Goal`](#goal) | types | Cíl dotazu |
| [`FactGoal`](#factgoal) | types | Cíl založený na faktu |
| [`EventGoal`](#eventgoal) | types | Cíl založený na události |
| [`QueryResult`](#queryresult) | types | Výsledek dotazu |
| [`ProofNode`](#proofnode) | types | Uzel důkazového stromu |

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

## Typy hot reload

Typy pro živé aktualizace pravidel.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`FileSourceConfig`](#filesourceconfig) | hot-reload | Konfigurace souborového zdroje |
| [`StorageSourceConfig`](#storagesourceconfig) | hot-reload | Konfigurace storage zdroje |
| [`HotReloadStatus`](#hotreloadstatus) | hot-reload | Stav watcheru |
| [`ReloadResult`](#reloadresult) | hot-reload | Výsledek reload cyklu |
| [`RuleDiff`](#rulediff) | hot-reload | Diff pravidel |

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

## Typy observability

Typy pro metriky a tracing.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`MetricLabels`](#metriclabels) | observability | Labely metriky |
| [`LabeledValue`](#labeledvalue) | observability | Hodnota s labely |
| [`CounterMetric`](#countermetric) | observability | Counter metrika |
| [`GaugeMetric`](#gaugemetric) | observability | Gauge metrika |
| [`HistogramMetric`](#histogrammetric) | observability | Histogram metrika |
| [`HistogramSample`](#histogramsample) | observability | Vzorek histogramu |

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

## Typy DSL

Typy pro fluent builder API.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`Ref`](#ref) | dsl | Reference na runtime hodnotu |
| [`ValueOrRef`](#valueorref) | dsl | Hodnota nebo reference |
| [`ConditionBuilder`](#conditionbuilder) | dsl | Interface builderu podmínek |
| [`TriggerBuilder`](#triggerbuilder) | dsl | Interface builderu triggerů |
| [`ActionBuilder`](#actionbuilder) | dsl | Interface builderu akcí |
| [`GoalBuilder`](#goalbuilder) | dsl | Interface builderu cílů |
| [`LookupConfig`](#lookupconfig) | dsl | Konfigurace lookupu |
| [`BuiltRule`](#builtrule) | dsl | Vytvořené pravidlo (alias pro RuleInput) |
| [`SetTimerOptions`](#settimeroptions) | dsl | Možnosti akce timer |

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

## Typy šablon

Typy pro šablony pravidel.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`TemplateParamType`](#templateparamtype) | template | Typ parametru |
| [`TemplateParameterDef`](#templateparameterdef) | template | Definice parametru |
| [`TemplateParamMarker`](#templateparammarker) | template | Placeholder marker |
| [`TemplateParams`](#templateparams) | template | Hodnoty parametrů |
| [`TemplateInstantiateOptions`](#templateinstantiateoptions) | template | Možnosti instanciace |
| [`TemplateBlueprintData`](#templateblueprintdata) | template | Blueprint pravidla |
| [`RuleTemplateDefinition`](#ruletemplatedefinition) | template | Definice šablony |
| [`TemplateParamOptions`](#templateparamoptions) | template | Možnosti parametru |

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

## Typy serveru

Typy pro HTTP server.

| Typ | Modul | Popis |
|-----|-------|-------|
| [`ServerOptions`](#serveroptions) | api | Možnosti startu serveru |
| [`ServerConfig`](#serverconfig) | api | Plná konfigurace serveru |
| [`CorsConfig`](#corsconfig) | api | Konfigurace CORS |
| [`GraphQLConfig`](#graphqlconfig) | api | Konfigurace GraphQL |
| [`ApiError`](#apierror) | api | Interface API chyby |

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

## Třídy chyb

Chybové třídy vyhazované knihovnou.

| Třída | Modul | Popis |
|-------|-------|-------|
| `RuleValidationError` | validation | Validace pravidla selhala |
| `DslError` | dsl | Chyba DSL builderu |
| `DslValidationError` | dsl | Validační chyba DSL |
| `YamlLoadError` | dsl/yaml | Chyba parsování YAML |
| `YamlValidationError` | dsl/yaml | Validační chyba YAML |
| `TemplateValidationError` | dsl/template | Validační chyba šablony |
| `TemplateInstantiationError` | dsl/template | Chyba instanciace šablony |
| `ParseError` | dsl/tagged | Chyba parsování tagged template |
| `NotFoundError` | api | Zdroj nenalezen (404) |
| `ValidationError` | api | Validace requestu selhala (400) |
| `ConflictError` | api | Konflikt zdrojů (409) |
| `BadRequestError` | api | Chybný request (400) |
| `ServiceUnavailableError` | api | Služba nedostupná (503) |

---

## Konstanty

Exportované konstanty.

| Konstanta | Modul | Popis |
|-----------|-------|-------|
| `TRIGGER_TYPES` | validation | Platné typy triggerů |
| `TEMPORAL_PATTERN_TYPES` | validation | Platné typy temporálních vzorů |
| `CONDITION_OPERATORS` | validation | Platné operátory podmínek |
| `CONDITION_SOURCE_TYPES` | validation | Platné typy zdrojů podmínek |
| `ACTION_TYPES` | validation | Platné typy akcí |
| `LOG_LEVELS` | validation | Platné úrovně logování |
| `AGGREGATE_FUNCTIONS` | validation | Platné agregační funkce |
| `COMPARISONS` | validation | Platné porovnávací operátory |
| `UNARY_OPERATORS` | validation | Platné unární operátory |
| `DURATION_RE` | validation | Regex pattern pro duration |
| `DEFAULT_HISTOGRAM_BUCKETS` | observability | Výchozí buckety histogramu |
| `DEFAULT_METRICS_PREFIX` | observability | Výchozí prefix metrik |
| `DEFAULT_MAX_LABELED_RULES` | observability | Výchozí max labelovaných pravidel |
| `AUDIT_EVENT_CATEGORIES` | audit | Mapování typu události na kategorii |

---

## Viz také

- [Konfigurace](./30-configuration.md) — Všechny konfigurační možnosti
- [Utility](./31-utilities.md) — Pomocné funkce
- [Chyby](./32-errors.md) — Chybové třídy a kódy
- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [Fluent Builder](./09-dsl-builder.md) — Rule.create() DSL
