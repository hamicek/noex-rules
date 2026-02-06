# DSL Rule Templates

Definice parametrizovaných šablon pravidel, které lze instancovat s různými hodnotami a vytvořit tak konkrétní pravidla.

## Import

```typescript
import {
  RuleTemplate,
  param,
  isTemplateParam,
  TemplateValidationError,
  TemplateInstantiationError,
} from '@hamicek/noex-rules';
```

---

## RuleTemplate.create()

```typescript
static create(templateId: string): TemplateBuilder
```

Vstupní bod pro vytvoření nové šablony pomocí fluent builder API.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| templateId | `string` | ano | Jedinečný identifikátor šablony |

**Návratová hodnota:** `TemplateBuilder` — nová instance builderu pro definici šablony

**Vyhazuje:**

- `DslValidationError` — pokud je `templateId` prázdný nebo není string

**Příklad:**

```typescript
const template = RuleTemplate.create('threshold-alert')
  .param('topic', { type: 'string' })
  .param('threshold', { type: 'number', default: 100 })
  .ruleId(p => `alert-${p.topic}`)
  .when({ type: 'event', topic: param('topic') })
  .then({ type: 'emit_event', topic: 'alert.triggered' })
  .build();
```

---

## TemplateBuilder

Fluent builder pro sestavení parametrizovaných šablon pravidel. Zrcadlí API `RuleBuilder` pro definici struktury pravidla a přidává metody specifické pro šablony k deklaraci parametrů.

### Metody pro metadata šablony

#### templateName()

```typescript
templateName(value: string): this
```

Nastaví lidsky čitelný název samotné šablony.

#### templateDescription()

```typescript
templateDescription(value: string): this
```

Nastaví popis šablony.

#### templateVersion()

```typescript
templateVersion(value: string): this
```

Nastaví sémantickou verzi šablony (např. `"1.0.0"`).

#### templateTags()

```typescript
templateTags(...values: string[]): this
```

Přidá jeden nebo více tagů pro kategorizaci/filtrování šablon.

---

### param()

```typescript
param(name: string, options?: TemplateParamOptions): this
```

Deklaruje parametr šablony.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Unikátní název parametru |
| options | `TemplateParamOptions` | ne | Typ, výchozí hodnota, validátor a popis |

**Vyhazuje:**

- `DslValidationError` — pokud je `name` prázdný nebo již deklarovaný

**Příklad:**

```typescript
RuleTemplate.create('my-template')
  .param('topic', { type: 'string', description: 'Event topic to monitor' })
  .param('threshold', { type: 'number', default: 100 })
  .param('severity', {
    type: 'string',
    default: 'warning',
    validate: v => ['info', 'warning', 'critical'].includes(v as string)
      ? undefined
      : 'Must be info, warning, or critical',
  })
  // ...
```

---

### Metody pro blueprint pravidla

#### ruleId()

```typescript
ruleId(value: string | ((params: TemplateParams) => string)): this
```

Nastaví vzor ID pravidla — statický string nebo funkce, která vypočítá ID z parametrů instancace.

**Příklad:**

```typescript
// Statické ID
.ruleId('fixed-rule-id')

// Dynamické ID na základě parametrů
.ruleId(p => `alert-${p.topic}-${p.severity}`)
```

#### name()

```typescript
name(value: string | ((params: TemplateParams) => string)): this
```

Nastaví název pravidla — statický string nebo funkce, která vypočítá název z parametrů.

#### description()

```typescript
description(value: string): this
```

Nastaví volitelný popis pro instancovaná pravidla.

#### priority()

```typescript
priority(value: number): this
```

Nastaví prioritu vyhodnocení pro instancovaná pravidla.

**Vyhazuje:**

- `DslValidationError` — pokud `value` není konečné číslo

#### enabled()

```typescript
enabled(value: boolean): this
```

Povolí nebo zakáže instancovaná pravidla.

#### tags()

```typescript
tags(...values: string[]): this
```

Přidá jeden nebo více tagů k instancovaným pravidlům.

#### when()

```typescript
when(trigger: TriggerBuilder | RuleTrigger): this
```

Nastaví trigger pro instancovaná pravidla. Přijímá `TriggerBuilder` (který je okamžitě `.build()`-nut) nebo raw trigger objekt obsahující `param()` markery.

**Příklad:**

```typescript
// Použití raw objektu s param markery
.when({ type: 'event', topic: param('topic') })

// Použití trigger builderu (param markery nejsou možné)
.when(onEvent('orders.created'))
```

#### if()

```typescript
if(condition: ConditionBuilder | RuleCondition): this
```

Přidá podmínku pro instancovaná pravidla. Přijímá `ConditionBuilder` nebo raw condition objekt s `param()` markery.

#### and()

```typescript
and(condition: ConditionBuilder | RuleCondition): this
```

Alias pro `if()` — přidá další podmínku (logické AND).

#### then()

```typescript
then(action: ActionBuilder | RuleAction): this
```

Přidá akci pro instancovaná pravidla. Přijímá `ActionBuilder` nebo raw action objekt s `param()` markery.

#### also()

```typescript
also(action: ActionBuilder | RuleAction): this
```

Alias pro `then()` — přidá další akci.

---

### build()

```typescript
build(): RuleTemplate
```

Validuje nashromážděný stav a vytvoří zkompilovanou `RuleTemplate`.

**Kontroly při buildu:**

- Trigger je povinný
- Alespoň jedna akce je povinná
- Všechny `param()` markery v blueprintu musí odkazovat na deklarované parametry

**Návratová hodnota:** `RuleTemplate` — zkompilovaná, neměnná šablona

**Vyhazuje:**

- `DslValidationError` — pokud kterákoliv kontrola selže

---

## RuleTemplate

Zkompilovaná, neměnná šablona pravidla, kterou lze instancovat s hodnotami parametrů a vytvořit tak konkrétní `RuleInput` objekty.

### definition

```typescript
readonly definition: RuleTemplateDefinition
```

Kompletní, neměnná definice šablony obsahující metadata, parametry a blueprint pravidla.

### instantiate()

```typescript
instantiate(params: TemplateParams, options?: TemplateInstantiateOptions): RuleInput
```

Instancuje šablonu se zadanými parametry a vytvoří konkrétní `RuleInput` připravený k registraci v enginu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| params | `TemplateParams` | ano | Páry název–hodnota parametrů |
| options | `TemplateInstantiateOptions` | ne | Přepisy chování instancace |

**Návratová hodnota:** `RuleInput` — plně rozřešený rule input objekt

**Vyhazuje:**

- `TemplateValidationError` — pokud validace parametrů selže
- `TemplateInstantiationError` — pokud param marker odkazuje na chybějící parametr nebo rozřešené rule ID je neplatné

**Příklad:**

```typescript
const template = RuleTemplate.create('threshold-alert')
  .param('topic', { type: 'string' })
  .param('threshold', { type: 'number', default: 100 })
  .ruleId(p => `alert-${p.topic}`)
  .name(p => `Alert on ${p.topic}`)
  .when({ type: 'event', topic: param('topic') })
  .if({
    source: { type: 'event', field: 'value' },
    operator: 'gte',
    value: param('threshold'),
  })
  .then({ type: 'emit_event', topic: 'alerts', data: { source: param('topic') } })
  .build();

// Instancace s povinným parametrem, použije výchozí hodnotu pro threshold
const rule1 = template.instantiate({ topic: 'metrics.cpu' });
// rule1.id === 'alert-metrics.cpu'
// threshold === 100 (výchozí)

// Instancace s vlastním thresholdem
const rule2 = template.instantiate({ topic: 'metrics.memory', threshold: 80 });
// threshold === 80

engine.registerRule(rule1);
engine.registerRule(rule2);
```

---

## param()

```typescript
function param<T = unknown>(paramName: string): T
```

Vytvoří compile-time parameter marker pro použití v blueprintech šablon. Marker je nahrazen skutečnou hodnotou parametru během instancace.

**Typové parametry:**

| Název | Popis |
|-------|-------|
| T | Očekávaný typ hodnoty parametru (pouze compile-time) |

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| paramName | `string` | ano | Název deklarovaného parametru šablony |

**Návratová hodnota:** `T` — `TemplateParamMarker` přetypovaný na `T` pro typově bezpečné vložení

**Příklad:**

```typescript
// V blueprintech šablon:
.when({ type: 'event', topic: param('topic') })
.if({
  source: { type: 'event', field: param('field') },
  operator: 'gte',
  value: param('threshold'),
})
.then({
  type: 'emit_event',
  topic: 'alerts',
  data: { source: param('topic'), level: param('severity') },
})
```

---

## isTemplateParam()

```typescript
function isTemplateParam(value: unknown): value is TemplateParamMarker
```

Type guard, který kontroluje, zda je hodnota `TemplateParamMarker`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `unknown` | ano | Hodnota k otestování |

**Návratová hodnota:** `boolean` — `true` pokud je `value` `TemplateParamMarker`

**Příklad:**

```typescript
const marker = param('topic');
isTemplateParam(marker); // true

isTemplateParam({ ref: 'event.topic' }); // false (toto je Ref)
isTemplateParam('topic'); // false
```

---

## Typy

### TemplateParamOptions

```typescript
interface TemplateParamOptions {
  type?: TemplateParamType;
  default?: unknown;
  validate?: (value: unknown) => string | undefined;
  description?: string;
}
```

Možnosti pro deklaraci parametru šablony pomocí `TemplateBuilder.param()`.

| Pole | Typ | Popis |
|------|-----|-------|
| type | `TemplateParamType` | Očekávaný typ hodnoty (výchozí: `'any'`) |
| default | `unknown` | Výchozí hodnota — činí parametr volitelným |
| validate | `(value: unknown) => string \| undefined` | Vlastní validátor vracející chybovou zprávu při selhání |
| description | `string` | Lidsky čitelný popis (pouze pro dokumentaci) |

### TemplateParamType

```typescript
type TemplateParamType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
```

Podporované primitivní typy pro parametry šablon. Používá se pro runtime typovou kontrolu:

| Typ | Validace |
|-----|----------|
| `string` | `typeof value === 'string'` |
| `number` | `typeof value === 'number'` |
| `boolean` | `typeof value === 'boolean'` |
| `object` | Ne-null, ne-array objekt |
| `array` | `Array.isArray(value)` |
| `any` | Přeskočí typovou kontrolu |

### TemplateParams

```typescript
type TemplateParams = Record<string, unknown>;
```

Záznam párů název–hodnota parametrů předávaných do `RuleTemplate.instantiate()`.

### TemplateInstantiateOptions

```typescript
interface TemplateInstantiateOptions {
  skipValidation?: boolean;
}
```

Možnosti řídící chování instancace šablony.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| skipValidation | `boolean` | `false` | Přeskočit validaci parametrů (kontroly povinnosti, typů, vlastní validátory) |

### TemplateParameterDef

```typescript
interface TemplateParameterDef {
  name: string;
  type?: TemplateParamType;
  default?: unknown;
  validate?: (value: unknown) => string | undefined;
  description?: string;
}
```

Definice jednoho parametru šablony.

| Pole | Typ | Popis |
|------|-----|-------|
| name | `string` | Unikátní název parametru |
| type | `TemplateParamType` | Očekávaný typ hodnoty |
| default | `unknown` | Výchozí hodnota (činí parametr volitelným) |
| validate | `function` | Vlastní validační funkce |
| description | `string` | Lidsky čitelný popis |

### TemplateParamMarker

```typescript
interface TemplateParamMarker {
  readonly __templateParam: true;
  readonly paramName: string;
}
```

Compile-time marker vložený do blueprintů šablon jako placeholder pro deklarovaný parametr.

### RuleTemplateDefinition

```typescript
interface RuleTemplateDefinition {
  templateId: string;
  templateName?: string;
  templateDescription?: string;
  templateVersion?: string;
  templateTags?: string[];
  parameters: TemplateParameterDef[];
  blueprint: TemplateBlueprintData;
}
```

Kompletní, neměnná definice šablony.

| Pole | Typ | Popis |
|------|-----|-------|
| templateId | `string` | Unikátní identifikátor šablony |
| templateName | `string` | Lidsky čitelný název šablony |
| templateDescription | `string` | Popis šablony |
| templateVersion | `string` | Sémantická verze (např. `"1.0.0"`) |
| templateTags | `string[]` | Tagy pro kategorizaci |
| parameters | `TemplateParameterDef[]` | Deklarované parametry |
| blueprint | `TemplateBlueprintData` | Blueprint pravidla s param markery |

### TemplateBlueprintData

```typescript
interface TemplateBlueprintData {
  id: string | ((params: TemplateParams) => string);
  name?: string | ((params: TemplateParams) => string);
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags: string[];
  trigger?: unknown;
  conditions: unknown[];
  actions: unknown[];
}
```

Interní blueprint pravidla nashromážděný template builderem. Může obsahovat `TemplateParamMarker` placeholdery a funkce pro vypočítaná pole.

---

## Chyby

### TemplateValidationError

```typescript
class TemplateValidationError extends DslError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]);
}
```

Vyhozena, když validace parametrů šablony selže. Sbírá všechny validační problémy do jedné chyby.

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| message | `string` | Souhrnná chybová zpráva |
| issues | `readonly string[]` | Jednotlivé popisy validačních problémů |
| name | `string` | Vždy `'TemplateValidationError'` |

**Běžné problémy:**

| Problém | Příčina |
|---------|---------|
| `Missing required parameter "..."` | Povinný parametr nebyl poskytnut |
| `Parameter "...": expected ..., got ...` | Nesoulad typů |
| `Parameter "...": [custom message]` | Vlastní validátor selhal |
| `Unknown parameter "..."` | Parametr není deklarován v šabloně |

**Příklad:**

```typescript
try {
  template.instantiate({ threshold: 'not-a-number' });
} catch (err) {
  if (err instanceof TemplateValidationError) {
    console.error('Validation failed:');
    for (const issue of err.issues) {
      console.error(`  - ${issue}`);
    }
  }
}
```

### TemplateInstantiationError

```typescript
class TemplateInstantiationError extends DslError {
  constructor(message: string);
}
```

Vyhozena, když instancace šablony selže z jiných důvodů než validace parametrů.

**Běžné příčiny:**

- Param marker odkazuje na nedeklarovaný parametr
- Rozřešené rule ID je prázdné nebo není string

**Příklad:**

```typescript
try {
  template.instantiate({ topic: '' }); // Výsledkem je prázdné rule ID
} catch (err) {
  if (err instanceof TemplateInstantiationError) {
    console.error('Instantiation failed:', err.message);
  }
}
```

---

## Kompletní příklad

```typescript
import { RuleTemplate, param, RuleEngine } from '@hamicek/noex-rules';

// Definice znovupoužitelné alert šablony
const alertTemplate = RuleTemplate.create('threshold-alert')
  .templateName('Threshold Alert')
  .templateDescription('Fires when a metric exceeds a threshold')
  .templateVersion('1.0.0')
  .templateTags('monitoring', 'alerts')

  // Deklarace parametrů
  .param('topic', {
    type: 'string',
    description: 'Event topic to monitor',
  })
  .param('field', {
    type: 'string',
    default: 'value',
    description: 'Event field containing the metric value',
  })
  .param('threshold', {
    type: 'number',
    description: 'Alert threshold',
  })
  .param('severity', {
    type: 'string',
    default: 'warning',
    validate: v =>
      ['info', 'warning', 'critical'].includes(v as string)
        ? undefined
        : 'Must be info, warning, or critical',
  })

  // Definice blueprintu pravidla s param markery
  .ruleId(p => `alert-${p.topic}-${p.severity}`)
  .name(p => `${p.severity} alert on ${p.topic}`)
  .priority(100)
  .tags('auto-generated')

  .when({ type: 'event', topic: param('topic') })
  .if({
    source: { type: 'event', field: param('field') },
    operator: 'gte',
    value: param('threshold'),
  })
  .then({
    type: 'emit_event',
    topic: 'alerts.triggered',
    data: {
      source: param('topic'),
      severity: param('severity'),
      threshold: param('threshold'),
    },
  })
  .also({ type: 'log', level: 'info', message: 'Alert triggered' })

  .build();

// Vytvoření více pravidel ze šablony
const engine = await RuleEngine.start();

const cpuAlert = alertTemplate.instantiate({
  topic: 'metrics.cpu',
  threshold: 90,
  severity: 'critical',
});

const memoryAlert = alertTemplate.instantiate({
  topic: 'metrics.memory',
  threshold: 80,
  // field má výchozí hodnotu 'value'
  // severity má výchozí hodnotu 'warning'
});

engine.registerRule(cpuAlert);
engine.registerRule(memoryAlert);

// cpuAlert.id === 'alert-metrics.cpu-critical'
// memoryAlert.id === 'alert-metrics.memory-warning'
```

---

## Viz také

- [DSL Builder](./09-dsl-builder.md) — Typově bezpečné fluent builder API pro jednotlivá pravidla
- [DSL Triggers](./10-dsl-triggers.md) — Trigger buildery
- [DSL Conditions](./11-dsl-conditions.md) — Condition buildery
- [DSL Actions](./12-dsl-actions.md) — Action buildery
- [DSL YAML Loader](./14-dsl-yaml.md) — Načítání šablon z YAML souborů
- [Validation](./17-validation.md) — API pro validaci pravidel
