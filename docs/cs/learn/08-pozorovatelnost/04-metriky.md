# Metriky a tracing

Debugging a profilovani vam daji prehled behem vyvoje. Audit logging vam da compliance zaznam. Ale pro produkcni dashboardy, alerting a distribuovany tracing napric sluzbami potrebujete standardni observability nastroje. noex-rules poskytuje **MetricsCollector**, ktery exportuje metriky kompatibilni s Prometheus, a **OpenTelemetryBridge**, ktery mapuje engine trace na OTel spany.

## Co se naucite

- Jak povolit a konfigurovat `MetricsCollector`
- Vsechny dostupne citace, histogramy a gaugy
- Prometheus text exposition format a endpoint `/metrics`
- Jak `OpenTelemetryBridge` mapuje trace na OTel spany
- Hierarchie spanu a mapovani atributu
- Integrace s Grafana, Prometheus a Jaeger

## MetricsCollector

Metrics collector se prihlasi k odberu streamu `TraceCollector` a udrzuje metriky kompatibilni s Prometheus: citace pro pocty udalosti, histogramy pro distribuce latenci a gaugy pro aktualni stav.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│ MetricsCollector │
  │               │     │                 │     │                  │
  └──────────────┘     └─────────────────┘     └────────┬─────────┘
                                                         │
                                              ┌──────────┼──────────┐
                                              │          │          │
                                        ┌─────▼─────┐ ┌─▼────────┐ ┌▼───────────┐
                                        │ Citace    │ │Histogramy│ │ Gaugy      │
                                        └───────────┘ └──────────┘ └────────────┘
                                                         │
                                              ┌──────────▼──────────┐
                                              │  GET /metrics       │
                                              │  (Prometheus text)  │
                                              └─────────────────────┘
```

### Povoleni metrik

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  tracing: { enabled: true },  // Povinne: metriky se odvozuji z tracu
  metrics: {
    enabled: true,
    prefix: 'noex_rules',          // Prefix nazvu metrik (vychozi)
    perRuleMetrics: false,          // Stitky per-rule na histogramech (vychozi: false)
    maxLabeledRules: 100,           // Limit kardinality pro per-rule (vychozi: 100)
    histogramBuckets: [             // Vlastni buckety histogramu v sekundach
      0.001, 0.005, 0.01, 0.025, 0.05,
      0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ],
  },
});
```

### MetricsConfig

```typescript
interface MetricsConfig {
  enabled?: boolean;           // Povolit sber metrik (vychozi: false)
  perRuleMetrics?: boolean;    // Pridat stitky rule_id na histogramy (vychozi: false)
  maxLabeledRules?: number;    // Max ruznych stitku rule_id (vychozi: 100)
  histogramBuckets?: number[]; // Hranice bucketu histogramu v sekundach
  prefix?: string;             // Prefix nazvu metrik (vychozi: 'noex_rules')
}
```

**Poznamka k `perRuleMetrics`:** Povoleni per-rule stitku na histogramech prida stitek `rule_id` ke kazdemu pozorovani. To poskytuje jemna data o latencich, ale zvysuje kardinalitu. Limit `maxLabeledRules` zabrannuje neomezenenemu rustu stitku, pokud jsou pravidla vytvavena dynamicky.

## Dostupne metriky

### Citace

Citace sleduje kumulativni soucty, ktere pouze rostou:

| Metrika | Popis |
|---------|-------|
| `noex_rules_rules_triggered_total` | Celkovy pocet spusteni pravidel |
| `noex_rules_rules_executed_total` | Celkovy pocet provedeni pravidel (podminky prosly) |
| `noex_rules_rules_skipped_total` | Celkovy pocet preskoceni pravidel (podminky selhaly) |
| `noex_rules_rules_failed_total` | Celkovy pocet selhani provadeni pravidel |
| `noex_rules_events_processed_total` | Celkovy pocet zpracovanych udalosti |
| `noex_rules_facts_changed_total` | Celkovy pocet zmen faktu |
| `noex_rules_actions_executed_total` | Celkovy pocet uspesne provedenych akci |
| `noex_rules_actions_failed_total` | Celkovy pocet selhani akci |
| `noex_rules_conditions_evaluated_total` | Celkovy pocet vyhodnocenych podminek |

### Histogramy

Histogramy sleduju distribuce hodnot s konfigurovatelnymi hranicemi bucketu:

| Metrika | Popis |
|---------|-------|
| `noex_rules_evaluation_duration_seconds` | Doba vyhodnoceni pravidla |
| `noex_rules_condition_duration_seconds` | Doba vyhodnoceni podminky |
| `noex_rules_action_duration_seconds` | Doba provadeni akce |

Kdyz je povoleno `perRuleMetrics`, `evaluation_duration_seconds` obsahuje stitek `rule_id` pro analyzu latence jednotlivych pravidel.

### Gaugy

Gaugy sleduju aktualni hodnoty, ktere mohou rust i klesat. Vyhodnocuji se line pri scrapovani metrik:

| Metrika | Popis |
|---------|-------|
| `noex_rules_active_rules` | Aktualni pocet registrovanych pravidel |
| `noex_rules_active_facts` | Aktualni pocet faktu ve fact store |
| `noex_rules_active_timers` | Aktualni pocet aktivnich casovcu |
| `noex_rules_trace_buffer_utilization` | Pomer vyuziti trace bufferu (0.0-1.0) |

## Prometheus textovy format

Endpoint metrik vraci data ve formatu Prometheus text exposition (v0.0.4):

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

### Programaticky pristup k metrikam

```typescript
// Ziskat snapshoty citacu
const counters = engine.metricsCollector.getCounters();
console.log(`Zpracovanych udalosti: ${counters.eventsProcessed}`);
console.log(`Spustenych pravidel: ${counters.rulesTriggered}`);
console.log(`Provedenych pravidel: ${counters.rulesExecuted}`);
console.log(`Selhalych akci: ${counters.actionsFailed}`);

// Ziskat aktualni hodnoty gaugu
const gauges = engine.metricsCollector.getGauges();
console.log(`Aktivni pravidla: ${gauges.activeRules}`);
console.log(`Aktivni fakta: ${gauges.activeFacts}`);
console.log(`Aktivni casovace: ${gauges.activeTimers}`);
console.log(`Vyuziti bufferu: ${(gauges.traceBufferUtilization * 100).toFixed(1)}%`);

// Ziskat snapshoty histogramu
const histograms = engine.metricsCollector.getHistograms();
const evalHist = histograms.evaluationDuration;
console.log(`Vyhodnoceni p50: ${evalHist.p50}s`);
console.log(`Vyhodnoceni p99: ${evalHist.p99}s`);
```

## OpenTelemetryBridge

OpenTelemetry bridge mapuje engine trace zaznamy na OTel spany a integruje se s distribuovanymi tracing systemy jako Jaeger, Zipkin nebo Grafana Tempo.

### Jak to funguje

Bridge dynamicky importuje `@opentelemetry/api` za behu — neni zadna kompilacni zavislost. Pokud modul neni nainstalovany, bridge se tise stane no-op.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌───────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│  OTel Bridge      │
  │               │     │                 │     │                   │
  └──────────────┘     └─────────────────┘     └─────────┬─────────┘
                                                          │
                                               ┌──────────▼──────────┐
                                               │  @opentelemetry/api │
                                               │  (dynamicky import) │
                                               └──────────┬──────────┘
                                                          │
                                               ┌──────────▼──────────┐
                                               │  OTel Collector /   │
                                               │  Jaeger / Zipkin    │
                                               └─────────────────────┘
```

### Povoleni OpenTelemetry

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
  opentelemetry: {
    enabled: true,
    serviceName: 'my-rule-engine',    // Nazev OTel sluzby (vychozi: 'noex-rules')
    traceConditions: false,           // Zahrnout spany podminek (vychozi: false)
  },
});
```

### OpenTelemetryConfig

```typescript
interface OpenTelemetryConfig {
  enabled?: boolean;         // Povolit OTel bridge (vychozi: false)
  serviceName?: string;      // Nazev OTel sluzby (vychozi: 'noex-rules')
  traceConditions?: boolean; // Vytvaret spany pro kazdou podminku (vychozi: false)
}
```

**Poznamka k `traceConditions`:** Vytvareni spanu pro kazde vyhodnoceni podminky pridava vyznamnou zatez. Povolte pouze pri vysetrovani konkretnich vykonnostnich problemu podminek.

### Hierarchie spanu

Bridge vytvari hierarchickou strukturu spanu, ktera zrcadli tok zpracovani enginu:

```text
event_processing (correlationId)
  └─ rule_evaluation (ruleId)
       ├─ condition_evaluation (opt-in, na podminku)
       └─ action_execution (na akci)
```

### Atributy spanu

Kazdy span nese noex-specificke atributy:

| Atribut | Typ spanu | Hodnota |
|---------|-----------|---------|
| `noex.correlation_id` | Vsechny | Korelacni ID |
| `noex.event.topic` | `event_processing` | Topic udalosti |
| `noex.rule.id` | `rule_evaluation` | ID pravidla |
| `noex.rule.name` | `rule_evaluation` | Nazev pravidla |
| `noex.rule.skipped` | `rule_evaluation` | Zda podminky selhaly |
| `noex.rule.skip_reason` | `rule_evaluation` | Proc bylo pravidlo preskoceno |
| `noex.action.type` | `action_execution` | Typ akce (emit_event atd.) |
| `noex.action.index` | `action_execution` | Index akce v pravidle |
| `noex.condition.index` | `condition_evaluation` | Index podminky v pravidle |
| `noex.condition.passed` | `condition_evaluation` | Zda podminka prosla |

### Predpoklady

Nainstalujte OpenTelemetry SDK pred pouzitim bridge:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

Nakonfigurujte OTel SDK pred spustenim enginu:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'my-rule-engine',
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();

// Pote spustte pravidlovy engine s povolenym OTel
const engine = await RuleEngine.start({
  tracing: { enabled: true },
  opentelemetry: {
    enabled: true,
    serviceName: 'my-rule-engine',
  },
});
```

## Kompletni priklad: Produkcni observability stack

Tento priklad nastavi kompletni observability stack: metriky pro Prometheus, audit logging pro compliance a tracing pro vyvoj:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/production.db' });

const engine = await RuleEngine.start({
  // Debug tracing (lze prepnout za behu pres REST API)
  tracing: { enabled: true, maxEntries: 50_000 },

  // Prometheus metriky
  metrics: {
    enabled: true,
    prefix: 'myapp_rules',
    perRuleMetrics: true,
    maxLabeledRules: 50,
  },

  // Persistentni audit logging
  audit: {
    adapter,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 dni
  },

  // OpenTelemetry (vyzaduje nainstalovanou @opentelemetry/api)
  opentelemetry: {
    enabled: true,
    serviceName: 'order-processing',
  },
});

// --- Business pravidla ---

engine.registerRule(
  Rule.create('validate-order')
    .name('Validace objednavky')
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
    .also(log('Fraud screening spusten pro objednavku ${event.orderId}'))
    .build()
);

engine.registerRule(
  Rule.create('discount-check')
    .name('Aplikace vernostni slevy')
    .priority(5)
    .when(onEvent('order.validated'))
    .if(fact('customer:${event.customerId}:tier').eq('vip'))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.15,
    }))
    .build()
);

// --- Simulace zateze ---

engine.setFact('customer:c-1:tier', 'vip');

for (let i = 0; i < 50; i++) {
  await engine.emit('order.created', {
    orderId: `ord-${i}`,
    customerId: 'c-1',
    items: [{ product: 'widget', qty: 1 }],
    total: 100 + Math.random() * 900,
  });
}

// --- Vystupy observability ---

// 1. Prometheus metriky
const counters = engine.metricsCollector.getCounters();
console.log('=== Metriky ===');
console.log(`Zpracovanych udalosti: ${counters.eventsProcessed}`);
console.log(`Spustenych pravidel: ${counters.rulesTriggered}`);
console.log(`Provedenych pravidel: ${counters.rulesExecuted}`);
console.log(`Selhalych akci: ${counters.actionsFailed}`);

// 2. Shrnuti profilovani
const summary = engine.profiler.getSummary();
console.log('\n=== Profilovani ===');
console.log(`Prumerny cas pravidla: ${summary.avgRuleTimeMs.toFixed(3)}ms`);
if (summary.slowestRule) {
  console.log(`Nejpomalejsi: ${summary.slowestRule.ruleName}`);
}

// 3. Audit trail
const auditStats = engine.auditLog.getStats();
console.log('\n=== Audit ===');
console.log(`Celkem zaznamu: ${auditStats.totalEntries}`);
for (const [cat, count] of Object.entries(auditStats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

await engine.auditLog.flush();
await engine.stop();
```

## REST API endpoint

Pri pouziti `RuleEngineServer` je endpoint metrik dostupny na:

| Metoda | Cesta | Content-Type | Popis |
|--------|-------|-------------|-------|
| `GET` | `/metrics` | `text/plain; version=0.0.4` | Prometheus scrape endpoint |

### Konfigurace Prometheus

Pridejte do vaseho `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'noex-rules'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
```

### Grafana dashboard dotazy

Bezne PromQL dotazy pro Grafana dashboard:

```promql
# Mira provadeni pravidel (za sekundu)
rate(noex_rules_rules_executed_total[5m])

# Mira selhani pravidel
rate(noex_rules_rules_failed_total[5m])

# p99 latence vyhodnoceni
histogram_quantile(0.99, rate(noex_rules_evaluation_duration_seconds_bucket[5m]))

# Pomer uspesnosti akci
1 - (rate(noex_rules_actions_failed_total[5m]) / rate(noex_rules_actions_executed_total[5m]))

# Aktivni pravidla (gauge)
noex_rules_active_rules
```

## Cviceni

Nastavte produkcne pripravenou observability konfiguraci pro pravidlovy engine zpracovani plateb:

1. Spustte engine se vsemi observability funkcemi:
   - Tracing (50 000 zaznamu)
   - Metriky (s prefixem `payments`, per-rule metriky povoleny)
   - Audit logging (SQLite, 180denni retence)
2. Zaregistrujte tri pravidla:
   - `payment-validator` ktery validuje `event.amount > 0` na `payment.initiated`
   - `high-value-flag` ktery oznaci platby nad $10 000 na `payment.initiated`
   - `payment-tracker` ktery aktualizuje citac faktu na `payment.initiated`
3. Simulujte 100 plateb s nahodnymi castkami (100-20 000)
4. Vytisknete citace metrik, shrnuti profilovani a audit statistiky

<details>
<summary>Reseni</summary>

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
    retentionMs: 180 * 24 * 60 * 60 * 1000, // 180 dni
  },
});

// Validace platby
engine.registerRule(
  Rule.create('payment-validator')
    .name('Validator plateb')
    .priority(10)
    .when(onEvent('payment.initiated'))
    .if(event('amount').gt(0))
    .then(emit('payment.validated', {
      paymentId: ref('event.paymentId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// Oznaceni vysokych plateb
engine.registerRule(
  Rule.create('high-value-flag')
    .name('Oznaceni vysoke hodnoty')
    .priority(20)
    .when(onEvent('payment.initiated'))
    .if(event('amount').gt(10_000))
    .then(emit('payment.high_value', {
      paymentId: ref('event.paymentId'),
      amount: ref('event.amount'),
    }))
    .also(log('Platba vysoke hodnoty: $${event.amount}'))
    .build()
);

// Sledovani poctu plateb
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

// --- Vysledky ---

console.log('=== Citace metrik ===');
const counters = engine.metricsCollector.getCounters();
console.log(`Zpracovanych udalosti: ${counters.eventsProcessed}`);
console.log(`Spustenych pravidel: ${counters.rulesTriggered}`);
console.log(`Provedenych pravidel: ${counters.rulesExecuted}`);
console.log(`Preskocenych pravidel: ${counters.rulesSkipped}`);
console.log(`Provedenych akci: ${counters.actionsExecuted}`);
console.log(`Selhalych akci: ${counters.actionsFailed}`);

console.log('\n=== Shrnuti profilovani ===');
const summary = engine.profiler.getSummary();
console.log(`Profilovanych pravidel: ${summary.totalRulesProfiled}`);
console.log(`Celkem spusteni: ${summary.totalTriggers}`);
console.log(`Prumerny cas: ${summary.avgRuleTimeMs.toFixed(3)}ms`);
if (summary.slowestRule) {
  console.log(`Nejpomalejsi: ${summary.slowestRule.ruleName} (${summary.slowestRule.avgTimeMs.toFixed(3)}ms)`);
}

console.log('\n=== Audit statistiky ===');
const auditStats = engine.auditLog.getStats();
console.log(`Celkem zaznamu: ${auditStats.totalEntries}`);
for (const [cat, count] of Object.entries(auditStats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

await engine.auditLog.flush();
await engine.stop();
```

Pravidlo `high-value-flag` ukazuje nizsi uspesnost (zhruba 50 % v zavislosti na nahodnych castkach), zatimco `payment-validator` a `payment-tracker` se provedou pri kazde udalosti. Audit trail obsahuje zaznamy pro registraci pravidel, vsechna provedeni a zmeny faktu.

</details>

## Shrnuti

- **`MetricsCollector`** se prihlasi k odberu `TraceCollector` a udrzuje citace, histogramy a gaugy kompatibilni s Prometheus
- Povolte pres `metrics: { enabled: true }` v `RuleEngine.start()` (vyzaduje povoleny tracing)
- **9 citacu** sleduje kumulativni soucty: spusteni, provedeni, preskoceni, selhani, udalosti, fakta, akce a podminky
- **3 histogramy** sleduju distribuce latenci pro vyhodnoceni pravidel, vyhodnoceni podminek a provadeni akci
- **4 gaugy** reflektuji aktualni stav: aktivni pravidla, fakta, casovace a vyuziti trace bufferu
- **`perRuleMetrics`** pridava stitky `rule_id` na histogramy (omezeno `maxLabeledRules`)
- **Endpoint `/metrics`** servuje Prometheus text exposition format pro scraping
- **`OpenTelemetryBridge`** dynamicky nacita `@opentelemetry/api` a mapuje trace zaznamy na spany
- Hierarchie spanu: `event_processing` -> `rule_evaluation` -> `condition_evaluation` / `action_execution`
- Bridge je **no-op**, pokud `@opentelemetry/api` neni nainstalovana — zadne runtime chyby
- Kombinujte metriky, audit a OTel pro **kompletni produkcni observability stack**

---

Dalsi: [Dopredne vs zpetne retezeni](../09-zpetne-retezeni/01-dopredu-vs-zpet.md)
