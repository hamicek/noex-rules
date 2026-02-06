# Configuration

Complete reference of all configuration options for `@hamicek/noex-rules`.

## Import

```typescript
import type {
  RuleEngineConfig,
  PersistenceConfig,
  TimerPersistenceConfig,
  TracingConfig,
  MetricsConfig,
  OpenTelemetryConfig,
  VersioningConfig,
  BaselineConfig,
  BackwardChainingConfig,
  HotReloadConfig,
  ServerOptions,
} from '@hamicek/noex-rules';
```

---

## RuleEngineConfig

Main configuration for `RuleEngine.start()`.

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
| name | `string` | `"rule-engine"` | Instance name for logging and metrics |
| maxConcurrency | `number` | `10` | Maximum concurrent rule evaluations |
| debounceMs | `number` | `0` | Debounce time for rapid fact changes (0 = disabled) |
| persistence | `PersistenceConfig` | — | Rule persistence configuration |
| services | `Record<string, unknown>` | `{}` | External services for `call_service` actions |
| tracing | `TracingConfig` | — | Debug tracing configuration |
| timerPersistence | `TimerPersistenceConfig` | — | Durable timer persistence |
| audit | `AuditPersistenceConfig` | — | Audit log configuration |
| metrics | `MetricsConfig` | — | Prometheus metrics configuration |
| opentelemetry | `OpenTelemetryConfig` | — | OpenTelemetry tracing configuration |
| hotReload | `HotReloadConfig` | — | Live rule reload configuration |
| versioning | `VersioningConfig` | — | Rule version history configuration |
| baseline | `BaselineConfig` | — | Anomaly detection configuration |
| backwardChaining | `BackwardChainingConfig` | — | Goal-driven query configuration |

**Example:**

```typescript
import { RuleEngine, createMemoryAdapter } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  name: 'order-processor',
  maxConcurrency: 20,
  debounceMs: 50,

  persistence: {
    adapter: createMemoryAdapter(),
    key: 'rules',
    schemaVersion: 1,
  },

  services: {
    emailService: { send: async (to, subject) => { /* ... */ } },
    inventoryService: { reserve: async (sku, qty) => { /* ... */ } },
  },

  tracing: { enabled: true, maxEntries: 1000 },
  metrics: { enabled: true, perRuleMetrics: true },
});
```

---

## PersistenceConfig

Configuration for persisting rules to storage.

```typescript
interface PersistenceConfig {
  adapter: StorageAdapter;
  key?: string;
  schemaVersion?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter (required) |
| key | `string` | `"noex-rules"` | Storage key prefix |
| schemaVersion | `number` | `1` | Schema version for migrations |

**Example:**

```typescript
import { createMemoryAdapter, createFileAdapter } from '@hamicek/noex-rules';

// In-memory (development)
persistence: {
  adapter: createMemoryAdapter(),
}

// File-based (production)
persistence: {
  adapter: createFileAdapter('./data/rules.json'),
  schemaVersion: 2,
}
```

---

## TimerPersistenceConfig

Configuration for durable timers that survive restarts.

```typescript
interface TimerPersistenceConfig {
  adapter: StorageAdapter;
  checkIntervalMs?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter (required) |
| checkIntervalMs | `number` | `1000` | Interval for checking expired timers |

**Example:**

```typescript
timerPersistence: {
  adapter: createFileAdapter('./data/timers.json'),
  checkIntervalMs: 500,
}
```

---

## TracingConfig

Configuration for debug tracing.

```typescript
interface TracingConfig {
  enabled?: boolean;
  maxEntries?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `false` | Enable trace collection |
| maxEntries | `number` | `1000` | Maximum trace entries to keep |

**Example:**

```typescript
tracing: {
  enabled: process.env.NODE_ENV !== 'production',
  maxEntries: 5000,
}
```

---

## AuditPersistenceConfig

Configuration for audit logging.

```typescript
interface AuditPersistenceConfig {
  adapter: StorageAdapter;
  retentionMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxMemoryEntries?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter (required) |
| retentionMs | `number` | `604800000` | Retention period (default: 7 days) |
| batchSize | `number` | `100` | Batch size for writes |
| flushIntervalMs | `number` | `5000` | Flush interval |
| maxMemoryEntries | `number` | `10000` | Max entries in memory buffer |

**Example:**

```typescript
audit: {
  adapter: createFileAdapter('./data/audit.json'),
  retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  batchSize: 50,
  flushIntervalMs: 2000,
}
```

---

## MetricsConfig

Configuration for Prometheus metrics.

```typescript
interface MetricsConfig {
  enabled?: boolean;
  perRuleMetrics?: boolean;
  maxLabeledRules?: number;
  histogramBuckets?: number[];
  prefix?: string;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `false` | Enable metrics collection |
| perRuleMetrics | `boolean` | `false` | Track per-rule execution metrics |
| maxLabeledRules | `number` | `100` | Maximum rules with individual labels |
| histogramBuckets | `number[]` | `[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` | Histogram bucket boundaries |
| prefix | `string` | `"noex_rules"` | Metrics name prefix |

**Example:**

```typescript
metrics: {
  enabled: true,
  perRuleMetrics: true,
  maxLabeledRules: 50,
  histogramBuckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  prefix: 'order_engine',
}
```

---

## OpenTelemetryConfig

Configuration for OpenTelemetry tracing integration.

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;
  serviceName?: string;
  traceConditions?: boolean;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `false` | Enable OpenTelemetry integration |
| serviceName | `string` | `"noex-rules"` | Service name for traces |
| traceConditions | `boolean` | `false` | Create spans for condition evaluations |

**Example:**

```typescript
opentelemetry: {
  enabled: true,
  serviceName: 'order-service',
  traceConditions: true,
}
```

---

## VersioningConfig

Configuration for rule version history.

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;
  maxVersionsPerRule?: number;
  maxAgeMs?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| adapter | `StorageAdapter` | — | Storage adapter (required) |
| maxVersionsPerRule | `number` | `50` | Max versions kept per rule |
| maxAgeMs | `number` | — | Max age for version entries |

**Example:**

```typescript
versioning: {
  adapter: createMemoryAdapter(),
  maxVersionsPerRule: 100,
  maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days
}
```

---

## BaselineConfig

Configuration for anomaly detection baselines.

```typescript
interface BaselineConfig {
  metrics: BaselineMetricConfig[];
  defaultSensitivity?: number;
  ewmaAlpha?: number;
  minSamples?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| metrics | `BaselineMetricConfig[]` | — | Metric definitions (required) |
| defaultSensitivity | `number` | `2` | Default z-score threshold |
| ewmaAlpha | `number` | `0.3` | EWMA smoothing factor (0-1) |
| minSamples | `number` | `30` | Minimum samples before detection |

### BaselineMetricConfig

```typescript
interface BaselineMetricConfig {
  name: string;
  topic: string;
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  sampleWindow: string | number;
  trainingPeriod: string | number;
  recalcInterval: string | number;
  method: 'moving_average' | 'ewma' | 'zscore' | 'percentile';
  groupBy?: string;
  seasonal?: 'hourly' | 'daily' | 'weekly' | 'none';
  filter?: Record<string, unknown>;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| name | `string` | — | Metric identifier (required) |
| topic | `string` | — | Event topic to track (required) |
| field | `string` | — | Payload field to aggregate (required) |
| function | `string` | — | Aggregation function (required) |
| sampleWindow | `string \| number` | — | Window size (required) |
| trainingPeriod | `string \| number` | — | Training data period (required) |
| recalcInterval | `string \| number` | — | Recalculation interval (required) |
| method | `string` | — | Detection method (required) |
| groupBy | `string` | — | Field for grouping |
| seasonal | `string` | `"none"` | Seasonal adjustment |
| filter | `Record<string, unknown>` | — | Event filter |

**Example:**

```typescript
baseline: {
  defaultSensitivity: 2.5,
  minSamples: 100,
  metrics: [
    {
      name: 'order_amount',
      topic: 'order:created',
      field: 'amount',
      function: 'avg',
      sampleWindow: '5m',
      trainingPeriod: '7d',
      recalcInterval: '1h',
      method: 'zscore',
      seasonal: 'hourly',
    },
    {
      name: 'error_rate',
      topic: 'error:occurred',
      field: 'count',
      function: 'count',
      sampleWindow: '1m',
      trainingPeriod: '24h',
      recalcInterval: '15m',
      method: 'ewma',
    },
  ],
}
```

---

## BackwardChainingConfig

Configuration for goal-driven backward chaining queries.

```typescript
interface BackwardChainingConfig {
  maxDepth?: number;
  maxExploredRules?: number;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| maxDepth | `number` | `10` | Maximum recursion depth |
| maxExploredRules | `number` | `100` | Maximum rules to explore |

**Example:**

```typescript
backwardChaining: {
  maxDepth: 15,
  maxExploredRules: 200,
}
```

---

## HotReloadConfig

Configuration for live rule updates.

```typescript
interface HotReloadConfig {
  intervalMs?: number;
  files?: FileSourceConfig;
  storage?: StorageSourceConfig;
  validateBeforeApply?: boolean;
  atomicReload?: boolean;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| intervalMs | `number` | `5000` | Check interval |
| files | `FileSourceConfig` | — | File source configuration |
| storage | `StorageSourceConfig` | — | Storage source configuration |
| validateBeforeApply | `boolean` | `true` | Validate rules before applying |
| atomicReload | `boolean` | `true` | Apply all changes atomically |

### FileSourceConfig

```typescript
interface FileSourceConfig {
  paths: string[];
  patterns?: string[];
  recursive?: boolean;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| paths | `string[]` | — | Directories to watch (required) |
| patterns | `string[]` | `["**/*.yaml", "**/*.yml", "**/*.json"]` | File patterns |
| recursive | `boolean` | `true` | Watch subdirectories |

### StorageSourceConfig

```typescript
interface StorageSourceConfig {
  adapter: StorageAdapter;
  key?: string;
}
```

**Example:**

```typescript
hotReload: {
  intervalMs: 2000,
  files: {
    paths: ['./rules'],
    patterns: ['**/*.yaml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
}
```

---

## ServerOptions

Configuration for `RuleEngineServer.start()`.

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| port | `number` | `3000` | HTTP port |
| host | `string` | `"0.0.0.0"` | Bind address |
| engine | `RuleEngine` | — | Existing engine instance |
| engineConfig | `RuleEngineConfig` | — | Config for new engine |
| cors | `CorsConfig \| boolean` | `true` | CORS configuration |
| graphql | `GraphQLConfig \| boolean` | `true` | GraphQL configuration |
| swagger | `boolean` | `true` | Enable Swagger UI |

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

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `true` | Enable CORS |
| origins | `string[]` | `["*"]` | Allowed origins |
| methods | `string[]` | `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` | Allowed methods |
| headers | `string[]` | `["Content-Type", "Authorization"]` | Allowed headers |
| credentials | `boolean` | `false` | Allow credentials |

### GraphQLConfig

```typescript
interface GraphQLConfig {
  enabled: boolean;
  path?: string;
  playground?: boolean;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| enabled | `boolean` | `true` | Enable GraphQL API |
| path | `string` | `"/graphql"` | GraphQL endpoint path |
| playground | `boolean` | `true` | Enable GraphQL Playground |

**Example:**

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  port: 8080,
  host: 'localhost',

  engineConfig: {
    name: 'api-server',
    metrics: { enabled: true },
  },

  cors: {
    enabled: true,
    origins: ['https://app.example.com'],
    credentials: true,
  },

  graphql: {
    enabled: true,
    playground: process.env.NODE_ENV !== 'production',
  },

  swagger: true,
});
```

---

## Complete Configuration Example

```typescript
import { RuleEngine, createFileAdapter } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  // Core
  name: 'production-engine',
  maxConcurrency: 50,
  debounceMs: 10,

  // Services
  services: {
    userService: myUserService,
    notificationService: myNotificationService,
  },

  // Persistence
  persistence: {
    adapter: createFileAdapter('./data/rules.json'),
    schemaVersion: 3,
  },
  timerPersistence: {
    adapter: createFileAdapter('./data/timers.json'),
    checkIntervalMs: 500,
  },

  // Observability
  tracing: {
    enabled: false,
  },
  metrics: {
    enabled: true,
    perRuleMetrics: true,
    prefix: 'myapp_rules',
  },
  opentelemetry: {
    enabled: true,
    serviceName: 'myapp-rule-engine',
  },

  // Audit
  audit: {
    adapter: createFileAdapter('./data/audit.json'),
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    maxMemoryEntries: 5000,
  },

  // Versioning
  versioning: {
    adapter: createFileAdapter('./data/versions.json'),
    maxVersionsPerRule: 50,
  },

  // Hot Reload
  hotReload: {
    intervalMs: 5000,
    files: {
      paths: ['./rules'],
      patterns: ['**/*.yaml'],
    },
    validateBeforeApply: true,
  },

  // Baseline (Anomaly Detection)
  baseline: {
    defaultSensitivity: 2.5,
    metrics: [
      {
        name: 'transaction_amount',
        topic: 'payment:processed',
        field: 'amount',
        function: 'avg',
        sampleWindow: '5m',
        trainingPeriod: '7d',
        recalcInterval: '1h',
        method: 'zscore',
      },
    ],
  },

  // Backward Chaining
  backwardChaining: {
    maxDepth: 15,
    maxExploredRules: 150,
  },
});
```

---

## See Also

- [Types](./29-types.md) — All type definitions
- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [RuleEngineServer](./28-server.md) — HTTP server
- [Persistence](./18-persistence.md) — Rule persistence
- [Observability](./21-observability.md) — Metrics and tracing
- [Audit Log](./20-audit.md) — Audit logging
- [Hot Reload](./24-hot-reload.md) — Live updates
- [Baseline](./22-baseline.md) — Anomaly detection
