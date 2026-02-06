# DSL Tagged Templates

Tagged template literal syntaxe pro definování pravidel v kompaktním, čitelném textovém formátu.

## Import

```typescript
import { rule, parseRuleTemplate, ParseError } from '@hamicek/noex-rules';
```

---

## rule

```typescript
function rule(strings: TemplateStringsArray, ...values: unknown[]): RuleInput
```

Tagged template literal, který parsuje definici pravidla do objektu `RuleInput` připraveného k registraci v enginu. Interpolované hodnoty jsou převedeny na string a vloženy do šablony před parsováním.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| strings | `TemplateStringsArray` | ano | Statické segmenty šablonového řetězce |
| values | `unknown[]` | ano | Interpolované hodnoty |

**Návratová hodnota:** `RuleInput` — Validovaný objekt pravidla

**Vyhazuje:**

- `ParseError` — Při syntaktických chybách (obsahuje číslo řádku a zdrojový text)
- `Error` — Pokud chybí povinná pole (`id`, `WHEN`, `THEN`)

**Základní příklad:**

```typescript
const myRule = rule`
  id: order-notification
  name: Send Order Notification
  priority: 100

  WHEN event order.created
  IF event.amount >= 100
  THEN emit notification.send { orderId: event.orderId }
`;

engine.registerRule(myRule);
```

**Příklad s interpolací:**

```typescript
const topic = 'order.created';
const threshold = 100;

const myRule = rule`
  id: dynamic-rule
  WHEN event ${topic}
  IF event.amount >= ${threshold}
  THEN emit result
`;
```

---

## parseRuleTemplate()

```typescript
function parseRuleTemplate(input: string): RuleInput
```

Parsuje textovou šablonu pravidla do objektu `RuleInput`. Toto je interní parser používaný tagged template `rule` — použijte ho přímo při práci s řetězci ze souborů nebo jiných zdrojů.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| input | `string` | ano | Surový textový řetězec šablony |

**Návratová hodnota:** `RuleInput` — Validovaný objekt pravidla

**Vyhazuje:**

- `ParseError` — Při syntaktických chybách (obsahuje číslo řádku)
- `Error` — Pokud chybí `id`, `WHEN`, nebo `THEN`

**Příklad:**

```typescript
const ruleText = `
  id: from-string
  WHEN event test.trigger
  THEN emit test.result
`;

const ruleInput = parseRuleTemplate(ruleText);
engine.registerRule(ruleInput);
```

---

## Syntaxe šablony

Formát šablony je řádkově orientovaný. Každý řádek je jeden z:

- **Vlastnost** — `key: value`
- **Trigger** — `WHEN event|fact|timer <target>`
- **Podmínka** — `IF <source> <operator> <value>` nebo `AND ...`
- **Akce** — `THEN emit|setFact|deleteFact|log|cancelTimer ...`
- **Komentář** — Řádky začínající `#` nebo `//`
- **Prázdné řádky** — Ignorovány

### Vlastnosti

| Vlastnost | Typ | Povinný | Popis |
|-----------|-----|---------|-------|
| id | `string` | ano | Unikátní identifikátor pravidla |
| name | `string` | ne | Čitelný název (výchozí je `id`) |
| description | `string` | ne | Popis pravidla |
| priority | `number` | ne | Priorita vykonání (výchozí `0`) |
| enabled | `boolean` | ne | Zda je pravidlo aktivní (výchozí `true`) |
| tags | `string` | ne | Seznam tagů oddělených čárkou |

**Příklad:**

```
id: order-processor
name: Process Large Orders
description: Routes large orders to premium processing
priority: 100
enabled: true
tags: orders, notifications, premium
```

### Triggery (WHEN)

Klauzule `WHEN` definuje, co aktivuje pravidlo.

| Syntaxe | Popis |
|---------|-------|
| `WHEN event <topic>` | Aktivace událostí na daném topicu |
| `WHEN fact <pattern>` | Aktivace změnou faktu odpovídající vzoru |
| `WHEN timer <name>` | Aktivace expirací pojmenovaného časovače |

**Příklady:**

```
WHEN event order.created
WHEN fact customer:*:status
WHEN timer payment-timeout
```

### Podmínky (IF / AND)

Podmínky filtrují, kdy se má pravidlo aktivovat. Více podmínek používá `AND` — všechny musí být pravdivé.

**Syntaxe:** `IF|AND <source>.<field> <operator> <value>`

**Typy zdrojů:**

| Prefix | Popis |
|--------|-------|
| `event.` | Pole z aktivující události |
| `fact.` | Hodnota z fact store (klíč jako pole) |
| `context.` | Kontextová proměnná |

**Operátory:**

| Operátor | Popis |
|----------|-------|
| `==` | Rovná se |
| `!=` | Nerovná se |
| `>` | Větší než |
| `>=` | Větší nebo rovno |
| `<` | Menší než |
| `<=` | Menší nebo rovno |
| `in` | Hodnota je v poli |
| `not_in` | Hodnota není v poli |
| `contains` | String/pole obsahuje hodnotu |
| `not_contains` | String/pole neobsahuje hodnotu |
| `matches` | Regex shoda |
| `exists` | Pole existuje (unární) |
| `not_exists` | Pole neexistuje (unární) |

**Formáty hodnot:**

| Formát | Příklad | Popis |
|--------|---------|-------|
| Číslo | `100`, `3.14` | Číselný literál |
| String | `"confirmed"`, `'pending'` | Řetězec v uvozovkách |
| Boolean | `true`, `false` | Boolean literál |
| Null | `null` | Hodnota null |
| Pole | `[1, 2, 3]`, `["a", "b"]` | Literál pole |
| Regex | `/pattern/` | Regulární výraz |

**Příklady:**

```
IF event.amount >= 100
AND event.status == "confirmed"
AND event.type in ["premium", "vip"]
AND fact.customer:active exists
```

### Akce (THEN)

Akce definují, co se stane při aktivaci pravidla. Podporováno je více akcí.

#### emit

Emituje novou událost.

```
THEN emit <topic>
THEN emit <topic> { key: value, ... }
```

**Příklady:**

```
THEN emit notification.send
THEN emit order.processed { orderId: event.orderId, status: "completed" }
```

Syntaxe referencí (`event.field`, `fact.key`, `context.var`) v hodnotách objektu vytváří dynamické reference vyhodnocované za běhu.

#### setFact

Nastaví fakt ve fact store.

```
THEN setFact <key> <value>
```

**Příklady:**

```
THEN setFact order:status "processed"
THEN setFact customer:vip true
THEN setFact order:amount event.amount
```

#### deleteFact

Smaže fakt z fact store.

```
THEN deleteFact <key>
```

**Příklad:**

```
THEN deleteFact order:pending
```

#### log

Zaloguje zprávu na dané úrovni.

```
THEN log <level> <message>
```

**Úrovně:** `debug`, `info`, `warn`, `error`

**Příklady:**

```
THEN log info "Order processed successfully"
THEN log warn "High-value order detected"
```

#### cancelTimer

Zruší běžící časovač.

```
THEN cancelTimer <name>
```

**Příklad:**

```
THEN cancelTimer payment-timeout
```

---

## Kompletní příklad

```typescript
const orderRule = rule`
  # Order processing rule
  id: process-large-orders
  name: Large Order Handler
  description: Routes orders over $100 to premium processing
  priority: 100
  tags: orders, premium

  WHEN event order.created
  IF event.amount >= 100
  AND event.status == "confirmed"
  THEN emit premium.process { orderId: event.orderId, amount: event.amount }
  THEN setFact order:${event.orderId}:tier "premium"
  THEN log info "Premium order received"
`;

engine.registerRule(orderRule);
```

### Příklad s více podmínkami

```typescript
const vipRule = rule`
  id: vip-customer-alert
  WHEN event purchase.completed
  IF event.total >= 1000
  AND fact.customer:vip == true
  AND context.region in ["us", "eu"]
  THEN emit vip.alert { customerId: event.customerId }
  THEN log info "VIP purchase alert"
`;
```

### Příklad s fact triggerem

```typescript
const stockRule = rule`
  id: low-stock-alert
  WHEN fact inventory:*:quantity
  IF fact.${trigger.key} < 10
  THEN emit inventory.low { product: trigger.key }
`;
```

---

## ParseError

```typescript
class ParseError extends DslError {
  readonly line: number;
  readonly source: string;

  constructor(message: string, line: number, source: string);
}
```

Vyhazováno, když parser šablony pravidla narazí na syntaktickou chybu. Obsahuje číslo chybného řádku a zdrojový text pro diagnostiku.

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| line | `number` | Číslo řádku, kde došlo k chybě (indexováno od 1) |
| source | `string` | Zdrojový text chybného řádku |
| message | `string` | Kompletní chybová zpráva včetně informací o řádku |
| name | `string` | Vždy `'ParseError'` |

**Zpracování chyb:**

```typescript
import { rule, ParseError, DslError } from '@hamicek/noex-rules';

try {
  const badRule = rule`
    id: broken-rule
    WHEN event test
    IF unknown.field badoperator value
    THEN emit result
  `;
} catch (err) {
  if (err instanceof ParseError) {
    console.error(`Syntaktická chyba na řádku ${err.line}: ${err.message}`);
    console.error(`Zdroj: ${err.source}`);
  } else if (err instanceof DslError) {
    console.error('DSL chyba:', err.message);
  }
}
```

**Časté chyby:**

| Chyba | Příčina |
|-------|---------|
| `Unknown property "..."` | Neplatný klíč vlastnosti |
| `Invalid WHEN clause` | Chybí typ triggeru nebo cíl |
| `Unknown trigger type "..."` | Typ triggeru není `event`, `fact`, ani `timer` |
| `Invalid source "..."` | Zdroj podmínky není `event.`, `fact.`, ani `context.` |
| `Unknown operator "..."` | Neplatný porovnávací operátor |
| `Unknown action "..."` | Nerozpoznaný typ akce |
| `Rule template: "id" property is required` | Chybí vlastnost `id` |
| `WHEN clause is required` | Chybí řádek `WHEN` |
| `at least one THEN clause is required` | Chybí řádek `THEN` |

---

## Typy

### RuleInput

```typescript
interface RuleInput {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  tags: string[];
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
}
```

Výstup produkovaný `rule` a `parseRuleTemplate()`. Připraven pro přímou registraci pomocí `engine.registerRule()`.

---

## Srovnání s Fluent Builderem

| Vlastnost | Tagged Template | Fluent Builder |
|-----------|-----------------|----------------|
| Typová bezpečnost | Runtime validace | Compile-time typy |
| IDE podpora | Pouze zvýraznění syntaxe | Plný autocomplete |
| Čitelnost | Velmi vysoká pro jednoduchá pravidla | Dobrá pro složitá pravidla |
| Dynamické hodnoty | String interpolace | Nativní JavaScript |
| Temporální vzory | Nepodporováno | Plná podpora |
| Podmíněné akce | Nepodporováno | Plná podpora |

Používejte tagged templates pro jednoduché, čitelné definice pravidel. Použijte fluent builder pro složitá pravidla s temporálními vzory, podmíněnými akcemi nebo když potřebujete plnou typovou bezpečnost.

---

## Viz také

- [DSL Builder](./09-dsl-builder.md) — Typově bezpečné fluent builder API
- [DSL Triggery](./10-dsl-triggers.md) — Buildery triggerů včetně temporálních vzorů
- [DSL Podmínky](./11-dsl-conditions.md) — Buildery podmínek
- [DSL Akce](./12-dsl-actions.md) — Buildery akcí
- [YAML Loader](./14-dsl-yaml.md) — Načítání pravidel z YAML souborů
- [Validace](./17-validation.md) — Validace pravidel
