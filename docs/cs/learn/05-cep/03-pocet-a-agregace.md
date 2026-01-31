# Počet a agregace

Počet a agregace jsou dva **na množství citlivé** CEP vzory. Vzor počtu se spustí, když počet odpovídajících událostí v časovém okně překročí práh. Agregační vzor se spustí, když numerická funkce (součet, průměr, min, max) nad hodnotami polí událostí překročí práh. Společně pokrývají frekvenčně založené alertování a hodnotově založený monitoring.

## Co se naučíte

- Jak definovat vzory počtu s `count()`
- Rozdíl mezi klouzavými a pevnými okny
- Jak definovat agregační vzory s `aggregate()`
- Všech pět agregačních funkcí: sum, avg, min, max, count
- Porovnávací operátory: `gte`, `lte`, `eq`
- Kompletní příklady: detekce brute-force (počet) a monitoring tržeb (agregace)

## Vzory počtu

Vzor počtu sleduje, kolik odpovídajících událostí nastane v časovém okně, a spustí se, když počet překročí práh.

### Základní počet

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

Toto se spustí, když 5 nebo více událostí `auth.login_failed` nastane během 5 minut pro stejné `userId`.

### Porovnávací operátory

Ve výchozím stavu počet používá `gte` (větší nebo rovno). Můžete to změnit:

```typescript
// Spustit při PŘESNĚ 3 událostech
count()
  .event('step.completed')
  .threshold(3)
  .comparison('eq')
  .window('10m')
  .groupBy('processId')

// Spustit při méně než 2 událostech (klidné období)
count()
  .event('heartbeat')
  .threshold(2)
  .comparison('lte')
  .window('5m')
  .groupBy('serviceId')
```

| Operátor | Význam | Použití |
|----------|--------|---------|
| `'gte'` | počet >= práh (výchozí) | "Příliš mnoho událostí" — brute force, rate limiting |
| `'lte'` | počet <= práh | "Příliš málo událostí" — klidné období, chybějící heartbeaty |
| `'eq'` | počet === práh | "Přesný počet" — všechny kroky dokončeny |

### Klouzavá vs pevná okna

Počet podporuje dvě strategie oken:

```text
  Pevné okno (výchozí, sliding: false)
  ──────────────────────────────────────────────────
  │ Okno 1      │ Okno 2      │ Okno 3      │
  │ 00:00-05:00 │ 05:00-10:00 │ 10:00-15:00 │
  │ ●●●         │ ●●●●●       │ ●●          │
  │ pocet: 3    │ pocet: 5 ✓  │ pocet: 2    │

  Události jsou grupovány do pevných, nepřekrývajících se intervalů.
  Vyhodnocení nastává na hranicích oken.

  Klouzavé okno (sliding: true)
  ──────────────────────────────────────────────────
  Každá událost se ptá: "Kolik událostí za posledních 5 minut?"
       ●  ●  ●  ●  ●
       ← 5m okno  →
  Jakmile přijde 5. událost: počet = 5 ✓ (spustí se okamžitě)

  Okno se posouvá s každou novou událostí.
  Vyhodnocení nastává při každé odpovídající události.
```

**Pevné** dělí čas na fixní intervaly. Je předvídatelné a lehké — počet se resetuje na každé hranici okna. Použijte ho, když potřebujete periodické kontroly.

**Klouzavé** kontroluje posledních N milisekund při každé události. Zachytí shluky rychleji, protože se spustí jakmile je práh překročen, bez ohledu na zarovnání oken. Použijte ho pro real-time alertování.

```typescript
// Pevné: kontrola každého 5-minutového bloku
count()
  .event('api.error')
  .threshold(100)
  .window('5m')
  .groupBy('endpoint')

// Klouzavé: spustit jakmile 100 chyb nastane v jakémkoli 5-minutovém rozpětí
count()
  .event('api.error')
  .threshold(100)
  .window('5m')
  .groupBy('endpoint')
  .sliding()
```

### Filtry událostí

Zúžení počítaných událostí:

```typescript
count()
  .event('auth.login_failed', { method: 'password' })
  .threshold(5)
  .window('5m')
  .groupBy('userId')
```

Počítají se pouze heslem založené neúspěchy přihlášení. OAuth nebo SSO neúspěchy jsou ignorovány.

### Rozhraní počtu

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';  // výchozí: 'gte'
  window: string | number;
  groupBy?: string;
  sliding?: boolean;                   // výchozí: false (pevné)
}
```

## Agregační vzory

Agregační vzor vypočítá numerickou funkci nad polem odpovídajících událostí v časovém okně a spustí se, když výsledek překročí práh.

### Základní agregace

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

Toto se spustí, když součet hodnot `amount` událostí `order.paid` překročí 10 000 během 1 hodiny, za každý region.

### Agregační funkce

K dispozici je pět funkcí:

| Funkce | Vypočítá | Prázdné okno |
|--------|----------|--------------|
| `'sum'` | Součet všech hodnot | `0` |
| `'avg'` | Aritmetický průměr | `0` |
| `'min'` | Minimální hodnota | `Infinity` |
| `'max'` | Maximální hodnota | `-Infinity` |
| `'count'` | Počet událostí (ignoruje hodnotu pole) | `0` |

```typescript
// Průměrná doba odezvy překračuje 500ms
aggregate()
  .event('api.response')
  .field('duration')
  .function('avg')
  .threshold(500)
  .comparison('gte')
  .window('5m')
  .groupBy('endpoint')

// Minimální teplota klesne pod bod mrazu
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

### Extrakce polí

Parametr `field` používá tečkovou notaci pro extrakci vnořených hodnot z dat události:

```typescript
// Událost: { data: { transaction: { amount: 250 } } }
aggregate()
  .event('transaction.completed')
  .field('transaction.amount')     // Extrahuje vnořenou hodnotu
  .function('sum')
  .threshold(50000)
  .window('1h')
```

Nenumerické hodnoty jsou tiše ignorovány v agregaci. Pouze platná čísla přispívají k výsledku.

### Porovnávací operátory

Stejně jako u počtu — `gte` (výchozí), `lte`, `eq`:

```typescript
// Součet překračuje práh
aggregate()
  .event('order.paid')
  .field('amount')
  .function('sum')
  .threshold(10000)
  .comparison('gte')
  .window('1h')

// Průměr klesne pod práh
aggregate()
  .event('sensor.reading')
  .field('quality')
  .function('avg')
  .threshold(0.8)
  .comparison('lte')
  .window('30m')
```

### Okna

Agregace používá stejný model klouzavých/pevných oken jako počet. Ve výchozím stavu je pevné. Builder přímo nevystavuje metodu `.sliding()` pro agregaci — použijte surový vzor, pokud potřebujete klouzavá agregační okna:

```typescript
// Surový vzor s klouzavým oknem
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

### Rozhraní agregace

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;                              // Tečková cesta k numerickému poli
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';         // výchozí: 'gte'
  window: string | number;
  groupBy?: string;
}
```

## Počet vs agregace

| Aspekt | Počet | Agregace |
|--------|-------|----------|
| Co měří | Počet událostí | Numerická funkce nad hodnotami polí |
| Vstup | Události matchující topic+filtr | Události matchující topic+filtr + numerické pole |
| Typické použití | Rate limiting, frekvenční alerty | Tržby, průměry, prahy |
| Funkce | N/A (jen počítání) | sum, avg, min, max, count |
| Klouzavá okna | `.sliding()` v builderu | Pouze surový vzor |
| Příklad | "5+ neúspěšných přihlášení za 5 min" | "Celkové objednávky > $10K za 1 hodinu" |

Použijte **počet**, když vás zajímá *kolik* událostí nastalo. Použijte **agregaci**, když vás zajímá *jaké hodnoty* ty události nesly.

## Kompletní funkční příklad

Bezpečnostní monitorovací systém s oběma vzory počtu i agregace:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'security-monitor' });

  // === Detekce brute force: 5+ neúspěšných přihlášení za 5 minut ===
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
      .also(log('warn', 'Účet zamčen: ${trigger.groupKey} (${trigger.count} neúspěšných pokusů)'))
      .build()
  );

  // === Podezřelý objem transakcí: >$50K za 1 hodinu na účet ===
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
      .also(log('warn', 'Vysoký objem transakcí: ${trigger.groupKey} = $${trigger.value}'))
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

  // === Průměrná doba odezvy: >500ms za 5 minut ===
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
      .then(log('error', 'BEZPEČNOSTNÍ ALERT: ${event.topic}'))
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
  console.log('Zamčeno:', engine.getFact('user:user-42:locked'));
  // true

  // --- Test: Vysoký objem transakcí ---
  await engine.emit('transaction.completed', {
    accountId: 'ACC-1',
    amount: 30000,
  });
  await engine.emit('transaction.completed', {
    accountId: 'ACC-1',
    amount: 25000,
  });
  // Celkem: $55 000 > práh $50 000 → alert se spustí

  await engine.stop();
}

main();
```

## Cvičení

Sestavte monitorovací dashboard se vzory počtu a agregace:

1. **Rate Limiter**: Detekujte, když jedna IP adresa uskuteční více než 60 API požadavků za 1 minutu. Použijte klouzavé okno. Emitujte `rate_limit.exceeded` s IP a počtem požadavků.

2. **Sledování tržeb**: Sledujte hodinové tržby podle kategorie produktu. Když součet částek `order.completed` překročí $5 000 pro kategorii za 1 hodinu, emitujte `revenue.milestone_reached` s kategorií a celkovou částkou.

3. **Health Check**: Detekujte, když průměrná doba odezvy `health.check` pro službu překročí 1000ms za 2 minuty. Emitujte `alert.service_degraded`.

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, emit, ref,
  count, aggregate,
} from '@hamicek/noex-rules/dsl';

// 1. Rate Limiter (klouzavý počet)
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

// 2. Sledování tržeb (agregační součet)
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

// 3. Health Check (agregační průměr)
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

Rate limiter používá klouzavé okno pro okamžitou detekci. Sledování tržeb používá pevné (výchozí) pro čisté hodinové hranice. Health check monitoruje průměrnou dobu odezvy za klouzavé 2-minutové období.

</details>

## Shrnutí

- **Počet** měří, kolik odpovídajících událostí nastane v časovém okně
- **Agregace** počítá sum, avg, min, max nebo count nad numerickým polem odpovídajících událostí
- Obě podporují porovnávací operátory `gte` (výchozí), `lte` a `eq`
- **Pevná okna** dělí čas na fixní intervaly — předvídatelné a lehké
- **Klouzavá okna** kontrolují posledních N milisekund při každé události — rychlejší detekce shluků
- `groupBy` izoluje sledování podle korelačního klíče (např. `userId`, `endpoint`, `accountId`)
- Filtry událostí zúží, které události se účastní počítání nebo agregace
- Použijte počet pro frekvenčně založené alerty; použijte agregaci pro hodnotově založený monitoring

---

Další: [CEP vzory v praxi](./04-cep-vzory.md)
