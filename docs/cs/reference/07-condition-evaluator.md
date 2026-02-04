# ConditionEvaluator

Vyhodnocuje podmínky pravidel proti runtime kontextu. Získává hodnoty z různých zdrojů (fakta, události, lookupy, baseline) a porovnává je pomocí specifikovaných operátorů.

## Import

```typescript
import {
  ConditionEvaluator,
  EvaluationContext,
  EvaluationOptions
} from '@hamicek/noex-rules';
```

## Konstruktor

```typescript
new ConditionEvaluator()
```

Vytvoří novou instanci ConditionEvaluator. Evaluátor je bezstavový — žádná konfigurace není potřeba.

**Příklad:**

```typescript
const evaluator = new ConditionEvaluator();
```

---

## Metody

### evaluate()

```typescript
evaluate(
  condition: RuleCondition,
  context: EvaluationContext,
  conditionIndex?: number,
  options?: EvaluationOptions
): boolean
```

Vyhodnotí jednu podmínku proti poskytnutému kontextu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `RuleCondition` | ano | Podmínka k vyhodnocení |
| context | `EvaluationContext` | ano | Runtime kontext s fakty, trigger daty, proměnnými |
| conditionIndex | `number` | ne | Index pro tracing (výchozí: `0`) |
| options | `EvaluationOptions` | ne | Volby pro tracing callback |

**Návratová hodnota:** `boolean` — true pokud podmínka projde

**Příklad:**

```typescript
const context: EvaluationContext = {
  trigger: { type: 'event', data: { amount: 150, currency: 'USD' } },
  facts: factStore,
  variables: new Map()
};

const condition: RuleCondition = {
  source: { type: 'event', field: 'amount' },
  operator: 'gt',
  value: 100
};

const passed = evaluator.evaluate(condition, context);
// passed === true
```

### evaluateAll()

```typescript
evaluateAll(
  conditions: RuleCondition[],
  context: EvaluationContext,
  options?: EvaluationOptions
): boolean
```

Vyhodnotí všechny podmínky pomocí AND logiky. Ukončí se při prvním selhání (short-circuit).

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| conditions | `RuleCondition[]` | ano | Pole podmínek |
| context | `EvaluationContext` | ano | Runtime kontext |
| options | `EvaluationOptions` | ne | Volby pro tracing callback |

**Návratová hodnota:** `boolean` — true pokud všechny podmínky projdou, false pokud jakákoliv selže

**Příklad:**

```typescript
const conditions: RuleCondition[] = [
  {
    source: { type: 'fact', pattern: 'user:type' },
    operator: 'eq',
    value: 'premium'
  },
  {
    source: { type: 'event', field: 'amount' },
    operator: 'gte',
    value: 100
  }
];

const allPassed = evaluator.evaluateAll(conditions, context);
```

---

## Typy

### EvaluationContext

```typescript
interface EvaluationContext {
  trigger: {
    type: 'fact' | 'event' | 'timer' | 'temporal';
    data: Record<string, unknown>;
  };
  facts: FactStore;
  variables: Map<string, unknown>;
  lookups?: Map<string, unknown>;
  baselineStore?: BaselineStore;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| trigger | `object` | Informace o triggeru s typem a asociovanými daty |
| trigger.type | `string` | Typ triggeru, který aktivoval pravidlo |
| trigger.data | `object` | Datový payload z triggeru (event payload, změna faktu, timer data) |
| facts | `FactStore` | Instance fact store pro vyhledávání faktů |
| variables | `Map` | Runtime proměnné nastavené během vykonávání pravidla |
| lookups | `Map` | Předem vyřešené výsledky externích lookupů |
| baselineStore | `BaselineStore` | Baseline store pro detekci anomálií |

### EvaluationOptions

```typescript
interface EvaluationOptions {
  onConditionEvaluated?: ConditionEvaluationCallback;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| onConditionEvaluated | `function` | Callback volaný po každém vyhodnocení podmínky |

### ConditionEvaluationCallback

```typescript
type ConditionEvaluationCallback = (result: ConditionEvaluationResult) => void;
```

### ConditionEvaluationResult

```typescript
interface ConditionEvaluationResult {
  conditionIndex: number;
  source: {
    type: 'fact' | 'event' | 'context' | 'lookup' | 'baseline';
    pattern?: string;
    field?: string;
    key?: string;
    name?: string;
    metric?: string;
  };
  operator: string;
  actualValue: unknown;
  expectedValue: unknown;
  result: boolean;
  durationMs: number;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| conditionIndex | `number` | Pozice v poli podmínek |
| source | `object` | Deskriptor zdroje (pole specifická pro typ) |
| operator | `string` | Použitý operátor porovnání |
| actualValue | `unknown` | Hodnota získaná ze zdroje |
| expectedValue | `unknown` | Hodnota pro porovnání (vyřešená pokud reference) |
| result | `boolean` | Zda podmínka prošla |
| durationMs | `number` | Doba vyhodnocení v milisekundách |

---

## Struktura podmínky

### RuleCondition

```typescript
interface RuleCondition {
  source: ConditionSource;
  operator: ConditionOperator;
  value: unknown | { ref: string };
}
```

---

## Typy zdrojů

### fact

Získá hodnotu z fact store pomocí pattern matching.

```typescript
{ type: 'fact', pattern: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| pattern | `string` | Klíč faktu nebo pattern s wildcards (`user:*:status`) |

Pattern podporuje wildcards (`*`) — vrací hodnotu prvního matchujícího faktu.

**Příklad:**

```typescript
{
  source: { type: 'fact', pattern: 'user:123:status' },
  operator: 'eq',
  value: 'active'
}
```

Interpolace patternu je podporována:

```typescript
{
  source: { type: 'fact', pattern: 'order:${event.orderId}:total' },
  operator: 'gte',
  value: 100
}
```

### event

Získá hodnotu z datového payloadu triggeru.

```typescript
{ type: 'event', field: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| field | `string` | Dot-notation cesta k poli (`customer.profile.tier`) |

**Příklad:**

```typescript
{
  source: { type: 'event', field: 'customer.profile.tier' },
  operator: 'eq',
  value: 'premium'
}
```

Indexování polí je podporováno: `items.0.name`

### context

Získá hodnotu z runtime proměnných.

```typescript
{ type: 'context', key: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| key | `string` | Název proměnné |

**Příklad:**

```typescript
{
  source: { type: 'context', key: 'threshold' },
  operator: 'lte',
  value: 100
}
```

### lookup

Získá hodnotu z předem vyřešených externích dat.

```typescript
{ type: 'lookup', name: string, field?: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Název lookup služby |
| field | `string` | Volitelná dot-notation cesta uvnitř výsledku lookupu |

**Příklad:**

```typescript
// Lookup vrací { riskLevel: 'low', score: 0.2 }
{
  source: { type: 'lookup', name: 'fraud', field: 'riskLevel' },
  operator: 'eq',
  value: 'low'
}
```

### baseline

Kontroluje, zda je aktuální hodnota anomální v porovnání s baseline statistikami.

```typescript
{
  type: 'baseline',
  metric: string,
  comparison: BaselineComparison,
  sensitivity?: number
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| metric | `string` | Registrované jméno baseline metriky |
| comparison | `BaselineComparison` | Jak porovnávat: `above`, `below`, `outside`, `above_percentile`, `below_percentile` |
| sensitivity | `number` | Práh sigma (výchozí: 2.0) |

**Příklad:**

```typescript
{
  source: {
    type: 'baseline',
    metric: 'response_time',
    comparison: 'above',
    sensitivity: 3
  },
  operator: 'eq',
  value: true
}
```

---

## Operátory

### Rovnost

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `eq` | Striktní rovnost (`===`) | `value === 'active'` |
| `neq` | Striktní nerovnost (`!==`) | `value !== 'banned'` |

### Číselné porovnání

Vyžaduje, aby obě hodnoty byly čísla. Vrací false při neshodě typů.

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `gt` | Větší než | `amount > 100` |
| `gte` | Větší nebo rovno | `amount >= 100` |
| `lt` | Menší než | `amount < 1000` |
| `lte` | Menší nebo rovno | `amount <= 1000` |

### Operátory seznamů

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `in` | Hodnota je v poli | `status in ['pending', 'processing']` |
| `not_in` | Hodnota není v poli | `role not_in ['guest', 'banned']` |

### Operátory řetězců/polí

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `contains` | Řetězec obsahuje podřetězec nebo pole obsahuje prvek | `tags contains 'urgent'` |
| `not_contains` | Řetězec neobsahuje nebo pole neobsahuje | `tags not_contains 'spam'` |

### Regex

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `matches` | Řetězec odpovídá regex patternu | `email matches '^[a-z]+@.*$'` |

Regex patterny jsou cachovány pro výkon. Neplatné patterny vrací false.

### Existence

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `exists` | Hodnota není undefined ani null | `user.email exists` |
| `not_exists` | Hodnota je undefined nebo null | `user.deletedAt not_exists` |

---

## Reference hodnot

Pole `value` podporuje dynamické reference pomocí syntaxe `{ ref: string }`.

### Syntaxe referencí

| Prefix | Popis | Příklad |
|--------|-------|---------|
| `fact.` | Hodnota faktu | `{ ref: 'fact.config:min-amount' }` |
| `event.` | Pole trigger dat | `{ ref: 'event.limits.maxTotal' }` |
| `trigger.` | Alias pro event | `{ ref: 'trigger.target' }` |
| `var.` | Context proměnná | `{ ref: 'var.maxAllowed' }` |
| `lookup.` | Výsledek lookupu | `{ ref: 'lookup.profile.address.country' }` |
| `baseline.` | Baseline statistiky | `{ ref: 'baseline.response_time.mean' }` |

**Příklad: Porovnání event pole s hodnotou faktu**

```typescript
{
  source: { type: 'event', field: 'amount' },
  operator: 'gt',
  value: { ref: 'fact.config:min-amount' }
}
```

**Příklad: Porovnání dvou event polí**

```typescript
{
  source: { type: 'event', field: 'price' },
  operator: 'lte',
  value: { ref: 'event.maxPrice' }
}
```

---

## Tracing

Použijte `EvaluationOptions.onConditionEvaluated` pro trasování vyhodnocení podmínek při debugování.

**Příklad:**

```typescript
const results: ConditionEvaluationResult[] = [];

const options: EvaluationOptions = {
  onConditionEvaluated: (result) => {
    results.push(result);
    console.log(`Podmínka ${result.conditionIndex}: ${result.result}`);
    console.log(`  Zdroj: ${result.source.type}`);
    console.log(`  Skutečná hodnota: ${result.actualValue}`);
    console.log(`  Očekávaná hodnota: ${result.expectedValue}`);
    console.log(`  Doba: ${result.durationMs}ms`);
  }
};

evaluator.evaluateAll(conditions, context, options);
```

---

## Poznámky k chování

### Short-Circuit vyhodnocení

`evaluateAll()` se zastaví při první selhávající podmínce:

```typescript
const conditions = [
  { source: { type: 'fact', pattern: 'missing' }, operator: 'exists', value: null },
  { source: { type: 'event', field: 'field' }, operator: 'eq', value: 'never-checked' }
];

// Druhá podmínka se nikdy nevyhodnotí
evaluator.evaluateAll(conditions, context);
```

### Prázdné podmínky

Prázdné pole podmínek vrací true (žádné podmínky k selhání):

```typescript
evaluator.evaluateAll([], context); // true
```

### Chybějící hodnoty

- Chybějící fakt: vrací `undefined`
- Chybějící event pole: vrací `undefined`
- Chybějící proměnná: vrací `undefined`
- Chybějící lookup: vrací `undefined`
- Použijte operátory `exists`/`not_exists` pro kontrolu přítomnosti

### Typová konverze

Neprovádí se žádná typová konverze. Číselné operátory vyžadují skutečná čísla:

```typescript
// Vrací false — '100' je řetězec, ne číslo
{
  source: { type: 'event', field: 'amount' }, // amount: '100'
  operator: 'gt',
  value: 50
}
```

---

## Viz také

- [ActionExecutor](./08-action-executor.md) — Vykonávání akcí pravidel
- [DSL Conditions](./11-dsl-conditions.md) — Fluent buildery podmínek
- [BaselineStore](./22-baseline.md) — Baseline pro detekci anomálií
- [Podmínky pravidel](../learn/03-rules-deep-dive/02-conditions.md) — Tutoriál
