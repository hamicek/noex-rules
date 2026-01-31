# Sekvence a absence

Sekvence a absence jsou dva **na pořadí citlivé** CEP vzory. Sekvence detekuje, že události přišly v určitém pořadí v časovém okně. Absence detekuje, že očekávaná událost *nepřišla* po spouštěcí události. Společně pokrývají nejčastější temporální business logiku: vícekrokové workflow a detekci timeoutu.

## Co se naučíte

- Jak definovat sekvenční vzory s `sequence()`
- Jak strict režim ovlivňuje mezi-události
- Jak používat `groupBy` a `as` (pojmenované události) v sekvencích
- Jak definovat vzory absence s `absence()`
- Kompletní životní cyklus instancí sekvence a absence
- Kompletní příklady: platební tok (sekvence) a detekce timeoutu (absence)

## Sekvenční vzory

Sekvenční vzor matchne, když události přijdou **v určitém pořadí** v časovém okně. Nejjednodušší příklad: "objednávka vytvořena, pak platba přijata, během 5 minut."

### Základní sekvence

```typescript
import {
  Rule, emit, ref, sequence,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('order-payment-flow')
    .name('Order Payment Flow')
    .when(sequence()
      .event('order.created')
      .event('payment.received')
      .within('5m')
    )
    .then(emit('order.confirmed', {
      orderId: ref('trigger.events.0.orderId'),
    }))
    .build()
);
```

Když se spustí `order.created`, matcher začne sledovat. Pokud se `payment.received` spustí během 5 minut, sekvence se dokončí a pravidlo se aktivuje. Pokud 5 minut uplyne bez `payment.received`, instance tiše expiruje.

### GroupBy

Bez `groupBy` matcher zachází se všemi událostmi jako s jedním globálním proudem. V praxi téměř vždy chcete grupovat podle korelačního pole — aby platba objednávky A náhodou nedokončila sekvenci objednávky B:

```typescript
sequence()
  .event('order.created')
  .event('payment.received')
  .within('5m')
  .groupBy('orderId')
```

Každá unikátní hodnota `orderId` získá vlastní nezávislou instanci sekvence. Objednávky `ORD-1` a `ORD-2` jsou sledovány odděleně.

### Strict režim

Ve výchozím nastavení (`strict: false`) jsou mezi-události, které neodpovídají dalšímu očekávanému kroku, **ignorovány**. Matcher trpělivě čeká na správnou událost:

```text
  strict: false (výchozí)
  ─────────────────────────────────────────────────
  order.created ──→ [inventory.checked] ──→ payment.received  ✓ MATCH
                     (ignorováno — není další v sekvenci)

  strict: true
  ─────────────────────────────────────────────────
  order.created ──→ [inventory.checked] ──→ payment.received  ✗ ZRUŠENO
                     (nesouvisející událost ruší sekvenci)
```

Použijte strict režim, když mezi-události signalizují, že očekávaný tok byl narušen:

```typescript
sequence()
  .event('order.created')
  .event('payment.received')
  .within('5m')
  .groupBy('orderId')
  .strict(true)
```

### Filtry událostí

Každá událost v sekvenci může specifikovat filtr pro matchování pouze událostí s konkrétními daty:

```typescript
sequence()
  .event('order.created', { type: 'premium' })
  .event('payment.received', { method: 'credit_card' })
  .within('10m')
  .groupBy('orderId')
```

Tato sekvence začíná pouze u prémiových objednávek a dokončí se pouze s platbou kartou.

### Pojmenované události (as)

Použijte parametr `as` pro pojmenování matchnutých událostí, což usnadní referencování v akcích:

```typescript
sequence()
  .event('order.created', undefined, 'order')
  .event('payment.received', undefined, 'payment')
  .within('5m')
  .groupBy('orderId')
```

Tři argumenty `.event()` jsou: `topic`, `filter`, `as`.

### Vícekrokové sekvence

Sekvence mohou mít libovolný počet kroků:

```typescript
engine.registerRule(
  Rule.create('full-order-lifecycle')
    .name('Complete Order Lifecycle')
    .when(sequence()
      .event('order.created')
      .event('payment.authorized')
      .event('payment.captured')
      .event('shipment.dispatched')
      .within('48h')
      .groupBy('orderId')
    )
    .then(emit('order.fulfilled'))
    .build()
);
```

Každý krok musí matchnout v pořadí. Instance postupuje o jeden krok naráz a celkové časové okno platí od první události po poslední.

### Rozhraní sekvence

Surový typ `SequencePattern` pro referenci:

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];     // Uspořádaný seznam očekávaných událostí
  within: string | number;    // Časové okno: "5m", "1h", nebo milisekundy
  groupBy?: string;           // Grupování podle pole (např. "orderId")
  strict?: boolean;           // Odmítne mezi-události (výchozí: false)
}

interface EventMatcher {
  topic: string;                     // Vzor topicu: "order.*", "payment.received"
  filter?: Record<string, unknown>;  // Filtr dat: { status: 'failed' }
  as?: string;                       // Alias pro referencování v akcích
}
```

## Vzory absence

Vzor absence se spustí, když očekávaná událost **nepřijde** v časovém okně po spouštěcí události. Je to opak sekvence — detekujete to, co se *nestalo*.

### Základní absence

```typescript
import {
  Rule, emit, setFact, absence,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('payment-timeout')
    .name('Payment Timeout')
    .when(absence()
      .after('order.created')
      .expected('payment.received')
      .within('15m')
      .groupBy('orderId')
    )
    .then(setFact('order:${trigger.after.orderId}:status', 'cancelled'))
    .also(emit('order.cancelled', { reason: 'payment_timeout' }))
    .build()
);
```

Když se spustí `order.created`, matcher nastaví 15-minutový časovač. Pokud `payment.received` přijde se stejným `orderId` před vypršením časovače, instance je zrušena (úspěch — zákazník zaplatil). Pokud časovač vyprší bez `payment.received`, vzor absence matchne a pravidlo se aktivuje.

### Životní cyklus

```text
  order.created (orderId: "ORD-1")
       │
       ▼
  AbsenceMatcher vytvoří instanci
  Stav: WAITING
  Časovač: 15 minut
       │
       ├──── payment.received (orderId: "ORD-1") přijde během 15m
       │     └── Instance ZRUŠENA (očekávaná událost přišla, žádná akce)
       │
       └──── 15 minut uplyne, žádná payment.received pro "ORD-1"
             └── Instance DOKONČENA (absence detekována)
                 └── Pravidlo se aktivuje → nastavení faktu "cancelled", emise události
```

### Filtry na absenci

Jak `after`, tak `expected` podporují filtry:

```typescript
absence()
  .after('order.created', { priority: 'high' })
  .expected('payment.received')
  .within('5m')
  .groupBy('orderId')
```

Toto sleduje pouze objednávky s vysokou prioritou. Běžné objednávky nespustí časovač absence.

### Rozhraní absence

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;       // Spouštěcí událost
  expected: EventMatcher;    // Očekávaná událost, která by měla následovat
  within: string | number;   // Časové okno
  groupBy?: string;          // Grupování podle pole
}
```

## Formáty časových oken

Sekvence i absence přijímají časová okna jako řetězce nebo milisekundy:

| Formát | Význam | Příklad |
|--------|--------|---------|
| `"30s"` | 30 sekund | Krátký timeout |
| `"5m"` | 5 minut | Timeout platby |
| `"1h"` | 1 hodina | Monitoring SLA |
| `"2d"` | 2 dny | Deadline odeslání |
| `"1w"` | 1 týden | Dlouhodobé sledování |
| `30000` | 30 000 ms | Přesné milisekundy |

## Kompletní funkční příklad

E-commerce platební pipeline se sekvenčním i absence vzorem:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  sequence, absence,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'payment-pipeline' });

  // === Sledování úspěšné cesty: objednávka → platba → potvrzení ===
  engine.registerRule(
    Rule.create('order-confirmed')
      .name('Order Confirmed')
      .priority(100)
      .tags('orders', 'payments')
      .when(sequence()
        .event('order.created')
        .event('payment.received')
        .within('15m')
        .groupBy('orderId')
      )
      .then(setFact('order:${trigger.events.0.orderId}:status', 'confirmed'))
      .also(emit('order.confirmed', {
        orderId: ref('trigger.events.0.orderId'),
        amount: ref('trigger.events.1.amount'),
      }))
      .also(log('info', 'Objednávka potvrzena: ${trigger.events.0.orderId}'))
      .build()
  );

  // === Detekce timeoutu platby ===
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout')
      .priority(200)
      .tags('orders', 'timeouts')
      .when(absence()
        .after('order.created')
        .expected('payment.received')
        .within('15m')
        .groupBy('orderId')
      )
      .then(setFact('order:${trigger.after.orderId}:status', 'cancelled'))
      .also(emit('order.cancelled', {
        orderId: ref('trigger.after.orderId'),
        reason: 'payment_timeout',
      }))
      .also(log('warn', 'Timeout platby: ${trigger.after.orderId}'))
      .build()
  );

  // === Reakce na potvrzené objednávky ===
  engine.registerRule(
    Rule.create('notify-confirmation')
      .name('Send Confirmation')
      .when(onEvent('order.confirmed'))
      .then(log('info', 'Odesílám potvrzení pro ${event.orderId}'))
      .build()
  );

  // === Reakce na zrušené objednávky ===
  engine.registerRule(
    Rule.create('notify-cancellation')
      .name('Send Cancellation Notice')
      .when(onEvent('order.cancelled'))
      .then(log('warn', 'Odesílám oznámení o zrušení pro ${event.orderId}'))
      .build()
  );

  // --- Test: Úspěšná cesta ---
  await engine.emit('order.created', {
    orderId: 'ORD-1',
    customerId: 'C-1',
    total: 299.99,
  });

  // Platba přijde během 15 minut
  await engine.emit('payment.received', {
    orderId: 'ORD-1',
    amount: 299.99,
    method: 'credit_card',
  });

  console.log('ORD-1 status:', engine.getFact('order:ORD-1:status'));
  // "confirmed"

  // --- Test: Cesta s timeoutem ---
  await engine.emit('order.created', {
    orderId: 'ORD-2',
    customerId: 'C-2',
    total: 149.99,
  });

  // Žádná platba pro ORD-2... po 15 minutách:
  // Engine automaticky spustí vzor absence
  // ORD-2 status → "cancelled"

  await engine.stop();
}

main();
```

### Co se děje krok po kroku

1. `order.created (ORD-1)` → sekvenční matcher začne sledovat, absence matcher nastaví 15m časovač
2. `payment.received (ORD-1)` → sekvence se dokončí (spustí `order.confirmed`), absence se zruší (platba přišla)
3. `order.created (ORD-2)` → sekvence začíná, absence nastaví 15m časovač
4. Uplyne 15 minut → absence se spustí pro ORD-2 (žádná platba), sekvence expiruje (nedokončena)

Dvě CEP pravidla spolupracují přirozeně: sekvence zachytí úspěšnou cestu a absence zachytí timeout — obě grupované podle `orderId`, takže si navzájem nepřekážejí.

## Cvičení

Sestavte tok onboardingu uživatelů s oběma vzory:

1. **Registrační sekvence**: Detekujte, když uživatel dokončí celý onboarding: `user.registered` → `email.verified` → `profile.completed`, vše během 24 hodin, grupováno podle `userId`. Po dokončení sekvence nastavte fakt `user:${userId}:onboarded` na `true`.

2. **Timeout ověření**: Pokud `email.verified` nenásleduje `user.registered` během 1 hodiny, emitujte `reminder.send_verification` s emailem uživatele.

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, emit, setFact, ref,
  sequence, absence,
} from '@hamicek/noex-rules/dsl';

// 1. Kompletní onboardingová sekvence
const onboardingComplete = Rule.create('onboarding-complete')
  .name('Onboarding Complete')
  .priority(100)
  .tags('onboarding')
  .when(sequence()
    .event('user.registered')
    .event('email.verified')
    .event('profile.completed')
    .within('24h')
    .groupBy('userId')
  )
  .then(setFact('user:${trigger.events.0.userId}:onboarded', true))
  .also(emit('user.onboarded', {
    userId: ref('trigger.events.0.userId'),
  }))
  .build();

// 2. Timeout ověření emailu
const verificationReminder = Rule.create('verification-reminder')
  .name('Send Verification Reminder')
  .priority(200)
  .tags('onboarding', 'reminders')
  .when(absence()
    .after('user.registered')
    .expected('email.verified')
    .within('1h')
    .groupBy('userId')
  )
  .then(emit('reminder.send_verification', {
    userId: ref('trigger.after.userId'),
    email: ref('trigger.after.email'),
  }))
  .build();

engine.registerRule(onboardingComplete);
engine.registerRule(verificationReminder);
```

Sekvence sleduje kompletní tříkrokový tok. Absence nezávisle sleduje timeout prvního kroku. Obě jsou grupované podle `userId`, takže každý uživatel získá vlastní sledovací instanci.

</details>

## Shrnutí

- **Sekvence** detekuje události přicházející v určitém pořadí v časovém okně
- Použijte `groupBy` pro izolaci instancí podle korelačního klíče (např. `orderId`, `userId`)
- `strict: true` zruší sekvenci, pokud mezi kroky přijdou nesouvisející události
- Filtry událostí zúží, které události matchnou každý krok; `as` pojmenuje matchnuté události pro referenci
- **Absence** detekuje, že očekávaná událost nepřišla po triggeru v časovém okně
- Absence se dokončí (spustí) při timeoutu, zruší se, když očekávaná událost přijde
- Časová okna přijímají čitelné řetězce (`"5m"`, `"1h"`, `"2d"`) nebo milisekundy
- Sekvence a absence spolupracují přirozeně pro vzory úspěšná cesta + timeout

---

Další: [Počet a agregace](./03-pocet-a-agregace.md)
