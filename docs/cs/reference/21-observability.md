# Observability

Sběr metrik kompatibilních s Prometheus a OpenTelemetry tracing pro produkční monitoring. MetricsCollector exportuje countery, gauge a histogramy ve formátu Prometheus. OpenTelemetryBridge integruje s `@opentelemetry/api` pro distribuovaný tracing.

## Import

```typescript
import {
  MetricsCollector,
  OpenTelemetryBridge,
  formatMetrics,
  escapeLabelValue,
  // Typy
  MetricsConfig,
  OpenTelemetryConfig,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  HistogramSample,
  MetricLabels,
  LabeledValue,
  // Konstanty
  DEFAULT_HISTOGRAM_BUCKETS,
  DEFAULT_METRICS_PREFIX,
} from '@hamicek/noex-rules';
```

---

## MetricsCollector

Sbírá metriky kompatibilní s Prometheus z událostí TraceCollectoru. Udržuje countery, gauge (čteny lazy ze statistik enginu) a histogramy s konfigurovatelným hranicemi bucketů. Podporuje per-rule labely s ochranou proti vysoké kardinalitě.

### Konstruktor

```typescript
constructor(
  traceCollector: TraceCollector,
  statsProvider: () => EngineStats,
  config?: MetricsConfig
)
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| traceCollector | `TraceCollector` | ano | Zdroj trace událostí ke konzumaci |
| statsProvider | `() => EngineStats` | ano | Callback vracející aktuální statistiky enginu pro hodnoty gauge |
| config | `MetricsConfig` | ne | Konfigurační volby |

**Poznámka:** V typickém použití je MetricsCollector vytvořen interně RuleEnginem a přístupný přes `engine.getMetricsCollector()`.

**Příklad:**

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

Vrací snapshot všech counter metrik s jejich aktuálními hodnotami.

**Návratová hodnota:** `CounterMetric[]` — Pole counter metrik

**Sledované countery:**
- `rules_triggered_total` — Počet spuštění pravidel
- `rules_executed_total` — Počet úspěšných vykonání pravidel
- `rules_skipped_total` — Počet přeskočených vyhodnocení pravidel
- `rules_failed_total` — Počet selhání pravidel
- `events_processed_total` — Počet zpracovaných událostí
- `facts_changed_total` — Počet změn faktů
- `actions_executed_total` — Počet vykonaných akcí
- `actions_failed_total` — Počet selhání akcí
- `conditions_evaluated_total` — Počet vyhodnocení podmínek

**Příklad:**

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

Vrací gauge metriky čtené lazy z aktuálního stavu enginu.

**Návratová hodnota:** `GaugeMetric[]` — Pole gauge metrik

**Sledované gauge:**
- `active_rules` — Počet aktuálně registrovaných pravidel
- `active_facts` — Počet faktů ve fact store
- `active_timers` — Počet aktivních časovačů
- `trace_buffer_utilization` — Procento využití trace bufferu

**Příklad:**

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

Vrací snapshot všech histogram metrik s počty v bucketech.

**Návratová hodnota:** `HistogramMetric[]` — Pole histogram metrik

**Sledované histogramy:**
- `evaluation_duration_seconds` — Délka vyhodnocení pravidla
- `condition_duration_seconds` — Délka vyhodnocení podmínky
- `action_duration_seconds` — Délka vykonání akce

**Příklad:**

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

Resetuje všechna nasbíraná data metrik. Subscription na TraceCollector zůstává aktivní.

**Příklad:**

```typescript
metrics.reset();
```

### stop()

```typescript
stop(): void
```

Odpojí se od TraceCollectoru. Volejte při shutdownu nebo když metriky již nejsou potřeba.

**Příklad:**

```typescript
metrics.stop();
```

---

## OpenTelemetryBridge

Přemosťuje události TraceCollectoru na OpenTelemetry spany. Vytváří hierarchické stromy spanů: `event_processing` → `rule_evaluation` → `action_execution`. Vyžaduje nainstalovaný balík `@opentelemetry/api`.

### Konstruktor

```typescript
constructor(config?: OpenTelemetryConfig, apiLoader?: OTelApiLoader)
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `OpenTelemetryConfig` | ne | Konfigurační volby |
| apiLoader | `OTelApiLoader` | ne | Vlastní loader pro OpenTelemetry API (výchozí je dynamický import) |

**Příklad:**

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

Načte OpenTelemetry API a začne odebírat trace události. Vrací `false`, pokud není nainstalován `@opentelemetry/api`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| traceCollector | `TraceCollector` | ano | Zdroj trace událostí |

**Návratová hodnota:** `Promise<boolean>` — `true` pokud úspěšně spuštěno, `false` pokud OpenTelemetry není dostupný

**Příklad:**

```typescript
const started = await bridge.start(engine.getTraceCollector());
if (!started) {
  console.warn('OpenTelemetry není dostupný - tracing vypnut');
}
```

### stop()

```typescript
stop(): void
```

Odpojí se od TraceCollectoru a ukončí všechny otevřené spany.

**Příklad:**

```typescript
bridge.stop();
```

### isActive

```typescript
get isActive(): boolean
```

Zda je bridge aktuálně aktivní a produkuje spany.

**Příklad:**

```typescript
if (bridge.isActive) {
  console.log('OpenTelemetry tracing je aktivní');
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

Serializuje metriky do Prometheus text exposition formátu (verze 0.0.4).

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| counters | `CounterMetric[]` | ano | Counter metriky k formátování |
| gauges | `GaugeMetric[]` | ano | Gauge metriky k formátování |
| histograms | `HistogramMetric[]` | ano | Histogram metriky k formátování |
| prefix | `string` | ne | Prefix názvů metrik (výchozí: `'noex_rules'`) |

**Návratová hodnota:** `string` — Text metrik ve formátu Prometheus

**Příklad:**

```typescript
import { formatMetrics } from '@hamicek/noex-rules';

const metrics = engine.getMetricsCollector();
const text = formatMetrics(
  metrics.getCounters(),
  metrics.getGauges(),
  metrics.getHistograms(),
  'myapp'
);

// Servírovat na /metrics endpointu
res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
res.send(text);
```

---

## escapeLabelValue()

```typescript
function escapeLabelValue(value: string): string
```

Escapuje string pro použití jako Prometheus label hodnota. Ošetřuje zpětná lomítka, dvojité uvozovky a nové řádky.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `string` | ano | Surová label hodnota |

**Návratová hodnota:** `string` — Escapovaná label hodnota bezpečná pro Prometheus formát

**Příklad:**

```typescript
import { escapeLabelValue } from '@hamicek/noex-rules';

const safe = escapeLabelValue('rule "test"\nwith newline');
// Vrací: rule \"test\"\nwith newline
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

Konfigurace pro MetricsCollector.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `false` | Zda je sběr metrik povolen |
| perRuleMetrics | `boolean` | `false` | Povolit per-rule labely na counterech |
| maxLabeledRules | `number` | `100` | Maximum různých rule ID ke sledování v labelech (ochrana kardinality) |
| histogramBuckets | `number[]` | `DEFAULT_HISTOGRAM_BUCKETS` | Vlastní hranice histogram bucketů |
| prefix | `string` | `'noex_rules'` | Prefix názvů metrik |

**Příklad:**

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

Konfigurace pro OpenTelemetryBridge.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `false` | Zda je OpenTelemetry integrace povolena |
| serviceName | `string` | `'noex-rules'` | Název služby pro spany |
| traceConditions | `boolean` | `false` | Vytvářet spany pro jednotlivá vyhodnocení podmínek (vysoká kardinalita) |

**Příklad:**

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

Prometheus counter metrika s labelovanými hodnotami.

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Název metriky (bez prefixu) |
| help | `string` | Lidsky čitelný popis |
| values | `LabeledValue[]` | Hodnoty s přidruženými sadami labelů |

---

## GaugeMetric

```typescript
interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}
```

Prometheus gauge metrika.

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Název metriky (bez prefixu) |
| help | `string` | Lidsky čitelný popis |
| value | `number` | Aktuální hodnota |

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

Prometheus histogram metrika.

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Název metriky (bez prefixu) |
| help | `string` | Lidsky čitelný popis |
| buckets | `number[]` | Hranice bucketů (seřazeno vzestupně) |
| samples | `HistogramSample[]` | Samply se sadami labelů |

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

Jednotlivý histogram sample s kumulativními počty v bucketech.

| Pole | Typ | Popis |
|------|-----|-------|
| labels | `MetricLabels` | Sada labelů pro tento sample |
| count | `number` | Celkový počet pozorování |
| sum | `number` | Součet všech pozorovaných hodnot |
| bucketCounts | `number[]` | Kumulativní počet pro každou hranici bucketu |

---

## MetricLabels

```typescript
type MetricLabels = Record<string, string>;
```

Klíč-hodnota páry pro labely metrik.

---

## LabeledValue

```typescript
interface LabeledValue {
  labels: MetricLabels;
  value: number;
}
```

Hodnota metriky s přidruženými labely.

| Pole | Typ | Popis |
|------|-----|-------|
| labels | `MetricLabels` | Sada labelů |
| value | `number` | Hodnota metriky |

---

## Konstanty

### DEFAULT_HISTOGRAM_BUCKETS

```typescript
const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
];
```

Výchozí hranice bucketů pro histogram metriky, optimalizované pro typické délky vyhodnocení pravidel v sekundách.

### DEFAULT_METRICS_PREFIX

```typescript
const DEFAULT_METRICS_PREFIX = 'noex_rules';
```

Výchozí prefix pro všechny názvy metrik.

---

## Kompletní příklad

```typescript
import { RuleEngine, formatMetrics } from '@hamicek/noex-rules';
import { createServer } from 'http';

// Spustit engine s povolenými metrikami
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

// Vytvořit /metrics endpoint
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
      res.end('Metriky nejsou dostupné');
    }
  } else {
    res.statusCode = 404;
    res.end('Nenalezeno');
  }
});

server.listen(9090, () => {
  console.log('Metriky dostupné na http://localhost:9090/metrics');
});

// Registrovat pravidla a emitovat události - metriky se sbírají automaticky
await engine.registerRule({
  id: 'order-total',
  name: 'Order Total Check',
  triggers: [{ type: 'event', topic: 'order.created' }],
  conditions: [{ source: 'event', field: 'total', operator: 'gt', value: 1000 }],
  actions: [{ type: 'emit_event', topic: 'order.high_value' }],
});

await engine.emit('order.created', { orderId: '123', total: 1500 });

// Zobrazit metriky
const collector = engine.getMetricsCollector();
if (collector) {
  const counters = collector.getCounters();
  const rulesTriggered = counters.find(c => c.name === 'rules_triggered_total');
  console.log('Spuštěná pravidla:', rulesTriggered?.values);
}

// Úklid
await engine.stop();
server.close();
```

---

## Hierarchie spanů

Když je OpenTelemetry povolený, spany se vytvářejí v následující hierarchii:

```
event_processing (correlationId)
  └─ rule_evaluation (ruleId)
       ├─ condition_evaluation (volitelné, pokud traceConditions povoleno)
       └─ action_execution (actionIndex)
```

Každý span obsahuje relevantní atributy:
- `event_processing`: `event.topic`, `correlation.id`
- `rule_evaluation`: `rule.id`, `rule.name`, `rule.priority`
- `action_execution`: `action.type`, `action.index`
- `condition_evaluation`: `condition.source`, `condition.operator`

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor s přístupem k metrikám/tracingu
- [Audit](./20-audit.md) — Perzistentní audit logging
- [REST API](./25-rest-api.md) — `/metrics` endpoint
- [Konfigurace](./30-configuration.md) — Kompletní referenční přehled konfigurace
