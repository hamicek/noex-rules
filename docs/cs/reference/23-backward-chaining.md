# Backward Chaining

Cílově orientovaný engine pro zpětné řetězení pravidel. Pro daný cíl (fakt nebo událost) BackwardChainer prohledává graf pravidel pozpátku — hledá pravidla, jejichž akce produkují cíl, a rekurzivně kontroluje, zda jejich podmínky mohou být splněny z existujících faktů nebo z jiných pravidel.

## Import

```typescript
import {
  BackwardChainer,
  // Typy
  Goal,
  FactGoal,
  EventGoal,
  QueryResult,
  ProofNode,
  FactExistsNode,
  RuleProofNode,
  ConditionProofNode,
  UnachievableNode,
  BackwardChainingConfig,
} from '@hamicek/noex-rules';
```

---

## BackwardChainer

Provádí cílově orientované zpětné řetězení přes registrovaná pravidla. Vyhodnocení je pouze pro čtení — nikdy nemodifikuje fakty ani nespouští akce. Výsledkem je důkazový strom, který vysvětluje, proč je cíl dosažitelný nebo ne.

### Konstruktor

```typescript
constructor(
  ruleManager: RuleManager,
  conditionEvaluator: ConditionEvaluator,
  factStore: FactStore,
  config?: BackwardChainingConfig,
  traceCollector?: TraceCollector
)
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleManager | `RuleManager` | ano | Správce pravidel s registrovanými pravidly |
| conditionEvaluator | `ConditionEvaluator` | ano | Vyhodnocovač podmínek pravidel |
| factStore | `FactStore` | ano | Úložiště faktů pro kontrolu základních případů |
| config | `BackwardChainingConfig` | ne | Konfigurační možnosti |
| traceCollector | `TraceCollector` | ne | Sběrač pro debug tracing |

**Poznámka:** V typickém použití je BackwardChainer vytvořen interně RuleEnginem a přístupný přes `engine.getBackwardChainer()` nebo implicitně přes `engine.query()`.

### evaluate()

```typescript
evaluate(goal: Goal): QueryResult
```

Vyhodnotí, zda je daný cíl dosažitelný s použitím aktuálního úložiště faktů a registrovaných pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| goal | `Goal` | ano | Cíl k vyhodnocení (fakt nebo událost) |

**Návratová hodnota:** `QueryResult` — Výsledek se stavem dosažitelnosti a důkazovým stromem

**Příklad:**

```typescript
import { RuleEngine, factGoal, eventGoal } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Dotaz, zda lze dosáhnout faktu
const factResult = engine.query(factGoal('customer:123:tier').equals('vip'));

if (factResult.achievable) {
  console.log('Cíl je dosažitelný!');
  console.log('Prozkoumaných pravidel:', factResult.exploredRules);
}

// Dotaz, zda může být událost emitována
const eventResult = engine.query(eventGoal('notification.sent'));

console.log('Důkaz:', JSON.stringify(eventResult.proof, null, 2));
```

---

## BackwardChainingConfig

```typescript
interface BackwardChainingConfig {
  maxDepth?: number;
  maxExploredRules?: number;
}
```

Konfigurace chování zpětného řetězení.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| maxDepth | `number` | `10` | Maximální hloubka rekurze pro vyhodnocení cíle |
| maxExploredRules | `number` | `100` | Maximální počet pravidel k prozkoumání před zastavením |

**Příklad:**

```typescript
const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,
    maxExploredRules: 200,
  },
});
```

---

## Goal

```typescript
type Goal = FactGoal | EventGoal;
```

Union typ reprezentující jakýkoliv cíl zpětného řetězení.

---

## FactGoal

```typescript
interface FactGoal {
  type: 'fact';
  key: string;
  value?: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
}
```

Cíl pro ověření nebo dosažení faktu.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'fact'` | Diskriminátor |
| key | `string` | Klíč faktu nebo pattern |
| value | `unknown` | Očekávaná hodnota (vynechte pro kontrolu existence) |
| operator | `string` | Porovnávací operátor (výchozí: `'eq'`) |

**Příklad:**

```typescript
// Kontrola existence faktu
const existsGoal: FactGoal = { type: 'fact', key: 'customer:123:tier' };

// Kontrola konkrétní hodnoty
const valueGoal: FactGoal = {
  type: 'fact',
  key: 'customer:123:tier',
  value: 'vip',
  operator: 'eq'
};

// Kontrola číselného prahu
const thresholdGoal: FactGoal = {
  type: 'fact',
  key: 'sensor:temp',
  value: 100,
  operator: 'gte'
};
```

---

## EventGoal

```typescript
interface EventGoal {
  type: 'event';
  topic: string;
}
```

Cíl pro dosažení emise události.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'event'` | Diskriminátor |
| topic | `string` | Topic události k dosažení |

**Příklad:**

```typescript
const goal: EventGoal = { type: 'event', topic: 'order.completed' };
```

---

## QueryResult

```typescript
interface QueryResult {
  goal: Goal;
  achievable: boolean;
  proof: ProofNode;
  exploredRules: number;
  maxDepthReached: boolean;
  durationMs: number;
}
```

Výsledek dotazu zpětného řetězení.

| Pole | Typ | Popis |
|------|-----|-------|
| goal | `Goal` | Vyhodnocený cíl |
| achievable | `boolean` | Zda je cíl dosažitelný |
| proof | `ProofNode` | Důkazový strom vysvětlující výsledek |
| exploredRules | `number` | Počet pravidel prozkoumaných během vyhodnocení |
| maxDepthReached | `boolean` | Zda bylo vyhodnocení omezeno maximální hloubkou |
| durationMs | `number` | Doba vyhodnocení v milisekundách |

**Příklad:**

```typescript
const result = engine.query(factGoal('order:status').equals('shipped'));

console.log(`Dosažitelný: ${result.achievable}`);
console.log(`Prozkoumaných pravidel: ${result.exploredRules}`);
console.log(`Dosažena max. hloubka: ${result.maxDepthReached}`);
console.log(`Doba: ${result.durationMs.toFixed(2)}ms`);
```

---

## ProofNode

```typescript
type ProofNode = FactExistsNode | RuleProofNode | UnachievableNode;
```

Union typ pro uzly v důkazovém stromu.

---

## FactExistsNode

```typescript
interface FactExistsNode {
  type: 'fact_exists';
  key: string;
  currentValue: unknown;
  satisfied: boolean;
}
```

Uzel důkazu indikující, že fakt již existuje v úložišti.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'fact_exists'` | Diskriminátor |
| key | `string` | Klíč faktu |
| currentValue | `unknown` | Aktuální hodnota v úložišti |
| satisfied | `boolean` | Zda hodnota splňuje cíl |

---

## RuleProofNode

```typescript
interface RuleProofNode {
  type: 'rule';
  ruleId: string;
  ruleName: string;
  satisfied: boolean;
  conditions: ConditionProofNode[];
  children: ProofNode[];
}
```

Uzel důkazu reprezentující pravidlo v inferenčním řetězci.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'rule'` | Diskriminátor |
| ruleId | `string` | Identifikátor pravidla |
| ruleName | `string` | Název pravidla |
| satisfied | `boolean` | Zda jsou všechny podmínky splněny |
| conditions | `ConditionProofNode[]` | Výsledky vyhodnocení pro každou podmínku |
| children | `ProofNode[]` | Rekurzivní sub-cíle (pro podmínky faktů vyžadující řetězení) |

---

## ConditionProofNode

```typescript
interface ConditionProofNode {
  source: string;
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  satisfied: boolean;
}
```

Výsledek vyhodnocení jednotlivé podmínky v pravidle.

| Pole | Typ | Popis |
|------|-----|-------|
| source | `string` | Lidsky čitelný popis zdroje (např. `fact:order:status`) |
| operator | `string` | Použitý porovnávací operátor |
| expectedValue | `unknown` | Očekávaná hodnota z podmínky |
| actualValue | `unknown` | Nalezená skutečná hodnota |
| satisfied | `boolean` | Zda je podmínka splněna |

---

## UnachievableNode

```typescript
interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}
```

Uzel důkazu indikující, že cíl nelze dosáhnout.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'unachievable'` | Diskriminátor |
| reason | `string` | Kód důvodu selhání |
| details | `string` | Dodatečné podrobnosti o selhání |

**Kódy důvodů:**

| Kód | Popis |
|-----|-------|
| `'no_rules'` | Žádná pravidla neprodukují požadovaný fakt nebo událost |
| `'cycle_detected'` | Detekována cyklická závislost v řetězci pravidel |
| `'max_depth'` | Překročena maximální hloubka rekurze |
| `'all_paths_failed'` | Všechna kandidátní pravidla selhala |

---

## Kompletní příklad

```typescript
import {
  RuleEngine,
  Rule,
  onFact,
  fact,
  setFact,
  emit,
  factGoal,
  eventGoal,
} from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,
    maxExploredRules: 200,
  },
});

// Pravidlo: Zákazníci s vysokými útratami se stávají VIP
await engine.registerRule(
  Rule.create('vip-promotion')
    .name('VIP Promotion')
    .when(onFact('customer:*:totalSpent'))
    .if(fact('customer:*:totalSpent').gte(10000))
    .then(setFact('customer:*:tier', 'vip'))
    .build()
);

// Pravidlo: VIP zákazníci dostávají notifikaci
await engine.registerRule(
  Rule.create('vip-notification')
    .name('VIP Notification')
    .when(onFact('customer:*:tier'))
    .if(fact('customer:*:tier').eq('vip'))
    .then(emit('notification.vip'))
    .build()
);

// Nastavení počátečního faktu
await engine.setFact('customer:123:totalSpent', 15000);

// Dotaz: Může se zákazník 123 stát VIP?
const factResult = engine.query(factGoal('customer:123:tier').equals('vip'));

console.log('--- Výsledek cíle faktu ---');
console.log(`Dosažitelný: ${factResult.achievable}`);
console.log(`Prozkoumaných pravidel: ${factResult.exploredRules}`);
console.log('Důkaz:', JSON.stringify(factResult.proof, null, 2));

// Dotaz: Může být odeslána VIP notifikace?
const eventResult = engine.query(eventGoal('notification.vip'));

console.log('\n--- Výsledek cíle události ---');
console.log(`Dosažitelný: ${eventResult.achievable}`);
console.log(`Doba: ${eventResult.durationMs.toFixed(2)}ms`);

// Inspekce důkazového stromu
function printProof(node: ProofNode, indent = 0): void {
  const pad = '  '.repeat(indent);

  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}✓ Fakt ${node.key} = ${node.currentValue} (splněn: ${node.satisfied})`);
      break;
    case 'rule':
      console.log(`${pad}Pravidlo: ${node.ruleName} (splněno: ${node.satisfied})`);
      for (const cond of node.conditions) {
        const symbol = cond.satisfied ? '✓' : '✗';
        console.log(`${pad}  ${symbol} ${cond.source} ${cond.operator} ${cond.expectedValue} (skutečná: ${cond.actualValue})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 2);
      }
      break;
    case 'unachievable':
      console.log(`${pad}✗ Nedosažitelný: ${node.reason}${node.details ? ` - ${node.details}` : ''}`);
      break;
  }
}

console.log('\n--- Důkazový strom ---');
printProof(eventResult.proof);

await engine.stop();
```

---

## Použití s DSL Goal Builders

DSL poskytuje fluent buildery pro vytváření cílů:

```typescript
import { factGoal, eventGoal } from '@hamicek/noex-rules';

// Cíle faktů s operátory
engine.query(factGoal('user:balance').gt(0));
engine.query(factGoal('order:status').equals('shipped'));
engine.query(factGoal('config:debug').exists());

// Cíle událostí
engine.query(eventGoal('email.sent'));
engine.query(eventGoal('webhook.triggered'));
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor s metodou `query()`
- [DSL Goal Builders](./16-dsl-goals.md) — Fluent buildery pro cíle (`factGoal`, `eventGoal`)
- [Rule Manager](./05-rule-manager.md) — Registrace a indexace pravidel
- [Condition Evaluator](./07-condition-evaluator.md) — Vyhodnocování podmínek použité při sestavování důkazu
- [Fact Store](./02-fact-store.md) — Úložiště faktů pro kontrolu základních případů
