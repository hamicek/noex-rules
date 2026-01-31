# Audit logging

Debugging a profilovani jsou vyvojarske nastroje. V produkci potrebujete neco jineho: permanentni, dotazovatelny zaznam vseho, co engine dela. **AuditLogService** poskytuje stale zapnute logovani s persistentnim ulozistem, pokryvajici 26 typu udalosti v 5 kategoriich — od registrace a provadeni pravidel az po zmeny faktu a udalosti zivotniho cyklu systemu.

## Co se naucite

- Jak se `AuditLogService` lisi od `TraceCollector`
- Konfigurace audit persistence s `AuditPersistenceConfig`
- Vsech 26 typu audit udalosti a 5 kategorii
- Dotazovani audit zaznamu s filtrovanim a paginaci
- Realtime streaming pres SSE
- Retencni politiky a cisteni

## Audit vs tracing

Audit logging i tracing zaznamenavaji aktivitu enginu, ale slouzi ruznym ucelum:

| Aspekt | TraceCollector | AuditLogService |
|--------|----------------|-----------------|
| **Ucel** | Debugging pri vyvoji | Produkcni compliance |
| **Vychozi stav** | Vypnuty | Zapnuty |
| **Uloziste** | In-memory ring buffer | Persistentni (disk/DB) |
| **Granularita** | Kazdy krok vyhodnocovani | Pouze vyznamne udalosti |
| **Retence** | Omezeno velikosti bufferu | Casove zalozena (vychozi: 30 dni) |
| **Model dotazovani** | Dle korelace/pravidla/typu | Dle kategorie/typu/pravidla/casu + paginace |

Pouzijte tracing pro debug chovani pravidel pri vyvoji. Pouzijte audit logging pro udrzovani compliance zaznamu v produkci.

## AuditPersistenceConfig

Konfigurujte audit logging predanim `audit` do `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/audit.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,                    // Povinne: storage backend
    retentionMs: 30 * 24 * 60 * 60 * 1000,  // 30 dni (vychozi)
    batchSize: 100,             // Zaznamu na flush davku (vychozi: 100)
    flushIntervalMs: 5_000,     // Flush do storage kazdych 5s (vychozi: 5 000)
    maxMemoryEntries: 50_000,   // Velikost in-memory ring bufferu (vychozi: 50 000)
  },
});
```

### Bez persistence

Pokud neposkytnete konfiguraci `audit`, audit sluzba stale bezi s in-memory bufferem. Muzete dotazovat nedavne zaznamy, ale nepreziji restart:

```typescript
// Zadny adapter — pouze in-memory
const engine = await RuleEngine.start({});

// Audit sluzba je stale aktivni s 50 000 zaznamovym bufferem
const stats = engine.auditLog.getStats();
```

## Typy audit udalosti

Audit sluzba zaznamenava 26 typu udalosti organizovanych do 5 kategorii:

### Sprava pravidel (`rule_management`)

| Typ udalosti | Kdy |
|-----------|------|
| `rule_registered` | Pravidlo je pridano do enginu |
| `rule_unregistered` | Pravidlo je odebrano z enginu |
| `rule_enabled` | Pravidlo je povoleno |
| `rule_disabled` | Pravidlo je zakazano |
| `rule_rolled_back` | Verze pravidla je vracena zpet |

### Provadeni pravidel (`rule_execution`)

| Typ udalosti | Kdy |
|-----------|------|
| `rule_executed` | Podminky pravidla prosly a akce se dokoncily |
| `rule_skipped` | Podminky pravidla neprosly |
| `rule_failed` | Akce pravidla vyhodily chybu |

### Zmeny faktu (`fact_change`)

| Typ udalosti | Kdy |
|-----------|------|
| `fact_created` | Novy fakt je nastaven (klic drive neexistoval) |
| `fact_updated` | Hodnota existujiciho faktu je zmenena |
| `fact_deleted` | Fakt je odstranen |

### Emitovani udalosti (`event_emitted`)

| Typ udalosti | Kdy |
|-----------|------|
| `event_emitted` | Udalost je emitovana (uzivatelsky nebo akcne generovana) |

### System (`system`)

| Typ udalosti | Kdy |
|-----------|------|
| `engine_started` | Engine startuje |
| `engine_stopped` | Engine se zastavuje |
| `group_created` | Skupina pravidel je vytvorena |
| `group_updated` | Metadata skupiny pravidel jsou aktualizovana |
| `group_deleted` | Skupina pravidel je smazana |
| `group_enabled` | Skupina pravidel je povolena |
| `group_disabled` | Skupina pravidel je zakazana |
| `hot_reload_started` | Cyklus hot reloadu zacina |
| `hot_reload_completed` | Cyklus hot reloadu uspel |
| `hot_reload_failed` | Cyklus hot reloadu selhal |
| `baseline_registered` | Baselinova metrika je registrovana |
| `baseline_recalculated` | Baselinova metrika je prepocitana |
| `baseline_anomaly_detected` | Baselinova anomalie je detekovana |
| `backward_query_started` | Dotaz zpetneho retezeni zacina |
| `backward_query_completed` | Dotaz zpetneho retezeni je dokoncen |

## Struktura audit zaznamu

Kazdy audit zaznam obsahuje:

```typescript
interface AuditEntry {
  id: string;                          // Unikatni ID zaznamu
  timestamp: number;                   // Kdy nastal
  category: AuditCategory;            // Jedna z 5 kategorii
  type: AuditEventType;               // Jeden z 26 typu
  summary: string;                     // Lidsky citelny popis
  source: string;                      // Ktera komponenta ho generovala
  ruleId?: string;                     // Asociovane pravidlo (pokud relevantni)
  ruleName?: string;                   // Lidsky citelny nazev pravidla
  correlationId?: string;              // Propojeni s trace daty
  details: Record<string, unknown>;    // Payload specificky pro typ
  durationMs?: number;                 // Jak dlouho operace trvala
}
```

## Dotazovani audit zaznamu

Audit sluzba poskytuje flexibilni dotazovani s filtrovanim a paginaci:

```typescript
// Dotaz na nedavna provedeni pravidel
const result = engine.auditLog.query({
  category: 'rule_execution',
  limit: 50,
});

console.log(`Nalezeno ${result.totalCount} zaznamu (zobrazeno ${result.entries.length})`);
console.log(`Dalsi zaznamy: ${result.hasMore}`);
console.log(`Cas dotazu: ${result.queryTimeMs}ms`);

for (const entry of result.entries) {
  console.log(`[${entry.type}] ${entry.summary}`);
}
```

### Moznosti filtrovani

```typescript
interface AuditQuery {
  category?: AuditCategory;       // Filtr dle kategorie
  types?: AuditEventType[];       // Filtr dle konkretniho typu udalosti
  ruleId?: string;                // Filtr dle ID pravidla
  source?: string;                // Filtr dle zdrojove komponenty
  correlationId?: string;         // Filtr dle korelacniho ID
  from?: number;                  // Pocatecni casove razitko
  to?: number;                    // Koncove casove razitko
  limit?: number;                 // Max zaznamu k vraceni (vychozi: 100)
  offset?: number;                // Offset paginace
}
```

### Bezne vzory dotazovani

```typescript
// Vsechny zmeny konkretniho pravidla
const ruleHistory = engine.auditLog.query({
  ruleId: 'fraud-check',
  types: ['rule_registered', 'rule_enabled', 'rule_disabled', 'rule_rolled_back'],
});

// Vsechny zmeny faktu za posledni hodinu
const factChanges = engine.auditLog.query({
  category: 'fact_change',
  from: Date.now() - 3600_000,
});

// Selhani pravidel dnes
const failures = engine.auditLog.query({
  types: ['rule_failed'],
  from: new Date().setHours(0, 0, 0, 0),
});

// Strankovat pres vsechny zaznamy
let offset = 0;
const pageSize = 50;
let hasMore = true;

while (hasMore) {
  const page = engine.auditLog.query({ limit: pageSize, offset });
  for (const entry of page.entries) {
    // zpracovat zaznam
  }
  offset += pageSize;
  hasMore = page.hasMore;
}
```

### Ziskani jednoho zaznamu

```typescript
const entry = engine.auditLog.getById('audit-entry-123');
if (entry) {
  console.log(`${entry.type}: ${entry.summary}`);
  console.log('Detaily:', JSON.stringify(entry.details, null, 2));
}
```

## Realtime odber

Prihlaste se k odberu audit zaznamu, jak jsou zaznamenavany:

```typescript
const unsubscribe = engine.auditLog.subscribe((entry) => {
  if (entry.category === 'rule_execution' && entry.type === 'rule_failed') {
    console.error(`[AUDIT] Pravidlo selhalo: ${entry.ruleName} — ${entry.summary}`);
  }
});

// Pozdeji
unsubscribe();
```

## Audit statistiky

Ziskejte prehled stavu audit sluzby:

```typescript
const stats = engine.auditLog.getStats();

console.log(`Celkem zaznamu: ${stats.totalEntries}`);
console.log(`Zaznamu v pameti: ${stats.memoryEntries}`);
console.log(`Nejstarsi: ${stats.oldestEntry ? new Date(stats.oldestEntry).toISOString() : 'zadny'}`);
console.log(`Nejnovejsi: ${stats.newestEntry ? new Date(stats.newestEntry).toISOString() : 'zadny'}`);
console.log(`Odberatelu: ${stats.subscribersCount}`);

console.log('Dle kategorie:');
for (const [category, count] of Object.entries(stats.entriesByCategory)) {
  console.log(`  ${category}: ${count}`);
}
```

## Persistence a retence

### Jak uloziste funguje

Audit sluzba pouziva casove rozdelovanou persistenci. Zaznamy se akumuluji v pameti a jsou flushovany do uloziste periodicky (vychozi: kazdych 5 sekund) v davkach (vychozi: 100 zaznamu na davku). Storage klice jsou organizovany po hodinach:

```text
audit:2025-01-15T14  →  [zaznamy od 14:00 do 14:59]
audit:2025-01-15T15  →  [zaznamy od 15:00 do 15:59]
audit:2025-01-15T16  →  [zaznamy od 16:00 do 16:59]
```

### Manualni flush

Vynutte flush cekajicich zaznamu do uloziste:

```typescript
await engine.auditLog.flush();
```

### Retencni cisteni

Zaznamy starsi nez retencni perioda (vychozi: 30 dni) jsou odstraneny behem cisteni. Cisteni bezi automaticky, ale muzete ho spustit rucne:

```typescript
// Odstranit zaznamy starsi nez konfigurovana retence
await engine.auditLog.cleanup();

// Nebo zadat vlastni maximalni stari
await engine.auditLog.cleanup(7 * 24 * 60 * 60 * 1000); // 7 dni
```

## Kompletni priklad: Compliance dashboard pro financni pravidla

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
    retentionMs: 90 * 24 * 60 * 60 * 1000, // 90 dni pro financni compliance
    flushIntervalMs: 2_000,                  // Flush kazdou 2 sekundy
  },
});

// --- Transakcni pravidla ---

engine.registerRule(
  Rule.create('large-transaction-flag')
    .name('Oznaceni velkych transakci')
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
    .also(log('Velka transakce oznacena: $${event.amount} uzivatelem ${event.userId}'))
    .build()
);

engine.registerRule(
  Rule.create('suspicious-pattern')
    .name('Alert podezrele aktivity')
    .when(onEvent('transaction.completed'))
    .if(fact('user:${event.userId}:largeTransactionCount').gte(3))
    .then(emit('compliance.suspicious_activity', {
      userId: ref('event.userId'),
      largeTransactions: ref('fact.value'),
    }))
    .build()
);

// --- Simulace transakci ---

for (let i = 0; i < 20; i++) {
  await engine.emit('transaction.completed', {
    transactionId: `tx-${i}`,
    userId: 'u-42',
    amount: 5000 + Math.random() * 15000, // 5 000-20 000
  });
}

// --- Compliance dotazy ---

// 1. Vsechny zmeny spravy pravidel (kdo registroval/zmenil pravidla?)
const ruleChanges = engine.auditLog.query({
  category: 'rule_management',
});
console.log(`Udalosti spravy pravidel: ${ruleChanges.totalCount}`);

// 2. Vsechna provedeni pravidla oznacovani
const flagExecutions = engine.auditLog.query({
  ruleId: 'large-transaction-flag',
  types: ['rule_executed'],
});
console.log(`Oznaceni velkych transakci: ${flagExecutions.totalCount}`);

// 3. Nejaka selhani pravidel?
const failures = engine.auditLog.query({
  types: ['rule_failed'],
});
console.log(`Selhani pravidel: ${failures.totalCount}`);

// 4. Audit statistiky
const stats = engine.auditLog.getStats();
console.log(`\nPrehled auditu:`);
console.log(`  Celkem zaznamu: ${stats.totalEntries}`);
for (const [cat, count] of Object.entries(stats.entriesByCategory)) {
  if (count > 0) {
    console.log(`  ${cat}: ${count}`);
  }
}

// 5. Realtime monitoring
engine.auditLog.subscribe((entry) => {
  if (entry.type === 'rule_failed') {
    console.error(`[COMPLIANCE ALERT] Selhani pravidla: ${entry.summary}`);
  }
});

// Zajistit, ze vse je flushnuto pred zastavenim
await engine.auditLog.flush();
await engine.stop();
```

## REST API endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/audit/entries` | Dotaz na audit zaznamy (podpora vsech filtrovacich parametru) |
| `GET` | `/audit/entries/:id` | Ziskat jeden audit zaznam |
| `GET` | `/audit/stats` | Ziskat statistiky audit sluzby |
| `GET` | `/audit/stream` | SSE realtime stream audit zaznamu |
| `GET` | `/audit/stream/stats` | Statistiky SSE streamu |
| `GET` | `/audit/export` | Export zaznamu jako JSON nebo CSV |
| `POST` | `/audit/cleanup` | Manualni cisteni starych zaznamu |

### Filtry SSE streamu

Audit SSE stream na `/audit/stream` podporuje filtry pres query parametry:

```
GET /audit/stream?categories=rule_execution&types=rule_failed&ruleIds=fraud-check
```

Dostupne filtrovaci parametry:
- `categories` — carkou oddelene hodnoty `AuditCategory`
- `types` — carkou oddelene hodnoty `AuditEventType`
- `ruleIds` — carkou oddelena ID pravidel
- `sources` — carkou oddelene identifikatory zdroju

## Cviceni

Vybudujte compliance report zalozeny na auditu pro e-commerce pravidlovy engine:

1. Spustte engine s audit persistenci (SQLite, 60denni retence)
2. Zaregistrujte pravidla pro:
   - Aplikovani slevy na objednavky nad $100
   - VIP upgrade, kdyz celkove utraty presahnou $5 000
3. Vytvorte skupinu pravidel `pricing` a priradte k ni slevove pravidlo
4. Simulujte 50 objednavek s ruznymy celkovymi castkamy
5. Vygenerujte compliance report, ktery ukaze:
   - Celkovy pocet audit zaznamu dle kategorie
   - Vsechny udalosti spravy pravidel (registrace pravidel, tvorba skupin)
   - Celkovy pocet provedeni vs preskoceni pro kazde pravidlo
   - Jakakoliv selhani pravidel

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, ref, event, fact } from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/ecommerce-audit.db' });

const engine = await RuleEngine.start({
  audit: {
    adapter,
    retentionMs: 60 * 24 * 60 * 60 * 1000, // 60 dni
  },
});

// Vytvoreni skupiny
engine.createGroup({
  id: 'pricing',
  name: 'Cenova pravidla',
  enabled: true,
});

// Slevove pravidlo
engine.registerRule(
  Rule.create('order-discount')
    .name('Sleva na objednavku')
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

// Simulace objednavek
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

// 1. Prehled dle kategorie
const stats = engine.auditLog.getStats();
console.log('Zaznamy dle kategorie:');
for (const [cat, count] of Object.entries(stats.entriesByCategory)) {
  if (count > 0) console.log(`  ${cat}: ${count}`);
}

// 2. Udalosti spravy pravidel
const mgmt = engine.auditLog.query({ category: 'rule_management' });
console.log(`\nUdalosti spravy pravidel (${mgmt.totalCount}):`);
for (const entry of mgmt.entries) {
  console.log(`  [${entry.type}] ${entry.summary}`);
}

// 3. Systemove udalosti (tvorba skupin, zivotni cyklus enginu)
const sys = engine.auditLog.query({ category: 'system' });
console.log(`\nSystemove udalosti (${sys.totalCount}):`);
for (const entry of sys.entries) {
  console.log(`  [${entry.type}] ${entry.summary}`);
}

// 4. Statistiky provadeni pravidel
for (const ruleId of ['order-discount', 'vip-upgrade']) {
  const executed = engine.auditLog.query({ ruleId, types: ['rule_executed'] });
  const skipped = engine.auditLog.query({ ruleId, types: ['rule_skipped'] });
  const failed = engine.auditLog.query({ ruleId, types: ['rule_failed'] });
  console.log(`\n${ruleId}: provedeno=${executed.totalCount}, preskoceno=${skipped.totalCount}, selhano=${failed.totalCount}`);
}

// 5. Nejaka selhani?
const failures = engine.auditLog.query({ types: ['rule_failed'] });
console.log(`\nCelkem selhani pravidel: ${failures.totalCount}`);

await engine.auditLog.flush();
await engine.stop();
```

</details>

## Shrnuti

- **`AuditLogService`** poskytuje stale zapnute, persistentni logovani vsech vyznamnych udalosti enginu
- Na rozdil od `TraceCollector` je audit logging **ve vychozim stavu zapnuty** a navrzeny pro **produkcni compliance**
- Konfigurujte persistentni uloziste pres `audit` v `RuleEngine.start()` s `StorageAdapter`
- **26 typu audit udalosti** v **5 kategoriich**: sprava pravidel, provadeni pravidel, zmeny faktu, udalosti a system
- Kazdy zaznam obsahuje `id`, `timestamp`, `category`, `type`, `summary`, `source` a volitelne `ruleId`/`correlationId`
- Dotazujte zaznamy s **flexibilnim filtrovanim** dle kategorie, typu, pravidla, zdroje, casoveho rozsahu a **paginaci** pres `limit`/`offset`
- **Prihlaste se** k odberu realtime audit zaznamu pro okamzite alertovani pri selhanich
- Uloziste pouziva **hodinove casove buckety** s konfigurovatelnym davkovym flushem (vychozi: kazdych 5 sekund)
- **Retence** je vychozi 30 dni — zaznamy jsou cisteny automaticky nebo pres `cleanup()`
- Vsechna audit data jsou pristupna pres **REST API endpointy** a **SSE streaming**

---

Dalsi: [Metriky a tracing](./04-metriky.md)
