# DSL Triggers

Factory funkce a buildery pro vytváření triggerů pravidel, které určují kdy se pravidla spustí.

## Import

```typescript
import {
  onEvent,
  onFact,
  onTimer,
  sequence,
  absence,
  count,
  aggregate,
  TriggerBuilder
} from '@hamicek/noex-rules';
```

---

## Jednoduché triggery

### onEvent()

```typescript
function onEvent(topic: string): TriggerBuilder
```

Vytvoří trigger, který se spustí při emitování události se specifikovaným topicem.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Pattern topicu události (podporuje wildcards jako `"order.*"`) |

**Návratová hodnota:** `TriggerBuilder` — Builder produkující `{ type: 'event'; topic: string }`

**Příklad:**

```typescript
// Přesná shoda topicu
Rule.create('order-handler')
  .when(onEvent('order.created'))
  .then(emit('order.processed'))
  .build();

// Wildcard — jakákoli platební událost
Rule.create('payment-logger')
  .when(onEvent('payment.*'))
  .then(log('Payment event received'))
  .build();
```

---

### onFact()

```typescript
function onFact(pattern: string): TriggerBuilder
```

Vytvoří trigger, který se spustí při změně faktu odpovídajícího specifikovanému patternu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| pattern | `string` | ano | Pattern klíče faktu (podporuje `*` wildcard) |

**Návratová hodnota:** `TriggerBuilder` — Builder produkující `{ type: 'fact'; pattern: string }`

**Příklad:**

```typescript
// Přesný klíč faktu
Rule.create('credit-monitor')
  .when(onFact('customer:123:creditScore'))
  .then(emit('credit.changed'))
  .build();

// Wildcard — credit score jakéhokoli zákazníka
Rule.create('credit-alert')
  .when(onFact('customer:*:creditScore'))
  .if(fact('${trigger.key}').lt(500))
  .then(emit('credit.low'))
  .build();

// Kompozitní wildcard
Rule.create('stock-monitor')
  .when(onFact('inventory:warehouse-*:stock'))
  .if(fact('${trigger.key}').lt(10))
  .then(emit('stock.low'))
  .build();
```

---

### onTimer()

```typescript
function onTimer(name: string): TriggerBuilder
```

Vytvoří trigger, který se spustí po expiraci specifikovaného časovače.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Název časovače ke sledování |

**Návratová hodnota:** `TriggerBuilder` — Builder produkující `{ type: 'timer'; name: string }`

**Příklad:**

```typescript
// Reakce na timeout platby
Rule.create('payment-timeout')
  .when(onTimer('payment-timeout'))
  .then(emit('order.cancelled'))
  .build();

// Entity-scoped časovač s interpolací
Rule.create('order-reminder')
  .when(onTimer('order:*:reminder'))
  .then(emit('notification.reminder'))
  .build();
```

---

## Temporální pattern buildery

Temporální patterny umožňují Complex Event Processing (CEP) — detekci vzorů napříč více událostmi v časových oknech.

### sequence()

```typescript
function sequence(): SequenceBuilder
```

Vytvoří builder pro sequence patterny, které detekují uspořádané události v časovém okně.

**Návratová hodnota:** `SequenceBuilder` — Fluent builder pro sequence patterny

#### Metody SequenceBuilder

| Metoda | Signatura | Popis |
|--------|-----------|-------|
| `event()` | `(topic: string, filter?: Record<string, unknown>, as?: string): this` | Přidá očekávanou událost do sekvence |
| `within()` | `(value: string \| number): this` | Nastaví časové okno (např. `"5m"`, `"1h"`) |
| `groupBy()` | `(field: string): this` | Seskupení podle pole (tečková cesta) |
| `strict()` | `(value?: boolean): this` | Povolí strict mód (žádné nesouvisející události mezi) |
| `build()` | `(): RuleTrigger` | Sestaví trigger |

**Validační chyby:**
- `"sequence() requires at least one .event()"`
- `"sequence() requires .within() to set the time window"`

**Příklad:**

```typescript
// Sekvence dokončení objednávky
Rule.create('order-completed')
  .when(
    sequence()
      .event('order.created')
      .event('payment.received')
      .event('order.shipped')
      .within('24h')
      .groupBy('orderId')
      .build()
  )
  .then(emit('order.completed'))
  .build();

// Detekce brute-force útoků se strict řazením
Rule.create('brute-force-detection')
  .when(
    sequence()
      .event('auth.login_failed', { method: 'password' })
      .event('auth.login_failed', { method: 'password' })
      .event('auth.login_failed', { method: 'password' })
      .within('5m')
      .groupBy('userId')
      .strict()
      .build()
  )
  .then(emit('security.brute-force-detected'))
  .build();

// Použití aliasů událostí pro reference v akcích
Rule.create('fraud-detection')
  .when(
    sequence()
      .event('order.created', {}, 'firstOrder')
      .event('order.created', {}, 'secondOrder')
      .within('1m')
      .groupBy('customerId')
      .build()
  )
  .then(emit('fraud.rapid-orders', {
    firstOrderId: ref('matched.firstOrder.orderId'),
    secondOrderId: ref('matched.secondOrder.orderId')
  }))
  .build();
```

---

### absence()

```typescript
function absence(): AbsenceBuilder
```

Vytvoří builder pro absence patterny, které detekují kdy očekávaná událost nenastane v časovém okně po spouštěcí události.

**Návratová hodnota:** `AbsenceBuilder` — Fluent builder pro absence patterny

#### Metody AbsenceBuilder

| Metoda | Signatura | Popis |
|--------|-----------|-------|
| `after()` | `(topic: string, filter?: Record<string, unknown>): this` | Nastaví iniciující událost |
| `expected()` | `(topic: string, filter?: Record<string, unknown>): this` | Nastaví očekávanou událost jejíž absence se detekuje |
| `within()` | `(value: string \| number): this` | Nastaví délku časového okna |
| `groupBy()` | `(field: string): this` | Seskupení podle pole (tečková cesta) |
| `build()` | `(): RuleTrigger` | Sestaví trigger |

**Validační chyby:**
- `"absence() requires .after() to set the trigger event"`
- `"absence() requires .expected() to set the awaited event"`
- `"absence() requires .within() to set the time window"`

**Příklad:**

```typescript
// Detekce timeoutu platby
Rule.create('payment-timeout')
  .when(
    absence()
      .after('order.created')
      .expected('payment.received')
      .within('15m')
      .groupBy('orderId')
      .build()
  )
  .then(emit('order.payment-timeout'))
  .build();

// Opuštění registrace
Rule.create('registration-abandoned')
  .when(
    absence()
      .after('registration.started', { source: 'web' })
      .expected('registration.completed')
      .within('24h')
      .groupBy('userId')
      .build()
  )
  .then(emit('user.registration-abandoned'))
  .build();
```

---

### count()

```typescript
function count(): CountBuilder
```

Vytvoří builder pro count patterny, které detekují kdy počet výskytů událostí dosáhne prahu v časovém okně.

**Návratová hodnota:** `CountBuilder` — Fluent builder pro count patterny

#### Metody CountBuilder

| Metoda | Signatura | Popis |
|--------|-----------|-------|
| `event()` | `(topic: string, filter?: Record<string, unknown>): this` | Nastaví událost k počítání |
| `threshold()` | `(value: number): this` | Nastaví práh počtu (nezáporný) |
| `comparison()` | `(op: 'gte' \| 'lte' \| 'eq'): this` | Nastaví operátor porovnání (výchozí: `'gte'`) |
| `window()` | `(value: string \| number): this` | Nastaví časové okno |
| `groupBy()` | `(field: string): this` | Seskupení podle pole (tečková cesta) |
| `sliding()` | `(value?: boolean): this` | Povolí klouzavé okno (výchozí: tumbling) |
| `build()` | `(): RuleTrigger` | Sestaví trigger |

**Validační chyby:**
- `"count().threshold() must be a non-negative finite number"`
- `"count().comparison() must be 'gte', 'lte', or 'eq', got '{op}'"`
- `"count() requires .event() to set the counted event"`
- `"count() requires .threshold() to set the count threshold"`
- `"count() requires .window() to set the time window"`

**Příklad:**

```typescript
// Práh neúspěšných přihlášení
Rule.create('account-lockout')
  .when(
    count()
      .event('auth.login_failed')
      .threshold(5)
      .window('10m')
      .groupBy('userId')
      .build()
  )
  .then(setFact('user:${trigger.userId}:locked', true))
  .also(emit('security.account-locked'))
  .build();

// Monitoring chybovosti API s klouzavým oknem
Rule.create('api-error-spike')
  .when(
    count()
      .event('api.error', { statusCode: 500 })
      .threshold(100)
      .comparison('gte')
      .window('1m')
      .sliding()
      .build()
  )
  .then(emit('alert.api-errors'))
  .build();

// Detekce nízké aktivity
Rule.create('low-activity')
  .when(
    count()
      .event('user.activity')
      .threshold(1)
      .comparison('lte')
      .window('1h')
      .groupBy('userId')
      .build()
  )
  .then(emit('user.inactive'))
  .build();
```

---

### aggregate()

```typescript
function aggregate(): AggregateBuilder
```

Vytvoří builder pro aggregate patterny, které počítají agregace nad hodnotami polí událostí a spouští se při dosažení prahu.

**Návratová hodnota:** `AggregateBuilder` — Fluent builder pro aggregate patterny

#### Metody AggregateBuilder

| Metoda | Signatura | Popis |
|--------|-----------|-------|
| `event()` | `(topic: string, filter?: Record<string, unknown>): this` | Nastaví událost k agregaci |
| `field()` | `(path: string): this` | Nastaví pole k agregaci (tečková cesta) |
| `function()` | `(fn: 'sum' \| 'avg' \| 'min' \| 'max' \| 'count'): this` | Nastaví agregační funkci |
| `threshold()` | `(value: number): this` | Nastaví hodnotu prahu |
| `comparison()` | `(op: 'gte' \| 'lte' \| 'eq'): this` | Nastaví operátor porovnání (výchozí: `'gte'`) |
| `window()` | `(value: string \| number): this` | Nastaví časové okno |
| `groupBy()` | `(field: string): this` | Seskupení podle pole (tečková cesta) |
| `build()` | `(): RuleTrigger` | Sestaví trigger |

**Validační chyby:**
- `"aggregate().function() must be one of sum, avg, min, max, count, got '{fn}'"`
- `"aggregate().threshold() must be a finite number"`
- `"aggregate().comparison() must be 'gte', 'lte', or 'eq', got '{op}'"`
- `"aggregate() requires .event() to set the source event"`
- `"aggregate() requires .field() to set the aggregated field"`
- `"aggregate() requires .function() to set the aggregate function"`
- `"aggregate() requires .threshold() to set the threshold value"`
- `"aggregate() requires .window() to set the time window"`

**Příklad:**

```typescript
// Vysoká hodnota objednávek
Rule.create('high-value-customer')
  .when(
    aggregate()
      .event('order.paid')
      .field('amount')
      .function('sum')
      .threshold(10000)
      .window('1h')
      .groupBy('customerId')
      .build()
  )
  .then(emit('customer.high-value'))
  .build();

// Monitoring response time API
Rule.create('slow-api')
  .when(
    aggregate()
      .event('api.response')
      .field('responseTime')
      .function('avg')
      .threshold(500)
      .comparison('gte')
      .window('5m')
      .groupBy('endpoint')
      .build()
  )
  .then(emit('alert.slow-endpoint'))
  .build();

// Detekce maximální transakce
Rule.create('large-transaction')
  .when(
    aggregate()
      .event('transaction.completed')
      .field('amount')
      .function('max')
      .threshold(50000)
      .window('24h')
      .groupBy('accountId')
      .build()
  )
  .then(emit('compliance.large-transaction'))
  .build();
```

---

## Typy

### TriggerBuilder

```typescript
interface TriggerBuilder {
  build(): RuleTrigger;
}
```

Základní interface implementovaný všemi trigger buildery.

### RuleTrigger

```typescript
type RuleTrigger =
  | { type: 'event'; topic: string }
  | { type: 'fact'; pattern: string }
  | { type: 'timer'; name: string }
  | { type: 'temporal'; pattern: TemporalPattern };
```

Diskriminovaná unie všech typů triggerů.

### TemporalPattern

```typescript
type TemporalPattern =
  | SequencePattern
  | AbsencePattern
  | CountPattern
  | AggregatePattern;
```

Unie všech typů temporálních patternů.

### SequencePattern

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];
  within: string | number;
  groupBy?: string;
  strict?: boolean;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'sequence'` | Diskriminátor patternu |
| events | `EventMatcher[]` | Uspořádaný seznam očekávaných událostí |
| within | `string \| number` | Časové okno (`"5m"`, `3600000`) |
| groupBy | `string` | Volitelné pole pro seskupení |
| strict | `boolean` | Pokud true, žádné nesouvisející události mezi |

### AbsencePattern

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;
  expected: EventMatcher;
  within: string | number;
  groupBy?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'absence'` | Diskriminátor patternu |
| after | `EventMatcher` | Spouštěcí událost zahajující okno |
| expected | `EventMatcher` | Událost jejíž absence se detekuje |
| within | `string \| number` | Délka časového okna |
| groupBy | `string` | Volitelné pole pro seskupení |

### CountPattern

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
  sliding?: boolean;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'count'` | Diskriminátor patternu |
| event | `EventMatcher` | Událost k počítání |
| threshold | `number` | Práh počtu |
| comparison | `'gte' \| 'lte' \| 'eq'` | Operátor porovnání |
| window | `string \| number` | Časové okno |
| groupBy | `string` | Volitelné pole pro seskupení |
| sliding | `boolean` | Pokud true, používá klouzavé okno |

### AggregatePattern

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'aggregate'` | Diskriminátor patternu |
| event | `EventMatcher` | Událost k agregaci |
| field | `string` | Pole k agregaci (tečková cesta) |
| function | `AggregateFn` | Agregační funkce |
| threshold | `number` | Hodnota prahu |
| comparison | `'gte' \| 'lte' \| 'eq'` | Operátor porovnání |
| window | `string \| number` | Časové okno |
| groupBy | `string` | Volitelné pole pro seskupení |

### EventMatcher

```typescript
interface EventMatcher {
  topic: string;
  filter?: Record<string, unknown>;
  as?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| topic | `string` | Pattern topicu události |
| filter | `Record<string, unknown>` | Volitelný filtr payloadu |
| as | `string` | Volitelný alias pro reference v akcích |

---

## Viz také

- [DSL Builder](./09-dsl-builder.md) — API builderu pravidel
- [DSL Conditions](./11-dsl-conditions.md) — Condition buildery
- [DSL Actions](./12-dsl-actions.md) — Action buildery
- [Temporal Processor](./06-temporal-processor.md) — Interní CEP engine
- [Complex Event Processing](../learn/06-cep/01-introduction.md) — Tutoriál
