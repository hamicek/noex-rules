# Metriky a tracing

Debugging a profilování vám dají přehled během vývoje. Audit logging vám dá compliance záznam. Ale pro produkční dashboardy, alerting a distribuovaný tracing napříč službami potřebujete standardní observability nástroje. noex-rules poskytuje **MetricsCollector**, který exportuje metriky kompatibilní s Prometheus, a **OpenTelemetryBridge**, který mapuje engine trace na OTel spany.

## Co se naučíte

- Jak povolit a konfigurovat `MetricsCollector`
- Všechny dostupné čítače, histogramy a gaugy
- Prometheus text exposition format a endpoint `/metrics`
- Jak `OpenTelemetryBridge` mapuje trace na OTel spany
- Hierarchie spanů a mapování atributů
- Integrace s Grafana, Prometheus a Jaeger

## MetricsCollector

Metrics collector se přihlásí k odběru streamu `TraceCollector` a udržuje metriky kompatibilní s Prometheus: čítače pro počty událostí, histogramy pro distribuce latencí a gaugy pro aktuální stav.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│ MetricsCollector │
  │               │     │                 │     │                  │
  └──────────────┘     └─────────────────┘     └────────┬─────────┘
                                                         │
                                              ┌──────────┼──────────┐
                                              │          │          │
                                        ┌─────▼─────┐ ┌─▼────────┐ ┌▼───────────┐
                                        │ Čítače    │ │Histogramy│ │ Gaugy      │
                                        └───────────┘ └──────────┘ └────────────┘
                                                         │
                                              ┌──────────▼──────────┐
                                              │  GET /metrics       │
                                              │  (Prometheus text)  │
                                              └─────────────────────┘
```

### Povolení metrik

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  tracing: { enabled: true },  // Povinné: metriky se odvozují z traců
  metrics: {
    enabled: true,
    prefix: 'noex_rules',          // Prefix názvů metrik (výchozí)
    perRuleMetrics: false,          // Štítky per-rule na histogramech (výchozí: false)
    maxLabeledRules: 100,           // Limit kardinality pro per-rule (výchozí: 100)
    histogramBuckets: [             // Vlastní buckety histogramů v sekundách
      0.001, 0.005, 0.01, 0.025, 0.05,
      0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ],
  },
});
```

### MetricsConfig

```typescript
interface MetricsConfig {
  enabled?: boolean;           // Povolit sběr metrik (výchozí: false)
  perRuleMetrics?: boolean;    // Přidat štítky rule_id na histogramy (výchozí: false)
  maxLabeledRules?: number;    // Max různých štítků rule_id (výchozí: 100)
  histogramBuckets?: number[]; // Hranice bucketů histogramů v sekundách
  prefix?: string;             // Prefix názvů metrik (výchozí: 'noex_rules')
}
```

**Poznámka k `perRuleMetrics`:** Povolení per-rule štítků na histogramech přidá štítek `rule_id` ke každému pozorování. To poskytuje jemná data o latencích, ale zvyšuje kardinalitu. Limit `maxLabeledRules` zabraňuje neomezenému růstu štítků, pokud jsou pravidla vytvářena dynamicky.

## Dostupné metriky

### Čítače

Čítače sledují kumulativní součty, které pouze rostou:

| Metrika | Popis |
|---------|-------|
| `noex_rules_rules_triggered_total` | Celkový počet spuštění pravidel |
| `noex_rules_rules_executed_total` | Celkový počet provedení pravidel (podmínky prošly) |
| `noex_rules_rules_skipped_total` | Celkový počet přeskočení pravidel (podmínky selhaly) |
| `noex_rules_rules_failed_total` | Celkový počet selhání provádění pravidel |
| `noex_rules_events_processed_total` | Celkový počet zpracovaných událostí |
| `noex_rules_facts_changed_total` | Celkový počet změn faktů |
| `noex_rules_actions_executed_total` | Celkový počet úspěšně provedených akcí |
| `noex_rules_actions_failed_total` | Celkový počet selhání akcí |
| `noex_rules_conditions_evaluated_total` | Celkový počet vyhodnocených podmínek |

### Histogramy

Histogramy sledují distribuce hodnot s konfigurovatelnými hranicemi bucketů:

| Metrika | Popis |
|---------|-------|
| `noex_rules_evaluation_duration_seconds` | Doba vyhodnocení pravidla |
| `noex_rules_condition_duration_seconds` | Doba vyhodnocení podmínky |
| `noex_rules_action_duration_seconds` | Doba provádění akce |

Když je povoleno `perRuleMetrics`, `evaluation_duration_seconds` obsahuje štítek `rule_id` pro analýzu latence jednotlivých pravidel.

### Gaugy

Gaugy sledují aktuální hodnoty, které mohou růst i klesat. Vyhodnocují se líně při scrapování metrik:

| Metrika | Popis |
|---------|-------|
| `noex_rules_active_rules` | Aktuální počet registrovaných pravidel |
| `noex_rules_active_facts` | Aktuální počet faktů ve fact store |
| `noex_rules_active_timers` | Aktuální počet aktivních časovačů |
| `noex_rules_trace_buffer_utilization` | Poměr využití trace bufferu (0.0-1.0) |

## Prometheus textový formát

Endpoint metrik vrací data ve formátu Prometheus text exposition (v0.0.4):

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

### Programatický přístup k metrikám

```typescript
// Získat snapshoty čítačů
const counters = engine.metricsCollector.getCounters();
console.log(`Zpracovaných událostí: ${counters.eventsProcessed}`);
console.log(`Spuštěných pravidel: ${counters.rulesTriggered}`);
console.log(`Provedených pravidel: ${counters.rulesExecuted}`);
console.log(`Selhalých akcí: ${counters.actionsFailed}`);

// Získat aktuální hodnoty gaugu
const gauges = engine.metricsCollector.getGauges();
console.log(`Aktivní pravidla: ${gauges.activeRules}`);
console.log(`Aktivní fakta: ${gauges.activeFacts}`);
console.log(`Aktivní časovače: ${gauges.activeTimers}`);
console.log(`Využití bufferu: ${(gauges.traceBufferUtilization * 100).toFixed(1)}%`);

// Získat snapshoty histogramů
const histograms = engine.metricsCollector.getHistograms();
const evalHist = histograms.evaluationDuration;
console.log(`Vyhodnocení p50: ${evalHist.p50}s`);
console.log(`Vyhodnocení p99: ${evalHist.p99}s`);
```

## OpenTelemetryBridge

OpenTelemetry bridge mapuje engine trace záznamy na OTel spany a integruje se s distribuovanými tracing systémy jako Jaeger, Zipkin nebo Grafana Tempo.

### Jak to funguje

Bridge dynamicky importuje `@opentelemetry/api` za běhu — není žádná kompilační závislost. Pokud modul není nainstalovaný, bridge se tiše stane no-op.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│  OTel Bridge      │
  │               │     │                 │     │                   │
  └──────────────┘     └─────────────────┘     └─────────┬─────────┘
                                                          │
                                               ┌──────────▼──────────┐
                                               │  @opentelemetry/api │
                                               │  (dynamický import) │
                                               └──────────┬──────────┘
                                                          │
                                               ┌──────────▼──────────┐
                                               │  OTel Collector /   │
                                               │  Jaeger / Zipkin    │
                                               └─────────────────────┘
```

### Povolení OpenTelemetry

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
  opentelemetry: {
    enabled: true,
    serviceName: 'my-rule-engine',    // Název OTel služby (výchozí: 'noex-rules')
    traceConditions: false,           // Zahrnout spany podmínek (výchozí: false)
  },
});
```

### OpenTelemetryConfig

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;         // Povolit OTel bridge (výchozí: false)
  serviceName?: string;      // Název OTel služby (výchozí: 'noex-rules')
  traceConditions?: boolean; // Vytvářet spany pro každou podmínku (výchozí: false)
}
```

**Poznámka k `traceConditions`:** Vytváření spanů pro každé vyhodnocení podmínky přidává významnou zátěž. Povolte pouze při vyšetřování konkrétních výkonnostních problémů podmínek.

### Hierarchie spanů

Bridge vytváří hierarchickou strukturu spanů, která zrcadlí tok zpracování enginu:

```text
event_processing (correlationId)
  └─ rule_evaluation (ruleId)
       ├─ condition_evaluation (opt-in, na podmínku)
       └─ action_execution (na akci)
```

### Atributy spanů

Každý span nese noex-specifické atributy:

| Atribut | Typ spanu | Hodnota |
|---------|-----------|---------|
| `noex.correlation_id` | Všechny | Korelační ID |
| `noex.event.topic` | `event_processing` | Topic události |
| `noex.rule.id` | `rule_evaluation` | ID pravidla |
| `noex.rule.name` | `rule_evaluation` | Název pravidla |
| `noex.rule.skipped` | `rule_evaluation` | Zda podmínky selhaly |
| `noex.rule.skip_reason` | `rule_evaluation` | Proč bylo pravidlo přeskočeno |
| `noex.action.type` | `action_execution` | Typ akce (emit_event atd.) |
| `noex.action.index` | `action_execution` | Index akce v pravidle |
| `noex.condition.index` | `condition_evaluation` | Index podmínky v pravidle |
| `noex.condition.passed` | `condition_evaluation` | Zda podmínka prošla |

### Předpoklady

Nainstalujte OpenTelemetry SDK před použitím bridge:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

Nakonfigurujte OTel SDK před spuštěním enginu:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'my-rule-engine',
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

// Poté spusťte pravidlový engine s povoleným OTel
const engine = await RuleEngine.start({
  tracing: { enabled: true },
  opentelemetry: {
    enabled: true,
    serviceName: 'my-rule-engine',
  },
});
```

## Kompletní příklad: Produkční observability stack

Tento příklad nastaví kompletní observability stack: metriky pro Prometheus, audit logging pro compliance a tracing pro vývoj:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/production.db' });

const engine = await RuleEngine.start({
  // Debug tracing (lze přepnout za běhu přes REST API)
  tracing: { enabled: true, maxEntries: 50_000 },

  // Prometheus metriky
  metrics: {
    enabled: true,
    prefix: 'myapp_rules',
    perRuleMetrics: true,
    maxLabeledRules: 50,
  },

  // Persistentní audit logging
  audit: {
    adapter,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 dní
  },

  // OpenTelemetry (vyžaduje nainstalovanou @opentelemetry/api)
  opentelemetry: {
    enabled: true,
    serviceName: 'order-processing',
  },
});

// --- Business pravidla ---

engine.registerRule(
  Rule.create('validate-order')
    .name('Validace objednávky')
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
    .name('Fraud screening')
    .priority(20)
    .when(onEvent('order.validated'))
    .if(event('total').gt(500))
    .then(emit('fraud.check_required', {
      orderId: ref('event.orderId'),
      amount: ref('event.total'),
    }))
    .also(log('Fraud screening spuštěn pro objednávku ${event.orderId}'))
    .build()
);

engine.registerRule(
  Rule.create('discount-check')
    .name('Aplikace věrnostní slevy')
    .priority(5)
    .when(onEvent('order.validated'))
    .if(fact('customer:${event.customerId}:tier').eq('vip'))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.15,
    }))
    .build()
);

// --- Simulace zátěže ---

engine.setFact('customer:c-1:tier', 'vip');

for (let i = 0; i < 50; i++) {
  await engine.emit('order.created', {
    orderId: `ord-${i}`,
    customerId: 'c-1',
    items: [{ product: 'widget', qty: 1 }],
    total: 100 + Math.random() * 900,
  });
}

// --- Výstupy observability ---

// 1. Prometheus metriky
const counters = engine.metricsCollector.getCounters();
console.log('=== Metriky ===');
console.log(`Zpracovaných událostí: ${counters.eventsProcessed}`);
console.log(`Spuštěných pravidel: ${counters.rulesTriggered}`);
console.log(`Provedených pravidel: ${counters.rulesExecuted}`);
console.log(`Selhalých akcí: ${counters.actionsFailed}`);

// 2. Shrnutí profilování
const summary = engine.profiler.getSummary();
console.log('\n=== Profilování ===');
console.log(`Průměrný čas pravidla: ${summary.avgRuleTimeMs.toFixed(3)}ms`);
if (summary.slowestRule) {
  console.log(`Nejpomalejší: ${summary.slowestRule.ruleName}`);
}

// 3. Audit trail
const auditStats = engine.auditLog.getStats();
console.log('\n=== Audit ===');
console.log(`Celkem záznamů: ${auditStats.totalEntries}`);
for (const [cat, count] of Object.entries(auditStats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

await engine.auditLog.flush();
await engine.stop();
```

## REST API endpoint

Při použití `RuleEngineServer` je endpoint metrik dostupný na:

| Metoda | Cesta | Content-Type | Popis |
|--------|-------|-------------|-------|
| `GET` | `/metrics` | `text/plain; version=0.0.4` | Prometheus scrape endpoint |

### Konfigurace Prometheus

Přidejte do vašeho `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'noex-rules'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
```

### Grafana dashboard dotazy

Běžné PromQL dotazy pro Grafana dashboard:

```promql
# Míra provádění pravidel (za sekundu)
rate(noex_rules_rules_executed_total[5m])

# Míra selhání pravidel
rate(noex_rules_rules_failed_total[5m])

# p99 latence vyhodnocení
histogram_quantile(0.99, rate(noex_rules_evaluation_duration_seconds_bucket[5m]))

# Poměr úspěšnosti akcí
1 - (rate(noex_rules_actions_failed_total[5m]) / rate(noex_rules_actions_executed_total[5m]))

# Aktivní pravidla (gauge)
noex_rules_active_rules
```

## Cvičení

Nastavte produkčně připravenou observability konfiguraci pro pravidlový engine zpracování plateb:

1. Spusťte engine se všemi observability funkcemi:
   - Tracing (50 000 záznamů)
   - Metriky (s prefixem `payments`, per-rule metriky povoleny)
   - Audit logging (SQLite, 180denní retence)
2. Zaregistrujte tři pravidla:
   - `payment-validator` který validuje `event.amount > 0` na `payment.initiated`
   - `high-value-flag` který označí platby nad $10 000 na `payment.initiated`
   - `payment-tracker` který aktualizuje čítač faktů na `payment.initiated`
3. Simulujte 100 plateb s náhodnými částkami (100-20 000)
4. Vytiskněte čítače metrik, shrnutí profilování a audit statistiky

<details>
<summary>Řešení</summary>

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
    retentionMs: 180 * 24 * 60 * 60 * 1000, // 180 dní
  },
});

// Validace platby
engine.registerRule(
  Rule.create('payment-validator')
    .name('Validátor plateb')
    .priority(10)
    .when(onEvent('payment.initiated'))
    .if(event('amount').gt(0))
    .then(emit('payment.validated', {
      paymentId: ref('event.paymentId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// Označení vysokých plateb
engine.registerRule(
  Rule.create('high-value-flag')
    .name('Označení vysoké hodnoty')
    .priority(20)
    .when(onEvent('payment.initiated'))
    .if(event('amount').gt(10_000))
    .then(emit('payment.high_value', {
      paymentId: ref('event.paymentId'),
      amount: ref('event.amount'),
    }))
    .also(log('Platba vysoké hodnoty: $${event.amount}'))
    .build()
);

// Sledování počtu plateb
engine.registerRule(
  Rule.create('payment-tracker')
    .name('Tracker plateb')
    .priority(1)
    .when(onEvent('payment.initiated'))
    .then(setFact('payments:count', '${(parseInt(fact.value || "0") + 1)}'))
    .build()
);

// Simulace 100 plateb
for (let i = 0; i < 100; i++) {
  await engine.emit('payment.initiated', {
    paymentId: `pay-${i}`,
    amount: 100 + Math.random() * 19900, // 100-20 000
    currency: 'USD',
  });
}

// --- Výsledky ---

console.log('=== Čítače metrik ===');
const counters = engine.metricsCollector.getCounters();
console.log(`Zpracovaných událostí: ${counters.eventsProcessed}`);
console.log(`Spuštěných pravidel: ${counters.rulesTriggered}`);
console.log(`Provedených pravidel: ${counters.rulesExecuted}`);
console.log(`Přeskočených pravidel: ${counters.rulesSkipped}`);
console.log(`Provedených akcí: ${counters.actionsExecuted}`);
console.log(`Selhalých akcí: ${counters.actionsFailed}`);

console.log('\n=== Shrnutí profilování ===');
const summary = engine.profiler.getSummary();
console.log(`Profilovaných pravidel: ${summary.totalRulesProfiled}`);
console.log(`Celkem spuštění: ${summary.totalTriggers}`);
console.log(`Průměrný čas: ${summary.avgRuleTimeMs.toFixed(3)}ms`);
if (summary.slowestRule) {
  console.log(`Nejpomalejší: ${summary.slowestRule.ruleName} (${summary.slowestRule.avgTimeMs.toFixed(3)}ms)`);
}

console.log('\n=== Audit statistiky ===');
const auditStats = engine.auditLog.getStats();
console.log(`Celkem záznamů: ${auditStats.totalEntries}`);
for (const [cat, count] of Object.entries(auditStats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

await engine.auditLog.flush();
await engine.stop();
```

Pravidlo `high-value-flag` ukazuje nižší úspěšnost (zhruba 50 % v závislosti na náhodných částkách), zatímco `payment-validator` a `payment-tracker` se provedou při každé události. Audit trail obsahuje záznamy pro registraci pravidel, všechna provedení a změny faktů.

</details>

## Shrnutí

- **`MetricsCollector`** se přihlásí k odběru `TraceCollector` a udržuje čítače, histogramy a gaugy kompatibilní s Prometheus
- Povolte přes `metrics: { enabled: true }` v `RuleEngine.start()` (vyžaduje povolený tracing)
- **9 čítačů** sleduje kumulativní součty: spuštění, provedení, přeskočení, selhání, události, fakta, akce a podmínky
- **3 histogramy** sledují distribuce latencí pro vyhodnocení pravidel, vyhodnocení podmínek a provádění akcí
- **4 gaugy** reflektují aktuální stav: aktivní pravidla, fakta, časovače a využití trace bufferu
- **`perRuleMetrics`** přidává štítky `rule_id` na histogramy (omezeno `maxLabeledRules`)
- **Endpoint `/metrics`** servuje Prometheus text exposition format pro scraping
- **`OpenTelemetryBridge`** dynamicky načítá `@opentelemetry/api` a mapuje trace záznamy na spany
- Hierarchie spanů: `event_processing` -> `rule_evaluation` -> `condition_evaluation` / `action_execution`
- Bridge je **no-op**, pokud `@opentelemetry/api` není nainstalována — žádné runtime chyby
- Kombinujte metriky, audit a OTel pro **kompletní produkční observability stack**

---

Další: [Dopředné vs zpětné řetězení](../09-zpetne-retezeni/01-dopredu-vs-zpet.md)
