# Tagged šablonové literály

Funkce tagged šablony `rule` poskytuje kompaktní, řádkově orientovanou syntaxi pro definování pravidel. Každé pravidlo se vejde do jednoho šablonového literálu — žádné importy helperů, žádné řetězení, jen strukturovaný text. Je ideální pro rychlé prototypování, inline definice pravidel a situace, kde stručnost je důležitější než plná typová bezpečnost.

## Co se naučíte

- Funkci tagged šablony `rule` a její syntaxi
- Klíčová slova WHEN, IF, AND, THEN a na co se mapují
- Deklarace vlastností: `id`, `name`, `priority`, `tags`, `description`, `enabled`
- Inline datové objekty a automatickou detekci referencí
- JavaScript/TypeScript interpolaci pomocí `${variable}`
- Podporované akce: `emit`, `setFact`, `deleteFact`, `log`, `cancelTimer`
- Kdy jsou tagged šablony správná volba a kdy ne

## Základní syntaxe

Pravidlo tagged šablonou je JavaScript šablonový literál s prefixem `rule`:

```typescript
import { rule } from '@hamicek/noex-rules/dsl';

const orderAlert = rule`
  id: order-alert
  name: Order Alert
  priority: 100
  tags: orders, alerts

  WHEN event order.created
  IF event.total >= 1000
  THEN emit alert.large_order { orderId: event.orderId, total: event.total }
  THEN log info "Large order received"
`;
```

Toto produkuje přesně stejný objekt `RuleInput` jako ekvivalentní fluent builder nebo surový objekt. Registrujete ho pomocí `engine.registerRule(orderAlert)`.

## Řádek po řádku

Parser zpracovává každý řádek nezávisle. Prázdné řádky a komentáře (`#` nebo `//`) se ignorují.

### Vlastnosti

Vlastnosti používají syntaxi `klíč: hodnota`. Všechny jsou volitelné kromě `id`:

```text
id: order-alert              → ID pravidla (povinné)
name: Order Alert            → lidsky čitelný název (výchozí je ID)
description: Alerts on big   → volný textový popis
priority: 100                → priorita vyhodnocování (číslo)
tags: orders, alerts         → tagy oddělené čárkou
enabled: true                → zapnutí/vypnutí (true nebo false)
```

### WHEN — Trigger

Vyžadován přesně jeden řádek `WHEN`:

```text
WHEN event order.created     → spouští se na topic události "order.created"
WHEN fact customer:*:tier    → spouští se na fakt odpovídající vzoru
WHEN timer payment-timeout   → spouští se při vypršení časovače
```

### IF / AND — Podmínky

Nula nebo více řádků podmínek. `IF` zahajuje první podmínku, `AND` přidává další:

```text
IF event.total >= 1000
AND event.status == "confirmed"
AND event.country in [US, CA, GB]
AND fact.customer:vip exists
```

### Syntaxe podmínek

Každá podmínka sleduje vzor: `<zdroj>.<pole> <operátor> [hodnota]`

**Zdroje:**

| Prefix | Mapuje se na |
|--------|-------------|
| `event.pole` | Datové pole události |
| `fact.klíč` | Hodnota z úložiště faktů |
| `context.klíč` | Kontextová proměnná enginu |

**Operátory:**

| Šablona | Mapuje se na | Příklad |
|---------|-------------|---------|
| `==` | `eq` | `event.status == "active"` |
| `!=` | `neq` | `event.type != "test"` |
| `>` | `gt` | `event.amount > 0` |
| `>=` | `gte` | `event.total >= 100` |
| `<` | `lt` | `event.count < 10` |
| `<=` | `lte` | `event.age <= 18` |
| `in` | `in` | `event.country in [US, CA]` |
| `not_in` | `not_in` | `event.role not_in [admin, root]` |
| `contains` | `contains` | `event.tags contains "vip"` |
| `not_contains` | `not_contains` | `event.name not_contains "test"` |
| `matches` | `matches` | `event.email matches /^.+@co\.com$/` |
| `exists` | `exists` | `event.coupon exists` |
| `not_exists` | `not_exists` | `event.deletedAt not_exists` |

**Hodnoty** se automaticky parsují:
- Čísla: `100`, `3.14`
- Booleany: `true`, `false`
- Null: `null`
- Řetězce: `"v uvozovkách"` nebo `'v uvozovkách'`
- Pole: `[US, CA, 100, true]`
- Regex: `/vzor/`

### THEN — Akce

Jeden nebo více řádků `THEN`, každý definuje akci:

```text
THEN emit notification.send { orderId: event.orderId }
THEN setFact order:X:status confirmed
THEN deleteFact order:X:pending
THEN log info "Order processed"
THEN cancelTimer payment-timeout:X
```

## Syntaxe akcí

### emit

```text
THEN emit <topic>
THEN emit <topic> { klíč: hodnota, klíč2: hodnota2 }
```

Hodnoty dat s prefixem `event.`, `fact.` nebo `context.` se automaticky konvertují na `{ ref: 'cesta' }` reference:

```text
THEN emit order.confirmed { orderId: event.orderId, total: event.total }
```

Produkuje:
```typescript
{
  type: 'emit_event',
  topic: 'order.confirmed',
  data: {
    orderId: { ref: 'event.orderId' },
    total: { ref: 'event.total' },
  },
}
```

Literální hodnoty zůstávají jako literály:

```text
THEN emit alert.created { level: "high", code: 500 }
```

### setFact

```text
THEN setFact <klíč> <hodnota>
```

```text
THEN setFact order:X:status confirmed        → value = "confirmed"
THEN setFact order:X:total 249.99            → value = 249.99
THEN setFact order:X:paid true               → value = true
THEN setFact order:X:total event.total       → value = { ref: 'event.total' }
```

### deleteFact

```text
THEN deleteFact <klíč>
```

```text
THEN deleteFact order:X:pending
```

### log

```text
THEN log <úroveň> <zpráva>
```

Úrovně: `debug`, `info`, `warn`, `error`. Zpráva může být v uvozovkách nebo bez nich:

```text
THEN log info "Order processed successfully"
THEN log warn Order total is zero
THEN log error "Payment failed for order X"
```

### cancelTimer

```text
THEN cancelTimer <název>
```

```text
THEN cancelTimer payment-timeout:ORD-100
```

## JavaScript interpolace

Protože `rule` je tagged šablona, můžete použít `${výraz}` k vložení JavaScript hodnot:

```typescript
const topic = 'order.created';
const minAmount = 100;
const alertLevel = 'warn';

const myRule = rule`
  id: dynamic-order-check
  priority: ${50 + 50}

  WHEN event ${topic}
  IF event.amount >= ${minAmount}
  THEN log ${alertLevel} "Large order detected"
`;
```

Interpolované hodnoty se stringifikují a vloží do šablony před parsováním. Toto je standardní chování JavaScript šablonových literálů — `${výraz}` se vyhodnotí v době definice, ne v době vykonání pravidla.

### Interpolace vs runtime rozlišení

Nezaměňujte šablonovou interpolaci (při definici) s runtime interpolací řetězců (při vykonání):

```typescript
const threshold = 500;

const myRule = rule`
  id: mixed-example
  WHEN event order.created
  IF event.total >= ${threshold}
  THEN log info "Order received"
`;
// ${threshold} je nahrazeno "500" PŘED parsováním
// Parser vidí: IF event.total >= 500
```

Pro runtime-dynamické hodnoty (hodnoty závisející na spouštěcí události) použijte syntaxi `event.field` v datových objektech a podmínkách — ty se rozloží při spuštění pravidla, ne při jeho definici.

## Komentáře

Řádky začínající `#` nebo `//` se ignorují:

```typescript
const myRule = rule`
  id: commented-rule
  # Toto je komentář
  // Toto taky
  WHEN event order.created
  THEN log info "Order received"
`;
```

## Kompletní funkční příklad

Tříúrovňový notifikační pipeline pomocí tagged šablon:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { rule } from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'notification-demo' });

  // Pravidlo 1: Klasifikace příchozích objednávek podle velikosti
  engine.registerRule(rule`
    id: classify-order
    name: Classify Order Size
    priority: 100
    tags: orders, classification

    WHEN event order.created
    IF event.total >= 500
    THEN setFact order:${'{'}event.orderId${'}'}:class premium
    THEN emit order.classified { orderId: event.orderId, class: "premium" }
    THEN log info "Premium order classified"
  `);

  // Pravidlo 2: Standardní objednávky (bez podmínky na částku)
  engine.registerRule(rule`
    id: standard-order
    name: Standard Order
    priority: 50
    tags: orders, classification

    WHEN event order.created
    IF event.total < 500
    THEN setFact order:${'{'}event.orderId${'}'}:class standard
    THEN emit order.classified { orderId: event.orderId, class: "standard" }
  `);

  // Pravidlo 3: Log všech klasifikací
  engine.registerRule(rule`
    id: classification-log
    name: Log Classification
    priority: 10
    tags: orders, audit

    WHEN event order.classified
    THEN log info "Order classified"
  `);

  // Test
  await engine.emit('order.created', { orderId: 'ORD-1', total: 750 });
  console.log('Třída:', engine.getFact('order:ORD-1:class'));
  // "premium"

  await engine.emit('order.created', { orderId: 'ORD-2', total: 120 });
  console.log('Třída:', engine.getFact('order:ORD-2:class'));
  // "standard"

  await engine.stop();
}

main();
```

## Omezení

Syntaxe tagged šablon obětuje úplnost ve prospěch stručnosti. **Nepodporuje**:

| Funkce | Tagged šablona | Fluent Builder |
|--------|:-:|:-:|
| Triggery event/fact/timer | Ano | Ano |
| Všechny podmínkové operátory | Ano | Ano |
| `emit`, `setFact`, `deleteFact`, `log`, `cancelTimer` | Ano | Ano |
| `setTimer` (s konfigurací `onExpire`) | Ne | Ano |
| `callService` | Ne | Ano |
| Temporální vzory (sequence, absence, count, aggregate) | Ne | Ano |
| Podmíněné akce (if/then/else) | Ne | Ano |
| Datové požadavky (lookups) | Ne | Ano |
| Skupiny pravidel | Ne | Ano |
| TypeScript typová kontrola | Ne | Ano |

Pokud potřebujete kteroukoliv z nepodporovaných funkcí, použijte fluent builder nebo surové objekty.

## Cvičení

Napište tři pravidla pomocí tagged šablony `rule`:

1. **Stock Alert**: Když se vyvolá `inventory.updated` a `event.quantity` <= 10, emitujte `alert.low_stock` s ID produktu a zalogujte varování.
2. **Restock Confirmation**: Když se vyvolá `inventory.restocked`, nastavte fakt `product:${productId}:inStock` na `true`.
3. **Price Change Audit**: Když se vyvolá `product.price_changed` a nová cena != stará cena, zalogujte informační zprávu o změně.

<details>
<summary>Řešení</summary>

```typescript
import { rule } from '@hamicek/noex-rules/dsl';

// Pravidlo 1: Upozornění na nízký sklad
const stockAlert = rule`
  id: stock-alert
  name: Low Stock Alert
  priority: 100
  tags: inventory, alerts

  WHEN event inventory.updated
  IF event.quantity <= 10
  THEN emit alert.low_stock { productId: event.productId, quantity: event.quantity }
  THEN log warn "Low stock for product"
`;

// Pravidlo 2: Potvrzení naskladnění
const restockConfirm = rule`
  id: restock-confirm
  name: Restock Confirmation
  priority: 80
  tags: inventory

  WHEN event inventory.restocked
  THEN setFact product:restocked:inStock true
  THEN log info "Product restocked"
`;

// Pravidlo 3: Audit změny ceny
const priceAudit = rule`
  id: price-audit
  name: Price Change Audit
  priority: 50
  tags: products, audit

  WHEN event product.price_changed
  IF event.newPrice != event.oldPrice
  THEN log info "Price changed"
`;

[stockAlert, restockConfirm, priceAudit].forEach(r => engine.registerRule(r));
```

Každé pravidlo je samostatné v jednom šablonovém literálu. Parser konvertuje text na stejné objekty `RuleInput`, jaké produkuje `Rule.create().build()`.

</details>

## Shrnutí

- `rule` je funkce tagged šablony, která parsuje řádkově orientované DSL do objektu `RuleInput`
- Vlastnosti (`id`, `name`, `priority`, `tags`, `description`, `enabled`) používají syntaxi `klíč: hodnota`
- `WHEN event|fact|timer <cíl>` definuje trigger (vyžadován přesně jeden)
- `IF` a `AND` definují podmínky s operátory: `==`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not_in`, `contains`, `not_contains`, `matches`, `exists`, `not_exists`
- `THEN` definuje akce: `emit`, `setFact`, `deleteFact`, `log`, `cancelTimer`
- Hodnoty s prefixem `event.`, `fact.` nebo `context.` v datových objektech se automaticky stávají `{ ref: 'cesta' }` referencemi
- JavaScript `${výraz}` interpolace se vyhodnocuje v době definice, ne za běhu
- Komentáře (`#`, `//`) a prázdné řádky se ignorují
- Parser vyhodí `ParseError` s čísly řádků při syntaktických chybách a `Error` pokud chybí povinná pole
- Používejte tagged šablony pro prototypování a jednoduchá pravidla; přejděte na fluent builder pro časovače, služby, temporální vzory a plnou typovou bezpečnost

---

Další: [YAML pravidla](./03-yaml-pravidla.md)
