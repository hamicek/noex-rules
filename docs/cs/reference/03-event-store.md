# EventStore

In-memory úložiště událostí s podporou korelace, indexování podle topicu a časových dotazů. Používá se interně v RuleEngine pro CEP (Complex Event Processing) vzory; přístup přes `engine.getEventStore()` pro debugging nebo analýzu.

## Import

```typescript
import { EventStore } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: EventStoreConfig): Promise<EventStore>
```

Vytvoří novou instanci EventStore.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `EventStoreConfig` | ne | Konfigurace úložiště |

**Návratová hodnota:** `Promise<EventStore>` — instance úložiště

**Příklad:**

```typescript
const store = await EventStore.start({
  maxEvents: 50000,
  maxAgeMs: 12 * 60 * 60 * 1000, // 12 hodin
});
```

---

## Metody

### store()

```typescript
store(event: Event): void
```

Uloží událost a zaindexuje ji podle correlation ID a topicu. Automaticky odstraní nejstarší události při překročení limitu `maxEvents`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| event | `Event` | ano | Událost k uložení |

**Návratová hodnota:** `void`

**Příklad:**

```typescript
store.store({
  id: 'evt-001',
  topic: 'order.created',
  data: { orderId: 'ORD-123', amount: 99.99 },
  timestamp: Date.now(),
  source: 'order-service',
  correlationId: 'session-abc',
});
```

### get()

```typescript
get(id: string): Event | undefined
```

Vrátí událost podle jejího ID.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| id | `string` | ano | ID události |

**Návratová hodnota:** `Event | undefined` — událost nebo undefined pokud nenalezena

**Příklad:**

```typescript
const event = store.get('evt-001');
if (event) {
  console.log(`Topic: ${event.topic}, Data:`, event.data);
}
```

### getByCorrelation()

```typescript
getByCorrelation(correlationId: string): Event[]
```

Najde všechny události se stejným correlation ID. Užitečné pro sledování souvisejících událostí v rámci workflow nebo uživatelské session.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| correlationId | `string` | ano | Correlation ID |

**Návratová hodnota:** `Event[]` — události s odpovídajícím correlation ID

**Příklad:**

```typescript
const sessionEvents = store.getByCorrelation('session-abc');
console.log(`Nalezeno ${sessionEvents.length} událostí v session`);
```

### getByTopic()

```typescript
getByTopic(topic: string): Event[]
```

Vrátí všechny události pro konkrétní topic.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic události |

**Návratová hodnota:** `Event[]` — události s odpovídajícím topicem

**Příklad:**

```typescript
const orderEvents = store.getByTopic('order.created');
```

### getByTopicPattern()

```typescript
getByTopicPattern(pattern: string): Event[]
```

Vrátí události odpovídající patternu topicu s podporou wildcardů. Výsledky jsou seřazeny podle timestamp (nejstarší první).

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| pattern | `string` | ano | Pattern topicu s wildcardy |

**Návratová hodnota:** `Event[]` — odpovídající události seřazené podle timestamp

**Syntaxe patternů:**

| Pattern | Odpovídá |
|---------|----------|
| `order.*` | `order.created`, `order.shipped` (jeden segment) |
| `order.**` | `order.created`, `order.item.added` (libovolná hloubka) |
| `*.created` | `order.created`, `user.created` |
| `**` | Všechny události |

**Příklad:**

```typescript
// Všechny události související s objednávkami
const orderEvents = store.getByTopicPattern('order.*');

// Všechny události v payment namespace (libovolná hloubka)
const paymentEvents = store.getByTopicPattern('payment.**');
```

### getInTimeRange()

```typescript
getInTimeRange(topic: string, from: number, to: number): Event[]
```

Najde události v časovém rozmezí pro konkrétní topic.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic události |
| from | `number` | ano | Počáteční timestamp (včetně) |
| to | `number` | ano | Koncový timestamp (včetně) |

**Návratová hodnota:** `Event[]` — události v časovém rozmezí

**Příklad:**

```typescript
const now = Date.now();
const lastHour = now - 60 * 60 * 1000;
const recentOrders = store.getInTimeRange('order.created', lastHour, now);
```

### countInWindow()

```typescript
countInWindow(topic: string, windowMs: number): number
```

Spočítá události pro topic v posuvném časovém okně končícím aktuálním časem.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Topic události |
| windowMs | `number` | ano | Velikost okna v milisekundách |

**Návratová hodnota:** `number` — počet událostí v okně

**Příklad:**

```typescript
// Počet pokusů o přihlášení za posledních 5 minut
const loginCount = store.countInWindow('user.login', 5 * 60 * 1000);
if (loginCount > 10) {
  console.log('Detekována vysoká aktivita přihlašování');
}
```

### getAllEvents()

```typescript
getAllEvents(): Event[]
```

Vrátí všechny uložené události seřazené podle timestamp (nejstarší první).

**Návratová hodnota:** `Event[]` — všechny události seřazené podle timestamp

### prune()

```typescript
prune(maxAgeMs: number): number
```

Odstraní události starší než zadaný věk.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| maxAgeMs | `number` | ano | Maximální věk v milisekundách |

**Návratová hodnota:** `number` — počet odstraněných událostí

**Příklad:**

```typescript
// Odstranění událostí starších než 1 hodina
const pruned = store.prune(60 * 60 * 1000);
console.log(`Odstraněno ${pruned} starých událostí`);
```

### clear()

```typescript
clear(): void
```

Odstraní všechny události a vymaže všechny indexy.

---

## Vlastnosti

### size

```typescript
get size(): number
```

Vrátí počet uložených událostí.

**Příklad:**

```typescript
console.log(`Počet událostí: ${store.size}`);
```

---

## Typy

### Event

```typescript
interface Event {
  id: string;
  topic: string;
  data: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  source: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| id | `string` | Unikátní identifikátor události |
| topic | `string` | Topic události (např. `order.created`, `payment.received`) |
| data | `Record<string, unknown>` | Payload události |
| timestamp | `number` | Unix timestamp vzniku události |
| correlationId | `string` | Volitelné ID propojující související události |
| causationId | `string` | Volitelné ID události, která tuto způsobila |
| source | `string` | Identifikátor producenta události |

### EventStoreConfig

```typescript
interface EventStoreConfig {
  name?: string;
  maxEvents?: number;
  maxAgeMs?: number;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| name | `string` | — | Název úložiště pro logování |
| maxEvents | `number` | `10000` | Maximum událostí v paměti (auto-prune 10% při překročení) |
| maxAgeMs | `number` | `86400000` (24h) | Maximální věk události pro auto-pruning |

---

## Automatický Pruning

EventStore automaticky spravuje paměť odstraňováním starých událostí:

1. **Kapacitní pruning**: Při překročení `maxEvents` se odstraní nejstarších 10% událostí
2. **Věkový pruning**: Použijte `prune(maxAgeMs)` pro manuální odstranění událostí starších než práh

**Příklad konfigurace:**

```typescript
const store = await EventStore.start({
  maxEvents: 100000,    // Maximálně 100k událostí
  maxAgeMs: 3600000,    // Události expirují po 1 hodině
});
```

---

## Indexování

EventStore udržuje tři indexy pro efektivní dotazy:

| Index | Vyhledávání | Použití |
|-------|-------------|---------|
| Primární (podle ID) | O(1) | `get(id)` |
| Podle korelace | O(1) + O(k) | `getByCorrelation()` |
| Podle topicu | O(1) + O(k) | `getByTopic()`, `getInTimeRange()` |

Kde k = počet událostí odpovídajících korelaci/topicu.

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [FactStore](./02-fact-store.md) — Úložiště faktů
- [TemporalProcessor](./06-temporal-processor.md) — CEP vzory
- [Pravidla a události](../learn/02-getting-started/02-rules-and-events.md) — Tutoriál
