# DSL Builder

Fluent builder API pro sestavování typově bezpečných definic pravidel s IDE autocompletionem a validací v době kompilace.

## Import

```typescript
import { Rule, RuleBuilder } from '@hamicek/noex-rules';
```

## Factory metoda

### Rule.create()

```typescript
static create(id: string): RuleBuilder
```

Vytvoří nový rule builder s daným unikátním identifikátorem.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| id | `string` | ano | Unikátní identifikátor pravidla (musí být neprázdný) |

**Návratová hodnota:** `RuleBuilder` — Nová instance builderu pro řetězení

**Vyhazuje:** `DslValidationError` pokud je `id` prázdné nebo není string

**Příklad:**

```typescript
const rule = Rule.create('order-notification')
  .name('Send Order Notification')
  .when(onEvent('order.created'))
  .then(emit('notification.send'))
  .build();
```

---

## Metody

### name()

```typescript
name(value: string): this
```

Nastaví lidsky čitelný název pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `string` | ano | Zobrazovaný název (výchozí je ID pravidla) |

**Návratová hodnota:** `this` pro řetězení

### description()

```typescript
description(value: string): this
```

Nastaví volitelný popis pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `string` | ano | Volný textový popis |

**Návratová hodnota:** `this` pro řetězení

### priority()

```typescript
priority(value: number): this
```

Nastaví prioritu vyhodnocení (vyšší hodnota = vyhodnoceno dříve).

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `number` | ano | Konečné číslo (výchozí `0`) |

**Návratová hodnota:** `this` pro řetězení

**Vyhazuje:** `DslValidationError` pokud `value` není konečné číslo

### enabled()

```typescript
enabled(value: boolean): this
```

Povolí nebo zakáže pravidlo.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `boolean` | ano | `true` pro povolení, `false` pro zakázání (výchozí `true`) |

**Návratová hodnota:** `this` pro řetězení

### tags()

```typescript
tags(...values: string[]): this
```

Přidá jeden nebo více tagů pro kategorizaci a filtrování.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| values | `string[]` | ano | Tagy k přidání |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
Rule.create('my-rule')
  .tags('orders', 'notifications', 'high-priority')
  // ...
```

### group()

```typescript
group(groupId: string): this
```

Přiřadí pravidlo do logické skupiny. Pravidlo je aktivní pouze pokud je `enabled` flag pravidla i skupiny `true`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| groupId | `string` | ano | ID skupiny, do které pravidlo patří |

**Návratová hodnota:** `this` pro řetězení

**Vyhazuje:** `DslValidationError` pokud `groupId` není neprázdný string

### lookup()

```typescript
lookup(name: string, config: LookupConfig): this
```

Deklaruje lookup externích dat, který se provede před vyhodnocením podmínek. Lookupy se resolvují paralelně po spuštění triggeru, ale před vyhodnocením podmínek.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Unikátní název lookupu (použit pro přístup k výsledku) |
| config | `LookupConfig` | ano | Konfigurace lookupu |

**Návratová hodnota:** `this` pro řetězení

**Vyhazuje:** `DslValidationError` pokud je název prázdný, duplicitní, nebo chybí povinná pole konfigurace

**Příklad:**

```typescript
Rule.create('check-credit')
  .when(onEvent('order.created'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')],
    cache: { ttl: '5m' },
  })
  .if(lookup('credit').gte(700))
  .then(emit('order.approved'))
  .build();
```

### when()

```typescript
when(trigger: TriggerBuilder | RuleTrigger): this
```

Nastaví trigger, který určuje kdy se pravidlo spustí.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| trigger | `TriggerBuilder \| RuleTrigger` | ano | Trigger builder (např. `onEvent`, `sequence`) nebo raw `RuleTrigger` objekt |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
// Použití trigger builderu
Rule.create('my-rule')
  .when(onEvent('order.created'))
  // ...

// Použití raw trigger objektu
Rule.create('my-rule')
  .when({ type: 'event', topic: 'order.created' })
  // ...
```

### if()

```typescript
if(condition: ConditionBuilder | RuleCondition): this
```

Přidá podmínku, která musí být splněna pro spuštění pravidla. Více volání `if()` se kombinuje logickým AND.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `ConditionBuilder \| RuleCondition` | ano | Condition builder (např. `event('x').gte(1)`) nebo raw `RuleCondition` objekt |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
Rule.create('high-value-order')
  .when(onEvent('order.created'))
  .if(event('amount').gte(1000))
  .if(event('status').eq('pending'))
  .then(emit('order.high-value'))
  .build();
```

### and()

```typescript
and(condition: ConditionBuilder | RuleCondition): this
```

Alias pro `if()` — přidá další podmínku (logický AND). Zlepšuje čitelnost při řetězení více podmínek.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `ConditionBuilder \| RuleCondition` | ano | Condition builder nebo raw `RuleCondition` |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
Rule.create('vip-large-order')
  .when(onEvent('order.created'))
  .if(event('amount').gte(1000))
  .and(fact('customer:${event.customerId}:tier').eq('vip'))
  .then(emit('order.vip-priority'))
  .build();
```

### then()

```typescript
then(action: ActionBuilder | RuleAction): this
```

Přidá akci k vykonání při spuštění pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| action | `ActionBuilder \| RuleAction` | ano | Action builder (např. `emit(...)`) nebo raw `RuleAction` objekt |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
Rule.create('order-workflow')
  .when(onEvent('order.created'))
  .then(setFact('order:${event.orderId}:status', 'processing'))
  .then(emit('order.processing', { orderId: ref('event.orderId') }))
  .build();
```

### also()

```typescript
also(action: ActionBuilder | RuleAction): this
```

Alias pro `then()` — přidá další akci. Zlepšuje čitelnost při řetězení více akcí.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| action | `ActionBuilder \| RuleAction` | ano | Action builder nebo raw `RuleAction` |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
Rule.create('order-complete')
  .when(onEvent('order.shipped'))
  .then(setFact('order:${event.orderId}:status', 'shipped'))
  .also(emit('notification.send', { type: 'shipped', orderId: ref('event.orderId') }))
  .also(cancelTimer('order-timeout:${event.orderId}'))
  .build();
```

### build()

```typescript
build(): BuiltRule
```

Validuje nakumulovaný stav a vrátí finální definici pravidla.

**Návratová hodnota:** `BuiltRule` — Definice pravidla připravená k registraci do engine

**Vyhazuje:** `DslValidationError` pokud:
- Chybí ID pravidla
- Není nastaven trigger (žádné volání `when()`)
- Nejsou definovány akce (žádné volání `then()`)

**Příklad:**

```typescript
const rule = Rule.create('my-rule')
  .name('My Rule')
  .when(onEvent('order.created'))
  .then(emit('order.processed'))
  .build();

// Registrace do engine
engine.registerRule(rule);
```

---

## Typy

### LookupConfig

```typescript
interface LookupConfig {
  service: string;
  method: string;
  args?: unknown[];
  cache?: LookupCacheConfig;
  onError?: LookupErrorStrategy;
}
```

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| service | `string` | ano | Název registrované služby |
| method | `string` | ano | Název metody na službě |
| args | `unknown[]` | ne | Argumenty (mohou obsahovat `Ref` hodnoty pro runtime resoluci) |
| cache | `LookupCacheConfig` | ne | Konfigurace cachování |
| onError | `LookupErrorStrategy` | ne | Chování při chybě: `'skip'` (výchozí) nebo `'fail'` |

### LookupCacheConfig

```typescript
interface LookupCacheConfig {
  ttl: string | number;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| ttl | `string \| number` | Time-to-live: duration string (`'5m'`, `'1h'`) nebo milisekundy |

### LookupErrorStrategy

```typescript
type LookupErrorStrategy = 'skip' | 'fail';
```

| Hodnota | Popis |
|---------|-------|
| `'skip'` | Přeskočí pravidlo pokud lookup selže (výchozí) |
| `'fail'` | Vyhodí výjimku pokud lookup selže |

### BuiltRule

```typescript
type BuiltRule = RuleInput;
```

Výstup `build()` — alias pro core typ `RuleInput`. Obsahuje veškerou konfiguraci pravidla připravenou k registraci.

### TriggerBuilder

```typescript
interface TriggerBuilder {
  build(): RuleTrigger;
}
```

Builder interface implementovaný trigger factory funkcemi (`onEvent`, `onFact`, `onTimer`, `sequence`, atd.).

### ConditionBuilder

```typescript
interface ConditionBuilder {
  build(): RuleCondition;
}
```

Builder interface implementovaný condition expresemi (`event()`, `fact()`, `context()`, `lookup()`, `baseline()`).

### ActionBuilder

```typescript
interface ActionBuilder {
  build(): RuleAction;
}
```

Builder interface implementovaný action factory funkcemi (`emit`, `setFact`, `deleteFact`, `setTimer`, atd.).

### Ref

```typescript
interface Ref<T = unknown> {
  ref: string;
  __type?: T;
}
```

Dynamická reference na runtime hodnotu. Vytvořena pomocí helper funkce `ref()`.

| Pole | Typ | Popis |
|------|-----|-------|
| ref | `string` | Tečková cesta k hodnotě |
| __type | `T` | Fantomový typ pro compile-time bezpečnost (nepoužívá se za běhu) |

### ValueOrRef

```typescript
type ValueOrRef<T> = T | Ref<T>;
```

Hodnota, která může být buď literál `T` nebo `Ref` resolvovaná za běhu.

---

## Helper funkce

### ref()

```typescript
function ref<T = unknown>(path: string): Ref<T>
```

Vytvoří dynamickou referenci na runtime hodnotu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| path | `string` | ano | Tečková cesta (např. `'event.orderId'`, `'fact.user:balance'`) |

**Návratová hodnota:** `Ref<T>` — Objekt reference

**Příklad:**

```typescript
ref('event.orderId')      // Reference na event data
ref('fact.user:123')      // Reference na hodnotu faktu
ref('lookup.credit.score') // Reference na výsledek lookupu
ref('matched.0.amount')    // Reference na první matchnutou událost
```

### isRef()

```typescript
function isRef(value: unknown): value is Ref
```

Type-guard, který kontroluje zda je hodnota `Ref`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `unknown` | ano | Hodnota k otestování |

**Návratová hodnota:** `boolean` — `true` pokud je hodnota `Ref` objekt

---

## Chyby

### DslValidationError

Vyhozena když builder obdrží neplatný vstup nebo je v neplatném stavu při build time.

```typescript
class DslValidationError extends DslError {
  constructor(message: string);
}
```

**Běžné příčiny:**
- Prázdné ID pravidla: `Rule.create('')`
- Neplatná priorita: `rule.priority(NaN)`
- Prázdné ID skupiny: `rule.group('')`
- Chybějící trigger: `build()` bez `when()`
- Chybějící akce: `build()` bez `then()`
- Duplicitní název lookupu
- Chybějící service/method lookupu

**Příklad:**

```typescript
import { DslValidationError, Rule } from '@hamicek/noex-rules';

try {
  Rule.create('').build();
} catch (err) {
  if (err instanceof DslValidationError) {
    console.error('Neplatné pravidlo:', err.message);
  }
}
```

---

## Kompletní příklad

```typescript
import {
  Rule,
  onEvent,
  event,
  fact,
  lookup,
  emit,
  setFact,
  setTimer,
  cancelTimer,
  ref
} from '@hamicek/noex-rules';

// Jednoduché pravidlo s event triggerem a podmínkou
const orderNotification = Rule.create('order-notification')
  .name('Send Order Notification')
  .description('Sends notification for high-value orders')
  .priority(100)
  .tags('orders', 'notifications')
  .group('order-processing')
  .when(onEvent('order.created'))
  .if(event('amount').gte(100))
  .then(emit('notification.send', {
    orderId: ref('event.orderId'),
    message: 'New order received!'
  }))
  .build();

// Pravidlo s externím lookupem
const creditCheck = Rule.create('credit-check')
  .name('Credit Check')
  .when(onEvent('loan.application'))
  .lookup('score', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.applicantId')],
    cache: { ttl: '10m' },
    onError: 'skip'
  })
  .if(lookup('score').gte(700))
  .then(emit('loan.approved', { applicantId: ref('event.applicantId') }))
  .build();

// Pravidlo s více podmínkami a akcemi
const orderWorkflow = Rule.create('order-workflow')
  .name('Order Processing Workflow')
  .priority(50)
  .when(onEvent('order.created'))
  .if(event('status').eq('pending'))
  .and(event('paymentVerified').eq(true))
  .and(fact('inventory:${event.productId}:available').gte(1))
  .then(setFact('order:${event.orderId}:status', 'processing'))
  .also(emit('order.processing', {
    orderId: ref('event.orderId'),
    customerId: ref('event.customerId')
  }))
  .also(setTimer('order-timeout:${event.orderId}', '24h', {
    topic: 'order.timeout',
    data: { orderId: ref('event.orderId') }
  }))
  .also(cancelTimer('cart-abandon:${event.customerId}'))
  .build();

// Registrace pravidel do engine
engine.registerRule(orderNotification);
engine.registerRule(creditCheck);
engine.registerRule(orderWorkflow);
```

---

## Viz také

- [DSL Triggers](./10-dsl-triggers.md) — Trigger buildery (`onEvent`, `onFact`, `onTimer`, temporální patterny)
- [DSL Conditions](./11-dsl-conditions.md) — Condition buildery (`event`, `fact`, `context`, `lookup`, `baseline`)
- [DSL Actions](./12-dsl-actions.md) — Action buildery (`emit`, `setFact`, `setTimer`, atd.)
- [Rule Engine](./01-rule-engine.md) — Registrace a správa pravidel
- [Rules Deep Dive](../learn/03-rules-deep-dive/01-anatomy-of-a-rule.md) — Tutoriál
