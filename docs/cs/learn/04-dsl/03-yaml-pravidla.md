# YAML pravidla

YAML pravidla umožňují definovat business logiku v konfiguračních souborech mimo váš TypeScript kód. Tím se oddělí tvorba pravidel od nasazení aplikace — produktový manažer může upravit YAML soubor a nasadit nová pravidla bez zásahu do kódové báze. noex-rules poskytuje `loadRulesFromYAML()` pro parsování YAML řetězců a `loadRulesFromFile()` pro přímé čtení YAML souborů.

## Co se naučíte

- Jak načítat pravidla z YAML řetězců pomocí `loadRulesFromYAML()`
- Jak načítat pravidla ze souborů pomocí `loadRulesFromFile()`
- Tři podporované YAML formáty (jedno pravidlo, pole, klíč `rules`)
- YAML syntaxe pro triggery, podmínky a akce
- Validace a zpracování chyb (`YamlLoadError`, `YamlValidationError`)
- Kdy jsou YAML pravidla správná volba

## Načítání pravidel z YAML

### Z řetězce

```typescript
import { loadRulesFromYAML } from '@hamicek/noex-rules/dsl';

const rules = loadRulesFromYAML(`
  id: order-alert
  name: Order Alert
  trigger:
    type: event
    topic: order.created
  conditions:
    - source:
        type: event
        field: total
      operator: gte
      value: 1000
  actions:
    - type: emit_event
      topic: alert.large_order
      data:
        orderId: "\${event.orderId}"
`);

rules.forEach(r => engine.registerRule(r));
```

`loadRulesFromYAML()` vždy vrací pole, i pro definici jednoho pravidla.

### Ze souboru

```typescript
import { loadRulesFromFile } from '@hamicek/noex-rules/dsl';

const rules = await loadRulesFromFile('./rules/orders.yaml');
rules.forEach(r => engine.registerRule(r));
```

`loadRulesFromFile()` je asynchronní — přečte soubor z disku, zparsuje YAML obsah, zvaliduje každé pravidlo a vrátí pole. Používejte při startu aplikace nebo ve scénářích s hot-reload.

## YAML formáty

Loader přijímá tři formáty. Všechny produkují stejný výstup: pole objektů `RuleInput`.

### Formát 1: Jeden pravidlový objekt

YAML dokument definující jedno pravidlo na nejvyšší úrovni:

```yaml
id: order-alert
name: Order Alert
priority: 100
enabled: true
tags:
  - orders
  - alerts
trigger:
  type: event
  topic: order.created
conditions:
  - source:
      type: event
      field: total
    operator: gte
    value: 1000
actions:
  - type: emit_event
    topic: alert.large_order
    data:
      orderId: "${event.orderId}"
```

### Formát 2: Pole pravidel

YAML dokument s polem na nejvyšší úrovni:

```yaml
- id: order-alert
  trigger:
    type: event
    topic: order.created
  actions:
    - type: log
      level: info
      message: "Order received"

- id: payment-check
  trigger:
    type: event
    topic: payment.received
  actions:
    - type: emit_event
      topic: payment.validated
```

### Formát 3: Objekt s klíčem `rules`

YAML dokument s vlastností `rules` obsahující pole:

```yaml
rules:
  - id: order-alert
    trigger:
      type: event
      topic: order.created
    actions:
      - type: log
        level: info
        message: "Order received"

  - id: payment-check
    trigger:
      type: event
      topic: payment.received
    actions:
      - type: emit_event
        topic: payment.validated
```

Tento formát je užitečný, když chcete do stejného souboru přidat metadata nebo jiné klíče na nejvyšší úrovni vedle pravidel.

## Struktura YAML pravidla

Každé YAML pravidlo se mapuje přímo na typ `RuleInput`. Struktura zrcadlí formát surového objektu:

```yaml
# Povinné
id: rule-unique-id
trigger:
  type: event | fact | timer
  topic: event.topic           # pro event triggery
  pattern: "fact:*:pattern"    # pro fact triggery
  name: timer-name             # pro timer triggery

# Povinné (alespoň jedna)
actions:
  - type: emit_event | set_fact | delete_fact | log | set_timer | cancel_timer | call_service
    # ... vlastnosti specifické pro akci

# Volitelné
name: Lidsky čitelný název
description: Co pravidlo dělá
priority: 100
enabled: true
tags:
  - tag1
  - tag2
conditions:
  - source:
      type: event | fact | context
      field: fieldName         # pro zdroj event
      pattern: "fact:pattern"  # pro zdroj fact
      key: contextKey          # pro zdroj context
    operator: eq | neq | gt | gte | lt | lte | in | not_in | contains | not_contains | matches | exists | not_exists
    value: porovnávací-hodnota
```

### Triggery

```yaml
# Event trigger
trigger:
  type: event
  topic: order.created

# Event trigger se zástupným znakem
trigger:
  type: event
  topic: "order.*"

# Fact trigger
trigger:
  type: fact
  pattern: "customer:*:tier"

# Timer trigger
trigger:
  type: timer
  name: payment-timeout
```

### Podmínky

```yaml
conditions:
  # Porovnání pole události
  - source:
      type: event
      field: total
    operator: gte
    value: 100

  # Porovnání hodnoty faktu (s interpolací)
  - source:
      type: fact
      pattern: "customer:${event.customerId}:tier"
    operator: eq
    value: vip

  # Porovnání kontextu
  - source:
      type: context
      key: environment
    operator: eq
    value: production

  # Kontrola existence (hodnota není potřeba)
  - source:
      type: event
      field: couponCode
    operator: exists
    value: true
```

### Akce

```yaml
actions:
  # Emitování události
  - type: emit_event
    topic: order.confirmed
    data:
      orderId: "${event.orderId}"
      total: "${event.total}"

  # Nastavení faktu
  - type: set_fact
    key: "order:${event.orderId}:status"
    value: confirmed

  # Nastavení faktu s referencí
  - type: set_fact
    key: "order:${event.orderId}:total"
    value:
      ref: event.total

  # Smazání faktu
  - type: delete_fact
    key: "order:${event.orderId}:pending"

  # Log
  - type: log
    level: info
    message: "Order ${event.orderId} confirmed"

  # Nastavení časovače
  - type: set_timer
    name: "payment-timeout:${event.orderId}"
    duration: 15m
    onExpire:
      topic: order.payment_timeout
      data:
        orderId: "${event.orderId}"

  # Zrušení časovače
  - type: cancel_timer
    name: "payment-timeout:${event.orderId}"

  # Volání služby
  - type: call_service
    service: emailService
    method: send
    args:
      - "${event.email}"
      - "Order Confirmed"
```

### Reference v YAML

Použijte klíč `ref` pro vytvoření runtime referencí, které zachovávají původní typ:

```yaml
# Interpolace řetězce — výsledek je vždy řetězec
message: "Total: ${event.total}"

# Reference — zachovává typ (číslo zůstane číslem)
value:
  ref: event.total
```

V objektech `data` můžete použít buď `${výraz}` interpolaci (vždy produkuje řetězce) nebo explicitní `ref` objekty:

```yaml
data:
  # Interpolace řetězce
  label: "Order ${event.orderId}"

  # Typovaná reference
  amount:
    ref: event.total
```

## Zpracování chyb

YAML loader vyhazuje specifické chyby pro různé typy selhání:

### YamlLoadError

Vyhozena, když YAML obsah nelze zparsovat nebo soubor nelze přečíst:

```typescript
import { loadRulesFromYAML, YamlLoadError } from '@hamicek/noex-rules/dsl';

try {
  const rules = loadRulesFromYAML('invalid: yaml: content: [');
} catch (error) {
  if (error instanceof YamlLoadError) {
    console.error('Parsování YAML selhalo:', error.message);
  }
}
```

### YamlValidationError

Vyhozena, když se YAML úspěšně zparsuje, ale struktura pravidla je neplatná:

```typescript
import { loadRulesFromYAML, YamlValidationError } from '@hamicek/noex-rules/dsl';

try {
  const rules = loadRulesFromYAML(`
    id: missing-trigger
    actions:
      - type: log
        level: info
        message: "Hello"
  `);
} catch (error) {
  if (error instanceof YamlValidationError) {
    console.error('Neplatná struktura pravidla:', error.message);
  }
}
```

### Defenzivní načítání

Pro produkční použití obalte načítání do ošetření chyb:

```typescript
import {
  loadRulesFromFile,
  YamlLoadError,
  YamlValidationError,
} from '@hamicek/noex-rules/dsl';

async function loadRulesSafely(path: string) {
  try {
    return await loadRulesFromFile(path);
  } catch (error) {
    if (error instanceof YamlLoadError) {
      console.error(`Selhání čtení/parsování ${path}:`, error.message);
    } else if (error instanceof YamlValidationError) {
      console.error(`Neplatné pravidlo v ${path}:`, error.message);
    } else {
      throw error;
    }
    return [];
  }
}
```

## Další YAML loadery

noex-rules také poskytuje specializované YAML loadery pro další typy zdrojů:

```typescript
import {
  loadGroupsFromYAML,     // Načtení skupin pravidel
  loadGroupsFromFile,
  loadGoalsFromYAML,       // Načtení cílů zpětného řetězení
  loadGoalsFromFile,
  loadTemplateFromYAML,    // Načtení šablon pravidel
  loadTemplateFromFile,
} from '@hamicek/noex-rules/dsl';
```

Ty sledují stejný vzor: synchronní parsování řetězce nebo asynchronní načtení souboru, s validačními chybami při neplatných strukturách.

## Kompletní funkční příklad

Systém správy pravidel založený na souborech, který načítá pravidla z YAML souboru:

**rules/order-pipeline.yaml:**

```yaml
rules:
  - id: order-init
    name: Initialize Order
    priority: 200
    tags:
      - orders
      - workflow
    trigger:
      type: event
      topic: order.created
    conditions:
      - source:
          type: event
          field: total
        operator: gt
        value: 0
    actions:
      - type: set_fact
        key: "order:${event.orderId}:status"
        value: pending
      - type: set_fact
        key: "order:${event.orderId}:total"
        value:
          ref: event.total
      - type: emit_event
        topic: order.validated
        data:
          orderId:
            ref: event.orderId
      - type: log
        level: info
        message: "Order ${event.orderId} initialized"

  - id: vip-discount
    name: VIP Discount
    priority: 100
    tags:
      - orders
      - pricing
    trigger:
      type: event
      topic: order.validated
    conditions:
      - source:
          type: fact
          pattern: "customer:${event.customerId}:tier"
        operator: eq
        value: vip
    actions:
      - type: set_fact
        key: "order:${event.orderId}:discount"
        value: 0.1
      - type: log
        level: info
        message: "VIP discount applied to order ${event.orderId}"

  - id: order-confirm
    name: Confirm Order
    priority: 50
    tags:
      - orders
    trigger:
      type: event
      topic: order.validated
    actions:
      - type: set_fact
        key: "order:${event.orderId}:status"
        value: confirmed
      - type: emit_event
        topic: order.confirmed
        data:
          orderId:
            ref: event.orderId
```

**app.ts:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { loadRulesFromFile } from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'yaml-demo' });

  // Načtení všech pravidel ze souboru
  const rules = await loadRulesFromFile('./rules/order-pipeline.yaml');
  rules.forEach(r => engine.registerRule(r));

  console.log(`Načteno ${rules.length} pravidel`);
  // Načteno 3 pravidel

  // Nastavení zákaznických dat
  await engine.setFact('customer:C-100:tier', 'vip');

  // Spuštění pipeline
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 250,
  });

  console.log('Status:', engine.getFact('order:ORD-001:status'));
  // "confirmed"
  console.log('Sleva:', engine.getFact('order:ORD-001:discount'));
  // 0.1

  await engine.stop();
}

main();
```

## Cvičení

Vytvořte YAML soubor, který definuje dvě pravidla:

1. **Teplotní výstraha**: Spouští se na událost `sensor.reading`. Pokud pole `temperature` > 40, emitujte `alert.overheat` s ID senzoru a teplotou a zalogujte varování.
2. **Senzor offline**: Spouští se na událost `sensor.heartbeat_missed`. Nastavte fakt `sensor:${sensorId}:status` na `"offline"` a zalogujte chybu.

Poté napište TypeScript kód pro načtení a registraci pravidel.

<details>
<summary>Řešení</summary>

**rules/sensors.yaml:**

```yaml
rules:
  - id: temp-alert
    name: Temperature Alert
    priority: 100
    tags:
      - sensors
      - alerts
    trigger:
      type: event
      topic: sensor.reading
    conditions:
      - source:
          type: event
          field: temperature
        operator: gt
        value: 40
    actions:
      - type: emit_event
        topic: alert.overheat
        data:
          sensorId:
            ref: event.sensorId
          temperature:
            ref: event.temperature
      - type: log
        level: warn
        message: "Senzor ${event.sensorId} se přehřívá: ${event.temperature}C"

  - id: sensor-offline
    name: Sensor Offline
    priority: 80
    tags:
      - sensors
      - status
    trigger:
      type: event
      topic: sensor.heartbeat_missed
    conditions: []
    actions:
      - type: set_fact
        key: "sensor:${event.sensorId}:status"
        value: offline
      - type: log
        level: error
        message: "Senzor ${event.sensorId} je offline"
```

**app.ts:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { loadRulesFromFile } from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'sensors' });

  const rules = await loadRulesFromFile('./rules/sensors.yaml');
  rules.forEach(r => engine.registerRule(r));

  // Test teplotní výstrahy
  await engine.emit('sensor.reading', { sensorId: 'S-01', temperature: 45 });

  // Test offline senzoru
  await engine.emit('sensor.heartbeat_missed', { sensorId: 'S-02' });
  console.log('Status S-02:', engine.getFact('sensor:S-02:status'));
  // "offline"

  await engine.stop();
}

main();
```

YAML soubor je kompletně oddělený od aplikačního kódu. Pravidla lze aktualizovat úpravou YAML souboru a znovunačtením (ručně nebo přes hot-reload) bez překompilování TypeScriptu.

</details>

## Shrnutí

- `loadRulesFromYAML(yamlString)` parsuje YAML obsah synchronně a vrací `RuleInput[]`
- `loadRulesFromFile(path)` čte a parsuje YAML soubor asynchronně
- Tři YAML formáty: jeden pravidlový objekt, pole pravidel, objekt s klíčem `rules`
- Struktura YAML pravidla zrcadlí surový typ `RuleInput`: `id`, `trigger`, `conditions`, `actions`, plus volitelná metadata
- Použijte `${výraz}` interpolaci v řetězcích pro runtime-resolvované hodnoty
- Použijte `ref: cesta` objekty pro typované runtime reference
- `YamlLoadError` při chybách parsování/souboru, `YamlValidationError` při neplatných strukturách pravidel
- Další loadery pro skupiny, cíle a šablony sledují stejný vzor
- YAML pravidla jsou ideální, když netechničtí uživatelé potřebují tvořit pravidla nebo se pravidla musí měnit bez nasazení kódu

---

Další: [Volba správného přístupu](./04-volba-pristupu.md)
