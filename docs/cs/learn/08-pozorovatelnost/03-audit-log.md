# Audit logging

Debugging a profilování jsou vývojářské nástroje. V produkci potřebujete něco jiného: permanentní, dotazovatelný záznam všeho, co engine dělá. **AuditLogService** poskytuje stále zapnuté logování s persistentním úložištěm, pokrývající 26 typů událostí v 5 kategoriích — od registrace a provádění pravidel až po změny faktů a události životního cyklu systému.

## Co se naučíte

- Jak se `AuditLogService` liší od `TraceCollector`
- Konfigurace audit persistence s `AuditPersistenceConfig`
- Všech 26 typů audit událostí a 5 kategorií
- Dotazování audit záznamů s filtrováním a paginací
- Realtime streaming přes SSE
- Retenční politiky a čištění

## Audit vs tracing

Audit logging i tracing zaznamenávají aktivitu enginu, ale slouží různým účelům:

| Aspekt | TraceCollector | AuditLogService |
|--------|----------------|-----------------|
| **Účel** | Debugging při vývoji | Produkční compliance |
| **Výchozí stav** | Vypnutý | Zapnutý |
| **Úložiště** | In-memory ring buffer | Persistentní (disk/DB) |
| **Granularita** | Každý krok vyhodnocování | Pouze významné události |
| **Retence** | Omezeno velikostí bufferu | Časově založená (výchozí: 30 dní) |
| **Model dotazování** | Dle korelace/pravidla/typu | Dle kategorie/typu/pravidla/času + paginace |

Použijte tracing pro debug chování pravidel při vývoji. Použijte audit logging pro udržování compliance záznamů v produkci.

## AuditPersistenceConfig

Konfigurujte audit logging předáním `audit` do `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/audit.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,                    // Povinné: storage backend
    retentionMs: 30 * 24 * 60 * 60 * 1000,  // 30 dní (výchozí)
    batchSize: 100,             // Záznamů na flush dávku (výchozí: 100)
    flushIntervalMs: 5_000,     // Flush do storage každých 5s (výchozí: 5 000)
    maxMemoryEntries: 50_000,   // Velikost in-memory ring bufferu (výchozí: 50 000)
  },
});
```

### Bez persistence

Pokud neposkytnete konfiguraci `audit`, audit služba stále běží s in-memory bufferem. Můžete dotazovat nedávné záznamy, ale nepřežijí restart:

```typescript
// Žádný adapter — pouze in-memory
const engine = await RuleEngine.start({});

// Audit služba je stále aktivní s 50 000 záznamovým bufferem
const stats = engine.auditLog.getStats();
```

## Typy audit událostí

Audit služba zaznamenává 26 typů událostí organizovaných do 5 kategorií:

### Správa pravidel (`rule_management`)

| Typ události | Kdy |
|-----------|------|
| `rule_registered` | Pravidlo je přidáno do enginu |
| `rule_unregistered` | Pravidlo je odebráno z enginu |
| `rule_enabled` | Pravidlo je povoleno |
| `rule_disabled` | Pravidlo je zakázáno |
| `rule_rolled_back` | Verze pravidla je vrácena zpět |

### Provádění pravidel (`rule_execution`)

| Typ události | Kdy |
|-----------|------|
| `rule_executed` | Podmínky pravidla prošly a akce se dokončily |
| `rule_skipped` | Podmínky pravidla neprošly |
| `rule_failed` | Akce pravidla vyhodily chybu |

### Změny faktů (`fact_change`)

| Typ události | Kdy |
|-----------|------|
| `fact_created` | Nový fakt je nastaven (klíč dříve neexistoval) |
| `fact_updated` | Hodnota existujícího faktu je změněna |
| `fact_deleted` | Fakt je odstraněn |

### Emitování událostí (`event_emitted`)

| Typ události | Kdy |
|-----------|------|
| `event_emitted` | Událost je emitována (uživatelsky nebo akčně generovaná) |

### Systém (`system`)

| Typ události | Kdy |
|-----------|------|
| `engine_started` | Engine startuje |
| `engine_stopped` | Engine se zastavuje |
| `group_created` | Skupina pravidel je vytvořena |
| `group_updated` | Metadata skupiny pravidel jsou aktualizována |
| `group_deleted` | Skupina pravidel je smazána |
| `group_enabled` | Skupina pravidel je povolena |
| `group_disabled` | Skupina pravidel je zakázána |
| `hot_reload_started` | Cyklus hot reloadu začíná |
| `hot_reload_completed` | Cyklus hot reloadu uspěl |
| `hot_reload_failed` | Cyklus hot reloadu selhal |
| `baseline_registered` | Baselinová metrika je registrována |
| `baseline_recalculated` | Baselinová metrika je přepočítána |
| `baseline_anomaly_detected` | Baselinová anomálie je detekována |
| `backward_query_started` | Dotaz zpětného řetězení začíná |
| `backward_query_completed` | Dotaz zpětného řetězení je dokončen |

## Struktura audit záznamu

Každý audit záznam obsahuje:

```typescript
interface AuditEntry {
  id: string;                          // Unikátní ID záznamu
  timestamp: number;                   // Kdy nastal
  category: AuditCategory;            // Jedna z 5 kategorií
  type: AuditEventType;               // Jeden z 26 typů
  summary: string;                     // Lidsky čitelný popis
  source: string;                      // Která komponenta ho generovala
  ruleId?: string;                     // Asociované pravidlo (pokud relevantní)
  ruleName?: string;                   // Lidsky čitelný název pravidla
  correlationId?: string;              // Propojení s trace daty
  details: Record<string, unknown>;    // Payload specifický pro typ
  durationMs?: number;                 // Jak dlouho operace trvala
}
```

## Dotazování audit záznamů

Audit služba poskytuje flexibilní dotazování s filtrováním a paginací:

```typescript
// Dotaz na nedávná provedení pravidel
const result = engine.auditLog.query({
  category: 'rule_execution',
  limit: 50,
});

console.log(`Nalezeno ${result.totalCount} záznamů (zobrazeno ${result.entries.length})`);
console.log(`Další záznamy: ${result.hasMore}`);
console.log(`Čas dotazu: ${result.queryTimeMs}ms`);

for (const entry of result.entries) {
  console.log(`[${entry.type}] ${entry.summary}`);
}
```

### Možnosti filtrování

```typescript
interface AuditQuery {
  category?: AuditCategory;       // Filtr dle kategorie
  types?: AuditEventType[];       // Filtr dle konkrétního typu události
  ruleId?: string;                // Filtr dle ID pravidla
  source?: string;                // Filtr dle zdrojové komponenty
  correlationId?: string;         // Filtr dle korelačního ID
  from?: number;                  // Počáteční časové razítko
  to?: number;                    // Koncové časové razítko
  limit?: number;                 // Max záznamů k vrácení (výchozí: 100)
  offset?: number;                // Offset paginace
}
```

### Běžné vzory dotazování

```typescript
// Všechny změny konkrétního pravidla
const ruleHistory = engine.auditLog.query({
  ruleId: 'fraud-check',
  types: ['rule_registered', 'rule_enabled', 'rule_disabled', 'rule_rolled_back'],
});

// Všechny změny faktů za poslední hodinu
const factChanges = engine.auditLog.query({
  category: 'fact_change',
  from: Date.now() - 3600_000,
});

// Selhání pravidel dnes
const failures = engine.auditLog.query({
  types: ['rule_failed'],
  from: new Date().setHours(0, 0, 0, 0),
});

// Stránkovat přes všechny záznamy
let offset = 0;
const pageSize = 50;
let hasMore = true;

while (hasMore) {
  const page = engine.auditLog.query({ limit: pageSize, offset });
  for (const entry of page.entries) {
    // zpracovat záznam
  }
  offset += pageSize;
  hasMore = page.hasMore;
}
```

### Získání jednoho záznamu

```typescript
const entry = engine.auditLog.getById('audit-entry-123');
if (entry) {
  console.log(`${entry.type}: ${entry.summary}`);
  console.log('Detaily:', JSON.stringify(entry.details, null, 2));
}
```

## Realtime odběr

Přihlaste se k odběru audit záznamů, jak jsou zaznamenávány:

```typescript
const unsubscribe = engine.auditLog.subscribe((entry) => {
  if (entry.category === 'rule_execution' && entry.type === 'rule_failed') {
    console.error(`[AUDIT] Pravidlo selhalo: ${entry.ruleName} — ${entry.summary}`);
  }
});

// Později
unsubscribe();
```

## Audit statistiky

Získejte přehled stavu audit služby:

```typescript
const stats = engine.auditLog.getStats();

console.log(`Celkem záznamů: ${stats.totalEntries}`);
console.log(`Záznamů v paměti: ${stats.memoryEntries}`);
console.log(`Nejstarší: ${stats.oldestEntry ? new Date(stats.oldestEntry).toISOString() : 'žádný'}`);
console.log(`Nejnovější: ${stats.newestEntry ? new Date(stats.newestEntry).toISOString() : 'žádný'}`);
console.log(`Odběratelů: ${stats.subscribersCount}`);

console.log('Dle kategorie:');
for (const [category, count] of Object.entries(stats.entriesByCategory)) {
  console.log(`  ${category}: ${count}`);
}
```

## Persistence a retence

### Jak úložiště funguje

Audit služba používá časově rozdělovanou persistenci. Záznamy se akumulují v paměti a jsou flushovány do úložiště periodicky (výchozí: každých 5 sekund) v dávkách (výchozí: 100 záznamů na dávku). Storage klíče jsou organizovány po hodinách:

```text
audit:2025-01-15T14  →  [záznamy od 14:00 do 14:59]
audit:2025-01-15T15  →  [záznamy od 15:00 do 15:59]
audit:2025-01-15T16  →  [záznamy od 16:00 do 16:59]
```

### Manuální flush

Vynuťte flush čekajících záznamů do úložiště:

```typescript
await engine.auditLog.flush();
```

### Retenční čištění

Záznamy starší než retenční perioda (výchozí: 30 dní) jsou odstraněny během čištění. Čištění běží automaticky, ale můžete ho spustit ručně:

```typescript
// Odstranit záznamy starší než konfigurovaná retence
await engine.auditLog.cleanup();

// Nebo zadat vlastní maximální stáří
await engine.auditLog.cleanup(7 * 24 * 60 * 60 * 1000); // 7 dní
```

## Kompletní příklad: Compliance dashboard pro finanční pravidla

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/compliance.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 dní pro finanční compliance
    flushIntervalMs: 2_000,                  // Flush každou 2 sekundy
  },
});

// --- Transakční pravidla ---

engine.registerRule(
  Rule.create('large-transaction-flag')
    .name('Označení velkých transakcí')
    .when(onEvent('transaction.completed'))
    .if(event('amount').gte(10_000))
    .then(emit('compliance.large_transaction', {
      transactionId: ref('event.transactionId'),
      amount: ref('event.amount'),
      userId: ref('event.userId'),
    }))
    .also(setFact(
      'user:${event.userId}:largeTransactionCount',
      '${(parseInt(fact.value || "0") + 1)}'
    ))
    .also(log('Velká transakce označena: $${event.amount} uživatelem ${event.userId}'))
    .build()
);

engine.registerRule(
  Rule.create('suspicious-pattern')
    .name('Alert podezřelé aktivity')
    .when(onEvent('transaction.completed'))
    .if(fact('user:${event.userId}:largeTransactionCount').gte(3))
    .then(emit('compliance.suspicious_activity', {
      userId: ref('event.userId'),
      largeTransactions: ref('fact.value'),
    }))
    .build()
);

// --- Simulace transakcí ---

for (let i = 0; i < 20; i++) {
  await engine.emit('transaction.completed', {
    transactionId: `tx-${i}`,
    userId: 'u-42',
    amount: 5000 + Math.random() * 15000, // 5 000-20 000
  });
}

// --- Compliance dotazy ---

// 1. Všechny změny správy pravidel (kdo registroval/změnil pravidla?)
const ruleChanges = engine.auditLog.query({
  category: 'rule_management',
});
console.log(`Události správy pravidel: ${ruleChanges.totalCount}`);

// 2. Všechna provedení pravidla označování
const flagExecutions = engine.auditLog.query({
  ruleId: 'large-transaction-flag',
  types: ['rule_executed'],
});
console.log(`Označení velkých transakcí: ${flagExecutions.totalCount}`);

// 3. Nějaká selhání pravidel?
const failures = engine.auditLog.query({
  types: ['rule_failed'],
});
console.log(`Selhání pravidel: ${failures.totalCount}`);

// 4. Audit statistiky
const stats = engine.auditLog.getStats();
console.log(`\nPřehled auditu:`);
console.log(`  Celkem záznamů: ${stats.totalEntries}`);
for (const [cat, count] of Object.entries(stats.entriesByCategory)) {
  if (count > 0) {
    console.log(`  ${cat}: ${count}`);
  }
}

// 5. Realtime monitoring
engine.auditLog.subscribe((entry) => {
  if (entry.type === 'rule_failed') {
    console.error(`[COMPLIANCE ALERT] Selhání pravidla: ${entry.summary}`);
  }
});

// Zajistit, že vše je flushnuto před zastavením
await engine.auditLog.flush();
await engine.stop();
```

## REST API endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/audit/entries` | Dotaz na audit záznamy (podpora všech filtrovacích parametrů) |
| `GET` | `/audit/entries/:id` | Získat jeden audit záznam |
| `GET` | `/audit/stats` | Získat statistiky audit služby |
| `GET` | `/audit/stream` | SSE realtime stream audit záznamů |
| `GET` | `/audit/stream/stats` | Statistiky SSE streamu |
| `GET` | `/audit/export` | Export záznamů jako JSON nebo CSV |
| `POST` | `/audit/cleanup` | Manuální čištění starých záznamů |

### Filtry SSE streamu

Audit SSE stream na `/audit/stream` podporuje filtry přes query parametry:

```
GET /audit/stream?categories=rule_execution&types=rule_failed&ruleIds=fraud-check
```

Dostupné filtrovací parametry:
- `categories` — čárkou oddělené hodnoty `AuditCategory`
- `types` — čárkou oddělené hodnoty `AuditEventType`
- `ruleIds` — čárkou oddělená ID pravidel
- `sources` — čárkou oddělené identifikátory zdrojů

## Cvičení

Vybudujte compliance report založený na auditu pro e-commerce pravidlový engine:

1. Spusťte engine s audit persistencí (SQLite, 60denní retence)
2. Zaregistrujte pravidla pro:
   - Aplikování slevy na objednávky nad $100
   - VIP upgrade, když celkové útraty přesáhnou $5 000
3. Vytvořte skupinu pravidel `pricing` a přiřaďte k ní slevové pravidlo
4. Simulujte 50 objednávek s různými celkovými částkami
5. Vygenerujte compliance report, který ukáže:
   - Celkový počet audit záznamů dle kategorie
   - Všechny události správy pravidel (registrace pravidel, tvorba skupin)
   - Celkový počet provedení vs přeskočení pro každé pravidlo
   - Jakákoliv selhání pravidel

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, ref, event, fact } from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/ecommerce-audit.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,
    retentionMs: 60 * 24 * 60 * 60 * 1000, // 60 dní
  },
});

// Vytvoření skupiny
engine.createGroup({
  id: 'pricing',
  name: 'Cenová pravidla',
  enabled: true,
});

// Slevové pravidlo
engine.registerRule(
  Rule.create('order-discount')
    .name('Sleva na objednávku')
    .group('pricing')
    .when(onEvent('order.created'))
    .if(event('total').gte(100))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.1,
    }))
    .build()
);

// VIP upgrade pravidlo
engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP upgrade')
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:totalSpent').gte(5000))
    .then(setFact('customer:${event.customerId}:tier', 'vip'))
    .build()
);

// Simulace objednávek
engine.setFact('customer:c-1:totalSpent', 4800);

for (let i = 0; i < 50; i++) {
  await engine.emit('order.created', {
    orderId: `ord-${i}`,
    customerId: 'c-1',
    total: 50 + Math.random() * 150, // 50-200
  });
}

// --- Compliance report ---

console.log('=== E-Commerce compliance report ===\n');

// 1. Přehled dle kategorie
const stats = engine.auditLog.getStats();
console.log('Záznamy dle kategorie:');
for (const [cat, count] of Object.entries(stats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

// 2. Události správy pravidel
const mgmt = engine.auditLog.query({ category: 'rule_management' });
console.log(`\nUdálosti správy pravidel (${mgmt.totalCount}):`);
for (const entry of mgmt.entries) {
  console.log(`  [${entry.type}] ${entry.summary}`);
}

// 3. Systémové události (tvorba skupin, životní cyklus enginu)
const sys = engine.auditLog.query({ category: 'system' });
console.log(`\nSystémové události (${sys.totalCount}):`);
for (const entry of sys.entries) {
  console.log(`  [${entry.type}] ${entry.summary}`);
}

// 4. Statistiky provádění pravidel
for (const ruleId of ['order-discount', 'vip-upgrade']) {
  const executed = engine.auditLog.query({ ruleId, types: ['rule_executed'] });
  const skipped = engine.auditLog.query({ ruleId, types: ['rule_skipped'] });
  const failed = engine.auditLog.query({ ruleId, types: ['rule_failed'] });
  console.log(`\n${ruleId}: provedeno=${executed.totalCount}, přeskočeno=${skipped.totalCount}, selháno=${failed.totalCount}`);
}

// 5. Nějaká selhání?
const failures = engine.auditLog.query({ types: ['rule_failed'] });
console.log(`\nCelkem selhání pravidel: ${failures.totalCount}`);

await engine.auditLog.flush();
await engine.stop();
```

</details>

## Shrnutí

- **`AuditLogService`** poskytuje stále zapnuté, persistentní logování všech významných událostí enginu
- Na rozdíl od `TraceCollector` je audit logging **ve výchozím stavu zapnutý** a navržený pro **produkční compliance**
- Konfigurujte persistentní úložiště přes `audit` v `RuleEngine.start()` s `StorageAdapter`
- **26 typů audit událostí** v **5 kategoriích**: správa pravidel, provádění pravidel, změny faktů, události a systém
- Každý záznam obsahuje `id`, `timestamp`, `category`, `type`, `summary`, `source` a volitelně `ruleId`/`correlationId`
- Dotazujte záznamy s **flexibilním filtrováním** dle kategorie, typu, pravidla, zdroje, časového rozsahu a **paginací** přes `limit`/`offset`
- **Přihlaste se** k odběru realtime audit záznamů pro okamžité alertování při selháních
- Úložiště používá **hodinové časové buckety** s konfigurovatelným dávkovým flushem (výchozí: každých 5 sekund)
- **Retence** je výchozí 30 dní — záznamy jsou čištěny automaticky nebo přes `cleanup()`
- Všechna audit data jsou přístupná přes **REST API endpointy** a **SSE streaming**

---

Další: [Metriky a tracing](./04-metriky.md)
