# RuleEngine

Hlavní orchestrátor spojující všechny komponenty rule enginu. Spravuje pravidla, fakta, události a časovače s automatickým forward chaining vyhodnocením.

## Import

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: RuleEngineConfig): Promise<RuleEngine>
```

Vytvoří a spustí novou instanci RuleEngine.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `RuleEngineConfig` | ne | Konfigurace enginu |

**Návratová hodnota:** `Promise<RuleEngine>` — běžící instance enginu

**Příklad:**

```typescript
const engine = await RuleEngine.start({
  name: 'my-engine',
  maxConcurrency: 5,
  services: { userService, emailService },
});
```

---

## Správa pravidel

### registerRule()

```typescript
registerRule(input: RuleInput, options?: { skipValidation?: boolean }): Rule
```

Registruje nové pravidlo. Vstup je validován před registrací.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| input | `RuleInput` | ano | Definice pravidla |
| options.skipValidation | `boolean` | ne | Přeskočí validaci pro důvěryhodné zdroje (např. DSL builder) |

**Návratová hodnota:** `Rule` — registrované pravidlo s metadaty

**Vyhazuje:** `RuleValidationError` pokud validace selže

**Příklad:**

```typescript
import { Rule, onEvent, emit } from '@hamicek/noex-rules';

const rule = engine.registerRule(
  Rule.create('order-placed')
    .when(onEvent('order:created'))
    .then(emit('inventory:reserve'))
    .build()
);
```

### unregisterRule()

```typescript
unregisterRule(ruleId: string): boolean
```

Odstraní pravidlo z enginu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a odstraněno

### enableRule()

```typescript
enableRule(ruleId: string): boolean
```

Povolí zakázané pravidlo.

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a povoleno

### disableRule()

```typescript
disableRule(ruleId: string): boolean
```

Zakáže pravidlo bez jeho odstranění.

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a zakázáno

### updateRule()

```typescript
updateRule(ruleId: string, updates: Partial<RuleInput>): Rule
```

Aktualizuje existující pravidlo sloučením s novými hodnotami. Vytvoří jedinou verzovací položku.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |
| updates | `Partial<RuleInput>` | ano | Pole k aktualizaci |

**Návratová hodnota:** `Rule` — aktualizované pravidlo

**Vyhazuje:** `Error` pokud pravidlo nenalezeno, `RuleValidationError` pokud validace selže

### rollbackRule()

```typescript
rollbackRule(ruleId: string, targetVersion: number): Rule
```

Vrátí pravidlo na předchozí verzi z historie.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |
| targetVersion | `number` | ano | Číslo verze k obnovení |

**Návratová hodnota:** `Rule` — obnovené pravidlo s novým číslem verze

**Vyhazuje:** `Error` pokud verzování není nakonfigurováno nebo verze nenalezena

### validateRule()

```typescript
validateRule(input: unknown): ValidationResult
```

Validuje vstup pravidla bez registrace (dry-run).

**Návratová hodnota:** `ValidationResult` — `{ valid: boolean, errors: ValidationIssue[], warnings: ValidationIssue[] }`

### getRule()

```typescript
getRule(ruleId: string): Rule | undefined
```

Vrátí pravidlo podle ID.

### getRules()

```typescript
getRules(): Rule[]
```

Vrátí všechna registrovaná pravidla.

---

## Správa skupin

### createGroup()

```typescript
createGroup(input: RuleGroupInput): RuleGroup
```

Vytvoří novou skupinu pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| input | `RuleGroupInput` | ano | Definice skupiny s `id`, volitelně `name`, `description`, `enabled` |

**Návratová hodnota:** `RuleGroup` — vytvořená skupina

**Vyhazuje:** `RuleValidationError` pokud skupina již existuje

**Příklad:**

```typescript
engine.createGroup({
  id: 'notifications',
  name: 'Notifikační pravidla',
  enabled: true,
});

engine.registerRule(
  Rule.create('notify-order')
    .group('notifications')
    .when(onEvent('order:shipped'))
    .then(emit('email:send'))
    .build()
);
```

### deleteGroup()

```typescript
deleteGroup(groupId: string): boolean
```

Smaže skupinu. Pravidla ve skupině se stanou neseskupenými.

### enableGroup()

```typescript
enableGroup(groupId: string): boolean
```

Povolí všechna pravidla ve skupině.

### disableGroup()

```typescript
disableGroup(groupId: string): boolean
```

Zakáže všechna pravidla ve skupině.

### updateGroup()

```typescript
updateGroup(groupId: string, updates: { name?: string; description?: string; enabled?: boolean }): RuleGroup | undefined
```

Aktualizuje vlastnosti skupiny.

### getGroup()

```typescript
getGroup(groupId: string): RuleGroup | undefined
```

Vrátí skupinu podle ID.

### getGroups()

```typescript
getGroups(): RuleGroup[]
```

Vrátí všechny skupiny.

### getGroupRules()

```typescript
getGroupRules(groupId: string): Rule[]
```

Vrátí všechna pravidla ve skupině.

---

## Verzování pravidel

Verzování musí být povoleno v konfiguraci pro použití těchto metod.

### getRuleVersions()

```typescript
getRuleVersions(ruleId: string, params?: Omit<RuleVersionQuery, 'ruleId'>): RuleVersionQueryResult
```

Dotazuje historii verzí s filtrováním a stránkováním.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |
| params.changeType | `RuleChangeType` | ne | Filtr podle typu změny |
| params.limit | `number` | ne | Max výsledků |
| params.offset | `number` | ne | Přeskočit položky |

**Návratová hodnota:** `RuleVersionQueryResult` — `{ entries: RuleVersionEntry[], total: number, hasMore: boolean }`

### getRuleVersion()

```typescript
getRuleVersion(ruleId: string, version: number): RuleVersionEntry | undefined
```

Vrátí konkrétní verzovací položku.

### diffRuleVersions()

```typescript
diffRuleVersions(ruleId: string, fromVersion: number, toVersion: number): RuleVersionDiff | undefined
```

Vrátí diff na úrovni polí mezi dvěma verzemi.

### getVersionStore()

```typescript
getVersionStore(): RuleVersionStore | null
```

Vrátí version store pro přímý přístup. Null pokud verzování není nakonfigurováno.

---

## Správa faktů

### setFact()

```typescript
async setFact(key: string, value: unknown): Promise<Fact>
```

Nastaví fakt a spustí vyhodnocení odpovídajících pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu (podporuje hierarchické klíče jako `user.123.status`) |
| value | `unknown` | ano | Hodnota faktu |

**Návratová hodnota:** `Promise<Fact>` — uložený fakt s metadaty

**Příklad:**

```typescript
await engine.setFact('user.123.premium', true);
await engine.setFact('cart.total', 150.00);
```

### getFact()

```typescript
getFact(key: string): unknown | undefined
```

Vrátí hodnotu faktu podle klíče.

### getFactFull()

```typescript
getFactFull(key: string): Fact | undefined
```

Vrátí kompletní fakt s metadaty (key, value, updatedAt, source).

### deleteFact()

```typescript
deleteFact(key: string): boolean
```

Smaže fakt.

### queryFacts()

```typescript
queryFacts(pattern: string): Fact[]
```

Najde fakta podle patternu. Podporuje wildcardy: `user.*`, `cart.*.items`.

**Příklad:**

```typescript
const userFacts = engine.queryFacts('user.123.*');
const allCarts = engine.queryFacts('cart.*');
```

### getAllFacts()

```typescript
getAllFacts(): Fact[]
```

Vrátí všechna fakta.

---

## Emitování událostí

### emit()

```typescript
async emit(topic: string, data?: Record<string, unknown>): Promise<Event>
```

Emituje událost a spustí vyhodnocení odpovídajících pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic události |
| data | `Record<string, unknown>` | ne | Payload události |

**Návratová hodnota:** `Promise<Event>` — emitovaná událost s ID a timestamp

**Příklad:**

```typescript
await engine.emit('order:created', {
  orderId: 'ORD-001',
  userId: '123',
  total: 99.99,
});
```

### emitCorrelated()

```typescript
async emitCorrelated(
  topic: string,
  data: Record<string, unknown>,
  correlationId: string,
  causationId?: string
): Promise<Event>
```

Emituje událost s korelačním sledováním pro distribuované trasování.

**Příklad:**

```typescript
await engine.emitCorrelated(
  'payment:processed',
  { amount: 99.99 },
  'txn-abc-123',
  'evt-xyz-789'
);
```

---

## Správa časovačů

### setTimer()

```typescript
async setTimer(config: {
  name: string;
  duration: string | number;
  onExpire: { topic: string; data: Record<string, unknown> };
  repeat?: { interval: string | number; maxCount?: number };
}): Promise<Timer>
```

Nastaví časovač, který emituje událost při expiraci.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Identifikátor časovače |
| duration | `string \| number` | ano | Čas do expirace (`'5m'`, `'1h30m'`, nebo ms) |
| onExpire.topic | `string` | ano | Topic události k emitování |
| onExpire.data | `Record<string, unknown>` | ano | Payload události |
| repeat.interval | `string \| number` | ne | Interval opakování |
| repeat.maxCount | `number` | ne | Max opakování |

**Návratová hodnota:** `Promise<Timer>` — vytvořený časovač

**Příklad:**

```typescript
await engine.setTimer({
  name: 'session-timeout',
  duration: '30m',
  onExpire: {
    topic: 'session:expired',
    data: { userId: '123' },
  },
});

// Opakující se časovač
await engine.setTimer({
  name: 'daily-cleanup',
  duration: '24h',
  onExpire: { topic: 'cleanup:run', data: {} },
  repeat: { interval: '24h' },
});
```

### cancelTimer()

```typescript
async cancelTimer(name: string): Promise<boolean>
```

Zruší aktivní časovač.

### getTimer()

```typescript
getTimer(name: string): Timer | undefined
```

Vrátí časovač podle názvu.

### getTimers()

```typescript
getTimers(): Timer[]
```

Vrátí všechny aktivní časovače.

---

## Subscribování

### subscribe()

```typescript
subscribe(topicPattern: string, handler: EventHandler): Unsubscribe
```

Subscribuje na události odpovídající topic patternu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topicPattern | `string` | ano | Topic nebo pattern (`order:*`, `*`) |
| handler | `(event: Event, topic: string) => void \| Promise<void>` | ano | Handler události |

**Návratová hodnota:** `() => void` — funkce pro unsubscribe

**Příklad:**

```typescript
const unsubscribe = engine.subscribe('order:*', (event, topic) => {
  console.log(`Přijato ${topic}:`, event.data);
});

// Později: unsubscribe();
```

---

## Statistiky

### getStats()

```typescript
getStats(): EngineStats
```

Vrátí statistiky enginu včetně volitelných dat tracingu, profilingu, auditu, verzování a baseline.

**Příklad:**

```typescript
const stats = engine.getStats();
console.log(`Pravidla: ${stats.rulesCount}`);
console.log(`Fakta: ${stats.factsCount}`);
console.log(`Zpracováno událostí: ${stats.eventsProcessed}`);
console.log(`Průměrný čas zpracování: ${stats.avgProcessingTimeMs}ms`);
```

---

## Tracing

### enableTracing()

```typescript
enableTracing(): void
```

Povolí debugging tracing.

### disableTracing()

```typescript
disableTracing(): void
```

Zakáže debugging tracing.

### isTracingEnabled()

```typescript
isTracingEnabled(): boolean
```

Vrátí, zda je tracing povolen.

### getTraceCollector()

```typescript
getTraceCollector(): TraceCollector
```

Vrátí TraceCollector pro přímý přístup k trace záznamům.

### getEventStore()

```typescript
getEventStore(): EventStore
```

Vrátí EventStore pro debugging a history queries.

### getFactStore()

```typescript
getFactStore(): FactStore
```

Vrátí FactStore pro debugging a snapshots.

### getAuditLog()

```typescript
getAuditLog(): AuditLogService | null
```

Vrátí AuditLogService. Null pokud audit není nakonfigurován.

---

## Profiling

### enableProfiling()

```typescript
enableProfiling(): Profiler
```

Povolí performance profiling. Agreguje statistiky z trace záznamů.

**Návratová hodnota:** `Profiler` — instance profileru

### disableProfiling()

```typescript
disableProfiling(): void
```

Zakáže profiling a uvolní profiler.

### isProfilingEnabled()

```typescript
isProfilingEnabled(): boolean
```

Vrátí, zda je profiling povolen.

### getProfiler()

```typescript
getProfiler(): Profiler | null
```

Vrátí Profiler pro přímý přístup. Null pokud profiling není povolen.

---

## Baseline (detekce anomálií)

### getBaselineStore()

```typescript
getBaselineStore(): BaselineStore | null
```

Vrátí BaselineStore. Null pokud baseline není nakonfigurován.

### getBaseline()

```typescript
getBaseline(metricName: string, groupKey?: string): BaselineStats | undefined
```

Vrátí baseline statistiky pro metriku.

### recalculateBaseline()

```typescript
async recalculateBaseline(metricName: string, groupKey?: string): Promise<BaselineStats>
```

Vynutí přepočet baseline.

**Vyhazuje:** `Error` pokud baseline není nakonfigurován nebo metrika nenalezena

---

## Zpětné řetězení

### query()

```typescript
query(goal: Goal | GoalBuilder): QueryResult
```

Provede backward chaining dotaz. Určí, zda je cíl dosažitelný z aktuálních faktů a pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| goal | `Goal \| GoalBuilder` | ano | Cílový goal (raw nebo z DSL) |

**Návratová hodnota:** `QueryResult` — `{ achievable, proof, exploredRules, maxDepthReached, durationMs }`

**Příklad:**

```typescript
import { factGoal } from '@hamicek/noex-rules';

const result = engine.query(
  factGoal('user.123.premium').equals(true)
);

if (result.achievable) {
  console.log('Cíl je dosažitelný');
  console.log('Důkaz:', result.proof);
}
```

---

## Metriky

### getMetricsCollector()

```typescript
getMetricsCollector(): MetricsCollector | null
```

Vrátí MetricsCollector pro Prometheus metriky. Null pokud metriky nejsou povoleny.

---

## Životní cyklus

### stop()

```typescript
async stop(): Promise<void>
```

Zastaví engine a uvolní všechny prostředky. Čeká na dokončení probíhajících vyhodnocení pravidel.

**Příklad:**

```typescript
await engine.stop();
```

### waitForProcessingQueue()

```typescript
waitForProcessingQueue(): Promise<void>
```

Čeká na dokončení aktuálně zpracovávaných pravidel. Užitečné pro bezpečnou aktualizaci pravidel.

### getHotReloadWatcher()

```typescript
getHotReloadWatcher(): HotReloadWatcher | null
```

Vrátí HotReloadWatcher. Null pokud hot-reload není nakonfigurován.

### getLookupCache()

```typescript
getLookupCache(): LookupCache
```

Vrátí LookupCache pro statistiky a správu cache externích dat.

### isRunning

```typescript
get isRunning(): boolean
```

Vrátí, zda engine běží.

---

## Typy

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

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| name | `string` | `'rule-engine'` | Název enginu pro logování |
| maxConcurrency | `number` | `10` | Max paralelních vyhodnocení pravidel |
| debounceMs | `number` | `0` | Debounce pro změny faktů |
| persistence | `PersistenceConfig` | — | Persistence pravidel |
| services | `Record<string, unknown>` | `{}` | Externí služby pro call_service |
| tracing | `TracingConfig` | — | Debugging tracing |
| timerPersistence | `TimerPersistenceConfig` | — | Durable timery |
| audit | `AuditPersistenceConfig` | — | Audit log |
| metrics | `MetricsConfig` | — | Prometheus metriky |
| opentelemetry | `OpenTelemetryConfig` | — | OpenTelemetry tracing |
| hotReload | `HotReloadConfig` | — | Hot-reload ze souborů |
| versioning | `VersioningConfig` | — | Historie verzí pravidel |
| baseline | `BaselineConfig` | — | Detekce anomálií |
| backwardChaining | `BackwardChainingConfig` | — | Nastavení zpětného řetězení |

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

---

## Viz také

- [FactStore](./02-fact-store.md) — Správa faktů
- [EventStore](./03-event-store.md) — Ukládání událostí
- [TimerManager](./04-timer-manager.md) — Správa časovačů
- [RuleManager](./05-rule-manager.md) — Indexace pravidel
- [Fluent Builder](./09-dsl-builder.md) — Rule.create() DSL
- [Konfigurace](./30-configuration.md) — Všechny konfigurační možnosti
- [Začínáme](../learn/01-getting-started/01-first-rule.md) — Tutoriál
