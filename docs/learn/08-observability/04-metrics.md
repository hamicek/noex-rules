# Metrics and Tracing

Debugging and profiling give you visibility during development. Audit logging gives you a compliance trail. But for production dashboards, alerting, and distributed tracing across services, you need standard observability tooling. noex-rules provides a **MetricsCollector** that exports Prometheus-compatible metrics and an **OpenTelemetryBridge** that maps engine traces to OTel spans.

## What You'll Learn

- How to enable and configure `MetricsCollector`
- All available counters, histograms, and gauges
- Prometheus text exposition format and the `/metrics` endpoint
- How the `OpenTelemetryBridge` maps traces to OTel spans
- Span hierarchy and attribute mapping
- Integrating with Grafana, Prometheus, and Jaeger

## MetricsCollector

The metrics collector subscribes to the `TraceCollector` stream and maintains Prometheus-compatible metrics: counters for event counts, histograms for latency distributions, and gauges for current state.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│ MetricsCollector │
  │               │     │                 │     │                  │
  └──────────────┘     └─────────────────┘     └────────┬─────────┘
                                                         │
                                              ┌──────────┼──────────┐
                                              │          │          │
                                        ┌─────▼─────┐ ┌─▼────────┐ ┌▼───────────┐
                                        │ Counters  │ │Histograms│ │ Gauges     │
                                        └───────────┘ └──────────┘ └────────────┘
                                                         │
                                              ┌──────────▼──────────┐
                                              │  GET /metrics       │
                                              │  (Prometheus text)  │
                                              └─────────────────────┘
```

### Enabling Metrics

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  tracing: { enabled: true },  // Required: metrics derive from traces
  metrics: {
    enabled: true,
    prefix: 'noex_rules',          // Metric name prefix (default)
    perRuleMetrics: false,          // Per-rule histogram labels (default: false)
    maxLabeledRules: 100,           // Cardinality limit for per-rule (default: 100)
    histogramBuckets: [             // Custom histogram buckets in seconds
      0.001, 0.005, 0.01, 0.025, 0.05,
      0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ],
  },
});
```

### MetricsConfig

```typescript
interface MetricsConfig {
  enabled?: boolean;           // Enable metrics collection (default: false)
  perRuleMetrics?: boolean;    // Add rule_id labels to histograms (default: false)
  maxLabeledRules?: number;    // Max distinct rule_id labels (default: 100)
  histogramBuckets?: number[]; // Histogram bucket boundaries in seconds
  prefix?: string;             // Metric name prefix (default: 'noex_rules')
}
```

**Note on `perRuleMetrics`:** Enabling per-rule labels on histograms adds a `rule_id` label to each observation. This provides fine-grained latency data but increases cardinality. The `maxLabeledRules` cap prevents unbounded label growth if rules are created dynamically.

## Available Metrics

### Counters

Counters track cumulative totals that only increase:

| Metric | Description |
|--------|-------------|
| `noex_rules_rules_triggered_total` | Total number of rule triggers |
| `noex_rules_rules_executed_total` | Total number of rule executions (conditions passed) |
| `noex_rules_rules_skipped_total` | Total number of rule skips (conditions failed) |
| `noex_rules_rules_failed_total` | Total number of rule execution failures |
| `noex_rules_events_processed_total` | Total number of events processed |
| `noex_rules_facts_changed_total` | Total number of fact changes |
| `noex_rules_actions_executed_total` | Total number of actions executed successfully |
| `noex_rules_actions_failed_total` | Total number of action failures |
| `noex_rules_conditions_evaluated_total` | Total number of conditions evaluated |

### Histograms

Histograms track value distributions with configurable bucket boundaries:

| Metric | Description |
|--------|-------------|
| `noex_rules_evaluation_duration_seconds` | Rule evaluation duration |
| `noex_rules_condition_duration_seconds` | Condition evaluation duration |
| `noex_rules_action_duration_seconds` | Action execution duration |

When `perRuleMetrics` is enabled, `evaluation_duration_seconds` includes a `rule_id` label for per-rule latency analysis.

### Gauges

Gauges track current values that can go up or down. They're evaluated lazily when metrics are scraped:

| Metric | Description |
|--------|-------------|
| `noex_rules_active_rules` | Current number of registered rules |
| `noex_rules_active_facts` | Current number of facts in the fact store |
| `noex_rules_active_timers` | Current number of active timers |
| `noex_rules_trace_buffer_utilization` | Trace buffer usage ratio (0.0-1.0) |

## Prometheus Text Format

The metrics endpoint returns data in Prometheus text exposition format (v0.0.4):

```text
# HELP noex_rules_rules_triggered_total Total rules triggered
# TYPE noex_rules_rules_triggered_total counter
noex_rules_rules_triggered_total 1542

# HELP noex_rules_rules_executed_total Total rules executed
# TYPE noex_rules_rules_executed_total counter
noex_rules_rules_executed_total 1203

# HELP noex_rules_evaluation_duration_seconds Rule evaluation duration
# TYPE noex_rules_evaluation_duration_seconds histogram
noex_rules_evaluation_duration_seconds_bucket{le="0.001"} 890
noex_rules_evaluation_duration_seconds_bucket{le="0.005"} 1150
noex_rules_evaluation_duration_seconds_bucket{le="0.01"} 1320
noex_rules_evaluation_duration_seconds_bucket{le="0.025"} 1480
noex_rules_evaluation_duration_seconds_bucket{le="+Inf"} 1542
noex_rules_evaluation_duration_seconds_sum 4.872
noex_rules_evaluation_duration_seconds_count 1542

# HELP noex_rules_active_rules Current number of registered rules
# TYPE noex_rules_active_rules gauge
noex_rules_active_rules 12

# HELP noex_rules_active_facts Current number of facts
# TYPE noex_rules_active_facts gauge
noex_rules_active_facts 347
```

### Accessing Metrics Programmatically

```typescript
// Get counter snapshots
const counters = engine.metricsCollector.getCounters();
console.log(`Events processed: ${counters.eventsProcessed}`);
console.log(`Rules triggered: ${counters.rulesTriggered}`);
console.log(`Rules executed: ${counters.rulesExecuted}`);
console.log(`Actions failed: ${counters.actionsFailed}`);

// Get current gauge values
const gauges = engine.metricsCollector.getGauges();
console.log(`Active rules: ${gauges.activeRules}`);
console.log(`Active facts: ${gauges.activeFacts}`);
console.log(`Active timers: ${gauges.activeTimers}`);
console.log(`Buffer utilization: ${(gauges.traceBufferUtilization * 100).toFixed(1)}%`);

// Get histogram snapshots
const histograms = engine.metricsCollector.getHistograms();
const evalHist = histograms.evaluationDuration;
console.log(`Evaluation p50: ${evalHist.p50}s`);
console.log(`Evaluation p99: ${evalHist.p99}s`);
```

## OpenTelemetryBridge

The OpenTelemetry bridge maps engine trace entries to OTel spans, integrating with distributed tracing systems like Jaeger, Zipkin, or Grafana Tempo.

### How It Works

The bridge dynamically imports `@opentelemetry/api` at runtime — there's no compile-time dependency. If the module isn't installed, the bridge silently becomes a no-op.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│  OTel Bridge      │
  │               │     │                 │     │                   │
  └──────────────┘     └─────────────────┘     └─────────┬─────────┘
                                                          │
                                               ┌──────────▼──────────┐
                                               │  @opentelemetry/api │
                                               │  (dynamic import)   │
                                               └──────────┬──────────┘
                                                          │
                                               ┌──────────▼──────────┐
                                               │  OTel Collector /   │
                                               │  Jaeger / Zipkin    │
                                               └─────────────────────┘
```

### Enabling OpenTelemetry

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
  opentelemetry: {
    enabled: true,
    serviceName: 'my-rule-engine',    // OTel service name (default: 'noex-rules')
    traceConditions: false,           // Include condition spans (default: false)
  },
});
```

### OpenTelemetryConfig

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;         // Enable OTel bridge (default: false)
  serviceName?: string;      // OTel service name (default: 'noex-rules')
  traceConditions?: boolean; // Create spans for each condition (default: false)
}
```

**Note on `traceConditions`:** Creating a span for each condition evaluation adds significant overhead. Enable only when investigating specific condition performance issues.

### Span Hierarchy

The bridge creates a hierarchical span structure that mirrors the engine's processing flow:

```text
event_processing (correlationId)
  └─ rule_evaluation (ruleId)
       ├─ condition_evaluation (opt-in, per condition)
       └─ action_execution (per action)
```

### Span Attributes

Each span carries noex-specific attributes:

| Attribute | Span type | Value |
|-----------|-----------|-------|
| `noex.correlation_id` | All | Correlation ID |
| `noex.event.topic` | `event_processing` | Event topic |
| `noex.rule.id` | `rule_evaluation` | Rule ID |
| `noex.rule.name` | `rule_evaluation` | Rule name |
| `noex.rule.skipped` | `rule_evaluation` | Whether conditions failed |
| `noex.rule.skip_reason` | `rule_evaluation` | Why the rule was skipped |
| `noex.action.type` | `action_execution` | Action type (emit_event, etc.) |
| `noex.action.index` | `action_execution` | Action index in rule |
| `noex.condition.index` | `condition_evaluation` | Condition index in rule |
| `noex.condition.passed` | `condition_evaluation` | Whether condition passed |

### Prerequisites

Install the OpenTelemetry SDK before using the bridge:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

Configure the OTel SDK before starting the engine:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'my-rule-engine',
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

// Then start the rule engine with OTel enabled
const engine = await RuleEngine.start({
  tracing: { enabled: true },
  opentelemetry: {
    enabled: true,
    serviceName: 'my-rule-engine',
  },
});
```

## Complete Example: Production Observability Stack

This example sets up the full observability stack: metrics for Prometheus, audit logging for compliance, and tracing for development:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/production.db' });

const engine = await RuleEngine.start({
  // Debug tracing (can be toggled at runtime via REST API)
  tracing: { enabled: true, maxEntries: 50_000 },

  // Prometheus metrics
  metrics: {
    enabled: true,
    prefix: 'myapp_rules',
    perRuleMetrics: true,
    maxLabeledRules: 50,
  },

  // Persistent audit logging
  audit: {
    adapter,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  },

  // OpenTelemetry (requires @opentelemetry/api installed)
  opentelemetry: {
    enabled: true,
    serviceName: 'order-processing',
  },
});

// --- Business rules ---

engine.registerRule(
  Rule.create('validate-order')
    .name('Validate Order')
    .priority(10)
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .if(event('items').exists())
    .then(emit('order.validated', {
      orderId: ref('event.orderId'),
      total: ref('event.total'),
    }))
    .build()
);

engine.registerRule(
  Rule.create('fraud-screen')
    .name('Fraud Screening')
    .priority(20)
    .when(onEvent('order.validated'))
    .if(event('total').gt(500))
    .then(emit('fraud.check_required', {
      orderId: ref('event.orderId'),
      amount: ref('event.total'),
    }))
    .also(log('Fraud screening triggered for order ${event.orderId}'))
    .build()
);

engine.registerRule(
  Rule.create('discount-check')
    .name('Apply Loyalty Discount')
    .priority(5)
    .when(onEvent('order.validated'))
    .if(fact('customer:${event.customerId}:tier').eq('vip'))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.15,
    }))
    .build()
);

// --- Simulate workload ---

engine.setFact('customer:c-1:tier', 'vip');

for (let i = 0; i < 50; i++) {
  await engine.emit('order.created', {
    orderId: `ord-${i}`,
    customerId: 'c-1',
    items: [{ product: 'widget', qty: 1 }],
    total: 100 + Math.random() * 900,
  });
}

// --- Observability outputs ---

// 1. Prometheus metrics
const counters = engine.metricsCollector.getCounters();
console.log('=== Metrics ===');
console.log(`Events processed: ${counters.eventsProcessed}`);
console.log(`Rules triggered: ${counters.rulesTriggered}`);
console.log(`Rules executed: ${counters.rulesExecuted}`);
console.log(`Actions failed: ${counters.actionsFailed}`);

// 2. Profiling summary
const summary = engine.profiler.getSummary();
console.log('\n=== Profiling ===');
console.log(`Avg rule time: ${summary.avgRuleTimeMs.toFixed(3)}ms`);
if (summary.slowestRule) {
  console.log(`Slowest: ${summary.slowestRule.ruleName}`);
}

// 3. Audit trail
const auditStats = engine.auditLog.getStats();
console.log('\n=== Audit ===');
console.log(`Total entries: ${auditStats.totalEntries}`);
for (const [cat, count] of Object.entries(auditStats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

await engine.auditLog.flush();
await engine.stop();
```

## REST API Endpoint

When using `RuleEngineServer`, the metrics endpoint is available at:

| Method | Path | Content-Type | Description |
|--------|------|-------------|-------------|
| `GET` | `/metrics` | `text/plain; version=0.0.4` | Prometheus scrape endpoint |

### Prometheus Configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'noex-rules'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
```

### Grafana Dashboard Queries

Common PromQL queries for a Grafana dashboard:

```promql
# Rule execution rate (per second)
rate(noex_rules_rules_executed_total[5m])

# Rule failure rate
rate(noex_rules_rules_failed_total[5m])

# p99 evaluation latency
histogram_quantile(0.99, rate(noex_rules_evaluation_duration_seconds_bucket[5m]))

# Action success ratio
1 - (rate(noex_rules_actions_failed_total[5m]) / rate(noex_rules_actions_executed_total[5m]))

# Active rules (gauge)
noex_rules_active_rules
```

## Exercise

Set up a production-ready observability configuration for a payment processing rule engine:

1. Start an engine with all observability features enabled:
   - Tracing (50,000 entries)
   - Metrics (with `payments` prefix, per-rule metrics enabled)
   - Audit logging (SQLite, 180-day retention)
2. Register three rules:
   - `payment-validator` that validates `event.amount > 0` on `payment.initiated`
   - `high-value-flag` that flags payments over $10,000 on `payment.initiated`
   - `payment-tracker` that updates a fact counter on `payment.initiated`
3. Simulate 100 payments with random amounts (100-20,000)
4. Print metrics counters, the profiling summary, and audit stats

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, log, ref, event, fact } from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/payments.db' });

const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 50_000 },
  metrics: {
    enabled: true,
    prefix: 'payments',
    perRuleMetrics: true,
  },
  audit: {
    adapter,
    retentionMs: 180 * 24 * 60 * 60 * 1000, // 180 days
  },
});

// Validate payment
engine.registerRule(
  Rule.create('payment-validator')
    .name('Payment Validator')
    .priority(10)
    .when(onEvent('payment.initiated'))
    .if(event('amount').gt(0))
    .then(emit('payment.validated', {
      paymentId: ref('event.paymentId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// Flag high-value payments
engine.registerRule(
  Rule.create('high-value-flag')
    .name('High Value Flag')
    .priority(20)
    .when(onEvent('payment.initiated'))
    .if(event('amount').gt(10_000))
    .then(emit('payment.high_value', {
      paymentId: ref('event.paymentId'),
      amount: ref('event.amount'),
    }))
    .also(log('High value payment: $${event.amount}'))
    .build()
);

// Track payment count
engine.registerRule(
  Rule.create('payment-tracker')
    .name('Payment Tracker')
    .priority(1)
    .when(onEvent('payment.initiated'))
    .then(setFact('payments:count', '${(parseInt(fact.value || "0") + 1)}'))
    .build()
);

// Simulate 100 payments
for (let i = 0; i < 100; i++) {
  await engine.emit('payment.initiated', {
    paymentId: `pay-${i}`,
    amount: 100 + Math.random() * 19900, // 100-20,000
    currency: 'USD',
  });
}

// --- Results ---

console.log('=== Metrics Counters ===');
const counters = engine.metricsCollector.getCounters();
console.log(`Events processed: ${counters.eventsProcessed}`);
console.log(`Rules triggered: ${counters.rulesTriggered}`);
console.log(`Rules executed: ${counters.rulesExecuted}`);
console.log(`Rules skipped: ${counters.rulesSkipped}`);
console.log(`Actions executed: ${counters.actionsExecuted}`);
console.log(`Actions failed: ${counters.actionsFailed}`);

console.log('\n=== Profiling Summary ===');
const summary = engine.profiler.getSummary();
console.log(`Rules profiled: ${summary.totalRulesProfiled}`);
console.log(`Total triggers: ${summary.totalTriggers}`);
console.log(`Avg time: ${summary.avgRuleTimeMs.toFixed(3)}ms`);
if (summary.slowestRule) {
  console.log(`Slowest: ${summary.slowestRule.ruleName} (${summary.slowestRule.avgTimeMs.toFixed(3)}ms)`);
}

console.log('\n=== Audit Stats ===');
const auditStats = engine.auditLog.getStats();
console.log(`Total entries: ${auditStats.totalEntries}`);
for (const [cat, count] of Object.entries(auditStats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

await engine.auditLog.flush();
await engine.stop();
```

The `high-value-flag` rule shows a lower pass rate (roughly 50% depending on random amounts) while `payment-validator` and `payment-tracker` execute on every event. The audit trail contains entries for rule registration, all executions, and fact changes.

</details>

## Summary

- **`MetricsCollector`** subscribes to `TraceCollector` and maintains Prometheus-compatible counters, histograms, and gauges
- Enable via `metrics: { enabled: true }` in `RuleEngine.start()` (requires tracing to be enabled)
- **9 counters** track cumulative totals: triggers, executions, skips, failures, events, facts, actions, and conditions
- **3 histograms** track latency distributions for rule evaluation, condition evaluation, and action execution
- **4 gauges** reflect current state: active rules, facts, timers, and trace buffer utilization
- **`perRuleMetrics`** adds `rule_id` labels to histograms (bounded by `maxLabeledRules`)
- The **`/metrics` endpoint** serves Prometheus text exposition format for scraping
- **`OpenTelemetryBridge`** dynamically loads `@opentelemetry/api` and maps trace entries to spans
- Span hierarchy: `event_processing` -> `rule_evaluation` -> `condition_evaluation` / `action_execution`
- The bridge is a **no-op** if `@opentelemetry/api` is not installed — no runtime errors
- Combine metrics, audit, and OTel for a **complete production observability stack**

---

Next: [Forward vs Backward Chaining](../09-backward-chaining/01-forward-vs-backward.md)
