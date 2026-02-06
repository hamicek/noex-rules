# Baseline

Výpočet statistických baseline a detekce anomálií pro časové řady metrik. BaselineStore sbírá metrická data z událostí, počítá baseline statistiky (průměr, směrodatná odchylka, percentily) a detekuje anomálie pomocí konfigurovatelných metod (z-skóre, percentilové prahy).

## Import

```typescript
import {
  BaselineStore,
  // Typy
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

Orchestruje výpočet a správu baseline statistik. Sbírá metriky z EventStore, počítá statistiky, ukládá výsledky do FactStore a periodicky přepočítává přes interní scheduling.

### Konstruktor

```typescript
constructor(
  eventStore: EventStore,
  factStore: FactStore,
  timerManager: TimerManager,
  config: BaselineConfig
)
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| eventStore | `EventStore` | ano | Zdroj událostí pro extrakci metrik |
| factStore | `FactStore` | ano | Úložiště pro vypočtené baseline statistiky |
| timerManager | `TimerManager` | ano | Správce časovačů pro scheduling |
| config | `BaselineConfig` | ano | Konfigurace s definicemi metrik |

**Poznámka:** V typickém použití je BaselineStore vytvořen interně RuleEnginem a přístupný přes `engine.getBaselineStore()`.

### static start()

```typescript
static async start(
  eventStore: EventStore,
  factStore: FactStore,
  timerManager: TimerManager,
  config: BaselineConfig
): Promise<BaselineStore>
```

Factory metoda, která vytvoří a inicializuje BaselineStore.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| eventStore | `EventStore` | ano | Zdroj událostí pro extrakci metrik |
| factStore | `FactStore` | ano | Úložiště pro vypočtené baseline statistiky |
| timerManager | `TimerManager` | ano | Správce časovačů pro scheduling |
| config | `BaselineConfig` | ano | Konfigurace s definicemi metrik |

**Návratová hodnota:** `Promise<BaselineStore>` — Inicializovaný baseline store

**Příklad:**

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

Registruje novou metriku pro sledování baseline. Pokud metrika se stejným názvem existuje, je nahrazena.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `BaselineMetricConfig` | ano | Konfigurace metriky |

**Příklad:**

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

Odstraní metriku ze sledování baseline. Vyčistí cachované statistiky a uložené fakty.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Název metriky k odstranění |

**Návratová hodnota:** `boolean` — `true` pokud metrika byla odstraněna, `false` pokud nebyla nalezena

**Příklad:**

```typescript
const removed = baselineStore.unregisterMetric('response_time');
```

### recalculate()

```typescript
async recalculate(metricName: string, groupKey?: string): Promise<BaselineStats>
```

Vynutí okamžitý přepočet baseline statistik pro metriku.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| metricName | `string` | ano | Název metriky k přepočtu |
| groupKey | `string` | ne | Klíč skupiny pro per-group baselines |

**Návratová hodnota:** `Promise<BaselineStats>` — Vypočtené baseline statistiky

**Vyhazuje:** `Error` — Pokud metrika není registrována

**Příklad:**

```typescript
const stats = await baselineStore.recalculate('order_value');
console.log(`Průměr: ${stats.mean}, Odchylka: ${stats.stddev}`);
```

### recalculateAll()

```typescript
async recalculateAll(): Promise<void>
```

Vynutí okamžitý přepočet všech registrovaných metrik.

**Příklad:**

```typescript
await baselineStore.recalculateAll();
```

### getBaseline()

```typescript
getBaseline(metricName: string, groupKey?: string): BaselineStats | undefined
```

Vrací cachované baseline statistiky pro metriku.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| metricName | `string` | ano | Název metriky |
| groupKey | `string` | ne | Klíč skupiny pro per-group baselines |

**Návratová hodnota:** `BaselineStats | undefined` — Cachované statistiky nebo undefined pokud nebyly vypočteny

**Příklad:**

```typescript
const stats = baselineStore.getBaseline('order_value');
if (stats) {
  console.log(`Vzorků: ${stats.sampleCount}, Průměr: ${stats.mean}`);
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

Kontroluje, zda je hodnota anomální ve srovnání s baseline.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| metricName | `string` | ano | Název metriky |
| value | `number` | ano | Aktuální hodnota ke kontrole |
| comparison | `BaselineComparison` | ano | Typ porovnání |
| sensitivity | `number` | ne | Práh citlivosti (výchozí: `defaultSensitivity` z konfigurace) |
| groupKey | `string` | ne | Klíč skupiny pro per-group baselines |

**Návratová hodnota:** `AnomalyResult | undefined` — Výsledek anomálie nebo undefined pokud baseline není dostupný nebo nemá dostatek vzorků

**Příklad:**

```typescript
const result = baselineStore.checkAnomaly('order_value', 5000, 'above', 2.5);
if (result?.isAnomaly) {
  console.log(`Detekována anomálie: ${result.description}`);
  console.log(`Závažnost: ${result.severity}, Z-skóre: ${result.zScore}`);
}
```

### getMetricConfig()

```typescript
getMetricConfig(name: string): BaselineMetricConfig | undefined
```

Vrací konfiguraci registrované metriky.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Název metriky |

**Návratová hodnota:** `BaselineMetricConfig | undefined` — Konfigurace metriky nebo undefined pokud nebyla nalezena

### getMetrics()

```typescript
getMetrics(): BaselineMetricConfig[]
```

Vrací konfigurace všech registrovaných metrik.

**Návratová hodnota:** `BaselineMetricConfig[]` — Pole konfigurací metrik

### getAllBaselines()

```typescript
getAllBaselines(): Map<string, BaselineStats>
```

Vrací všechny cachované baseline statistiky.

**Návratová hodnota:** `Map<string, BaselineStats>` — Mapa klíčů metrik na statistiky

### getStats()

```typescript
getStats(): {
  metricsCount: number;
  totalRecalculations: number;
  anomaliesDetected: number;
}
```

Vrací provozní statistiky baseline store.

**Návratová hodnota:** Objekt s:
- `metricsCount` — Počet registrovaných metrik
- `totalRecalculations` — Celkový počet provedených přepočtů
- `anomaliesDetected` — Celkový počet detekovaných anomálií

**Příklad:**

```typescript
const stats = baselineStore.getStats();
console.log(`Metrik: ${stats.metricsCount}`);
console.log(`Přepočtů: ${stats.totalRecalculations}`);
console.log(`Anomálií: ${stats.anomaliesDetected}`);
```

### stop()

```typescript
async stop(): Promise<void>
```

Zastaví všechny naplánované intervaly přepočtu. Volejte při shutdownu.

**Příklad:**

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

Konfigurace baseline modulu.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| metrics | `BaselineMetricConfig[]` | — | Pole definic metrik |
| defaultSensitivity | `number` | `2.0` | Výchozí citlivost (sigma) pro detekci anomálií |
| ewmaAlpha | `number` | `0.3` | Vyhlazovací faktor pro EWMA (0-1) |
| minSamples | `number` | `10` | Minimální počet vzorků před detekcí anomálií |

**Příklad:**

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

Konfigurace jednotlivé baseline metriky.

| Pole | Typ | Povinný | Popis |
|------|-----|---------|-------|
| name | `string` | ano | Unikátní identifikátor metriky |
| topic | `string` | ano | Topic událostí k monitorování (podporuje wildcards) |
| field | `string` | ano | Cesta k poli v event data pro extrakci hodnot |
| function | `BaselineAggregation` | ano | Agregační funkce pro vzorky |
| sampleWindow | `string \| number` | ano | Granularita vzorkování (`'1m'`, `'5m'`) |
| trainingPeriod | `string \| number` | ano | Trénovací období pro baseline (`'7d'`, `'24h'`) |
| recalcInterval | `string \| number` | ano | Interval přepočtu (`'1h'`, `'15m'`) |
| method | `BaselineMethod` | ano | Statistická metoda pro baseline |
| groupBy | `string` | ne | Cesta k poli pro per-group baselines |
| seasonal | `SeasonalPeriod` | ne | Zohlednění sezónních vzorů |
| filter | `Record<string, unknown>` | ne | Kritéria filtru událostí |

**Příklad:**

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

Vypočtené baseline statistiky.

| Pole | Typ | Popis |
|------|-----|-------|
| metric | `string` | Název metriky |
| mean | `number` | Aritmetický průměr |
| stddev | `number` | Směrodatná odchylka (populační) |
| median | `number` | Medián (50. percentil) |
| percentiles | `Record<number, number>` | Hodnoty percentilů (p5, p25, p75, p95, p99) |
| ewma | `number` | Exponenciálně vážený klouzavý průměr (pokud metoda je `'ewma'`) |
| sampleCount | `number` | Počet vzorků ve výpočtu |
| min | `number` | Minimální pozorovaná hodnota |
| max | `number` | Maximální pozorovaná hodnota |
| computedAt | `number` | Časové razítko výpočtu (Unix ms) |
| dataFrom | `number` | Začátek rozsahu dat (Unix ms) |
| dataTo | `number` | Konec rozsahu dat (Unix ms) |
| groupKey | `string` | Klíč skupiny (pokud se používá groupBy) |
| seasonalBucket | `string` | Identifikátor sezónního bucketu |

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

Výsledek detekce anomálie.

| Pole | Typ | Popis |
|------|-----|-------|
| isAnomaly | `boolean` | Zda je hodnota anomální |
| currentValue | `number` | Kontrolovaná hodnota |
| baseline | `BaselineStats` | Baseline statistiky použité pro porovnání |
| zScore | `number` | Z-skóre hodnoty |
| severity | `string` | Závažnost anomálie: `'low'` (\|z\| < 2), `'medium'` (\|z\| < 3), `'high'` (\|z\| < 4), `'critical'` (\|z\| >= 4) |
| description | `string` | Lidsky čitelný popis |

---

## BaselineMethod

```typescript
type BaselineMethod = 'moving_average' | 'ewma' | 'zscore' | 'percentile';
```

Statistická metoda pro výpočet baseline.

| Hodnota | Popis |
|---------|-------|
| `'moving_average'` | Jednoduchý klouzavý průměr |
| `'ewma'` | Exponenciálně vážený klouzavý průměr |
| `'zscore'` | Detekce založená na z-skóre |
| `'percentile'` | Detekce založená na percentilech |

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

Typ porovnání pro detekci anomálií.

| Hodnota | Popis | Význam sensitivity |
|---------|-------|-------------------|
| `'above'` | Hodnota > průměr + sensitivity × odchylka | Počet směrodatných odchylek |
| `'below'` | Hodnota < průměr - sensitivity × odchylka | Počet směrodatných odchylek |
| `'outside'` | \|Hodnota - průměr\| > sensitivity × odchylka | Počet směrodatných odchylek |
| `'above_percentile'` | Hodnota > N-tý percentil | Číslo percentilu (např. 95) |
| `'below_percentile'` | Hodnota < N-tý percentil | Číslo percentilu (např. 5) |

---

## BaselineAggregation

```typescript
type BaselineAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';
```

Agregační funkce pro vzorkování.

| Hodnota | Popis |
|---------|-------|
| `'sum'` | Součet hodnot v okně |
| `'avg'` | Průměr hodnot v okně |
| `'min'` | Minimální hodnota v okně |
| `'max'` | Maximální hodnota v okně |
| `'count'` | Počet událostí v okně |

---

## SeasonalPeriod

```typescript
type SeasonalPeriod = 'hourly' | 'daily' | 'weekly' | 'none';
```

Zohlednění sezónních vzorů.

| Hodnota | Popis |
|---------|-------|
| `'hourly'` | Vzory podle hodiny dne |
| `'daily'` | Vzory podle dne v týdnu |
| `'weekly'` | Týdenní vzory |
| `'none'` | Bez sezónní úpravy |

---

## Kompletní příklad

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

// Pravidlo používající baseline podmínku
await engine.registerRule(
  Rule.create('high-value-order')
    .name('High Value Order Alert')
    .when(onEvent('order.created'))
    .if(baseline('order_value').isAnomaly('above', 2.5))
    .then(emit('alert.high_value_order', { severity: 'warning' }))
    .build()
);

// Manuální kontrola anomálie
const baselineStore = engine.getBaselineStore();
if (baselineStore) {
  const result = baselineStore.checkAnomaly('order_value', 15000, 'above');
  if (result?.isAnomaly) {
    console.log(`Anomálie: ${result.description}`);
    console.log(`Z-skóre: ${result.zScore}, Závažnost: ${result.severity}`);
  }

  // Zobrazení statistik
  const stats = baselineStore.getBaseline('order_value');
  if (stats) {
    console.log(`Baseline - Průměr: ${stats.mean}, Odchylka: ${stats.stddev}`);
    console.log(`Rozsah: ${stats.min} - ${stats.max}`);
    console.log(`Vzorků: ${stats.sampleCount}`);
  }
}

// Úklid
await engine.stop();
```

---

## Použití baseline v pravidlech

Baseline podmínky lze použít v definicích pravidel přes DSL:

```typescript
import { Rule, onEvent, baseline, emit } from '@hamicek/noex-rules';

// Alert když hodnota objednávky překročí 3 sigma
const rule = Rule.create('anomaly-alert')
  .when(onEvent('order.created'))
  .if(baseline('order_value').isAnomaly('above', 3))
  .then(emit('alert.anomaly'))
  .build();

// Alert když se hodnota odchyluje v obou směrech
const bidirectionalRule = Rule.create('variance-alert')
  .when(onEvent('metrics.reported'))
  .if(baseline('latency').isAnomaly('outside', 2.5))
  .then(emit('alert.latency_variance'))
  .build();
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor s přístupem k baseline
- [DSL Podmínky](./11-dsl-conditions.md) — `baseline()` condition builder
- [EventStore](./03-event-store.md) — Zdroj metrických dat
- [FactStore](./02-fact-store.md) — Úložiště pro vypočtené baselines
- [Konfigurace](./30-configuration.md) — Kompletní referenční přehled konfigurace
