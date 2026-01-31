# Časovače a plánování

Ne vše se děje okamžitě. Platby mají lhůty. Připomínky potřebují zpoždění. Předplatné vyprší po určité době. Časovače umožňují plánovat budoucí práci: nastavíte časovač, a po jeho vypršení emituje událost, která může spustit pravidla. V kombinaci s `cancel_timer` můžete budovat toky časových limitů, vzory opakovaných pokusů a plánovanou údržbu — vše řízené pravidly.

## Co se naučíte

- Jak vytvářet časovače pomocí `set_timer` a rušit je pomocí `cancel_timer`
- Syntaxi trvání pro zadávání časových období
- Jak `onExpire` propojuje časovače s událostmi
- Jak fungují pravidla spouštěná časovači
- Jak fungují opakující se časovače s `repeat`
- Kompletní tok platebního časového limitu se třemi spolupracujícími pravidly

## Životní cyklus časovače

```text
  akce set_timer
      │
      ▼
  ┌──────────────────────────────────┐
  │  Časovač aktivní                 │
  │                                  │
  │  name: "payment-timeout:ORD-1"   │
  │  expiresAt: teď + trvání         │
  │  onExpire: { topic, data }       │
  └──────────┬───────────┬──────────┘
             │           │
     časovač vyprší   cancel_timer
             │           │
             ▼           ▼
  ┌──────────────┐  ┌──────────────┐
  │ Emituje      │  │ Časovač      │
  │ onExpire     │  │ odstraněn    │
  │ událost      │  │ (bez udál.)  │
  └──────┬───────┘  └──────────────┘
         │
         ▼
  Jiná pravidla se spustí
  na emitovanou událost
```

Časovač je pojmenované odpočítávání. Když vyprší, emituje nakonfigurovanou událost. Pokud je zrušen před vypršením, nic se nestane.

## Syntaxe trvání

Trvání lze zadat jako řetězce s příponou jednotky nebo jako prosté milisekundy:

| Formát | Jednotka | Příklad | Milisekundy |
|--------|----------|---------|-------------|
| `ms` | Milisekundy | `500ms` | 500 |
| `s` | Sekundy | `30s` | 30 000 |
| `m` | Minuty | `15m` | 900 000 |
| `h` | Hodiny | `2h` | 7 200 000 |
| `d` | Dny | `7d` | 604 800 000 |
| `w` | Týdny | `1w` | 604 800 000 |
| `y` | Roky | `1y` | 31 536 000 000 |

```typescript
// Všechny platné hodnoty trvání
'500ms'   // půl sekundy
'30s'     // třicet sekund
'15m'     // patnáct minut
'2h'      // dvě hodiny
'7d'      // sedm dní
'1w'      // jeden týden
'1y'      // jeden rok
900000    // prosté milisekundy (15 minut)
```

Pro čitelnost se doporučuje řetězcový formát.

## set_timer

Vytvoří časovač, který po vypršení emituje událost.

```typescript
{
  type: 'set_timer',
  timer: {
    name: 'payment-timeout:${event.orderId}',
    duration: '15m',
    onExpire: {
      topic: 'order.payment_timeout',
      data: {
        orderId: { ref: 'event.orderId' },
        customerId: { ref: 'event.customerId' },
      },
    },
  },
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `name` | `string` | Unikátní název časovače. Podporuje `${expression}`. Slouží ke zrušení. |
| `duration` | `string \| number` | Čas do vypršení. Řetězec (`'15m'`) nebo milisekundy. |
| `onExpire.topic` | `string` | Topic události emitované při vypršení. |
| `onExpire.data` | `Record<string, unknown>` | Data události. Hodnoty podporují `{ ref: 'path' }`. |
| `repeat` | `object` | Volitelné. Konfigurace opakujícího se časovače. |
| `repeat.interval` | `string \| number` | Čas mezi opakováními. |
| `repeat.maxCount` | `number` | Maximální počet opakování před automatickým zrušením. |

### Názvy časovačů

Názvy časovačů by měly být unikátní a popisné. Zahrňte identifikační data pro přesné zrušení:

```typescript
// Dobré: obsahuje ID objednávky — lze zrušit konkrétní časovač
name: 'payment-timeout:${event.orderId}'

// Špatné: bez identifikátoru — nelze zrušit pro konkrétní objednávku
name: 'payment-timeout'
```

### Událost onExpire

Když časovač vyprší, engine emituje nakonfigurovanou událost. Reference v `onExpire.data` se rozlišují v době vytvoření časovače, ne v době vypršení:

```typescript
// Při vytvoření: event.orderId = 'ORD-001'
timer: {
  name: 'reminder:ORD-001',
  duration: '24h',
  onExpire: {
    topic: 'order.reminder',
    data: {
      orderId: { ref: 'event.orderId' },  // Rozlišeno na 'ORD-001' hned
    },
  },
}
// Za 24 hodin: emituje { topic: 'order.reminder', data: { orderId: 'ORD-001' } }
```

## cancel_timer

Zruší běžící časovač podle názvu. Pokud časovač již vypršel nebo neexistuje, jedná se o bezpečnou operaci bez efektu.

```typescript
{
  type: 'cancel_timer',
  name: 'payment-timeout:${event.orderId}',
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `name` | `string` | Název časovače ke zrušení. Podporuje `${expression}`. |

### Vzory zrušení

```typescript
// Zrušení platebního časového limitu konkrétní objednávky
{ type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' }

// Zrušení časovače neaktivity zákazníka
{ type: 'cancel_timer', name: 'inactivity:${event.customerId}' }
```

## Pravidla spouštěná časovači

Pravidla mohou reagovat na události vypršení časovačů stejně jako na jakékoli jiné události. Použijte topic nakonfigurovaný v `onExpire`:

```typescript
engine.registerRule({
  id: 'handle-payment-timeout',
  name: 'Handle Payment Timeout',
  priority: 100,
  enabled: true,
  tags: ['payments'],
  trigger: { type: 'event', topic: 'order.payment_timeout' },
  conditions: [
    // Jednat pouze pokud je objednávka stále čekající
    {
      source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
      operator: 'eq',
      value: 'pending_payment',
    },
  ],
  actions: [
    {
      type: 'set_fact',
      key: 'order:${event.orderId}:status',
      value: 'cancelled',
    },
    {
      type: 'emit_event',
      topic: 'order.cancelled',
      data: {
        orderId: { ref: 'event.orderId' },
        reason: 'payment_timeout',
      },
    },
  ],
});
```

## Opakující se časovače

Časovače se mohou opakovat v pevném intervalu, dokud nejsou zrušeny nebo dokud nedosáhnou maximálního počtu opakování:

```typescript
{
  type: 'set_timer',
  timer: {
    name: 'heartbeat:${event.serviceId}',
    duration: '1m',
    onExpire: {
      topic: 'service.heartbeat',
      data: {
        serviceId: { ref: 'event.serviceId' },
      },
    },
    repeat: {
      interval: '1m',
      maxCount: 60,  // Zastavit po 60 opakováních (1 hodina)
    },
  },
}
```

### Chování opakování

1. Časovač se spustí po `duration` (počáteční zpoždění)
2. Po každém vypršení se časovač přeplánuje s `repeat.interval`
3. Pokud je nastaven `maxCount`, časovač se automaticky zruší po daném počtu spuštění
4. Pokud `maxCount` není uveden, časovač se opakuje neomezeně, dokud není zrušen

### Vzor eskalace

Kombinujte opakující se časovače s podmínkami pro budování eskalace:

```typescript
// Opakovat připomínku každých 5 minut, maximálně 3krát
timer: {
  name: 'reminder:${event.ticketId}',
  duration: '5m',
  onExpire: {
    topic: 'ticket.reminder',
    data: { ticketId: { ref: 'event.ticketId' } },
  },
  repeat: {
    interval: '5m',
    maxCount: 3,
  },
}
```

## Kompletní funkční příklad

Tok platebního časového limitu se třemi pravidly: jedno spustí časovač při zadání objednávky, jedno zruší časovač při příchodu platby a jedno ošetří vypršení.

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'payment-flow' });

  // Pravidlo 1: Při objednávce spustit 15minutový platební časovač
  engine.registerRule({
    id: 'start-payment-timer',
    name: 'Start Payment Timer',
    priority: 100,
    enabled: true,
    tags: ['payments', 'timers'],
    trigger: { type: 'event', topic: 'order.placed' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'pending_payment',
      },
      {
        type: 'set_timer',
        timer: {
          name: 'payment-timeout:${event.orderId}',
          duration: '15m',
          onExpire: {
            topic: 'order.payment_timeout',
            data: {
              orderId: { ref: 'event.orderId' },
              customerId: { ref: 'event.customerId' },
            },
          },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Platební časovač spuštěn pro objednávku ${event.orderId} (15 min)',
      },
    ],
  });

  // Pravidlo 2: Při přijetí platby zrušit časovač
  engine.registerRule({
    id: 'payment-received',
    name: 'Payment Received',
    priority: 200,
    enabled: true,
    tags: ['payments'],
    trigger: { type: 'event', topic: 'payment.completed' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
        operator: 'eq',
        value: 'pending_payment',
      },
    ],
    actions: [
      {
        type: 'cancel_timer',
        name: 'payment-timeout:${event.orderId}',
      },
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'paid',
      },
      {
        type: 'emit_event',
        topic: 'order.paid',
        data: {
          orderId: { ref: 'event.orderId' },
          amount: { ref: 'event.amount' },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Platba přijata pro ${event.orderId} — časovač zrušen',
      },
    ],
  });

  // Pravidlo 3: Při vypršení časovače zrušit objednávku
  engine.registerRule({
    id: 'handle-timeout',
    name: 'Handle Payment Timeout',
    priority: 100,
    enabled: true,
    tags: ['payments', 'timers'],
    trigger: { type: 'event', topic: 'order.payment_timeout' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
        operator: 'eq',
        value: 'pending_payment',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'cancelled',
      },
      {
        type: 'emit_event',
        topic: 'order.cancelled',
        data: {
          orderId: { ref: 'event.orderId' },
          reason: 'payment_timeout',
        },
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Objednávka ${event.orderId} zrušena — platební timeout',
      },
    ],
  });

  // Odběr pro sledování toku
  engine.subscribe('order.*', (event) => {
    console.log(`[${event.topic}]`, event.data);
  });

  // --- Scénář A: Platba přijde včas ---
  console.log('=== Scénář A: Platba včas ===');
  await engine.emit('order.placed', {
    orderId: 'ORD-001',
    customerId: 'C-100',
  });
  console.log('Stav:', engine.getFact('order:ORD-001:status'));
  // "pending_payment"

  // Simulace příchodu platby
  await engine.emit('payment.completed', {
    orderId: 'ORD-001',
    amount: 99.99,
  });
  console.log('Stav:', engine.getFact('order:ORD-001:status'));
  // "paid" — časovač zrušen, timeout nenastane

  // --- Scénář B: Platba nepřijde (timeout) ---
  console.log('\n=== Scénář B: Platební timeout ===');
  await engine.emit('order.placed', {
    orderId: 'ORD-002',
    customerId: 'C-200',
  });
  console.log('Stav:', engine.getFact('order:ORD-002:status'));
  // "pending_payment"

  // Ve skutečné aplikaci bychom čekali 15 minut. Vypršení časovače
  // by emitovalo 'order.payment_timeout', spustilo Pravidlo 3,
  // které nastaví stav na 'cancelled'.

  await engine.stop();
}

main();
```

### Diagram toku

```text
  order.placed
      │
      ├──── set_fact: status = "pending_payment"
      ├──── set_timer: "payment-timeout:ORD-001" (15m)
      │
      ▼
  ┌───────────────────────────────────────┐
  │      Časovač odpočítává               │
  │                                       │
  │  Přijde payment.completed?            │
  │  ┌─────┐           ┌──────┐          │
  │  │ ANO │           │  NE  │          │
  │  └──┬──┘           └──┬───┘          │
  │     │                  │              │
  │  cancel_timer       časovač vyprší    │
  │  status = "paid"    emit timeout      │
  │  emit order.paid    status = "cancel" │
  │                     emit order.cancel │
  └───────────────────────────────────────┘
```

## Cvičení

Vytvořte systém připomínek pro onboarding uživatelů:

1. **Začátek onboardingu**: Když nastane `user.registered`, nastavte fakt `user:${userId}:onboardingStep` na `1`. Nastavte časovač pojmenovaný `onboarding-reminder:${userId}`, který se spustí po `24h` a emituje `onboarding.reminder` s `userId` a `step: 1`. Časovač by se měl opakovat každých `24h` s `maxCount: 3`.
2. **Ošetření připomínky**: Když nastane `onboarding.reminder`, zkontrolujte, že fakt onboarding kroku uživatele je menší než `4` (tj. nedokončili). Pokud ano, emitujte `notification.send` s userId a zprávou "Complete your onboarding!".
3. **Dokončení onboardingu**: Když nastane `user.onboarding_complete`, zrušte časovač `onboarding-reminder:${userId}` a nastavte onboarding krok na `4`.

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'onboarding' });

  // Pravidlo 1: Zahájení onboardingu s časovačem připomínek
  engine.registerRule({
    id: 'start-onboarding',
    name: 'Start Onboarding',
    priority: 100,
    enabled: true,
    tags: ['onboarding'],
    trigger: { type: 'event', topic: 'user.registered' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'user:${event.userId}:onboardingStep',
        value: 1,
      },
      {
        type: 'set_timer',
        timer: {
          name: 'onboarding-reminder:${event.userId}',
          duration: '24h',
          onExpire: {
            topic: 'onboarding.reminder',
            data: {
              userId: { ref: 'event.userId' },
              step: 1,
            },
          },
          repeat: {
            interval: '24h',
            maxCount: 3,
          },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Onboarding zahájen pro uživatele ${event.userId}',
      },
    ],
  });

  // Pravidlo 2: Ošetření připomínky
  engine.registerRule({
    id: 'handle-reminder',
    name: 'Handle Onboarding Reminder',
    priority: 100,
    enabled: true,
    tags: ['onboarding', 'notifications'],
    trigger: { type: 'event', topic: 'onboarding.reminder' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'user:${event.userId}:onboardingStep' },
        operator: 'lt',
        value: 4,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.send',
        data: {
          userId: { ref: 'event.userId' },
          message: 'Complete your onboarding!',
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Připomínka odeslána uživateli ${event.userId}',
      },
    ],
  });

  // Pravidlo 3: Dokončení onboardingu — zrušení časovače
  engine.registerRule({
    id: 'complete-onboarding',
    name: 'Complete Onboarding',
    priority: 200,
    enabled: true,
    tags: ['onboarding'],
    trigger: { type: 'event', topic: 'user.onboarding_complete' },
    conditions: [],
    actions: [
      {
        type: 'cancel_timer',
        name: 'onboarding-reminder:${event.userId}',
      },
      {
        type: 'set_fact',
        key: 'user:${event.userId}:onboardingStep',
        value: 4,
      },
      {
        type: 'log',
        level: 'info',
        message: 'Onboarding dokončen pro uživatele ${event.userId} — připomínky zrušeny',
      },
    ],
  });

  // Test
  engine.subscribe('notification.*', (event) => {
    console.log('NOTIFIKACE:', event.data);
  });

  await engine.emit('user.registered', { userId: 'U-100' });
  console.log('Krok:', engine.getFact('user:U-100:onboardingStep'));
  // 1

  // Uživatel dokončí onboarding před první připomínkou
  await engine.emit('user.onboarding_complete', { userId: 'U-100' });
  console.log('Krok:', engine.getFact('user:U-100:onboardingStep'));
  // 4 — časovač zrušen, žádné připomínky nepřijdou

  await engine.stop();
}

main();
```

Pravidlo 1 nastaví počáteční krok a naplánuje opakující se připomínku. Pravidlo 2 odesílá notifikace, dokud není onboarding dokončen. Pravidlo 3 zruší časovač a označí dokončení. Pokud uživatel dokončí onboarding před první připomínkou, časovač se zruší a žádné notifikace se neodešlou.

</details>

## Shrnutí

- `set_timer` vytváří pojmenované odpočítávání, které po vypršení emituje událost
- `cancel_timer` zastaví časovač podle názvu před jeho spuštěním — bezpečné, pokud již vypršel
- Syntaxe trvání: `ms`, `s`, `m`, `h`, `d`, `w`, `y` nebo prosté milisekundy
- `onExpire` konfiguruje topic a data události emitované při spuštění časovače
- Reference v `onExpire.data` se rozlišují v době vytvoření, ne v době vypršení
- Názvy časovačů podporují interpolaci `${expression}` — zahrňte identifikátory pro přesné zrušení
- Opakující se časovače používají `repeat: { interval, maxCount }` pro periodickou práci
- Pravidla spouštěná časovači jsou prostě pravidla spouštěná událostmi naslouchající na `onExpire.topic`
- Běžné vzory: platební timeouty, onboarding připomínky, heartbeat kontroly, eskalační toky

---

Další: [Volání externích služeb](./03-externi-sluzby.md)
