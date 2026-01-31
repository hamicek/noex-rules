# Základní akce

Každé pravidlo končí akcemi — konkrétními kroky, které engine vykoná, když pravidlo uspěje. noex-rules obsahuje čtyři základní typy akcí pokrývající emitování událostí, správu stavu a logování. Tato kapitola vysvětluje každý z nich, ukazuje, jak řetězcová interpolace a reference činí akce dynamickými, a provede vás kompletním příkladem s více akcemi.

## Co se naučíte

- Čtyři základní typy akcí: `emit_event`, `set_fact`, `delete_fact`, `log`
- Jak funguje řetězcová interpolace (`${expression}`) v řetězcích akcí
- Jak funguje rozlišení referencí (`{ ref: 'path' }`) v hodnotách akcí
- Jak se více akcí vykonává sekvenčně v rámci jednoho pravidla
- Jak akce jednoho pravidla mohou spouštět jiná pravidla (dopředné řetězení)

## Pipeline vykonávání akcí

Když pravidlo uspěje, engine zpracovává jeho pole akcí sekvenčně, od první po poslední:

```text
  Pravidlo uspěje
      │
      ▼
  ┌──────────────────────────────────┐
  │  Akce 1: set_fact                │
  │  ┌────────────────────────────┐  │
  │  │ 1. Interpolace klíče       │  │
  │  │ 2. Rozlišení ref. hodnoty  │  │
  │  │ 3. Zápis do FactStore      │  │
  │  └────────────────────────────┘  │
  │           ▼ úspěch               │
  │  Akce 2: emit_event              │
  │  ┌────────────────────────────┐  │
  │  │ 1. Interpolace topicu      │  │
  │  │ 2. Rozlišení ref. v datech │  │
  │  │ 3. Emitování do EventStore │  │
  │  └────────────────────────────┘  │
  │           ▼ úspěch               │
  │  Akce 3: log                     │
  │  ┌────────────────────────────┐  │
  │  │ 1. Interpolace zprávy      │  │
  │  │ 2. Výstup do konzole       │  │
  │  └────────────────────────────┘  │
  └──────────────────────────────────┘
      │
      ▼
  ActionResult[] vrácen
```

Každá akce produkuje `ActionResult` s `success`, volitelným `result` a volitelným `error`. Pokud jedna akce selže, zbývající akce se stále vykonají — nedochází k implicitnímu rollbacku.

## emit_event

Emituje novou událost do enginu. Toto je primární mechanismus pro řetězení pravidel: akce jednoho pravidla se stane triggerem jiného pravidla.

```typescript
{
  type: 'emit_event',
  topic: 'order.confirmed',
  data: {
    orderId: { ref: 'event.orderId' },
    total: { ref: 'event.total' },
    confirmedAt: 'now',
  },
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `topic` | `string` | Topic události. Podporuje interpolaci `${expression}`. |
| `data` | `Record<string, unknown>` | Payload události. Každá hodnota může být literál nebo `{ ref: 'path' }`. |

### Jak to funguje

1. Řetězec topicu se interpoluje (např. `'order.${event.type}'` se stane `'order.payment'`)
2. Každá hodnota v `data` se rozliší — `{ ref: 'event.orderId' }` se stane skutečným orderId
3. Engine přiřadí nové události unikátní ID a timestamp
4. Pokud měla spouštěcí událost `correlationId`, propaguje se do emitované události
5. Nová událost vstoupí do enginu a může spustit další pravidla

### Dynamické topicy

```typescript
{
  type: 'emit_event',
  topic: 'notification.${event.channel}',
  data: {
    message: 'Objednávka ${event.orderId} zpracována',
  },
}
```

Pokud je `event.channel` roven `'email'`, emitovaný topic bude `'notification.email'`.

## set_fact

Vytvoří nebo aktualizuje fakt v úložišti faktů. Fakta přetrvávají v paměti a jsou dostupná všem pravidlům.

```typescript
{
  type: 'set_fact',
  key: 'order:${event.orderId}:status',
  value: 'confirmed',
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `key` | `string` | Klíč faktu. Podporuje interpolaci `${expression}`. |
| `value` | `unknown \| { ref: string }` | Hodnota k uložení. Může být literál nebo reference. |

### Statické a dynamické hodnoty

```typescript
// Statická hodnota
{ type: 'set_fact', key: 'config:mode', value: 'production' }

// Reference na data události
{ type: 'set_fact', key: 'order:${event.orderId}:total', value: { ref: 'event.total' } }

// Reference na jiný fakt
{ type: 'set_fact', key: 'customer:${event.customerId}:lastOrder', value: { ref: 'event.orderId' } }

// Komplexní hodnoty
{ type: 'set_fact', key: 'order:${event.orderId}:summary', value: { status: 'paid', items: 3 } }
```

### Dopředné řetězení

Nastavení faktu může spustit pravidla s `trigger: { type: 'fact', pattern: '...' }`. Tím vzniká řetězová reakce:

```text
  Událost přijde → Pravidlo A uspěje → set_fact('order:X:status', 'paid')
                                              │
                                              ▼ změna faktu
                                    Pravidlo B se spustí na fakt 'order:*:status'
                                              │
                                              ▼
                                    Pravidlo B uspěje → emit_event('shipping.ready')
```

Toto je dopředné řetězení: data automaticky protékají pravidly vpřed.

## delete_fact

Odstraní fakt z úložiště faktů.

```typescript
{
  type: 'delete_fact',
  key: 'order:${event.orderId}:pending',
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `key` | `string` | Klíč faktu k odstranění. Podporuje interpolaci `${expression}`. |

Smazání neexistujícího faktu je bezpečné — proběhne tiše bez chyby.

### Vzory čištění

```typescript
// Odstranění dočasného příznaku zpracování
{ type: 'delete_fact', key: 'order:${event.orderId}:processing' }

// Vymazání cachované hodnoty
{ type: 'delete_fact', key: 'cache:customer:${event.customerId}:profile' }
```

## log

Vypíše zprávu do konzole na zadané úrovni. Užitečné pro debugging, audit trail a monitorování vykonávání pravidel.

```typescript
{
  type: 'log',
  level: 'info',
  message: 'Objednávka ${event.orderId} potvrzena pro zákazníka ${event.customerId}',
}
```

### Vlastnosti

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | Úroveň závažnosti logu. |
| `message` | `string` | Text zprávy. Podporuje interpolaci `${expression}`. |

### Úrovně logování

| Úroveň | Použití |
|---------|---------|
| `debug` | Detailní trasování vykonávání, pouze pro vývoj |
| `info` | Normální provozní události (pravidlo vykonáno, fakt nastaven) |
| `warn` | Neočekávané, ale nekritické situace |
| `error` | Selhání vyžadující pozornost |

```typescript
// Debug: trasování vykonávání pravidla
{ type: 'log', level: 'debug', message: 'Vyhodnocuji objednávku ${event.orderId}, celkem: ${event.total}' }

// Info: obchodní událost nastala
{ type: 'log', level: 'info', message: 'VIP upgrade aplikován na zákazníka ${event.customerId}' }

// Warn: neočekávaný stav
{ type: 'log', level: 'warn', message: 'Objednávka ${event.orderId} má nulový součet' }

// Error: něco selhalo
{ type: 'log', level: 'error', message: 'Platba selhala pro objednávku ${event.orderId}' }
```

## Řetězcová interpolace v akcích

Jakékoli řetězcové pole v akci (topic, key, message) podporuje interpolaci `${expression}`. Výraz se vyhodnocuje v době vykonávání proti aktuálnímu kontextu.

### Dostupné zdroje

| Výraz | Rozlišuje se na |
|-------|-----------------|
| `${event.fieldName}` | Datové pole spouštěcí události |
| `${fact.factKey}` | Aktuální hodnota faktu |
| `${var.name}` | Proměnná vykonávání |
| `${matched.0.data.field}` | Data z matchnuté události v temporálních vzorech |
| `${lookup.name}` | Výsledek z datového požadavku (lookup) |

### Příklady

```typescript
actions: [
  // Data události v topicu
  {
    type: 'emit_event',
    topic: 'notification.${event.channel}',
    data: { message: 'Ahoj' },
  },
  // Data události v klíči faktu
  {
    type: 'set_fact',
    key: 'customer:${event.customerId}:lastOrderDate',
    value: { ref: 'event.date' },
  },
  // Hodnota faktu ve zprávě logu
  {
    type: 'log',
    level: 'info',
    message: 'Zákazník ${event.customerId} úroveň: ${fact.customer:${event.customerId}:tier}',
  },
]
```

## Rozlišení referencí v akcích

Reference používají syntaxi `{ ref: 'path' }` pro ne-řetězcové hodnoty. Na rozdíl od interpolace (která produkuje řetězce) reference zachovávají původní typ — čísla zůstávají čísly, objekty zůstávají objekty.

### Interpolace vs reference

```typescript
// Řetězcová interpolace — výsledek je vždy řetězec
{ type: 'log', level: 'info', message: 'Celkem: ${event.total}' }
// message = "Celkem: 1500"

// Reference — zachovává původní typ (číslo)
{ type: 'set_fact', key: 'order:X:total', value: { ref: 'event.total' } }
// value = 1500 (číslo, ne řetězec)
```

Interpolaci používejte pro řetězce s vloženými hodnotami. Reference používejte, když potřebujete skutečnou typovanou hodnotu.

### Cesty referencí

| Cesta | Čte z |
|-------|-------|
| `event.fieldName` | `trigger.data.fieldName` |
| `fact.factKey` | Hodnota faktu v úložišti |
| `var.name` | Proměnná vykonávání |
| `matched.N.data.field` | N-tá matchnutá událost z temporálního vzoru |
| `lookup.name` | Výsledek datového požadavku |

## Více akcí na pravidlo

Pole `actions` pravidla může obsahovat libovolný počet akcí. Vykonávají se v pořadí a každá může využít vedlejší efekty předchozích akcí (jako fakta nastavená dřívějšími akcemi):

```typescript
actions: [
  // 1. Označení objednávky jako potvrzené
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:status',
    value: 'confirmed',
  },
  // 2. Záznam časového razítka
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:confirmedAt',
    value: { ref: 'event.timestamp' },
  },
  // 3. Notifikace navazujících systémů
  {
    type: 'emit_event',
    topic: 'order.confirmed',
    data: {
      orderId: { ref: 'event.orderId' },
      customerId: { ref: 'event.customerId' },
    },
  },
  // 4. Log pro pozorovatelnost
  {
    type: 'log',
    level: 'info',
    message: 'Objednávka ${event.orderId} potvrzena',
  },
]
```

### Na pořadí záleží

Akce se vykonávají shora dolů. Pokud potřebujete, aby fakt existoval před emitováním události (protože událost spustí pravidlo, které ten fakt čte), seřaďte je odpovídajícím způsobem.

## Kompletní funkční příklad

E-commerce pipeline zpracování objednávek se čtyřmi pravidly, která se řetězí přes události a fakta:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'order-pipeline' });

  // Pravidlo 1: Při objednávce zvalidovat a nastavit počáteční stav
  engine.registerRule({
    id: 'order-init',
    name: 'Initialize Order',
    priority: 200,
    enabled: true,
    tags: ['orders'],
    trigger: { type: 'event', topic: 'order.placed' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'pending',
      },
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:total',
        value: { ref: 'event.total' },
      },
      {
        type: 'emit_event',
        topic: 'order.validated',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          total: { ref: 'event.total' },
        },
      },
      {
        type: 'log',
        level: 'info',
        message: 'Objednávka ${event.orderId} inicializována (celkem: ${event.total})',
      },
    ],
  });

  // Pravidlo 2: Při validaci aplikovat slevu pro VIP zákazníky
  engine.registerRule({
    id: 'vip-discount',
    name: 'VIP Discount',
    priority: 100,
    enabled: true,
    tags: ['orders', 'pricing'],
    trigger: { type: 'event', topic: 'order.validated' },
    conditions: [
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'eq',
        value: 'vip',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:discount',
        value: 0.1,
      },
      {
        type: 'log',
        level: 'info',
        message: '10% VIP sleva aplikována na objednávku ${event.orderId}',
      },
    ],
  });

  // Pravidlo 3: Při validaci emitovat potvrzení
  engine.registerRule({
    id: 'order-confirm',
    name: 'Confirm Order',
    priority: 50,
    enabled: true,
    tags: ['orders'],
    trigger: { type: 'event', topic: 'order.validated' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:status',
        value: 'confirmed',
      },
      {
        type: 'emit_event',
        topic: 'order.confirmed',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
        },
      },
    ],
  });

  // Pravidlo 4: Při změně stavu objednávky zalogovat přechod
  engine.registerRule({
    id: 'status-logger',
    name: 'Order Status Logger',
    priority: 10,
    enabled: true,
    tags: ['orders', 'audit'],
    trigger: { type: 'fact', pattern: 'order:*:status' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Stav objednávky změněn: ${event.key} = ${event.value} (bylo: ${event.previousValue})',
      },
    ],
  });

  // Nastavení zákaznických dat
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-200:tier', 'standard');

  // Odběr všech událostí pro přehled
  engine.subscribe('order.*', (event) => {
    console.log(`[${event.topic}]`, event.data);
  });

  // Objednávka od VIP zákazníka
  console.log('--- VIP objednávka ---');
  await engine.emit('order.placed', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 250,
  });

  // Kontrola výsledných faktů
  console.log('Stav:', engine.getFact('order:ORD-001:status'));
  // "confirmed"
  console.log('Sleva:', engine.getFact('order:ORD-001:discount'));
  // 0.1

  // Objednávka od standardního zákazníka
  console.log('\n--- Standardní objednávka ---');
  await engine.emit('order.placed', {
    orderId: 'ORD-002',
    customerId: 'C-200',
    total: 80,
  });

  console.log('Stav:', engine.getFact('order:ORD-002:status'));
  // "confirmed"
  console.log('Sleva:', engine.getFact('order:ORD-002:discount'));
  // undefined (žádná VIP sleva)

  await engine.stop();
}

main();
```

### Co se děje

1. `order.placed` spustí Pravidlo 1, které nastaví dva fakty a emituje `order.validated`
2. Pravidlo 4 se spustí na změnu faktu `order:ORD-001:status` → loguje "pending"
3. `order.validated` spustí Pravidlo 2 (VIP kontrola) a Pravidlo 3 (potvrzení)
4. Pravidlo 2 běží první (priorita 100 > 50), nastaví fakt slevy
5. Pravidlo 3 aktualizuje stav na "confirmed" a emituje `order.confirmed`
6. Pravidlo 4 se spustí znovu na změnu stavu → loguje "confirmed"

Toto je dopředné řetězení v akci: každý krok přirozeně plyne do dalšího bez explicitní orchestrace.

## Cvičení

Vytvořte systém věrnostních bodů s těmito pravidly:

1. **Získání bodů**: Když nastane `purchase.completed`, nastavte fakt `loyalty:${customerId}:points` na hodnotu `points` z události. Také emitujte `loyalty.points_earned` s ID zákazníka a body.
2. **Log získání**: Když nastane `loyalty.points_earned`, zalogujte info zprávu: "Customer X earned Y points".
3. **Čištění**: Když nastane `customer.deactivated`, smažte fakta `loyalty:${customerId}:points` i `loyalty:${customerId}:tier`. Zalogujte warn zprávu o deaktivaci.

Otestujte: nákup zákazníka C-100 se 150 body, poté deaktivace C-100.

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'loyalty' });

  // Pravidlo 1: Získání bodů při nákupu
  engine.registerRule({
    id: 'earn-points',
    name: 'Earn Loyalty Points',
    priority: 100,
    enabled: true,
    tags: ['loyalty'],
    trigger: { type: 'event', topic: 'purchase.completed' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'loyalty:${event.customerId}:points',
        value: { ref: 'event.points' },
      },
      {
        type: 'emit_event',
        topic: 'loyalty.points_earned',
        data: {
          customerId: { ref: 'event.customerId' },
          points: { ref: 'event.points' },
        },
      },
    ],
  });

  // Pravidlo 2: Log získaných bodů
  engine.registerRule({
    id: 'log-earn',
    name: 'Log Points Earned',
    priority: 100,
    enabled: true,
    tags: ['loyalty', 'audit'],
    trigger: { type: 'event', topic: 'loyalty.points_earned' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Customer ${event.customerId} earned ${event.points} points',
      },
    ],
  });

  // Pravidlo 3: Čištění při deaktivaci
  engine.registerRule({
    id: 'deactivate-cleanup',
    name: 'Deactivation Cleanup',
    priority: 100,
    enabled: true,
    tags: ['loyalty', 'lifecycle'],
    trigger: { type: 'event', topic: 'customer.deactivated' },
    conditions: [],
    actions: [
      {
        type: 'delete_fact',
        key: 'loyalty:${event.customerId}:points',
      },
      {
        type: 'delete_fact',
        key: 'loyalty:${event.customerId}:tier',
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Zákazník ${event.customerId} deaktivován — věrnostní data vymazána',
      },
    ],
  });

  // Test: nákup získá body
  await engine.emit('purchase.completed', { customerId: 'C-100', points: 150 });
  console.log('Body:', engine.getFact('loyalty:C-100:points'));
  // 150

  // Test: deaktivace vymaže data
  await engine.setFact('loyalty:C-100:tier', 'gold');
  await engine.emit('customer.deactivated', { customerId: 'C-100' });
  console.log('Body po deaktivaci:', engine.getFact('loyalty:C-100:points'));
  // undefined
  console.log('Úroveň po deaktivaci:', engine.getFact('loyalty:C-100:tier'));
  // undefined

  await engine.stop();
}

main();
```

Pravidlo 1 nastaví fakt a emituje událost. Pravidlo 2 reaguje na tuto událost logem. Pravidlo 3 smaže dva fakty a zaloguje varování. Po deaktivaci jsou oba fakty pryč.

</details>

## Shrnutí

- Čtyři základní akce: `emit_event` (řetězení pravidel), `set_fact` (perzistence stavu), `delete_fact` (čištění), `log` (pozorování)
- Akce se vykonávají sekvenčně v rámci pravidla — na pořadí záleží, když pozdější pravidla závisí na vedlejších efektech předchozích akcí
- Řetězcová interpolace `${expression}` funguje ve všech řetězcových polích: topicích, klíčích, zprávách
- Reference `{ ref: 'path' }` zachovávají původní typ — používejte je pro ne-řetězcové hodnoty v polích `data` a `value`
- Dostupné zdroje interpolace: `event`, `fact`, `var`, `matched`, `lookup`
- `emit_event` vytváří dopředné řetězce: Pravidlo A emituje → Pravidlo B se spustí → Pravidlo C emituje → ...
- `set_fact` může spustit pravidla založená na faktech, čímž vytváří implicitní řetězce
- Každá akce produkuje `ActionResult` — selhání nezastavují následující akce

---

Další: [Časovače a plánování](./02-casovace.md)
