# Pravidla a eventy

Pravidla jsou základní jednotkou enginu. Události jsou primární způsob, jak je spouštět. V této kapitole se naučíte, jak registrovat pravidla, emitovat události, odebírat výsledky a porozumět vyhodnocovacímu procesu.

## Co se naučíte

- Kompletní anatomii pravidla
- Jak registrovat, povolit, zakázat a odebrat pravidla
- Jak emitovat události a odebírat topiky událostí
- Jak engine vyhodnocuje pravidla při příchodu události
- Jak používat řetězcovou interpolaci v akcích

## Anatomie pravidla

Každé pravidlo má stejnou strukturu:

```typescript
{
  // Identita
  id: 'order-notification',       // Unikátní identifikátor
  name: 'Notify on Large Orders', // Lidsky čitelný název
  description: 'Send alert when order exceeds $1000',

  // Chování
  priority: 100,                  // Vyšší = vyhodnoceno dříve
  enabled: true,                  // Lze přepínat za běhu
  tags: ['orders', 'alerts'],     // Štítky pro filtrování
  group: 'order-rules',           // Volitelná skupina pro hromadné řízení

  // Logika
  trigger: { ... },               // KDY vyhodnotit
  conditions: [ ... ],            // ZDA spustit
  actions: [ ... ],               // CO udělat

  // Externí data (volitelné)
  lookups: [ ... ],               // Data k načtení před vyhodnocením
}
```

### Povinná vs volitelná pole

| Pole | Povinné | Poznámky |
|------|---------|----------|
| `id` | Ano | Musí být unikátní napříč všemi pravidly |
| `name` | Ano | Pro zobrazení a debugging |
| `priority` | Ano | Určuje pořadí vyhodnocení |
| `enabled` | Ano | `false` zcela přeskočí pravidlo |
| `tags` | Ano | Může být prázdné pole `[]` |
| `trigger` | Ano | Jeden z: event, fact, timer, temporal |
| `conditions` | Ano | Může být prázdné pole (vždy se spustí) |
| `actions` | Ano | Může být prázdné pole (no-op pravidlo) |
| `description` | Ne | Delší popis pro dokumentaci |
| `group` | Ne | Odkaz na `RuleGroup` |
| `lookups` | Ne | Požadavky na externí data |

## Registrace pravidel

Použijte `registerRule()` pro přidání pravidla do enginu:

```typescript
const rule = engine.registerRule({
  id: 'welcome-email',
  name: 'Send Welcome Email',
  priority: 100,
  enabled: true,
  tags: ['onboarding'],
  trigger: { type: 'event', topic: 'user.registered' },
  conditions: [],
  actions: [
    {
      type: 'emit_event',
      topic: 'email.send',
      data: {
        to: { ref: 'event.email' },
        template: 'welcome',
      },
    },
  ],
});

console.log(rule.id);      // 'welcome-email'
console.log(rule.version);  // 1 (automaticky přiřazeno)
```

Vrácený objekt `Rule` obsahuje automaticky generovaná pole: `version`, `createdAt` a `updatedAt`.

### Správa pravidel za běhu

```typescript
// Zakázání pravidla (přestane se spouštět, ale zůstane registrované)
engine.disableRule('welcome-email');

// Opětovné povolení
engine.enableRule('welcome-email');

// Aktualizace vlastností pravidla
engine.updateRule('welcome-email', {
  priority: 200,
  tags: ['onboarding', 'email'],
});

// Úplné odebrání pravidla
engine.unregisterRule('welcome-email');

// Získání pravidla
const r = engine.getRule('welcome-email');

// Výpis všech pravidel
const allRules = engine.getRules();
```

### Validace pravidel

Engine validuje pravidla při registraci. Pokud je struktura pravidla neplatná, `registerRule()` vyhodí chybu. Můžete také validovat bez registrace:

```typescript
const result = engine.validateRule({
  id: 'test',
  name: 'Test Rule',
  priority: 100,
  enabled: true,
  tags: [],
  trigger: { type: 'event', topic: 'test' },
  conditions: [],
  actions: [],
});

console.log(result.valid);   // true nebo false
console.log(result.errors);  // pole řetězců s chybami validace
```

## Emitování událostí

Události jsou primární způsob řízení enginu. Událost je jednorázový signál s topikem a datovým payloadem:

```typescript
const event = await engine.emit('order.created', {
  orderId: 'ORD-001',
  customerId: 'C-100',
  total: 750,
  items: ['SKU-42', 'SKU-17'],
});

console.log(event.id);        // automaticky generované UUID
console.log(event.topic);     // 'order.created'
console.log(event.timestamp); // milisekundy od epochy
```

Když zavoláte `emit()`, engine:

1. Vytvoří objekt `Event` s automaticky generovaným `id` a `timestamp`
2. Uloží událost do event store
3. Najde všechna pravidla, jejichž trigger odpovídá topiku
4. Seřadí odpovídající pravidla podle priority (nejvyšší první)
5. Vyhodnotí podmínky pro každé odpovídající pravidlo
6. Vykoná akce pravidel, jejichž podmínky všechny projdou

### Konvence pojmenování topiků

Topiky používají konvenci pojmenování oddělenou tečkami:

```text
order.created       ──► Něco bylo vytvořeno
order.updated       ──► Něco bylo aktualizováno
order.cancelled     ──► Něco bylo zrušeno
payment.received    ──► Platba přišla
payment.failed      ──► Platba selhala
notification.send   ──► Požadavek na odeslání notifikace
```

Engine porovnává topiky přesně. `order.created` spustí pouze pravidla s `trigger: { type: 'event', topic: 'order.created' }`.

### Korelované události

Použijte `emitCorrelated()` pro propojení souvisejících událostí pro trasování:

```typescript
// První událost v toku
const orderEvent = await engine.emit('order.created', {
  orderId: 'ORD-001',
});

// Navazující událost, propojená s první
await engine.emitCorrelated(
  'payment.received',
  { orderId: 'ORD-001', amount: 750 },
  'correlation-ORD-001',   // Propojuje toto s tokem objednávky
  orderEvent.id,           // Kauzace: toto bylo způsobeno událostí objednávky
);
```

## Odběr událostí

Odebírejte události pomocí vzorů topiků. To vám umožní sledovat, co engine produkuje:

```typescript
// Odběr konkrétního topiku
const unsubscribe = engine.subscribe('order.created', (event) => {
  console.log('Nová objednávka:', event.data.orderId);
});

// Odběr všech událostí pod jmenným prostorem
engine.subscribe('order.*', (event) => {
  console.log(`Událost objednávky: ${event.topic}`);
});

// Odběr všeho
engine.subscribe('*', (event) => {
  console.log(`[${event.topic}]`, event.data);
});

// Odhlášení po dokončení
unsubscribe();
```

Odběry vidí všechny události — jak ty emitované vaším kódem, tak ty emitované akcemi pravidel.

## Tok vyhodnocení řízený událostmi

Zde je, co se stane, když událost vstoupí do enginu:

```text
  engine.emit('order.created', { total: 750, customerId: 'C-100' })
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │  1. Vytvoření objektu Event (id, timestamp)   │
  │  2. Uložení do EventStore                     │
  │  3. Nalezení pravidel s odpovídajícím triggerem│
  └──────────────────┬───────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
  ┌─────────────┐        ┌─────────────┐
  │ Pravidlo:   │ p:200  │ Pravidlo:   │ p:100
  │ Podvod      │        │ VIP         │
  │             │        │             │
  │ podmínky:   │        │ podmínky:   │
  │  total > 1k │ FAIL   │  tier = vip │ PASS
  │             │        │             │
  │ (přeskočeno)│        │ akce:       │
  └─────────────┘        │  set_fact   │
                         │  emit_event │
                         └─────────────┘
```

Pravidla se řadí podle priority (nejvyšší první) a vyhodnocují se v pořadí. Pouze pravidla, jejichž podmínky všechny projdou, mají vykonané své akce.

## Řetězcová interpolace v akcích

Akce podporují interpolaci `${expression}` pro dynamické hodnoty:

```typescript
actions: [
  {
    type: 'log',
    level: 'info',
    message: 'Objednávka ${event.orderId} zadána zákazníkem ${event.customerId}',
  },
  {
    type: 'set_fact',
    key: 'order:${event.orderId}:status',
    value: 'received',
  },
]
```

Prefix `event` přistupuje k datům spouštěcí události. Můžete také odkazovat na fakta:

```typescript
key: 'customer:${event.customerId}:lastOrder'
```

Pro dynamické hodnoty, které nejsou řetězce, použijte `{ ref: 'path' }`:

```typescript
data: {
  orderId: { ref: 'event.orderId' },   // Rozloží se na skutečnou hodnotu, ne řetězec
  total: { ref: 'event.total' },       // Zachová typ number
}
```

Rozdíl je důležitý: `${...}` produkuje řetězce, `{ ref: '...' }` zachovává původní typ.

## Kompletní funkční příklad

E-commerce systém notifikací objednávek se třemi pravidly, která demonstrují vyhodnocení řízené událostmi, shodu více pravidel a řetězení událostí:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'ecommerce' });

  // Pravidlo 1: Logování každé objednávky (nízká priorita, běží poslední)
  engine.registerRule({
    id: 'order-log',
    name: 'Log All Orders',
    priority: 10,
    enabled: true,
    tags: ['logging'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Objednávka ${event.orderId}: $${event.total} od ${event.customerId}',
      },
    ],
  });

  // Pravidlo 2: Alert na objednávky vysoké hodnoty (střední priorita)
  engine.registerRule({
    id: 'high-value-alert',
    name: 'High Value Order Alert',
    priority: 100,
    enabled: true,
    tags: ['alerts', 'orders'],
    trigger: { type: 'event', topic: 'order.created' },
    conditions: [
      {
        source: { type: 'event', field: 'total' },
        operator: 'gte',
        value: 1000,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'alert.high_value_order',
        data: {
          orderId: { ref: 'event.orderId' },
          total: { ref: 'event.total' },
          message: 'Objednávka vysoké hodnoty vyžaduje kontrolu',
        },
      },
    ],
  });

  // Pravidlo 3: Reakce na alert vysoké hodnoty (řetězeno z Pravidla 2)
  engine.registerRule({
    id: 'alert-handler',
    name: 'Handle High Value Alert',
    priority: 100,
    enabled: true,
    tags: ['alerts'],
    trigger: { type: 'event', topic: 'alert.high_value_order' },
    conditions: [],
    actions: [
      {
        type: 'set_fact',
        key: 'order:${event.orderId}:needsReview',
        value: true,
      },
      {
        type: 'log',
        level: 'warn',
        message: 'Objednávka ${event.orderId} označena ke kontrole (celkem: $${event.total})',
      },
    ],
  });

  // Sledování všech alertů
  engine.subscribe('alert.*', (event) => {
    console.log('ALERT:', event.topic, event.data);
  });

  // Malá objednávka: spustí se pouze Pravidlo 1
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 50,
  });

  // Velká objednávka: Pravidlo 1 + 2 se spustí, Pravidlo 2 emituje událost, která spustí Pravidlo 3
  await engine.emit('order.created', {
    orderId: 'ORD-002',
    customerId: 'C-200',
    total: 2500,
  });

  // Ověření, že řetězený fakt byl nastaven
  const needsReview = engine.getFact('order:ORD-002:needsReview');
  console.log('ORD-002 vyžaduje kontrolu:', needsReview);
  // ORD-002 vyžaduje kontrolu: true

  const stats = engine.getStats();
  console.log('Zpracované události:', stats.eventsProcessed);
  console.log('Vykonaná pravidla:', stats.rulesExecuted);

  await engine.stop();
}

main();
```

### Co se stane

1. **ORD-001** ($50): Spustí se pouze „Log All Orders" — podmínka vysoké hodnoty (total >= 1000) neprojde
2. **ORD-002** ($2500): Tři pravidla se vykonají v řetězci:
   - „High Value Order Alert" (priorita 100) se spustí první, emituje `alert.high_value_order`
   - „Log All Orders" (priorita 10) se spustí druhé, loguje objednávku
   - Emitovaná `alert.high_value_order` spustí „Handle High Value Alert", které nastaví fakt

Toto demonstruje **forward chaining**: akce Pravidla 2 vytvoří novou událost, která automaticky spustí Pravidlo 3.

## Cvičení

Vytvořte pipeline registrace uživatelů se třemi pravidly:

1. **Uvítací pravidlo**: Když se spustí `user.registered`, emitujte `email.send` se šablonou "welcome" a emailem uživatele z události
2. **Admin notifikace**: Když se spustí `user.registered` a `event.role` se rovná "admin", emitujte `notification.admin_created` s ID uživatele
3. **Logger emailů**: Když se spustí jakákoli událost `email.*`, zalogujte šablonu emailu a příjemce

Testujte se dvěma událostmi:
- Registrace běžného uživatele (`role: 'user'`)
- Registrace admina (`role: 'admin'`)

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({ name: 'registration' });

  // Pravidlo 1: Uvítací email pro všechny uživatele
  engine.registerRule({
    id: 'welcome-email',
    name: 'Send Welcome Email',
    priority: 100,
    enabled: true,
    tags: ['onboarding', 'email'],
    trigger: { type: 'event', topic: 'user.registered' },
    conditions: [],
    actions: [
      {
        type: 'emit_event',
        topic: 'email.send',
        data: {
          to: { ref: 'event.email' },
          template: 'welcome',
          userId: { ref: 'event.userId' },
        },
      },
    ],
  });

  // Pravidlo 2: Extra notifikace pro registrace adminů
  engine.registerRule({
    id: 'admin-notification',
    name: 'Notify on Admin Registration',
    priority: 200,
    enabled: true,
    tags: ['onboarding', 'security'],
    trigger: { type: 'event', topic: 'user.registered' },
    conditions: [
      {
        source: { type: 'event', field: 'role' },
        operator: 'eq',
        value: 'admin',
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'notification.admin_created',
        data: {
          userId: { ref: 'event.userId' },
          email: { ref: 'event.email' },
        },
      },
    ],
  });

  // Pravidlo 3: Logování všech emailových událostí
  engine.registerRule({
    id: 'email-logger',
    name: 'Log Email Events',
    priority: 50,
    enabled: true,
    tags: ['logging'],
    trigger: { type: 'event', topic: 'email.send' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Email odeslán: šablona=${event.template} komu=${event.to}',
      },
    ],
  });

  // Test 1: Běžný uživatel
  await engine.emit('user.registered', {
    userId: 'U-001',
    email: 'alice@example.com',
    role: 'user',
  });
  // Výsledek: Pravidlo 1 se spustí → emituje email.send → Pravidlo 3 se spustí (loguje email)

  // Test 2: Admin uživatel
  await engine.emit('user.registered', {
    userId: 'U-002',
    email: 'bob@example.com',
    role: 'admin',
  });
  // Výsledek: Pravidlo 2 se spustí (admin), Pravidlo 1 se spustí → emituje email.send → Pravidlo 3 se spustí

  console.log(engine.getStats());
  await engine.stop();
}

main();
```

Pro běžného uživatele se vykonají Pravidla 1 a 3 (uvítací email + log). Pro admina se vykonají Pravidla 1, 2 a 3. Pravidlo 3 se spustí jako řetězová reakce z emitované události Pravidla 1 v obou případech.

</details>

## Shrnutí

- Pravidlo má identitu (`id`, `name`), chování (`priority`, `enabled`, `tags`) a logiku (`trigger`, `conditions`, `actions`)
- `registerRule()` přidá pravidlo; `unregisterRule()`, `enableRule()`, `disableRule()`, `updateRule()` ho spravují za běhu
- `emit(topic, data)` odešle událost, která spustí odpovídající pravidla
- `subscribe(pattern, handler)` sleduje události — jak uživatelsky emitované, tak emitované pravidly
- Pravidla se vyhodnocují v pořadí priority (nejvyšší první); všechny podmínky musí projít, aby se vykonaly akce
- `${expression}` interpoluje řetězce v akcích; `{ ref: 'path' }` zachovává původní typ
- Akce pravidel mohou emitovat události, které spouštějí další pravidla — to je forward chaining

---

Další: [Práce s fakty](./03-fakta.md)
