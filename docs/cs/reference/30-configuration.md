# Konfigurace

Kompletní přehled všech konfiguračních možností pro `@hamicek/noex-rules`.

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

Hlavní konfigurace pro `RuleEngine.start()`.

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

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| name | `string` | `"rule-engine"` | Název instance pro logování a metriky |
| maxConcurrency | `number` | `10` | Maximální počet souběžných vyhodnocení pravidel |
| debounceMs | `number` | `0` | Debounce čas pro rychlé změny faktů (0 = vypnuto) |
| persistence | `PersistenceConfig` | — | Konfigurace persistence pravidel |
| services | `Record<string, unknown>` | `{}` | Externí služby pro akce `call_service` |
| tracing | `TracingConfig` | — | Konfigurace debug tracingu |
| timerPersistence | `TimerPersistenceConfig` | — | Persistence trvalých časovačů |
| audit | `AuditPersistenceConfig` | — | Konfigurace audit logu |
| metrics | `MetricsConfig` | — | Konfigurace Prometheus metrik |
| opentelemetry | `OpenTelemetryConfig` | — | Konfigurace OpenTelemetry tracingu |
| hotReload | `HotReloadConfig` | — | Konfigurace živého načítání pravidel |
| versioning | `VersioningConfig` | — | Konfigurace historie verzí pravidel |
| baseline | `BaselineConfig` | — | Konfigurace detekce anomálií |
| backwardChaining | `BackwardChainingConfig` | — | Konfigurace cílových dotazů |

**Příklad:**

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

Konfigurace pro ukládání pravidel do úložiště.

```typescript
interface PersistenceConfig {
  adapter: StorageAdapter;
  key?: string;
  schemaVersion?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Adaptér úložiště (povinný) |
| key | `string` | `"noex-rules"` | Prefix klíče v úložišti |
| schemaVersion | `number` | `1` | Verze schématu pro migrace |

**Příklad:**

```typescript
import { createMemoryAdapter, createFileAdapter } from '@hamicek/noex-rules';

// In-memory (vývoj)
persistence: {
  adapter: createMemoryAdapter(),
}

// Souborový (produkce)
persistence: {
  adapter: createFileAdapter('./data/rules.json'),
  schemaVersion: 2,
}
```

---

## TimerPersistenceConfig

Konfigurace pro trvalé časovače, které přežijí restart.

```typescript
interface TimerPersistenceConfig {
  adapter: StorageAdapter;
  checkIntervalMs?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Adaptér úložiště (povinný) |
| checkIntervalMs | `number` | `1000` | Interval kontroly expirovaných časovačů |

**Příklad:**

```typescript
timerPersistence: {
  adapter: createFileAdapter('./data/timers.json'),
  checkIntervalMs: 500,
}
```

---

## TracingConfig

Konfigurace pro debug tracing.

```typescript
interface TracingConfig {
  enabled?: boolean;
  maxEntries?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `false` | Povolit sběr trace záznamů |
| maxEntries | `number` | `1000` | Maximální počet uchovávaných záznamů |

**Příklad:**

```typescript
tracing: {
  enabled: process.env.NODE_ENV !== 'production',
  maxEntries: 5000,
}
```

---

## AuditPersistenceConfig

Konfigurace pro audit logování.

```typescript
interface AuditPersistenceConfig {
  adapter: StorageAdapter;
  retentionMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxMemoryEntries?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Adaptér úložiště (povinný) |
| retentionMs | `number` | `604800000` | Doba uchování (výchozí: 7 dní) |
| batchSize | `number` | `100` | Velikost dávky pro zápisy |
| flushIntervalMs | `number` | `5000` | Interval proplachování |
| maxMemoryEntries | `number` | `10000` | Max záznamů v paměťovém bufferu |

**Příklad:**

```typescript
audit: {
  adapter: createFileAdapter('./data/audit.json'),
  retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 dní
  batchSize: 50,
  flushIntervalMs: 2000,
}
```

---

## MetricsConfig

Konfigurace pro Prometheus metriky.

```typescript
interface MetricsConfig {
  enabled?: boolean;
  perRuleMetrics?: boolean;
  maxLabeledRules?: number;
  histogramBuckets?: number[];
  prefix?: string;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `false` | Povolit sběr metrik |
| perRuleMetrics | `boolean` | `false` | Sledovat metriky pro jednotlivá pravidla |
| maxLabeledRules | `number` | `100` | Maximum pravidel s individuálními labely |
| histogramBuckets | `number[]` | `[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` | Hranice histogram bucketů |
| prefix | `string` | `"noex_rules"` | Prefix názvů metrik |

**Příklad:**

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

Konfigurace pro integraci s OpenTelemetry tracingem.

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;
  serviceName?: string;
  traceConditions?: boolean;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `false` | Povolit OpenTelemetry integraci |
| serviceName | `string` | `"noex-rules"` | Název služby pro traces |
| traceConditions | `boolean` | `false` | Vytvářet spany pro vyhodnocení podmínek |

**Příklad:**

```typescript
opentelemetry: {
  enabled: true,
  serviceName: 'order-service',
  traceConditions: true,
}
```

---

## VersioningConfig

Konfigurace pro historii verzí pravidel.

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;
  maxVersionsPerRule?: number;
  maxAgeMs?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Adaptér úložiště (povinný) |
| maxVersionsPerRule | `number` | `50` | Max verzí uchovávaných pro pravidlo |
| maxAgeMs | `number` | — | Max stáří záznamů verzí |

**Příklad:**

```typescript
versioning: {
  adapter: createMemoryAdapter(),
  maxVersionsPerRule: 100,
  maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 dní
}
```

---

## BaselineConfig

Konfigurace pro detekci anomálií pomocí baselinů.

```typescript
interface BaselineConfig {
  metrics: BaselineMetricConfig[];
  defaultSensitivity?: number;
  ewmaAlpha?: number;
  minSamples?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| metrics | `BaselineMetricConfig[]` | — | Definice metrik (povinné) |
| defaultSensitivity | `number` | `2` | Výchozí práh z-score |
| ewmaAlpha | `number` | `0.3` | Vyhlazovací faktor EWMA (0-1) |
| minSamples | `number` | `30` | Minimum vzorků před detekcí |

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

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| name | `string` | — | Identifikátor metriky (povinný) |
| topic | `string` | — | Topic události ke sledování (povinný) |
| field | `string` | — | Pole payloadu k agregaci (povinné) |
| function | `string` | — | Agregační funkce (povinná) |
| sampleWindow | `string \| number` | — | Velikost okna (povinná) |
| trainingPeriod | `string \| number` | — | Období trénovacích dat (povinné) |
| recalcInterval | `string \| number` | — | Interval přepočtu (povinný) |
| method | `string` | — | Metoda detekce (povinná) |
| groupBy | `string` | — | Pole pro seskupení |
| seasonal | `string` | `"none"` | Sezónní úprava |
| filter | `Record<string, unknown>` | — | Filtr událostí |

**Příklad:**

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

Konfigurace pro cílové dotazy pomocí zpětného řetězení.

```typescript
interface BackwardChainingConfig {
  maxDepth?: number;
  maxExploredRules?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| maxDepth | `number` | `10` | Maximální hloubka rekurze |
| maxExploredRules | `number` | `100` | Maximum prozkoumávaných pravidel |

**Příklad:**

```typescript
backwardChaining: {
  maxDepth: 15,
  maxExploredRules: 200,
}
```

---

## HotReloadConfig

Konfigurace pro živé aktualizace pravidel.

```typescript
interface HotReloadConfig {
  intervalMs?: number;
  files?: FileSourceConfig;
  storage?: StorageSourceConfig;
  validateBeforeApply?: boolean;
  atomicReload?: boolean;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| intervalMs | `number` | `5000` | Interval kontroly |
| files | `FileSourceConfig` | — | Konfigurace souborového zdroje |
| storage | `StorageSourceConfig` | — | Konfigurace zdroje z úložiště |
| validateBeforeApply | `boolean` | `true` | Validovat pravidla před aplikací |
| atomicReload | `boolean` | `true` | Aplikovat všechny změny atomicky |

### FileSourceConfig

```typescript
interface FileSourceConfig {
  paths: string[];
  patterns?: string[];
  recursive?: boolean;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| paths | `string[]` | — | Adresáře ke sledování (povinné) |
| patterns | `string[]` | `["**/*.yaml", "**/*.yml", "**/*.json"]` | Vzory souborů |
| recursive | `boolean` | `true` | Sledovat podadresáře |

### StorageSourceConfig

```typescript
interface StorageSourceConfig {
  adapter: StorageAdapter;
  key?: string;
}
```

**Příklad:**

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

Konfigurace pro `RuleEngineServer.start()`.

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

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| port | `number` | `3000` | HTTP port |
| host | `string` | `"0.0.0.0"` | Bind adresa |
| engine | `RuleEngine` | — | Existující instance enginu |
| engineConfig | `RuleEngineConfig` | — | Konfigurace pro nový engine |
| cors | `CorsConfig \| boolean` | `true` | Konfigurace CORS |
| graphql | `GraphQLConfig \| boolean` | `true` | Konfigurace GraphQL |
| swagger | `boolean` | `true` | Povolit Swagger UI |

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

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `true` | Povolit CORS |
| origins | `string[]` | `["*"]` | Povolené originy |
| methods | `string[]` | `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` | Povolené metody |
| headers | `string[]` | `["Content-Type", "Authorization"]` | Povolené hlavičky |
| credentials | `boolean` | `false` | Povolit credentials |

### GraphQLConfig

```typescript
interface GraphQLConfig {
  enabled: boolean;
  path?: string;
  playground?: boolean;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `true` | Povolit GraphQL API |
| path | `string` | `"/graphql"` | Cesta GraphQL endpointu |
| playground | `boolean` | `true` | Povolit GraphQL Playground |

**Příklad:**

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

## Kompletní příklad konfigurace

```typescript
import { RuleEngine, createFileAdapter } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  // Základ
  name: 'production-engine',
  maxConcurrency: 50,
  debounceMs: 10,

  // Služby
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

  // Observabilita
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

  // Verzování
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

  // Baseline (Detekce anomálií)
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

  // Zpětné řetězení
  backwardChaining: {
    maxDepth: 15,
    maxExploredRules: 150,
  },
});
```

---

## Viz také

- [Typy](./29-types.md) — Všechny definice typů
- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [RuleEngineServer](./28-server.md) — HTTP server
- [Persistence](./18-persistence.md) — Persistence pravidel
- [Observabilita](./21-observability.md) — Metriky a tracing
- [Audit Log](./20-audit.md) — Audit logování
- [Hot Reload](./24-hot-reload.md) — Živé aktualizace
- [Baseline](./22-baseline.md) — Detekce anomálií
