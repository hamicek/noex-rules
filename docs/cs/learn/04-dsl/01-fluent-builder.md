# Fluent Builder API

Fluent builder je primární způsob psaní pravidel v TypeScriptu. Poskytuje plné automatické doplňování, kontrolu typů při kompilaci a čitelnou řetězenou syntaxi, která zrcadlí způsob, jakým o pravidlech přemýšlíte: "když se tohle stane, pokud platí tyto podmínky, pak udělej toto."

## Co se naučíte

- Jak vytvářet pravidla pomocí `Rule.create()` a řetězení metod
- Trigger helpery: `onEvent()`, `onFact()`, `onTimer()`
- Podmínkové helpery: `event()`, `fact()`, `context()`, `lookup()` s porovnávacími operátory
- Akční helpery: `emit()`, `setFact()`, `deleteFact()`, `setTimer()`, `cancelTimer()`, `callService()`, `log()`
- Funkci `ref()` pro dynamické reference na hodnoty
- Jak se builder porovnává se zápisem pomocí surových objektů

## Proč builder?

Uvažte toto pravidlo zapsané jako prostý objekt:

```typescript
engine.registerRule({
  id: 'large-order-alert',
  name: 'Large Order Alert',
  priority: 100,
  enabled: true,
  tags: ['orders', 'alerts'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    {
      source: { type: 'event', field: 'total' },
      operator: 'gte',
      value: 1000,
    },
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'alert.large_order',
      data: {
        orderId: { ref: 'event.orderId' },
        total: { ref: 'event.total' },
      },
    },
    {
      type: 'log',
      level: 'info',
      message: 'Large order ${event.orderId} detected (${event.total})',
    },
  ],
});
```

Totéž pravidlo s fluent builderem:

```typescript
import {
  Rule, onEvent, event,
  emit, log, ref,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('large-order-alert')
    .name('Large Order Alert')
    .priority(100)
    .tags('orders', 'alerts')
    .when(onEvent('order.created'))
    .if(event('total').gte(1000))
    .then(emit('alert.large_order', {
      orderId: ref('event.orderId'),
      total: ref('event.total'),
    }))
    .also(log.info('Large order ${event.orderId} detected (${event.total})'))
    .build()
);
```

Verze s builderem je kratší, čitelnější a zachytí chyby při kompilaci — překlep `onEvnt` je TypeScript chyba, zatímco překlep `'evnt'` v objektovém literálu projde bez povšimnutí.

## Struktura builderu

Každý řetězec builderu sleduje stejný vzor:

```text
  Rule.create(id)          ─── povinný vstupní bod
      │
      ├── .name()          ─── metadata (volitelné)
      ├── .description()
      ├── .priority()
      ├── .enabled()
      ├── .tags()
      ├── .group()
      ├── .lookup()
      │
      ├── .when()          ─── trigger (povinný, právě jeden)
      │
      ├── .if()            ─── podmínky (volitelné, nula nebo více)
      ├── .and()
      │
      ├── .then()          ─── akce (povinné, alespoň jedna)
      ├── .also()
      │
      └── .build()         ─── produkuje výsledný RuleInput
```

Všechny metody kromě `.build()` vrací `this`, takže je lze řetězit v libovolném pořadí. Doporučené pořadí je ale: metadata → trigger → podmínky → akce → build. Čte se přirozeně a odpovídá toku vyhodnocování enginu.

## Metadata metody

```typescript
Rule.create('order-workflow')       // povinné: unikátní ID pravidla
  .name('Order Processing')         // lidsky čitelný název (výchozí je ID)
  .description('Handles new orders') // volný textový popis
  .priority(100)                    // pořadí vyhodnocování (vyšší = dříve)
  .enabled(true)                    // zapnutí/vypnutí (výchozí: true)
  .tags('orders', 'workflow')       // kategorizační tagy (aditivní, lze volat vícekrát)
  .group('order-rules')             // přiřazení do skupiny pravidel
```

### Tagy

Tagy jsou aditivní — vícenásobné volání `.tags()` přidává místo nahrazování:

```typescript
Rule.create('my-rule')
  .tags('orders')
  .tags('vip', 'priority')
  // výsledné tagy: ['orders', 'vip', 'priority']
```

### Priorita

Pravidla s vyšší prioritou se vyhodnocují dříve. Když více pravidel odpovídá stejné události, engine je vyhodnocuje v sestupném pořadí priority:

```typescript
// Vyhodnotí se před pravidly s prioritou < 200
Rule.create('fraud-check').priority(200)

// Vyhodnotí se po fraud-check
Rule.create('order-confirm').priority(50)
```

## Trigger helpery

Metoda `.when()` přijímá trigger helper nebo surový trigger objekt.

### onEvent(topic)

Spouští se, když je emitována událost s odpovídajícím topicem. Podporuje zástupné znaky:

```typescript
.when(onEvent('order.created'))      // přesná shoda
.when(onEvent('order.*'))            // zástupný znak: order.created, order.updated, atd.
```

### onFact(pattern)

Spouští se při vytvoření nebo aktualizaci faktu odpovídajícího vzoru:

```typescript
.when(onFact('customer:*:tier'))     // jakákoliv změna zákaznické úrovně
.when(onFact('config:mode'))         // konkrétní klíč faktu
```

### onTimer(name)

Spouští se při vypršení pojmenovaného časovače:

```typescript
.when(onTimer('payment-timeout'))    // konkrétní název časovače
```

### Temporální vzory

Pro komplexní zpracování událostí použijte buildery temporálních triggerů (podrobně v Části 5):

```typescript
import { sequence, absence, count, aggregate } from '@hamicek/noex-rules/dsl';

// Uspořádané události v časovém okně
.when(sequence()
  .event('order.created')
  .event('payment.received')
  .within('15m')
  .groupBy('orderId')
)

// Chybějící očekávaná událost
.when(absence()
  .after('order.created')
  .expected('payment.received')
  .within('30m')
  .groupBy('orderId')
)

// Frekvenční práh
.when(count()
  .event('auth.login_failed')
  .threshold(5)
  .window('5m')
  .groupBy('userId')
  .sliding()
)

// Numerická agregace
.when(aggregate()
  .event('order.paid')
  .field('amount')
  .function('sum')
  .threshold(10000)
  .window('1h')
  .groupBy('region')
)
```

## Podmínkové helpery

Metody `.if()` a `.and()` přidávají podmínky. Každá podmínka začíná zdrojovým helperem a řetězí porovnávací operátor.

### Zdrojové helpery

| Helper | Čte z | Příklad |
|--------|-------|---------|
| `event(field)` | Data spouštěcí události | `event('total')`, `event('customer.tier')` |
| `fact(pattern)` | Hodnota z úložiště faktů | `fact('customer:\${event.customerId}:tier')` |
| `context(key)` | Kontextová proměnná enginu | `context('environment')` |
| `lookup(name)` | Výsledek datového požadavku | `lookup('credit.score')` |

### Porovnávací operátory

Každý zdrojový helper vrací `SourceExpr` s těmito řetězitelnými operátory:

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `.eq(value)` | Rovná se | `event('status').eq('active')` |
| `.neq(value)` | Nerovná se | `event('type').neq('test')` |
| `.gt(value)` | Větší než | `event('amount').gt(0)` |
| `.gte(value)` | Větší nebo rovno | `event('total').gte(100)` |
| `.lt(value)` | Menší než | `event('quantity').lt(1000)` |
| `.lte(value)` | Menší nebo rovno | `event('age').lte(18)` |
| `.in(values)` | Hodnota v poli | `event('country').in(['US', 'CA', 'GB'])` |
| `.notIn(values)` | Hodnota není v poli | `event('status').notIn(['cancelled', 'refunded'])` |
| `.contains(value)` | Řetězec/pole obsahuje | `event('tags').contains('vip')` |
| `.notContains(value)` | Neobsahuje | `event('name').notContains('test')` |
| `.matches(pattern)` | Shoda s regulárním výrazem | `event('email').matches(/^.+@company\.com$/)` |
| `.exists()` | Hodnota je definována | `event('couponCode').exists()` |
| `.notExists()` | Hodnota je undefined/null | `event('deletedAt').notExists()` |

### Více podmínek

Podmínky se kombinují logickým AND. Použijte `.if()` pro první, `.and()` pro další:

```typescript
Rule.create('vip-large-order')
  .when(onEvent('order.created'))
  .if(event('total').gte(500))
  .and(event('customer.tier').eq('vip'))
  .and(event('currency').in(['USD', 'EUR']))
  .then(emit('order.priority'))
  .build();
```

### Podmínky z různých zdrojů

Podmínky mohou v jednom pravidle odkazovat na různé zdroje:

```typescript
Rule.create('credit-check')
  .when(onEvent('order.created'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')],
    cache: { ttl: '5m' },
  })
  .if(event('total').gte(1000))
  .and(lookup('credit').gte(700))
  .then(emit('order.approved'))
  .build();
```

### Porovnání s referencemi

Hodnoty operátorů mohou být `ref()` reference místo literálů, což umožňuje dynamická porovnání:

```typescript
.if(event('requestedQuantity').lte(ref('fact.inventory:${event.productId}:stock')))
```

## Akční helpery

Metody `.then()` a `.also()` přidávají akce. `.then()` přidává první akci, `.also()` přidává další. Funkčně jsou identické — rozdíl je čistě pro čitelnost.

### emit(topic, data?)

Emituje novou událost:

```typescript
.then(emit('order.confirmed', {
  orderId: ref('event.orderId'),
  total: ref('event.total'),
  confirmedAt: new Date().toISOString(),
}))
```

Hodnoty v datech mohou být literály nebo `ref()` reference. Topic podporuje `${}` interpolaci.

### setFact(key, value)

Vytvoří nebo aktualizuje fakt:

```typescript
.then(setFact('order:${event.orderId}:status', 'confirmed'))
.also(setFact('order:${event.orderId}:total', ref('event.total')))
```

Klíč podporuje `${}` interpolaci. Hodnota může být literál nebo `ref()`.

### deleteFact(key)

Odstraní fakt:

```typescript
.then(deleteFact('order:${event.orderId}:pending'))
```

### setTimer(config)

Naplánuje časovač. Dvě možnosti syntaxe:

**Objektová konfigurace:**

```typescript
.then(setTimer({
  name: 'payment-timeout:${event.orderId}',
  duration: '15m',
  onExpire: {
    topic: 'order.payment_timeout',
    data: { orderId: ref('event.orderId') },
  },
}))
```

**Fluent konfigurace:**

```typescript
.then(setTimer('payment-timeout:${event.orderId}')
  .after('15m')
  .emit('order.payment_timeout', { orderId: ref('event.orderId') })
)
```

Oba produkují stejný výsledek. Fluent syntaxe je kratší pro jednoduché časovače.

**Opakující se časovače:**

```typescript
.then(setTimer({
  name: 'health-check',
  duration: '1m',
  onExpire: { topic: 'system.health_check' },
  repeat: { interval: '1m', maxCount: 10 },
}))
```

### cancelTimer(name)

Zruší čekající časovač:

```typescript
.then(cancelTimer('payment-timeout:${event.orderId}'))
```

### callService(service)

Zavolá registrovanou externí službu. Dvě možnosti syntaxe:

**Fluent:**

```typescript
.then(callService('emailService')
  .method('send')
  .args(ref('event.email'), 'Order Confirmed')
)
```

**Přímá:**

```typescript
.then(callService('emailService', 'send', [
  ref('event.email'),
  'Order Confirmed',
]))
```

### log(level, message) / log.level(message)

Vypíše logovací zprávu:

```typescript
.then(log('info', 'Order ${event.orderId} confirmed'))

// Zkratkové helpery:
.then(log.debug('Evaluating rule for ${event.orderId}'))
.then(log.info('Order confirmed'))
.then(log.warn('Unusual amount: ${event.total}'))
.then(log.error('Processing failed for ${event.orderId}'))
```

### conditional(condition)

Vykoná různé akce na základě runtime podmínky:

```typescript
import { conditional } from '@hamicek/noex-rules/dsl';

.then(conditional(event('total').gte(1000))
  .then(emit('order.premium'))
  .else(emit('order.standard'))
)
```

Pro vícevětvou logiku lze řetězit `.elseIf()`:

```typescript
.then(conditional(event('total').gte(1000))
  .then(emit('order.premium'))
  .elseIf(event('total').gte(100))
  .then(emit('order.standard'))
  .else(emit('order.basic'))
)
```

## Funkce ref()

`ref()` vytváří runtime referenci na dynamickou hodnotu. Produkuje objekt `{ ref: 'path' }`, který engine rozloží při vykonání akce.

```typescript
import { ref } from '@hamicek/noex-rules/dsl';

ref('event.orderId')           // pole orderId spouštěcí události
ref('event.customer.name')     // vnořený přístup k poli
ref('fact.config:mode')        // aktuální hodnota faktu
ref('matched.0.data.amount')   // první zachycená událost v temporálním vzoru
ref('context.environment')     // kontextová proměnná enginu
ref('lookup.credit')           // výsledek datového požadavku
```

### ref() vs interpolace řetězců

Oba vkládají dynamické hodnoty, ale slouží různým účelům:

| Vlastnost | `ref('event.total')` | `'${event.total}'` |
|-----------|---------------------|---------------------|
| Zachovává typ | Ano (číslo zůstane číslem) | Ne (vždy řetězec) |
| Použití v | hodnotách `data`, polích `value` | řetězcích `topic`, `key`, `message` |
| Syntaxe | objekt `{ ref: 'path' }` | inline v řetězci |

```typescript
// ref() — total zůstane jako číslo
emit('order.confirmed', { total: ref('event.total') })

// interpolace — total se stane řetězcem uvnitř topicu
emit('order.tier_${event.tier}')
```

## Datové požadavky (lookups)

Lookups načtou externí data před vyhodnocením podmínek, což umožňuje podmínky na hodnotách, které nejsou v události ani v úložišti faktů:

```typescript
Rule.create('credit-gate')
  .when(onEvent('loan.requested'))
  .lookup('credit', {
    service: 'creditService',
    method: 'getScore',
    args: [ref('event.customerId')],
    cache: { ttl: '5m' },
  })
  .if(lookup('credit').gte(700))
  .then(emit('loan.approved'))
  .build();
```

### Konfigurace lookupu

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `service` | `string` | Název registrované služby |
| `method` | `string` | Metoda k zavolání na službě |
| `args` | `unknown[]` | Argumenty (mohou používat `ref()`) |
| `cache.ttl` | `string \| number` | Doba platnosti cache (např. `'5m'`) |
| `onError` | `'skip' \| 'fail'` | Co dělat při selhání lookupu |

Když je `onError` `'skip'`, pravidlo se tiše přeskočí při selhání lookupu. Při `'fail'` vyhodnocení pravidla vyhodí chybu.

## Kompletní funkční příklad

E-commerce objednávkový pipeline s pěti pravidly demonstrujícími celou škálu funkcí builderu:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, onTimer,
  event, fact, lookup,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log,
  ref,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({
    name: 'order-pipeline',
    services: {
      emailService: {
        send: async (to: string, subject: string, body: string) => {
          console.log(`Email pro ${to}: ${subject}`);
        },
      },
    },
  });

  // Pravidlo 1: Inicializace objednávky a spuštění platebního časovače
  engine.registerRule(
    Rule.create('order-init')
      .name('Initialize Order')
      .priority(200)
      .tags('orders', 'workflow')
      .when(onEvent('order.created'))
      .if(event('total').gt(0))
      .then(setFact('order:${event.orderId}:status', 'pending'))
      .also(setFact('order:${event.orderId}:total', ref('event.total')))
      .also(setTimer({
        name: 'payment-timeout:${event.orderId}',
        duration: '15m',
        onExpire: {
          topic: 'order.payment_timeout',
          data: { orderId: ref('event.orderId') },
        },
      }))
      .also(log.info('Order ${event.orderId} initialized'))
      .build()
  );

  // Pravidlo 2: Zpracování platby — zrušení časovače, aktualizace stavu, notifikace
  engine.registerRule(
    Rule.create('payment-received')
      .name('Process Payment')
      .priority(150)
      .tags('orders', 'payments')
      .when(onEvent('payment.confirmed'))
      .if(fact('order:${event.orderId}:status').eq('pending'))
      .then(cancelTimer('payment-timeout:${event.orderId}'))
      .also(setFact('order:${event.orderId}:status', 'paid'))
      .also(emit('order.paid', {
        orderId: ref('event.orderId'),
        amount: ref('event.amount'),
      }))
      .also(log.info('Payment received for order ${event.orderId}'))
      .build()
  );

  // Pravidlo 3: Zpracování timeoutu platby — zrušení objednávky
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout')
      .priority(100)
      .tags('orders', 'timeout')
      .when(onEvent('order.payment_timeout'))
      .if(fact('order:${event.orderId}:status').eq('pending'))
      .then(setFact('order:${event.orderId}:status', 'cancelled'))
      .also(deleteFact('order:${event.orderId}:total'))
      .also(log.warn('Order ${event.orderId} cancelled due to payment timeout'))
      .build()
  );

  // Pravidlo 4: Odeslání potvrzovacího emailu po úspěšné platbě
  engine.registerRule(
    Rule.create('send-confirmation')
      .name('Send Confirmation Email')
      .priority(50)
      .tags('orders', 'notifications')
      .when(onEvent('order.paid'))
      .then(callService('emailService')
        .method('send')
        .args(ref('event.email'), 'Order Confirmed', 'Your order has been paid.')
      )
      .build()
  );

  // Pravidlo 5: Log všech přechodů stavu objednávek
  engine.registerRule(
    Rule.create('status-audit')
      .name('Order Status Audit')
      .priority(10)
      .tags('orders', 'audit')
      .when(onFact('order:*:status'))
      .then(log.info('Status change: ${event.key} → ${event.value}'))
      .build()
  );

  // --- Spuštění pipeline ---
  console.log('--- Zadání objednávky ---');
  await engine.emit('order.created', {
    orderId: 'ORD-100',
    total: 249.99,
    email: 'customer@example.com',
  });

  console.log('Status:', engine.getFact('order:ORD-100:status'));
  // "pending"

  console.log('\n--- Potvrzení platby ---');
  await engine.emit('payment.confirmed', {
    orderId: 'ORD-100',
    amount: 249.99,
    email: 'customer@example.com',
  });

  console.log('Status:', engine.getFact('order:ORD-100:status'));
  // "paid"

  await engine.stop();
}

main();
```

### Průběh vykonání

```text
  order.created
      │
      ▼
  Pravidlo 1 (order-init)
  ├── setFact  order:ORD-100:status = "pending"
  ├── setFact  order:ORD-100:total = 249.99
  ├── setTimer payment-timeout:ORD-100 (15m)
  └── log      "Order ORD-100 initialized"
      │
      ├──────── změna faktu spustí Pravidlo 5 (status-audit)
      │         └── log "Status change: order:ORD-100:status → pending"
      │
      ▼
  payment.confirmed
      │
      ▼
  Pravidlo 2 (payment-received)
  ├── cancelTimer payment-timeout:ORD-100
  ├── setFact     order:ORD-100:status = "paid"
  ├── emit        order.paid
  └── log         "Payment received for order ORD-100"
      │
      ├──────── změna faktu spustí Pravidlo 5
      │         └── log "Status change: order:ORD-100:status → paid"
      │
      ├──────── order.paid spustí Pravidlo 4 (send-confirmation)
      │         └── callService emailService.send(...)
      │
      ▼
  Pipeline dokončen
```

## Cvičení

Převeďte následující tři pravidla ze surových objektů do fluent builder syntaxe. Pravidla implementují systém věrnostních úrovní zákazníků:

1. Když se vyvolá `purchase.completed` a nákup `amount` >= 50, nastavte fakt `loyalty:${customerId}:points` na hodnotu `points` z události a emitujte `loyalty.updated`.
2. Když se vyvolá `loyalty.updated` a `fakt loyalty:${customerId}:points` >= 1000, nastavte fakt `loyalty:${customerId}:tier` na `'gold'` a zalogujte informační zprávu.
3. Když se změní fakt odpovídající `loyalty:*:tier`, emitujte `notification.tier_change` s daty zákazníka.

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, onEvent, onFact,
  event, fact,
  emit, setFact, log, ref,
} from '@hamicek/noex-rules/dsl';

// Pravidlo 1: Získání bodů
const earnPoints = Rule.create('earn-points')
  .name('Earn Loyalty Points')
  .priority(100)
  .tags('loyalty')
  .when(onEvent('purchase.completed'))
  .if(event('amount').gte(50))
  .then(setFact('loyalty:${event.customerId}:points', ref('event.points')))
  .also(emit('loyalty.updated', {
    customerId: ref('event.customerId'),
    points: ref('event.points'),
  }))
  .build();

// Pravidlo 2: Upgrade na zlatou úroveň
const goldUpgrade = Rule.create('gold-upgrade')
  .name('Gold Tier Upgrade')
  .priority(80)
  .tags('loyalty', 'tiers')
  .when(onEvent('loyalty.updated'))
  .if(fact('loyalty:${event.customerId}:points').gte(1000))
  .then(setFact('loyalty:${event.customerId}:tier', 'gold'))
  .also(log.info('Customer ${event.customerId} upgraded to gold'))
  .build();

// Pravidlo 3: Notifikace o změně úrovně
const tierNotify = Rule.create('tier-notify')
  .name('Tier Change Notification')
  .priority(50)
  .tags('loyalty', 'notifications')
  .when(onFact('loyalty:*:tier'))
  .then(emit('notification.tier_change', {
    factKey: ref('trigger.fact.key'),
    newTier: ref('trigger.fact.value'),
  }))
  .build();

// Registrace všech pravidel
[earnPoints, goldUpgrade, tierNotify].forEach(r => engine.registerRule(r));
```

Verze s builderem je zhruba o 40 % kratší než ekvivalent se surovými objekty a zachytí strukturální chyby (chybějící trigger, žádné akce) při buildování prostřednictvím `DslValidationError`.

</details>

## Shrnutí

- `Rule.create(id)` zahájí řetězec builderu; `.build()` produkuje validovaný `RuleInput`
- Metadata metody (`.name()`, `.priority()`, `.tags()`, `.group()`, `.enabled()`, `.description()`) jsou volitelné a řetězitelné
- Trigger helpery `onEvent()`, `onFact()`, `onTimer()` nahrazují surové trigger objekty
- Temporální triggery (`sequence()`, `absence()`, `count()`, `aggregate()`) zpracovávají vzory komplexního zpracování událostí
- Podmínkové helpery (`event()`, `fact()`, `context()`, `lookup()`) poskytují typově bezpečné operátory: `.eq()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`, `.in()`, `.notIn()`, `.contains()`, `.notContains()`, `.matches()`, `.exists()`, `.notExists()`
- `.if()` nastavuje první podmínku, `.and()` přidává další (všechny podmínky používají logiku AND)
- Akční helpery `emit()`, `setFact()`, `deleteFact()`, `setTimer()`, `cancelTimer()`, `callService()`, `log()` nahrazují surové akční objekty
- `.then()` nastavuje první akci, `.also()` přidává další
- `ref('path')` vytváří typovanou runtime referenci; `${}` interpolace funguje v řetězcových polích (topics, keys, messages)
- Metoda `.lookup()` deklaruje datové požadavky načtené před vyhodnocením podmínek
- `conditional()` umožňuje if/then/else větvení v rámci akcí
- Builder vyhodí `DslValidationError` při neplatném vstupu (chybějící ID, trigger nebo akce)

---

Další: [Tagged šablonové literály](./02-tagged-sablony.md)
