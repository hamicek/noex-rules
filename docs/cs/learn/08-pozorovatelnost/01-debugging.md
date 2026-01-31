# Debugging pravidel

Kdyz se pravidlo nespusti a nevite proc, potrebujete videt dovnitr enginu. noex-rules poskytuje tri nastroje pro debugging, ktere spolupracuji: **TraceCollector** zaznamenava kazdy krok vyhodnocovani do ring bufferu s rychlym vyhledavanim dle korelace, **DebugController** pridava IDE-podobne breakpointy a snapshoty nad trace daty a **HistoryService** umoznuje prozkoumavat kontext udalosti a sledovat retezce kauzality zpetne.

## Co se naucite

- Jak povolit `TraceCollector` a zaznamenavat trace zaznamy
- Vsech 16 typu trace zaznamu a co zachycuji
- Jak dotazovat trace dle korelace, pravidla, typu a casoveho rozsahu
- Pouziti `DebugController` pro breakpointy, pause/resume a snapshoty
- Prozkoumavani historie udalosti a retezcu kauzality s `HistoryService`
- Export tracu jako JSON nebo Mermaid diagramy

## TraceCollector

Trace collector je ring buffer, ktery zaznamenava kazdy vnitrni krok enginu — triggery pravidel, vyhodnocovani podminek, provadeni akci, zmeny faktu, operace casovcu a dalsi. Pouziva multi-indexove datove struktury pro rychle vyhledavani dle korelacniho ID, ID pravidla nebo typu zaznamu.

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

### Povoleni tracingu

Predejte `tracing` do `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  tracing: {
    enabled: true,      // Povolit sber tracu
    maxEntries: 10_000, // Velikost ring bufferu (vychozi: 10 000)
  },
});
```

Kdyz je buffer plny, nejstarsi zaznamy jsou prepsany. Tim zustava pamet ohranicena bez ohledu na to, jak dlouho engine bezi.

### Typy trace zaznamu

Kazdy zaznamy zaznam ma pole `type`, ktere kategorizuje, co se stalo:

| Typ | Kdy se zaznamena |
|-----|-------------------|
| `rule_triggered` | Trigger pravidla odpovidal udalosti/faktu/casovaci |
| `rule_executed` | Podminky pravidla prosly a akce se provedly |
| `rule_skipped` | Podminky pravidla se vyhodnotily jako false |
| `condition_evaluated` | Jedna podminka byla zkontrolovana (uspech/neusspech) |
| `action_started` | Akce zacala provadeni |
| `action_completed` | Akce uspesne dokoncena |
| `action_failed` | Akce vyhodila chybu |
| `fact_changed` | Fakt byl nastaven nebo smazan |
| `event_emitted` | Udalost byla emitovana (vcetne z akci) |
| `timer_set` | Casovac byl vytvoren |
| `timer_cancelled` | Casovac byl zrusen |
| `timer_expired` | Casovac vyprsel |
| `lookup_resolved` | Vyhledani datoveho pozadavku dokonceno |
| `backward_goal_evaluated` | Cil zpetneho retezeni byl vyhodnocen |
| `backward_rule_explored` | Pravidlo zpetneho retezeni bylo prozkoumano |

### Struktura trace zaznamu

Kazdy zaznam nese kontext o tom, co se stalo:

```typescript
interface DebugTraceEntry {
  id: string;                          // Unikatni ID zaznamu
  timestamp: number;                   // Kdy se to stalo
  type: TraceEntryType;                // Jeden z 16 typu vyse
  correlationId?: string;              // Propojuje souvisejici zaznamy
  causationId?: string;                // Co primo zpusobilo tento zaznam
  ruleId?: string;                     // Ktere pravidlo bylo zapojeno
  ruleName?: string;                   // Lidsky citelny nazev pravidla
  details: Record<string, unknown>;    // Payload specificke pro typ
  durationMs?: number;                 // Jak dlouho to trvalo (pro casovane zaznamy)
}
```

`correlationId` je klic k pochopeni trace dat. Kdyz udalost spusti pravidlo, korelacni ID udalosti se propaguje pres vsechny vysledne trace — vyhodnoceni pravidla, kontroly podminek, akce, emitovane udalosti a jakakoliv kaskadove spustena pravidla.

### Dotazovani tracu

Collector poskytuje vice metod dotazovani:

```typescript
// Ziskat vsechny trace pro konkretni retezec zpracovani udalosti
const chain = engine.traceCollector.getByCorrelation('corr-123');

// Ziskat vsechny trace pro konkretni pravidlo
const ruleTraces = engine.traceCollector.getByRule('fraud-check');

// Ziskat vsechna selhani akci
const failures = engine.traceCollector.getByType('action_failed');

// Ziskat 50 nejnovejsich zaznamu
const recent = engine.traceCollector.getRecent(50);

// Flexibilni dotaz s vice filtry
const results = engine.traceCollector.query({
  ruleId: 'fraud-check',
  types: ['rule_executed', 'action_failed'],
  fromTimestamp: Date.now() - 60_000,  // Posledni minuta
  limit: 100,
});
```

### Realtime odber

Prihlaste se k odberu trace zaznamu tak, jak jsou zaznamenavany:

```typescript
const unsubscribe = engine.traceCollector.subscribe((entry) => {
  if (entry.type === 'action_failed') {
    console.error(`Akce selhala v pravidle ${entry.ruleId}:`, entry.details);
  }
});

// Pozdeji: ukoncit prijem zaznamu
unsubscribe();
```

## DebugController

Debug controller poskytuje IDE-podobne schopnosti debugovani: breakpointy, pause/resume a snapshoty stavu enginu. Je navrzeny pro pouziti pri vyvoji, kde chcete zastavit engine v konkretnich bodech a prozkoumat jeho stav.

### Debug relace

Veskery debugging se odehrava v ramci relaci. Relace drzi breakpointy, snapshoty a stav provadeni:

```typescript
// Vytvorit debug relaci
const session = engine.debugController.createSession();
console.log(session.id); // 'debug-session-abc123'

// Vypsat vsechny aktivni relace
const sessions = engine.debugController.getSessions();

// Ukoncit relaci (uklidí breakpointy)
engine.debugController.endSession(session.id);
```

### Breakpointy

Breakpointy zastaví nebo zalogují, kdyz jsou splneny konkretni podminky. Ctyri typy breakpointu ciluji na ruzne operace enginu:

| Typ | Pole podminky | Odpovida kdyz |
|-----|---------------|---------------|
| `rule` | `ruleId` | Konkretni pravidlo je spusteno |
| `event` | `topic` | Udalost s danym topicem je zpracovana |
| `fact` | `factPattern` | Fakt odpovidajici vzoru se zmeni |
| `action` | `actionType` | Akce daneho typu se provede |

Kazdy breakpoint ma akci: `pause` zastavi provadeni, `log` zaznamena trace zaznam nebo `snapshot` zachyti stav enginu.

```typescript
// Pozastavit, kdyz se spusti konkretni pravidlo
engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'fraud-check' },
  action: 'pause',
});

// Zalogovat, kdyz prijde jakakoliv platebni udalost
engine.debugController.addBreakpoint(session.id, {
  type: 'event',
  condition: { topic: 'payment.*' },
  action: 'log',
});

// Povidit snapshot, kdyz se zmeni jakykoliv fakt odpovdiajici 'user:*'
engine.debugController.addBreakpoint(session.id, {
  type: 'fact',
  condition: { factPattern: 'user:*' },
  action: 'snapshot',
});
```

### Pause, resume a step

Kdyz se spusti `pause` breakpoint, engine se pozastavi:

```typescript
// Zkontrolovat, zda je engine pozastaven
if (engine.debugController.isPaused()) {
  // Ziskat relaci pro zjisteni, ktery breakpoint byl zasazen
  const session = engine.debugController.getSession(sessionId);
  console.log(`Pozastaven: ${session.paused}, Celkem zasahu: ${session.totalHits}`);

  // Obnovit provadeni
  engine.debugController.resume(sessionId);

  // Nebo pokrocit k dalsimu breakpointu
  engine.debugController.step(sessionId);
}
```

### Snapshoty

Snapshot zachyti aktualni stav enginu — vsechna fakta a nedavne trace — v danem casovem bode:

```typescript
// Poridit manualni snapshot
const snapshot = engine.debugController.takeSnapshot(session.id, 'pred-fraud-checkem');

console.log(snapshot.facts);         // Pole { key, value } paru
console.log(snapshot.recentTraces);  // Nedavne DebugTraceEntry[]
console.log(snapshot.label);         // 'pred-fraud-checkem'
console.log(snapshot.timestamp);     // Kdy byl snapshot porizen

// Ziskat snapshot pozdeji
const retrieved = engine.debugController.getSnapshot(session.id, snapshot.id);

// Smazat vsechny snapshoty
engine.debugController.clearSnapshots(session.id);
```

## HistoryService

History service poskytuje dotazovani na urovni udalosti s plnym trace kontextem. Zatimco trace collector operuje na urovni zaznamu, history service odpovida na otazky vyssi urovne: "Ktera pravidla tato udalost spustila?" a "Co zpusobilo emitovani teto udalosti?"

### Dotazovani historie udalosti

```typescript
// Najit nedavne udalosti pro topic
const result = engine.historyService.query({
  topic: 'order.created',
  from: Date.now() - 3600_000,  // Posledni hodina
  limit: 20,
  includeContext: true,          // Pripojit trace a data pravidel
});

for (const event of result.events) {
  console.log(`${event.topic} v ${event.timestamp}`);
  // S includeContext ma kazda udalost:
  console.log(`  Spustena pravidla: ${event.triggeredRules?.length}`);
  console.log(`  Zpusobene udalosti: ${event.causedEvents?.length}`);
}
```

### Korelacni casove osy

Sestavte slouceny timeline udalosti a tracu pro korelacni ID:

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

### Retezce kauzality

Sledujte retezec udalosti zpet pro nalezeni korenove priciny:

```typescript
// Zacit od alertove udalosti a sledovat zpet k puvodnimu triggeru
const chain = engine.historyService.getCausationChain('event-789');

for (const event of chain) {
  console.log(`${event.topic} -> zpusobeno: ${event.causationId}`);
}
```

### Export tracu

Exportujte korelacni retezec pro externi analyzu:

```typescript
// Export jako strukturovany JSON
const jsonExport = engine.historyService.exportTrace('corr-456', 'json');

// Export jako Mermaid sekvencni diagram
const mermaid = engine.historyService.exportTrace('corr-456', 'mermaid');
console.log(mermaid);
// sequenceDiagram
//   participant E as Events
//   participant R as Rules
//   E->>R: order.created
//   R->>E: payment.requested
//   ...
```

## Kompletni priklad: Debugging pipeline detekce podvodu

Tento priklad demonstruje pouziti vsech tri debugging nastroju dohromady pro vysetreni, proc se nespustil fraud alert:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

// Spusteni enginu s povolenym tracingem
const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 50_000 },
});

// --- Registrace pravidel detekce podvodu ---

engine.registerRule(
  Rule.create('velocity-check')
    .name('Kontrola rychlosti transakci')
    .priority(10)
    .when(onEvent('transaction.completed'))
    .if(fact('user:${event.userId}:txCount30m').gt(5))
    .then(emit('fraud.velocity_alert', {
      userId: ref('event.userId'),
      amount: ref('event.amount'),
      txCount: ref('fact.value'),
    }))
    .also(log('Velocity alert pro uzivatele ${event.userId}: ${fact.value} txn za 30m'))
    .build()
);

engine.registerRule(
  Rule.create('tx-counter')
    .name('Pocitadlo transakci')
    .priority(20)
    .when(onEvent('transaction.completed'))
    .then(setFact(
      'user:${event.userId}:txCount30m',
      '${(parseInt(fact.value || "0") + 1)}'
    ))
    .build()
);

// --- Nastaveni debug relace ---

const session = engine.debugController.createSession();

// Snapshot kdyz se spusti velocity check
engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'velocity-check' },
  action: 'snapshot',
});

// Odber realtime selhani tracu
engine.traceCollector.subscribe((entry) => {
  if (entry.type === 'rule_skipped' && entry.ruleId === 'velocity-check') {
    console.log('Velocity check preskocen — podminky nesplneny');
    console.log('Detaily:', JSON.stringify(entry.details, null, 2));
  }
});

// --- Simulace transakci ---

for (let i = 0; i < 7; i++) {
  await engine.emit('transaction.completed', {
    userId: 'u-42',
    amount: 150,
    merchant: 'online-store',
  });
}

// --- Vysetrovani s trace ---

// Najit vsechny trace pro pravidlo velocity-check
const velocityTraces = engine.traceCollector.getByRule('velocity-check');
console.log(`Trace velocity check: ${velocityTraces.length}`);

const executed = velocityTraces.filter(t => t.type === 'rule_executed');
const skipped = velocityTraces.filter(t => t.type === 'rule_skipped');
console.log(`  Provedeno: ${executed.length}, Preskoceno: ${skipped.length}`);
// Provedeno: 1, Preskoceno: 6
// (Pouze 7. transakce prekrocila prah 5)

// --- Kontrola dat profilovani ---

const profile = engine.profiler.getRuleProfile('velocity-check');
if (profile) {
  console.log(`Uspesnost: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`Prumerny cas vyhodnoceni: ${profile.avgTimeMs.toFixed(2)}ms`);
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

// --- Uklid ---

engine.debugController.endSession(session.id);
await engine.stop();
```

## REST API endpointy

Kdyz engine bezi s `RuleEngineServer`, vsechny debug funkce jsou pristupne pres HTTP:

### Tracing

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/traces` | Ziskat nedavne trace zaznamy |
| `GET` | `/debug/tracing` | Ziskat stav tracingu |
| `POST` | `/debug/tracing/enable` | Povolit tracing |
| `POST` | `/debug/tracing/disable` | Zakzat tracing |

### Historie udalosti

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/history` | Dotaz na historii udalosti |
| `GET` | `/debug/history/:eventId` | Ziskat udalost s kontextem |
| `GET` | `/debug/correlation/:id` | Ziskat korelacni retezec |
| `GET` | `/debug/correlation/:id/timeline` | Vizualni timeline |
| `GET` | `/debug/correlation/:id/export` | Export JSON/Mermaid |

### Debug relace

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `POST` | `/debug/sessions` | Vytvorit relaci |
| `GET` | `/debug/sessions` | Ziskat vsechny relace |
| `GET` | `/debug/sessions/:id` | Ziskat relaci |
| `DELETE` | `/debug/sessions/:id` | Ukoncit relaci |
| `POST` | `/debug/sessions/:id/resume` | Obnovit provadeni |
| `POST` | `/debug/sessions/:id/step` | Krokovat provadeni |
| `POST` | `/debug/sessions/:id/breakpoints` | Pridat breakpoint |
| `DELETE` | `/debug/sessions/:id/breakpoints/:bpId` | Odebrat breakpoint |
| `POST` | `/debug/sessions/:id/snapshot` | Poridit snapshot |
| `GET` | `/debug/sessions/:id/snapshots/:snapId` | Ziskat snapshot |

### Live SSE stream

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/stream` | SSE stream trace zaznamu |
| `GET` | `/debug/stream/connections` | Aktivni SSE pripojeni |

SSE stream podporuje filtry pres query parametry: `?types=rule_executed,action_failed&ruleIds=fraud-check&minDurationMs=10`.

## Cviceni

Vybudujte debugging setup pro pipeline zpracovani objednavek:

1. Vytvorte engine s povolenym tracingem (max 20 000 zaznamu)
2. Zaregistrujte tri pravidla:
   - `order-validator` ktery zkontroluje, ze `event.total > 0` a emituje `order.validated`
   - `inventory-check` ktery emituje `order.ready` pri prijeti `order.validated` a fakt `inventory:${event.productId}:stock` je vetsi nez 0
   - `order-fulfiller` ktery emituje `order.fulfilled` pri prijeti `order.ready`
3. Vytvorte debug relaci s breakpointem, ktery poridi snapshot pri spusteni `inventory-check`
4. Emitujte udalost `order.created` a pouzijte `getByCorrelation()` pro sledovani celeho retezce zpracovani
5. Zkontrolujte snapshot pro zjisteni stavu faktu v dobe vyhodnoceni `inventory-check`

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true, maxEntries: 20_000 },
});

// Pravidlo 1: Validace objednavky
engine.registerRule(
  Rule.create('order-validator')
    .name('Validator objednavek')
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

// Pravidlo 3: Vyrizeni objednavky
engine.registerRule(
  Rule.create('order-fulfiller')
    .name('Vyrizeni objednavky')
    .priority(10)
    .when(onEvent('order.ready'))
    .then(emit('order.fulfilled', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Nastaveni debugovani
const session = engine.debugController.createSession();

engine.debugController.addBreakpoint(session.id, {
  type: 'rule',
  condition: { ruleId: 'inventory-check' },
  action: 'snapshot',
});

// Nastaveni pocatecnich zasob
engine.setFact('inventory:prod-1:stock', 10);

// Emitovani objednavky
await engine.emit('order.created', {
  orderId: 'ord-100',
  productId: 'prod-1',
  total: 49.99,
});

// Sledovani celeho retezce
const events = engine.traceCollector.getRecent(50);
const correlationId = events.find(e => e.type === 'event_emitted')?.correlationId;

if (correlationId) {
  const chain = engine.traceCollector.getByCorrelation(correlationId);
  console.log(`Cely retezec (${chain.length} zaznamu):`);
  for (const entry of chain) {
    const rule = entry.ruleName ? ` [${entry.ruleName}]` : '';
    console.log(`  ${entry.type}${rule} (${entry.durationMs ?? 0}ms)`);
  }
}

// Kontrola snapshotu
const sess = engine.debugController.getSession(session.id);
if (sess?.snapshots.length) {
  const snap = sess.snapshots[0];
  console.log(`\nSnapshot pri inventory-check:`);
  for (const f of snap.facts) {
    console.log(`  ${f.key} = ${f.value}`);
  }
  // inventory:prod-1:stock = 10
}

engine.debugController.endSession(session.id);
await engine.stop();
```

Korelacni retezec ukazuje kompletni tok: `order.created` -> `order-validator` -> `order.validated` -> `inventory-check` -> `order.ready` -> `order-fulfiller` -> `order.fulfilled`. Snapshot pri `inventory-check` zachycuje stav faktu presne v danem bode.

</details>

## Shrnuti

- **`TraceCollector`** zaznamenava kazdy krok enginu do ohraniceneho ring bufferu (vychozi 10 000 zaznamu)
- Povolte tracing pres `tracing: { enabled: true }` v `RuleEngine.start()`
- **16 typu trace zaznamu** pokryva cely zivotni cyklus: triggery, podminky, akce, fakta, casovace a zpetne retezeni
- **`correlationId`** propojuje vsechny trace zaznamy ze stejneho retezce zpracovani udalosti
- Dotazujte trace dle korelace, pravidla, typu nebo casoveho rozsahu pomoci `getByCorrelation()`, `getByRule()`, `getByType()` a `query()`
- **`DebugController`** pridava breakpointy (rule, event, fact, action) s akcemi pause, log nebo snapshot
- **Snapshoty** zachycuji fakta enginu a nedavne trace v danem casovem bode
- **`HistoryService`** poskytuje dotazy na urovni udalosti s retezci kauzality a pohledy na timeline
- Exportujte trace jako **JSON nebo Mermaid diagramy** pro externi analyzu
- Vsechny funkce jsou pristupne pres **REST API** endpointy pri pouziti `RuleEngineServer`

---

Dalsi: [Profilovani vykonu](./02-profilaci.md)
