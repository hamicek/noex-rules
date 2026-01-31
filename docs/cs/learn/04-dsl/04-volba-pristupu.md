# Volba správného přístupu

noex-rules podporuje čtyři způsoby definice pravidel: surové objekty, fluent builder, tagged šablony a YAML. Každý přístup produkuje stejný typ `RuleInput` — enginu je jedno, jak bylo pravidlo vytvořeno. Volba závisí na vývojářském komfortu, publiku a složitosti pravidel.

## Co se naučíte

- Kompromisy mezi všemi čtyřmi přístupy k definici pravidel
- Rozhodovací strom pro výběr správného přístupu
- Jak míchat přístupy ve stejném enginu
- Strategie migrace mezi přístupy

## Porovnání vedle sebe

Stejné pravidlo vyjádřené všemi čtyřmi styly:

### Surový objekt

```typescript
engine.registerRule({
  id: 'vip-order',
  name: 'VIP Order Processing',
  priority: 100,
  enabled: true,
  tags: ['orders', 'vip'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    {
      source: { type: 'event', field: 'total' },
      operator: 'gte',
      value: 500,
    },
    {
      source: { type: 'fact', pattern: 'customer:${event.customerId}:tier' },
      operator: 'eq',
      value: 'vip',
    },
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'order.priority',
      data: { orderId: { ref: 'event.orderId' } },
    },
    {
      type: 'set_fact',
      key: 'order:${event.orderId}:priority',
      value: 'high',
    },
  ],
});
```

### Fluent Builder

```typescript
import {
  Rule, onEvent, event, fact,
  emit, setFact, ref,
} from '@hamicek/noex-rules/dsl';

engine.registerRule(
  Rule.create('vip-order')
    .name('VIP Order Processing')
    .priority(100)
    .tags('orders', 'vip')
    .when(onEvent('order.created'))
    .if(event('total').gte(500))
    .and(fact('customer:${event.customerId}:tier').eq('vip'))
    .then(emit('order.priority', { orderId: ref('event.orderId') }))
    .also(setFact('order:${event.orderId}:priority', 'high'))
    .build()
);
```

### Tagged šablona

```typescript
import { rule } from '@hamicek/noex-rules/dsl';

engine.registerRule(rule`
  id: vip-order
  name: VIP Order Processing
  priority: 100
  tags: orders, vip

  WHEN event order.created
  IF event.total >= 500
  AND fact.customer:vip == vip
  THEN emit order.priority { orderId: event.orderId }
  THEN setFact order:priority high
`);
```

### YAML

```yaml
id: vip-order
name: VIP Order Processing
priority: 100
tags:
  - orders
  - vip
trigger:
  type: event
  topic: order.created
conditions:
  - source:
      type: event
      field: total
    operator: gte
    value: 500
  - source:
      type: fact
      pattern: "customer:${event.customerId}:tier"
    operator: eq
    value: vip
actions:
  - type: emit_event
    topic: order.priority
    data:
      orderId:
        ref: event.orderId
  - type: set_fact
    key: "order:${event.orderId}:priority"
    value: high
```

## Srovnávací tabulka

| Funkce | Surový objekt | Fluent Builder | Tagged šablona | YAML |
|--------|:----------:|:--------------:|:---------------:|:----:|
| TypeScript automatické doplňování | Částečné | Plné | Žádné | Žádné |
| Validace při kompilaci | Částečná | Plná | Žádná | Žádná |
| Runtime validace | Při registraci | Při `.build()` | Při parsování | Při načtení |
| Řádků kódu | Nejvíce | Středně | Nejméně | Nejvíce |
| Křivka učení | Nízká | Střední | Nízká | Nízká |
| Všechny typy triggerů | Ano | Ano | Základní 3 | Ano |
| Temporální vzory | Ano | Ano | Ne | Ano |
| Všechny typy akcí | Ano | Ano | 5 ze 7 | Ano |
| Podmíněné akce | Ano | Ano | Ne | Ano |
| Datové požadavky | Ano | Ano | Ne | Ano |
| Uložení v externím souboru | Ne | Ne | Ne | Ano |
| Přístupné netechnikům | Ne | Ne | Ne | Ano |
| Dynamické (JS interpolace) | Ano | Ano | Ano | Ne |

## Rozhodovací strom

```text
  Start
    │
    ▼
  Kdo píše pravidla?
    │
    ├── Netechničtí uživatelé (produkt, provoz, business)
    │   └── YAML ──── Externí konfigurační soubory, editovatelné bez změn kódu
    │
    └── Vývojáři
        │
        ▼
        Potřebujete plnou sadu funkcí?
        (časovače, služby, temporální vzory, lookups, podmíněné akce)
          │
          ├── Ano → Fluent Builder ──── Plná typová bezpečnost, všechny funkce
          │
          └── Ne (základní triggery, podmínky, jednoduché akce)
              │
              ▼
              Priorita?
                │
                ├── Čitelnost / stručnost
                │   └── Tagged šablona ──── Rychlé prototypování, inline pravidla
                │
                ├── Typová bezpečnost
                │   └── Fluent Builder ──── Kontrola při kompilaci
                │
                └── Programatické generování
                    └── Surové objekty ──── Když se pravidla tvoří z dat
```

### Rychlý průvodce

| Scénář | Doporučeno |
|--------|------------|
| Produkční TypeScript aplikace | Fluent Builder |
| Rychlý prototyp nebo testovací pravidlo | Tagged šablona |
| Konfiguračně řízená / netechnická pravidla | YAML |
| Pravidla generovaná kódem (např. z databáze) | Surové objekty |
| Pravidla s temporálními vzory (CEP) | Fluent Builder |
| Pravidla s voláním externích služeb | Fluent Builder |
| Jednoduchá pravidla událost → akce | Tagged šablona nebo YAML |
| CI/CD řízené nasazení pravidel | YAML |

## Míchání přístupů

Protože všechny čtyři přístupy produkují objekty `RuleInput`, můžete je libovolně míchat ve stejném enginu:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event, emit, setFact, ref, rule,
  loadRulesFromFile,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'mixed' });

  // Fluent builder — komplexní pravidlo s časovačem a službou
  engine.registerRule(
    Rule.create('payment-flow')
      .priority(200)
      .when(onEvent('order.created'))
      .if(event('total').gt(0))
      .then(setFact('order:${event.orderId}:status', 'pending'))
      .build()
  );

  // Tagged šablona — jednoduché notifikační pravidlo
  engine.registerRule(rule`
    id: order-log
    priority: 10
    WHEN event order.created
    THEN log info "New order received"
  `);

  // YAML — externě spravovaná pravidla
  const yamlRules = await loadRulesFromFile('./rules/discounts.yaml');
  yamlRules.forEach(r => engine.registerRule(r));

  // Surový objekt — programaticky generované
  const dynamicRules = generateRulesFromDatabase();
  dynamicRules.forEach(r => engine.registerRule(r));

  await engine.stop();
}
```

### Doporučené vzory

Běžná architektura je:

- **Klíčová pravidla** (Fluent Builder): Komplexní workflow pravidla používající časovače, služby a temporální vzory. Píší vývojáři, verzují se s aplikací.
- **Konfigurační pravidla** (YAML): Business pravidla, která se často mění. Uložena v externích souborech nebo databázi. Načítána při startu a přes hot-reload.
- **Testovací/debug pravidla** (Tagged šablona): Rychlá inline pravidla pro testování, prototypování nebo ladění konkrétních scénářů.

## Migrace mezi přístupy

### Surové objekty → Fluent Builder

Nejčastější migrace. Mapujte každé surové pole na jeho builder ekvivalent:

```text
  Surový objekt                  Fluent Builder
  ──────────                     ──────────────
  id: '...'                      Rule.create('...')
  name: '...'                    .name('...')
  priority: N                    .priority(N)
  tags: [...]                    .tags(...)
  trigger: { type: 'event' }     .when(onEvent('...'))
  conditions: [{ source, op }]   .if(event('...').op(value))
  actions: [{ type: 'emit' }]    .then(emit('...'))
  —                              .build()
```

### Fluent Builder → YAML

Když potřebujete externalizovat pravidla. Výstup `.build()` je již `RuleInput` — serializujte ho do YAML:

```typescript
import YAML from 'yaml';

const rule = Rule.create('my-rule')
  .when(onEvent('order.created'))
  .then(emit('order.processed'))
  .build();

const yaml = YAML.stringify(rule);
// Zapište do souboru nebo uložte do databáze
```

### Tagged šablona → Fluent Builder

Když prototypové pravidlo potřebuje funkce, které tagged šablona nepodporuje (časovače, služby, atd.). Konverze je přímočará — nahraďte klíčová slova metodami builderu:

```text
  Tagged šablona               Fluent Builder
  ───────────────              ──────────────
  id: my-rule                  Rule.create('my-rule')
  WHEN event topic             .when(onEvent('topic'))
  IF event.field >= value      .if(event('field').gte(value))
  THEN emit topic { ... }      .then(emit('topic', { ... }))
  —                            .build()
```

## Kompletní funkční příklad

Systém pravidel využívající všechny čtyři přístupy společně:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, event, fact,
  emit, setFact, setTimer, log, ref, rule,
  loadRulesFromYAML,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'multi-approach' });

  // === Fluent Builder: komplexní workflow s časovačem ===
  engine.registerRule(
    Rule.create('order-init')
      .name('Initialize Order')
      .priority(200)
      .tags('orders')
      .when(onEvent('order.created'))
      .if(event('total').gt(0))
      .then(setFact('order:${event.orderId}:status', 'pending'))
      .also(setTimer({
        name: 'order-timeout:${event.orderId}',
        duration: '30m',
        onExpire: {
          topic: 'order.expired',
          data: { orderId: ref('event.orderId') },
        },
      }))
      .build()
  );

  // === Tagged šablona: jednoduché audit pravidlo ===
  engine.registerRule(rule`
    id: audit-log
    priority: 5
    tags: audit

    WHEN event order.created
    THEN log info "Audit: order created"
  `);

  // === YAML: business pravidla z konfigurace ===
  const discountRules = loadRulesFromYAML(`
    - id: bulk-discount
      name: Bulk Discount
      priority: 100
      tags:
        - pricing
      trigger:
        type: event
        topic: order.created
      conditions:
        - source:
            type: event
            field: quantity
          operator: gte
          value: 100
      actions:
        - type: set_fact
          key: "order:\${event.orderId}:discount"
          value: 0.15
        - type: log
          level: info
          message: "Bulk discount applied"

    - id: loyalty-bonus
      name: Loyalty Bonus
      priority: 90
      tags:
        - pricing
        - loyalty
      trigger:
        type: event
        topic: order.created
      conditions:
        - source:
            type: fact
            pattern: "customer:\${event.customerId}:orders"
          operator: gte
          value: 10
      actions:
        - type: set_fact
          key: "order:\${event.orderId}:loyaltyBonus"
          value: 0.05
  `);
  discountRules.forEach(r => engine.registerRule(r));

  // === Surový objekt: generováno z externí konfigurace ===
  engine.registerRule({
    id: 'status-monitor',
    name: 'Order Status Monitor',
    priority: 10,
    enabled: true,
    tags: ['monitoring'],
    trigger: { type: 'fact', pattern: 'order:*:status' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Status changed: ${event.key} = ${event.value}',
      },
    ],
  });

  // --- Test ---
  await engine.setFact('customer:C-1:orders', 12);

  await engine.emit('order.created', {
    orderId: 'ORD-1',
    customerId: 'C-1',
    total: 5000,
    quantity: 150,
  });

  console.log('Status:', engine.getFact('order:ORD-1:status'));
  // "pending"
  console.log('Sleva:', engine.getFact('order:ORD-1:discount'));
  // 0.15
  console.log('Věrnostní bonus:', engine.getFact('order:ORD-1:loyaltyBonus'));
  // 0.05

  await engine.stop();
}

main();
```

## Cvičení

Budujete notifikační systém. Zvolte nejvhodnější přístup pro každé pravidlo a implementujte ho:

1. **Uvítací email** — Když se vyvolá `user.registered`, zavolejte `emailService.sendWelcome(email)`. (Nápověda: potřebuje `callService`)
2. **Upozornění na přihlášení** — Když se vyvolá `auth.login` a `country` není v `['CZ', 'SK']`, zalogujte varování. (Nápověda: jednoduché pravidlo)
3. **Konfigurovatelný práh** — Provozní tým spravuje pravidlo, které emituje `alert.high_load`, když `system.metrics` hlásí `cpu` > určitý práh. Práh se často mění. (Nápověda: kdo to spravuje?)

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, callService, log, ref, rule,
  loadRulesFromYAML,
} from '@hamicek/noex-rules/dsl';

// 1. Uvítací email → Fluent Builder (potřebuje callService)
const welcomeEmail = Rule.create('welcome-email')
  .name('Send Welcome Email')
  .priority(100)
  .tags('users', 'notifications')
  .when(onEvent('user.registered'))
  .then(callService('emailService')
    .method('sendWelcome')
    .args(ref('event.email'))
  )
  .build();

// 2. Upozornění na přihlášení → Tagged šablona (jednoduchá podmínka + log)
const loginAlert = rule`
  id: login-alert
  name: Foreign Login Alert
  priority: 80
  tags: security

  WHEN event auth.login
  IF event.country not_in [CZ, SK]
  THEN log warn "Login from unexpected country"
`;

// 3. Konfigurovatelný práh → YAML (spravuje provozní tým)
const thresholdRules = loadRulesFromYAML(`
  id: high-cpu-alert
  name: High CPU Alert
  priority: 200
  tags:
    - monitoring
    - alerts
  trigger:
    type: event
    topic: system.metrics
  conditions:
    - source:
        type: event
        field: cpu
      operator: gt
      value: 85
  actions:
    - type: emit_event
      topic: alert.high_load
      data:
        cpu:
          ref: event.cpu
    - type: log
      level: warn
      message: "CPU na \${event.cpu}%"
`);

// Registrace všech
engine.registerRule(welcomeEmail);
engine.registerRule(loginAlert);
thresholdRules.forEach(r => engine.registerRule(r));
```

Volba je řízena požadavky: callService potřebuje builder, jednoduchá podmínka+log sedí do tagged šablony a provozně spravovaný práh patří do YAML, kde ho lze měnit bez nasazení kódu.

</details>

## Shrnutí

- Všechny čtyři přístupy (surové objekty, fluent builder, tagged šablony, YAML) produkují stejný typ `RuleInput`
- **Fluent Builder**: nejlepší pro produkční TypeScript — plná typová bezpečnost, všechny funkce, validace při kompilaci
- **Tagged šablona**: nejlepší pro prototypování a jednoduchá pravidla — kompaktní syntaxe, minimální importy
- **YAML**: nejlepší pro konfiguračně řízené systémy — externí soubory, netechnické publikum, hot-reloadovatelné
- **Surové objekty**: nejlepší pro programatické generování pravidel — když pravidla pocházejí z databáze nebo externího zdroje
- Přístupy lze libovolně míchat ve stejném enginu — engine neví ani ho nezajímá, jak byla pravidla vytvořena
- Volte podle toho: kdo pravidla píše, jaké funkce potřebujete a zda pravidla musí žít mimo kódovou bázi
- Migrace mezi přístupy je přímočará, protože všechny mapují na stejný základní typ

---

Další: [Co je CEP?](../05-cep/01-co-je-cep.md)
