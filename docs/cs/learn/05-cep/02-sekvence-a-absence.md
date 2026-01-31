# Sekvence a absence

Sekvence a absence jsou dva **na poradi citlive** CEP vzory. Sekvence detekuje, ze udalosti prisly v urcitem poradi v casovem okne. Absence detekuje, ze ocekavana udalost *neprisla* po spousteci udalosti. Spolecne pokryvaji nejcastejsi temporalni business logiku: vicekrokove workflow a detekci timeoutu.

## Co se naucite

- Jak definovat sekvencni vzory s `sequence()`
- Jak strict rezim ovlivnuje mezi-udalosti
- Jak pouzivat `groupBy` a `as` (pojmenovane udalosti) v sekvencich
- Jak definovat vzory absence s `absence()`
- Kompletni zivotni cyklus instanci sekvence a absence
- Kompletni priklady: platebni tok (sekvence) a detekce timeoutu (absence)

## Sekvencni vzory

Sekvencni vzor matchne, kdyz udalosti prijdou **v urcitem poradi** v casovem okne. Nejjednodussi priklad: "objednavka vytvorena, pak platba prijata, behem 5 minut."

### Zakladni sekvence

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

Kdyz se spusti `order.created`, matcher zacne sledovat. Pokud se `payment.received` spusti behem 5 minut, sekvence se dokonci a pravidlo se aktivuje. Pokud 5 minut uplyne bez `payment.received`, instance ticho expiruje.

### GroupBy

Bez `groupBy` matcher zachazi se vsemi udalostmi jako s jednim globalnim proudem. V praxi temer vzdy chcete grupovat podle korelacniho pole — aby platba objednavky A nahodou nedokoncila sekvenci objednavky B:

```typescript
sequence()
  .event('order.created')
  .event('payment.received')
  .within('5m')
  .groupBy('orderId')
```

Kazda unikatni hodnota `orderId` ziska vlastni nezavislou instanci sekvence. Objednavky `ORD-1` a `ORD-2` jsou sledovany oddelene.

### Strict rezim

Ve vychozim nastaveni (`strict: false`) jsou mezi-udalosti, ktere neodpovidaji dalsimu ocekavamenu kroku, **ignorovany**. Matcher trpelive ceka na spravnou udalost:

```text
  strict: false (vychozi)
  ─────────────────────────────────────────────────
  order.created ──→ [inventory.checked] ──→ payment.received  ✓ MATCH
                     (ignorovano — neni dalsi v sekvenci)

  strict: true
  ─────────────────────────────────────────────────
  order.created ──→ [inventory.checked] ──→ payment.received  ✗ ZRUSENO
                     (nesouvisejici udalost rusi sekvenci)
```

Pouzijte strict rezim, kdyz mezi-udalosti signalizuji, ze ocekavany tok byl narusen:

```typescript
sequence()
  .event('order.created')
  .event('payment.received')
  .within('5m')
  .groupBy('orderId')
  .strict(true)
```

### Filtry udalosti

Kazda udalost v sekvenci muze specifikovat filtr pro matchovani pouze udalosti s konkrenimi daty:

```typescript
sequence()
  .event('order.created', { type: 'premium' })
  .event('payment.received', { method: 'credit_card' })
  .within('10m')
  .groupBy('orderId')
```

Tato sekvence zacina pouze u premiovych objednavek a dokonci se pouze s platbou kartou.

### Pojmenovane udalosti (as)

Pouzijte parametr `as` pro pojmenovani matchnutych udalosti, coz usnadni referencovani v akcich:

```typescript
sequence()
  .event('order.created', undefined, 'order')
  .event('payment.received', undefined, 'payment')
  .within('5m')
  .groupBy('orderId')
```

Tri argumenty `.event()` jsou: `topic`, `filter`, `as`.

### Vicekrokove sekvence

Sekvence mohou mit libovolny pocet kroku:

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

Kazdy krok musi matchnout v poradi. Instance postoupuje o jeden krok naraz a celkove casove okno plati od prvni udalosti po posledni.

### Rozhrani sekvence

Surovy typ `SequencePattern` pro referenci:

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];     // Usporadany seznam ocekavanych udalosti
  within: string | number;    // Casove okno: "5m", "1h", nebo milisekundy
  groupBy?: string;           // Grupovani podle pole (napr. "orderId")
  strict?: boolean;           // Odmitne mezi-udalosti (vychozi: false)
}

interface EventMatcher {
  topic: string;                     // Vzor topicu: "order.*", "payment.received"
  filter?: Record<string, unknown>;  // Filtr dat: { status: 'failed' }
  as?: string;                       // Alias pro referencovani v akcich
}
```

## Vzory absence

Vzor absence se spusti, kdyz ocekavana udalost **neprijde** v casovem okne po spousteci udalosti. Je to opak sekvence — detekujete to, co se *nestalo*.

### Zakladni absence

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

Kdyz se spusti `order.created`, matcher nastavi 15-minutovy casovac. Pokud `payment.received` prijde se stejnym `orderId` pred vyprenim casovace, instance je zrusena (uspech — zakaznik zaplatil). Pokud casovac vypri bez `payment.received`, vzor absence matchne a pravidlo se aktivuje.

### Zivotni cyklus

```text
  order.created (orderId: "ORD-1")
       │
       ▼
  AbsenceMatcher vytvori instanci
  Stav: WAITING
  Casovac: 15 minut
       │
       ├──── payment.received (orderId: "ORD-1") prijde behem 15m
       │     └── Instance ZRUSENA (ocekavana udalost prisla, zadna akce)
       │
       └──── 15 minut uplyne, zadna payment.received pro "ORD-1"
             └── Instance DOKONCENA (absence detekovana)
                 └── Pravidlo se aktivuje → nastaveni faktu "cancelled", emise udalosti
```

### Filtry na absenci

Jak `after`, tak `expected` podporuji filtry:

```typescript
absence()
  .after('order.created', { priority: 'high' })
  .expected('payment.received')
  .within('5m')
  .groupBy('orderId')
```

Toto sleduje pouze objednavky s vysokou prioritou. Bezne objednavky nespusti casovac absence.

### Rozhrani absence

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;       // Spousteci udalost
  expected: EventMatcher;    // Ocekavana udalost, ktera by mela nasledovat
  within: string | number;   // Casove okno
  groupBy?: string;          // Grupovani podle pole
}
```

## Formaty casovych oken

Sekvence i absence prijimaji casova okna jako retezce nebo milisekundy:

| Format | Vyznam | Priklad |
|--------|--------|---------|
| `"30s"` | 30 sekund | Kratky timeout |
| `"5m"` | 5 minut | Timeout platby |
| `"1h"` | 1 hodina | Monitoring SLA |
| `"2d"` | 2 dny | Deadline odeslani |
| `"1w"` | 1 tyden | Dlouhodobe sledovani |
| `30000` | 30 000 ms | Presne milisekundy |

## Kompletni funkcni priklad

E-commerce platebni pipeline se sekvencnim i absence vzorem:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  sequence, absence,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'payment-pipeline' });

  // === Sledovani uspesne cesty: objednavka → platba → potvrzeni ===
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
      .also(log('info', 'Objednavka potvrzena: ${trigger.events.0.orderId}'))
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

  // === Reakce na potvrzene objednavky ===
  engine.registerRule(
    Rule.create('notify-confirmation')
      .name('Send Confirmation')
      .when(onEvent('order.confirmed'))
      .then(log('info', 'Odesilam potvrzeni pro ${event.orderId}'))
      .build()
  );

  // === Reakce na zrusene objednavky ===
  engine.registerRule(
    Rule.create('notify-cancellation')
      .name('Send Cancellation Notice')
      .when(onEvent('order.cancelled'))
      .then(log('warn', 'Odesilam oznameni o zruseni pro ${event.orderId}'))
      .build()
  );

  // --- Test: Uspesna cesta ---
  await engine.emit('order.created', {
    orderId: 'ORD-1',
    customerId: 'C-1',
    total: 299.99,
  });

  // Platba prijde behem 15 minut
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

  // Zadna platba pro ORD-2... po 15 minutach:
  // Engine automaticky spusti vzor absence
  // ORD-2 status → "cancelled"

  await engine.stop();
}

main();
```

### Co se deje krok po kroku

1. `order.created (ORD-1)` → sekvencni matcher zacne sledovat, absence matcher nastavi 15m casovac
2. `payment.received (ORD-1)` → sekvence se dokonci (spusti `order.confirmed`), absence se zrusi (platba prisla)
3. `order.created (ORD-2)` → sekvence zacina, absence nastavi 15m casovac
4. Uplyne 15 minut → absence se spusti pro ORD-2 (zadna platba), sekvence expiruje (nedokoncena)

Dve CEP pravidla spolupracuji prirozene: sekvence zachyti uspesnou cestu a absence zachyti timeout — obe grupovane podle `orderId`, takze si navzajem neprekazeji.

## Cviceni

Sestavte tok onboardingu uzivatelu s obema vzory:

1. **Registracni sekvence**: Detekujte, kdyz uzivatel dokonci cely onboarding: `user.registered` → `email.verified` → `profile.completed`, vse behem 24 hodin, grupovano podle `userId`. Po dokonceni sekvence nastavte fakt `user:${userId}:onboarded` na `true`.

2. **Timeout overeni**: Pokud `email.verified` nenasleduje `user.registered` behem 1 hodiny, emitujte `reminder.send_verification` s emailem uzivatele.

<details>
<summary>Reseni</summary>

```typescript
import {
  Rule, emit, setFact, ref,
  sequence, absence,
} from '@hamicek/noex-rules/dsl';

// 1. Kompletni onboardingova sekvence
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

// 2. Timeout overeni emailu
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

Sekvence sleduje kompletni trikrokovy tok. Absence nezavisle sleduje timeout prvniho kroku. Obe jsou grupovane podle `userId`, takze kazdy uzivatel ziska vlastni sledovaci instanci.

</details>

## Shrnuti

- **Sekvence** detekuje udalosti prichazejici v urcitem poradi v casovem okne
- Pouzijte `groupBy` pro izolaci instanci podle korelacniho klice (napr. `orderId`, `userId`)
- `strict: true` zrusi sekvenci, pokud mezi kroky prijdou nesouvisejici udalosti
- Filtry udalosti zuzi, ktere udalosti matchnou kazdy krok; `as` pojmenuje matchnute udalosti pro referenci
- **Absence** detekuje, ze ocekavana udalost neprisla po triggeru v casovem okne
- Absence se dokonci (spusti) pri timeoutu, zrusi se, kdyz ocekavana udalost prijde
- Casova okna prijimaji citelne retezce (`"5m"`, `"1h"`, `"2d"`) nebo milisekundy
- Sekvence a absence spolupracuji prirozene pro vzory uspesna cesta + timeout

---

Dalsi: [Pocet a agregace](./03-pocet-a-agregace.md)
