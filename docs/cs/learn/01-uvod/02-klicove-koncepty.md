# Klíčové koncepty

Než se ponoříme do kódu, vytvořme si jasný mentální model toho, jak noex-rules funguje. Engine má malý počet základních konceptů, které se skládají do mocného chování. Jejich pochopení nyní učiní vše ostatní přímočarým.

## Co se naučíte

- Co jsou pravidla a jak funguje model trigger-podmínka-akce
- Rozdíl mezi fakty (perzistentní stav) a událostmi (jednorázové signály)
- Jak časovače umožňují plánovanou a časově závislou logiku
- Co znamená forward chaining a proč ho engine používá
- Jak Complex Event Processing detekuje vzory napříč událostmi

## Engine na první pohled

```text
                        ┌───────────────────────────────────────────┐
                        │              RULE ENGINE                   │
                        │                                            │
  ┌──────────┐          │  ┌────────────┐       ┌────────────────┐  │
  │ Události │────────► │  │  Trigger   │──────►│  Vyhodnocení   │  │
  │ emit()   │          │  │  Matcher   │       │   podmínek     │  │
  └──────────┘          │  └────────────┘       └───────┬────────┘  │
                        │        ▲                      │           │
  ┌──────────┐          │        │                      ▼           │
  │  Fakta   │────────► │  ┌─────┴──────┐       ┌────────────────┐  │
  │ setFact()│          │  │  Úložiště  │       │   Vykonání     │  │
  └──────────┘          │  │  pravidel  │       │     akcí       │  │
                        │  └────────────┘       └───────┬────────┘  │
  ┌──────────┐          │        ▲                      │           │
  │ Časovače │────────► │  ┌─────┴──────┐       ┌───────▼────────┐  │
  │ expired  │          │  │ Temporální │       │ Vedlejší efekty│  │
  └──────────┘          │  │ procesor   │       │  set_fact      │  │
                        │  └────────────┘       │  emit_event    │  │
                        │                       │  set_timer     │  │
                        │                       │  call_service  │  │
                        │                       │  log           │  │
                        │                       └────────────────┘  │
                        └───────────────────────────────────────────┘
```

Když se něco stane (přijde událost, změní se fakt, vyprší časovač), engine najde všechna pravidla, jejichž trigger odpovídá, vyhodnotí jejich podmínky a vykoná akce těch, které projdou.

## Pravidla

Pravidlo je základní jednotka. Deklaruje *kdy* se aktivovat, *zda* se spustit a *co* udělat:

```typescript
{
  id: 'order-notification',
  name: 'Notify on Large Orders',
  priority: 100,             // Vyšší = vyhodnoceno dříve
  enabled: true,
  tags: ['orders', 'notifications'],

  trigger: {                 // KDY: přijde událost order.created
    type: 'event',
    topic: 'order.created',
  },

  conditions: [              // ZDA: amount >= 1000
    {
      source: { type: 'event', field: 'amount' },
      operator: 'gte',
      value: 1000,
    },
  ],

  actions: [                 // CO: emitovat notifikační událost
    {
      type: 'emit_event',
      topic: 'notification.send',
      data: {
        orderId: { ref: 'event.orderId' },
        message: 'Přijata velká objednávka',
      },
    },
  ],
}
```

### Vlastnosti pravidla

| Vlastnost | Účel |
|-----------|------|
| `id` | Unikátní identifikátor |
| `name` | Lidsky čitelný název |
| `priority` | Pořadí vyhodnocení — vyšší čísla první |
| `enabled` | Přepínání bez odebrání pravidla |
| `tags` | Štítky pro filtrování a organizaci |
| `group` | Volitelné členství ve skupině pro hromadné řízení |
| `trigger` | Co aktivuje pravidlo |
| `conditions` | Všechny musí projít, aby se pravidlo spustilo |
| `actions` | Co se stane, když se pravidlo spustí |
| `lookups` | Volitelné požadavky na externí data |

## Triggery

Trigger definuje *kdy* by mělo být pravidlo zváženo pro vyhodnocení. Existují čtyři typy triggerů:

### Event trigger

Aktivuje se, když přijde událost s odpovídajícím topikem:

```typescript
{ type: 'event', topic: 'order.created' }
```

### Fact trigger

Aktivuje se, když se změní fakt odpovídající vzoru:

```typescript
{ type: 'fact', pattern: 'customer:*:tier' }
```

Zástupný znak `*` odpovídá jakémukoli segmentu, takže se spustí pro `customer:123:tier`, `customer:456:tier` atd.

### Timer trigger

Aktivuje se, když vyprší pojmenovaný časovač:

```typescript
{ type: 'timer', name: 'payment-timeout:ORD-123' }
```

### Temporální trigger

Aktivuje se, když je detekován Complex Event Processing vzor:

```typescript
{
  type: 'temporal',
  pattern: {
    type: 'sequence',
    events: [
      { topic: 'order.created' },
      { topic: 'payment.received' },
    ],
    within: '30m',
    groupBy: 'orderId',
  },
}
```

Temporální vzory podrobně pokryjeme v [Části 5: CEP](../05-cep/01-co-je-cep.md).

### Porovnání triggerů

| Typ triggeru | Aktivuje se na | Případ použití |
|-------------|----------------|----------------|
| `event` | Emitovaná událost | Reagovat na něco, co se stalo |
| `fact` | Změněná hodnota faktu | Reagovat na změny stavu |
| `timer` | Vypršený časovač | Plánovaná/odložená logika |
| `temporal` | Detekovaný vzor | Korelace více událostí |

## Fakta

Fakta představují perzistentní stav, nad kterým engine uvažuje. Jsou to páry klíč-hodnota, které přetrvávají napříč vyhodnoceními pravidel:

```typescript
// Nastavení faktů
await engine.setFact('customer:C-100:tier', 'vip');
await engine.setFact('customer:C-100:spending', 4250);
await engine.setFact('inventory:SKU-42:quantity', 15);

// Čtení faktů
const tier = engine.getFact('customer:C-100:tier');  // 'vip'

// Dotazování faktů pomocí zástupných vzorů
const customerFacts = engine.queryFacts('customer:C-100:*');
// Vrátí všechny fakty odpovídající vzoru

// Mazání faktů
engine.deleteFact('customer:C-100:spending');
```

### Konvence formátu klíčů

Klíče faktů používají hierarchický formát oddělený dvojtečkami: `entita:id:pole`. To umožňuje dotazy se zástupnými znaky:

```text
customer:C-100:tier          ──► konkrétní pole zákazníka
customer:C-100:*             ──► všechna pole zákazníka C-100
customer:*:tier              ──► tier všech zákazníků
order:ORD-1:*                ──► všechna pole objednávky ORD-1
```

### Fakta vs události

| | Fakta | Události |
|---|-------|----------|
| **Perzistence** | Zůstávají, dokud nejsou změněna nebo smazána | Spustí se jednou a jsou spotřebována |
| **Trigger** | Spouštějí pravidla při změně hodnoty | Spouštějí pravidla při emitování |
| **Přístup** | Čitelná z podmínek kdykoli | Data dostupná pouze během spuštěného vyhodnocení |
| **Analogie** | „Zákazník *je* VIP" (aktuální stav) | „Objednávka *byla* vytvořena" (něco se stalo) |

**Klíčový poznatek**: Používejte fakta pro stav, na který se musí odkazovat jiná pravidla později. Používejte události pro signály, které řídí okamžité reakce.

## Události

Události jsou jednorázové signály, které procházejí enginem. Když emitujete událost, engine najde všechna pravidla, jejichž trigger odpovídá topiku, a vyhodnotí je:

```typescript
// Emitování události
await engine.emit('order.created', {
  orderId: 'ORD-123',
  customerId: 'C-100',
  total: 750,
  items: ['SKU-42', 'SKU-17'],
});

// Odběr událostí (včetně těch emitovaných pravidly)
engine.subscribe('order.*', (event) => {
  console.log(event.topic, event.data);
});

// Emitování s korelačním sledováním
await engine.emitCorrelated(
  'payment.received',
  { orderId: 'ORD-123', amount: 750 },
  'correlation-123',  // Propojuje související události
);
```

Události nesou:
- **topic**: Řetězec oddělený tečkami jako `order.created`, `payment.failed`
- **data**: Libovolný payload přístupný v podmínkách a akcích
- **timestamp**: Kdy byla událost emitována
- **correlationId** (volitelné): Propojuje související události pro trasování

## Podmínky

Podmínky určují, zda se pravidlo má spustit. Podmínky pravidla musí *všechny* projít (logický AND):

```typescript
conditions: [
  // Kontrola hodnoty ze spouštěcí události
  {
    source: { type: 'event', field: 'total' },
    operator: 'gte',
    value: 100,
  },
  // Kontrola perzistentního faktu
  {
    source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
    operator: 'eq',
    value: 'vip',
  },
]
```

### Zdroje podmínek

| Zdroj | Čte z | Příklad |
|-------|-------|---------|
| `event` | Data spouštěcí události | `{ type: 'event', field: 'amount' }` |
| `fact` | Úložiště faktů | `{ type: 'fact', pattern: 'customer:123:tier' }` |
| `context` | Kontextové proměnné enginu | `{ type: 'context', key: 'environment' }` |
| `lookup` | Výsledek externí služby | `{ type: 'lookup', name: 'userService' }` |
| `baseline` | Baseline detekce anomálií | `{ type: 'baseline', metric: 'avg_order_value', comparison: 'above' }` |

### Operátory

| Operátor | Význam | Příklad |
|----------|--------|---------|
| `eq`, `neq` | Rovnost / nerovnost | `value: 'vip'` |
| `gt`, `gte`, `lt`, `lte` | Číselné porovnání | `value: 100` |
| `in`, `not_in` | Členství v seznamu | `value: ['vip', 'gold']` |
| `contains`, `not_contains` | Řetězec/pole obsahuje | `value: 'express'` |
| `matches` | Regulární výraz | `value: '^ORD-\\d+'` |
| `exists`, `not_exists` | Přítomnost hodnoty | (hodnota se ignoruje) |

### Reference

Místo statických hodnot mohou podmínky odkazovat na jiná data:

```typescript
{
  source: { type: 'event', field: 'shippingCountry' },
  operator: 'neq',
  value: { ref: 'fact.customer:${event.customerId}:country' },
}
```

Toto porovnává zemi doručení z události s uloženou zemí zákazníka — užitečné pro detekci podvodů.

## Akce

Akce definují, co se stane, když se pravidlo spustí. Vykonávají se v pořadí:

```typescript
actions: [
  // Aktualizace perzistentního stavu
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:status',
    value: 'approved',
  },
  // Emitování události (může spustit další pravidla)
  {
    type: 'emit_event',
    topic: 'order.approved',
    data: { orderId: { ref: 'event.orderId' } },
  },
  // Naplánování budoucí akce
  {
    type: 'set_timer',
    timer: {
      name: 'shipping-reminder:${event.orderId}',
      duration: '24h',
      onExpire: {
        topic: 'shipping.reminder',
        data: { orderId: { ref: 'event.orderId' } },
      },
    },
  },
  // Log pro debugging
  {
    type: 'log',
    level: 'info',
    message: 'Objednávka ${event.orderId} schválena',
  },
]
```

### Dostupné akce

| Akce | Efekt |
|------|-------|
| `set_fact` | Vytvoření nebo aktualizace faktu |
| `delete_fact` | Odebrání faktu |
| `emit_event` | Emitování nové události (může spustit další pravidla) |
| `set_timer` | Naplánování budoucí události |
| `cancel_timer` | Zrušení naplánovaného časovače |
| `call_service` | Volání registrované externí služby |
| `log` | Zápis log zprávy |
| `conditional` | Podmíněné vykonání akcí (if/then/else) |

## Časovače

Časovače plánují budoucí akce. Když časovač vyprší, emituje událost, která může spustit pravidla:

```typescript
// Nastavení časovače přes API enginu
await engine.setTimer({
  name: 'payment-timeout:ORD-123',
  duration: '30m',                    // Podporuje: ms, s, m, h, d, w, y
  onExpire: {
    topic: 'payment.timeout',
    data: { orderId: 'ORD-123' },
  },
});

// Zrušení, pokud platba přijde včas
await engine.cancelTimer('payment-timeout:ORD-123');
```

Časovače jsou běžně nastavovány a rušeny akcemi pravidel, čímž vytvářejí reaktivní workflow:

```text
  order.created ──► Pravidlo: "Nastav platební časovač"
                     └── set_timer('payment-timeout:ORD-X', '30m')

  payment.received ──► Pravidlo: "Zruš platební časovač"
                        └── cancel_timer('payment-timeout:ORD-X')

  časovač vyprší ──► Pravidlo: "Zpracuj timeout platby"
                      └── emit_event('order.cancelled', reason: 'payment_timeout')
```

## Forward Chaining

noex-rules je engine s **forward chainingem**. To znamená, že vyhodnocení je řízeno příchozími daty, ne dotazováním na závěry.

```text
FORWARD CHAINING (řízený daty)
══════════════════════════════
  Data přijdou ──► Engine najde odpovídající pravidla ──► Vyhodnotí podmínky ──► Vykoná akce
       │                                                                            │
       │                                                                            │
       └────── Nová fakta/události z akcí spustí další vyhodnocení pravidel ────────┘
```

Když akce pravidla nastaví fakt nebo emituje událost, může to spustit další pravidla a vytvořit řetězec inference. Engine to řeší automaticky.

**Příklad řetězení:**

```text
  událost: order.created
       │
       ▼
  Pravidlo: "VIP sleva" ──► nastaví fakt: order:ORD-1:discount = 0.1
                                  │
                                  ▼
                            Pravidlo: "Sleva aplikována" ──► emituje: discount.applied
                                                                │
                                                                ▼
                                                          Pravidlo: "Log slevy" ──► log()
```

Vývojář registruje tři nezávislá pravidla. Engine je řetězí automaticky na základě jejich triggerů.

## Complex Event Processing (CEP)

Někdy jedna událost nestačí. Potřebujete detekovat vzory napříč více událostmi v čase:

- **Sekvence**: „Objednávka vytvořena, poté platba přijata do 30 minut"
- **Absence**: „Objednávka vytvořena, ale žádná platba do 30 minut"
- **Počet**: „Více než 5 neúspěšných přihlášení za 10 minut"
- **Agregace**: „Celková částka transakcí překročí $10 000 za 1 hodinu"

Toto jsou temporální vzory a vyjadřují se jako triggery:

```typescript
// Detekce 5+ neúspěšných přihlášení za 10 minut ze stejné IP
{
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'count',
      event: { topic: 'auth.login_failed' },
      threshold: 5,
      comparison: 'gte',
      window: '10m',
      groupBy: 'ip',
    },
  },
  conditions: [],
  actions: [
    {
      type: 'emit_event',
      topic: 'security.brute_force',
      data: { ip: { ref: 'event.ip' } },
    },
  ],
}
```

Všechny čtyři CEP vzory podrobně prozkoumáme v [Části 5](../05-cep/01-co-je-cep.md).

## Jak se koncepty mapují na reálné problémy

| Koncept | Analogie z reálného světa | Příklad |
|---------|---------------------------|---------|
| **Pravidlo** | Politika v manuálu | „Pokud objednávka > $500, aplikuj dopravu zdarma" |
| **Událost** | Něco, co se stalo | „Zákazník zadal objednávku" |
| **Fakt** | Něco, co je právě teď pravda | „Zákazník C-100 je VIP" |
| **Časovač** | Připomínka nebo termín | „Pokud nezaplaceno do 30 min, zruš objednávku" |
| **Podmínka** | Kontrola před jednáním | „Je zákazník VIP?" |
| **Akce** | Odpověď | „Aplikuj 10% slevu" |
| **Forward Chaining** | Dominový efekt | „Sleva aplikována" spustí „Odeslat potvrzení" |
| **CEP vzor** | Přehrávka bezpečnostní kamery | „5 neúspěšných přihlášení za 10 min = zamkni účet" |

## Cvičení

Pomocí konceptů z této kapitoly klasifikujte následující business požadavek do příslušných komponent enginu.

**Požadavek**: „Když zákazník zadá objednávku, zkontrolujte, zda je VIP. Pokud je a objednávka překročí $200, aplikujte 15% slevu a odešlete potvrzovací email. Také, pokud objednávka není odeslána do 48 hodin, upozorněte manažera skladu."

Identifikujte:
1. Jaké události jsou zapojeny?
2. Jaké fakty engine potřebuje?
3. Kolik pravidel to vyžaduje?
4. Jaké triggery, podmínky a akce má každé pravidlo?
5. Kde se uplatní časovače?

<details>
<summary>Řešení</summary>

**Události:**
- `order.created` (příchozí)
- `discount.applied` (emitovaná pravidlem)
- `email.send` (emitovaná pravidlem)
- `order.shipped` (příchozí, ze skladu)
- `shipping.overdue` (emitovaná při vypršení časovače)

**Fakta:**
- `customer:{id}:tier` — ukládá úroveň zákazníka ("vip", "standard")
- `order:{id}:discount` — ukládá aplikovanou slevu

**Pravidlo 1: VIP sleva**
- Trigger: událost `order.created`
- Podmínky: fakt `customer:{customerId}:tier` eq "vip" AND událost `total` gt 200
- Akce: nastavit fakt `order:{orderId}:discount` = 0.15, emitovat událost `discount.applied`

**Pravidlo 2: Potvrzovací email objednávky**
- Trigger: událost `discount.applied`
- Podmínky: (žádné — vždy odeslat, když je sleva aplikována)
- Akce: emitovat událost `email.send` se šablonou "order_confirmation_vip"

**Pravidlo 3: Nastavení časovače doručení**
- Trigger: událost `order.created`
- Podmínky: (žádné — vždy nastavit časovač pro nové objednávky)
- Akce: nastavit časovač `shipping-deadline:{orderId}` na 48h, při vypršení emitovat `shipping.overdue`

**Pravidlo 4: Zrušení časovače doručení**
- Trigger: událost `order.shipped`
- Podmínky: (žádné)
- Akce: zrušit časovač `shipping-deadline:{orderId}`

**Pravidlo 5: Upozornění manažera skladu**
- Trigger: událost `shipping.overdue`
- Podmínky: (žádné)
- Akce: emitovat událost `email.send` se šablonou "shipping_overdue_alert"

Všimněte si, jak pravidla 1 a 2 tvoří forward chain: pravidlo slevy emituje událost, která spustí pravidlo emailu. Pravidla 3-5 demonstrují vzor časovače pro vynucení termínů.

</details>

## Shrnutí

- **Pravidlo** je trojice trigger-podmínka-akce: základní jednotka enginu
- **Události** jsou jednorázové signály („něco se stalo"), **fakta** jsou perzistentní stav („něco je pravda")
- **Časovače** plánují budoucí události, umožňují workflow s termíny a připomínkami
- **Podmínky** kontrolují data událostí, fakta, kontext a externí lookupy pomocí bohaté sady operátorů
- **Akce** modifikují fakta, emitují události, spravují časovače, volají služby a logují
- **Forward chaining** znamená, že data řídí vyhodnocení — nová data z akcí mohou spustit další pravidla
- **CEP vzory** detekují temporální korelace: sekvence, absence, počty a agregace
- Všechny koncepty se přirozeně skládají: události spouštějí pravidla, která nastavují fakta, která spouštějí další pravidla

---

Další: [Váš první pravidlový engine](../02-zaciname/01-prvni-engine.md)
