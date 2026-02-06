# Validace

Validace vstupů pravidel s podrobným reportováním chyb. Validuje pravidla proti očekávanému schématu před registrací.

## Import

```typescript
import {
  RuleInputValidator,
  RuleValidationError,
  // Typy
  ValidatorOptions,
  ValidationIssue,
  ValidationResult,
  // Konstanty
  TRIGGER_TYPES,
  TEMPORAL_PATTERN_TYPES,
  CONDITION_OPERATORS,
  CONDITION_SOURCE_TYPES,
  ACTION_TYPES,
  LOG_LEVELS,
  AGGREGATE_FUNCTIONS,
  COMPARISONS,
  UNARY_OPERATORS,
  DURATION_RE,
  isValidDuration,
  // Typy konstant
  TriggerType,
  TemporalPatternType,
  ConditionOperator,
  ConditionSourceType,
  ActionType,
  LogLevel,
  AggregateFunction,
  Comparison,
  UnaryOperator,
} from '@hamicek/noex-rules';
```

---

## RuleInputValidator

Validuje vstupy pravidel proti očekávanému schématu. Reportuje všechny problémy (chyby a varování) místo vyhození výjimky při prvním problému.

### Konstruktor

```typescript
new RuleInputValidator(options?: ValidatorOptions)
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| options | `ValidatorOptions` | ne | Možnosti validace |

**Příklad:**

```typescript
const validator = new RuleInputValidator();
const strictValidator = new RuleInputValidator({ strict: true });
```

### validate()

```typescript
validate(input: unknown): ValidationResult
```

Validuje jeden vstup pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| input | `unknown` | ano | Vstup pravidla k validaci |

**Návratová hodnota:** `ValidationResult` — výsledek validace s chybami a varováními

**Příklad:**

```typescript
const validator = new RuleInputValidator();

const result = validator.validate({
  id: 'my-rule',
  name: 'My Rule',
  trigger: { type: 'event', topic: 'order.created' },
  actions: [{ type: 'emit_event', topic: 'notification.send' }],
});

if (!result.valid) {
  console.error('Chyby validace:', result.errors);
}

if (result.warnings.length > 0) {
  console.warn('Varování validace:', result.warnings);
}
```

### validateMany()

```typescript
validateMany(inputs: unknown): ValidationResult
```

Validuje pole vstupů pravidel včetně detekce duplicitních ID.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| inputs | `unknown` | ano | Pole vstupů pravidel k validaci |

**Návratová hodnota:** `ValidationResult` — kombinovaný výsledek validace pro všechna pravidla

**Příklad:**

```typescript
const validator = new RuleInputValidator();

const result = validator.validateMany([
  { id: 'rule-1', name: 'Rule 1', trigger: { type: 'event', topic: 'a' } },
  { id: 'rule-2', name: 'Rule 2', trigger: { type: 'event', topic: 'b' } },
  { id: 'rule-1', name: 'Duplicate', trigger: { type: 'event', topic: 'c' } },
]);

// result.errors bude obsahovat:
// { path: '[2].id', message: 'Duplicate rule ID: rule-1', severity: 'error' }
```

---

## ValidatorOptions

```typescript
interface ValidatorOptions {
  strict?: boolean;
}
```

Možnosti pro `RuleInputValidator`.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| strict | `boolean` | `false` | Pokud true, reportuje nepoužité aliasy jako varování |

**Příklad:**

```typescript
// Striktní režim varuje před nepoužitými aliasy temporálních vzorů
const validator = new RuleInputValidator({ strict: true });

const result = validator.validate({
  id: 'rule-with-unused-alias',
  name: 'Test',
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'sequence',
      events: [
        { topic: 'event.a', alias: 'a' },  // alias definován
        { topic: 'event.b', alias: 'b' },  // alias definován, ale nikdy nepoužit
      ],
    },
  },
  conditions: [
    { source: 'event', field: 'a.amount', operator: 'gt', value: 100 },
    // alias 'b' nikdy není referencován
  ],
});

// Ve striktním režimu result.warnings bude obsahovat:
// { path: 'trigger', message: 'Alias "b" is defined but never used', severity: 'warning' }
```

---

## ValidationIssue

```typescript
interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
```

Jeden validační problém (chyba nebo varování).

| Pole | Typ | Popis |
|------|-----|-------|
| path | `string` | JSON cesta k problematickému poli (např. `trigger.topic`, `actions[0].type`) |
| message | `string` | Lidsky čitelná chybová zpráva |
| severity | `'error' \| 'warning'` | Závažnost problému |

---

## ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
```

Výsledek validačního běhu.

| Pole | Typ | Popis |
|------|-----|-------|
| valid | `boolean` | `true` pokud nejsou žádné chyby (varování neovlivňují validitu) |
| errors | `ValidationIssue[]` | Všechny validační chyby |
| warnings | `ValidationIssue[]` | Všechna validační varování |

---

## RuleValidationError

```typescript
class RuleValidationError extends Error {
  readonly statusCode: 400;
  readonly code: 'RULE_VALIDATION_ERROR';
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]);

  get details(): ValidationIssue[];
}
```

Chyba vyhozená při selhání validace pravidla. Kompatibilní s REST API error handlery.

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| statusCode | `400` | HTTP status kód pro API odpovědi |
| code | `'RULE_VALIDATION_ERROR'` | Kód chyby pro programatické zpracování |
| issues | `ValidationIssue[]` | Všechny validační problémy |
| details | `ValidationIssue[]` | Alias pro `issues` (API kompatibilita) |

**Příklad:**

```typescript
import { RuleValidationError } from '@hamicek/noex-rules';

const validator = new RuleInputValidator();
const result = validator.validate(input);

if (!result.valid) {
  throw new RuleValidationError(
    `Validace pravidla selhala s ${result.errors.length} chybou(ami)`,
    result.errors
  );
}
```

---

## Konstanty

Sdílené validační konstanty používané validátorem, CLI a YAML schématem.

### TRIGGER_TYPES

```typescript
const TRIGGER_TYPES = ['event', 'fact', 'timer', 'temporal'] as const;
type TriggerType = 'event' | 'fact' | 'timer' | 'temporal';
```

Platné typy triggerů pro pravidla.

| Hodnota | Popis |
|---------|-------|
| `'event'` | Trigger při emisi události |
| `'fact'` | Trigger při změně faktu |
| `'timer'` | Trigger při vypršení časovače |
| `'temporal'` | Trigger při shodě CEP vzoru |

### TEMPORAL_PATTERN_TYPES

```typescript
const TEMPORAL_PATTERN_TYPES = ['sequence', 'absence', 'count', 'aggregate'] as const;
type TemporalPatternType = 'sequence' | 'absence' | 'count' | 'aggregate';
```

Platné typy temporálních (CEP) vzorů.

| Hodnota | Popis |
|---------|-------|
| `'sequence'` | Shoda uspořádané sekvence událostí |
| `'absence'` | Detekce chybějící očekávané události |
| `'count'` | Počítání událostí v časovém okně |
| `'aggregate'` | Agregace hodnot napříč událostmi |

### CONDITION_OPERATORS

```typescript
const CONDITION_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists',
] as const;
type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
```

Platné operátory pro vyhodnocení podmínek.

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `'eq'` | Rovná se | `status eq 'active'` |
| `'neq'` | Nerovná se | `status neq 'deleted'` |
| `'gt'` | Větší než | `amount gt 100` |
| `'gte'` | Větší nebo rovno | `age gte 18` |
| `'lt'` | Menší než | `stock lt 10` |
| `'lte'` | Menší nebo rovno | `price lte 50` |
| `'in'` | V poli | `status in ['pending', 'active']` |
| `'not_in'` | Není v poli | `type not_in ['spam', 'test']` |
| `'contains'` | Pole/string obsahuje | `tags contains 'vip'` |
| `'not_contains'` | Neobsahuje | `roles not_contains 'admin'` |
| `'matches'` | Regex shoda | `email matches '^.*@corp\\.com$'` |
| `'exists'` | Hodnota existuje (není null/undefined) | `metadata.custom exists` |
| `'not_exists'` | Hodnota neexistuje | `deletedAt not_exists` |

### CONDITION_SOURCE_TYPES

```typescript
const CONDITION_SOURCE_TYPES = ['event', 'fact', 'context', 'lookup', 'baseline'] as const;
type ConditionSourceType = 'event' | 'fact' | 'context' | 'lookup' | 'baseline';
```

Platné zdroje dat pro hodnoty podmínek.

| Hodnota | Popis |
|---------|-------|
| `'event'` | Data z payloadu spouštěcí události |
| `'fact'` | Data z fact store |
| `'context'` | Data z kontextu vykonávání |
| `'lookup'` | Data z externího service lookup |
| `'baseline'` | Data z baseline detekce anomálií |

### ACTION_TYPES

```typescript
const ACTION_TYPES = [
  'set_fact', 'delete_fact', 'emit_event',
  'set_timer', 'cancel_timer', 'call_service', 'log',
  'conditional',
] as const;
type ActionType = (typeof ACTION_TYPES)[number];
```

Platné typy akcí.

| Hodnota | Popis |
|---------|-------|
| `'set_fact'` | Nastavení hodnoty faktu |
| `'delete_fact'` | Smazání faktu |
| `'emit_event'` | Emitování události |
| `'set_timer'` | Naplánování časovače |
| `'cancel_timer'` | Zrušení časovače |
| `'call_service'` | Volání externí služby |
| `'log'` | Zalogování zprávy |
| `'conditional'` | Podmíněná akce s if/then/else |

### LOG_LEVELS

```typescript
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

Platné úrovně logování pro akci `log`.

### AGGREGATE_FUNCTIONS

```typescript
const AGGREGATE_FUNCTIONS = ['sum', 'avg', 'min', 'max', 'count'] as const;
type AggregateFunction = 'sum' | 'avg' | 'min' | 'max' | 'count';
```

Platné agregační funkce pro temporální vzory.

| Hodnota | Popis |
|---------|-------|
| `'sum'` | Součet hodnot |
| `'avg'` | Průměr hodnot |
| `'min'` | Minimální hodnota |
| `'max'` | Maximální hodnota |
| `'count'` | Počet událostí |

### COMPARISONS

```typescript
const COMPARISONS = ['gte', 'lte', 'eq'] as const;
type Comparison = 'gte' | 'lte' | 'eq';
```

Platné porovnávací operátory pro agregační prahy.

### UNARY_OPERATORS

```typescript
const UNARY_OPERATORS = ['exists', 'not_exists'] as const;
type UnaryOperator = 'exists' | 'not_exists';
```

Operátory, které nevyžadují hodnotový operand.

---

## Utility pro doby trvání

### DURATION_RE

```typescript
const DURATION_RE: RegExp = /^\d+(ms|s|m|h|d|w|y)$/;
```

Regulární výraz pro shodu řetězců dob trvání s jednotkami.

**Podporované jednotky:**

| Jednotka | Význam |
|----------|--------|
| `ms` | Milisekundy |
| `s` | Sekundy |
| `m` | Minuty |
| `h` | Hodiny |
| `d` | Dny |
| `w` | Týdny |
| `y` | Roky |

**Příklad:**

```typescript
DURATION_RE.test('5m');      // true
DURATION_RE.test('1h30m');   // false (složené není podporováno samotným regexem)
DURATION_RE.test('500ms');   // true
DURATION_RE.test('invalid'); // false
```

### isValidDuration()

```typescript
function isValidDuration(value: string): boolean
```

Kontroluje, zda je řetězec platná doba trvání (s jednotkou nebo čisté milisekundy).

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `string` | ano | Řetězec doby trvání k validaci |

**Návratová hodnota:** `boolean` — `true` pokud je platný formát doby trvání

**Příklad:**

```typescript
isValidDuration('5m');     // true
isValidDuration('30s');    // true
isValidDuration('1000');   // true (čisté ms)
isValidDuration('abc');    // false
isValidDuration('');       // false
```

---

## Validovaná struktura pravidla

Validátor kontroluje následující strukturu pravidla:

```typescript
interface RuleInput {
  // Povinná pole
  id: string;           // Neprázdný unikátní identifikátor
  name: string;         // Neprázdný zobrazovaný název
  trigger: Trigger;     // Trigger pravidla

  // Volitelná pole
  description?: string;
  priority?: number;    // Doporučen integer
  enabled?: boolean;
  tags?: string[];
  group?: string;       // Neprázdný pokud je uveden
  conditions?: Condition[];
  actions?: Action[];
  lookups?: Lookup[];
}
```

### Validace povinných polí

| Pole | Validace |
|------|----------|
| `id` | Musí být neprázdný string |
| `name` | Musí být neprázdný string |
| `trigger` | Musí být přítomný a platný |

### Validace volitelných polí

| Pole | Validace |
|------|----------|
| `description` | Musí být string pokud je uveden |
| `priority` | Musí být číslo; varování pokud není integer |
| `enabled` | Musí být boolean pokud je uveden |
| `tags` | Musí být pole stringů pokud je uveden |
| `group` | Musí být neprázdný string pokud je uveden |

---

## Kompletní příklad

```typescript
import {
  RuleInputValidator,
  RuleValidationError,
  TRIGGER_TYPES,
  CONDITION_OPERATORS,
  isValidDuration,
} from '@hamicek/noex-rules';

// Vytvoření validátoru se striktním režimem
const validator = new RuleInputValidator({ strict: true });

// Validace jednoho pravidla
const singleResult = validator.validate({
  id: 'fraud-detection',
  name: 'Fraud Detection Rule',
  description: 'Detekuje podezřelé transakční vzory',
  priority: 100,
  tags: ['security', 'fraud'],
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'count',
      event: { topic: 'transaction.completed' },
      threshold: { comparison: 'gte', value: 5 },
      window: '1h',
    },
  },
  conditions: [
    { source: 'fact', field: 'user:*:riskScore', operator: 'gte', value: 70 },
  ],
  actions: [
    { type: 'emit_event', topic: 'alert.fraud', payload: { severity: 'high' } },
    { type: 'set_fact', key: 'user:${event.userId}:blocked', value: true },
  ],
});

if (!singleResult.valid) {
  throw new RuleValidationError('Validace pravidla selhala', singleResult.errors);
}

// Validace více pravidel s detekcí duplicit
const batchResult = validator.validateMany(rulesFromYaml);

console.log(`Validace ${batchResult.valid ? 'úspěšná' : 's chybami'}`);
console.log(`Chyby: ${batchResult.errors.length}`);
console.log(`Varování: ${batchResult.warnings.length}`);

// Použití konstant pro runtime kontroly
function isValidTrigger(type: string): type is TriggerType {
  return TRIGGER_TYPES.includes(type as TriggerType);
}

// Validace doby trvání před použitím
const timeout = '5m';
if (!isValidDuration(timeout)) {
  throw new Error(`Neplatná doba trvání: ${timeout}`);
}
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Používá validátor interně při `registerRule()`
- [YAML Loader](./14-dsl-yaml.md) — Validuje pravidla načtená z YAML
- [REST API](./25-rest-api.md) — Používá validátor pro POST/PUT /rules endpointy
- [Errors](./32-errors.md) — Všechny error třídy včetně `RuleValidationError`
