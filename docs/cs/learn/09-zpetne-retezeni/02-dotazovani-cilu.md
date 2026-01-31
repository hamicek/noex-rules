# Dotazovani cilu

Predchozi kapitola vysvetlila teorii zpetneho retezeni. Tato kapitola je kompletni API reference: jak konstruovat cile, konfigurovat engine, volat `engine.query()` a interpretovat dukazovy strom, ktery vraci. Postavite vicepravidlovy system overovani zpusobilosti a naucite se cist dukazove stromy zahrnujici vice urovni retezeni pravidel.

## Co se naucite

- Jak konfigurovat backward chaining pomoci `BackwardChainingConfig`
- Konstrukce cilu s raw objekty a DSL buildery (`factGoal`, `eventGoal`)
- Volani `engine.query()` a cteni `QueryResult`
- Vsechny typy `ProofNode`: `FactExistsNode`, `RuleProofNode`, `UnachievableNode`
- Jak funguje retezeni pravidel, detekce cyklu a limity hloubky
- Pozorovatelnost: tracing a audit logging pro backward dotazy

## Konfigurace

Backward chaining je dostupny na kazdem enginu bez dalsi konfigurace. Pro nastaveni limitu predejte `backwardChaining` do `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,           // Max hloubka rekurze (vychozi: 10)
    maxExploredRules: 200,  // Max prozoumanych pravidel na dotaz (vychozi: 100)
  },
});
```

| Volba | Vychozi | Popis |
|-------|---------|-------|
| `maxDepth` | `10` | Maximalni hloubka rekurze pri vyhodnocovani podcilu |
| `maxExploredRules` | `100` | Maximalni celkovy pocet prozkoumanych pravidel v ramci dotazu |

Oba limity chrani pred nekonecnymi dotazy ve velkych sadach pravidel. Pri dosazeni limitu vraci postizena vetev `UnachievableNode` s duvodem `'max_depth'`.

## Cile

**Cil** je otazka, kterou kladete enginu. Existuji dva typy:

### FactGoal

"Muze tento fakt existovat (nebo mit konkretni hodnotu)?"

```typescript
import { factGoal } from '@hamicek/noex-rules/dsl';

// Kontrola existence — existuje fakt s jakoukoli hodnotou?
factGoal('customer:c-42:tier')

// Rovnost hodnoty — rovna se fakt 'vip'?
factGoal('customer:c-42:tier').equals('vip')

// Numericka srovnani
factGoal('customer:c-42:points').gte(1000)
factGoal('order:ord-1:total').lt(500)
factGoal('sensor:temp:current').gt(100)
factGoal('account:a-1:balance').lte(0)

// Negace
factGoal('user:u-1:status').neq('banned')
```

Metoda `.exists()` je k dispozici jako pomucka pro citelnost, ale je vychozim chovanim — volani `factGoal('key')` a `factGoal('key').exists()` produji stejny cil.

**Dostupne operatory**:

| Metoda | Operator | Popis |
|--------|----------|-------|
| `.exists()` | — | Fakt existuje s jakoukoli hodnotou (vychozi) |
| `.equals(v)` | `eq` | Hodnota faktu se rovna `v` |
| `.neq(v)` | `neq` | Hodnota faktu se nerovna `v` |
| `.gt(n)` | `gt` | Hodnota faktu je vetsi nez `n` |
| `.gte(n)` | `gte` | Hodnota faktu je vetsi nebo rovna `n` |
| `.lt(n)` | `lt` | Hodnota faktu je mensi nez `n` |
| `.lte(n)` | `lte` | Hodnota faktu je mensi nebo rovna `n` |

Numericke operatory (`.gt()`, `.gte()`, `.lt()`, `.lte()`) vyzaduji konecne cislo a vyhoduji `DslValidationError` pro nenumericke hodnoty.

### EventGoal

"Muze byt tato udalost emitovana nejakym retezem pravidel?"

```typescript
import { eventGoal } from '@hamicek/noex-rules/dsl';

// Muze nektery retez pravidel produkovat tuto udalost?
eventGoal('order.completed')
eventGoal('notification.sent')
eventGoal('fraud.alert')
```

Cile udalosti vyhledavaji pravidla, jejichz akce obsahuji `emit_event` akci s odpovidajicim topicem.

### Raw cilove objekty

Cile muzete take konstruovat jako plain objekty bez DSL:

```typescript
// Faktovy cil (raw)
const goal = { type: 'fact' as const, key: 'customer:c-42:tier', value: 'vip', operator: 'eq' as const };

// Udalostni cil (raw)
const goal = { type: 'event' as const, topic: 'order.completed' };

engine.query(goal);
```

DSL buildery jsou preferovany pro typovou bezpecnost a citelnost.

## Dotazovani

Zavolejte `engine.query()` s cilem nebo goal builderem:

```typescript
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));
```

Metoda prijima raw `Goal` objekty i instance `GoalBuilder` (z DSL). Buildery resolvuje automaticky volanim `.build()`.

### QueryResult

Kazdy dotaz vraci `QueryResult`:

```typescript
interface QueryResult {
  goal: Goal;              // Dotazovany cil
  achievable: boolean;     // Zda je cil dosazitelny
  proof: ProofNode;        // Dukazovy strom vysvetlujici proc
  exploredRules: number;   // Celkovy pocet prozkoumanych pravidel
  maxDepthReached: boolean; // Zda rekurze dosahla limitu hloubky
  durationMs: number;      // Doba provedeni dotazu v milisekundach
}
```

Pole `achievable` je hlavni odpoved. Strom `proof` vysvetluje uvazovani.

## Dukazove stromy

Dukazovy strom je rekurzivni struktura se tremi typy uzlu:

```text
  ProofNode
  ├── FactExistsNode     — Zakladni pripad: fakt jiz ve store
  ├── RuleProofNode      — Pravidlo bylo prozkoumano s podminkamni
  └── UnachievableNode   — Cil nelze dosahnout (s duvodem)
```

### FactExistsNode

Vracen, kdyz fakt jiz existuje ve store:

```typescript
interface FactExistsNode {
  type: 'fact_exists';
  key: string;          // Klic faktu
  currentValue: unknown; // Aktualni hodnota ve store
  satisfied: boolean;    // Zda hodnota odpovida cili
}
```

`FactExistsNode` muze byt splneny (fakt existuje a odpovida) nebo nesplneny (fakt existuje, ale neodpovida operatoru/hodnote cile). Kdyz fakt neexistuje vubec a zadne pravidlo ho neprodukuje, dostanete misto toho `UnachievableNode`.

### RuleProofNode

Vracen, kdyz bylo nalezeno pravidlo, ktere by mohlo cil produkovat:

```typescript
interface RuleProofNode {
  type: 'rule';
  ruleId: string;                     // ID pravidla
  ruleName: string;                   // Lidsky citelny nazev
  satisfied: boolean;                 // Zda vsechny podminky prosly
  conditions: ConditionProofNode[];   // Vysledky vyhodnoceni jednotlivych podminek
  children: ProofNode[];              // Podcile z nesplnenych podminek
}

interface ConditionProofNode {
  source: string;         // Lidsky citelny zdroj (napr. 'fact:customer:points')
  operator: string;       // Operator podminky (napr. 'gte')
  expectedValue: unknown; // Ocekavana hodnota podminky
  actualValue: unknown;   // Skutecna hodnota z fact store
  satisfied: boolean;     // Zda tato podminka prosla
}
```

Pole `children` obsahuje podcile — rekurzivni proof uzly pro podminky odkazujici na fakta, ktera jeste nejsou ve store. Zde strom roste do hloubky.

### UnachievableNode

Vracen, kdyz cil nelze dosahnout:

```typescript
interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}
```

| Duvod | Vyznam |
|-------|--------|
| `no_rules` | Zadne akce pravidel cil neproduji |
| `cycle_detected` | Vsechna kandidatni pravidla tvori kruhovou zavislost |
| `max_depth` | Dosazen limit hloubky rekurze |
| `all_paths_failed` | Pravidla existuji, ale zadne nema splnitelne podminky |

## Retezeni pravidel

Sila backward chainingu pochazi z nasledovani retezu pravidel. Kdyz podminka odkazuje na chybejici fakt, engine automaticky vytvori podcil a hleda pravidla, ktera ho produji:

```typescript
const engine = await RuleEngine.start();

// Pravidlo 1: Ziskej body z objednavek
engine.registerRule(
  Rule.create('earn-points')
    .name('Earn Loyalty Points')
    .when(onEvent('order.completed'))
    .then(setFact('customer:c-42:points', 1500))
    .build()
);

// Pravidlo 2: Upgrade na VIP kdyz je dost bodu
engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP Tier Upgrade')
    .when(onEvent('loyalty.check'))
    .if(fact('customer:c-42:points').gte(1000))
    .then(setFact('customer:c-42:tier', 'vip'))
    .build()
);

// Dotaz: Muze zakaznik c-42 mit VIP tier?
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));
```

Engine prochazi zpetne:

1. Cil: `customer:c-42:tier = 'vip'` → najde pravidlo `vip-upgrade`
2. Podminka: `customer:c-42:points >= 1000` → fakt chybi → podcil
3. Podcil: `customer:c-42:points` existuje → najde pravidlo `earn-points`
4. `earn-points` nema podminky → splneno

Vysledek: achievable = `true`, s dvouurovnovym dukazovym stromem.

Pokud by `customer:c-42:points` jiz existoval s hodnotou `1500`, engine by nemusel rekurzovat — krok 2 by vratil splneny `FactExistsNode`.

## Detekce cyklu

Kdyz pravidla tvori kruhove zavislosti, engine cyklus detekuje a zastavi:

```typescript
// Pravidlo A produkuje fact-x kdyz fact-y existuje
engine.registerRule(
  Rule.create('rule-a')
    .name('Rule A')
    .when(onEvent('trigger'))
    .if(fact('fact-y').exists())
    .then(setFact('fact-x', true))
    .build()
);

// Pravidlo B produkuje fact-y kdyz fact-x existuje
engine.registerRule(
  Rule.create('rule-b')
    .name('Rule B')
    .when(onEvent('trigger'))
    .if(fact('fact-x').exists())
    .then(setFact('fact-y', true))
    .build()
);

const result = engine.query(factGoal('fact-x'));
// result.achievable === false
// result.proof.reason === 'cycle_detected'
```

Engine udrzuje mnozinu navstivenych pri prochazeni. Kdyz narazi na kombinaci pravidlo+cil, kterou jiz v aktualni ceste videl, vrati se zpet. Pokud vsechna kandidatni pravidla jsou soucasti cyklu, vysledkem je `UnachievableNode` s duvodem `'cycle_detected'`.

## Deaktivovana pravidla a skupiny

Backward chaining respektuje stav pravidel a skupin. Deaktivovana pravidla a pravidla v deaktivovanych skupinach jsou pri hledani preskocena:

```typescript
engine.registerRule(
  Rule.create('my-rule')
    .name('My Rule')
    .enabled(false) // Deaktivovano — backward chaining toto pravidlo ignoruje
    .when(onEvent('trigger'))
    .then(setFact('output', true))
    .build()
);

const result = engine.query(factGoal('output'));
// result.achievable === false
// result.proof.reason === 'no_rules' (deaktivovane pravidlo je neviditelne)
```

## Kompletni priklad: System overovani zpusobilosti pro pujcku

Tento priklad demonstruje vicepravidlovy system, kde backward chaining prochazi tremi urovnemi pravidel pro urceni zpusobilosti pro pujcku:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';
import { factGoal, eventGoal } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  backwardChaining: { maxDepth: 15 },
});

// --- Uroven 1: Zakladni datova pravidla ---

// Vyhledani kreditniho skore produkuje fakt skore
engine.registerRule(
  Rule.create('credit-score-lookup')
    .name('Credit Score Lookup')
    .when(onEvent('applicant.submitted'))
    .then(setFact(
      'applicant:${event.applicantId}:creditScore',
      '${event.creditScore}'
    ))
    .build()
);

// Overeni prijmu produkuje fakt prijmu
engine.registerRule(
  Rule.create('income-verification')
    .name('Income Verification')
    .when(onEvent('applicant.submitted'))
    .then(setFact(
      'applicant:${event.applicantId}:verifiedIncome',
      '${event.annualIncome}'
    ))
    .build()
);

// --- Uroven 2: Odvozena kriteria zpusobilosti ---

// Kreditne zpusobily kdyz skore >= 680
engine.registerRule(
  Rule.create('credit-eligible')
    .name('Credit Eligibility')
    .when(onFact('applicant:*:creditScore'))
    .if(fact('applicant:${fact.key.split(":")[1]}:creditScore').gte(680))
    .then(setFact('applicant:${fact.key.split(":")[1]}:creditEligible', true))
    .build()
);

// Prijmove zpusobily kdyz overeny prijem >= 45000
engine.registerRule(
  Rule.create('income-eligible')
    .name('Income Eligibility')
    .when(onFact('applicant:*:verifiedIncome'))
    .if(fact('applicant:${fact.key.split(":")[1]}:verifiedIncome').gte(45000))
    .then(setFact('applicant:${fact.key.split(":")[1]}:incomeEligible', true))
    .build()
);

// --- Uroven 3: Konecne rozhodnuti o pujcce ---

// Schvalit pujcku kdyz je splnena kreditni i prijmova zpusobilost
engine.registerRule(
  Rule.create('loan-approval')
    .name('Loan Approval')
    .when(onFact('applicant:*:creditEligible'))
    .if(fact('applicant:${fact.key.split(":")[1]}:creditEligible').equals(true))
    .if(fact('applicant:${fact.key.split(":")[1]}:incomeEligible').equals(true))
    .then(setFact('applicant:${fact.key.split(":")[1]}:loanApproved', true))
    .also(emit('loan.approved', {
      applicantId: '${fact.key.split(":")[1]}',
    }))
    .build()
);

// --- Scenar 1: Plne zpusobily zadatel ---

engine.setFact('applicant:A-1:creditScore', 750);
engine.setFact('applicant:A-1:verifiedIncome', 85000);
engine.setFact('applicant:A-1:creditEligible', true);
engine.setFact('applicant:A-1:incomeEligible', true);

const eligible = engine.query(factGoal('applicant:A-1:loanApproved').equals(true));

console.log('Zadatel A-1 pujcka schvalena:', eligible.achievable);
// true — vsechny podminky splneny z existujicich faktu
console.log('Prozkoumana pravidla:', eligible.exploredRules);
// 1 — jen loan-approval bylo potreba

// --- Scenar 2: Chybejici prijmova zpusobilost ---

engine.setFact('applicant:A-2:creditScore', 720);
engine.setFact('applicant:A-2:creditEligible', true);
// Zadny fakt incomeEligible — backward chaining ho bude hledat

const partial = engine.query(factGoal('applicant:A-2:loanApproved').equals(true));

console.log('Zadatel A-2 pujcka schvalena:', partial.achievable);
// false — fakt incomeEligible chybi a pravidlo income-eligible potrebuje
//         verifiedIncome, ktery take neexistuje
console.log('Prozkoumana pravidla:', partial.exploredRules);

// --- Inspekce dukazoveho stromu ---

function printProof(node: any, indent = 0): void {
  const pad = '  '.repeat(indent);

  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}[FAKT] ${node.key} = ${node.currentValue} (${node.satisfied ? '✓' : '✗'})`);
      break;

    case 'rule':
      console.log(`${pad}[PRAVIDLO] ${node.ruleName} (${node.satisfied ? '✓' : '✗'})`);
      for (const cond of node.conditions) {
        console.log(`${pad}  ${cond.source} ${cond.operator} ${cond.expectedValue} → skutecna: ${cond.actualValue} (${cond.satisfied ? '✓' : '✗'})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 1);
      }
      break;

    case 'unachievable':
      console.log(`${pad}[NEDOSAZITELNY] ${node.reason}${node.details ? ': ' + node.details : ''}`);
      break;
  }
}

console.log('\n--- Dukazovy strom pro A-2 ---');
printProof(partial.proof);

// --- Muze byt emitovana udalost loan.approved? ---

const canEmit = engine.query(eventGoal('loan.approved'));
console.log('\nMuze emitovat loan.approved:', canEmit.achievable);

await engine.stop();
```

## Pozorovatelnost

Backward chaining se integruje s tracing a audit systemy enginu.

### Trace zaznamy

Kdyz je tracing povoleny, backward dotazy emituji dva typy trace zaznamu:

| Typ | Kdy | Klicove detaily |
|-----|-----|-----------------|
| `backward_goal_evaluated` | Cil (fakt nebo udalost) je vyhodnocen | `goalType`, `key`/`topic`, `depth`, `satisfied`, `proofType` |
| `backward_rule_explored` | Pravidlo je prozkoumano behem hledani | `ruleId`, `ruleName`, `satisfied`, `conditionsCount`, `childrenCount`, `depth` |

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// Po dotazu jsou trace zaznamy v kolektoru
engine.query(factGoal('customer:c-42:tier').equals('vip'));

const goalTraces = engine.traceCollector.getByType('backward_goal_evaluated');
const ruleTraces = engine.traceCollector.getByType('backward_rule_explored');

for (const trace of goalTraces) {
  console.log(`Cil ${trace.details.goalType}:${trace.details.key ?? trace.details.topic}`
    + ` v hloubce ${trace.details.depth}: ${trace.details.satisfied ? 'splneno' : 'nesplneno'}`);
}
```

### Audit logging

Kdyz je audit logging povoleny, backward dotazy zaznamenavaji udalosti zahajeni a dokonceni:

| Audit udalost | Detaily |
|----------------|---------|
| `backward_query_started` | `goalType`, `key`/`topic`, `value`, `operator` |
| `backward_query_completed` | `goalType`, `achievable`, `exploredRules`, `maxDepthReached`, `durationMs` |

## Cviceni

Postavte system overovani zpusobilosti pro zakaznicke odmeny:

1. Vytvorte engine s povolenym backward chaining (maxDepth: 20)
2. Registrujte tato pravidla:
   - `active-customer`: nastavi `customer:${id}:active` na `true` pri prijmu udalosti `customer.login`
   - `purchase-milestone`: nastavi `customer:${id}:milestone` na `true` kdyz `customer:${id}:totalPurchases` >= 500
   - `reward-eligible`: nastavi `customer:${id}:rewardEligible` na `true` kdyz `customer:${id}:active` je `true` A ZAROVEN `customer:${id}:milestone` je `true`
3. Nastavte fakta: `customer:c-1:active = true`, `customer:c-1:totalPurchases = 750`
4. Dotaz: Muze `customer:c-1:rewardEligible` byt rovno `true`?
5. Vytisknete dukazovy strom pro zobrazeni retezu uvazovani
6. Dotazujte se na druheho zakaznika `c-2`, ktery ma `active = true` ale `totalPurchases = 200` — overdte, ze neni dosazitelny a prozkoumejte proc

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, setFact, event, fact,
} from '@hamicek/noex-rules/dsl';
import { factGoal } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  backwardChaining: { maxDepth: 20 },
});

// Pravidlo 1: Oznac zakaznika jako aktivniho pri prihlaseni
engine.registerRule(
  Rule.create('active-customer')
    .name('Active Customer')
    .when(onEvent('customer.login'))
    .then(setFact('customer:${event.customerId}:active', true))
    .build()
);

// Pravidlo 2: Nastav milestone kdyz nakupy dosahnou 500
engine.registerRule(
  Rule.create('purchase-milestone')
    .name('Purchase Milestone')
    .when(onFact('customer:*:totalPurchases'))
    .if(fact('customer:${fact.key.split(":")[1]}:totalPurchases').gte(500))
    .then(setFact('customer:${fact.key.split(":")[1]}:milestone', true))
    .build()
);

// Pravidlo 3: Zpusobily pro odmenu kdyz je aktivni A dosahl milestone
engine.registerRule(
  Rule.create('reward-eligible')
    .name('Reward Eligibility')
    .when(onFact('customer:*:milestone'))
    .if(fact('customer:${fact.key.split(":")[1]}:active').equals(true))
    .if(fact('customer:${fact.key.split(":")[1]}:milestone').equals(true))
    .then(setFact('customer:${fact.key.split(":")[1]}:rewardEligible', true))
    .build()
);

// --- Zakaznik c-1: zpusobily ---

engine.setFact('customer:c-1:active', true);
engine.setFact('customer:c-1:totalPurchases', 750);
engine.setFact('customer:c-1:milestone', true);

const c1Result = engine.query(factGoal('customer:c-1:rewardEligible').equals(true));

console.log('Zakaznik c-1 zpusobily pro odmenu:', c1Result.achievable);
// true

function printProof(node: any, indent = 0): void {
  const pad = '  '.repeat(indent);
  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}[FAKT] ${node.key} = ${JSON.stringify(node.currentValue)} (${node.satisfied ? '✓' : '✗'})`);
      break;
    case 'rule':
      console.log(`${pad}[PRAVIDLO] ${node.ruleName} (${node.satisfied ? '✓' : '✗'})`);
      for (const c of node.conditions) {
        console.log(`${pad}  ${c.source} ${c.operator} ${JSON.stringify(c.expectedValue)} → ${JSON.stringify(c.actualValue)} (${c.satisfied ? '✓' : '✗'})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 1);
      }
      break;
    case 'unachievable':
      console.log(`${pad}[NEDOSAZITELNY] ${node.reason}${node.details ? ': ' + node.details : ''}`);
      break;
  }
}

console.log('\n--- Dukazovy strom pro c-1 ---');
printProof(c1Result.proof);

// --- Zakaznik c-2: nezpusobily ---

engine.setFact('customer:c-2:active', true);
engine.setFact('customer:c-2:totalPurchases', 200);

const c2Result = engine.query(factGoal('customer:c-2:rewardEligible').equals(true));

console.log('\nZakaznik c-2 zpusobily pro odmenu:', c2Result.achievable);
// false — milestone nedosazen, totalPurchases jen 200

console.log('\n--- Dukazovy strom pro c-2 ---');
printProof(c2Result.proof);

// Dukazovy strom ukazuje:
// [PRAVIDLO] Reward Eligibility (✗)
//   fact:customer:c-2:active equals true → true (✓)
//   fact:customer:c-2:milestone equals true → undefined (✗)
//   [PRAVIDLO] Purchase Milestone (✗)
//     fact:customer:c-2:totalPurchases gte 500 → 200 (✗)

console.log('\nProzkoumana pravidla pro c-1:', c1Result.exploredRules);
console.log('Prozkoumana pravidla pro c-2:', c2Result.exploredRules);

await engine.stop();
```

Zakaznik c-1 je zpusobily, protoze vsechna tri fakta existuji: `active = true`, `totalPurchases = 750` a `milestone = true`. Zakaznik c-2 selze, protoze fakt milestone neexistuje, a kdyz backward chaining hleda pravidlo `purchase-milestone`, podminka `totalPurchases = 200` selze (200 < 500).

</details>

## Shrnuti

- Konfigurujte limity backward chainingu pomoci `backwardChaining: { maxDepth, maxExploredRules }` v `RuleEngine.start()`
- Konstruujte faktove cile pomoci `factGoal(key)` a retezem operatoru: `.equals()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`
- Konstruujte udalostni cile pomoci `eventGoal(topic)` pro overeni, zda muze byt udalost emitovana
- Volejte `engine.query(goal)` — prijima raw `Goal` objekty i DSL buildery
- `QueryResult` obsahuje `achievable`, strom `proof`, `exploredRules`, `maxDepthReached` a `durationMs`
- Tri typy proof uzlu: `FactExistsNode` (zakladni pripad), `RuleProofNode` (pravidlo prozkoumano), `UnachievableNode` (cil nedosazitelny)
- Engine **rekurzivne retezi** pres pravidla: chybejici fakta se stavaji podcili, ktere hledaji produkujici pravidla
- **Detekce cyklu** brani nekonecnym smyckam — kruhove zavislosti pravidel vraci `'cycle_detected'`
- Deaktivovana pravidla a pravidla v deaktivovanych skupinach jsou **neviditelna** pro backward chaining
- Backward dotazy emituji trace zaznamy `backward_goal_evaluated` a `backward_rule_explored`
- Audit logging zaznamenava udalosti `backward_query_started` a `backward_query_completed`

---

Dalsi: [REST API](../10-api/01-rest-api.md)
