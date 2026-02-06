# DSL Actions

Factory funkce a buildery pro vytváření akcí pravidel vykonávaných při aktivaci pravidla.

## Import

```typescript
import {
  emit,
  setFact,
  deleteFact,
  setTimer,
  cancelTimer,
  callService,
  log,
  conditional,
  ref,
  isRef
} from '@hamicek/noex-rules';
```

---

## Akce událostí

### emit()

```typescript
function emit(topic: string, data?: Record<string, unknown>): ActionBuilder
```

Vytvoří akci, která emituje novou událost při aktivaci pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic emitované události |
| data | `Record<string, unknown>` | ne | Payload události (hodnoty mohou používat `ref()` pro dynamické vyhodnocení) |

**Návratová hodnota:** `ActionBuilder` — Builder pro použití s `RuleBuilder.then()`

**Validační chyby:**

- `"emit() topic must be a non-empty string"`

**Příklad:**

```typescript
Rule.create('order-notification')
  .when(onEvent('order.created'))
  .then(emit('notification.send', {
    orderId: ref('event.orderId'),
    message: 'Order received!'
  }))
  .build();

Rule.create('simple-forward')
  .when(onEvent('payment.completed'))
  .then(emit('invoice.generate'))
  .build();
```

---

## Akce faktů

### setFact()

```typescript
function setFact<T>(key: string, value: ValueOrRef<T>): ActionBuilder
```

Vytvoří akci, která nastaví (upsertne) fakt ve fact store.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu (podporuje `${}` interpolaci za běhu) |
| value | `ValueOrRef<T>` | ano | Hodnota faktu (může používat `ref()` pro dynamické vyhodnocení) |

**Návratová hodnota:** `ActionBuilder` — Builder pro použití s `RuleBuilder.then()`

**Validační chyby:**

- `"setFact() key must be a non-empty string"`

**Příklad:**

```typescript
Rule.create('mark-processed')
  .when(onEvent('order.shipped'))
  .then(setFact('order:${event.orderId}:status', 'shipped'))
  .build();

Rule.create('copy-vip-status')
  .when(onEvent('customer.updated'))
  .then(setFact('customer:vip', ref('event.isVip')))
  .build();
```

---

### deleteFact()

```typescript
function deleteFact(key: string): ActionBuilder
```

Vytvoří akci, která smaže fakt z fact store.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu ke smazání (podporuje `${}` interpolaci za běhu) |

**Návratová hodnota:** `ActionBuilder` — Builder pro použití s `RuleBuilder.then()`

**Validační chyby:**

- `"deleteFact() key must be a non-empty string"`

**Příklad:**

```typescript
Rule.create('cleanup-pending')
  .when(onEvent('order.completed'))
  .then(deleteFact('order:${event.orderId}:pending'))
  .build();
```

---

## Akce časovačů

### setTimer()

```typescript
function setTimer(config: SetTimerOptions): ActionBuilder
function setTimer(name: string): TimerFluentBuilder
```

Vytvoří akci, která nastaví časovač. Podporuje dva způsoby použití.

**Forma s objektem options:**

Předání kompletního objektu `SetTimerOptions`:

```typescript
setTimer({
  name: 'payment-timeout',
  duration: '15m',
  onExpire: {
    topic: 'order.payment_timeout',
    data: { orderId: ref('event.orderId') }
  }
})
```

**Fluent API forma:**

Předání pouze názvu časovače a řetězení metod:

```typescript
setTimer('payment-timeout')
  .after('15m')
  .emit('order.payment_timeout', { orderId: ref('event.orderId') })
  .repeat('5m', 3)
```

**Návratová hodnota:** `ActionBuilder` (options forma) nebo `TimerFluentBuilder` (string forma)

**Validační chyby:**

- `"setTimer() config.name must be a non-empty string"`
- `"setTimer() config.duration must be a valid duration"`
- `"setTimer() config.onExpire.topic must be a non-empty string"`
- `"Timer \"...\" requires onExpire topic. Use .emit(topic, data) to set it."`

**Kompletní příklad:**

```typescript
Rule.create('payment-reminder')
  .when(onEvent('order.created'))
  .then(setTimer('payment-timeout')
    .after('15m')
    .emit('order.payment_timeout', { orderId: ref('event.orderId') })
  )
  .build();

Rule.create('recurring-check')
  .when(onEvent('subscription.started'))
  .then(setTimer({
    name: 'subscription-check',
    duration: '24h',
    onExpire: { topic: 'subscription.check' },
    repeat: { interval: '24h', maxCount: 30 }
  }))
  .build();
```

---

### TimerFluentBuilder

Fluent builder vrácený voláním `setTimer(name)`.

#### after()

```typescript
after(duration: string | number): TimerFluentBuilder
```

Nastaví dobu před vypršením časovače.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| duration | `string \| number` | ano | Řetězec doby trvání (např. `"15m"`, `"24h"`) nebo milisekundy |

**Návratová hodnota:** `this` pro řetězení

---

#### emit()

```typescript
emit(topic: string, data?: Record<string, unknown>): TimerFluentBuilder
```

Nastaví událost emitovanou při vypršení časovače.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic emitované události |
| data | `Record<string, unknown>` | ne | Volitelný payload (hodnoty mohou používat `ref()`) |

**Návratová hodnota:** `this` pro řetězení

---

#### repeat()

```typescript
repeat(interval: string | number, maxCount?: number): TimerFluentBuilder
```

Konfiguruje časovač pro opakování po každém vypršení.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| interval | `string \| number` | ano | Interval opakování (řetězec nebo milisekundy) |
| maxCount | `number` | ne | Maximální počet opakování |

**Návratová hodnota:** `this` pro řetězení

---

### cancelTimer()

```typescript
function cancelTimer(name: string): ActionBuilder
```

Vytvoří akci, která zruší běžící časovač.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Název časovače ke zrušení (podporuje `${}` interpolaci) |

**Návratová hodnota:** `ActionBuilder` — Builder pro použití s `RuleBuilder.then()`

**Validační chyby:**

- `"cancelTimer() name must be a non-empty string"`

**Příklad:**

```typescript
Rule.create('payment-received')
  .when(onEvent('payment.completed'))
  .then(cancelTimer('payment-timeout'))
  .then(emit('order.confirmed'))
  .build();

Rule.create('cancel-dynamic')
  .when(onEvent('order.cancelled'))
  .then(cancelTimer('payment-timeout:${event.orderId}'))
  .build();
```

---

## Akce služeb

### callService()

```typescript
function callService(service: string): CallServiceFluentBuilder
function callService(service: string, method: string, args?: unknown[]): ActionBuilder
```

Vytvoří akci, která zavolá metodu na externí službě. Podporuje dva způsoby použití.

**Fluent API forma:**

```typescript
callService('paymentService')
  .method('processPayment')
  .args(ref('event.orderId'), 100)
```

**Přímá forma volání:**

```typescript
callService('paymentService', 'processPayment', [ref('event.orderId'), 100])
```

**Návratová hodnota:** `CallServiceFluentBuilder` (fluent forma) nebo `ActionBuilder` (přímá forma)

**Validační chyby:**

- `"callService() service must be a non-empty string"`
- `"callService() method must be a non-empty string"`
- `"callService(\"...\") requires method name. Use .method(name) to set it."`

**Příklad:**

```typescript
Rule.create('process-payment')
  .when(onEvent('checkout.completed'))
  .then(callService('paymentService')
    .method('charge')
    .args(ref('event.customerId'), ref('event.amount'))
  )
  .build();

Rule.create('send-email')
  .when(onEvent('user.registered'))
  .then(callService('emailService', 'sendWelcome', [
    ref('event.email'),
    ref('event.name')
  ]))
  .build();
```

---

### CallServiceFluentBuilder

Fluent builder vrácený voláním `callService(service)`.

#### method()

```typescript
method(name: string): CallServiceFluentBuilder
```

Nastaví metodu k zavolání na službě.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Název metody |

**Návratová hodnota:** `this` pro řetězení

---

#### args()

```typescript
args(...args: unknown[]): CallServiceFluentBuilder
```

Nastaví argumenty pro volání metody.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| args | `unknown[]` | ano | Argumenty metody (hodnoty mohou používat `ref()`) |

**Návratová hodnota:** `this` pro řetězení

---

## Akce logování

### log()

```typescript
function log(level: LogLevel, message: string): ActionBuilder
```

Vytvoří akci logování. Zpráva podporuje `${}` interpolaci vyhodnocenou za běhu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| level | `LogLevel` | ano | Úroveň logování: `'debug'`, `'info'`, `'warn'`, nebo `'error'` |
| message | `string` | ano | Zpráva k zalogování (podporuje `${}` interpolaci) |

**Návratová hodnota:** `ActionBuilder` — Builder pro použití s `RuleBuilder.then()`

**Validační chyby:**

- `"log() level must be a non-empty string"`
- `"log() level must be one of: debug, info, warn, error — got \"...\""`
- `"log() message must be a string"`

**Příklad:**

```typescript
Rule.create('audit-order')
  .when(onEvent('order.created'))
  .then(log('info', 'Processing order ${event.orderId}'))
  .build();

Rule.create('error-handler')
  .when(onEvent('payment.failed'))
  .then(log('error', 'Payment failed for customer ${event.customerId}'))
  .build();
```

---

### Zkrácené metody

Pomocné metody pro běžné úrovně logování:

```typescript
log.debug(message: string): ActionBuilder
log.info(message: string): ActionBuilder
log.warn(message: string): ActionBuilder
log.error(message: string): ActionBuilder
```

**Příklad:**

```typescript
Rule.create('debug-rule')
  .when(onEvent('debug.trigger'))
  .then(log.debug('Rule triggered at ${context.timestamp}'))
  .build();

Rule.create('warn-low-stock')
  .when(onFact('inventory:*:stock'))
  .if(fact('${trigger.key}').lt(10))
  .then(log.warn('Low stock warning for ${trigger.key}'))
  .build();
```

---

## Podmíněné akce

### conditional()

```typescript
function conditional(condition: ConditionInput): ConditionalBuilder
```

Vytvoří podmíněnou (if/then/else) akci pro použití v seznamu akcí pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `ConditionInput` | ano | Počáteční podmínka (builder nebo raw objekt) |

**Návratová hodnota:** `ConditionalBuilder` — Fluent builder pro konfiguraci větví

**Příklad:**

```typescript
Rule.create('order-routing')
  .when(onEvent('order.created'))
  .then(conditional(event('amount').gte(100))
    .then(emit('premium.process', { orderId: ref('event.orderId') }))
    .else(emit('standard.process', { orderId: ref('event.orderId') }))
  )
  .build();
```

---

### ConditionalBuilder

Fluent builder pro podmíněné (if/then/else) akce.

#### and()

```typescript
and(condition: ConditionInput): ConditionalBuilder
```

Přidá další podmínku s AND sémantikou — všechny podmínky musí být splněny pro vykonání větve `then`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `ConditionInput` | ano | Condition builder nebo raw condition objekt |

**Návratová hodnota:** `this` pro řetězení

**Příklad:**

```typescript
conditional(event('amount').gte(100))
  .and(fact('customer:vip').eq(true))
  .then(emit('vip.premium'))
```

---

#### then()

```typescript
then(action: ActionInput): ConditionalBuilder
```

Přidá akci do větve `then` (vykonáno když jsou všechny podmínky splněny). Může být voláno vícekrát pro přidání více akcí.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| action | `ActionInput` | ano | Action builder nebo raw action objekt |

**Návratová hodnota:** `this` pro řetězení

---

#### else()

```typescript
else(action: ActionInput): ConditionalBuilder
```

Přidá akci do větve `else` (vykonáno když podmínky nejsou splněny). Může být voláno vícekrát.

Nelze použít po `elseIf()` — else-if řetězec již definuje else větev.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| action | `ActionInput` | ano | Action builder nebo raw action objekt |

**Návratová hodnota:** `this` pro řetězení

**Vyhazuje:** `DslValidationError` pokud voláno po `.elseIf()`

---

#### elseIf()

```typescript
elseIf(condition: ConditionInput): ConditionalBuilder
```

Zahájí else-if řetězec vnořením nové podmíněné akce do aktuální `else` větve. Vrací vnitřní builder, takže následující volání `.then()` / `.else()` / `.elseIf()` se aplikují na něj.

Nelze použít po `else()` — explicitní else akce již obsazují else větev.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `ConditionInput` | ano | Podmínka pro vnořenou větev |

**Návratová hodnota:** Vnitřní `ConditionalBuilder` pro další řetězení

**Vyhazuje:** `DslValidationError` pokud voláno po `.else()`

**Příklad:**

```typescript
conditional(event('tier').eq('gold'))
  .then(emit('gold.process'))
  .elseIf(event('tier').eq('silver'))
  .then(emit('silver.process'))
  .else(emit('default.process'))
```

---

## Dynamické reference

Použijte `ref()` pro vytvoření dynamických referencí vyhodnocených za běhu. Hodnoty v payloadech akcí mohou odkazovat na data událostí, fakta nebo kontextové proměnné.

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
emit('order.processed', {
  orderId: ref('event.orderId'),
  customerName: ref('fact.customer:${event.customerId}:name'),
  processedBy: ref('context.currentUser')
})
```

---

### isRef()

```typescript
function isRef(value: unknown): value is Ref
```

Type-guard kontrolující zda je hodnota `Ref`.

**Příklad:**

```typescript
const maybeRef = someValue;
if (isRef(maybeRef)) {
  console.log('Reference path:', maybeRef.ref);
}
```

---

## Typy

### ActionBuilder

```typescript
interface ActionBuilder {
  build(): RuleAction;
}
```

Základní interface implementovaný všemi action buildery.

### SetTimerOptions

```typescript
interface SetTimerOptions {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

Konfigurační objekt pro `setTimer()` při použití options formy.

| Pole | Typ | Povinný | Popis |
|------|-----|---------|-------|
| name | `string` | ano | Unikátní název časovače |
| duration | `string \| number` | ano | Doba do vypršení (řetězec nebo milisekundy) |
| onExpire.topic | `string` | ano | Topic události emitované při vypršení |
| onExpire.data | `Record<string, unknown>` | ne | Volitelný payload události |
| repeat.interval | `string \| number` | ne | Interval mezi opakováními |
| repeat.maxCount | `number` | ne | Maximální počet opakování |

### LogLevel

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

Platné úrovně logování pro akci `log()`.

### ConditionInput

```typescript
type ConditionInput = ConditionBuilder | RuleCondition;
```

Vstup přijímaný tam, kde je očekávána podmínka — buď fluent builder nebo raw condition objekt.

### ActionInput

```typescript
type ActionInput = ActionBuilder | RuleAction;
```

Vstup přijímaný tam, kde je očekávána akce — buď fluent builder nebo raw action objekt.

### RuleAction

```typescript
type RuleAction =
  | { type: 'emit_event'; topic: string; data?: Record<string, unknown> }
  | { type: 'set_fact'; key: string; value: unknown }
  | { type: 'delete_fact'; key: string }
  | { type: 'set_timer'; timer: TimerConfig }
  | { type: 'cancel_timer'; name: string }
  | { type: 'call_service'; service: string; method: string; args?: unknown[] }
  | { type: 'log'; level: LogLevel; message: string }
  | { type: 'conditional'; conditions: RuleCondition[]; then: RuleAction[]; else?: RuleAction[] };
```

Diskriminovaná unie všech typů akcí používaných rule enginem.

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

---

## Viz také

- [DSL Builder](./09-dsl-builder.md) — API builderu pravidel
- [DSL Triggers](./10-dsl-triggers.md) — Trigger buildery
- [DSL Conditions](./11-dsl-conditions.md) — Condition buildery
- [Action Executor](./08-action-executor.md) — Interní engine vykonání akcí
- [Timer Manager](./04-timer-manager.md) — Správa časovačů
