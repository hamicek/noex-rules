# DSL YAML Loader

Načítání definic pravidel, skupin, cílů a šablon z YAML souborů nebo řetězců.

## Import

```typescript
import {
  loadRulesFromYAML,
  loadRulesFromFile,
  loadGroupsFromYAML,
  loadGroupsFromFile,
  loadGoalsFromYAML,
  loadGoalsFromFile,
  loadTemplateFromYAML,
  loadTemplateFromFile,
  isTemplateYAML,
  validateRule,
  validateGoal,
  YamlLoadError,
  YamlValidationError,
} from '@hamicek/noex-rules';
```

---

## loadRulesFromYAML()

```typescript
function loadRulesFromYAML(yamlContent: string): RuleInput[]
```

Parsuje YAML řetězec a vrací pole validovaných definic pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| yamlContent | `string` | ano | Surový YAML řetězec |

**Návratová hodnota:** `RuleInput[]` — Pole validovaných objektů pravidel

**Vyhazuje:**

- `YamlLoadError` — Při syntaktických chybách YAML nebo prázdném obsahu
- `YamlValidationError` — Při chybách validace struktury pravidla

**Akceptované vstupní formáty:**

| Formát | Popis |
|--------|-------|
| Jeden objekt | Jedna definice pravidla → `[RuleInput]` |
| Pole | YAML pole pravidel → `RuleInput[]` |
| Objekt s klíčem `rules` | `{ rules: [...] }` → `RuleInput[]` |

**Příklad:**

```typescript
const rules = loadRulesFromYAML(`
  id: order-notification
  trigger:
    type: event
    topic: order.created
  actions:
    - type: emit_event
      topic: notification.send
      data:
        orderId: \${event.orderId}
`);

engine.registerRule(rules[0]);
```

---

## loadRulesFromFile()

```typescript
function loadRulesFromFile(filePath: string): Promise<RuleInput[]>
```

Načte YAML soubor z disku a vrátí validované definice pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| filePath | `string` | ano | Cesta k YAML souboru |

**Návratová hodnota:** `Promise<RuleInput[]>` — Pole validovaných objektů pravidel

**Vyhazuje:**

- `YamlLoadError` — Při chybách čtení souboru, syntaktických chybách YAML nebo prázdných souborech
- `YamlValidationError` — Při chybách validace struktury pravidla

**Příklad:**

```typescript
const rules = await loadRulesFromFile('./rules/orders.yaml');

for (const rule of rules) {
  engine.registerRule(rule);
}
```

---

## loadGroupsFromYAML()

```typescript
function loadGroupsFromYAML(yamlContent: string): RuleGroupInput[]
```

Parsuje YAML řetězec a vrací pole validovaných definic skupin.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| yamlContent | `string` | ano | Surový YAML řetězec |

**Návratová hodnota:** `RuleGroupInput[]` — Pole validovaných objektů skupin

**Vyhazuje:**

- `YamlLoadError` — Při syntaktických chybách YAML nebo prázdném obsahu
- `YamlValidationError` — Při chybách validace struktury skupiny

**Akceptované vstupní formáty:**

| Formát | Popis |
|--------|-------|
| Jeden objekt | Jedna definice skupiny → `[RuleGroupInput]` |
| Pole | YAML pole skupin → `RuleGroupInput[]` |
| Objekt s klíčem `groups` | `{ groups: [...] }` → `RuleGroupInput[]` |

**Příklad:**

```typescript
const groups = loadGroupsFromYAML(`
  - id: billing
    name: Billing Rules
    description: All billing-related rules
  - id: notifications
    name: Notification Rules
    enabled: false
`);
```

---

## loadGroupsFromFile()

```typescript
function loadGroupsFromFile(filePath: string): Promise<RuleGroupInput[]>
```

Načte YAML soubor z disku a vrátí validované definice skupin.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| filePath | `string` | ano | Cesta k YAML souboru |

**Návratová hodnota:** `Promise<RuleGroupInput[]>` — Pole validovaných objektů skupin

**Vyhazuje:**

- `YamlLoadError` — Při chybách čtení souboru, syntaktických chybách YAML nebo prázdných souborech
- `YamlValidationError` — Při chybách validace struktury skupiny

**Příklad:**

```typescript
const groups = await loadGroupsFromFile('./config/groups.yaml');
```

---

## loadGoalsFromYAML()

```typescript
function loadGoalsFromYAML(yamlContent: string): Goal[]
```

Parsuje YAML řetězec a vrací pole validovaných definic cílů pro dotazy se zpětným řetězením.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| yamlContent | `string` | ano | Surový YAML řetězec |

**Návratová hodnota:** `Goal[]` — Pole validovaných objektů cílů

**Vyhazuje:**

- `YamlLoadError` — Při syntaktických chybách YAML nebo prázdném obsahu
- `YamlValidationError` — Při chybách validace struktury cíle

**Akceptované vstupní formáty:**

| Formát | Popis |
|--------|-------|
| Jeden objekt | Jedna definice cíle → `[Goal]` |
| Pole | YAML pole cílů → `Goal[]` |
| Objekt s klíčem `queries` | `{ queries: [...] }` → `Goal[]` |

**Příklad:**

```typescript
const goals = loadGoalsFromYAML(`
  - type: fact
    key: "customer:123:tier"
    value: "vip"
  - type: event
    topic: "order.completed"
`);

const result = await engine.query(goals[0]);
```

---

## loadGoalsFromFile()

```typescript
function loadGoalsFromFile(filePath: string): Promise<Goal[]>
```

Načte YAML soubor z disku a vrátí validované definice cílů.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| filePath | `string` | ano | Cesta k YAML souboru |

**Návratová hodnota:** `Promise<Goal[]>` — Pole validovaných objektů cílů

**Vyhazuje:**

- `YamlLoadError` — Při chybách čtení souboru, syntaktických chybách YAML nebo prázdných souborech
- `YamlValidationError` — Při chybách validace struktury cíle

**Příklad:**

```typescript
const goals = await loadGoalsFromFile('./queries/customer-tier.yaml');
```

---

## loadTemplateFromYAML()

```typescript
function loadTemplateFromYAML(yamlContent: string): RuleTemplate
```

Parsuje YAML řetězec obsahující definici šablony a vrací zkompilovanou `RuleTemplate`.

Zástupné symboly pro parametry šablony používají syntaxi `{{paramName}}`. Runtime reference (`${path}` nebo `{ ref: path }`) jsou zachovány pro vyhodnocení pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| yamlContent | `string` | ano | Surový YAML řetězec |

**Návratová hodnota:** `RuleTemplate` — Zkompilovaná šablona připravená k instanciaci

**Vyhazuje:**

- `YamlLoadError` — Při syntaktických chybách YAML, chybějících/neplatných polích nebo nedeklarovaných parametrech šablony v blueprintu

**Očekávaná struktura YAML:**

```yaml
template:
  templateId: my-template      # povinné
  name: My Template            # volitelné
  description: ...             # volitelné
  version: "1.0.0"             # volitelné
  tags: [alert, monitoring]    # volitelné
  parameters:                  # povinné
    - name: topic
      type: string
    - name: threshold
      type: number
      default: 100
  blueprint:                   # povinné
    id: "rule-{{topic}}"
    trigger:
      type: event
      topic: "{{topic}}"
    actions:
      - type: emit_event
        topic: alert.triggered
```

**Příklad:**

```typescript
const template = loadTemplateFromYAML(`
  template:
    templateId: threshold-alert
    name: Threshold Alert
    parameters:
      - name: topic
        type: string
      - name: threshold
        type: number
        default: 100
    blueprint:
      id: "alert-{{topic}}"
      name: "Alert on {{topic}}"
      trigger:
        type: event
        topic: "{{topic}}"
      conditions:
        - source: { type: event, field: value }
          operator: gte
          value: "{{threshold}}"
      actions:
        - type: emit_event
          topic: alert.triggered
          data:
            source: "{{topic}}"
`);

const rule = template.instantiate({ topic: 'metrics.cpu', threshold: 90 });
engine.registerRule(rule);
```

---

## loadTemplateFromFile()

```typescript
function loadTemplateFromFile(filePath: string): Promise<RuleTemplate>
```

Načte YAML soubor z disku a vrátí zkompilovanou `RuleTemplate`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| filePath | `string` | ano | Cesta k YAML souboru |

**Návratová hodnota:** `Promise<RuleTemplate>` — Zkompilovaná šablona připravená k instanciaci

**Vyhazuje:**

- `YamlLoadError` — Při chybách čtení souboru, syntaktických chybách YAML nebo chybách validace šablony

**Příklad:**

```typescript
const template = await loadTemplateFromFile('./templates/threshold-alert.yaml');
const rule = template.instantiate({ topic: 'metrics.memory', threshold: 80 });
```

---

## isTemplateYAML()

```typescript
function isTemplateYAML(parsed: unknown): boolean
```

Kontroluje, zda naparsovaná YAML hodnota reprezentuje definici šablony (má klíč `template` na nejvyšší úrovni). Užitečné pro rozlišení šablonového YAML od běžného pravidlového YAML před výběrem správného loaderu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| parsed | `unknown` | ano | Hodnota vrácená `yaml.parse()` |

**Návratová hodnota:** `boolean` — `true` pokud je `parsed` ne-polový objekt s klíčem `template`

**Příklad:**

```typescript
import { parse } from 'yaml';

const content = await fs.readFile('rules.yaml', 'utf-8');
const parsed = parse(content);

if (isTemplateYAML(parsed)) {
  const template = loadTemplateFromYAML(content);
  // Použití šablony...
} else {
  const rules = loadRulesFromYAML(content);
  // Použití pravidel...
}
```

---

## validateRule()

```typescript
function validateRule(obj: unknown, path?: string): RuleInput
```

Validuje surový objekt (typicky z YAML parseru) a vrací typově bezpečný `RuleInput`. Toto je interní validační funkce používaná `loadRulesFromYAML`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| obj | `unknown` | ano | Surový naparsovaný objekt |
| path | `string` | ne | Tečkově oddělená cesta pro chybové zprávy (výchozí: `"rule"`) |

**Návratová hodnota:** `RuleInput` — Validovaný objekt pravidla

**Vyhazuje:**

- `YamlValidationError` — Při jakékoliv chybě validace (zpráva obsahuje cestu k poli)

**Aplikované výchozí hodnoty:**

| Pole | Výchozí |
|------|---------|
| name | Stejné jako `id` |
| priority | `0` |
| enabled | `true` |
| tags | `[]` |
| conditions | `[]` |

**Příklad:**

```typescript
import { parse } from 'yaml';

const parsed = parse(yamlString);
const rule = validateRule(parsed, 'rules[0]');
```

---

## validateGoal()

```typescript
function validateGoal(obj: unknown, path?: string): Goal
```

Validuje surový objekt a vrací typově bezpečný `Goal` pro zpětné řetězení.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| obj | `unknown` | ano | Surový naparsovaný objekt |
| path | `string` | ne | Tečkově oddělená cesta pro chybové zprávy (výchozí: `"goal"`) |

**Návratová hodnota:** `Goal` — Validovaný objekt cíle (`FactGoal` nebo `EventGoal`)

**Vyhazuje:**

- `YamlValidationError` — Při jakékoliv chybě validace

**Příklad:**

```typescript
import { parse } from 'yaml';

const parsed = parse(yamlString);
const goal = validateGoal(parsed);
```

---

## YamlLoadError

```typescript
class YamlLoadError extends DslError {
  readonly filePath?: string;

  constructor(message: string, filePath?: string);
}
```

Vyhazováno při chybách čtení souboru, syntaktických chybách YAML nebo prázdném obsahu.

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| message | `string` | Kompletní chybová zpráva (obsahuje cestu k souboru, pokud je dostupná) |
| filePath | `string \| undefined` | Cesta k souboru, který způsobil chybu |
| name | `string` | Vždy `'YamlLoadError'` |

**Zpracování chyb:**

```typescript
import { loadRulesFromFile, YamlLoadError } from '@hamicek/noex-rules';

try {
  const rules = await loadRulesFromFile('./rules.yaml');
} catch (err) {
  if (err instanceof YamlLoadError) {
    console.error(`Nepodařilo se načíst ${err.filePath}: ${err.message}`);
  }
}
```

**Časté chyby:**

| Chyba | Příčina |
|-------|---------|
| `Failed to read file: ...` | Soubor neexistuje nebo není čitelný |
| `YAML syntax error: ...` | Neplatná YAML syntaxe |
| `YAML content is empty` | Soubor je prázdný nebo obsahuje pouze bílé znaky |
| `YAML array is empty, expected at least one rule` | Pole neobsahuje žádná pravidla |
| `"rules" must be an array` | Klíč `rules` není pole |

---

## YamlValidationError

```typescript
class YamlValidationError extends DslError {
  readonly path: string;

  constructor(message: string, path: string);
}
```

Vyhazováno při chybách validace struktury pravidla. Obsahuje tečkově oddělenou cestu k neplatnému poli pro snadné ladění.

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| message | `string` | Kompletní chybová zpráva včetně cesty k poli |
| path | `string` | Tečkově oddělená cesta k neplatnému poli |
| name | `string` | Vždy `'YamlValidationError'` |

**Zpracování chyb:**

```typescript
import { loadRulesFromYAML, YamlValidationError } from '@hamicek/noex-rules';

try {
  const rules = loadRulesFromYAML(yamlContent);
} catch (err) {
  if (err instanceof YamlValidationError) {
    console.error(`Chyba validace na ${err.path}: ${err.message}`);
  }
}
```

**Časté chyby:**

| Chyba | Příklad cesty | Příčina |
|-------|---------------|---------|
| `missing required field "id"` | `rule` | Pravidlo nemá `id` |
| `must be a non-empty string` | `rule.id` | Prázdné nebo ne-řetězcové `id` |
| `invalid trigger type "..."` | `rule.trigger.type` | Neznámý typ triggeru |
| `invalid operator "..."` | `rule.conditions[0].operator` | Neznámý operátor podmínky |
| `must have at least one action` | `rule.actions` | Prázdné pole akcí |
| `invalid action type "..."` | `rule.actions[0].type` | Neznámý typ akce |

---

## YAML Schéma

### Schéma pravidla

```yaml
# Povinné
id: string                    # Unikátní identifikátor pravidla

# Volitelná metadata
name: string                  # Čitelný název (výchozí je id)
description: string           # Popis pravidla
priority: number              # Priorita vykonání (výchozí: 0)
enabled: boolean              # Zda je pravidlo aktivní (výchozí: true)
tags: string[]                # Tagy pro kategorizaci
group: string                 # Identifikátor skupiny

# Povinný trigger
trigger:
  type: event | fact | timer | temporal
  # Pro event trigger:
  topic: string               # Topic události
  # Pro fact trigger:
  pattern: string             # Vzor faktu (podporuje wildcards)
  # Pro timer trigger:
  name: string                # Název časovače
  # Pro temporal trigger:
  pattern:                    # Temporální vzor (viz níže)

# Volitelné podmínky (všechny musí být pravdivé)
conditions:
  - source:
      type: event | fact | context | lookup | baseline
      # Pole specifická pro typ...
    operator: eq | neq | gt | gte | lt | lte | in | not_in | contains | not_contains | matches | exists | not_exists | between | starts_with | ends_with
    value: any                # Nepotřebné pro exists/not_exists

# Povinné akce (alespoň jedna)
actions:
  - type: emit_event | set_fact | delete_fact | set_timer | cancel_timer | call_service | log | conditional
    # Pole specifická pro typ...

# Volitelné lookupy (externí data)
lookups:
  - name: string              # Unikátní název lookupu
    service: string           # Identifikátor služby
    method: string            # Metoda k volání
    args: any[]               # Argumenty (podporuje reference)
    cache:                    # Volitelné cachování
      ttl: duration
    onError: skip | fail      # Strategie zpracování chyb
```

### Schéma skupiny

```yaml
id: string                    # Povinné - unikátní identifikátor skupiny
name: string                  # Povinné - čitelný název
description: string           # Volitelné - popis skupiny
enabled: boolean              # Volitelné - výchozí: true
```

### Schéma cíle

```yaml
# Faktový cíl
type: fact
key: string                   # Povinné - klíč faktu
value: any                    # Volitelné - očekávaná hodnota
operator: eq | neq | gt | gte | lt | lte | in | not_in | contains | exists | not_exists  # Volitelné

# Událostní cíl
type: event
topic: string                 # Povinné - topic události
```

### Schéma šablony

```yaml
template:
  templateId: string          # Povinné - unikátní identifikátor šablony
  name: string                # Volitelné - čitelný název
  description: string         # Volitelné - popis šablony
  version: string             # Volitelné - verze
  tags: string[]              # Volitelné - tagy pro kategorizaci

  parameters:                 # Povinné - pole definic parametrů
    - name: string            # Povinné - název parametru
      type: string | number | boolean | object | array | any  # Volitelné
      default: any            # Volitelné - výchozí hodnota
      description: string     # Volitelné - popis parametru

  blueprint:                  # Povinné - blueprint pravidla s {{param}} zástupci
    id: string | "{{param}}"  # Povinné - ID pravidla (může používat parametry)
    name: string              # Volitelné
    trigger: ...              # Povinné
    conditions: ...           # Volitelné
    actions: ...              # Povinné
```

---

## Syntaxe referencí

V YAML hodnotách jsou podporovány dvě syntaxe referencí:

### Interpolační zkratka

```yaml
data:
  orderId: ${event.orderId}
  customerName: ${fact.customer:name}
```

### Explicitní objekt

```yaml
data:
  orderId:
    ref: event.orderId
  customerName:
    ref: fact.customer:name
```

Obě jsou normalizovány na `{ ref: "path" }` během validace a vyhodnoceny za běhu pravidla.

---

## Syntaxe doby trvání

Hodnoty doby trvání akceptují buď milisekundy (číslo) nebo čitelné řetězce:

| Formát | Příklad | Ekvivalent |
|--------|---------|------------|
| Milisekundy | `5000` | 5000ms |
| Sekundy | `"5s"` | 5000ms |
| Minuty | `"5m"` | 300000ms |
| Hodiny | `"1h"` | 3600000ms |
| Kombinované | `"1h30m"` | 5400000ms |
| S ms | `"500ms"` | 500ms |

---

## Kompletní příklad

```yaml
# rules/order-processing.yaml

rules:
  - id: large-order-notification
    name: Large Order Notification
    description: Send notification for orders over $100
    priority: 100
    tags: [orders, notifications]
    group: billing

    trigger:
      type: event
      topic: order.created

    conditions:
      - source:
          type: event
          field: amount
        operator: gte
        value: 100
      - source:
          type: event
          field: status
        operator: eq
        value: confirmed

    actions:
      - type: emit_event
        topic: notification.send
        data:
          orderId: ${event.orderId}
          amount: ${event.amount}
          message: "Large order received"

      - type: set_fact
        key: order:${event.orderId}:notified
        value: true

      - type: log
        level: info
        message: "Large order notification sent"

  - id: payment-timeout
    name: Payment Timeout Handler
    trigger:
      type: timer
      name: payment-timeout

    actions:
      - type: emit_event
        topic: payment.timeout
        data:
          orderId: ${timer.data.orderId}
```

```typescript
import { loadRulesFromFile } from '@hamicek/noex-rules';

const rules = await loadRulesFromFile('./rules/order-processing.yaml');

for (const rule of rules) {
  engine.registerRule(rule);
}
```

---

## Viz také

- [DSL Builder](./09-dsl-builder.md) — Typově bezpečné fluent builder API
- [DSL Triggery](./10-dsl-triggers.md) — Buildery triggerů včetně temporálních vzorů
- [DSL Šablony](./15-dsl-templates.md) — Systém šablon pravidel
- [DSL Cíle](./16-dsl-goals.md) — Buildery cílů pro zpětné řetězení
- [Tagged Templates](./13-dsl-tagged-templates.md) — Textové definice pravidel
- [Validace](./17-validation.md) — API pro validaci pravidel
