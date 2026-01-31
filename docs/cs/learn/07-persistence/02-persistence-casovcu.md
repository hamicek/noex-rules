# Trvanlivé časovače

Pravidlo, které naplánovalo timeout platby na 30 minut, je k ničemu, pokud časovač zmizí při restartu procesu. Ve výchozím stavu noex-rules používá `setTimeout` pro časovače — rychlé a jednoduché, ale volatilní. Když potřebujete časovače, které přežijí pády a restarty, povolte **durable režim** přes `TimerPersistenceConfig`.

## Co se naučíte

- Rozdíl mezi fallback (volatilním) a durable režimem časovačů
- Jak konfigurovat `TimerPersistenceConfig`
- Jak se metadata časovačů ukládají a obnovují
- Opakované časovače se sledováním počtu spuštění v durable režimu
- Kdy použít trvanlivé časovače a kdy stačí volatilní

## Dva režimy časovačů

`TimerManager` funguje v jednom ze dvou režimů podle toho, zda je poskytnut storage adapter:

```text
  ┌─────────────────────────────────────────────────────────┐
  │                     TimerManager                         │
  │                                                         │
  │  ┌───────────────────┐    ┌───────────────────────────┐ │
  │  │  Fallback režim   │    │      Durable režim        │ │
  │  │                   │    │                           │ │
  │  │  setTimeout()     │    │  TimerService (noex)      │ │
  │  │  Pouze v paměti   │    │  Založen na StorageAdapt. │ │
  │  │  Ztracen restartem│    │  Přežije restarty         │ │
  │  │                   │    │  GenServer přijímač       │ │
  │  │  Bez adaptéru     │    │  Vyžaduje adaptér         │ │
  │  └───────────────────┘    └───────────────────────────┘ │
  └─────────────────────────────────────────────────────────┘
```

| Aspekt | Fallback režim | Durable režim |
|--------|:---:|:---:|
| Úložiště | V paměti (`setTimeout`) | `StorageAdapter` přes `TimerService` |
| Přežije restart | Ne | Ano |
| Sledování opakujících se časovačů | Omezené | Plné (počet spuštění, maxCount) |
| Konfigurace | Žádný adapter | `timerPersistence.adapter` vyžadován |
| Použití | Vývoj, krátkodobá časování | Produkce, kritické timeouty |

## TimerPersistenceConfig

Povolte trvanlivé časovače předáním `timerPersistence` do `RuleEngine.start()`:

```typescript
interface TimerPersistenceConfig {
  /** Storage adapter pro ukládání timer metadat */
  adapter: StorageAdapter;

  /** Interval kontroly expirovaných časovačů v ms (výchozí: dle TimerService) */
  checkIntervalMs?: number;
}
```

### Nastavení

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/engine.db' });

const engine = await RuleEngine.start({
  // Persistence pravidel (oddělená starost)
  persistence: { adapter },

  // Persistence časovačů
  timerPersistence: {
    adapter,
    checkIntervalMs: 1000,  // Kontrola expirovaných časovačů každou sekundu
  },
});
```

Můžete sdílet stejnou instanci `StorageAdapter` pro persistenci pravidel i časovačů — vnitřně používají různé storage klíče (`'rules'` vs `'timer-manager:metadata'`).

## Jak funguje durable režim

Když je durable režim aktivní, `TimerManager` deleguje plánování na `TimerService` z `@hamicek/noex` a persistuje metadata časovačů pro obnovu:

```text
  setTimer('payment-timeout', '30m')
       │
       ▼
  ┌──────────────────┐
  │ TimerManager      │
  │ (durable režim)  │
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
           │ Trvanlivé  │      │ StorageAdapter│
           │ plánování  │      │ klíč: timer-  │
           │ (přežije   │      │ manager:      │
           │  restart)  │      │ metadata      │
           └──────┬─────┘      └──────────────┘
                  │
                  ▼ (při expiraci)
           ┌────────────┐
           │ GenServer   │
           │ přijímač    │
           │ handleCast  │
           └──────┬─────┘
                  │
                  ▼
           onExpireCallback(timer)
```

### Metadata časovačů

Pro každý aktivní časovač manager persistuje metadata potřebná pro obnovu:

```typescript
interface TimerMetadata {
  name: string;            // Název časovače (vyhledávací klíč)
  durableTimerId: string;  // ID z TimerService
  timerId: string;         // noex-rules ID časovače
  onExpire: {              // Co emitovat při expiraci
    topic: string;
    data: Record<string, unknown>;
  };
  fireCount: number;       // Kolikrát se časovač spustil
  correlationId?: string;  // Volitelná korelace
  maxCount?: number;       // Max opakování (pro opakující se)
  repeatIntervalMs?: number; // Interval opakování (pro opakující se)
}
```

### Proces obnovy

Při startu se storage adapterem timer manager:

1. Spustí GenServer přijímač pro zprávy o expiraci časovačů
2. Spustí `TimerService` s adapterem
3. Načte persistovaná metadata z klíče `'timer-manager:metadata'`
4. Pro každou persistovanou položku časovače:
   - Vyhledá trvanlivý časovač v `TimerService`
   - Zruší starý časovač (cílil na předchozí přijímač)
   - Vypočítá zbývající čas: `max(0, fireAt - now)`
   - Přeplánuje s aktuálním přijímačem
   - Obnoví in-memory `Timer` a `TimerMetadata`
5. Persistuje aktualizovaná metadata (nová ID trvanlivých časovačů)

To znamená, že časovače pokračují tam, kde skončily. 30minutový časovač, kterému zbývalo 10 minut před pádem, se spustí po těch zbývajících 10 minutách po restartu.

## Opakující se časovače v durable režimu

Durable režim poskytuje plné sledování pro opakující se časovače:

```typescript
import { Rule } from '@hamicek/noex-rules';
import { onEvent, setTimer, ref } from '@hamicek/noex-rules/dsl';

// Naplánování opakované kontroly zdraví každých 5 minut, max 12× (1 hodina)
engine.registerRule(
  Rule.create('schedule-health-check')
    .name('Plánování periodické kontroly zdraví')
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

V durable režimu je `fireCount` sledován v persistovaných metadatech. Pokud se proces restartuje po 6 spuštěních, časovač pokračuje a spustí se ještě 6krát před dosažením `maxCount: 12`.

Ve fallback režimu sledování `maxCount` není plně podporováno — počet spuštění se resetuje při restartu.

## Kompletní příklad: Timeout platby s trvanlivými časovači

Platební tok, kde objednávky musí být zaplaceny do 15 minut, s připomínkou po 10 minutách:

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

// Pravidlo 1: Start časovače platby při vytvoření objednávky
engine.registerRule(
  Rule.create('start-payment-timer')
    .name('Start časovače platby')
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
    .also(log('Časovače platby nastaveny pro objednávku ${event.orderId}'))
    .build()
);

// Pravidlo 2: Zrušení časovačů při přijetí platby
engine.registerRule(
  Rule.create('payment-received')
    .name('Platba přijata - zrušení časovačů')
    .tags('payments', 'timers')
    .priority(100)
    .when(onEvent('payment.completed'))
    .then(cancelTimer('payment-timeout:${event.orderId}'))
    .also(cancelTimer('payment-reminder:${event.orderId}'))
    .also(setFact('order:${event.orderId}:status', 'paid'))
    .also(log('Platba přijata pro objednávku ${event.orderId}, časovače zrušeny'))
    .build()
);

// Pravidlo 3: Odeslání připomínky při spuštění 10minutového časovače
engine.registerRule(
  Rule.create('payment-reminder')
    .name('Odeslání připomínky platby')
    .tags('payments', 'notifications')
    .when(onEvent('payment.reminder'))
    .then(emit('notification.send', {
      type: 'payment-reminder',
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
      message: 'Vaše objednávka čeká na platbu. Zbývá 5 minut.',
    }))
    .build()
);

// Pravidlo 4: Zrušení objednávky při vypršení timeoutu platby
engine.registerRule(
  Rule.create('payment-timeout')
    .name('Zrušení objednávky při vypršení platby')
    .tags('payments', 'orders')
    .when(onEvent('payment.timeout'))
    .if(fact('order:${event.orderId}:status').eq('awaiting_payment'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .also(emit('order.cancelled', {
      orderId: ref('event.orderId'),
      reason: 'payment_timeout',
    }))
    .also(log('Objednávka ${event.orderId} zrušena kvůli vypršení platby'))
    .build()
);

// --- Použití ---

await engine.emit('order.created', {
  orderId: 'ord-100',
  customerId: 'cust-42',
  total: 99.99,
});

// Pokud proces spadne a restartuje se do 15 minut,
// časovače payment-timeout a payment-reminder se obnoví
// se zbývajícími trváními. Žádné objednávky nepropadnou.

await engine.stop();
```

Bez `timerPersistence` by restart procesu tiše zahodil oba časovače. Objednávka by zůstala ve stavu `awaiting_payment` navždy — žádná připomínka, žádné zrušení.

## Kdy použít trvanlivé časovače

| Scénář | Trvanlivé? | Proč |
|--------|:---:|-------|
| Timeouty plateb | Ano | Zmeškaný timeout znamená ztracený příjem nebo zaseklé objednávky |
| Eskalace porušení SLA | Ano | Porušení SLA se musí spustit i po nasazení |
| Expirace relace | Možná | Často je přijatelné resetovat při restartu |
| Cooldown rate limitu | Ne | Krátkodobá, resety jsou v pořádku |
| Vývoj/testování | Ne | Přidává složitost bez užitku |
| Debounce časovače | Ne | Sub-sekundové časovače, nestojí za persistenci |

Dobré pravidlo: pokud zmeškaný časovač znamená **nekonzistenci dat nebo dopad na byznys**, použijte durable režim.

## Cvičení

Vybudujte systém obnovy předplatného s trvanlivými časovači:

1. Spusťte engine s persistencí pravidel i časovačů
2. Vytvořte pravidlo, které nastaví 30denní časovač obnovy při přijetí `subscription.activated`
3. Vytvořte pravidlo, které nastaví 7denní časovač připomínky ze stejné události
4. Vytvořte pravidlo, které zpracuje připomínku (emituje událost `notification.renewal_reminder`)
5. Vytvořte pravidlo, které zpracuje timeout obnovy (emituje `subscription.expired` a aktualizuje fakt)
6. Otestujte, že zastavení a restartování enginu zachová časovače

<details>
<summary>Řešení</summary>

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

// Pravidlo 1: Nastavení časovačů obnovy a připomínky
engine.registerRule(
  Rule.create('subscription-timers')
    .name('Nastavení časovačů předplatného')
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
    .also(log('Předplatné ${event.subscriptionId} aktivováno, časovače nastaveny'))
    .build()
);

// Pravidlo 2: Odeslání připomínky obnovy
engine.registerRule(
  Rule.create('renewal-reminder')
    .name('Odeslání připomínky obnovy')
    .tags('subscriptions', 'notifications')
    .when(onEvent('subscription.reminder_due'))
    .if(fact('subscription:${event.subscriptionId}:status').eq('active'))
    .then(emit('notification.renewal_reminder', {
      subscriptionId: ref('event.subscriptionId'),
      customerId: ref('event.customerId'),
      message: 'Vaše předplatné vyprší za 7 dní.',
    }))
    .build()
);

// Pravidlo 3: Zpracování timeoutu obnovy
engine.registerRule(
  Rule.create('renewal-timeout')
    .name('Expirace předplatného')
    .tags('subscriptions', 'lifecycle')
    .when(onEvent('subscription.renewal_due'))
    .if(fact('subscription:${event.subscriptionId}:status').eq('active'))
    .then(setFact('subscription:${event.subscriptionId}:status', 'expired'))
    .also(emit('subscription.expired', {
      subscriptionId: ref('event.subscriptionId'),
      customerId: ref('event.customerId'),
    }))
    .also(log('Předplatné ${event.subscriptionId} expirovalo'))
    .build()
);

// Pravidlo 4: Zrušení časovačů při ruční obnově
engine.registerRule(
  Rule.create('manual-renewal')
    .name('Zrušení časovačů při ruční obnově')
    .tags('subscriptions', 'timers')
    .when(onEvent('subscription.renewed'))
    .then(cancelTimer('renewal:${event.subscriptionId}'))
    .also(cancelTimer('renewal-reminder:${event.subscriptionId}'))
    .also(setFact('subscription:${event.subscriptionId}:status', 'active'))
    .also(log('Předplatné ${event.subscriptionId} obnoveno, časovače resetovány'))
    .build()
);

// --- Test ---

await engine.emit('subscription.activated', {
  subscriptionId: 'sub-001',
  customerId: 'cust-42',
  plan: 'premium',
});

console.log(`Aktivní časovače: ${engine.getTimers().length}`);
// Aktivní časovače: 2

// Simulace restartu
await engine.stop();

const engine2 = await RuleEngine.start({
  persistence: { adapter },
  timerPersistence: { adapter, checkIntervalMs: 5000 },
});

console.log(`Pravidla po restartu: ${engine2.getStats().rules.total}`);
// Pravidla po restartu: 4

// Časovače jsou obnoveny se zbývajícími trváními
console.log(`Časovače po restartu: ${engine2.getTimers().length}`);
// Časovače po restartu: 2

await engine2.stop();
```

Pravidla (přes `persistence`) i časovače (přes `timerPersistence`) přežijí restart. Systém předplatného funguje korektně napříč hranicemi procesu.

</details>

## Shrnutí

- noex-rules má dva režimy časovačů: **fallback** (`setTimeout`, volatilní) a **durable** (`TimerService`, persistentní)
- Povolte durable režim předáním `timerPersistence: { adapter }` do `RuleEngine.start()`
- Trvanlivé časovače persistují metadata pod klíčem `'timer-manager:metadata'` ve storage adaptéru
- Při restartu se časovače obnoví s jejich **zbývajícím trváním** — 30minutový časovač s 10 zbývajícími minutami se spustí po 10 minutách
- Opakující se časovače sledují `fireCount` v durable režimu, což zajišťuje respektování `maxCount` napříč restarty
- Můžete sdílet stejný `StorageAdapter` pro persistenci pravidel i časovačů
- Použijte trvanlivé časovače, když zmeškaný časovač znamená dopad na byznys (timeouty plateb, eskalace SLA)
- Pro krátkodobá nebo vývojová časování stačí fallback režim

---

Další: [Hot reload](./03-hot-reload.md)
