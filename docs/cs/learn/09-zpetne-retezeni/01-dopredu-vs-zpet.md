# Dopředné vs zpětné řetězení

V průběhu tohoto průvodce jste psali pravidla, která reagují na data: přijde událost, vyhodnotí se podmínky a spustí se akce. Toto je **forward chaining** — výchozí režim uvažování enginu. Ale existuje druhý, komplementární režim: **backward chaining**, kde začnete od požadovaného závěru a zeptáte se enginu, zda ho lze dosáhnout. Pochopení obou režimů — a kdy který použít — odemyká novou třídu dotazů.

## Co se naučíte

- Jak forward chaining řídí vyhodnocování pravidel (rekapitulace řízení daty)
- Jak backward chaining obrátí směr (cílové uvažování)
- Sémantiku read-only backward chainingu
- Kdy použít forward vs backward chaining
- Jak se oba režimy doplňují v jednom enginu

## Forward chaining: data tlačí dopředu

Forward chaining je to, co jste používali v každé dosavadní kapitole. Data vstoupí do enginu (události, změny faktů, expirace časovačů), pravidla s odpovídajícími triggery se vyhodnotí a akce produkují nová data, která mohou spustit další pravidla:

```text
  ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
  │  Data    │────▶│  Shoda       │────▶│  Podmínky   │────▶│  Akce    │
  │ (event,  │     │  pravidla    │     │  (vyhodnocení│     │ (emit,   │
  │  fakt,   │     │  (trigger    │     │   )         │     │  setFact │
  │  časovač)│     │   odpovídá)  │     │              │     │  ...)    │
  └─────────┘     └──────────────┘     └─────────────┘     └────┬─────┘
                                                                │
                                                   ┌────────────┘
                                                   │  Nová data
                                                   ▼
                                             ┌─────────┐
                                             │  Data    │──▶ ... (kaskáda)
                                             └─────────┘
```

**Směr**: Data → Pravidla → Nová data → Další pravidla → ...

**Vlastnosti**:
- **Reaktivní**: spouští se automaticky při příchodu dat
- **Vyčerpávající**: vyhodnotí všechna odpovídající pravidla pokaždé
- **S vedlejšími efekty**: akce modifikují stav enginu (fakta, události, časovače)
- **Kontinuální**: běží dokud je engine spuštěný

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Forward chaining: data procházejí pravidly
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

// Data přijdou → pravidla se spustí → nové fakta se vytvoří
await engine.emit('order.completed', { customerId: 'c-42', total: 250 });
```

Engine se nezastaví, aby se ptal "měl by se tento zákazník stát VIP?". Jednoduše zpracuje příchozí událost, vyhodnotí všechna odpovídající pravidla a spustí ta, jejichž podmínky projdou.

## Backward chaining: cíle táhnou zpět

Backward chaining obrátí směr. Místo tlačení dat dopředu začnete s **cílem** — faktem nebo událostí, o které chcete vědět — a engine prochází graf pravidel pozpátku:

```text
  ┌──────────┐     ┌───────────────┐     ┌──────────────┐     ┌───────────┐
  │   Cíl    │────▶│ Najdi pravidla│────▶│  Ověř        │────▶│ Podcíle   │
  │ "Může X  │     │ jejichž akce  │     │  podmínky    │     │ (rekurze) │
  │  být     │     │ produkují X"  │     │  pravidla    │     │           │
  │  pravda?"│     └───────────────┘     │  vůči faktům │     └─────┬─────┘
  └──────────┘                           └──────────────┘           │
                                                             ┌─────┘
                                                             ▼
                                                       ┌───────────┐
                                                       │ Důkazový  │
                                                       │ strom     │
                                                       │ (proč/proč│
                                                       │  ne)      │
                                                       └───────────┘
```

**Směr**: Cíl → Pravidla (obráceně) → Podmínky → Podcíle → ... → Fakta

**Vlastnosti**:
- **Tázací**: kladete konkrétní otázku
- **Cílený**: prozkoumává pouze pravidla relevantní k cíli
- **Read-only**: nikdy nemodifikuje fakta, události ani časovače
- **Na vyžádání**: běží pouze při volání `engine.query()`

```typescript
import { factGoal, eventGoal } from '@hamicek/noex-rules/dsl';

// Backward chaining: položte konkrétní otázku
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));

console.log(result.achievable);    // true nebo false
console.log(result.exploredRules); // kolik pravidel bylo prozkoumáno
console.log(result.proof);         // kompletní strom vysvětlení
```

Engine nespouští žádné akce. Prozkoumává graf pravidel, aby odpověděl na otázku: "Na základě současných faktů a pravidel, může být tento cíl dosažitelný?"

## Jak backward chaining funguje

Algoritmus postupuje následovně:

1. **Základní případ**: Existuje fakt již ve store a splňuje cíl? Pokud ano, okamžitě vrátí `fact_exists` proof uzel.

2. **Nalezení kandidátních pravidel**: Vyhledání pravidel, jejichž **akce** by cíl produkovaly (např. pravidla s akcí `set_fact` odpovídající klíči faktu cíle, nebo pravidla s akcí `emit_event` odpovídající topicu cíle).

3. **Vyhodnocení podmínek**: Pro každé kandidátní pravidlo ověření, zda jeho podmínky jsou splněny aktuálním fact store.

4. **Rekurze pro chybějící fakta**: Pokud podmínka odkazuje na fakt, který neexistuje, vytvoří se **podcíl** pro tento fakt a rekurzivně se pokračuje (krok 1).

5. **Sestavení důkazového stromu**: Výsledkem je strom, který ukazuje, která pravidla byla prozkoumána, které podmínky prošly či selhaly a jak byly podcíle vyřešeny.

```text
  Cíl: customer:c-42:tier = 'vip'
  │
  └─ Pravidlo: vip-upgrade (podmínky: customer:c-42:points >= 1000)
     │
     ├─ Podmínka: fact:customer:c-42:points >= 1000
     │  └─ Fakt existuje: customer:c-42:points = 1500  ✓
     │
     └─ Výsledek: SPLNĚNO ✓
```

Pokud by fakt bodů neexistoval, ale jiné pravidlo by ho mohlo produkovat:

```text
  Cíl: customer:c-42:tier = 'vip'
  │
  └─ Pravidlo: vip-upgrade (podmínky: customer:c-42:points >= 1000)
     │
     ├─ Podmínka: fact:customer:c-42:points >= 1000
     │  └─ Podcíl: customer:c-42:points (existence)
     │     └─ Pravidlo: earn-points (podmínky: event trigger)
     │        └─ Podmínka: event:order.completed — NESPLNĚNO
     │           (backward chaining nemá spouštěcí událost)
     │
     └─ Výsledek: NESPLNĚNO ✗
```

Podmínky založené na událostech a kontextu jsou v backward chainingu vždy nesplněné, protože neexistuje žádná spouštěcí událost k vyhodnocení. To je záměrné — backward chaining odpovídá na to, co je možné na základě **současného stavu**, ne co by se stalo při emisi konkrétní události.

## Srovnání

| Aspekt | Forward chaining | Backward chaining |
|--------|-----------------|-------------------|
| **Směr** | Data → Pravidla → Závěry | Cíl → Pravidla → Předpoklady |
| **Spuštění** | Automatické (události, fakta, časovače) | Manuální (`engine.query()`) |
| **Účel** | Reagovat na změny | Odpovídat na otázky |
| **Mutace stavu** | Ano (nastavuje fakta, emituje události) | Ne (read-only) |
| **Výstup** | Vedlejší efekty (nová fakta, události) | `QueryResult` s důkazovým stromem |
| **Rozsah** | Všechna odpovídající pravidla | Pouze pravidla relevantní k cíli |
| **API** | `engine.emit()`, `engine.setFact()` | `engine.query(goal)` |
| **Analogie** | Přepočet tabulky | SQL dotaz / Prolog dotaz |

## Kdy použít který přístup

### Forward chaining

Použijte forward chaining, když potřebujete, aby engine **reagoval** na změny automaticky:

- Zpracování příchozích objednávek, plateb, čtení senzorů
- Spouštění notifikací, alertů a eskalací
- Udržování odvozených faktů (agregáty, stavy, skóre)
- Provádění business workflow s kaskádovými řetězci pravidel
- Cokoli, co by se mělo stát **protože** se něco změnilo

### Backward chaining

Použijte backward chaining, když potřebujete **položit otázku** bez vedlejších efektů:

- **Ověření způsobilosti**: "Je tento zákazník způsobilý pro VIP upgrade?"
- **Validace předpokladů**: "Může být tato objednávka splněna s aktuálním skladem?"
- **What-if analýza**: "Kdybych nastavil tento fakt, stal by se tento cíl dosažitelným?"
- **Debugging**: "Proč se toto pravidlo nespustilo?" (inspekce důkazového stromu)
- **Analýza dopadu**: "Která pravidla mohou produkovat tuto událost?"
- **Compliance**: "Může být toto schválení uděleno při současných politikách?"

### Oba dohromady

Nejsilnější vzor používá oba režimy společně. Forward chaining se stará o živé zpracování, zatímco backward chaining poskytuje dotazy na vyžádání:

```typescript
// Forward chaining: zpracovávej objednávky jak přicházejí
engine.registerRule(
  Rule.create('process-order')
    .name('Process Order')
    .when(onEvent('order.submitted'))
    .if(fact('inventory:${event.productId}:stock').gt(0))
    .then(setFact('order:${event.orderId}:status', 'processing'))
    .also(emit('order.processing', { orderId: '${event.orderId}' }))
    .build()
);

// Backward chaining: ověř, zda objednávka MŮŽE být zpracována před odesláním
const canProcess = engine.query(
  factGoal('order:ord-99:status').equals('processing')
);

if (canProcess.achievable) {
  await engine.emit('order.submitted', {
    orderId: 'ord-99',
    productId: 'prod-1',
  });
} else {
  console.log('Objednávka nemůže být zpracována:', canProcess.proof);
}
```

## Cvičení

Uvažujte následující sadu pravidel:

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

Pro každou otázku níže rozhodněte, zda je vhodný forward chaining, backward chaining, nebo oba:

1. Přijde událost žádosti o půjčku a je třeba ji zpracovat.
2. Úvěrový pracovník chce ověřit, zda konkrétní žadatel splňuje podmínky pro půjčku, ještě před podáním žádosti.
3. Dashboard zobrazuje notifikace o schválení půjček v reálném čase.
4. Auditní systém potřebuje vysvětlit, proč byla půjčka zamítnuta.

<details>
<summary>Řešení</summary>

1. **Forward chaining**. Událost žádosti o půjčku spustí `approve-loan`, který vyhodnotí podmínky a nastaví stav půjčky. Toto je reaktivní zpracování.

2. **Backward chaining**. Úvěrový pracovník zavolá `engine.query(factGoal('loan:L-1:status').equals('approved'))`. Engine prochází zpětně podmínky `approve-loan` bez modifikace stavu. Důkazový strom odhalí, které podmínky prošly a které selhaly (např. příliš nízké kreditní skóre).

3. **Forward chaining**. Dashboard odebírá události emitované pravidly forward chainingu. Když je půjčka schválena, spustí se událost a dashboard se aktualizuje.

4. **Oba**. Forward chaining zpracoval půjčku a zamítnutí proběhlo v reálném čase. Ale pro vysvětlení *proč* byla zamítnuta po faktu, backward chaining vytvoří důkazový strom ukazující, které podmínky selhaly. Důkazový strom je auditní artefakt.

</details>

## Shrnutí

- **Forward chaining** je řízený daty: události a fakta procházejí pravidly, produkují nová data a vedlejší efekty
- **Backward chaining** je řízený cílem: zeptáte se "Je tento cíl dosažitelný?" a engine prohledává pravidla pozpátku
- Backward chaining je **read-only** — nikdy nemodifikuje fakta, neemituje události ani nespouští akce
- Engine hledá pravidla, jejichž **akce** produkují cíl, a pak rekurzivně ověřuje jejich **podmínky**
- Podmínky založené na událostech, kontextu nebo lookupech jsou v backward chainingu vždy nesplněné (žádný trigger kontext)
- Výsledkem je **důkazový strom** (`ProofNode`), který přesně vysvětlí, proč cíl je nebo není dosažitelný
- Použijte forward chaining pro **reaktivní zpracování** a backward chaining pro **tázací dotazy**
- Nejsilnější vzor kombinuje oba: forward chaining pro živé zpracování, backward chaining pro analýzu na vyžádání

---

Další: [Dotazování cílů](./02-dotazovani-cilu.md)
