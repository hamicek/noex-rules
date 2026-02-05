# DSL Conditions

Factory funkce a buildery pro vytváření podmínek pravidel, které určují zda se akce pravidla vykonají.

## Import

```typescript
import {
  event,
  fact,
  context,
  lookup,
  baseline,
  SourceExpr,
  BaselineExpr,
  ref
} from '@hamicek/noex-rules';
```

---

## Source Expressions

Source expressions definují odkud se čte hodnota pro porovnání. Každá factory funkce vrací `SourceExpr` s řetězitelnými operátory porovnání.

### event()

```typescript
function event(field: string): SourceExpr
```

Vytvoří podmínku cílící na pole z payloadu spouštěcí události.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| field | `string` | ano | Tečková cesta k poli v datech události |

**Návratová hodnota:** `SourceExpr` — Builder s řetězitelnými operátory porovnání

**Příklad:**

```typescript
Rule.create('high-value-order')
  .when(onEvent('order.created'))
  .if(event('amount').gte(1000))
  .then(emit('order.high-value'))
  .build();

Rule.create('vip-purchase')
  .when(onEvent('purchase.completed'))
  .if(event('customer.tier').eq('vip'))
  .if(event('items').contains('premium'))
  .then(emit('vip.purchase'))
  .build();
```

---

### fact()

```typescript
function fact(pattern: string): SourceExpr
```

Vytvoří podmínku cílící na hodnotu z fact store.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| pattern | `string` | ano | Pattern klíče faktu (podporuje `${}` interpolaci) |

**Návratová hodnota:** `SourceExpr` — Builder s řetězitelnými operátory porovnání

**Příklad:**

```typescript
Rule.create('vip-discount')
  .when(onEvent('order.created'))
  .if(fact('customer:${event.customerId}:vip').eq(true))
  .then(emit('discount.applied', { percent: 20 }))
  .build();

Rule.create('credit-check')
  .when(onFact('customer:*:creditScore'))
  .if(fact('${trigger.key}').lt(500))
  .then(emit('credit.alert'))
  .build();
```

---

### context()

```typescript
function context(key: string): SourceExpr
```

Vytvoří podmínku cílící na kontextovou proměnnou předanou během vyhodnocení pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Název kontextové proměnné |

**Návratová hodnota:** `SourceExpr` — Builder s řetězitelnými operátory porovnání

**Příklad:**

```typescript
Rule.create('admin-only')
  .when(onEvent('config.changed'))
  .if(context('currentUser.role').eq('admin'))
  .then(emit('config.updated'))
  .build();

Rule.create('threshold-check')
  .when(onEvent('metric.reported'))
  .if(event('value').gte(ref('context.threshold')))
  .then(emit('threshold.exceeded'))
  .build();
```

---

### lookup()

```typescript
function lookup(nameAndField: string): SourceExpr
```

Vytvoří podmínku cílící na výsledek externího lookupu. Podporuje prosté názvy lookupů i tečkový přístup k polím.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| nameAndField | `string` | ano | Název lookupu, volitelně s tečkovou cestou k poli |

**Návratová hodnota:** `SourceExpr` — Builder s řetězitelnými operátory porovnání

**Syntaxe:**

- `lookup('credit')` — Cílí na celý výsledek lookupu
- `lookup('fraud.riskLevel')` — Cílí na pole `riskLevel` z lookupu `fraud`

**Validační chyby:**

- `"lookup() name part must not be empty"`
- `"lookup() field part must not be empty"`

**Příklad:**

```typescript
Rule.create('credit-approval')
  .when(onEvent('loan.requested'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')]
  })
  .if(lookup('credit').gte(700))
  .then(emit('loan.approved'))
  .build();

Rule.create('fraud-detection')
  .when(onEvent('transaction.initiated'))
  .lookup('fraud', {
    service: 'fraudService',
    method: 'assess',
    args: [ref('event.data')]
  })
  .if(lookup('fraud.riskLevel').neq('high'))
  .then(emit('transaction.approved'))
  .build();
```

---

## Baseline Expressions

Baseline expressions umožňují detekci anomálií porovnáním aktuálních hodnot se statistickými základnami.

### baseline()

```typescript
function baseline(metric: string): BaselineExpr
```

Vytvoří podmínku cílící na registrovanou baseline metriku pro detekci anomálií.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| metric | `string` | ano | Název baseline metriky (musí odpovídat nakonfigurované metrice) |

**Návratová hodnota:** `BaselineExpr` — Builder s metodami pro detekci anomálií

**Validační chyby:**

- `"Condition on baseline(\"...\")": comparison not specified. Use .above(), .below(), .outside(), .abovePercentile(), or .belowPercentile()."`

**Příklad:**

```typescript
Rule.create('error-spike')
  .when(onEvent('metric.error_rate'))
  .if(baseline('error_rate').above(2.5))
  .then(emit('alert.error-spike'))
  .build();

Rule.create('latency-anomaly')
  .when(onEvent('metric.latency'))
  .if(baseline('api_latency').outside(3.0))
  .then(emit('alert.latency-anomaly'))
  .build();
```

---

## Operátory SourceExpr

Všechny source expressions (`event()`, `fact()`, `context()`, `lookup()`) sdílejí tyto operátory porovnání:

### Operátory rovnosti

#### eq()

```typescript
eq<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když se zdrojová hodnota striktně rovná `value`.

```typescript
event('status').eq('completed')
fact('user:active').eq(true)
event('type').eq(ref('context.expectedType'))
```

#### neq()

```typescript
neq<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když se zdrojová hodnota nerovná `value`.

```typescript
event('status').neq('cancelled')
lookup('fraud.level').neq('blocked')
```

---

### Operátory porovnání

#### gt()

```typescript
gt<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když je zdrojová hodnota větší než `value`.

```typescript
event('amount').gt(100)
fact('inventory:stock').gt(0)
```

#### gte()

```typescript
gte<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když je zdrojová hodnota větší nebo rovna `value`.

```typescript
event('priority').gte(5)
lookup('credit').gte(ref('context.minScore'))
```

#### lt()

```typescript
lt<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když je zdrojová hodnota menší než `value`.

```typescript
fact('balance').lt(0)
event('age').lt(18)
```

#### lte()

```typescript
lte<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když je zdrojová hodnota menší nebo rovna `value`.

```typescript
event('quantity').lte(ref('fact.maxAllowed'))
context('retries').lte(3)
```

---

### Operátory kolekcí

#### in()

```typescript
in<T>(values: ValueOrRef<T[]>): SourceExpr
```

Odpovídá když je zdrojová hodnota obsažena v `values`.

```typescript
event('status').in(['pending', 'processing', 'shipped'])
event('region').in(ref('context.allowedRegions'))
```

#### notIn()

```typescript
notIn<T>(values: ValueOrRef<T[]>): SourceExpr
```

Odpovídá když zdrojová hodnota NENÍ v `values`.

```typescript
event('category').notIn(['restricted', 'banned'])
fact('user:role').notIn(['guest', 'anonymous'])
```

#### contains()

```typescript
contains<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když zdroj (pole nebo řetězec) obsahuje `value`.

```typescript
event('tags').contains('urgent')
event('email').contains('@company.com')
```

#### notContains()

```typescript
notContains<T>(value: ValueOrRef<T>): SourceExpr
```

Odpovídá když zdroj NEobsahuje `value`.

```typescript
event('items').notContains('prohibited')
event('message').notContains('spam')
```

---

### Pattern matching

#### matches()

```typescript
matches(pattern: string | RegExp): SourceExpr
```

Odpovídá když zdrojový řetězec odpovídá regex `pattern`.

```typescript
event('email').matches('^[a-z]+@example\\.com$')
event('code').matches(/^[A-Z]{2}-\d{4}$/)
fact('user:phone').matches('\\+1\\d{10}')
```

---

### Operátory existence

#### exists()

```typescript
exists(): SourceExpr
```

Odpovídá když je zdrojová hodnota definovaná (není `undefined` nebo `null`).

```typescript
event('metadata.trackingId').exists()
fact('session:${event.userId}').exists()
context('override').exists()
```

#### notExists()

```typescript
notExists(): SourceExpr
```

Odpovídá když je zdrojová hodnota `undefined` nebo `null`.

```typescript
event('error').notExists()
fact('user:${event.userId}:banned').notExists()
```

---

## Metody BaselineExpr

Baseline expressions mají specializované metody pro detekci anomálií:

### above()

```typescript
above(sensitivity: number): BaselineExpr
```

Anomálie když hodnota překročí `mean + sensitivity * stddev`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| sensitivity | `number` | ano | Počet směrodatných odchylek (sigma). Musí být kladné. |

```typescript
baseline('error_rate').above(2.5)  // > mean + 2.5σ
baseline('cpu_usage').above(3.0)   // > mean + 3.0σ
```

### below()

```typescript
below(sensitivity: number): BaselineExpr
```

Anomálie když hodnota klesne pod `mean - sensitivity * stddev`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| sensitivity | `number` | ano | Počet směrodatných odchylek (sigma). Musí být kladné. |

```typescript
baseline('throughput').below(2.0)  // < mean - 2.0σ
baseline('revenue').below(2.5)     // < mean - 2.5σ
```

### outside()

```typescript
outside(sensitivity: number): BaselineExpr
```

Anomálie když hodnota odchýlí od průměru v obou směrech o více než `sensitivity * stddev`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| sensitivity | `number` | ano | Počet směrodatných odchylek (sigma). Musí být kladné. |

```typescript
baseline('latency').outside(3.0)      // |value - mean| > 3.0σ
baseline('request_rate').outside(2.5)
```

### abovePercentile()

```typescript
abovePercentile(percentile: number): BaselineExpr
```

Anomálie když hodnota překročí N-tý percentil.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| percentile | `number` | ano | Práh percentilu (0–100 exkluzivně) |

**Validační chyby:**

- `"percentile must be less than 100"`

```typescript
baseline('response_time').abovePercentile(95)  // > p95
baseline('memory_usage').abovePercentile(99)   // > p99
```

### belowPercentile()

```typescript
belowPercentile(percentile: number): BaselineExpr
```

Anomálie když hodnota klesne pod N-tý percentil.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| percentile | `number` | ano | Práh percentilu (0–100 exkluzivně) |

**Validační chyby:**

- `"percentile must be less than 100"`

```typescript
baseline('conversion_rate').belowPercentile(5)   // < p5
baseline('engagement').belowPercentile(10)       // < p10
```

---

## Dynamické reference

Použijte `ref()` pro vytvoření dynamických referencí vyhodnocených za běhu:

### ref()

```typescript
function ref<T = unknown>(path: string): Ref<T>
```

Vytvoří dynamickou referenci na hodnotu vyhodnocenou za běhu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| path | `string` | ano | Tečková cesta (např. `"event.orderId"`, `"fact.customer:123"`) |

**Návratová hodnota:** `Ref<T>` — Objekt reference pro runtime vyhodnocení

**Prefixy cest:**

| Prefix | Popis |
|--------|-------|
| `event.` | Pole ze spouštěcí události |
| `fact.` | Hodnota z fact store |
| `context.` | Kontextová proměnná |
| `matched.` | Matchnutá temporální událost (CEP) |

**Příklad:**

```typescript
Rule.create('dynamic-threshold')
  .when(onEvent('metric.value'))
  .if(event('value').gte(ref('context.threshold')))
  .if(event('region').in(ref('fact.allowedRegions')))
  .then(emit('threshold.exceeded'))
  .build();
```

### isRef()

```typescript
function isRef(value: unknown): value is Ref
```

Type-guard kontrolující zda je hodnota `Ref`.

```typescript
const maybeRef = someValue;
if (isRef(maybeRef)) {
  console.log('Reference path:', maybeRef.ref);
}
```

---

## Typy

### SourceExpr

```typescript
class SourceExpr implements ConditionBuilder {
  eq<T>(value: ValueOrRef<T>): SourceExpr;
  neq<T>(value: ValueOrRef<T>): SourceExpr;
  gt<T>(value: ValueOrRef<T>): SourceExpr;
  gte<T>(value: ValueOrRef<T>): SourceExpr;
  lt<T>(value: ValueOrRef<T>): SourceExpr;
  lte<T>(value: ValueOrRef<T>): SourceExpr;
  in<T>(values: ValueOrRef<T[]>): SourceExpr;
  notIn<T>(values: ValueOrRef<T[]>): SourceExpr;
  contains<T>(value: ValueOrRef<T>): SourceExpr;
  notContains<T>(value: ValueOrRef<T>): SourceExpr;
  matches(pattern: string | RegExp): SourceExpr;
  exists(): SourceExpr;
  notExists(): SourceExpr;
  build(): RuleCondition;
}
```

Fluent condition expression s řetězitelnými operátory porovnání.

### BaselineExpr

```typescript
class BaselineExpr implements ConditionBuilder {
  above(sensitivity: number): BaselineExpr;
  below(sensitivity: number): BaselineExpr;
  outside(sensitivity: number): BaselineExpr;
  abovePercentile(percentile: number): BaselineExpr;
  belowPercentile(percentile: number): BaselineExpr;
  build(): RuleCondition;
}
```

Fluent builder pro baseline podmínky detekce anomálií.

### ConditionBuilder

```typescript
interface ConditionBuilder {
  build(): RuleCondition;
}
```

Základní interface implementovaný všemi condition buildery.

### ConditionSource

```typescript
type ConditionSource =
  | { type: 'event'; field: string }
  | { type: 'fact'; pattern: string }
  | { type: 'context'; key: string }
  | { type: 'lookup'; name: string; field?: string }
  | { type: 'baseline'; metric: string; comparison: BaselineComparison; sensitivity?: number };
```

Diskriminovaná unie popisující zdroj dat pro podmínku.

### ConditionOperator

```typescript
type ConditionOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'not_in'
  | 'contains' | 'not_contains'
  | 'matches'
  | 'exists' | 'not_exists';
```

Unie všech podporovaných operátorů porovnání podmínek.

### RuleCondition

```typescript
interface RuleCondition {
  source: ConditionSource;
  operator: ConditionOperator;
  value: unknown | { ref: string };
}
```

Kompletní definice podmínky používaná rule enginem.

### Ref

```typescript
interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}
```

Dynamická reference na hodnotu vyhodnocenou za běhu pravidla.

### ValueOrRef

```typescript
type ValueOrRef<T> = T | Ref<T>;
```

Hodnota která může být buď literál nebo reference vyhodnocená za běhu.

### BaselineComparison

```typescript
type BaselineComparison =
  | 'above'
  | 'below'
  | 'outside'
  | 'above_percentile'
  | 'below_percentile';
```

Typ porovnání pro detekci baseline anomálií.

---

## Viz také

- [DSL Builder](./09-dsl-builder.md) — API builderu pravidel
- [DSL Triggers](./10-dsl-triggers.md) — Trigger buildery
- [DSL Actions](./12-dsl-actions.md) — Action buildery
- [Condition Evaluator](./07-condition-evaluator.md) — Interní vyhodnocovací engine
- [Baseline Store](./22-baseline.md) — Konfigurace detekce anomálií
