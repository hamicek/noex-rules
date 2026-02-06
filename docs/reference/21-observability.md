# Observability

Prometheus-compatible metrics collection and OpenTelemetry tracing for production monitoring. MetricsCollector exposes counters, gauges, and histograms in Prometheus format. OpenTelemetryBridge integrates with `@opentelemetry/api` for distributed tracing.

## Import

```typescript
import {
  MetricsCollector,
  OpenTelemetryBridge,
  formatMetrics,
  escapeLabelValue,
  // Types
  MetricsConfig,
  OpenTelemetryConfig,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  HistogramSample,
  MetricLabels,
  LabeledValue,
  // Constants
  DEFAULT_HISTOGRAM_BUCKETS,
  DEFAULT_METRICS_PREFIX,
} from '@hamicek/noex-rules';
```

---

## MetricsCollector

Collects Prometheus-compatible metrics from TraceCollector events. Maintains counters, gauges (read lazily from engine stats), and histograms with configurable bucket boundaries. Supports per-rule metric labels with cardinality protection.

### Constructor

```typescript
constructor(
  traceCollector: TraceCollector,
  statsProvider: () => EngineStats,
  config?: MetricsConfig
)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| traceCollector | `TraceCollector` | yes | Source of trace events to consume |
| statsProvider | `() => EngineStats` | yes | Callback returning current engine statistics for gauge values |
| config | `MetricsConfig` | no | Configuration options |

**Note:** In typical usage, MetricsCollector is created internally by RuleEngine and accessed via `engine.getMetricsCollector()`.

**Example:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  metrics: {
    enabled: true,
    perRuleMetrics: true,
    maxLabeledRules: 50,
  },
});

const metrics = engine.getMetricsCollector();
```

### getCounters()

```typescript
getCounters(): CounterMetric[]
```

Returns a snapshot of all counter metrics with their current values.

**Returns:** `CounterMetric[]` — Array of counter metrics

**Tracked counters:**
- `rules_triggered_total` — Number of times rules were triggered
- `rules_executed_total` — Number of successful rule executions
- `rules_skipped_total` — Number of skipped rule evaluations
- `rules_failed_total` — Number of failed rule executions
- `events_processed_total` — Number of events processed
- `facts_changed_total` — Number of fact changes
- `actions_executed_total` — Number of actions executed
- `actions_failed_total` — Number of failed actions
- `conditions_evaluated_total` — Number of condition evaluations

**Example:**

```typescript
const counters = metrics.getCounters();
for (const counter of counters) {
  console.log(`${counter.name}: ${counter.help}`);
  for (const { labels, value } of counter.values) {
    console.log(`  ${JSON.stringify(labels)}: ${value}`);
  }
}
```

### getGauges()

```typescript
getGauges(): GaugeMetric[]
```

Returns gauge metrics read lazily from the current engine state.

**Returns:** `GaugeMetric[]` — Array of gauge metrics

**Tracked gauges:**
- `active_rules` — Number of currently registered rules
- `active_facts` — Number of facts in the fact store
- `active_timers` — Number of active timers
- `trace_buffer_utilization` — Percentage of trace buffer used

**Example:**

```typescript
const gauges = metrics.getGauges();
for (const gauge of gauges) {
  console.log(`${gauge.name}: ${gauge.value}`);
}
```

### getHistograms()

```typescript
getHistograms(): HistogramMetric[]
```

Returns a snapshot of all histogram metrics with bucket counts.

**Returns:** `HistogramMetric[]` — Array of histogram metrics

**Tracked histograms:**
- `evaluation_duration_seconds` — Rule evaluation duration
- `condition_duration_seconds` — Condition evaluation duration
- `action_duration_seconds` — Action execution duration

**Example:**

```typescript
const histograms = metrics.getHistograms();
for (const histogram of histograms) {
  console.log(`${histogram.name} buckets: ${histogram.buckets.join(', ')}`);
  for (const sample of histogram.samples) {
    console.log(`  count=${sample.count}, sum=${sample.sum}`);
  }
}
```

### reset()

```typescript
reset(): void
```

Resets all collected metric data. Subscription to TraceCollector remains active.

**Example:**

```typescript
metrics.reset();
```

### stop()

```typescript
stop(): void
```

Disconnects from TraceCollector. Call when shutting down or when metrics are no longer needed.

**Example:**

```typescript
metrics.stop();
```

---

## OpenTelemetryBridge

Bridges TraceCollector events to OpenTelemetry spans. Creates hierarchical span trees: `event_processing` → `rule_evaluation` → `action_execution`. Requires `@opentelemetry/api` package to be installed.

### Constructor

```typescript
constructor(config?: OpenTelemetryConfig, apiLoader?: OTelApiLoader)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| config | `OpenTelemetryConfig` | no | Configuration options |
| apiLoader | `OTelApiLoader` | no | Custom loader for OpenTelemetry API (defaults to dynamic import) |

**Example:**

```typescript
import { OpenTelemetryBridge } from '@hamicek/noex-rules';

const bridge = new OpenTelemetryBridge({
  serviceName: 'my-rule-engine',
  traceConditions: true,
});
```

### start()

```typescript
async start(traceCollector: TraceCollector): Promise<boolean>
```

Loads the OpenTelemetry API and starts subscribing to trace events. Returns `false` if `@opentelemetry/api` is not installed.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| traceCollector | `TraceCollector` | yes | Source of trace events |

**Returns:** `Promise<boolean>` — `true` if successfully started, `false` if OpenTelemetry is unavailable

**Example:**

```typescript
const started = await bridge.start(engine.getTraceCollector());
if (!started) {
  console.warn('OpenTelemetry not available - tracing disabled');
}
```

### stop()

```typescript
stop(): void
```

Disconnects from TraceCollector and ends all open spans.

**Example:**

```typescript
bridge.stop();
```

### isActive

```typescript
get isActive(): boolean
```

Whether the bridge is currently active and producing spans.

**Example:**

```typescript
if (bridge.isActive) {
  console.log('OpenTelemetry tracing is active');
}
```

---

## formatMetrics()

```typescript
function formatMetrics(
  counters: CounterMetric[],
  gauges: GaugeMetric[],
  histograms: HistogramMetric[],
  prefix?: string
): string
```

Serializes metrics to Prometheus text exposition format (version 0.0.4).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| counters | `CounterMetric[]` | yes | Counter metrics to format |
| gauges | `GaugeMetric[]` | yes | Gauge metrics to format |
| histograms | `HistogramMetric[]` | yes | Histogram metrics to format |
| prefix | `string` | no | Metric name prefix (default: `'noex_rules'`) |

**Returns:** `string` — Prometheus-formatted metrics text

**Example:**

```typescript
import { formatMetrics } from '@hamicek/noex-rules';

const metrics = engine.getMetricsCollector();
const text = formatMetrics(
  metrics.getCounters(),
  metrics.getGauges(),
  metrics.getHistograms(),
  'myapp'
);

// Serve at /metrics endpoint
res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
res.send(text);
```

---

## escapeLabelValue()

```typescript
function escapeLabelValue(value: string): string
```

Escapes a string for use as a Prometheus label value. Handles backslashes, double quotes, and newlines.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `string` | yes | Raw label value |

**Returns:** `string` — Escaped label value safe for Prometheus format

**Example:**

```typescript
import { escapeLabelValue } from '@hamicek/noex-rules';

const safe = escapeLabelValue('rule "test"\nwith newline');
// Returns: rule \"test\"\nwith newline
```

---

## MetricsConfig

```typescript
interface MetricsConfig {
  enabled?: boolean;
  perRuleMetrics?: boolean;
  maxLabeledRules?: number;
  histogramBuckets?: number[];
  prefix?: string;
}
```

Configuration for MetricsCollector.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `false` | Whether metrics collection is enabled |
| perRuleMetrics | `boolean` | `false` | Enable per-rule labels on counters |
| maxLabeledRules | `number` | `100` | Maximum distinct rule IDs to track in labels (cardinality protection) |
| histogramBuckets | `number[]` | `DEFAULT_HISTOGRAM_BUCKETS` | Custom histogram bucket boundaries |
| prefix | `string` | `'noex_rules'` | Metric name prefix |

**Example:**

```typescript
const engine = await RuleEngine.start({
  metrics: {
    enabled: true,
    perRuleMetrics: true,
    maxLabeledRules: 200,
    histogramBuckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    prefix: 'myapp_rules',
  },
});
```

---

## OpenTelemetryConfig

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;
  serviceName?: string;
  traceConditions?: boolean;
}
```

Configuration for OpenTelemetryBridge.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `false` | Whether OpenTelemetry integration is enabled |
| serviceName | `string` | `'noex-rules'` | Service name for spans |
| traceConditions | `boolean` | `false` | Create spans for individual condition evaluations (high cardinality) |

**Example:**

```typescript
const engine = await RuleEngine.start({
  opentelemetry: {
    enabled: true,
    serviceName: 'order-processing-rules',
    traceConditions: false,
  },
});
```

---

## CounterMetric

```typescript
interface CounterMetric {
  name: string;
  help: string;
  values: LabeledValue[];
}
```

A Prometheus counter metric with labeled values.

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Metric name (without prefix) |
| help | `string` | Human-readable description |
| values | `LabeledValue[]` | Values with associated label sets |

---

## GaugeMetric

```typescript
interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}
```

A Prometheus gauge metric.

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Metric name (without prefix) |
| help | `string` | Human-readable description |
| value | `number` | Current value |

---

## HistogramMetric

```typescript
interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  samples: HistogramSample[];
}
```

A Prometheus histogram metric.

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Metric name (without prefix) |
| help | `string` | Human-readable description |
| buckets | `number[]` | Bucket boundaries (sorted ascending) |
| samples | `HistogramSample[]` | Samples with label sets |

---

## HistogramSample

```typescript
interface HistogramSample {
  labels: MetricLabels;
  count: number;
  sum: number;
  bucketCounts: number[];
}
```

A single histogram sample with cumulative bucket counts.

| Field | Type | Description |
|-------|------|-------------|
| labels | `MetricLabels` | Label set for this sample |
| count | `number` | Total number of observations |
| sum | `number` | Sum of all observed values |
| bucketCounts | `number[]` | Cumulative count for each bucket boundary |

---

## MetricLabels

```typescript
type MetricLabels = Record<string, string>;
```

Key-value pairs for metric labels.

---

## LabeledValue

```typescript
interface LabeledValue {
  labels: MetricLabels;
  value: number;
}
```

A metric value with associated labels.

| Field | Type | Description |
|-------|------|-------------|
| labels | `MetricLabels` | Label set |
| value | `number` | Metric value |

---

## Constants

### DEFAULT_HISTOGRAM_BUCKETS

```typescript
const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
];
```

Default bucket boundaries for histogram metrics, optimized for typical rule evaluation durations in seconds.

### DEFAULT_METRICS_PREFIX

```typescript
const DEFAULT_METRICS_PREFIX = 'noex_rules';
```

Default prefix for all metric names.

---

## Complete Example

```typescript
import { RuleEngine, formatMetrics } from '@hamicek/noex-rules';
import { createServer } from 'http';

// Start engine with metrics enabled
const engine = await RuleEngine.start({
  metrics: {
    enabled: true,
    perRuleMetrics: true,
    maxLabeledRules: 100,
  },
  opentelemetry: {
    enabled: true,
    serviceName: 'order-rules',
  },
});

// Create /metrics endpoint
const server = createServer((req, res) => {
  if (req.url === '/metrics') {
    const collector = engine.getMetricsCollector();
    if (collector) {
      const text = formatMetrics(
        collector.getCounters(),
        collector.getGauges(),
        collector.getHistograms()
      );
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.end(text);
    } else {
      res.statusCode = 503;
      res.end('Metrics not available');
    }
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(9090, () => {
  console.log('Metrics available at http://localhost:9090/metrics');
});

// Register rules and emit events - metrics are collected automatically
await engine.registerRule({
  id: 'order-total',
  name: 'Order Total Check',
  triggers: [{ type: 'event', topic: 'order.created' }],
  conditions: [{ source: 'event', field: 'total', operator: 'gt', value: 1000 }],
  actions: [{ type: 'emit_event', topic: 'order.high_value' }],
});

await engine.emit('order.created', { orderId: '123', total: 1500 });

// View metrics
const collector = engine.getMetricsCollector();
if (collector) {
  const counters = collector.getCounters();
  const rulesTriggered = counters.find(c => c.name === 'rules_triggered_total');
  console.log('Rules triggered:', rulesTriggered?.values);
}

// Cleanup
await engine.stop();
server.close();
```

---

## Span Hierarchy

When OpenTelemetry is enabled, spans are created in the following hierarchy:

```
event_processing (correlationId)
  └─ rule_evaluation (ruleId)
       ├─ condition_evaluation (optional, if traceConditions enabled)
       └─ action_execution (actionIndex)
```

Each span includes relevant attributes:
- `event_processing`: `event.topic`, `correlation.id`
- `rule_evaluation`: `rule.id`, `rule.name`, `rule.priority`
- `action_execution`: `action.type`, `action.index`
- `condition_evaluation`: `condition.source`, `condition.operator`

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator with metrics/tracing access
- [Audit](./20-audit.md) — Persistent audit logging
- [REST API](./25-rest-api.md) — `/metrics` endpoint
- [Configuration](./30-configuration.md) — Full configuration reference
