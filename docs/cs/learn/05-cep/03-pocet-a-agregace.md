# Pocet a agregace

Pocet a agregace jsou dva **na mnozstvi citlive** CEP vzory. Vzor poctu se spusti, kdyz pocet odpovidajicich udalosti v casovem okne prekroci prah. Agregacni vzor se spusti, kdyz numericka funkce (soucet, prumer, min, max) nad hodnotami poli udalosti prekroci prah. Spolecne pokryvaji frekvencne zalozene alertovani a hodnotove zalozeny monitoring.

## Co se naucite

- Jak definovat vzory poctu s `count()`
- Rozdil mezi klouzavymi a pevnymi okny
- Jak definovat agregacni vzory s `aggregate()`
- Vsech pet agregacnich funkci: sum, avg, min, max, count
- Porovnavaci operatory: `gte`, `lte`, `eq`
- Kompletni priklady: detekce brute-force (pocet) a monitoring trzeb (agregace)

## Vzory poctu

Vzor poctu sleduje, kolik odpovidajicich udalosti nastane v casovem okne, a spusti se, kdyz pocet prekroci prah.

### Zakladni pocet

```typescript
import {
  Rule, emit, ref, count,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('brute-force-detection')
    .name('Brute Force Detection')
    .when(count()
      .event('auth.login_failed')
      .threshold(5)
      .window('5m')
      .groupBy('userId')
    )
    .then(emit('security.account_locked', {
      userId: ref('trigger.groupKey'),
    }))
    .build()
);
```

Toto se spusti, kdyz 5 nebo vice udalosti `auth.login_failed` nastane behem 5 minut pro stejne `userId`.

### Porovnavaci operatory

Ve vychozim stavu pocet pouziva `gte` (vetsi nebo rovno). Muzete to zmenit:

```typescript
// Spustit pri PRESNE 3 udalostech
count()
  .event('step.completed')
  .threshold(3)
  .comparison('eq')
  .window('10m')
  .groupBy('processId')

// Spustit pri mene nez 2 udalostech (klidne obdobi)
count()
  .event('heartbeat')
  .threshold(2)
  .comparison('lte')
  .window('5m')
  .groupBy('serviceId')
```

| Operator | Vyznam | Pouziti |
|----------|--------|---------|
| `'gte'` | pocet >= prah (vychozi) | "Prilis mnoho udalosti" — brute force, rate limiting |
| `'lte'` | pocet <= prah | "Prilis malo udalosti" — klidne obdobi, chybejici heartbeaty |
| `'eq'` | pocet === prah | "Presny pocet" — vsechny kroky dokonceny |

### Klouzava vs pevna okna

Pocet podporuje dve strategie oken:

```text
  Pevne okno (vychozi, sliding: false)
  ──────────────────────────────────────────────────
  │ Okno 1      │ Okno 2      │ Okno 3      │
  │ 00:00-05:00 │ 05:00-10:00 │ 10:00-15:00 │
  │ ●●●         │ ●●●●●       │ ●●          │
  │ pocet: 3    │ pocet: 5 ✓  │ pocet: 2    │

  Udalosti jsou grupovany do pevnych, neprekryvajicich se intervalu.
  Vyhodnoceni nastava na hranicich oken.

  Klouzave okno (sliding: true)
  ──────────────────────────────────────────────────
  Kazda udalost se pta: "Kolik udalosti za poslednich 5 minut?"
       ●  ●  ●  ●  ●
       ← 5m okno  →
  Jakmile prijde 5. udalost: pocet = 5 ✓ (spusti se okamzite)

  Okno se posouvA s kazdou novou udalosti.
  Vyhodnoceni nastava pri kazde odpovidajici udalosti.
```

**Pevne** deli cas na fixni intervaly. Je predvidatelne a lehke — pocet se resetuje na kazde hranici okna. Pouzijte ho, kdyz potrebujete periodicke kontroly.

**Klouzave** kontroluje poslednich N milisekund pri kazde udalosti. Zachyti shluky rychleji, protoze se spusti jakmile je prah prekrocen, bez ohledu na zarovnani oken. Pouzijte ho pro real-time alertovani.

```typescript
// Pevne: kontrola kazdeho 5-minutoveho bloku
count()
  .event('api.error')
  .threshold(100)
  .window('5m')
  .groupBy('endpoint')

// Klouzave: spustit jakmile 100 chyb nastane v jakemkoli 5-minutovem rozpeti
count()
  .event('api.error')
  .threshold(100)
  .window('5m')
  .groupBy('endpoint')
  .sliding()
```

### Filtry udalosti

Zuzeni pocitanych udalosti:

```typescript
count()
  .event('auth.login_failed', { method: 'password' })
  .threshold(5)
  .window('5m')
  .groupBy('userId')
```

Pocitaji se pouze heslem zalozene neuspechy prihlaseni. OAuth nebo SSO neuspechy jsou ignorovany.

### Rozhrani poctu

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';  // vychozi: 'gte'
  window: string | number;
  groupBy?: string;
  sliding?: boolean;                   // vychozi: false (pevne)
}
```

## Agregacni vzory

Agregacni vzor vypocita numerickou funkci nad polem odpovidajicich udalosti v casovem okne a spusti se, kdyz vysledek prekroci prah.

### Zakladni agregace

```typescript
import {
  Rule, emit, ref, aggregate,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('revenue-spike')
    .name('Revenue Spike Alert')
    .when(aggregate()
      .event('order.paid')
      .field('amount')
      .function('sum')
      .threshold(10000)
      .window('1h')
      .groupBy('region')
    )
    .then(emit('alert.revenue_spike', {
      region: ref('trigger.groupKey'),
      total: ref('trigger.value'),
    }))
    .build()
);
```

Toto se spusti, kdyz soucet hodnot `amount` udalosti `order.paid` prekroci 10 000 behem 1 hodiny, za kazdy region.

### Agregacni funkce

K dispozici je pet funkci:

| Funkce | Vypocita | Prazdne okno |
|--------|----------|--------------|
| `'sum'` | Soucet vsech hodnot | `0` |
| `'avg'` | Aritmeticky prumer | `0` |
| `'min'` | Minimalni hodnota | `Infinity` |
| `'max'` | Maximalni hodnota | `-Infinity` |
| `'count'` | Pocet udalosti (ignoruje hodnotu pole) | `0` |

```typescript
// Prumerna doba odezvy prekracuje 500ms
aggregate()
  .event('api.response')
  .field('duration')
  .function('avg')
  .threshold(500)
  .comparison('gte')
  .window('5m')
  .groupBy('endpoint')

// Minimalni teplota klesne pod bod mrazu
aggregate()
  .event('sensor.reading')
  .field('temperature')
  .function('min')
  .threshold(0)
  .comparison('lte')
  .window('10m')
  .groupBy('sensorId')

// Maximum CPU spike
aggregate()
  .event('system.metrics')
  .field('cpu')
  .function('max')
  .threshold(95)
  .comparison('gte')
  .window('1m')
  .groupBy('hostId')
```

### Extrakce poli

Parametr `field` pouziva teckovou notaci pro extrakci vnorenych hodnot z dat udalosti:

```typescript
// Udalost: { data: { transaction: { amount: 250 } } }
aggregate()
  .event('transaction.completed')
  .field('transaction.amount')     // Extrahuje vnorenou hodnotu
  .function('sum')
  .threshold(50000)
  .window('1h')
```

Nenumericke hodnoty jsou ticho ignorovany v agregaci. Pouze platna cisla prispivaji k vysledku.

### Porovnavaci operatory

Stejne jako u poctu — `gte` (vychozi), `lte`, `eq`:

```typescript
// Soucet prekracuje prah
aggregate()
  .event('order.paid')
  .field('amount')
  .function('sum')
  .threshold(10000)
  .comparison('gte')
  .window('1h')

// Prumer klesne pod prah
aggregate()
  .event('sensor.reading')
  .field('quality')
  .function('avg')
  .threshold(0.8)
  .comparison('lte')
  .window('30m')
```

### Okna

Agregace pouziva stejny model klouzavych/pevnych oken jako pocet. Ve vychozim stavu je pevne. Builder primo nevystavuje metodu `.sliding()` pro agregaci — pouzijte surovy vzor, pokud potrebujete klouzava agregacni okna:

```typescript
// Surovy vzor s klouzavym oknem
engine.registerRule({
  id: 'sliding-revenue',
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'aggregate',
      event: { topic: 'order.paid' },
      field: 'amount',
      function: 'sum',
      threshold: 10000,
      comparison: 'gte',
      window: '1h',
      groupBy: 'region',
    },
  },
  conditions: [],
  actions: [
    { type: 'emit_event', topic: 'alert.revenue_spike' },
  ],
});
```

### Rozhrani agregace

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;                              // Teckova cesta k numerickemu poli
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';         // vychozi: 'gte'
  window: string | number;
  groupBy?: string;
}
```

## Pocet vs agregace

| Aspekt | Pocet | Agregace |
|--------|-------|----------|
| Co meri | Pocet udalosti | Numericka funkce nad hodnotami poli |
| Vstup | Udalosti matchujici topic+filtr | Udalosti matchujici topic+filtr + numericke pole |
| Typicke pouziti | Rate limiting, frekvencni alerty | Trzby, prumery, prahy |
| Funkce | N/A (jen pocitani) | sum, avg, min, max, count |
| Klouzava okna | `.sliding()` v builderu | Pouze surovy vzor |
| Priklad | "5+ neuspesnych prihlaseni za 5 min" | "Celkove objednavky > $10K za 1 hodinu" |

Pouzijte **pocet**, kdyz vas zajima *kolik* udalosti nastalo. Pouzijte **agregaci**, kdyz vas zajima *jake hodnoty* ty udalosti nesly.

## Kompletni funkcni priklad

Bezpecnostni monitorovaci system s oboumi vzory poctu i agregace:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'security-monitor' });

  // === Detekce brute force: 5+ neuspesnych prihlaseni za 5 minut ===
  engine.registerRule(
    Rule.create('brute-force')
      .name('Brute Force Detection')
      .priority(200)
      .tags('security', 'auth')
      .when(count()
        .event('auth.login_failed')
        .threshold(5)
        .window('5m')
        .groupBy('userId')
        .sliding()
      )
      .then(setFact('user:${trigger.groupKey}:locked', true))
      .also(emit('security.account_locked', {
        userId: ref('trigger.groupKey'),
        failedAttempts: ref('trigger.count'),
      }))
      .also(log('warn', 'Ucet zamcen: ${trigger.groupKey} (${trigger.count} neuspesnych pokusu)'))
      .build()
  );

  // === Podezrely objem transakci: >$50K za 1 hodinu na ucet ===
  engine.registerRule(
    Rule.create('high-volume-transactions')
      .name('High Volume Transaction Alert')
      .priority(200)
      .tags('security', 'transactions')
      .when(aggregate()
        .event('transaction.completed')
        .field('amount')
        .function('sum')
        .threshold(50000)
        .window('1h')
        .groupBy('accountId')
      )
      .then(emit('security.high_volume_alert', {
        accountId: ref('trigger.groupKey'),
        totalAmount: ref('trigger.value'),
      }))
      .also(log('warn', 'Vysoky objem transakci: ${trigger.groupKey} = $${trigger.value}'))
      .build()
  );

  // === Chybovost API: 100+ chyb na endpoint za 1 minutu ===
  engine.registerRule(
    Rule.create('api-error-rate')
      .name('API Error Rate Alert')
      .priority(150)
      .tags('monitoring', 'api')
      .when(count()
        .event('api.error')
        .threshold(100)
        .window('1m')
        .groupBy('endpoint')
        .sliding()
      )
      .then(emit('alert.api_degraded', {
        endpoint: ref('trigger.groupKey'),
        errorCount: ref('trigger.count'),
      }))
      .build()
  );

  // === Prumerna doba odezvy: >500ms za 5 minut ===
  engine.registerRule(
    Rule.create('slow-endpoint')
      .name('Slow Endpoint Detection')
      .priority(100)
      .tags('monitoring', 'performance')
      .when(aggregate()
        .event('api.response')
        .field('duration')
        .function('avg')
        .threshold(500)
        .window('5m')
        .groupBy('endpoint')
      )
      .then(emit('alert.slow_endpoint', {
        endpoint: ref('trigger.groupKey'),
        avgDuration: ref('trigger.value'),
      }))
      .build()
  );

  // --- Reakce na alerty ---
  engine.registerRule(
    Rule.create('alert-handler')
      .when(onEvent('security.*'))
      .then(log('error', 'BEZPECNOSTNI ALERT: ${event.topic}'))
      .build()
  );

  // --- Test: Brute force ---
  for (let i = 0; i < 5; i++) {
    await engine.emit('auth.login_failed', {
      userId: 'user-42',
      ip: '192.168.1.100',
      method: 'password',
    });
  }
  console.log('Zamceno:', engine.getFact('user:user-42:locked'));
  // true

  // --- Test: Vysoky objem transakci ---
  await engine.emit('transaction.completed', {
    accountId: 'ACC-1',
    amount: 30000,
  });
  await engine.emit('transaction.completed', {
    accountId: 'ACC-1',
    amount: 25000,
  });
  // Celkem: $55 000 > prah $50 000 → alert se spusti

  await engine.stop();
}

main();
```

## Cviceni

Sestavte monitorovaci dashboard se vzory poctu a agregace:

1. **Rate Limiter**: Detekujte, kdyz jedna IP adresa uskutecni vice nez 60 API pozadavku za 1 minutu. Pouzijte klouzave okno. Emitujte `rate_limit.exceeded` s IP a poctem pozadavku.

2. **Sledovani trzeb**: Sledujte hodinove trzby podle kategorie produktu. Kdyz soucet castek `order.completed` prekroci $5 000 pro kategorii za 1 hodinu, emitujte `revenue.milestone_reached` s kategorii a celkovou castkou.

3. **Health Check**: Detekujte, kdyz prumerna doba odezvy `health.check` pro sluzbu prekroci 1000ms za 2 minuty. Emitujte `alert.service_degraded`.

<details>
<summary>Reseni</summary>

```typescript
import {
  Rule, emit, ref,
  count, aggregate,
} from '@hamicek/noex-rules/dsl';

// 1. Rate Limiter (klouzavy pocet)
const rateLimiter = Rule.create('rate-limiter')
  .name('IP Rate Limiter')
  .priority(200)
  .tags('security', 'rate-limiting')
  .when(count()
    .event('api.request')
    .threshold(60)
    .window('1m')
    .groupBy('ip')
    .sliding()
  )
  .then(emit('rate_limit.exceeded', {
    ip: ref('trigger.groupKey'),
    requestCount: ref('trigger.count'),
  }))
  .build();

// 2. Sledovani trzeb (agregacni soucet)
const revenueTracker = Rule.create('revenue-tracker')
  .name('Hourly Revenue Tracker')
  .priority(100)
  .tags('business', 'revenue')
  .when(aggregate()
    .event('order.completed')
    .field('amount')
    .function('sum')
    .threshold(5000)
    .window('1h')
    .groupBy('category')
  )
  .then(emit('revenue.milestone_reached', {
    category: ref('trigger.groupKey'),
    total: ref('trigger.value'),
  }))
  .build();

// 3. Health Check (agregacni prumer)
const healthCheck = Rule.create('health-check')
  .name('Service Health Monitor')
  .priority(150)
  .tags('monitoring', 'health')
  .when(aggregate()
    .event('health.check')
    .field('responseTime')
    .function('avg')
    .threshold(1000)
    .comparison('gte')
    .window('2m')
    .groupBy('serviceId')
  )
  .then(emit('alert.service_degraded', {
    serviceId: ref('trigger.groupKey'),
    avgResponseTime: ref('trigger.value'),
  }))
  .build();

engine.registerRule(rateLimiter);
engine.registerRule(revenueTracker);
engine.registerRule(healthCheck);
```

Rate limiter pouziva klouzave okno pro okamzitou detekci. Sledovani trzeb pouziva pevne (vychozi) pro ciste hodinove hranice. Health check monitoruje prumernou dobu odezvy za klouzave 2-minutove obdobi.

</details>

## Shrnuti

- **Pocet** meri, kolik odpovidajicich udalosti nastane v casovem okne
- **Agregace** pocita sum, avg, min, max nebo count nad numerickym polem odpovidajicich udalosti
- Obe podporuji porovnavaci operatory `gte` (vychozi), `lte` a `eq`
- **Pevna okna** deli cas na fixni intervaly — predvidatelne a lehke
- **Klouzava okna** kontroluji poslednich N milisekund pri kazde udalosti — rychlejsi detekce shluky
- `groupBy` izoluje sledovani podle korelacniho klice (napr. `userId`, `endpoint`, `accountId`)
- Filtry udalosti zuzi, ktere udalosti se ucasni pocitani nebo agregace
- Pouzijte pocet pro frekvencne zalozene alerty; pouzijte agregaci pro hodnotove zalozeny monitoring

---

Dalsi: [CEP vzory v praxi](./04-cep-vzory.md)
