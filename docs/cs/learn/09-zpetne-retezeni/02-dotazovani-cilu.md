# Dotazování cílů

Předchozí kapitola vysvětlila teorii zpětného řetězení. Tato kapitola je kompletní API reference: jak konstruovat cíle, konfigurovat engine, volat `engine.query()` a interpretovat důkazový strom, který vrací. Postavíte vícepravidlový systém ověřování způsobilosti a naučíte se číst důkazové stromy zahrnující více úrovní řetězení pravidel.

## Co se naučíte

- Jak konfigurovat backward chaining pomocí `BackwardChainingConfig`
- Konstrukce cílů s raw objekty a DSL buildery (`factGoal`, `eventGoal`)
- Volání `engine.query()` a čtení `QueryResult`
- Všechny typy `ProofNode`: `FactExistsNode`, `RuleProofNode`, `UnachievableNode`
- Jak funguje řetězení pravidel, detekce cyklů a limity hloubky
- Pozorovatelnost: tracing a audit logging pro backward dotazy

## Konfigurace

Backward chaining je dostupný na každém enginu bez další konfigurace. Pro nastavení limitů předejte `backwardChaining` do `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,           // Max hloubka rekurze (výchozí: 10)
    maxExploredRules: 200,  // Max prozkoumáných pravidel na dotaz (výchozí: 100)
  },
});
```

| Volba | Výchozí | Popis |
|-------|---------|-------|
| `maxDepth` | `10` | Maximální hloubka rekurze při vyhodnocování podcílů |
| `maxExploredRules` | `100` | Maximální celkový počet prozkoumáných pravidel v rámci dotazu |

Oba limity chrání před nekonečnými dotazy ve velkých sadách pravidel. Při dosažení limitu vrací postižená větev `UnachievableNode` s důvodem `'max_depth'`.

## Cíle

**Cíl** je otázka, kterou kladete enginu. Existují dva typy:

### FactGoal

"Může tento fakt existovat (nebo mít konkrétní hodnotu)?"

```typescript
import { factGoal } from '@hamicek/noex-rules/dsl';

// Kontrola existence — existuje fakt s jakoukoli hodnotou?
factGoal('customer:c-42:tier')

// Rovnost hodnoty — rovná se fakt 'vip'?
factGoal('customer:c-42:tier').equals('vip')

// Numerická srovnání
factGoal('customer:c-42:points').gte(1000)
factGoal('order:ord-1:total').lt(500)
factGoal('sensor:temp:current').gt(100)
factGoal('account:a-1:balance').lte(0)

// Negace
factGoal('user:u-1:status').neq('banned')
```

Metoda `.exists()` je k dispozici jako pomůcka pro čitelnost, ale je výchozím chováním — volání `factGoal('key')` a `factGoal('key').exists()` produkují stejný cíl.

**Dostupné operátory**:

| Metoda | Operátor | Popis |
|--------|----------|-------|
| `.exists()` | — | Fakt existuje s jakoukoli hodnotou (výchozí) |
| `.equals(v)` | `eq` | Hodnota faktu se rovná `v` |
| `.neq(v)` | `neq` | Hodnota faktu se nerovná `v` |
| `.gt(n)` | `gt` | Hodnota faktu je větší než `n` |
| `.gte(n)` | `gte` | Hodnota faktu je větší nebo rovna `n` |
| `.lt(n)` | `lt` | Hodnota faktu je menší než `n` |
| `.lte(n)` | `lte` | Hodnota faktu je menší nebo rovna `n` |

Numerické operátory (`.gt()`, `.gte()`, `.lt()`, `.lte()`) vyžadují konečné číslo a vyhodí `DslValidationError` pro nenumerické hodnoty.

### EventGoal

"Může být tato událost emitována nějakým řetězem pravidel?"

```typescript
import { eventGoal } from '@hamicek/noex-rules/dsl';

// Může některý řetěz pravidel produkovat tuto událost?
eventGoal('order.completed')
eventGoal('notification.sent')
eventGoal('fraud.alert')
```

Cíle událostí vyhledávají pravidla, jejichž akce obsahují `emit_event` akci s odpovídajícím topicem.

### Raw cílové objekty

Cíle můžete také konstruovat jako plain objekty bez DSL:

```typescript
// Faktový cíl (raw)
const goal = { type: 'fact' as const, key: 'customer:c-42:tier', value: 'vip', operator: 'eq' as const };

// Událostní cíl (raw)
const goal = { type: 'event' as const, topic: 'order.completed' };

engine.query(goal);
```

DSL buildery jsou preferovány pro typovou bezpečnost a čitelnost.

## Dotazování

Zavolejte `engine.query()` s cílem nebo goal builderem:

```typescript
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));
```

Metoda přijímá raw `Goal` objekty i instance `GoalBuilder` (z DSL). Buildery resolvuje automaticky voláním `.build()`.

### QueryResult

Každý dotaz vrací `QueryResult`:

```typescript
interface QueryResult {
  goal: Goal;              // Dotazovaný cíl
  achievable: boolean;     // Zda je cíl dosažitelný
  proof: ProofNode;        // Důkazový strom vysvětlující proč
  exploredRules: number;   // Celkový počet prozkoumáných pravidel
  maxDepthReached: boolean; // Zda rekurze dosáhla limitu hloubky
  durationMs: number;      // Doba provedení dotazu v milisekundách
}
```

Pole `achievable` je hlavní odpověď. Strom `proof` vysvětluje uvažování.

## Důkazové stromy

Důkazový strom je rekurzivní struktura se třemi typy uzlů:

```text
  ProofNode
  ├── FactExistsNode     — Základní případ: fakt již ve store
  ├── RuleProofNode      — Pravidlo bylo prozkoumáno s podmínkami
  └── UnachievableNode   — Cíl nelze dosáhnout (s důvodem)
```

### FactExistsNode

Vrácen, když fakt již existuje ve store:

```typescript
interface FactExistsNode {
  type: 'fact_exists';
  key: string;          // Klíč faktu
  currentValue: unknown; // Aktuální hodnota ve store
  satisfied: boolean;    // Zda hodnota odpovídá cíli
}
```

`FactExistsNode` může být splněný (fakt existuje a odpovídá) nebo nesplněný (fakt existuje, ale neodpovídá operátoru/hodnotě cíle). Když fakt neexistuje vůbec a žádné pravidlo ho neprodukuje, dostanete místo toho `UnachievableNode`.

### RuleProofNode

Vrácen, když bylo nalezeno pravidlo, které by mohlo cíl produkovat:

```typescript
interface RuleProofNode {
  type: 'rule';
  ruleId: string;                     // ID pravidla
  ruleName: string;                   // Lidsky čitelný název
  satisfied: boolean;                 // Zda všechny podmínky prošly
  conditions: ConditionProofNode[];   // Výsledky vyhodnocení jednotlivých podmínek
  children: ProofNode[];              // Podcíle z nesplněných podmínek
}

interface ConditionProofNode {
  source: string;         // Lidsky čitelný zdroj (např. 'fact:customer:points')
  operator: string;       // Operátor podmínky (např. 'gte')
  expectedValue: unknown; // Očekávaná hodnota podmínky
  actualValue: unknown;   // Skutečná hodnota z fact store
  satisfied: boolean;     // Zda tato podmínka prošla
}
```

Pole `children` obsahuje podcíle — rekurzivní proof uzly pro podmínky odkazující na fakta, která ještě nejsou ve store. Zde strom roste do hloubky.

### UnachievableNode

Vrácen, když cíl nelze dosáhnout:

```typescript
interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}
```

| Důvod | Význam |
|-------|--------|
| `no_rules` | Žádné akce pravidel cíl neprodukují |
| `cycle_detected` | Všechna kandidátní pravidla tvoří kruhovou závislost |
| `max_depth` | Dosažen limit hloubky rekurze |
| `all_paths_failed` | Pravidla existují, ale žádné nemá splnitelné podmínky |

## Řetězení pravidel

Síla backward chainingu pochází z následování řetězů pravidel. Když podmínka odkazuje na chybějící fakt, engine automaticky vytvoří podcíl a hledá pravidla, která ho produkují:

```typescript
const engine = await RuleEngine.start();

// Pravidlo 1: Získej body z objednávek
engine.registerRule(
  Rule.create('earn-points')
    .name('Earn Loyalty Points')
    .when(onEvent('order.completed'))
    .then(setFact('customer:c-42:points', 1500))
    .build()
);

// Pravidlo 2: Upgrade na VIP když je dost bodů
engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP Tier Upgrade')
    .when(onEvent('loyalty.check'))
    .if(fact('customer:c-42:points').gte(1000))
    .then(setFact('customer:c-42:tier', 'vip'))
    .build()
);

// Dotaz: Může zákazník c-42 mít VIP tier?
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));
```

Engine prochází zpětně:

1. Cíl: `customer:c-42:tier = 'vip'` → najde pravidlo `vip-upgrade`
2. Podmínka: `customer:c-42:points >= 1000` → fakt chybí → podcíl
3. Podcíl: `customer:c-42:points` existuje → najde pravidlo `earn-points`
4. `earn-points` nemá podmínky → splněno

Výsledek: achievable = `true`, s dvouúrovňovým důkazovým stromem.

Pokud by `customer:c-42:points` již existoval s hodnotou `1500`, engine by nemusel rekurzovat — krok 2 by vrátil splněný `FactExistsNode`.

## Detekce cyklů

Když pravidla tvoří kruhové závislosti, engine cyklus detekuje a zastaví:

```typescript
// Pravidlo A produkuje fact-x když fact-y existuje
engine.registerRule(
  Rule.create('rule-a')
    .name('Rule A')
    .when(onEvent('trigger'))
    .if(fact('fact-y').exists())
    .then(setFact('fact-x', true))
    .build()
);

// Pravidlo B produkuje fact-y když fact-x existuje
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

Engine udržuje množinu navštívených při procházení. Když narazí na kombinaci pravidlo+cíl, kterou již v aktuální cestě viděl, vrátí se zpět. Pokud všechna kandidátní pravidla jsou součástí cyklu, výsledkem je `UnachievableNode` s důvodem `'cycle_detected'`.

## Deaktivovaná pravidla a skupiny

Backward chaining respektuje stav pravidel a skupin. Deaktivovaná pravidla a pravidla v deaktivovaných skupinách jsou při hledání přeskočena:

```typescript
engine.registerRule(
  Rule.create('my-rule')
    .name('My Rule')
    .enabled(false) // Deaktivováno — backward chaining toto pravidlo ignoruje
    .when(onEvent('trigger'))
    .then(setFact('output', true))
    .build()
);

const result = engine.query(factGoal('output'));
// result.achievable === false
// result.proof.reason === 'no_rules' (deaktivované pravidlo je neviditelné)
```

## Kompletní příklad: Systém ověřování způsobilosti pro půjčku

Tento příklad demonstruje vícepravidlový systém, kde backward chaining prochází třemi úrovněmi pravidel pro určení způsobilosti pro půjčku:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';
import { factGoal, eventGoal } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  backwardChaining: { maxDepth: 15 },
});

// --- Úroveň 1: Základní datová pravidla ---

// Vyhledání kreditního skóre produkuje fakt skóre
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

// Ověření příjmu produkuje fakt příjmu
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

// --- Úroveň 2: Odvozená kritéria způsobilosti ---

// Kreditně způsobilý když skóre >= 680
engine.registerRule(
  Rule.create('credit-eligible')
    .name('Credit Eligibility')
    .when(onFact('applicant:*:creditScore'))
    .if(fact('applicant:${fact.key.split(":")[1]}:creditScore').gte(680))
    .then(setFact('applicant:${fact.key.split(":")[1]}:creditEligible', true))
    .build()
);

// Příjmově způsobilý když ověřený příjem >= 45000
engine.registerRule(
  Rule.create('income-eligible')
    .name('Income Eligibility')
    .when(onFact('applicant:*:verifiedIncome'))
    .if(fact('applicant:${fact.key.split(":")[1]}:verifiedIncome').gte(45000))
    .then(setFact('applicant:${fact.key.split(":")[1]}:incomeEligible', true))
    .build()
);

// --- Úroveň 3: Konečné rozhodnutí o půjčce ---

// Schválit půjčku když je splněna kreditní i příjmová způsobilost
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

// --- Scénář 1: Plně způsobilý žadatel ---

engine.setFact('applicant:A-1:creditScore', 750);
engine.setFact('applicant:A-1:verifiedIncome', 85000);
engine.setFact('applicant:A-1:creditEligible', true);
engine.setFact('applicant:A-1:incomeEligible', true);

const eligible = engine.query(factGoal('applicant:A-1:loanApproved').equals(true));

console.log('Žadatel A-1 půjčka schválena:', eligible.achievable);
// true — všechny podmínky splněny z existujících faktů
console.log('Prozkoumáná pravidla:', eligible.exploredRules);
// 1 — jen loan-approval bylo potřeba

// --- Scénář 2: Chybějící příjmová způsobilost ---

engine.setFact('applicant:A-2:creditScore', 720);
engine.setFact('applicant:A-2:creditEligible', true);
// Žádný fakt incomeEligible — backward chaining ho bude hledat

const partial = engine.query(factGoal('applicant:A-2:loanApproved').equals(true));

console.log('Žadatel A-2 půjčka schválena:', partial.achievable);
// false — fakt incomeEligible chybí a pravidlo income-eligible potřebuje
//         verifiedIncome, který také neexistuje
console.log('Prozkoumáná pravidla:', partial.exploredRules);

// --- Inspekce důkazového stromu ---

function printProof(node: any, indent = 0): void {
  const pad = '  '.repeat(indent);

  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}[FAKT] ${node.key} = ${node.currentValue} (${node.satisfied ? '✓' : '✗'})`);
      break;

    case 'rule':
      console.log(`${pad}[PRAVIDLO] ${node.ruleName} (${node.satisfied ? '✓' : '✗'})`);
      for (const cond of node.conditions) {
        console.log(`${pad}  ${cond.source} ${cond.operator} ${cond.expectedValue} → skutečná: ${cond.actualValue} (${cond.satisfied ? '✓' : '✗'})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 1);
      }
      break;

    case 'unachievable':
      console.log(`${pad}[NEDOSAŽITELNÝ] ${node.reason}${node.details ? ': ' + node.details : ''}`);
      break;
  }
}

console.log('\n--- Důkazový strom pro A-2 ---');
printProof(partial.proof);

// --- Může být emitována událost loan.approved? ---

const canEmit = engine.query(eventGoal('loan.approved'));
console.log('\nMůže emitovat loan.approved:', canEmit.achievable);

await engine.stop();
```

## Pozorovatelnost

Backward chaining se integruje s tracing a audit systémy enginu.

### Trace záznamy

Když je tracing povolen, backward dotazy emitují dva typy trace záznamů:

| Typ | Kdy | Klíčové detaily |
|-----|-----|-----------------|
| `backward_goal_evaluated` | Cíl (fakt nebo událost) je vyhodnocen | `goalType`, `key`/`topic`, `depth`, `satisfied`, `proofType` |
| `backward_rule_explored` | Pravidlo je prozkoumáno během hledání | `ruleId`, `ruleName`, `satisfied`, `conditionsCount`, `childrenCount`, `depth` |

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// Po dotazu jsou trace záznamy v kolektoru
engine.query(factGoal('customer:c-42:tier').equals('vip'));

const goalTraces = engine.traceCollector.getByType('backward_goal_evaluated');
const ruleTraces = engine.traceCollector.getByType('backward_rule_explored');

for (const trace of goalTraces) {
  console.log(`Cíl ${trace.details.goalType}:${trace.details.key ?? trace.details.topic}`
    + ` v hloubce ${trace.details.depth}: ${trace.details.satisfied ? 'splněno' : 'nesplněno'}`);
}
```

### Audit logging

Když je audit logging povolen, backward dotazy zaznamenávají události zahájení a dokončení:

| Audit událost | Detaily |
|----------------|---------|
| `backward_query_started` | `goalType`, `key`/`topic`, `value`, `operator` |
| `backward_query_completed` | `goalType`, `achievable`, `exploredRules`, `maxDepthReached`, `durationMs` |

## Cvičení

Postavte systém ověřování způsobilosti pro zákaznické odměny:

1. Vytvořte engine s povoleným backward chaining (maxDepth: 20)
2. Registrujte tato pravidla:
   - `active-customer`: nastaví `customer:${id}:active` na `true` při příjmu události `customer.login`
   - `purchase-milestone`: nastaví `customer:${id}:milestone` na `true` když `customer:${id}:totalPurchases` >= 500
   - `reward-eligible`: nastaví `customer:${id}:rewardEligible` na `true` když `customer:${id}:active` je `true` A ZÁROVEŇ `customer:${id}:milestone` je `true`
3. Nastavte fakta: `customer:c-1:active = true`, `customer:c-1:totalPurchases = 750`
4. Dotaz: Může `customer:c-1:rewardEligible` být rovno `true`?
5. Vytiskněte důkazový strom pro zobrazení řetězu uvažování
6. Dotazujte se na druhého zákazníka `c-2`, který má `active = true` ale `totalPurchases = 200` — ověřte, že není dosažitelný a prozkoumejte proč

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, setFact, event, fact,
} from '@hamicek/noex-rules/dsl';
import { factGoal } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  backwardChaining: { maxDepth: 20 },
});

// Pravidlo 1: Označ zákazníka jako aktivního při přihlášení
engine.registerRule(
  Rule.create('active-customer')
    .name('Active Customer')
    .when(onEvent('customer.login'))
    .then(setFact('customer:${event.customerId}:active', true))
    .build()
);

// Pravidlo 2: Nastav milestone když nákupy dosáhnou 500
engine.registerRule(
  Rule.create('purchase-milestone')
    .name('Purchase Milestone')
    .when(onFact('customer:*:totalPurchases'))
    .if(fact('customer:${fact.key.split(":")[1]}:totalPurchases').gte(500))
    .then(setFact('customer:${fact.key.split(":")[1]}:milestone', true))
    .build()
);

// Pravidlo 3: Způsobilý pro odměnu když je aktivní A dosáhl milestone
engine.registerRule(
  Rule.create('reward-eligible')
    .name('Reward Eligibility')
    .when(onFact('customer:*:milestone'))
    .if(fact('customer:${fact.key.split(":")[1]}:active').equals(true))
    .if(fact('customer:${fact.key.split(":")[1]}:milestone').equals(true))
    .then(setFact('customer:${fact.key.split(":")[1]}:rewardEligible', true))
    .build()
);

// --- Zákazník c-1: způsobilý ---

engine.setFact('customer:c-1:active', true);
engine.setFact('customer:c-1:totalPurchases', 750);
engine.setFact('customer:c-1:milestone', true);

const c1Result = engine.query(factGoal('customer:c-1:rewardEligible').equals(true));

console.log('Zákazník c-1 způsobilý pro odměnu:', c1Result.achievable);
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
      console.log(`${pad}[NEDOSAŽITELNÝ] ${node.reason}${node.details ? ': ' + node.details : ''}`);
      break;
  }
}

console.log('\n--- Důkazový strom pro c-1 ---');
printProof(c1Result.proof);

// --- Zákazník c-2: nezpůsobilý ---

engine.setFact('customer:c-2:active', true);
engine.setFact('customer:c-2:totalPurchases', 200);

const c2Result = engine.query(factGoal('customer:c-2:rewardEligible').equals(true));

console.log('\nZákazník c-2 způsobilý pro odměnu:', c2Result.achievable);
// false — milestone nedosažen, totalPurchases jen 200

console.log('\n--- Důkazový strom pro c-2 ---');
printProof(c2Result.proof);

// Důkazový strom ukazuje:
// [PRAVIDLO] Reward Eligibility (✗)
//   fact:customer:c-2:active equals true → true (✓)
//   fact:customer:c-2:milestone equals true → undefined (✗)
//   [PRAVIDLO] Purchase Milestone (✗)
//     fact:customer:c-2:totalPurchases gte 500 → 200 (✗)

console.log('\nProzkoumáná pravidla pro c-1:', c1Result.exploredRules);
console.log('Prozkoumáná pravidla pro c-2:', c2Result.exploredRules);

await engine.stop();
```

Zákazník c-1 je způsobilý, protože všechna tři fakta existují: `active = true`, `totalPurchases = 750` a `milestone = true`. Zákazník c-2 selže, protože fakt milestone neexistuje, a když backward chaining hledá pravidlo `purchase-milestone`, podmínka `totalPurchases = 200` selže (200 < 500).

</details>

## Shrnutí

- Konfigurujte limity backward chainingu pomocí `backwardChaining: { maxDepth, maxExploredRules }` v `RuleEngine.start()`
- Konstruujte faktové cíle pomocí `factGoal(key)` a řetězem operátorů: `.equals()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`
- Konstruujte událostní cíle pomocí `eventGoal(topic)` pro ověření, zda může být událost emitována
- Volejte `engine.query(goal)` — přijímá raw `Goal` objekty i DSL buildery
- `QueryResult` obsahuje `achievable`, strom `proof`, `exploredRules`, `maxDepthReached` a `durationMs`
- Tři typy proof uzlů: `FactExistsNode` (základní případ), `RuleProofNode` (pravidlo prozkoumáno), `UnachievableNode` (cíl nedosažitelný)
- Engine **rekurzivně řetězí** přes pravidla: chybějící fakta se stávají podcíly, které hledají produkující pravidla
- **Detekce cyklů** brání nekonečným smyčkám — kruhové závislosti pravidel vrací `'cycle_detected'`
- Deaktivovaná pravidla a pravidla v deaktivovaných skupinách jsou **neviditelná** pro backward chaining
- Backward dotazy emitují trace záznamy `backward_goal_evaluated` a `backward_rule_explored`
- Audit logging zaznamenává události `backward_query_started` a `backward_query_completed`

---

Další: [REST API](../10-api/01-rest-api.md)
