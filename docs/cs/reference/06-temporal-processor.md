# TemporalProcessor

CEP (Complex Event Processing) engine pro temporální vzory. Detekuje sekvence, absence, počty a agregace v časových oknech.

## Import

```typescript
import {
  TemporalProcessor,
  TemporalProcessorConfig,
  PatternInstance,
  PatternInstanceState,
  PatternMatch,
  TemporalPattern,
  SequencePattern,
  AbsencePattern,
  CountPattern,
  AggregatePattern,
  EventMatcher
} from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(
  eventStore: EventStore,
  timerManager: TimerManager,
  config?: TemporalProcessorConfig
): Promise<TemporalProcessor>
```

Vytvoří novou instanci TemporalProcessor.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| eventStore | `EventStore` | ano | Event store pro dotazování historických eventů |
| timerManager | `TimerManager` | ano | Timer manager pro plánování timeoutů |
| config | `TemporalProcessorConfig` | ne | Konfigurační volby |

**Návratová hodnota:** `Promise<TemporalProcessor>` — instance procesoru

**Příklad:**

```typescript
const eventStore = await EventStore.start();
const timerManager = await TimerManager.start();
const processor = await TemporalProcessor.start(eventStore, timerManager, {
  timerPrefix: 'cep'
});
```

---

## Match Callback

### onMatch()

```typescript
onMatch(callback: (match: PatternMatch) => void | Promise<void>): void
```

Nastaví callback volaný při matchnutí vzoru. Callback obdrží detaily matche včetně matchnutých eventů a případných vypočtených hodnot.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| callback | `function` | ano | Funkce volaná při matchnutí vzoru |

**Příklad:**

```typescript
processor.onMatch(async (match) => {
  console.log(`Vzor matchnut pro pravidlo: ${match.ruleId}`);
  console.log(`Eventy: ${match.matchedEvents.length}`);

  if (match.aggregateValue !== undefined) {
    console.log(`Agregovaná hodnota: ${match.aggregateValue}`);
  }
});
```

---

## Správa pravidel

### registerRule()

```typescript
registerRule(rule: Rule): void
```

Registruje pravidlo s temporálním triggerem. Procesor bude sledovat instance vzorů pro toto pravidlo.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| rule | `Rule` | ano | Pravidlo s `trigger.type === 'temporal'` |

**Vyhazuje:** `Error` pokud pravidlo nemá temporální trigger

**Příklad:**

```typescript
processor.registerRule({
  id: 'payment-timeout',
  name: 'Payment Timeout',
  priority: 100,
  enabled: true,
  tags: ['payments'],
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'absence',
      after: { topic: 'order.created' },
      expected: { topic: 'payment.received' },
      within: '30m',
      groupBy: 'orderId'
    }
  },
  conditions: [],
  actions: [{ type: 'emit_event', topic: 'payment.timeout', payload: {} }]
});
```

### unregisterRule()

```typescript
unregisterRule(ruleId: string): boolean
```

Odstraní pravidlo a zruší všechny jeho aktivní instance vzorů.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a odstraněno

**Příklad:**

```typescript
const removed = processor.unregisterRule('payment-timeout');
```

---

## Zpracování eventů

### processEvent()

```typescript
async processEvent(event: Event): Promise<PatternMatch[]>
```

Zpracuje příchozí event proti všem registrovaným temporálním vzorům. Vrátí všechny vzory, které matchly v důsledku tohoto eventu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| event | `Event` | ano | Příchozí event ke zpracování |

**Návratová hodnota:** `Promise<PatternMatch[]>` — pole matchů vzorů spuštěných tímto eventem

**Příklad:**

```typescript
const matches = await processor.processEvent({
  id: 'evt-123',
  topic: 'order.created',
  data: { orderId: 'ORD-456', amount: 99.99 },
  timestamp: Date.now()
});

for (const match of matches) {
  console.log(`Pravidlo ${match.ruleId} matchlo`);
}
```

### handleTimeout()

```typescript
async handleTimeout(instanceId: string): Promise<PatternMatch | undefined>
```

Zpracuje vypršení timeoutu instance vzoru. Pro absence vzory timeout znamená, že očekávaný event nepřišel — to spustí match. Pro ostatní vzory timeout znamená, že vzor vypršel bez dokončení.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| instanceId | `string` | ano | Identifikátor instance vzoru |

**Návratová hodnota:** `Promise<PatternMatch | undefined>` — výsledek matche pro absence vzory, jinak undefined

**Příklad:**

```typescript
const match = await processor.handleTimeout('instance-123');
if (match) {
  console.log(`Absence vzor spuštěn pro ${match.ruleId}`);
}
```

---

## Dotazy na instance

### getActiveInstances()

```typescript
getActiveInstances(): PatternInstance[]
```

Vrátí všechny aktivní instance vzorů napříč všemi pravidly.

**Návratová hodnota:** `PatternInstance[]` — pole aktivních instancí

**Příklad:**

```typescript
const instances = processor.getActiveInstances();
console.log(`${instances.length} vzorů v průběhu`);

for (const instance of instances) {
  console.log(`  ${instance.ruleId}: ${instance.state} (${instance.matchedEvents.length} eventů)`);
}
```

### getInstancesForRule()

```typescript
getInstancesForRule(ruleId: string): PatternInstance[]
```

Vrátí aktivní instance pro konkrétní pravidlo.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |

**Návratová hodnota:** `PatternInstance[]` — instance pro toto pravidlo

**Příklad:**

```typescript
const instances = processor.getInstancesForRule('payment-timeout');
console.log(`${instances.length} objednávek čeká na platbu`);
```

---

## Vlastnosti

### size

```typescript
get size(): number
```

Vrátí počet aktivních instancí vzorů.

**Příklad:**

```typescript
console.log(`Aktivních vzorů: ${processor.size}`);
```

---

## Čištění

### clear()

```typescript
clear(): void
```

Odstraní všechny aktivní instance vzorů a zruší jejich timery.

**Příklad:**

```typescript
processor.clear();
```

---

## Typy

### TemporalProcessorConfig

```typescript
interface TemporalProcessorConfig {
  timerPrefix?: string;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| timerPrefix | `string` | `'temporal'` | Prefix pro názvy timerů |

### PatternInstanceState

```typescript
type PatternInstanceState = 'pending' | 'matching' | 'completed' | 'expired';
```

| Stav | Popis |
|------|-------|
| `pending` | Instance vytvořena, čeká na první matchující event |
| `matching` | Alespoň jeden event matchnul, čeká na další |
| `completed` | Vzor plně matchnut |
| `expired` | Timeout dosažen bez dokončení |

### PatternInstance

```typescript
interface PatternInstance {
  id: string;
  ruleId: string;
  pattern: TemporalPattern;
  state: PatternInstanceState;
  matchedEvents: Event[];
  startedAt: number;
  expiresAt: number;
  groupKey?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| id | `string` | Unikátní identifikátor instance |
| ruleId | `string` | Identifikátor přidruženého pravidla |
| pattern | `TemporalPattern` | Sledovaný vzor |
| state | `PatternInstanceState` | Aktuální stav instance |
| matchedEvents | `Event[]` | Dosud matchnuté eventy |
| startedAt | `number` | Unix timestamp začátku instance |
| expiresAt | `number` | Unix timestamp vypršení instance |
| groupKey | `string` | Skupinový klíč pokud vzor používá `groupBy` |

### PatternMatch

```typescript
interface PatternMatch {
  ruleId: string;
  instanceId: string;
  pattern: TemporalPattern;
  matchedEvents: Event[];
  groupKey?: string;
  aggregateValue?: number;
  count?: number;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| ruleId | `string` | Pravidlo které matchlo |
| instanceId | `string` | Identifikátor instance |
| pattern | `TemporalPattern` | Matchnutý vzor |
| matchedEvents | `Event[]` | Všechny eventy v matchi |
| groupKey | `string` | Skupinový klíč pokud vzor používá `groupBy` |
| aggregateValue | `number` | Vypočtená agregovaná hodnota (pro aggregate vzory) |
| count | `number` | Počet eventů (pro count/aggregate vzory) |

---

## Typy vzorů

### EventMatcher

```typescript
interface EventMatcher {
  topic: string;
  filter?: Record<string, unknown>;
  as?: string;
}
```

Definuje kritéria pro matchování eventů v temporálních vzorech.

| Pole | Typ | Popis |
|------|-----|-------|
| topic | `string` | Topic pattern (podporuje wildcardy: `order.*`) |
| filter | `object` | Volitelný filtr payloadu: `{ status: 'failed' }` |
| as | `string` | Alias pro referencování matchnutého eventu v akcích |

### SequencePattern

```typescript
interface SequencePattern {
  type: 'sequence';
  events: EventMatcher[];
  within: string | number;
  groupBy?: string;
  strict?: boolean;
}
```

Detekuje eventy přicházející v určitém pořadí v časovém okně.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| type | `'sequence'` | — | Diskriminátor typu vzoru |
| events | `EventMatcher[]` | — | Seřazený seznam očekávaných eventů |
| within | `string \| number` | — | Časové okno: `'5m'`, `'1h'`, `30000` |
| groupBy | `string` | — | Seskupit podle pole payloadu (např. `'orderId'`) |
| strict | `boolean` | `false` | Pokud true, žádné jiné eventy nejsou povoleny mezi eventy sekvence |

**Příklad: Objednávka → Platba → Odeslání**

```typescript
const pattern: SequencePattern = {
  type: 'sequence',
  events: [
    { topic: 'order.created' },
    { topic: 'payment.received' },
    { topic: 'order.shipped' }
  ],
  within: '24h',
  groupBy: 'orderId'
};
```

### AbsencePattern

```typescript
interface AbsencePattern {
  type: 'absence';
  after: EventMatcher;
  expected: EventMatcher;
  within: string | number;
  groupBy?: string;
}
```

Detekuje, kdy očekávaný event NEPŘIJDE po spouštěcím eventu.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'absence'` | Diskriminátor typu vzoru |
| after | `EventMatcher` | Spouštěcí event který zahajuje čekání |
| expected | `EventMatcher` | Event který očekáváme ale neobdržíme |
| within | `string \| number` | Časové okno čekání |
| groupBy | `string` | Seskupit podle pole payloadu |

**Příklad: Platba nepřijata po objednávce**

```typescript
const pattern: AbsencePattern = {
  type: 'absence',
  after: { topic: 'order.created' },
  expected: { topic: 'payment.received' },
  within: '30m',
  groupBy: 'orderId'
};
```

### CountPattern

```typescript
interface CountPattern {
  type: 'count';
  event: EventMatcher;
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
  sliding?: boolean;
}
```

Detekuje, kdy počet eventů dosáhne prahu v časovém okně.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| type | `'count'` | — | Diskriminátor typu vzoru |
| event | `EventMatcher` | — | Které eventy počítat |
| threshold | `number` | — | Prahová hodnota |
| comparison | `string` | `'gte'` | Jak porovnávat: `gte`, `lte`, `eq` |
| window | `string \| number` | — | Časové okno |
| groupBy | `string` | — | Seskupit podle pole payloadu |
| sliding | `boolean` | `false` | Použít klouzavé okno (vs tumbling) |

**Příklad: 5+ neúspěšných přihlášení za 1 minutu**

```typescript
const pattern: CountPattern = {
  type: 'count',
  event: { topic: 'auth.login_failed' },
  threshold: 5,
  comparison: 'gte',
  window: '1m',
  groupBy: 'userId'
};
```

### AggregatePattern

```typescript
interface AggregatePattern {
  type: 'aggregate';
  event: EventMatcher;
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count';
  threshold: number;
  comparison: 'gte' | 'lte' | 'eq';
  window: string | number;
  groupBy?: string;
}
```

Aplikuje agregační funkce na hodnoty payloadu eventů.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `'aggregate'` | Diskriminátor typu vzoru |
| event | `EventMatcher` | Které eventy agregovat |
| field | `string` | Pole payloadu k agregaci (dot notace) |
| function | `string` | Agregace: `sum`, `avg`, `min`, `max`, `count` |
| threshold | `number` | Prahová hodnota |
| comparison | `string` | Jak porovnávat: `gte`, `lte`, `eq` |
| window | `string \| number` | Časové okno |
| groupBy | `string` | Seskupit podle pole payloadu |

**Příklad: Celkové nákupy > 1000 Kč za 1 hodinu**

```typescript
const pattern: AggregatePattern = {
  type: 'aggregate',
  event: { topic: 'order.completed' },
  field: 'amount',
  function: 'sum',
  threshold: 1000,
  comparison: 'gte',
  window: '1h',
  groupBy: 'customerId'
};
```

### TemporalPattern

```typescript
type TemporalPattern =
  | SequencePattern
  | AbsencePattern
  | CountPattern
  | AggregatePattern;
```

Union typ všech typů temporálních vzorů.

---

## Chování vzorů

### Seskupování pomocí groupBy

Když je specifikováno `groupBy`, jsou udržovány samostatné instance vzorů pro každou unikátní hodnotu tohoto pole. To umožňuje sledování per-entita (např. per objednávka, per uživatel).

```typescript
// Každé orderId získá vlastní instanci vzoru
const pattern: AbsencePattern = {
  type: 'absence',
  after: { topic: 'order.created' },
  expected: { topic: 'payment.received' },
  within: '30m',
  groupBy: 'orderId'  // event.data.orderId
};
```

### Striktní sekvence

S `strict: true` sekvence selže, pokud jakýkoliv nematchující event přijde mezi očekávanými eventy (pro stejnou skupinu).

```typescript
const pattern: SequencePattern = {
  type: 'sequence',
  events: [
    { topic: 'step.one' },
    { topic: 'step.two' }
  ],
  within: '5m',
  strict: true  // 'step.other' mezi one a two selže sekvenci
};
```

### Filtrování eventů

Použijte `filter` pro matchování pouze eventů s konkrétními hodnotami payloadu:

```typescript
const pattern: CountPattern = {
  type: 'count',
  event: {
    topic: 'order.*',
    filter: { status: 'failed' }  // pouze neúspěšné objednávky
  },
  threshold: 3,
  comparison: 'gte',
  window: '1h',
  groupBy: 'customerId'
};
```

---

## Syntaxe doby trvání

Časová okna přijímají řetězce doby trvání nebo milisekundy:

| Formát | Příklad | Milisekundy |
|--------|---------|-------------|
| Milisekundy | `500` | 500 |
| Sekundy | `'30s'` | 30000 |
| Minuty | `'5m'` | 300000 |
| Hodiny | `'1h'` | 3600000 |
| Dny | `'1d'` | 86400000 |
| Kombinované | `'1h30m'` | 5400000 |

---

## Viz také

- [RuleManager](./05-rule-manager.md) — Úložiště pravidel s temporálním indexem
- [EventStore](./03-event-store.md) — Persistence eventů pro dotazy v časových rozsazích
- [TimerManager](./04-timer-manager.md) — Plánování timerů pro timeouty
- [DSL Triggery](./10-dsl-triggers.md) — Fluent buildery pro temporální vzory
- [CEP vzory](../learn/08-complex-event-processing/01-introduction.md) — Tutoriál
