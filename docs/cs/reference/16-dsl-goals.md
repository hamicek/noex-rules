# DSL Goal Builders

Fluent buildery pro definici cílů backward chaining dotazů. Cíle specifikují, co má engine dosáhnout nebo dokázat.

## Import

```typescript
import {
  factGoal,
  eventGoal,
  FactGoalBuilder,
  EventGoalBuilder,
} from '@hamicek/noex-rules/dsl';
```

---

## factGoal()

```typescript
function factGoal(key: string): FactGoalBuilder
```

Vytvoří builder pro backward chaining fact goal. Fact goal se ptá: "Lze tento fakt dosáhnout (vyprodukovat nějakým řetězcem pravidel)?"

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu nebo pattern pro dotaz |

**Návratová hodnota:** `FactGoalBuilder` — builder s fluent operátorovými metodami

**Vyhazuje:**

- `DslValidationError` — pokud je `key` prázdný nebo není string

**Příklad:**

```typescript
import { factGoal, RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Dotaz, zda lze fakt dosáhnout s jakoukoliv hodnotou
const result1 = engine.query(factGoal('customer:123:tier'));

// Dotaz, zda lze fakt dosáhnout s konkrétní hodnotou
const result2 = engine.query(factGoal('customer:123:tier').equals('vip'));

// Dotaz, zda numerický fakt překročí práh
const result3 = engine.query(factGoal('sensor:temp').gte(100));
```

---

## FactGoalBuilder

Fluent builder pro backward chaining fact goals. Poskytuje operátorové metody pro specifikaci způsobu vyhodnocení hodnoty faktu.

### exists()

```typescript
exists(): FactGoalBuilder
```

Kontroluje, že fakt existuje s jakoukoliv hodnotou. Toto je výchozí chování — volání `exists()` je volitelné a slouží pouze pro lepší čitelnost.

**Návratová hodnota:** `this` — builder pro řetězení

**Příklad:**

```typescript
// Tyto jsou ekvivalentní:
factGoal('order:456:status')
factGoal('order:456:status').exists()
```

### equals()

```typescript
equals(value: unknown): FactGoalBuilder
```

Kontroluje, že hodnota faktu se rovná očekávané hodnotě.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `unknown` | ano | Očekávaná hodnota |

**Návratová hodnota:** `this` — builder pro řetězení

**Příklad:**

```typescript
factGoal('customer:tier').equals('vip')
factGoal('order:status').equals('completed')
factGoal('config:debug').equals(true)
```

### neq()

```typescript
neq(value: unknown): FactGoalBuilder
```

Kontroluje, že hodnota faktu se nerovná dané hodnotě.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `unknown` | ano | Hodnota, která nesmí odpovídat |

**Návratová hodnota:** `this` — builder pro řetězení

**Příklad:**

```typescript
factGoal('order:status').neq('cancelled')
```

### gt()

```typescript
gt(value: number): FactGoalBuilder
```

Kontroluje, že hodnota faktu je větší než dané číslo.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `number` | ano | Práh (exkluzivní) |

**Návratová hodnota:** `this` — builder pro řetězení

**Vyhazuje:**

- `DslValidationError` — pokud `value` není konečné číslo

**Příklad:**

```typescript
factGoal('account:balance').gt(0)
```

### gte()

```typescript
gte(value: number): FactGoalBuilder
```

Kontroluje, že hodnota faktu je větší nebo rovna danému číslu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `number` | ano | Práh (inkluzivní) |

**Návratová hodnota:** `this` — builder pro řetězení

**Vyhazuje:**

- `DslValidationError` — pokud `value` není konečné číslo

**Příklad:**

```typescript
factGoal('sensor:temp').gte(100)
factGoal('user:age').gte(18)
```

### lt()

```typescript
lt(value: number): FactGoalBuilder
```

Kontroluje, že hodnota faktu je menší než dané číslo.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `number` | ano | Práh (exkluzivní) |

**Návratová hodnota:** `this` — builder pro řetězení

**Vyhazuje:**

- `DslValidationError` — pokud `value` není konečné číslo

**Příklad:**

```typescript
factGoal('inventory:stock').lt(10)
```

### lte()

```typescript
lte(value: number): FactGoalBuilder
```

Kontroluje, že hodnota faktu je menší nebo rovna danému číslu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `number` | ano | Práh (inkluzivní) |

**Návratová hodnota:** `this` — builder pro řetězení

**Vyhazuje:**

- `DslValidationError` — pokud `value` není konečné číslo

**Příklad:**

```typescript
factGoal('queue:size').lte(100)
```

### build()

```typescript
build(): FactGoal
```

Sestaví a vrátí podkladový objekt `FactGoal`.

**Návratová hodnota:** `FactGoal` — zkonstruovaný goal objekt

**Příklad:**

```typescript
const goal = factGoal('customer:tier').equals('vip').build();
// { type: 'fact', key: 'customer:tier', value: 'vip', operator: 'eq' }
```

---

## eventGoal()

```typescript
function eventGoal(topic: string): EventGoalBuilder
```

Vytvoří builder pro backward chaining event goal. Event goal se ptá: "Může být tato událost emitována nějakým řetězcem pravidel?"

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic události pro dotaz |

**Návratová hodnota:** `EventGoalBuilder` — builder pro event goal

**Vyhazuje:**

- `DslValidationError` — pokud je `topic` prázdný nebo není string

**Příklad:**

```typescript
import { eventGoal, RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Dotaz, zda může být událost emitována
const result = engine.query(eventGoal('order.completed'));

if (result.achievable) {
  console.log('Dokončení objednávky je dosažitelné přes:', result.proof);
}
```

---

## EventGoalBuilder

Fluent builder pro backward chaining event goals. Jednodušší než `FactGoalBuilder`, protože události se dotazují pouze podle topic.

### build()

```typescript
build(): EventGoal
```

Sestaví a vrátí podkladový objekt `EventGoal`.

**Návratová hodnota:** `EventGoal` — zkonstruovaný goal objekt

**Příklad:**

```typescript
const goal = eventGoal('notification.sent').build();
// { type: 'event', topic: 'notification.sent' }
```

---

## Typy

### Goal

```typescript
type Goal = FactGoal | EventGoal;
```

Union typ reprezentující jakýkoliv backward chaining cíl.

### FactGoal

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
| value | `unknown` | Očekávaná hodnota (vynechat pro kontrolu existence) |
| operator | `string` | Porovnávací operátor (výchozí: `'eq'`) |

### EventGoal

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
| topic | `string` | Topic události |

### GoalBuilder

```typescript
interface GoalBuilder {
  build(): Goal;
}
```

Společné rozhraní implementované jak `FactGoalBuilder`, tak `EventGoalBuilder`.

---

## Kompletní příklad

```typescript
import { Rule, RuleEngine, factGoal, eventGoal, onFact, emit, setFact } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Pravidlo: Když se zákazník stane VIP, pošli notifikaci
engine.registerRule(
  Rule.create('vip-notification')
    .when(onFact('customer:*:tier'))
    .if(fact('customer:*:tier').equals('vip'))
    .then(emit('notification.vip', { customerId: ref('event.key') }))
    .build()
);

// Pravidlo: Zákazníci s vysokými útraty se stanou VIP
engine.registerRule(
  Rule.create('vip-promotion')
    .when(onFact('customer:*:totalSpent'))
    .if(fact('customer:*:totalSpent').gte(10000))
    .then(setFact(ref('event.key').replace(':totalSpent', ':tier'), 'vip'))
    .build()
);

// Dotaz: Může se zákazník 123 stát VIP?
const factResult = engine.query(factGoal('customer:123:tier').equals('vip'));

if (factResult.achievable) {
  console.log('VIP tier je dosažitelný!');
  console.log('Strom důkazu:', JSON.stringify(factResult.proof, null, 2));
  console.log('Prozkoumáno pravidel:', factResult.exploredRules);
}

// Dotaz: Může být odeslána VIP notifikace?
const eventResult = engine.query(eventGoal('notification.vip'));

if (eventResult.achievable) {
  console.log('VIP notifikace může být spuštěna');
}
```

---

## Viz také

- [Backward Chaining](./23-backward-chaining.md) — BackwardChainer API a QueryResult
- [DSL Builder](./09-dsl-builder.md) — Fluent builder API pro pravidla
- [DSL Conditions](./11-dsl-conditions.md) — Condition buildery s podobnými operátory
- [Fact Store](./02-fact-store.md) — Ukládání a načítání faktů
