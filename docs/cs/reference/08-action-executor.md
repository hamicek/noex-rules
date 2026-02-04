# ActionExecutor

Vykonává akce pravidel s podporou dynamických referencí, interpolace řetězců a tracing callbacků.

## Import

```typescript
import {
  ActionExecutor,
  ExecutionContext,
  ExecutionOptions
} from '@hamicek/noex-rules';
```

## Konstruktor

```typescript
new ActionExecutor(
  factStore: FactStore,
  timerManager: TimerManager,
  emitEvent: EventEmitter,
  services?: Map<string, unknown>,
  conditionEvaluator?: ConditionEvaluator
)
```

Vytvoří novou instanci ActionExecutor.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| factStore | `FactStore` | ano | Fact store pro set_fact/delete_fact akce |
| timerManager | `TimerManager` | ano | Timer manager pro set_timer/cancel_timer akce |
| emitEvent | `EventEmitter` | ano | Funkce pro emitování událostí |
| services | `Map<string, unknown>` | ne | Registrované služby pro call_service akce |
| conditionEvaluator | `ConditionEvaluator` | ne | Vyžadován pro podmíněné akce |

**Příklad:**

```typescript
const executor = new ActionExecutor(
  factStore,
  timerManager,
  (topic, event) => engine.emit(topic, event),
  new Map([['emailService', emailService]]),
  conditionEvaluator
);
```

---

## Metody

### execute()

```typescript
async execute(
  actions: RuleAction[],
  context: ExecutionContext,
  options?: ExecutionOptions
): Promise<ActionResult[]>
```

Vykoná všechny akce sekvenčně s volitelným tracingem.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| actions | `RuleAction[]` | ano | Pole akcí k vykonání |
| context | `ExecutionContext` | ano | Runtime kontext s trigger daty, fakty, proměnnými |
| options | `ExecutionOptions` | ne | Volby pro tracing callbacky |

**Návratová hodnota:** `Promise<ActionResult[]>` — Výsledky pro každou akci (úspěch/selhání)

**Příklad:**

```typescript
const actions: RuleAction[] = [
  { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'confirmed' },
  { type: 'emit_event', topic: 'order.confirmed', data: { orderId: { ref: 'event.orderId' } } }
];

const context: ExecutionContext = {
  trigger: { type: 'event', data: { orderId: 'ORD-123', amount: 150 } },
  facts: factStore,
  variables: new Map(),
  correlationId: 'corr-abc'
};

const results = await executor.execute(actions, context);

for (const result of results) {
  if (result.success) {
    console.log(`Akce ${result.action.type} uspěla`);
  } else {
    console.error(`Akce ${result.action.type} selhala: ${result.error}`);
  }
}
```

---

## Typy

### ExecutionContext

```typescript
interface ExecutionContext {
  trigger: {
    type: string;
    data: Record<string, unknown>;
  };
  facts: FactStore;
  variables: Map<string, unknown>;
  matchedEvents?: Array<{ data: Record<string, unknown> }>;
  lookups?: Map<string, unknown>;
  correlationId?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| trigger | `object` | Informace o triggeru s typem a datovým payloadem |
| facts | `FactStore` | Instance fact store pro resolvování referencí |
| variables | `Map` | Runtime proměnné |
| matchedEvents | `Array` | Matchnuté události z temporálních patternů |
| lookups | `Map` | Předem vyřešené výsledky externích lookupů |
| correlationId | `string` | Korelační ID propagované do emitovaných událostí a timerů |

### ExecutionOptions

```typescript
interface ExecutionOptions {
  onActionStarted?: ActionStartedCallback;
  onActionCompleted?: ActionCompletedCallback;
  onActionFailed?: ActionFailedCallback;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| onActionStarted | `function` | Voláno při zahájení vykonávání akce |
| onActionCompleted | `function` | Voláno při úspěšném dokončení akce |
| onActionFailed | `function` | Voláno při selhání akce |

### EventEmitter

```typescript
type EventEmitter = (topic: string, event: Event) => void | Promise<void>;
```

Typ funkce pro emitování událostí. Může být synchronní nebo asynchronní.

### ActionResult

```typescript
interface ActionResult {
  action: RuleAction;
  success: boolean;
  result?: unknown;
  error?: string;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| action | `RuleAction` | Akce, která byla vykonána |
| success | `boolean` | Zda vykonání uspělo |
| result | `unknown` | Návratová hodnota z akce (při úspěchu) |
| error | `string` | Chybová zpráva (při selhání) |

### ConditionalActionResult

```typescript
interface ConditionalActionResult {
  conditionMet: boolean;
  branchExecuted: 'then' | 'else' | 'none';
  results: ActionResult[];
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| conditionMet | `boolean` | Zda podmínky podmíněné akce prošly |
| branchExecuted | `string` | Která větev byla vykonána |
| results | `ActionResult[]` | Výsledky z vykonaných akcí větve |

---

## Typy akcí

### set_fact

Nastaví hodnotu faktu ve fact store.

```typescript
{ type: 'set_fact', key: string, value: unknown | { ref: string } }
```

| Pole | Typ | Popis |
|------|-----|-------|
| key | `string` | Klíč faktu (podporuje interpolaci) |
| value | `unknown` | Hodnota k nastavení (podporuje reference) |

**Příklad:**

```typescript
{ type: 'set_fact', key: 'order:${event.orderId}:status', value: 'confirmed' }
{ type: 'set_fact', key: 'user:balance', value: { ref: 'event.newBalance' } }
```

### delete_fact

Smaže fakt z fact store.

```typescript
{ type: 'delete_fact', key: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| key | `string` | Klíč faktu ke smazání (podporuje interpolaci) |

**Příklad:**

```typescript
{ type: 'delete_fact', key: 'session:${event.sessionId}' }
```

### emit_event

Emituje novou událost s vygenerovaným ID, timestampem a korelačním ID z kontextu.

```typescript
{ type: 'emit_event', topic: string, data: Record<string, unknown | { ref: string }> }
```

| Pole | Typ | Popis |
|------|-----|-------|
| topic | `string` | Topic události (podporuje interpolaci) |
| data | `object` | Payload události (hodnoty podporují reference) |

**Příklad:**

```typescript
{
  type: 'emit_event',
  topic: 'order.${event.status}',
  data: {
    orderId: { ref: 'event.orderId' },
    total: { ref: 'event.amount' },
    processedAt: Date.now()
  }
}
```

### set_timer

Nastaví časovač, který při expiraci emituje událost.

```typescript
{ type: 'set_timer', timer: TimerConfig }
```

**TimerConfig:**

```typescript
interface TimerConfig {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data: Record<string, unknown | { ref: string }>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Název timeru pro zrušení (podporuje interpolaci) |
| duration | `string \| number` | Doba trvání (`"15m"`, `"24h"`) nebo milisekundy |
| onExpire.topic | `string` | Topic události při expiraci |
| onExpire.data | `object` | Payload události při expiraci |
| repeat.interval | `string \| number` | Interval opakování |
| repeat.maxCount | `number` | Maximální počet opakování |

**Příklad:**

```typescript
{
  type: 'set_timer',
  timer: {
    name: 'payment-timeout:${event.orderId}',
    duration: '15m',
    onExpire: {
      topic: 'payment.timeout',
      data: { orderId: { ref: 'event.orderId' } }
    }
  }
}
```

### cancel_timer

Zruší existující časovač podle názvu.

```typescript
{ type: 'cancel_timer', name: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Název timeru ke zrušení (podporuje interpolaci) |

**Příklad:**

```typescript
{ type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' }
```

### call_service

Zavolá metodu na registrované službě.

```typescript
{ type: 'call_service', service: string, method: string, args: unknown[] }
```

| Pole | Typ | Popis |
|------|-----|-------|
| service | `string` | Název registrované služby |
| method | `string` | Název metody k zavolání |
| args | `unknown[]` | Argumenty metody (podporují reference) |

**Příklad:**

```typescript
{
  type: 'call_service',
  service: 'emailService',
  method: 'send',
  args: [{ ref: 'event.email' }, 'Order Confirmed', { ref: 'event.orderId' }]
}
```

Vyhodí chybu pokud služba nebo metoda není nalezena.

### log

Zaloguje zprávu do konzole.

```typescript
{ type: 'log', level: 'debug' | 'info' | 'warn' | 'error', message: string }
```

| Pole | Typ | Popis |
|------|-----|-------|
| level | `string` | Úroveň logování |
| message | `string` | Zpráva k zalogování (podporuje interpolaci) |

**Příklad:**

```typescript
{ type: 'log', level: 'info', message: 'Objednávka ${event.orderId} zpracována s částkou ${event.amount}' }
```

### conditional

Vykoná akce podmíněně na základě runtime podmínek.

```typescript
{
  type: 'conditional',
  conditions: RuleCondition[],
  then: RuleAction[],
  else?: RuleAction[]
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| conditions | `RuleCondition[]` | Podmínky k vyhodnocení (AND logika) |
| then | `RuleAction[]` | Akce k vykonání pokud podmínky projdou |
| else | `RuleAction[]` | Akce k vykonání pokud podmínky neprojdou (volitelné) |

Vyžaduje poskytnutí `ConditionEvaluator` v konstruktoru.

**Příklad:**

```typescript
{
  type: 'conditional',
  conditions: [
    { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 1000 }
  ],
  then: [
    { type: 'emit_event', topic: 'order.high-value', data: { orderId: { ref: 'event.orderId' } } }
  ],
  else: [
    { type: 'emit_event', topic: 'order.standard', data: { orderId: { ref: 'event.orderId' } } }
  ]
}
```

---

## Reference a interpolace

### Interpolace řetězců

Řetězcová pole (klíče, topicy, zprávy) podporují `${...}` interpolaci:

```typescript
'order:${event.orderId}:status'    // → 'order:ORD-123:status'
'Uživatel ${event.name} se přihlásil'  // → 'Uživatel Jan se přihlásil'
```

### Reference objektů

Pole hodnot podporují `{ ref: string }` pro dynamické resolvování:

```typescript
{ ref: 'event.orderId' }           // → hodnota z trigger dat
{ ref: 'fact.user:balance' }       // → hodnota z fact store
{ ref: 'var.threshold' }           // → hodnota z proměnných
{ ref: 'lookup.profile.tier' }     // → hodnota z výsledku lookupu
{ ref: 'matched.0.amount' }        // → hodnota z první matchnuté události
```

### Zdroje referencí

| Prefix | Popis |
|--------|-------|
| `event.` / `trigger.` | Datový payload triggeru |
| `fact.` | Hodnota z fact store |
| `var.` | Context proměnná |
| `lookup.` | Předem vyřešený výsledek lookupu |
| `matched.N.` | Data N-té matchnuté události (temporální patterny) |

---

## Tracing

Použijte execution options pro trasování vykonávání akcí.

### Typy callbacků

```typescript
type ActionStartedCallback = (info: ActionStartedInfo) => void;
type ActionCompletedCallback = (info: ActionCompletedInfo) => void;
type ActionFailedCallback = (info: ActionFailedInfo) => void;
```

### ActionStartedInfo

```typescript
interface ActionStartedInfo {
  actionIndex: number;
  actionType: string;
  input: Record<string, unknown>;
}
```

### ActionCompletedInfo

```typescript
interface ActionCompletedInfo {
  actionIndex: number;
  actionType: string;
  output: unknown;
  durationMs: number;
}
```

### ActionFailedInfo

```typescript
interface ActionFailedInfo {
  actionIndex: number;
  actionType: string;
  error: string;
  durationMs: number;
}
```

**Příklad:**

```typescript
const results = await executor.execute(actions, context, {
  onActionStarted: (info) => {
    console.log(`[${info.actionIndex}] Zahajuji ${info.actionType}`);
  },
  onActionCompleted: (info) => {
    console.log(`[${info.actionIndex}] Dokončeno ${info.actionType} za ${info.durationMs}ms`);
  },
  onActionFailed: (info) => {
    console.error(`[${info.actionIndex}] Selhalo ${info.actionType}: ${info.error}`);
  }
});
```

---

## Poznámky k chování

### Sekvenční vykonávání

Akce se vykonávají sekvenčně v pořadí pole. Každá akce se dokončí před zahájením další.

### Zpracování chyb

Selhání akce nezastaví vykonávání. Všechny akce se pokusí vykonat a výsledky indikují úspěch/selhání pro každou:

```typescript
const results = await executor.execute(actions, context);

const failed = results.filter(r => !r.success);
if (failed.length > 0) {
  console.error('Některé akce selhaly:', failed.map(r => r.error));
}
```

### Propagace korelace

`correlationId` z kontextu je automaticky propagováno do:
- Emitovaných událostí (`event.correlationId`)
- Timerů (pro tracing)

### Služba nenalezena

`call_service` vyhodí chybu pokud služba nebo metoda není registrována:

```typescript
// Error: Service not found: unknownService
// Error: Method not found: emailService.unknownMethod
```

---

## Viz také

- [ConditionEvaluator](./07-condition-evaluator.md) — Vyhodnocování podmínek
- [DSL Actions](./12-dsl-actions.md) — Fluent buildery akcí
- [TimerManager](./04-timer-manager.md) — Správa timerů
- [Akce pravidel](../learn/03-rules-deep-dive/03-actions.md) — Tutoriál
