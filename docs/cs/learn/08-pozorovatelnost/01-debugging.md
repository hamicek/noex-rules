# Debugging pravidel

Když se pravidlo nespustí a nevíte proč, potřebujete vidět dovnitř enginu. noex-rules poskytuje tři nástroje pro debugging, které spolupracují: **TraceCollector** zaznamenává každý krok vyhodnocování do ring bufferu s rychlým vyhledáváním dle korelace, **DebugController** přidává IDE-podobné breakpointy a snapshoty nad trace daty a **HistoryService** umožňuje prozkoumávat kontext událostí a sledovat řetězce kauzality zpětně.

## Co se naučíte

- Jak povolit `TraceCollector` a zaznamenávat trace záznamy
- Všech 16 typů trace záznamů a co zachycují
- Jak dotazovat trace dle korelace, pravidla, typu a časového rozsahu
- Použití `DebugController` pro breakpointy, pause/resume a snapshoty
- Prozkoumávání historie událostí a řetězců kauzality s `HistoryService`
- Export traců jako JSON nebo Mermaid diagramy

## TraceCollector

Trace collector je ring buffer, který zaznamenává každý vnitřní krok enginu — triggery pravidel, vyhodnocování podmínek, provádění akcí, změny faktů, operace časovačů a další. Používá multi-indexové datové struktury pro rychlé vyhledávání dle korelačního ID, ID pravidla nebo typu záznamu.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│  Ring buffer     │
  │               │     │                 │     │  (max 10 000)    │
  └──────────────┘     └────────┬────────┘     └──────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────▼─────┐ ┌──▼──────┐ ┌──▼──────────┐
              │ Dle kor.  │ │ Dle     │ │ Dle typu    │
              │ ID indexu │ │ pravidla│ │ indexu      │
              └───────────┘ └─────────┘ └─────────────┘
```

### Povolení tracingu

Předejte `tracing` do `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  tracing: {
    enabled: true,      // Povolit sběr traců
    maxEntries: 10_000, // Velikost ring bufferu (výchozí: 10 000)
  },
});
```

Když je buffer plný, nejstarší záznamy jsou přepsány. Tím zůstává paměť ohraničená bez ohledu na to, jak dlouho engine běží.

### Typy trace záznamů

Každý zaznamenaný záznam má pole `type`, které kategorizuje, co se stalo:

| Typ | Kdy se zaznamená |
|-----|-------------------|
| `rule_triggered` | Trigger pravidla odpovídal události/faktu/časovači |
| `rule_executed` | Podmínky pravidla prošly a akce se provedly |
| `rule_skipped` | Podmínky pravidla se vyhodnotily jako false |
| `condition_evaluated` | Jedna podmínka byla zkontrolována (úspěch/neúspěch) |
| `action_started` | Akce začala provádění |
| `action_completed` | Akce úspěšně dokončena |
| `action_failed` | Akce vyhodila chybu |
| `fact_changed` | Fakt byl nastaven nebo smazán |
| `event_emitted` | Událost byla emitována (včetně z akcí) |
| `timer_set` | Časovač byl vytvořen |
| `timer_cancelled` | Časovač byl zrušen |
| `timer_expired` | Časovač vypršel |
| `lookup_resolved` | Vyhledání datového požadavku dokončeno |
| `backward_goal_evaluated` | Cíl zpětného řetězení byl vyhodnocen |
| `backward_rule_explored` | Pravidlo zpětného řetězení bylo prozkoumáno |

### Struktura trace záznamu

Každý záznam nese kontext o tom, co se stalo:

```typescript
interface DebugTraceEntry {
  id: string;                          // Unikátní ID záznamu
  timestamp: number;                   // Kdy se to stalo
  type: TraceEntryType;                // Jeden z 16 typů výše
  correlationId?: string;              // Propojuje související záznamy
  causationId?: string;                // Co přímo způsobilo tento záznam
  ruleId?: string;                     // Které pravidlo bylo zapojeno
  ruleName?: string;                   // Lidsky čitelný název pravidla
  details: Record<string, unknown>;    // Payload specifické pro typ
  durationMs?: number;                 // Jak dlouho to trvalo (pro časované záznamy)
}
```

`correlationId` je klíč k pochopení trace dat. Když událost spustí pravidlo, korelační ID události se propaguje přes všechny výsledné trace — vyhodnocení pravidla, kontroly podmínek, akce, emitované události a jakákoliv kaskádově spuštěná pravidla.

### Dotazování traců

Collector poskytuje více metod dotazování:

```typescript
// Získat všechny trace pro konkrétní řetězec zpracování události
const chain = engine.traceCollector.getByCorrelation('corr-123');

// Získat všechny trace pro konkrétní pravidlo
const ruleTraces = engine.traceCollector.getByRule('fraud-check');

// Získat všechna selhání akcí
const failures = engine.traceCollector.getByType('action_failed');

// Získat 50 nejnovějších záznamů
const recent = engine.traceCollector.getRecent(50);

// Flexibilní dotaz s více filtry
const results = engine.traceCollector.query({
  ruleId: 'fraud-check',
  types: ['rule_executed', 'action_failed'],
  fromTimestamp: Date.now() - 60_000,  // Poslední minuta
  limit: 100,
});
```

### Realtime odběr

Přihlaste se k odběru trace záznamů tak, jak jsou zaznamenávány:

```typescript
const unsubscribe = engine.traceCollector.subscribe((entry) => {
  if (entry.type === 'action_failed') {
    console.error(`Akce selhala v pravidle ${entry.ruleId}:`, entry.details);
  }
});

// Později: ukončit příjem záznamů
unsubscribe();
```

## DebugController

Debug controller poskytuje IDE-podobné schopnosti debugování: breakpointy, pause/resume a snapshoty stavu enginu. Je navržený pro použití při vývoji, kde chcete zastavit engine v konkrétních bodech a prozkoumat jeho stav.

### Debug relace

Veškerý debugging se odehrává v rámci relací. Relace drží breakpointy, snapshoty a stav provádění:

```typescript
// Vytvořit debug relaci
const session = engine.debugController.createSession();
console.log(session.id); // 'debug-session-abc123'

// Vypsat všechny aktivní relace
const sessions = engine.debugController.getSessions();

// Ukončit relaci (uklidí breakpointy)
engine.debugController.endSession(session.id);
```

### Breakpointy

Breakpointy zastaví nebo zalogují, když jsou splněny konkrétní podmínky. Čtyři typy breakpointů cílují na různé operace enginu:

| Typ | Pole podmínky | Odpovídá když |
|-----|---------------|---------------|
| `rule` | `ruleId` | Konkrétní pravidlo je spuštěno |
| `event` | `topic` | Událost s daným topicem je zpracována |
| `fact` | `factPattern` | Fakt odpovídající vzoru se změní |
| `action` | `actionType` | Akce daného typu se provede |

Každý breakpoint má akci: `pause` zastaví provádění, `log` zaznamená trace záznam nebo `snapshot` zachytí stav enginu.

```typescript
// Pozastavit, když se spustí konkrétní pravidlo
engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'fraud-check' },
  action: 'pause',
});

// Zalogovat, když přijde jakákoliv platební událost
engine.debugController.addBreakpoint(session.id, {
  type: 'event',
  condition: { topic: 'payment.*' },
  action: 'log',
});

// Pořídit snapshot, když se změní jakýkoliv fakt odpovídající 'user:*'
engine.debugController.addBreakpoint(session.id, {
  type: 'fact',
  condition: { factPattern: 'user:*' },
  action: 'snapshot',
});
```

### Pause, resume a step

Když se spustí `pause` breakpoint, engine se pozastaví:

```typescript
// Zkontrolovat, zda je engine pozastaven
if (engine.debugController.isPaused()) {
  // Získat relaci pro zjištění, který breakpoint byl zasažen
  const session = engine.debugController.getSession(sessionId);
  console.log(`Pozastaven: ${session.paused}, Celkem zásahů: ${session.totalHits}`);

  // Obnovit provádění
  engine.debugController.resume(sessionId);

  // Nebo pokročit k dalšímu breakpointu
  engine.debugController.step(sessionId);
}
```

### Snapshoty

Snapshot zachytí aktuální stav enginu — všechna fakta a nedávné trace — v daném časovém bodě:

```typescript
// Pořídit manuální snapshot
const snapshot = engine.debugController.takeSnapshot(session.id, 'pred-fraud-checkem');

console.log(snapshot.facts);         // Pole { key, value } párů
console.log(snapshot.recentTraces);  // Nedávné DebugTraceEntry[]
console.log(snapshot.label);         // 'pred-fraud-checkem'
console.log(snapshot.timestamp);     // Kdy byl snapshot pořízen

// Získat snapshot později
const retrieved = engine.debugController.getSnapshot(session.id, snapshot.id);

// Smazat všechny snapshoty
engine.debugController.clearSnapshots(session.id);
```

## HistoryService

History service poskytuje dotazování na úrovni událostí s plným trace kontextem. Zatímco trace collector operuje na úrovni záznamů, history service odpovídá na otázky vyšší úrovně: "Která pravidla tato událost spustila?" a "Co způsobilo emitování této události?"

### Dotazování historie událostí

```typescript
// Najít nedávné události pro topic
const result = engine.historyService.query({
  topic: 'order.created',
  from: Date.now() - 3600_000,  // Poslední hodina
  limit: 20,
  includeContext: true,          // Připojit trace a data pravidel
});

for (const event of result.events) {
  console.log(`${event.topic} v ${event.timestamp}`);
  // S includeContext má každá událost:
  console.log(`  Spuštěná pravidla: ${event.triggeredRules?.length}`);
  console.log(`  Způsobené události: ${event.causedEvents?.length}`);
}
```

### Korelační časové osy

Sestavte sloučený timeline událostí a traců pro korelační ID:

```typescript
const timeline = engine.historyService.getCorrelationTimeline('corr-456');

for (const entry of timeline) {
  const indent = '  '.repeat(entry.depth);
  if (entry.type === 'event') {
    console.log(`${indent}[UDALOST] ${entry.entry.topic}`);
  } else {
    console.log(`${indent}[TRACE] ${entry.entry.type}: ${entry.entry.ruleName}`);
  }
}
```

### Řetězce kauzality

Sledujte řetězec událostí zpět pro nalezení kořenové příčiny:

```typescript
// Začít od alertové události a sledovat zpět k původnímu triggeru
const chain = engine.historyService.getCausationChain('event-789');

for (const event of chain) {
  console.log(`${event.topic} -> způsobeno: ${event.causationId}`);
}
```

### Export traců

Exportujte korelační řetězec pro externí analýzu:

```typescript
// Export jako strukturovaný JSON
const jsonExport = engine.historyService.exportTrace('corr-456', 'json');

// Export jako Mermaid sekvenční diagram
const mermaid = engine.historyService.exportTrace('corr-456', 'mermaid');
console.log(mermaid);
// sequenceDiagram
//   participant E as Events
//   participant R as Rules
//   E->>R: order.created
//   R->>E: payment.requested
//   ...
```

## Kompletní příklad: Debugging pipeline detekce podvodu

Tento příklad demonstruje použití všech tří debugging nástrojů dohromady pro vyšetření, proč se nespustil fraud alert:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

// Spuštění enginu s povoleným tracingem
const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 50_000 },
});

// --- Registrace pravidel detekce podvodu ---

engine.registerRule(
  Rule.create('velocity-check')
    .name('Kontrola rychlosti transakcí')
    .priority(10)
    .when(onEvent('transaction.completed'))
    .if(fact('user:${event.userId}:txCount30m').gt(5))
    .then(emit('fraud.velocity_alert', {
      userId: ref('event.userId'),
      amount: ref('event.amount'),
      txCount: ref('fact.value'),
    }))
    .also(log('Velocity alert pro uživatele ${event.userId}: ${fact.value} txn za 30m'))
    .build()
);

engine.registerRule(
  Rule.create('tx-counter')
    .name('Počítadlo transakcí')
    .priority(20)
    .when(onEvent('transaction.completed'))
    .then(setFact(
      'user:${event.userId}:txCount30m',
      '${(parseInt(fact.value || "0") + 1)}'
    ))
    .build()
);

// --- Nastavení debug relace ---

const session = engine.debugController.createSession();

// Snapshot když se spustí velocity check
engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'velocity-check' },
  action: 'snapshot',
});

// Odběr realtime selhání traců
engine.traceCollector.subscribe((entry) => {
  if (entry.type === 'rule_skipped' && entry.ruleId === 'velocity-check') {
    console.log('Velocity check přeskočen — podmínky nesplněny');
    console.log('Detaily:', JSON.stringify(entry.details, null, 2));
  }
});

// --- Simulace transakcí ---

for (let i = 0; i < 7; i++) {
  await engine.emit('transaction.completed', {
    userId: 'u-42',
    amount: 150,
    merchant: 'online-store',
  });
}

// --- Vyšetřování s trace ---

// Najít všechny trace pro pravidlo velocity-check
const velocityTraces = engine.traceCollector.getByRule('velocity-check');
console.log(`Trace velocity check: ${velocityTraces.length}`);

const executed = velocityTraces.filter(t => t.type === 'rule_executed');
const skipped = velocityTraces.filter(t => t.type === 'rule_skipped');
console.log(`  Provedeno: ${executed.length}, Přeskočeno: ${skipped.length}`);
// Provedeno: 1, Přeskočeno: 6
// (Pouze 7. transakce překročila práh 5)

// --- Kontrola dat profilování ---

const profile = engine.profiler.getRuleProfile('velocity-check');
if (profile) {
  console.log(`Úspěšnost: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`Průměrný čas vyhodnocení: ${profile.avgTimeMs.toFixed(2)}ms`);
}

// --- Inspekce snapshotu ---

const snapshots = engine.debugController.getSession(session.id)?.snapshots;
if (snapshots?.length) {
  const snap = snapshots[0];
  console.log(`Snapshot "${snap.label}" v ${new Date(snap.timestamp).toISOString()}`);
  console.log(`Fakta: ${snap.facts.length}`);
  for (const f of snap.facts) {
    console.log(`  ${f.key} = ${f.value}`);
  }
}

// --- Úklid ---

engine.debugController.endSession(session.id);
await engine.stop();
```

## REST API endpointy

Když engine běží s `RuleEngineServer`, všechny debug funkce jsou přístupné přes HTTP:

### Tracing

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/traces` | Získat nedávné trace záznamy |
| `GET` | `/debug/tracing` | Získat stav tracingu |
| `POST` | `/debug/tracing/enable` | Povolit tracing |
| `POST` | `/debug/tracing/disable` | Zakázat tracing |

### Historie událostí

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/history` | Dotaz na historii událostí |
| `GET` | `/debug/history/:eventId` | Získat událost s kontextem |
| `GET` | `/debug/correlation/:id` | Získat korelační řetězec |
| `GET` | `/debug/correlation/:id/timeline` | Vizuální timeline |
| `GET` | `/debug/correlation/:id/export` | Export JSON/Mermaid |

### Debug relace

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `POST` | `/debug/sessions` | Vytvořit relaci |
| `GET` | `/debug/sessions` | Získat všechny relace |
| `GET` | `/debug/sessions/:id` | Získat relaci |
| `DELETE` | `/debug/sessions/:id` | Ukončit relaci |
| `POST` | `/debug/sessions/:id/resume` | Obnovit provádění |
| `POST` | `/debug/sessions/:id/step` | Krokovat provádění |
| `POST` | `/debug/sessions/:id/breakpoints` | Přidat breakpoint |
| `DELETE` | `/debug/sessions/:id/breakpoints/:bpId` | Odebrat breakpoint |
| `POST` | `/debug/sessions/:id/snapshot` | Pořídit snapshot |
| `GET` | `/debug/sessions/:id/snapshots/:snapId` | Získat snapshot |

### Live SSE stream

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/stream` | SSE stream trace záznamů |
| `GET` | `/debug/stream/connections` | Aktivní SSE připojení |

SSE stream podporuje filtry přes query parametry: `?types=rule_executed,action_failed&ruleIds=fraud-check&minDurationMs=10`.

## Cvičení

Vybudujte debugging setup pro pipeline zpracování objednávek:

1. Vytvořte engine s povoleným tracingem (max 20 000 záznamů)
2. Zaregistrujte tři pravidla:
   - `order-validator` který zkontroluje, že `event.total > 0` a emituje `order.validated`
   - `inventory-check` který emituje `order.ready` při přijetí `order.validated` a fakt `inventory:${event.productId}:stock` je větší než 0
   - `order-fulfiller` který emituje `order.fulfilled` při přijetí `order.ready`
3. Vytvořte debug relaci s breakpointem, který pořídí snapshot při spuštění `inventory-check`
4. Emitujte událost `order.created` a použijte `getByCorrelation()` pro sledování celého řetězce zpracování
5. Zkontrolujte snapshot pro zjištění stavu faktů v době vyhodnocení `inventory-check`

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 20_000 },
});

// Pravidlo 1: Validace objednávky
engine.registerRule(
  Rule.create('order-validator')
    .name('Validátor objednávek')
    .priority(10)
    .when(onEvent('order.created'))
    .if(event('total').gt(0))
    .then(emit('order.validated', {
      orderId: ref('event.orderId'),
      productId: ref('event.productId'),
      total: ref('event.total'),
    }))
    .build()
);

// Pravidlo 2: Kontrola skladu
engine.registerRule(
  Rule.create('inventory-check')
    .name('Kontrola skladu')
    .priority(10)
    .when(onEvent('order.validated'))
    .if(fact('inventory:${event.productId}:stock').gt(0))
    .then(emit('order.ready', {
      orderId: ref('event.orderId'),
      productId: ref('event.productId'),
    }))
    .build()
);

// Pravidlo 3: Vyřízení objednávky
engine.registerRule(
  Rule.create('order-fulfiller')
    .name('Vyřízení objednávky')
    .priority(10)
    .when(onEvent('order.ready'))
    .then(emit('order.fulfilled', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Nastavení debugování
const session = engine.debugController.createSession();

engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'inventory-check' },
  action: 'snapshot',
});

// Nastavení počátečních zásob
engine.setFact('inventory:prod-1:stock', 10);

// Emitování objednávky
await engine.emit('order.created', {
  orderId: 'ord-100',
  productId: 'prod-1',
  total: 49.99,
});

// Sledování celého řetězce
const events = engine.traceCollector.getRecent(50);
const correlationId = events.find(e => e.type === 'event_emitted')?.correlationId;

if (correlationId) {
  const chain = engine.traceCollector.getByCorrelation(correlationId);
  console.log(`Celý řetězec (${chain.length} záznamů):`);
  for (const entry of chain) {
    const rule = entry.ruleName ? ` [${entry.ruleName}]` : '';
    console.log(`  ${entry.type}${rule} (${entry.durationMs ?? 0}ms)`);
  }
}

// Kontrola snapshotu
const sess = engine.debugController.getSession(session.id);
if (sess?.snapshots.length) {
  const snap = sess.snapshots[0];
  console.log(`\nSnapshot při inventory-check:`);
  for (const f of snap.facts) {
    console.log(`  ${f.key} = ${f.value}`);
  }
  // inventory:prod-1:stock = 10
}

engine.debugController.endSession(session.id);
await engine.stop();
```

Korelační řetězec ukazuje kompletní tok: `order.created` -> `order-validator` -> `order.validated` -> `inventory-check` -> `order.ready` -> `order-fulfiller` -> `order.fulfilled`. Snapshot při `inventory-check` zachycuje stav faktů přesně v daném bodě.

</details>

## Shrnutí

- **`TraceCollector`** zaznamenává každý krok enginu do ohraničeného ring bufferu (výchozí 10 000 záznamů)
- Povolte tracing přes `tracing: { enabled: true }` v `RuleEngine.start()`
- **16 typů trace záznamů** pokrývá celý životní cyklus: triggery, podmínky, akce, fakta, časovače a zpětné řetězení
- **`correlationId`** propojuje všechny trace záznamy ze stejného řetězce zpracování události
- Dotazujte trace dle korelace, pravidla, typu nebo časového rozsahu pomocí `getByCorrelation()`, `getByRule()`, `getByType()` a `query()`
- **`DebugController`** přidává breakpointy (rule, event, fact, action) s akcemi pause, log nebo snapshot
- **Snapshoty** zachycují fakta enginu a nedávné trace v daném časovém bodě
- **`HistoryService`** poskytuje dotazy na úrovni událostí s řetězci kauzality a pohledy na timeline
- Exportujte trace jako **JSON nebo Mermaid diagramy** pro externí analýzu
- Všechny funkce jsou přístupné přes **REST API** endpointy při použití `RuleEngineServer`

---

Další: [Profilování výkonu](./02-profilaci.md)
