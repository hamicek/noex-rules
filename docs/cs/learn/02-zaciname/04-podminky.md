# Podmínky do hloubky

Podmínky jsou strážci vykonání pravidel. Trigger pravidla rozhoduje *kdy* ho vyhodnotit, ale podmínky rozhodují *zda* se spustí. Tato kapitola pokrývá každý operátor, každý typ zdroje, dynamické reference a řetězcovou interpolaci — vše potřebné pro přesné cílení pravidel.

## Co se naučíte

- Všech 12 operátorů podmínek a kdy každý použít
- Čtyři typy zdrojů podmínek
- Jak používat dynamické reference pro porovnání hodnot z různých zdrojů
- Jak funguje řetězcová interpolace ve vzorech faktů
- Jak se podmínky kombinují (logika AND)

## Struktura podmínky

Každá podmínka má tři části:

```typescript
{
  source: { type: 'event', field: 'total' },  // ODKUD číst hodnotu
  operator: 'gte',                              // JAK porovnávat
  value: 1000,                                  // S ČÍM porovnávat
}
```

Engine přečte hodnotu ze `source`, aplikuje `operator` a porovná s `value`. Pokud porovnání je pravdivé, podmínka projde.

Všechny podmínky v pravidle musí projít, aby se pravidlo spustilo (logický AND). Není vestavěný OR — místo toho použijte samostatná pravidla.

## Operátory

### Rovnost

```typescript
// Přesná shoda
{ source: { type: 'event', field: 'status' }, operator: 'eq', value: 'active' }

// Nerovná se
{ source: { type: 'event', field: 'status' }, operator: 'neq', value: 'cancelled' }
```

`eq` používá přísnou rovnost (`===`). Funguje s řetězci, čísly, booleany a `null`.

### Číselné porovnání

```typescript
// Větší než
{ source: { type: 'event', field: 'total' }, operator: 'gt', value: 1000 }

// Větší nebo rovno
{ source: { type: 'event', field: 'total' }, operator: 'gte', value: 1000 }

// Menší než
{ source: { type: 'event', field: 'quantity' }, operator: 'lt', value: 10 }

// Menší nebo rovno
{ source: { type: 'event', field: 'quantity' }, operator: 'lte', value: 10 }
```

Tyto operátory vyžadují, aby obě strany byly čísla. Pokud některá hodnota není číslo, podmínka selže.

### Členství v seznamu

```typescript
// Hodnota je jedna z položek seznamu
{ source: { type: 'event', field: 'tier' }, operator: 'in', value: ['vip', 'gold', 'platinum'] }

// Hodnota není v seznamu
{ source: { type: 'event', field: 'category' }, operator: 'not_in', value: ['test', 'internal'] }
```

`in` kontroluje, zda zdrojová hodnota existuje v poli. `not_in` je jeho negace.

### Obsahuje

```typescript
// Řetězec obsahuje podřetězec
{ source: { type: 'event', field: 'email' }, operator: 'contains', value: '@company.com' }

// Pole obsahuje prvek
{ source: { type: 'event', field: 'tags' }, operator: 'contains', value: 'urgent' }

// Negace
{ source: { type: 'event', field: 'name' }, operator: 'not_contains', value: 'test' }
```

`contains` funguje na řetězcích i polích:
- Pro řetězce: `value.includes(compareValue)`
- Pro pole: `value.includes(compareValue)`

### Regulární výraz

```typescript
// Shoda se vzorem
{ source: { type: 'event', field: 'orderId' }, operator: 'matches', value: '^ORD-\\d{3,}$' }

// Formát emailu
{ source: { type: 'event', field: 'email' }, operator: 'matches', value: '^[\\w.]+@[\\w.]+\\.[a-z]{2,}$' }
```

`matches` zkompiluje řetězec value jako regulární výraz a otestuje ho proti zdrojové hodnotě. Regex je cachovaný pro výkon.

### Existence

```typescript
// Hodnota existuje (není undefined ani null)
{ source: { type: 'fact', pattern: 'customer:C-100:tier' }, operator: 'exists', value: null }

// Hodnota neexistuje
{ source: { type: 'fact', pattern: 'customer:C-100:discount' }, operator: 'not_exists', value: null }
```

Pro `exists` a `not_exists` je pole `value` ignorováno — můžete ho nastavit na `null` nebo jakoukoli hodnotu.

### Přehled operátorů

| Operátor | Typ | Podmínka projde, když |
|----------|-----|----------------------|
| `eq` | Jakýkoli | `source === value` |
| `neq` | Jakýkoli | `source !== value` |
| `gt` | Číslo | `source > value` |
| `gte` | Číslo | `source >= value` |
| `lt` | Číslo | `source < value` |
| `lte` | Číslo | `source <= value` |
| `in` | Jakýkoli / Pole | `value.includes(source)` |
| `not_in` | Jakýkoli / Pole | `!value.includes(source)` |
| `contains` | Řetězec nebo pole | `source.includes(value)` |
| `not_contains` | Řetězec nebo pole | `!source.includes(value)` |
| `matches` | Řetězec | `/value/.test(source)` |
| `exists` | Jakýkoli | `source !== undefined && source !== null` |
| `not_exists` | Jakýkoli | `source === undefined \|\| source === null` |

## Typy zdrojů

Pole `source` určuje, odkud podmínka čte svou hodnotu.

### Zdroj event

Čte z objektu `data` spouštěcí události:

```typescript
{ type: 'event', field: 'total' }           // event.data.total
{ type: 'event', field: 'customer.name' }    // event.data.customer.name (vnořené)
```

Dostupné, když je pravidlo spuštěno událostí. Pro pravidla spouštěná fakty „event" obsahuje data změny faktu (`key`, `value`, `previousValue`, `type`).

### Zdroj fact

Čte z úložiště faktů:

```typescript
{ type: 'fact', pattern: 'customer:C-100:tier' }                       // Statický klíč
{ type: 'fact', pattern: 'customer:${event.customerId}:tier' }         // Dynamický klíč
```

Zdroj fact čte hodnotu faktu v čase vyhodnocení. Pokud fakt neexistuje, hodnota je `undefined`.

### Zdroj context

Čte z kontextových proměnných enginu:

```typescript
{ type: 'context', key: 'environment' }
{ type: 'context', key: 'region' }
```

Kontextové proměnné jsou metadata o instanci enginu, ne o konkrétních událostech nebo faktech.

### Zdroj lookup

Čte z výsledků externích služeb (vyžaduje `lookups` v pravidle):

```typescript
// Pravidlo s lookupem
{
  lookups: [
    {
      name: 'userProfile',
      service: 'userService',
      method: 'getProfile',
      args: [{ ref: 'event.userId' }],
      cache: { ttl: '5m' },
      onError: 'skip',
    },
  ],
  conditions: [
    {
      source: { type: 'lookup', name: 'userProfile', field: 'isVerified' },
      operator: 'eq',
      value: true,
    },
  ],
}
```

Lookupy se vyhodnotí před podmínkami. Pokud lookup selže a `onError` je `'skip'`, pravidlo se zcela přeskočí.

## Dynamické reference

Místo porovnání se statickou hodnotou můžete porovnávat s jiným dynamickým zdrojem pomocí `{ ref: 'path' }`:

```typescript
// Porovnání země doručení se uloženou zemí zákazníka
{
  source: { type: 'event', field: 'shippingCountry' },
  operator: 'neq',
  value: { ref: 'fact.customer:${event.customerId}:country' },
}
```

### Cesty referencí

| Prefix | Rozloží se na |
|--------|---------------|
| `event.fieldName` | Data spouštěcí události |
| `fact.factKey` | Hodnota z úložiště faktů |
| `context.key` | Kontextová proměnná enginu |
| `lookup.name` nebo `lookup.name.field` | Výsledek lookupu |

### Příklad: Porovnání napříč zdroji

```typescript
// Alert, když částka objednávky se liší od obvyklého vzoru útraty zákazníka
conditions: [
  {
    source: { type: 'event', field: 'amount' },
    operator: 'gt',
    value: { ref: 'fact.customer:${event.customerId}:avgOrderAmount' },
  },
]
```

Toto porovnává částku události s hodnotou faktu — žádný hardcoded práh není potřeba.

## Řetězcová interpolace

Klíče vzorů faktů a řetězcové hodnoty podporují interpolaci `${expression}`:

```typescript
// Dynamický klíč faktu z dat události
source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }

// Dynamická reference
value: { ref: 'fact.order:${event.orderId}:discount' }
```

Výraz uvnitř `${...}` může odkazovat na:
- `event.fieldName` — data spouštěcí události
- Jakoukoli platnou JavaScriptovou cestu do dostupného kontextu

Toto se vyhodnotí v čase vyhodnocení pravidla, ne v čase registrace.

## Kombinování podmínek

Všechny podmínky v pravidle používají logiku AND. Každá podmínka musí projít:

```typescript
conditions: [
  // Podmínka 1: celková částka objednávky je vysoká
  {
    source: { type: 'event', field: 'total' },
    operator: 'gte',
    value: 1000,
  },
  // Podmínka 2: zákazník je VIP
  {
    source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
    operator: 'eq',
    value: 'vip',
  },
  // Podmínka 3: není testovací objednávka
  {
    source: { type: 'event', field: 'tags' },
    operator: 'not_contains',
    value: 'test',
  },
]
// Všechny tři musí projít, aby se pravidlo spustilo
```

### Implementace logiky OR

Pro logiku OR vytvořte samostatná pravidla se stejnými akcemi:

```typescript
// Pravidlo A: spuštění, pokud je zákazník VIP
engine.registerRule({
  id: 'discount-vip',
  name: 'VIP Discount',
  priority: 100,
  enabled: true,
  tags: ['pricing'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    { source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }, operator: 'eq', value: 'vip' },
  ],
  actions: [
    { type: 'set_fact', key: 'order:${event.orderId}:discount', value: 0.1 },
  ],
});

// Pravidlo B: spuštění, pokud celková částka > $5000 (bez ohledu na tier)
engine.registerRule({
  id: 'discount-large-order',
  name: 'Large Order Discount',
  priority: 100,
  enabled: true,
  tags: ['pricing'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    { source: { type: 'event', field: 'total' }, operator: 'gt', value: 5000 },
  ],
  actions: [
    { type: 'set_fact', key: 'order:${event.orderId}:discount', value: 0.1 },
  ],
});
```

Splnění kterékoli podmínky povede k aplikaci slevy.

## Kompletní funkční příklad

Systém zpracování objednávek s více podmínkami, který demonstruje všechny kategorie operátorů:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'order-processor' });

  // Pravidlo 1: Kontrola mezinárodního podvodu
  // Kombinuje číselné podmínky, rovnost, existenci a reference
  engine.registerRule({
    id: 'international-fraud-check',
    name: 'International Fraud Detection',
    priority: 200,
    enabled: true,
    tags: ['fraud', 'security'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      // Číselné: objednávka nad $500
      {
        source: { type: 'event', field: 'total' },
        operator: 'gt',
        value: 500,
      },
      // Rovnost: země doručení se liší od země zákazníka
      {
        source: { type: 'event', field: 'shippingCountry' },
        operator: 'neq',
        value: { ref: 'fact.customer:${event.customerId}:country' },
      },
      // Existence: zákazník musí mít zemi na záznamu
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:country' },
        operator: 'exists',
        value: null,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'fraud.international_mismatch',
        data: {
          orderId: { ref: 'event.orderId' },
          customerId: { ref: 'event.customerId' },
          shippingCountry: { ref: 'event.shippingCountry' },
        },
      },
    ],
  });

  // Pravidlo 2: Způsobilost pro expresní dopravu
  // Používá operátory contains a in
  engine.registerRule({
    id: 'express-shipping',
    name: 'Express Shipping Eligibility',
    priority: 100,
    enabled: true,
    tags: ['shipping'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      // In: zákazník musí být VIP nebo Gold tier
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'in',
        value: ['vip', 'gold'],
      },
      // Contains: objednávka musí mít 'express' v možnostech dopravy
      {
        source: { type: 'event', field: 'shippingOptions' },
        operator: 'contains',
        value: 'express',
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:expressEligible',
        value: true,
      },
      {
        type: 'log',
        level: 'info',
        message: 'Expresní doprava schválena pro objednávku ${event.orderId}',
      },
    ],
  });

  // Pravidlo 3: Podezřelý vzor emailu
  // Používá matches (regex)
  engine.registerRule({
    id: 'suspicious-email',
    name: 'Suspicious Email Pattern',
    priority: 150,
    enabled: true,
    tags: ['fraud'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      // Matches: email vypadá jako dočasná/jednorázová adresa
      {
        source: { type: 'event', field: 'email' },
        operator: 'matches',
        value: '(tempmail|throwaway|guerrilla|mailinator)',
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'fraud.suspicious_email',
        data: {
          orderId: { ref: 'event.orderId' },
          email: { ref: 'event.email' },
        },
      },
    ],
  });

  // Nastavení faktů zákazníků
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-100:country', 'US');

  await engine.setFact('customer:C-200:tier', 'standard');
  await engine.setFact('customer:C-200:country', 'US');

  // Odběr událostí podvodu
  engine.subscribe('fraud.*', (event) => {
    console.log('PODVOD:', event.topic, event.data);
  });

  // Test 1: Normální VIP objednávka s expresní dopravou
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 300,
    shippingCountry: 'US',
    shippingOptions: ['standard', 'express'],
    email: 'alice@example.com',
  });
  // Výsledek: Pravidlo expresní dopravy se spustí (VIP + možnost express)
  console.log('ORD-001 express:', engine.getFact('order:ORD-001:expressEligible'));
  // true

  // Test 2: Mezinárodní objednávka od US zákazníka
  await engine.emit('order.created', {
    orderId: 'ORD-002',
    customerId: 'C-200',
    total: 800,
    shippingCountry: 'DE',
    shippingOptions: ['standard'],
    email: 'bob@example.com',
  });
  // Výsledek: Kontrola mezinárodního podvodu se spustí (total > 500, DE != US)

  // Test 3: Objednávka s podezřelým emailem
  await engine.emit('order.created', {
    orderId: 'ORD-003',
    customerId: 'C-100',
    total: 100,
    shippingCountry: 'US',
    shippingOptions: ['standard'],
    email: 'user@tempmail.org',
  });
  // Výsledek: Pravidlo podezřelého emailu se spustí (odpovídá regexu)

  await engine.stop();
}

main();
```

## Cvičení

Vytvořte systém validace objednávek s těmito pravidly:

1. **Minimální objednávka**: Když se spustí `order.created`, zkontrolujte, že `event.total` je větší než 0. Pokud ne, emitujte `order.rejected` s důvodem "invalid_total".
2. **Omezení zemí**: Když se spustí `order.created`, zkontrolujte, že `event.shippingCountry` NENÍ v seznamu `['XX', 'YY', 'ZZ']` (sankcionované země). Pokud je, emitujte `order.rejected` s důvodem "restricted_country".
3. **Kontrola prémiového produktu**: Když se spustí `order.created`, zkontrolujte, že `event.items` obsahuje "PREMIUM-001" A fakt tier zákazníka je "vip" nebo "gold". Pokud obě podmínky projdou, nastavte fakt `order:{orderId}:premiumApproved` na true.

Testujte každé pravidlo s odpovídajícími událostmi.

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'validation' });

  // Pravidlo 1: Zamítnutí objednávek s neplatnou celkovou částkou
  engine.registerRule({
    id: 'minimum-order',
    name: 'Minimum Order Validation',
    priority: 300,
    enabled: true,
    tags: ['validation'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'lte',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'order.rejected',
        data: {
          orderId: { ref: 'event.orderId' },
          reason: 'invalid_total',
          total: { ref: 'event.total' },
        },
      },
    ],
  });

  // Pravidlo 2: Zamítnutí objednávek do omezených zemí
  engine.registerRule({
    id: 'country-restriction',
    name: 'Country Restriction Check',
    priority: 300,
    enabled: true,
    tags: ['validation', 'compliance'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'shippingCountry' },
        operator: 'in',
        value: ['XX', 'YY', 'ZZ'],
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'order.rejected',
        data: {
          orderId: { ref: 'event.orderId' },
          reason: 'restricted_country',
          country: { ref: 'event.shippingCountry' },
        },
      },
    ],
  });

  // Pravidlo 3: Schválení prémiového produktu
  engine.registerRule({
    id: 'premium-product-check',
    name: 'Premium Product Check',
    priority: 100,
    enabled: true,
    tags: ['products'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'items' },
        operator: 'contains',
        value: 'PREMIUM-001',
      },
      {
        source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
        operator: 'in',
        value: ['vip', 'gold'],
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:premiumApproved',
        value: true,
      },
    ],
  });

  engine.subscribe('order.rejected', (event) => {
    console.log('ZAMÍTNUTO:', event.data);
  });

  // Nastavení
  await engine.setFact('customer:C-100:tier', 'vip');
  await engine.setFact('customer:C-200:tier', 'standard');

  // Test 1: Neplatná celková částka
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: -5,
    shippingCountry: 'US',
    items: ['SKU-1'],
  });
  // ZAMÍTNUTO: { orderId: 'ORD-001', reason: 'invalid_total', total: -5 }

  // Test 2: Omezená země
  await engine.emit('order.created', {
    orderId: 'ORD-002',
    customerId: 'C-100',
    total: 100,
    shippingCountry: 'XX',
    items: ['SKU-1'],
  });
  // ZAMÍTNUTO: { orderId: 'ORD-002', reason: 'restricted_country', country: 'XX' }

  // Test 3: Prémiový produkt - VIP zákazník (schváleno)
  await engine.emit('order.created', {
    orderId: 'ORD-003',
    customerId: 'C-100',
    total: 500,
    shippingCountry: 'US',
    items: ['SKU-1', 'PREMIUM-001'],
  });
  console.log('Premium schváleno:', engine.getFact('order:ORD-003:premiumApproved'));
  // Premium schváleno: true

  // Test 4: Prémiový produkt - Standard zákazník (neschváleno)
  await engine.emit('order.created', {
    orderId: 'ORD-004',
    customerId: 'C-200',
    total: 500,
    shippingCountry: 'US',
    items: ['PREMIUM-001'],
  });
  console.log('Premium schváleno:', engine.getFact('order:ORD-004:premiumApproved'));
  // Premium schváleno: undefined (pravidlo se nespustilo - tier je 'standard')

  await engine.stop();
}

main();
```

Pravidlo 1 používá `lte` pro zachycení nulových a záporných částek. Pravidlo 2 používá `in` pro kontrolu proti blocklistu. Pravidlo 3 kombinuje `contains` (členství v poli) s `in` (kontrola tieru) — obě podmínky musí projít.

</details>

## Shrnutí

- Každá podmínka má `source`, `operator` a `value` — engine čte, porovnává a filtruje
- 12 operátorů pokrývá rovnost, číselné porovnání, členství v seznamu, obsahování, regex a existenci
- Čtyři typy zdrojů: `event` (data triggeru), `fact` (perzistentní stav), `context` (metadata enginu), `lookup` (externí služby)
- Dynamické reference `{ ref: 'path' }` porovnávají s jinými zdroji místo statických hodnot
- Řetězcová interpolace `${expression}` se rozloží v čase vyhodnocení — používejte ji ve vzorech faktů a referencích
- Podmínky se kombinují s logikou AND — pro OR použijte samostatná pravidla
- `matches` kompiluje regexy s cachováním pro výkon
- `exists` / `not_exists` kontrolují přítomnost, ignorují pole `value`

---

Další: [Základní akce](../03-akce/01-zakladni-akce.md)
