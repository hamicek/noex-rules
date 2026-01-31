# Dopredne vs zpetne retezeni

V prubehu tohoto pruvodce jste psali pravidla, ktera reaguji na data: prijde udalost, vyhodnoti se podminky a spusti se akce. Toto je **forward chaining** — vychozi rezim uvazovani enginu. Ale existuje druhy, komplementarni rezim: **backward chaining**, kde zacnete od pozadovaneho zaveru a zeptate se enginu, zda ho lze dosahnout. Pochopeni obou rezimu — a kdy ktery pouzit — odemyka novou tridu dotazu.

## Co se naucite

- Jak forward chaining ridi vyhodnocovani pravidel (rekapitulace rizeni daty)
- Jak backward chaining obrati smer (cilove uvazovani)
- Semantiku read-only backward chainingu
- Kdy pouzit forward vs backward chaining
- Jak se oba rezimy doplnuji v jednom enginu

## Forward chaining: data tlaci dopredu

Forward chaining je to, co jste pouzivali v kazde dosavadni kapitole. Data vstoupi do enginu (udalosti, zmeny faktu, expirace casovcu), pravidla s odpovidajicimi triggery se vyhodnoti a akce produji nova data, ktera mohou spustit dalsi pravidla:

```text
  ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
  │  Data    │────▶│  Shoda       │────▶│  Podminky   │────▶│  Akce    │
  │ (event,  │     │  pravidla    │     │  (vyhodnoceni│     │ (emit,   │
  │  fakt,   │     │  (trigger    │     │   )         │     │  setFact │
  │  casovac)│     │   odpovida)  │     │              │     │  ...)    │
  └─────────┘     └──────────────┘     └─────────────┘     └────┬─────┘
                                                                 │
                                                    ┌────────────┘
                                                    │  Nova data
                                                    ▼
                                              ┌─────────┐
                                              │  Data    │──▶ ... (kaskada)
                                              └─────────┘
```

**Smer**: Data → Pravidla → Nova data → Dalsi pravidla → ...

**Vlastnosti**:
- **Reaktivni**: spousti se automaticky pri prichodu dat
- **Vycerpavajici**: vyhodnoti vsechna odpovidajici pravidla pokazde
- **S vedlejsimi efekty**: akce modifikuji stav enginu (fakta, udalosti, casovace)
- **Kontinualni**: bezi dokud je engine spusteny

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Forward chaining: data prochazi pravidly
engine.registerRule(
  Rule.create('earn-points')
    .name('Earn Loyalty Points')
    .when(onEvent('order.completed'))
    .then(setFact(
      'customer:${event.customerId}:points',
      '${(parseInt(fact.value || "0") + Math.floor(event.total / 10))}'
    ))
    .build()
);

engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP Tier Upgrade')
    .when(onEvent('order.completed'))
    .if(fact('customer:${event.customerId}:points').gte(1000))
    .then(setFact('customer:${event.customerId}:tier', 'vip'))
    .also(emit('notification.send', {
      to: '${event.customerId}',
      message: 'You reached VIP status!',
    }))
    .build()
);

// Data prijdou → pravidla se spusti → nove fakta se vytvori
await engine.emit('order.completed', { customerId: 'c-42', total: 250 });
```

Engine se nezastavi, aby se ptal "mel by se tento zakaznik stat VIP?". Jednodusse zpracuje prichozi udalost, vyhodnoti vsechna odpovidajici pravidla a spusti ta, jejichz podminky projdou.

## Backward chaining: cile tahnou zpet

Backward chaining obrati smer. Misto tlaceni dat dopredu zacnete s **cilem** — faktem nebo udalosti, o ktere chcete vedet — a engine prochazi graf pravidel pozpatku:

```text
  ┌──────────┐     ┌───────────────┐     ┌──────────────┐     ┌───────────┐
  │   Cil    │────▶│ Najdi pravidla│────▶│  Over        │────▶│ Podcile   │
  │ "Muze X  │     │ jejichz akce  │     │  podminky    │     │ (rekurze) │
  │  byt     │     │ produji X"    │     │  pravidla    │     │           │
  │  pravda?"│     └───────────────┘     │  vuci faktum │     └─────┬─────┘
  └──────────┘                           └──────────────┘           │
                                                              ┌─────┘
                                                              ▼
                                                        ┌───────────┐
                                                        │ Dukazovy  │
                                                        │ strom     │
                                                        │ (proc/proc│
                                                        │  ne)      │
                                                        └───────────┘
```

**Smer**: Cil → Pravidla (obracene) → Podminky → Podcile → ... → Fakta

**Vlastnosti**:
- **Tazaci**: kladete konkretni otazku
- **Cileny**: prozkoumava pouze pravidla relevantni k cili
- **Read-only**: nikdy nemodifikuje fakta, udalosti ani casovace
- **Na vyzadani**: bezi pouze pri volani `engine.query()`

```typescript
import { factGoal, eventGoal } from '@hamicek/noex-rules/dsl';

// Backward chaining: polozte konkretni otazku
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));

console.log(result.achievable);    // true nebo false
console.log(result.exploredRules); // kolik pravidel bylo prozkoumano
console.log(result.proof);         // kompletni strom vysvetleni
```

Engine nespousti zadne akce. Prozkoumava graf pravidel, aby odpovedel na otazku: "Na zaklade soucasnych faktu a pravidel, muze byt tento cil dosazitelny?"

## Jak backward chaining funguje

Algoritmus postupuje nasledovne:

1. **Zakladni pripad**: Existuje fakt jiz ve store a splnuje cil? Pokud ano, okamzite vrati `fact_exists` proof uzel.

2. **Nalezeni kandidatnich pravidel**: Vyhledani pravidel, jejichz **akce** by cil produkovaly (napr. pravidla s akci `set_fact` odpovidajici klici faktu cile, nebo pravidla s akci `emit_event` odpovidajici topicu cile).

3. **Vyhodnoceni podminek**: Pro kazde kandidatni pravidlo overeni, zda jeho podminky jsou splneny aktualnim fact store.

4. **Rekurze pro chybejici fakta**: Pokud podminka odkazuje na fakt, ktery neexistuje, vytvori se **podcil** pro tento fakt a rekurzivne se pokracuje (krok 1).

5. **Sestaveni dukazoveho stromu**: Vysledkem je strom, ktery ukazuje, ktera pravidla byla prozkoumana, ktere podminky prosly ci selhaly a jak byly podcile vyreseny.

```text
  Cil: customer:c-42:tier = 'vip'
  │
  └─ Pravidlo: vip-upgrade (podminky: customer:c-42:points >= 1000)
     │
     ├─ Podminka: fact:customer:c-42:points >= 1000
     │  └─ Fakt existuje: customer:c-42:points = 1500  ✓
     │
     └─ Vysledek: SPLNENO ✓
```

Pokud by fakt bodu neexistoval, ale jine pravidlo by ho mohlo produkovat:

```text
  Cil: customer:c-42:tier = 'vip'
  │
  └─ Pravidlo: vip-upgrade (podminky: customer:c-42:points >= 1000)
     │
     ├─ Podminka: fact:customer:c-42:points >= 1000
     │  └─ Podcil: customer:c-42:points (existence)
     │     └─ Pravidlo: earn-points (podminky: event trigger)
     │        └─ Podminka: event:order.completed — NESPLNENO
     │           (backward chaining nema spousteci udalost)
     │
     └─ Vysledek: NESPLNENO ✗
```

Podminky zalozene na udalostech a kontextu jsou v backward chainingu vzdy nesplnene, protoze neexistuje zadna spousteci udalost k vyhodnoceni. To je zamerne — backward chaining odpovida na to, co je mozne na zaklade **soucasneho stavu**, ne co by se stalo pri emisi konkretni udalosti.

## Srovnani

| Aspekt | Forward chaining | Backward chaining |
|--------|-----------------|-------------------|
| **Smer** | Data → Pravidla → Zavery | Cil → Pravidla → Predpoklady |
| **Spusteni** | Automaticke (udalosti, fakta, casovace) | Manualni (`engine.query()`) |
| **Ucel** | Reagovat na zmeny | Odpovidat na otazky |
| **Mutace stavu** | Ano (nastavuje fakta, emituje udalosti) | Ne (read-only) |
| **Vystup** | Vedlejsi efekty (nova fakta, udalosti) | `QueryResult` s dukazovym stromem |
| **Rozsah** | Vsechna odpovidajici pravidla | Pouze pravidla relevantni k cili |
| **API** | `engine.emit()`, `engine.setFact()` | `engine.query(goal)` |
| **Analogie** | Prepocet tabulky | SQL dotaz / Prolog dotaz |

## Kdy pouzit ktery pristup

### Forward chaining

Pouzijte forward chaining, kdyz potrebujete, aby engine **reagoval** na zmeny automaticky:

- Zpracovani prichozich objednavek, plateb, cteni senzoru
- Spousteni notifikaci, alertu a eskalaci
- Udrzovani odvozenych faktu (agregaty, stavy, skore)
- Provadeni business workflow s kaskadovymi retezci pravidel
- Cokoli, co by se melo stat **protoze** se neco zmenilo

### Backward chaining

Pouzijte backward chaining, kdyz potrebujete **polozit otazku** bez vedlejsich efektu:

- **Overeni zpusobilosti**: "Je tento zakaznik zpusobily pro VIP upgrade?"
- **Validace predpokladu**: "Muze byt tato objednavka splnena s aktualnim skladem?"
- **What-if analyza**: "Kdybych nastavil tento fakt, stal by se tento cil dosazitelnym?"
- **Debugging**: "Proc se toto pravidlo nespustilo?" (inspekce dukazoveho stromu)
- **Analyza dopadu**: "Ktera pravidla mohou produkovat tuto udalost?"
- **Compliance**: "Muze byt toto schvaleni udeleno pri soucasnych politikach?"

### Oba dohromady

Nejsilnejsi vzor pouziva oba rezimy spolecne. Forward chaining se stara o zive zpracovani, zatimco backward chaining poskytuje dotazy na vyzadani:

```typescript
// Forward chaining: zpracovavej objednavky jak prichazeji
engine.registerRule(
  Rule.create('process-order')
    .name('Process Order')
    .when(onEvent('order.submitted'))
    .if(fact('inventory:${event.productId}:stock').gt(0))
    .then(setFact('order:${event.orderId}:status', 'processing'))
    .also(emit('order.processing', { orderId: '${event.orderId}' }))
    .build()
);

// Backward chaining: over, zda objednavka MUZE byt zpracovana pred odeslanim
const canProcess = engine.query(
  factGoal('order:ord-99:status').equals('processing')
);

if (canProcess.achievable) {
  await engine.emit('order.submitted', {
    orderId: 'ord-99',
    productId: 'prod-1',
  });
} else {
  console.log('Objednavka nemuze byt zpracovana:', canProcess.proof);
}
```

## Cviceni

Uvazujte nasledujici sadu pravidel:

```typescript
engine.registerRule(
  Rule.create('approve-loan')
    .name('Approve Loan')
    .when(onEvent('loan.requested'))
    .if(fact('applicant:${event.applicantId}:creditScore').gte(700))
    .if(fact('applicant:${event.applicantId}:income').gte(50000))
    .if(fact('applicant:${event.applicantId}:debtRatio').lt(0.4))
    .then(setFact('loan:${event.loanId}:status', 'approved'))
    .build()
);

engine.registerRule(
  Rule.create('calculate-debt-ratio')
    .name('Calculate Debt Ratio')
    .when(onEvent('applicant.financials.updated'))
    .then(setFact(
      'applicant:${event.applicantId}:debtRatio',
      '${event.totalDebt / event.annualIncome}'
    ))
    .build()
);
```

Pro kazdou otazku nize rozhodnete, zda je vhodny forward chaining, backward chaining, nebo oba:

1. Prijde udalost zadosti o pujcku a je treba ji zpracovat.
2. Uverovy pracovnik chce overit, zda konkretni zadatel splnuje podminky pro pujcku, jeste pred podanim zadosti.
3. Dashboard zobrazuje notifikace o schvaleni pujcek v realnem case.
4. Auditni system potrebuje vysvetlit, proc byla pujcka zamitnuta.

<details>
<summary>Reseni</summary>

1. **Forward chaining**. Udalost zadosti o pujcku spusti `approve-loan`, ktery vyhodnoti podminky a nastavi stav pujcky. Toto je reaktivni zpracovani.

2. **Backward chaining**. Uverovy pracovnik zavola `engine.query(factGoal('loan:L-1:status').equals('approved'))`. Engine prochazi zpetne podminky `approve-loan` bez modifikace stavu. Dukazovy strom odhali, ktere podminky prosly a ktere selhaly (napr. prilis nizke kreditni skore).

3. **Forward chaining**. Dashboard odebira udalosti emitovane pravidly forward chainingu. Kdyz je pujcka schvalena, spusti se udalost a dashboard se aktualizuje.

4. **Oba**. Forward chaining zpracoval pujcku a zamitnuti probeslo v realnem case. Ale pro vysvetleni *proc* byla zamitnuta po faktu, backward chaining vytvori dukazovy strom ukazujici, ktere podminky selhaly. Dukazovy strom je auditni artefakt.

</details>

## Shrnuti

- **Forward chaining** je rizeny daty: udalosti a fakta prochazi pravidly, produji nova data a vedlejsi efekty
- **Backward chaining** je rizeny cilem: zeptate se "Je tento cil dosazitelny?" a engine prohledava pravidla pozpatku
- Backward chaining je **read-only** — nikdy nemodifikuje fakta, neemituje udalosti ani nespousti akce
- Engine hleda pravidla, jejichz **akce** produji cil, a pak rekurzivne overuje jejich **podminky**
- Podminky zalozene na udalostech, kontextu nebo lookupech jsou v backward chainingu vzdy nesplnene (zadny trigger kontext)
- Vysledkem je **dukazovy strom** (`ProofNode`), ktery presne vysvetli, proc cil je nebo neni dosazitelny
- Pouzijte forward chaining pro **reaktivni zpracovani** a backward chaining pro **tazaci dotazy**
- Nejsilnejsi vzor kombinuje oba: forward chaining pro zive zpracovani, backward chaining pro analyzu na vyzadani

---

Dalsi: [Dotazovani cilu](./02-dotazovani-cilu.md)
