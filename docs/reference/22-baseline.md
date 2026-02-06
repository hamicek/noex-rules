# Baseline

Statistical baseline computation and anomaly detection for time-series metrics. BaselineStore collects metric data from events, computes baseline statistics (mean, standard deviation, percentiles), and detects anomalies using configurable methods (z-score, percentile thresholds).

## Import

```typescript
import {
  BaselineStore,
  // Types
  BaselineConfig,
  BaselineMetricConfig,
  BaselineStats,
  AnomalyResult,
  BaselineMethod,
  BaselineComparison,
  BaselineAggregation,
  SeasonalPeriod,
} from '@hamicek/noex-rules';
```

---

## BaselineStore

Orchestrates baseline statistic computation and management. Collects metrics from EventStore, computes statistics, stores results in FactStore, and periodically recalculates via internal scheduling.

### Constructor

```typescript
constructor(
  eventStore: EventStore,
  factStore: FactStore,
  timerManager: TimerManager,
  config: BaselineConfig
)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| eventStore | `EventStore` | yes | Source of events for metric extraction |
| factStore | `FactStore` | yes | Storage for computed baseline statistics |
| timerManager | `TimerManager` | yes | Timer manager for scheduling |
| config | `BaselineConfig` | yes | Configuration with metric definitions |

**Note:** In typical usage, BaselineStore is created internally by RuleEngine and accessed via `engine.getBaselineStore()`.

### static start()

```typescript
static async start(
  eventStore: EventStore,
  factStore: FactStore,
  timerManager: TimerManager,
  config: BaselineConfig
): Promise<BaselineStore>
```

Factory method that creates and initializes a BaselineStore.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| eventStore | `EventStore` | yes | Source of events for metric extraction |
| factStore | `FactStore` | yes | Storage for computed baseline statistics |
| timerManager | `TimerManager` | yes | Timer manager for scheduling |
| config | `BaselineConfig` | yes | Configuration with metric definitions |

**Returns:** `Promise<BaselineStore>` — Initialized baseline store

**Example:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  baseline: {
    metrics: [
      {
        name: 'order_value',
        topic: 'order.created',
        field: 'total',
        function: 'avg',
        sampleWindow: '5m',
        trainingPeriod: '7d',
        recalcInterval: '1h',
        method: 'zscore',
      },
    ],
    defaultSensitivity: 2.5,
  },
});

const baselineStore = engine.getBaselineStore();
```

### registerMetric()

```typescript
registerMetric(config: BaselineMetricConfig): void
```

Registers a new metric for baseline tracking. If a metric with the same name exists, it is replaced.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `BaselineMetricConfig` | yes | Metric configuration |

**Example:**

```typescript
baselineStore.registerMetric({
  name: 'response_time',
  topic: 'api.request',
  field: 'duration',
  function: 'avg',
  sampleWindow: '1m',
  trainingPeriod: '24h',
  recalcInterval: '15m',
  method: 'zscore',
});
```

### unregisterMetric()

```typescript
unregisterMetric(name: string): boolean
```

Removes a metric from baseline tracking. Clears cached statistics and stored facts.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Metric name to remove |

**Returns:** `boolean` — `true` if metric was removed, `false` if not found

**Example:**

```typescript
const removed = baselineStore.unregisterMetric('response_time');
```

### recalculate()

```typescript
async recalculate(metricName: string, groupKey?: string): Promise<BaselineStats>
```

Forces immediate recalculation of baseline statistics for a metric.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| metricName | `string` | yes | Metric name to recalculate |
| groupKey | `string` | no | Group key for per-group baselines |

**Returns:** `Promise<BaselineStats>` — Computed baseline statistics

**Throws:** `Error` — If metric is not registered

**Example:**

```typescript
const stats = await baselineStore.recalculate('order_value');
console.log(`Mean: ${stats.mean}, StdDev: ${stats.stddev}`);
```

### recalculateAll()

```typescript
async recalculateAll(): Promise<void>
```

Forces immediate recalculation of all registered metrics.

**Example:**

```typescript
await baselineStore.recalculateAll();
```

### getBaseline()

```typescript
getBaseline(metricName: string, groupKey?: string): BaselineStats | undefined
```

Returns cached baseline statistics for a metric.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| metricName | `string` | yes | Metric name |
| groupKey | `string` | no | Group key for per-group baselines |

**Returns:** `BaselineStats | undefined` — Cached statistics or undefined if not computed

**Example:**

```typescript
const stats = baselineStore.getBaseline('order_value');
if (stats) {
  console.log(`Samples: ${stats.sampleCount}, Mean: ${stats.mean}`);
}
```

### checkAnomaly()

```typescript
checkAnomaly(
  metricName: string,
  value: number,
  comparison: BaselineComparison,
  sensitivity?: number,
  groupKey?: string
): AnomalyResult | undefined
```

Checks if a value is anomalous compared to the baseline.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| metricName | `string` | yes | Metric name |
| value | `number` | yes | Current value to check |
| comparison | `BaselineComparison` | yes | Comparison type |
| sensitivity | `number` | no | Sensitivity threshold (default: `defaultSensitivity` from config) |
| groupKey | `string` | no | Group key for per-group baselines |

**Returns:** `AnomalyResult | undefined` — Anomaly result or undefined if baseline not available or insufficient samples

**Example:**

```typescript
const result = baselineStore.checkAnomaly('order_value', 5000, 'above', 2.5);
if (result?.isAnomaly) {
  console.log(`Anomaly detected: ${result.description}`);
  console.log(`Severity: ${result.severity}, Z-score: ${result.zScore}`);
}
```

### getMetricConfig()

```typescript
getMetricConfig(name: string): BaselineMetricConfig | undefined
```

Returns the configuration for a registered metric.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Metric name |

**Returns:** `BaselineMetricConfig | undefined` — Metric configuration or undefined if not found

### getMetrics()

```typescript
getMetrics(): BaselineMetricConfig[]
```

Returns configurations for all registered metrics.

**Returns:** `BaselineMetricConfig[]` — Array of metric configurations

### getAllBaselines()

```typescript
getAllBaselines(): Map<string, BaselineStats>
```

Returns all cached baseline statistics.

**Returns:** `Map<string, BaselineStats>` — Map of metric keys to statistics

### getStats()

```typescript
getStats(): {
  metricsCount: number;
  totalRecalculations: number;
  anomaliesDetected: number;
}
```

Returns operational statistics for the baseline store.

**Returns:** Object with:
- `metricsCount` — Number of registered metrics
- `totalRecalculations` — Total number of recalculations performed
- `anomaliesDetected` — Total number of anomalies detected

**Example:**

```typescript
const stats = baselineStore.getStats();
console.log(`Metrics: ${stats.metricsCount}`);
console.log(`Recalculations: ${stats.totalRecalculations}`);
console.log(`Anomalies: ${stats.anomaliesDetected}`);
```

### stop()

```typescript
async stop(): Promise<void>
```

Stops all scheduled recalculation intervals. Call when shutting down.

**Example:**

```typescript
await baselineStore.stop();
```

---

## BaselineConfig

```typescript
interface BaselineConfig {
  metrics: BaselineMetricConfig[];
  defaultSensitivity?: number;
  ewmaAlpha?: number;
  minSamples?: number;
}
```

Configuration for the baseline module.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| metrics | `BaselineMetricConfig[]` | — | Array of metric definitions |
| defaultSensitivity | `number` | `2.0` | Default sensitivity (sigma) for anomaly detection |
| ewmaAlpha | `number` | `0.3` | Smoothing factor for EWMA (0-1) |
| minSamples | `number` | `10` | Minimum samples required before anomaly detection |

**Example:**

```typescript
const engine = await RuleEngine.start({
  baseline: {
    metrics: [...],
    defaultSensitivity: 2.5,
    ewmaAlpha: 0.2,
    minSamples: 20,
  },
});
```

---

## BaselineMetricConfig

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

Configuration for a single baseline metric.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | `string` | yes | Unique metric identifier |
| topic | `string` | yes | Event topic to monitor (supports wildcards) |
| field | `string` | yes | Field path in event data to extract values |
| function | `BaselineAggregation` | yes | Aggregation function for samples |
| sampleWindow | `string \| number` | yes | Sample window granularity (`'1m'`, `'5m'`) |
| trainingPeriod | `string \| number` | yes | Training period for baseline (`'7d'`, `'24h'`) |
| recalcInterval | `string \| number` | yes | Recalculation interval (`'1h'`, `'15m'`) |
| method | `BaselineMethod` | yes | Statistical method for baseline |
| groupBy | `string` | no | Field path for per-group baselines |
| seasonal | `SeasonalPeriod` | no | Seasonal pattern consideration |
| filter | `Record<string, unknown>` | no | Event filter criteria |

**Example:**

```typescript
const metricConfig: BaselineMetricConfig = {
  name: 'order_value_by_region',
  topic: 'order.created',
  field: 'total',
  function: 'avg',
  sampleWindow: '5m',
  trainingPeriod: '7d',
  recalcInterval: '1h',
  method: 'zscore',
  groupBy: 'region',
  filter: { status: 'completed' },
};
```

---

## BaselineStats

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

Computed baseline statistics.

| Field | Type | Description |
|-------|------|-------------|
| metric | `string` | Metric name |
| mean | `number` | Arithmetic mean |
| stddev | `number` | Standard deviation (population) |
| median | `number` | Median value (50th percentile) |
| percentiles | `Record<number, number>` | Percentile values (p5, p25, p75, p95, p99) |
| ewma | `number` | Exponentially weighted moving average (if method is `'ewma'`) |
| sampleCount | `number` | Number of samples in computation |
| min | `number` | Minimum observed value |
| max | `number` | Maximum observed value |
| computedAt | `number` | Computation timestamp (Unix ms) |
| dataFrom | `number` | Data range start (Unix ms) |
| dataTo | `number` | Data range end (Unix ms) |
| groupKey | `string` | Group key (if using groupBy) |
| seasonalBucket | `string` | Seasonal bucket identifier |

---

## AnomalyResult

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

Result of anomaly detection.

| Field | Type | Description |
|-------|------|-------------|
| isAnomaly | `boolean` | Whether the value is anomalous |
| currentValue | `number` | The checked value |
| baseline | `BaselineStats` | Baseline statistics used for comparison |
| zScore | `number` | Z-score of the value |
| severity | `string` | Anomaly severity: `'low'` (\|z\| < 2), `'medium'` (\|z\| < 3), `'high'` (\|z\| < 4), `'critical'` (\|z\| >= 4) |
| description | `string` | Human-readable description |

---

## BaselineMethod

```typescript
type BaselineMethod = 'moving_average' | 'ewma' | 'zscore' | 'percentile';
```

Statistical method for baseline computation.

| Value | Description |
|-------|-------------|
| `'moving_average'` | Simple moving average |
| `'ewma'` | Exponentially weighted moving average |
| `'zscore'` | Z-score based detection |
| `'percentile'` | Percentile-based detection |

---

## BaselineComparison

```typescript
type BaselineComparison =
  | 'above'
  | 'below'
  | 'outside'
  | 'above_percentile'
  | 'below_percentile';
```

Comparison type for anomaly detection.

| Value | Description | Sensitivity meaning |
|-------|-------------|---------------------|
| `'above'` | Value > mean + sensitivity × stddev | Number of standard deviations |
| `'below'` | Value < mean - sensitivity × stddev | Number of standard deviations |
| `'outside'` | \|Value - mean\| > sensitivity × stddev | Number of standard deviations |
| `'above_percentile'` | Value > Nth percentile | Percentile number (e.g., 95) |
| `'below_percentile'` | Value < Nth percentile | Percentile number (e.g., 5) |

---

## BaselineAggregation

```typescript
type BaselineAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';
```

Aggregation function for sampling.

| Value | Description |
|-------|-------------|
| `'sum'` | Sum of values in window |
| `'avg'` | Average of values in window |
| `'min'` | Minimum value in window |
| `'max'` | Maximum value in window |
| `'count'` | Count of events in window |

---

## SeasonalPeriod

```typescript
type SeasonalPeriod = 'hourly' | 'daily' | 'weekly' | 'none';
```

Seasonal pattern consideration.

| Value | Description |
|-------|-------------|
| `'hourly'` | Hour-of-day patterns |
| `'daily'` | Day-of-week patterns |
| `'weekly'` | Week-based patterns |
| `'none'` | No seasonal adjustment |

---

## Complete Example

```typescript
import { RuleEngine, Rule, baseline } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  baseline: {
    metrics: [
      {
        name: 'order_value',
        topic: 'order.created',
        field: 'total',
        function: 'avg',
        sampleWindow: '5m',
        trainingPeriod: '7d',
        recalcInterval: '1h',
        method: 'zscore',
      },
      {
        name: 'request_rate',
        topic: 'api.request',
        field: 'duration',
        function: 'count',
        sampleWindow: '1m',
        trainingPeriod: '24h',
        recalcInterval: '15m',
        method: 'zscore',
        groupBy: 'endpoint',
      },
    ],
    defaultSensitivity: 2.5,
    minSamples: 20,
  },
});

// Rule using baseline condition
await engine.registerRule(
  Rule.create('high-value-order')
    .name('High Value Order Alert')
    .when(onEvent('order.created'))
    .if(baseline('order_value').isAnomaly('above', 2.5))
    .then(emit('alert.high_value_order', { severity: 'warning' }))
    .build()
);

// Manual anomaly check
const baselineStore = engine.getBaselineStore();
if (baselineStore) {
  const result = baselineStore.checkAnomaly('order_value', 15000, 'above');
  if (result?.isAnomaly) {
    console.log(`Anomaly: ${result.description}`);
    console.log(`Z-score: ${result.zScore}, Severity: ${result.severity}`);
  }

  // View statistics
  const stats = baselineStore.getBaseline('order_value');
  if (stats) {
    console.log(`Baseline - Mean: ${stats.mean}, StdDev: ${stats.stddev}`);
    console.log(`Range: ${stats.min} - ${stats.max}`);
    console.log(`Samples: ${stats.sampleCount}`);
  }
}

// Cleanup
await engine.stop();
```

---

## Using Baselines in Rules

Baseline conditions can be used in rule definitions via DSL:

```typescript
import { Rule, onEvent, baseline, emit } from '@hamicek/noex-rules';

// Alert when order value exceeds 3 sigma
const rule = Rule.create('anomaly-alert')
  .when(onEvent('order.created'))
  .if(baseline('order_value').isAnomaly('above', 3))
  .then(emit('alert.anomaly'))
  .build();

// Alert when value deviates in either direction
const bidirectionalRule = Rule.create('variance-alert')
  .when(onEvent('metrics.reported'))
  .if(baseline('latency').isAnomaly('outside', 2.5))
  .then(emit('alert.latency_variance'))
  .build();
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator with baseline access
- [DSL Conditions](./11-dsl-conditions.md) — `baseline()` condition builder
- [EventStore](./03-event-store.md) — Source of metric data
- [FactStore](./02-fact-store.md) — Storage for computed baselines
- [Configuration](./30-configuration.md) — Full configuration reference
