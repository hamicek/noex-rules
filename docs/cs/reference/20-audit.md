# Audit

Persistentní služba audit logu pro compliance a produkční monitoring. Na rozdíl od TraceCollector (opt-in, volatilní, debugging), AuditLogService je vždy zapnutá, persistuje záznamy do úložiště pomocí dávkového ukládání do časových bucketů a je zaměřena na compliance a provozní viditelnost.

## Import

```typescript
import {
  AuditLogService,
  // Typy
  AuditEntry,
  AuditQuery,
  AuditQueryResult,
  AuditConfig,
  AuditSubscriber,
  AuditStats,
  AuditCategory,
  AuditEventType,
  AuditRecordOptions,
  AUDIT_EVENT_CATEGORIES,
} from '@hamicek/noex-rules';

// StorageAdapter z core noex balíčku
import { StorageAdapter, SQLiteAdapter } from '@hamicek/noex';
```

---

## AuditLogService

In-memory ring buffer s multi-indexem pro rychlé dotazy, kombinovaný s dávkovou asynchronní persistencí přes StorageAdapter (hodinové časové buckety). Podporuje real-time notifikace subscriberů a automatické čištění podle retence.

### Factory metoda

```typescript
static async start(adapter?: StorageAdapter, config?: AuditConfig): Promise<AuditLogService>
```

Vytvoří a spustí instanci `AuditLogService`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| adapter | `StorageAdapter` | ne | Storage adapter pro persistenci. Bez něj záznamy žijí pouze v paměti |
| config | `AuditConfig` | ne | Přepisy konfigurace |

**Návratová hodnota:** `Promise<AuditLogService>` — inicializovaná instance audit log služby

**Příklad:**

```typescript
import { AuditLogService } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// S persistencí
const adapter = new SQLiteAdapter({ filename: './audit.db' });
const auditLog = await AuditLogService.start(adapter, {
  maxMemoryEntries: 100_000,
  retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 dní
});

// Pouze v paměti
const memoryAuditLog = await AuditLogService.start();
```

### record()

```typescript
record(
  type: AuditEventType,
  details: Record<string, unknown>,
  options?: AuditRecordOptions
): AuditEntry
```

Zaznamená nový audit záznam. Synchronně přidá do in-memory bufferu a indexů. Pokud je nakonfigurován storage adapter, záznam je zařazen do fronty pro dávkovou persistenci.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| type | `AuditEventType` | ano | Typ audit události |
| details | `Record<string, unknown>` | ano | Dodatečná kontextová data o operaci |
| options | `AuditRecordOptions` | ne | Dodatečná metadata pro záznam |

**Návratová hodnota:** `AuditEntry` — vytvořený audit záznam

**Příklad:**

```typescript
const entry = auditLog.record('rule_registered', {
  ruleId: 'temperature-alert',
  ruleName: 'Temperature Alert',
  priority: 100,
}, {
  ruleId: 'temperature-alert',
  ruleName: 'Temperature Alert',
  source: 'api',
});

console.log(`Zaznamenán záznam ${entry.id} v čase ${entry.timestamp}`);
```

### query()

```typescript
query(filter: AuditQuery): AuditQueryResult
```

Dotazuje audit záznamy s flexibilním filtrováním a stránkováním. Používá nejselektivnější index pro počáteční výběr kandidátů, pak aplikuje zbývající filtry. Výsledky jsou vráceny v chronologickém pořadí.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| filter | `AuditQuery` | ano | Parametry filtru dotazu |

**Návratová hodnota:** `AuditQueryResult` — stránkovaný výsledek dotazu

**Příklad:**

```typescript
const result = auditLog.query({
  category: 'rule_execution',
  types: ['rule_executed', 'rule_failed'],
  from: Date.now() - 3600_000, // poslední hodina
  limit: 50,
});

console.log(`Nalezeno ${result.entries.length} z ${result.totalCount} záznamů`);
console.log(`Dotaz trval ${result.queryTimeMs}ms`);
console.log(`Má další: ${result.hasMore}`);
```

### getById()

```typescript
getById(id: string): AuditEntry | undefined
```

Získá jednotlivý audit záznam podle ID.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| id | `string` | ano | ID audit záznamu |

**Návratová hodnota:** `AuditEntry | undefined` — záznam, nebo `undefined` pokud nenalezen

**Příklad:**

```typescript
const entry = auditLog.getById('aud_abc123');
if (entry) {
  console.log(`Nalezen záznam: ${entry.summary}`);
}
```

### subscribe()

```typescript
subscribe(subscriber: AuditSubscriber): () => void
```

Přihlásí se k odběru nových audit záznamů v reálném čase. Vrací funkci pro odhlášení.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| subscriber | `AuditSubscriber` | ano | Callback volaný pro každý nový záznam |

**Návratová hodnota:** `() => void` — funkce pro odhlášení

**Příklad:**

```typescript
const unsubscribe = auditLog.subscribe((entry) => {
  if (entry.type === 'rule_failed') {
    console.error(`Pravidlo selhalo: ${entry.ruleId} - ${entry.summary}`);
    // Odeslat alert, zalogovat do externího systému, atd.
  }
});

// Později: ukončit naslouchání
unsubscribe();
```

### getStats()

```typescript
getStats(): AuditStats
```

Vrátí statistiky o audit logu.

**Návratová hodnota:** `AuditStats` — objekt se statistikami

**Příklad:**

```typescript
const stats = auditLog.getStats();
console.log(`Celkem záznamů: ${stats.totalEntries}`);
console.log(`V paměti: ${stats.memoryEntries}`);
console.log(`Subscriberů: ${stats.subscribersCount}`);
console.log(`Podle kategorie:`, stats.entriesByCategory);
```

### size

```typescript
get size(): number
```

Aktuální počet záznamů držených v paměti.

**Příklad:**

```typescript
console.log(`Záznamů v paměti: ${auditLog.size}`);
```

### flush()

```typescript
async flush(): Promise<void>
```

Zapíše čekající záznamy do úložiště. Záznamy jsou seskupeny do hodinových časových bucketů a sloučeny s existujícími bucket daty v adapteru. Nic nedělá pokud není nakonfigurován adapter nebo nečekají žádné záznamy.

**Příklad:**

```typescript
await auditLog.flush();
```

### cleanup()

```typescript
async cleanup(maxAgeMs?: number): Promise<number>
```

Odstraní záznamy starší než retenční období z paměti i úložiště.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| maxAgeMs | `number` | ne | Přepsání retenční doby (výchozí je nakonfigurovaný retentionMs) |

**Návratová hodnota:** `number` — počet záznamů odstraněných z paměti

**Příklad:**

```typescript
// Použít nakonfigurovanou retenci
const removed = await auditLog.cleanup();

// Nebo přepsat vlastní retencí
const removed7d = await auditLog.cleanup(7 * 24 * 60 * 60 * 1000); // 7 dní

console.log(`Odstraněno ${removed} starých záznamů`);
```

### clear()

```typescript
clear(): void
```

Vymaže všechny in-memory záznamy a indexy. Neovlivňuje persistovaná data.

**Příklad:**

```typescript
auditLog.clear();
```

### stop()

```typescript
async stop(): Promise<void>
```

Zastaví službu: zapíše zbývající záznamy a zruší flush timer.

**Příklad:**

```typescript
await auditLog.stop();
```

---

## AuditCategory

```typescript
type AuditCategory =
  | 'rule_management'
  | 'rule_execution'
  | 'fact_change'
  | 'event_emitted'
  | 'system';
```

Vysokoúrovňové kategorie auditovatelných operací.

| Hodnota | Popis |
|---------|-------|
| `'rule_management'` | Operace životního cyklu pravidel a skupin (register, enable, disable, atd.) |
| `'rule_execution'` | Události vyhodnocení a vykonání pravidel |
| `'fact_change'` | Modifikace fact store |
| `'event_emitted'` | Události emitované pravidly nebo enginem |
| `'system'` | Životní cyklus engine a systémové operace |

---

## AuditEventType

```typescript
type AuditEventType =
  | 'rule_registered'
  | 'rule_unregistered'
  | 'rule_enabled'
  | 'rule_disabled'
  | 'rule_rolled_back'
  | 'rule_executed'
  | 'rule_skipped'
  | 'rule_failed'
  | 'group_created'
  | 'group_updated'
  | 'group_deleted'
  | 'group_enabled'
  | 'group_disabled'
  | 'fact_created'
  | 'fact_updated'
  | 'fact_deleted'
  | 'event_emitted'
  | 'engine_started'
  | 'engine_stopped'
  | 'hot_reload_started'
  | 'hot_reload_completed'
  | 'hot_reload_failed'
  | 'baseline_registered'
  | 'baseline_recalculated'
  | 'baseline_anomaly_detected'
  | 'backward_query_started'
  | 'backward_query_completed';
```

Specifické typy audit událostí.

| Událost | Kategorie | Popis |
|---------|-----------|-------|
| `rule_registered` | rule_management | Pravidlo bylo zaregistrováno |
| `rule_unregistered` | rule_management | Pravidlo bylo odebráno |
| `rule_enabled` | rule_management | Pravidlo bylo povoleno |
| `rule_disabled` | rule_management | Pravidlo bylo zakázáno |
| `rule_rolled_back` | rule_management | Pravidlo bylo obnoveno na předchozí verzi |
| `rule_executed` | rule_execution | Pravidlo bylo úspěšně vykonáno |
| `rule_skipped` | rule_execution | Vyhodnocení pravidla bylo přeskočeno |
| `rule_failed` | rule_execution | Vykonání pravidla selhalo |
| `group_created` | rule_management | Skupina pravidel byla vytvořena |
| `group_updated` | rule_management | Skupina pravidel byla aktualizována |
| `group_deleted` | rule_management | Skupina pravidel byla smazána |
| `group_enabled` | rule_management | Skupina pravidel byla povolena |
| `group_disabled` | rule_management | Skupina pravidel byla zakázána |
| `fact_created` | fact_change | Fakt byl vytvořen |
| `fact_updated` | fact_change | Fakt byl aktualizován |
| `fact_deleted` | fact_change | Fakt byl smazán |
| `event_emitted` | event_emitted | Událost byla emitována |
| `engine_started` | system | Engine byl spuštěn |
| `engine_stopped` | system | Engine byl zastaven |
| `hot_reload_started` | system | Hot reload proces začal |
| `hot_reload_completed` | system | Hot reload úspěšně dokončen |
| `hot_reload_failed` | system | Hot reload selhal |
| `baseline_registered` | system | Baseline metrika byla zaregistrována |
| `baseline_recalculated` | system | Baseline byla přepočítána |
| `baseline_anomaly_detected` | rule_execution | Anomálie byla detekována |
| `backward_query_started` | system | Backward chaining dotaz začal |
| `backward_query_completed` | system | Backward chaining dotaz dokončen |

---

## AUDIT_EVENT_CATEGORIES

```typescript
const AUDIT_EVENT_CATEGORIES: Record<AuditEventType, AuditCategory>
```

Mapování z typu události na její kategorii. Používá se interně pro automatické přiřazení kategorií při zaznamenávání záznamů.

**Příklad:**

```typescript
import { AUDIT_EVENT_CATEGORIES } from '@hamicek/noex-rules';

const category = AUDIT_EVENT_CATEGORIES['rule_executed']; // 'rule_execution'
```

---

## AuditEntry

```typescript
interface AuditEntry {
  id: string;
  timestamp: number;
  category: AuditCategory;
  type: AuditEventType;
  summary: string;
  source: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  details: Record<string, unknown>;
  durationMs?: number;
}
```

Jednotlivý záznam audit logu.

| Pole | Typ | Popis |
|------|-----|-------|
| id | `string` | Unikátní identifikátor tohoto audit záznamu |
| timestamp | `number` | Unix timestamp v milisekundách kdy událost nastala |
| category | `AuditCategory` | Vysokoúrovňová kategorie operace |
| type | `AuditEventType` | Specifický typ události |
| summary | `string` | Lidsky čitelný souhrn toho co se stalo |
| source | `string` | Zdrojová komponenta která událost vytvořila (např. `'rule-engine'`, `'api'`) |
| ruleId | `string` | ID pravidla zapojeného do operace, pokud relevantní |
| ruleName | `string` | Lidsky čitelný název zapojeného pravidla |
| correlationId | `string` | Correlation ID propojující související operace |
| details | `Record<string, unknown>` | Dodatečná kontextová data o operaci |
| durationMs | `number` | Doba trvání operace v milisekundách, pokud relevantní |

---

## AuditRecordOptions

```typescript
interface AuditRecordOptions {
  id?: string;
  timestamp?: number;
  summary?: string;
  source?: string;
  ruleId?: string;
  ruleName?: string;
  correlationId?: string;
  durationMs?: number;
}
```

Možnosti pro `record()`.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| id | `string` | auto-generováno | Vlastní ID pro záznam |
| timestamp | `number` | `Date.now()` | Vlastní timestamp |
| summary | `string` | auto-generováno | Lidsky čitelný souhrn |
| source | `string` | `'rule-engine'` | Identifikátor zdrojové komponenty |
| ruleId | `string` | — | ID souvisejícího pravidla |
| ruleName | `string` | — | Název souvisejícího pravidla |
| correlationId | `string` | — | Correlation ID pro propojení operací |
| durationMs | `number` | — | Doba trvání operace |

---

## AuditQuery

```typescript
interface AuditQuery {
  category?: AuditCategory;
  types?: AuditEventType[];
  ruleId?: string;
  source?: string;
  correlationId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}
```

Možnosti filtru pro dotazování audit záznamů.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| category | `AuditCategory` | — | Filtrovat podle kategorie |
| types | `AuditEventType[]` | — | Filtrovat podle typů událostí |
| ruleId | `string` | — | Filtrovat podle ID pravidla |
| source | `string` | — | Filtrovat podle zdrojové komponenty |
| correlationId | `string` | — | Filtrovat podle correlation ID |
| from | `number` | — | Záznamy po tomto timestampu (včetně) |
| to | `number` | — | Záznamy před tímto timestampem (včetně) |
| limit | `number` | `100` | Maximální počet záznamů k vrácení |
| offset | `number` | `0` | Počet záznamů k přeskočení pro stránkování |

---

## AuditQueryResult

```typescript
interface AuditQueryResult {
  entries: AuditEntry[];
  totalCount: number;
  queryTimeMs: number;
  hasMore: boolean;
}
```

Výsledek audit dotazu s metadaty stránkování.

| Pole | Typ | Popis |
|------|-----|-------|
| entries | `AuditEntry[]` | Odpovídající audit záznamy |
| totalCount | `number` | Celkový počet záznamů odpovídajících filtru (před stránkováním) |
| queryTimeMs | `number` | Čas strávený vykonáváním dotazu v milisekundách |
| hasMore | `boolean` | Zda existují další záznamy za aktuální stránkou |

---

## AuditConfig

```typescript
interface AuditConfig {
  enabled?: boolean;
  maxMemoryEntries?: number;
  retentionMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}
```

Konfigurace pro AuditLogService.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| enabled | `boolean` | `true` | Zda je audit logging povolen |
| maxMemoryEntries | `number` | `50000` | Maximální počet záznamů držených v in-memory bufferu |
| retentionMs | `number` | 30 dní | Jak dlouho uchovávat záznamy v milisekundách |
| batchSize | `number` | `100` | Počet záznamů na dávku persistence |
| flushIntervalMs | `number` | `5000` | Interval mezi flush cykly v milisekundách |

**Příklad:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  audit: {
    enabled: true,
    maxMemoryEntries: 100_000,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 dní
    batchSize: 200,
    flushIntervalMs: 10_000,
  },
});
```

---

## AuditStats

```typescript
interface AuditStats {
  totalEntries: number;
  memoryEntries: number;
  oldestEntry: number | null;
  newestEntry: number | null;
  entriesByCategory: Record<AuditCategory, number>;
  subscribersCount: number;
}
```

Statistiky o audit log službě.

| Pole | Typ | Popis |
|------|-----|-------|
| totalEntries | `number` | Celkový počet záznamů zaznamenaných od startu |
| memoryEntries | `number` | Počet záznamů aktuálně držených v paměti |
| oldestEntry | `number \| null` | Timestamp nejstaršího záznamu v paměti, nebo `null` pokud prázdné |
| newestEntry | `number \| null` | Timestamp nejnovějšího záznamu v paměti, nebo `null` pokud prázdné |
| entriesByCategory | `Record<AuditCategory, number>` | Rozpad záznamů podle kategorie |
| subscribersCount | `number` | Počet aktivních real-time subscriberů |

---

## AuditSubscriber

```typescript
type AuditSubscriber = (entry: AuditEntry) => void;
```

Typ callbacku pro real-time odběr audit záznamů.

**Příklad:**

```typescript
const subscriber: AuditSubscriber = (entry) => {
  console.log(`[${entry.category}] ${entry.type}: ${entry.summary}`);
};
```

---

## Kompletní příklad

```typescript
import { RuleEngine, AuditLogService } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// Možnost 1: Použití AuditLogService přímo
const adapter = new SQLiteAdapter({ filename: './audit.db' });
const auditLog = await AuditLogService.start(adapter, {
  maxMemoryEntries: 100_000,
  retentionMs: 30 * 24 * 60 * 60 * 1000, // 30 dní
});

// Zaznamenat vlastní audit události
auditLog.record('rule_registered', {
  ruleId: 'temp-alert',
  ruleName: 'Temperature Alert',
  triggersOn: 'sensor.temperature',
}, {
  ruleId: 'temp-alert',
  ruleName: 'Temperature Alert',
  source: 'api',
});

// Přihlásit se k real-time událostem
const unsubscribe = auditLog.subscribe((entry) => {
  if (entry.category === 'rule_execution' && entry.type === 'rule_failed') {
    console.error(`ALERT: Pravidlo ${entry.ruleId} selhalo - ${entry.summary}`);
  }
});

// Dotazovat historii auditu
const result = auditLog.query({
  category: 'rule_management',
  from: Date.now() - 24 * 60 * 60 * 1000, // posledních 24 hodin
  limit: 100,
});

for (const entry of result.entries) {
  console.log(`${new Date(entry.timestamp).toISOString()} - ${entry.summary}`);
}

// Získat statistiky
const stats = auditLog.getStats();
console.log(`Celkem záznamů: ${stats.totalEntries}`);

// Úklid
unsubscribe();
await auditLog.stop();

// Možnost 2: Konfigurace auditu v RuleEngine
const engine = await RuleEngine.start({
  audit: {
    enabled: true,
    maxMemoryEntries: 50_000,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
  },
});

// Engine automaticky zaznamenává audit události pro všechny operace
// Přístup k audit logu přes engine
const engineAuditLog = engine.getAuditLog();
const recentEvents = engineAuditLog?.query({
  types: ['rule_executed', 'rule_failed'],
  limit: 10,
});
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Používá audit logging pro automatické zaznamenávání událostí
- [Versioning](./19-versioning.md) — Historie verzí pravidel
- [Observability](./21-observability.md) — Metriky a tracing
- [Configuration](./30-configuration.md) — Kompletní reference konfigurace
