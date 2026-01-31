# Trvanlive casovace

Pravidlo, ktere naplanovalo timeout platby na 30 minut, je k nicemu, pokud casovac zmizi pri restartu procesu. Ve vychozim stavu noex-rules pouziva `setTimeout` pro casovace — rychle a jednoduche, ale volatilni. Kdyz potrebujete casovace, ktere preziji pady a restarty, povolte **durable rezim** pres `TimerPersistenceConfig`.

## Co se naucite

- Rozdil mezi fallback (volatilnim) a durable rezimem casovcu
- Jak konfigurovat `TimerPersistenceConfig`
- Jak se metadata casovcu ukladaji a obnovuji
- Opakovane casovace se sledovanim poctu spusteni v durable rezimu
- Kdy pouzit trvanlive casovace a kdy staci volatilni

## Dva rezimy casovcu

`TimerManager` funguje v jednom ze dvou rezimu podle toho, zda je poskytnout storage adapter:

```text
  ┌─────────────────────────────────────────────────────────┐
  │                     TimerManager                         │
  │                                                         │
  │  ┌───────────────────┐    ┌───────────────────────────┐ │
  │  │  Fallback rezim   │    │      Durable rezim        │ │
  │  │                   │    │                           │ │
  │  │  setTimeout()     │    │  TimerService (noex)      │ │
  │  │  Pouze v pameti   │    │  Zalozen na StorageAdapt. │ │
  │  │  Ztracen restartem│    │  Prezije restarty         │ │
  │  │                   │    │  GenServer prijimac       │ │
  │  │  Bez adapteru     │    │  Vyzaduje adapter         │ │
  │  └───────────────────┘    └───────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘
```

| Aspekt | Fallback rezim | Durable rezim |
|--------|:---:|:---:|
| Uloziste | V pameti (`setTimeout`) | `StorageAdapter` pres `TimerService` |
| Prezije restart | Ne | Ano |
| Sledovani opakujicich se casovcu | Omezene | Plne (pocet spusteni, maxCount) |
| Konfigurace | Zadny adapter | `timerPersistence.adapter` vyzadovan |
| Pouziti | Vyvoj, kratkodoba casovani | Produkce, kriticke timeouty |

## TimerPersistenceConfig

Povolte trvanlive casovace predanim `timerPersistence` do `RuleEngine.start()`:

```typescript
interface TimerPersistenceConfig {
  /** Storage adapter pro ukladani timer metadat */
  adapter: StorageAdapter;

  /** Interval kontroly expirovanych casovcu v ms (vychozi: dle TimerService) */
  checkIntervalMs?: number;
}
```

### Nastaveni

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/engine.db' });

const engine = await RuleEngine.start({
  // Persistence pravidel (oddelena starost)
  persistence: { adapter },

  // Persistence casovcu
  timerPersistence: {
    adapter,
    checkIntervalMs: 1000,  // Kontrola expirovanych casovcu kazdou sekundu
  },
});
```

Muzete sdilet stejnou instanci `StorageAdapter` pro persistenci pravidel i casovcu — vnitrne pouzivaji ruzne storage klice (`'rules'` vs `'timer-manager:metadata'`).

## Jak funguje durable rezim

Kdyz je durable rezim aktivni, `TimerManager` deleguje planovani na `TimerService` z `@hamicek/noex` a persistuje metadata casovcu pro obnovu:

```text
  setTimer('payment-timeout', '30m')
       │
       ▼
  ┌──────────────────┐
  │ TimerManager      │
  │ (durable rezim)  │
  └────────┬─────────┘
           │
     ┌─────┼──────────────────────┐
     │     │                      │
     ▼     ▼                      ▼
  ┌──────┐ ┌──────────────┐  ┌──────────────────┐
  │Timer │ │ TimerService  │  │ persistMetadata() │
  │ Mapa │ │  .schedule()  │  │                  │
  └──────┘ └──────┬───────┘  └────────┬─────────┘
                  │                    │
                  ▼                    ▼
           ┌────────────┐      ┌──────────────┐
           │ Trvanlive  │      │ StorageAdapter│
           │ planovani  │      │ klic: timer-  │
           │ (prezije   │      │ manager:      │
           │  restart)  │      │ metadata      │
           └──────┬─────┘      └──────────────┘
                  │
                  ▼ (pri expiraci)
           ┌────────────┐
           │ GenServer   │
           │ prijimac    │
           │ handleCast  │
           └──────┬─────┘
                  │
                  ▼
           onExpireCallback(timer)
```

### Metadata casovcu

Pro kazdy aktivni casovac manager persistuje metadata potrebna pro obnovu:

```typescript
interface TimerMetadata {
  name: string;            // Nazev casovace (vyhledavaci klic)
  durableTimerId: string;  // ID z TimerService
  timerId: string;         // noex-rules ID casovace
  onExpire: {              // Co emitovat pri expiraci
    topic: string;
    data: Record<string, unknown>;
  };
  fireCount: number;       // Kolikrat se casovac spustil
  correlationId?: string;  // Volitelna korelace
  maxCount?: number;       // Max opakovani (pro opakujici se)
  repeatIntervalMs?: number; // Interval opakovani (pro opakujici se)
}
```

### Proces obnovy

Pri startu se storage adapterem timer manager:

1. Spusti GenServer prijimac pro zpravy o expiraci casovcu
2. Spusti `TimerService` s adapterem
3. Nacte persistovana metadata z klice `'timer-manager:metadata'`
4. Pro kazdou persistovanou polozku casovce:
   - Vyhledai trvanliva casovac v `TimerService`
   - Zrusi stary casovac (cilil na predchozi prijimac)
   - Vypocita zbyvajici cas: `max(0, fireAt - now)`
   - Preplanuje s aktualnim prijimacem
   - Obnovi in-memory `Timer` a `TimerMetadata`
5. Persistuje aktualizovana metadata (nova ID trvanlivych casovcu)

To znamena, ze casovace pokracuji tam, kde skoncily. 30minutovy casovac, kteremu zbyvalalo 10 minut pred padem, se spusti po tech zbyvajicich 10 minutach po restartu.

## Opakujici se casovace v durable rezimu

Durable rezim poskytuje plne sledovani pro opakujici se casovace:

```typescript
import { Rule } from '@hamicek/noex-rules';
import { onEvent, setTimer, ref } from '@hamicek/noex-rules/dsl';

// Naplanovani opakovane kontroly zdravi kazdych 5 minut, max 12x (1 hodina)
engine.registerRule(
  Rule.create('schedule-health-check')
    .name('Planovani periodicke kontroly zdravi')
    .when(onEvent('monitoring.started'))
    .then(setTimer({
      name: 'health-check:${event.serviceId}',
      duration: '5m',
      repeat: {
        interval: '5m',
        maxCount: 12,
      },
      onExpire: {
        topic: 'health.check_due',
        data: { serviceId: ref('event.serviceId') },
      },
    }))
    .build()
);
```

V durable rezimu je `fireCount` sledovan v persistovanych metadatech. Pokud se proces restartuje po 6 spustenich, casovac pokracuje a spusti se jeste 6krat pred dosazenim `maxCount: 12`.

Ve fallback rezimu sledovani `maxCount` neni plne podporovano — pocet spusteni se resetuje pri restartu.

## Kompletni priklad: Timeout platby s trvanlivymi casovaci

Platebni tok, kde objednavky musi byt zaplaceny do 15 minut, s pripominkou po 10 minutach:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, onTimer, emit, setFact, setTimer, cancelTimer,
  log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/payments.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 1000 },
});

// Pravidlo 1: Start casovace platby pri vytvoreni objednavky
engine.registerRule(
  Rule.create('start-payment-timer')
    .name('Start casovace platby')
    .tags('payments', 'timers')
    .when(onEvent('order.created'))
    .then(setTimer({
      name: 'payment-timeout:${event.orderId}',
      duration: '15m',
      onExpire: {
        topic: 'payment.timeout',
        data: { orderId: ref('event.orderId') },
      },
    }))
    .also(setTimer({
      name: 'payment-reminder:${event.orderId}',
      duration: '10m',
      onExpire: {
        topic: 'payment.reminder',
        data: {
          orderId: ref('event.orderId'),
          customerId: ref('event.customerId'),
        },
      },
    }))
    .also(setFact('order:${event.orderId}:status', 'awaiting_payment'))
    .also(log('Casovace platby nastaveny pro objednavku ${event.orderId}'))
    .build()
);

// Pravidlo 2: Zruseni casovcu pri prijeti platby
engine.registerRule(
  Rule.create('payment-received')
    .name('Platba prijata - zruseni casovcu')
    .tags('payments', 'timers')
    .priority(100)
    .when(onEvent('payment.completed'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .also(cancelTimer('payment-reminder:${event.orderId}'))
    .also(setFact('order:${event.orderId}:status', 'paid'))
    .also(log('Platba prijata pro objednavku ${event.orderId}, casovace zruseny'))
    .build()
);

// Pravidlo 3: Odeslani pripominky pri spusteni 10minutoveho casovace
engine.registerRule(
  Rule.create('payment-reminder')
    .name('Odeslani pripominky platby')
    .tags('payments', 'notifications')
    .when(onEvent('payment.reminder'))
    .then(emit('notification.send', {
      type: 'payment-reminder',
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
      message: 'Vase objednavka ceka na platbu. Zbyva 5 minut.',
    }))
    .build()
);

// Pravidlo 4: Zruseni objednavky pri vyprseni timeoutu platby
engine.registerRule(
  Rule.create('payment-timeout')
    .name('Zruseni objednavky pri vyprseni platby')
    .tags('payments', 'orders')
    .when(onEvent('payment.timeout'))
    .if(fact('order:${event.orderId}:status').eq('awaiting_payment'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .also(emit('order.cancelled', {
      orderId: ref('event.orderId'),
      reason: 'payment_timeout',
    }))
    .also(log('Objednavka ${event.orderId} zrusena kvuli vyprseni platby'))
    .build()
);

// --- Pouziti ---

await engine.emit('order.created', {
  orderId: 'ord-100',
  customerId: 'cust-42',
  total: 99.99,
});

// Pokud proces spadne a restartuje se do 15 minut,
// casovace payment-timeout a payment-reminder se obnovi
// se zbyvajicimi trvanimi. Zadne objednavky nepropadnou.

await engine.stop();
```

Bez `timerPersistence` by restart procesu tise zahodil oba casovace. Objednavka by zustala ve stavu `awaiting_payment` navzdy — zadna pripominka, zadne zruseni.

## Kdy pouzit trvanlive casovace

| Scenar | Trvanlive? | Proc |
|--------|:---:|-------|
| Timeouty plateb | Ano | Zmeskou timeout znamena ztraceny prijem nebo zasekle objednavky |
| Eskalace poruseni SLA | Ano | Poruseni SLA se musi spustit i po nasazeni |
| Expirace relace | Mozna | Casto je prijatelne resetovat pri restartu |
| Cooldown rate limitu | Ne | Kratkodoba, resety jsou v poradku |
| Vyvoj/testovani | Ne | Pridava slozitost bez uzitku |
| Debounce casovace | Ne | Sub-sekundove casovace, nestoji za persistenci |

Dobre pravidlo: pokud zmeskou casovace znamena **nekonzistenci dat nebo dopad na byznys**, pouzijte durable rezim.

## Cviceni

Vybudujte system obnovy predplatneho s trvanlivymi casovaci:

1. Spustte engine s persistenci pravidel i casovcu
2. Vytvorte pravidlo, ktere nastavi 30denni casovac obnovy pri prijeti `subscription.activated`
3. Vytvorte pravidlo, ktere nastavi 7denni casovac pripominky ze stejne udalosti
4. Vytvorte pravidlo, ktere zpracuje pripominku (emituje udalost `notification.renewal_reminder`)
5. Vytvorte pravidlo, ktere zpracuje timeout obnovy (emituje `subscription.expired` a aktualizuje fakt)
6. Otestujte, ze zastaveni a restartovani enginu zachova casovace

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, emit, setFact, setTimer, cancelTimer,
  log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const adapter = await SQLiteAdapter.start({ path: './data/subscriptions.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 5000 },
});

// Pravidlo 1: Nastaveni casovcu obnovy a pripominky
engine.registerRule(
  Rule.create('subscription-timers')
    .name('Nastaveni casovcu predplatneho')
    .tags('subscriptions', 'timers')
    .when(onEvent('subscription.activated'))
    .then(setTimer({
      name: 'renewal:${event.subscriptionId}',
      duration: '30d',
      onExpire: {
        topic: 'subscription.renewal_due',
        data: {
          subscriptionId: ref('event.subscriptionId'),
          customerId: ref('event.customerId'),
        },
      },
    }))
    .also(setTimer({
      name: 'renewal-reminder:${event.subscriptionId}',
      duration: '23d',
      onExpire: {
        topic: 'subscription.reminder_due',
        data: {
          subscriptionId: ref('event.subscriptionId'),
          customerId: ref('event.customerId'),
        },
      },
    }))
    .also(setFact('subscription:${event.subscriptionId}:status', 'active'))
    .also(log('Predplatne ${event.subscriptionId} aktivovano, casovace nastaveny'))
    .build()
);

// Pravidlo 2: Odeslani pripominky obnovy
engine.registerRule(
  Rule.create('renewal-reminder')
    .name('Odeslani pripominky obnovy')
    .tags('subscriptions', 'notifications')
    .when(onEvent('subscription.reminder_due'))
    .if(fact('subscription:${event.subscriptionId}:status').eq('active'))
    .then(emit('notification.renewal_reminder', {
      subscriptionId: ref('event.subscriptionId'),
      customerId: ref('event.customerId'),
      message: 'Vase predplatne vyprsi za 7 dni.',
    }))
    .build()
);

// Pravidlo 3: Zpracovani timeoutu obnovy
engine.registerRule(
  Rule.create('renewal-timeout')
    .name('Expirace predplatneho')
    .tags('subscriptions', 'lifecycle')
    .when(onEvent('subscription.renewal_due'))
    .if(fact('subscription:${event.subscriptionId}:status').eq('active'))
    .then(setFact('subscription:${event.subscriptionId}:status', 'expired'))
    .also(emit('subscription.expired', {
      subscriptionId: ref('event.subscriptionId'),
      customerId: ref('event.customerId'),
    }))
    .also(log('Predplatne ${event.subscriptionId} expirovalo'))
    .build()
);

// Pravidlo 4: Zruseni casovcu pri rucni obnove
engine.registerRule(
  Rule.create('manual-renewal')
    .name('Zruseni casovcu pri rucni obnove')
    .tags('subscriptions', 'timers')
    .when(onEvent('subscription.renewed'))
    .then(cancelTimer('renewal:${event.subscriptionId}'))
    .also(cancelTimer('renewal-reminder:${event.subscriptionId}'))
    .also(setFact('subscription:${event.subscriptionId}:status', 'active'))
    .also(log('Predplatne ${event.subscriptionId} obnoveno, casovace resetovany'))
    .build()
);

// --- Test ---

await engine.emit('subscription.activated', {
  subscriptionId: 'sub-001',
  customerId: 'cust-42',
  plan: 'premium',
});

console.log(`Aktivni casovace: ${engine.getTimers().length}`);
// Aktivni casovace: 2

// Simulace restartu
await engine.stop();

const engine2 = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 5000 },
});

console.log(`Pravidla po restartu: ${engine2.getStats().rules.total}`);
// Pravidla po restartu: 4

// Casovace jsou obnoveny se zbyvajicimi trvanimi
console.log(`Casovace po restartu: ${engine2.getTimers().length}`);
// Casovace po restartu: 2

await engine2.stop();
```

Pravidla (pres `persistence`) i casovace (pres `timerPersistence`) preziji restart. System predplatneho funguje korektne napric hranicemi procesu.

</details>

## Shrnuti

- noex-rules ma dva rezimy casovcu: **fallback** (`setTimeout`, volatilni) a **durable** (`TimerService`, persistentni)
- Povolte durable rezim predanim `timerPersistence: { adapter }` do `RuleEngine.start()`
- Trvanlive casovace persistuji metadata pod klicem `'timer-manager:metadata'` ve storage adapteru
- Pri restartu se casovace obnovi s jejich **zbyvajicim trvanim** — 30minutovy casovac s 10 minutami zbyva se spusti po 10 minutach
- Opakujici se casovace sleduji `fireCount` v durable rezimu, coz zajistuje respektovani `maxCount` napric restarty
- Muzete sdilet stejny `StorageAdapter` pro persistenci pravidel i casovcu
- Pouzijte trvanlive casovace, kdyz zmeskanx casovac znamena dopad na byznys (timeouty plateb, eskalace SLA)
- Pro kratkodoba nebo vyvojova casovani staci fallback rezim

---

Dalsi: [Hot reload](./03-hot-reload.md)
