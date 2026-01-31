# Práce s fakty

Události jsou signály typu „odpal a zapomeň". Fakta jsou jejich opakem: přetrvávají v paměti a reprezentují aktuální stav vašeho systému. Pravidla mohou číst fakta v podmínkách, nastavovat je v akcích a spouštět se na jejich změny. Tato kapitola pokrývá kompletní API faktů a pravidla spouštěná fakty.

## Co se naučíte

- Jak nastavovat, získávat, mazat a dotazovat fakta
- Konvenci formátu klíčů a zástupné vzory
- Jak fungují pravidla spouštěná fakty
- Kdy použít fakta vs události
- Jak změny faktů řídí forward chaining

## API faktů

### Nastavení faktů

`setFact()` vytvoří nebo aktualizuje fakt. Je asynchronní, protože nastavení faktu může spustit vyhodnocení pravidel:

```typescript
// Nastavení jednoduché hodnoty
await engine.setFact('customer:C-100:tier', 'vip');

// Nastavení číselné hodnoty
await engine.setFact('customer:C-100:spending', 4250);

// Nastavení booleanu
await engine.setFact('order:ORD-1:shipped', false);

// Nastavení komplexní hodnoty
await engine.setFact('customer:C-100:preferences', {
  currency: 'USD',
  language: 'en',
  notifications: true,
});
```

Fakta mohou obsahovat jakoukoli hodnotu: řetězce, čísla, booleany, objekty, pole.

### Získání faktů

`getFact()` vrací přímo hodnotu. `getFactFull()` vrací kompletní objekt faktu s metadaty:

```typescript
// Získání pouze hodnoty
const tier = engine.getFact('customer:C-100:tier');
console.log(tier);  // 'vip'

// Získání kompletního faktu s metadaty
const fact = engine.getFactFull('customer:C-100:tier');
console.log(fact);
// {
//   key: 'customer:C-100:tier',
//   value: 'vip',
//   timestamp: 1706000000000,
//   source: 'api',
//   version: 1,
// }
```

`getFact()` vrací `undefined`, pokud fakt neexistuje.

### Mazání faktů

```typescript
const deleted = engine.deleteFact('customer:C-100:tier');
console.log(deleted);  // true (existoval a byl odstraněn)
```

### Dotazování faktů

`queryFacts()` najde fakta odpovídající zástupnému vzoru:

```typescript
// Všechny fakty pro konkrétního zákazníka
const customerFacts = engine.queryFacts('customer:C-100:*');

// Všechny úrovně zákazníků
const allTiers = engine.queryFacts('customer:*:tier');

// Všechny fakty
const everything = engine.getAllFacts();
```

Každý výsledek je kompletní objekt `Fact`:

```typescript
const facts = engine.queryFacts('customer:C-100:*');
for (const fact of facts) {
  console.log(`${fact.key} = ${fact.value} (v${fact.version})`);
}
// customer:C-100:tier = vip (v1)
// customer:C-100:spending = 4250 (v1)
```

## Konvence formátu klíčů

Klíče faktů používají hierarchický formát oddělený dvojtečkami: `entita:id:pole`. Tato konvence umožňuje smysluplné dotazy se zástupnými znaky:

```text
┌──────────────────────────────────────────────────────────────┐
│  Formát:  entita : identifikátor : pole                      │
│                                                              │
│  customer:C-100:tier           tier jednoho zákazníka        │
│  customer:C-100:*              všechna pole zákazníka C-100  │
│  customer:*:tier               tier všech zákazníků          │
│  order:ORD-1:status            status jedné objednávky       │
│  order:*:total                 celkové částky všech objedn.  │
│  inventory:SKU-42:quantity     zásoby jednoho produktu       │
│  inventory:*:quantity          zásoby všech produktů         │
└──────────────────────────────────────────────────────────────┘
```

Konvence není enginem vynucována — jako klíč můžete použít jakýkoli řetězec. Ale formát oddělený dvojtečkami dobře funguje s dotazy se zástupnými znaky a řetězcovou interpolací v pravidlech:

```typescript
// V podmínce interpolujte ID zákazníka ze spouštěcí události
source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' }
```

## Pravidla spouštěná fakty

Fakta nejen ukládají stav — mohou spouštět pravidla. Když se fakt změní, engine vyhodnotí všechna pravidla, jejichž vzor triggeru odpovídá klíči faktu:

```typescript
engine.registerRule({
  id: 'vip-upgrade-notification',
  name: 'Notify on VIP Upgrade',
  priority: 100,
  enabled: true,
  tags: ['loyalty'],
  trigger: { type: 'fact', pattern: 'customer:*:tier' },
  conditions: [
    {
      source: { type: 'event', field: 'value' },
      operator: 'eq',
      value: 'vip',
    },
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'notification.vip_upgrade',
      data: {
        customerId: { ref: 'event.key' },
        newTier: { ref: 'event.value' },
      },
    },
  ],
});
```

Když se spustí pravidlo triggerované faktem, kontext „event" obsahuje:

| Pole | Obsah |
|------|-------|
| `event.key` | Klíč faktu, který se změnil |
| `event.value` | Nová hodnota |
| `event.previousValue` | Předchozí hodnota (při aktualizaci) |
| `event.type` | `'created'`, `'updated'` nebo `'deleted'` |

### Zástupné vzory v triggerech

Zástupný znak `*` odpovídá jakémukoli segmentu mezi dvojtečkami:

```typescript
// Spustí se na JAKOUKOLI změnu tieru zákazníka
{ type: 'fact', pattern: 'customer:*:tier' }

// Spustí se na JAKOUKOLI změnu pole zákazníka C-100
{ type: 'fact', pattern: 'customer:C-100:*' }

// Spustí se na JAKÉHOKOLI zákazníka, JAKÉKOLI pole
{ type: 'fact', pattern: 'customer:*:*' }
```

## Fakta vs události

| | Fakta | Události |
|---|-------|----------|
| **Životní cyklus** | Přetrvávají, dokud nejsou změněna nebo smazána | Spustí se jednou, poté uložena v event logu |
| **Hodnota** | Aktuální stav, přepsán při aktualizaci | Neměnné po vytvoření |
| **Trigger** | Pravidla se spustí na změnu hodnoty | Pravidla se spustí na emitování |
| **V podmínkách** | Čitelná kdykoli přes `{ type: 'fact' }` | Přístupná pouze během spuštěného vyhodnocení |
| **Použijte, když** | Jiná pravidla potřebují tato data později | Potřebujete signalizovat, že se něco stalo |

**Pravidla orientačně:**

- Pokud potřebujete zkontrolovat hodnotu v podmínce jiného pravidla → udělejte z ní fakt
- Pokud potřebujete signalizovat „něco se stalo" → emitujte událost
- Pokud potřebujete obojí → nastavte fakt A emitujte událost ve stejném pravidle

## Forward chaining s fakty

Když akce pravidla nastaví fakt, tato změna může spustit další pravidla a vytvořit řetězec:

```text
  událost: purchase.completed
       │
       ▼
  Pravidlo: "Aktualizuj útratu" ──► setFact('customer:C-100:spending', 5200)
                                      │
                                      ▼
                                Pravidlo: "Zkontroluj VIP práh"
                                      │  podmínka: spending >= 5000 → PASS
                                      ▼
                                setFact('customer:C-100:tier', 'vip')
                                      │
                                      ▼
                                Pravidlo: "VIP notifikace"
                                      └──► emit_event('notification.vip_upgrade')
```

Tři nezávislá pravidla se automaticky řetězí prostřednictvím změn faktů. Žádné pravidlo neví o ostatních.

## Kompletní funkční příklad

Systém zákaznické loajality, který sleduje útratu, automaticky upgraduje VIP status a notifikuje o změnách úrovně:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'loyalty' });

  // Pravidlo 1: Sledování kumulativní útraty
  engine.registerRule({
    id: 'track-spending',
    name: 'Update Customer Spending',
    priority: 100,
    enabled: true,
    tags: ['loyalty'],
    trigger: { type: 'event', topic: 'purchase.completed' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'customer:${event.customerId}:lastPurchase',
        value: { ref: 'event.amount' },
      },
      {
        type: 'emit_event',
        topic: 'spending.updated',
        data: {
          customerId: { ref: 'event.customerId' },
          amount: { ref: 'event.amount' },
        },
      },
    ],
  });

  // Pravidlo 2: VIP upgrade při dosažení prahu útraty
  engine.registerRule({
    id: 'vip-upgrade',
    name: 'Auto VIP Upgrade',
    priority: 100,
    enabled: true,
    tags: ['loyalty', 'vip'],
    trigger: { type: 'fact', pattern: 'customer:*:totalSpending' },
    conditions: [
      {
        source: { type: 'event', field: 'value' },
        operator: 'gte',
        value: 5000,
      },
    ],
    actions: [
      {
        type: 'set_fact',
        key: 'customer:${event.key.split(":")[1]}:tier',
        value: 'vip',
      },
      {
        type: 'log',
        level: 'info',
        message: 'Zákazník upgradován na VIP na základě útraty',
      },
    ],
  });

  // Pravidlo 3: Notifikace o změnách úrovně
  engine.registerRule({
    id: 'tier-change-notify',
    name: 'Tier Change Notification',
    priority: 90,
    enabled: true,
    tags: ['loyalty', 'notifications'],
    trigger: { type: 'fact', pattern: 'customer:*:tier' },
    conditions: [
      {
        source: { type: 'event', field: 'type' },
        operator: 'in',
        value: ['created', 'updated'],
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.tier_changed',
        data: {
          key: { ref: 'event.key' },
          newTier: { ref: 'event.value' },
          previousTier: { ref: 'event.previousValue' },
        },
      },
    ],
  });

  // Odběr notifikací
  engine.subscribe('notification.*', (event) => {
    console.log('NOTIFIKACE:', event.topic, event.data);
  });

  // Nastavení počátečního stavu zákazníka
  await engine.setFact('customer:C-100:tier', 'standard');
  await engine.setFact('customer:C-100:totalSpending', 0);

  // Simulace nákupů
  await engine.emit('purchase.completed', {
    customerId: 'C-100',
    amount: 2000,
    orderId: 'ORD-001',
  });

  // Ruční aktualizace celkové útraty (v reálné aplikaci by se počítala)
  await engine.setFact('customer:C-100:totalSpending', 2000);

  await engine.emit('purchase.completed', {
    customerId: 'C-100',
    amount: 3500,
    orderId: 'ORD-002',
  });

  await engine.setFact('customer:C-100:totalSpending', 5500);
  // Toto spustí Pravidlo 2 (spending >= 5000), které nastaví tier na 'vip',
  // což spustí Pravidlo 3 (notifikace o změně tieru)

  // Ověření finálního stavu
  console.log('Tier:', engine.getFact('customer:C-100:tier'));
  // Tier: vip

  console.log('Celková útrata:', engine.getFact('customer:C-100:totalSpending'));
  // Celková útrata: 5500

  // Dotaz na všechny fakty tohoto zákazníka
  const facts = engine.queryFacts('customer:C-100:*');
  console.log('Fakta zákazníka:');
  for (const f of facts) {
    console.log(`  ${f.key} = ${JSON.stringify(f.value)}`);
  }

  await engine.stop();
}

main();
```

## Cvičení

Vytvořte systém monitoringu zásob s těmito pravidly:

1. **Alert nízké zásoby**: Když se změní jakýkoli fakt `inventory:*:quantity` a nová hodnota je menší než 10, emitujte `alert.low_stock` s klíčem produktu a aktuálním množstvím
2. **Vyprodáno**: Když se změní jakýkoli fakt `inventory:*:quantity` a nová hodnota se rovná 0, nastavte fakt `inventory:{productId}:status` na "out_of_stock" a emitujte `alert.out_of_stock`
3. **Notifikace o doobjednání**: Když se změní jakýkoli fakt `inventory:*:status` na "out_of_stock", emitujte `notification.reorder` s detaily produktu

Testujte nastavením množství: 50, poté 8, poté 0.

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'inventory' });

  // Pravidlo 1: Alert nízké zásoby
  engine.registerRule({
    id: 'low-stock-alert',
    name: 'Low Stock Alert',
    priority: 100,
    enabled: true,
    tags: ['inventory', 'alerts'],
    trigger: { type: 'fact', pattern: 'inventory:*:quantity' },
    conditions: [
      {
        source: { type: 'event', field: 'value' },
        operator: 'lt',
        value: 10,
      },
      {
        source: { type: 'event', field: 'value' },
        operator: 'gt',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'alert.low_stock',
        data: {
          factKey: { ref: 'event.key' },
          quantity: { ref: 'event.value' },
        },
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Nízká zásoba: ${event.key} = ${event.value}',
      },
    ],
  });

  // Pravidlo 2: Vyprodáno
  engine.registerRule({
    id: 'out-of-stock',
    name: 'Out of Stock Handler',
    priority: 200,
    enabled: true,
    tags: ['inventory', 'alerts'],
    trigger: { type: 'fact', pattern: 'inventory:*:quantity' },
    conditions: [
      {
        source: { type: 'event', field: 'value' },
        operator: 'eq',
        value: 0,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'alert.out_of_stock',
        data: {
          factKey: { ref: 'event.key' },
        },
      },
    ],
  });

  // Pravidlo 3: Notifikace o doobjednání při stavu vyprodáno
  engine.registerRule({
    id: 'restock-notify',
    name: 'Restock Notification',
    priority: 100,
    enabled: true,
    tags: ['inventory', 'notifications'],
    trigger: { type: 'event', topic: 'alert.out_of_stock' },
    conditions: [],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.reorder',
        data: {
          product: { ref: 'event.factKey' },
          message: 'Produkt je vyprodán, vyžadováno doobjednání',
        },
      },
      {
        type: 'log',
        level: 'error',
        message: 'DOOBJEDNÁNÍ VYŽADOVÁNO: ${event.factKey}',
      },
    ],
  });

  engine.subscribe('alert.*', (event) => {
    console.log('ALERT:', event.topic, event.data);
  });

  engine.subscribe('notification.*', (event) => {
    console.log('NOTIFIKACE:', event.topic, event.data);
  });

  // Test: množství 50 (žádné alerty)
  await engine.setFact('inventory:SKU-42:quantity', 50);

  // Test: množství 8 (alert nízké zásoby)
  await engine.setFact('inventory:SKU-42:quantity', 8);

  // Test: množství 0 (vyprodáno → notifikace o doobjednání)
  await engine.setFact('inventory:SKU-42:quantity', 0);

  await engine.stop();
}

main();
```

Nastavení množství na 50 nespustí žádné alerty. Nastavení na 8 spustí alert nízké zásoby (8 < 10 a 8 > 0). Nastavení na 0 spustí pravidlo vyprodáno (které má vyšší prioritu), emituje událost, která se řetězí do notifikace o doobjednání.

</details>

## Shrnutí

- `setFact(key, value)` vytvoří nebo aktualizuje fakt — je asynchronní, protože může spouštět pravidla
- `getFact(key)` vrací hodnotu; `getFactFull(key)` vrací kompletní fakt s metadaty
- `queryFacts(pattern)` najde fakta odpovídající zástupným vzorům jako `customer:*:tier`
- Klíče faktů následují konvenci `entita:id:pole` pro strukturované dotazy
- Pravidla spouštěná fakty používají `{ type: 'fact', pattern: '...' }` a spouštějí se na jakoukoli odpovídající změnu faktu
- Kontext změny faktu obsahuje `key`, `value`, `previousValue` a `type`
- Fakta přetrvávají v paměti, dokud nejsou změněna nebo smazána — používejte je pro stav, na který se musí odkazovat jiná pravidla
- Změny faktů řídí forward chaining: akce `set_fact` jednoho pravidla může spustit další pravidlo

---

Další: [Podmínky do hloubky](./04-podminky.md)
