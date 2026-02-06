# Chyby

Chybové třídy a formát API error response pro knihovnu noex-rules.

## Import

```typescript
// Hlavní balíček
import { RuleValidationError } from '@hamicek/noex-rules';

// DSL modul
import {
  DslError,
  DslValidationError,
  ParseError,
  YamlLoadError,
  YamlValidationError,
  TemplateValidationError,
  TemplateInstantiationError,
} from '@hamicek/noex-rules/dsl';
```

---

## Hierarchie chyb

Všechny DSL-related chyby dědí z `DslError`, což umožňuje jednotné zpracování:

```
Error
├── RuleValidationError          (validation)
└── DslError                     (dsl)
    ├── DslValidationError
    ├── ParseError
    ├── YamlLoadError
    ├── YamlValidationError
    ├── TemplateValidationError
    └── TemplateInstantiationError
```

**Příklad:**

```typescript
import { DslError } from '@hamicek/noex-rules/dsl';

try {
  const rule = Rule.create('').build();
} catch (err) {
  if (err instanceof DslError) {
    // Zachytí jakoukoli DSL-related chybu
    console.error('DSL chyba:', err.message);
  }
}
```

---

## Validační chyby

### RuleValidationError

Vyhazována při selhání validace pravidla přes `RuleInputValidator`.

```typescript
class RuleValidationError extends Error {
  readonly statusCode: 400;
  readonly code: 'RULE_VALIDATION_ERROR';
  readonly issues: ValidationIssue[];
  readonly details: ValidationIssue[];  // alias pro issues

  constructor(message: string, issues: ValidationIssue[]);
}
```

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| statusCode | `400` | HTTP status kód pro API kompatibilitu |
| code | `'RULE_VALIDATION_ERROR'` | Kód chyby pro programové zpracování |
| issues | `ValidationIssue[]` | Pole validačních problémů |
| details | `ValidationIssue[]` | Alias pro `issues` (API kompatibilita) |

**Příklad:**

```typescript
import { RuleInputValidator, RuleValidationError } from '@hamicek/noex-rules';

const validator = new RuleInputValidator();

try {
  validator.validate({
    id: '',
    trigger: { type: 'invalid' },
    actions: []
  });
} catch (err) {
  if (err instanceof RuleValidationError) {
    console.error('Validace selhala:', err.message);
    for (const issue of err.issues) {
      console.error(`  - ${issue.path}: ${issue.message}`);
    }
  }
}
```

---

## DSL chyby

### DslError

Základní třída pro všechny DSL-related chyby.

```typescript
class DslError extends Error {
  constructor(message: string);
}
```

Použijte `instanceof DslError` pro zachycení jakékoli chyby z DSL modulu (builder, YAML, templates, parser).

---

### DslValidationError

Vyhazována když DSL builder obdrží neplatný vstup.

```typescript
class DslValidationError extends DslError {
  constructor(message: string);
}
```

**Časté příčiny:**

- Prázdný string předaný povinnému parametru
- Chybějící stav builderu při volání `build()`
- Hodnoty mimo platný rozsah
- Neplatná konfigurace

**Příklad:**

```typescript
import { Rule, DslValidationError } from '@hamicek/noex-rules/dsl';

try {
  Rule.create('')  // Prázdné ID
    .when(onEvent('order.created'))
    .then(emit('notification.send'))
    .build();
} catch (err) {
  if (err instanceof DslValidationError) {
    console.error('Neplatný vstup:', err.message);
    // "Rule ID must be a non-empty string"
  }
}
```

---

### ParseError

Vyhazována když parser tagged template narazí na syntaktickou chybu.

```typescript
class ParseError extends DslError {
  readonly line: number;
  readonly source: string;

  constructor(message: string, line: number, source: string);
}
```

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| line | `number` | Číslo řádku kde nastala chyba (od 1) |
| source | `string` | Problematický zdrojový řádek |

**Příklad:**

```typescript
import { parseRuleTemplate, ParseError } from '@hamicek/noex-rules/dsl';

try {
  parseRuleTemplate(`
    id: my-rule
    WHEN invalid-trigger
    THEN emit notification.send
  `);
} catch (err) {
  if (err instanceof ParseError) {
    console.error(`Řádek ${err.line}: ${err.message}`);
    console.error(`  Zdroj: ${err.source}`);
  }
}
```

---

### YamlLoadError

Vyhazována při chybě čtení YAML souboru nebo syntaktické chybě YAML.

```typescript
class YamlLoadError extends DslError {
  readonly filePath?: string;

  constructor(message: string, filePath?: string);
}
```

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| filePath | `string \| undefined` | Cesta k souboru (pokud se načítá ze souboru) |

**Časté příčiny:**

- Soubor nenalezen nebo nečitelný
- Syntaktická chyba YAML
- Prázdný obsah YAML
- Neplatná top-level struktura

**Příklad:**

```typescript
import { loadRulesFromFile, YamlLoadError } from '@hamicek/noex-rules/dsl';

try {
  await loadRulesFromFile('./rules/orders.yaml');
} catch (err) {
  if (err instanceof YamlLoadError) {
    console.error('Nepodařilo se načíst pravidla:', err.message);
    if (err.filePath) {
      console.error('Soubor:', err.filePath);
    }
  }
}
```

---

### YamlValidationError

Vyhazována když YAML obsah selže při strukturální validaci.

```typescript
class YamlValidationError extends DslError {
  readonly path: string;

  constructor(message: string, path: string);
}
```

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| path | `string` | Cesta k neplatnému poli v tečkové notaci |

**Příklad:**

```typescript
import { loadRulesFromYAML, YamlValidationError } from '@hamicek/noex-rules/dsl';

try {
  loadRulesFromYAML(`
    id: my-rule
    trigger:
      type: invalid-type
    actions: []
  `);
} catch (err) {
  if (err instanceof YamlValidationError) {
    console.error(`${err.path}: ${err.message}`);
    // "rule.trigger.type: invalid trigger type "invalid-type""
  }
}
```

---

### TemplateValidationError

Vyhazována při selhání validace parametrů šablony.

```typescript
class TemplateValidationError extends DslError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]);
}
```

**Vlastnosti:**

| Vlastnost | Typ | Popis |
|-----------|-----|-------|
| issues | `readonly string[]` | Pole popisů validačních problémů |

**Časté příčiny:**

- Chybějící povinné parametry
- Nesprávný typ (např. string místo number)
- Selhání custom validátoru
- Neznámé parametry (strict mód)

**Příklad:**

```typescript
import { RuleTemplate, TemplateValidationError, param } from '@hamicek/noex-rules/dsl';

const template = RuleTemplate.create('threshold-alert')
  .param('threshold', 'number', { required: true })
  .when(onEvent(param('topic')))
  .if(event('value').gte(param('threshold')))
  .then(emit('alert.triggered'))
  .build();

try {
  template.instantiate({ threshold: 'not-a-number' });
} catch (err) {
  if (err instanceof TemplateValidationError) {
    console.error('Validace selhala:');
    for (const issue of err.issues) {
      console.error(`  - ${issue}`);
    }
  }
}
```

---

### TemplateInstantiationError

Vyhazována když instanciace šablony selže z jiných důvodů než validace parametrů.

```typescript
class TemplateInstantiationError extends DslError {
  constructor(message: string);
}
```

**Časté příčiny:**

- Marker parametru odkazuje na nedeklarovaný parametr
- Nahrazený blueprint produkuje neplatná data pravidla

**Příklad:**

```typescript
import { TemplateInstantiationError } from '@hamicek/noex-rules/dsl';

try {
  template.instantiate({ topic: 'metrics.cpu' });
} catch (err) {
  if (err instanceof TemplateInstantiationError) {
    console.error('Instanciace selhala:', err.message);
  }
}
```

---

## Formát REST API chyb

REST API vrací chyby v konzistentním JSON formátu.

### ApiError

```typescript
interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| statusCode | `number` | HTTP status kód |
| error | `string` | Název HTTP statusu (např. "Bad Request") |
| message | `string` | Lidsky čitelný popis chyby |
| code | `string` | Strojově čitelný kód chyby (volitelný) |
| details | `unknown` | Dodatečné detaily chyby (volitelné) |

**Příklad odpovědi:**

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Missing required field: trigger.topic",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "trigger.topic",
      "message": "must be a non-empty string",
      "keyword": "required"
    }
  ]
}
```

---

## Kódy chyb

### Validační kódy chyb

| Kód | HTTP | Popis |
|-----|------|-------|
| `RULE_VALIDATION_ERROR` | 400 | Validace struktury pravidla selhala |
| `VALIDATION_ERROR` | 400 | Validace požadavku selhala |
| `INVALID_JSON` | 400 | Špatně formátovaný JSON v těle požadavku |

### Kódy chyb prostředků

| Kód | HTTP | Popis |
|-----|------|-------|
| `NOT_FOUND` | 404 | Požadovaný prostředek nenalezen |
| `CONFLICT` | 409 | Prostředek již existuje nebo konflikt |
| `BAD_REQUEST` | 400 | Neplatné parametry požadavku |

### Systémové kódy chyb

| Kód | HTTP | Popis |
|-----|------|-------|
| `SERVICE_UNAVAILABLE` | 503 | Služba dočasně nedostupná |

---

## Vzory zpracování chyb

### Jednotné zpracování DSL chyb

```typescript
import {
  DslError,
  DslValidationError,
  ParseError,
  YamlLoadError,
  YamlValidationError,
  TemplateValidationError,
} from '@hamicek/noex-rules/dsl';

try {
  // Jakákoli DSL operace
} catch (err) {
  if (err instanceof TemplateValidationError) {
    // Zpracování chyb parametrů šablony
    console.error('Parametry šablony:', err.issues);
  } else if (err instanceof YamlValidationError) {
    // Zpracování chyb struktury YAML
    console.error(`Pole ${err.path}:`, err.message);
  } else if (err instanceof ParseError) {
    // Zpracování syntaktických chyb tagged template
    console.error(`Řádek ${err.line}:`, err.message);
  } else if (err instanceof DslError) {
    // Zpracování jakékoli jiné DSL chyby
    console.error('DSL chyba:', err.message);
  }
}
```

### Zpracování API chyb

```typescript
const response = await fetch('/api/rules', {
  method: 'POST',
  body: JSON.stringify(rule),
});

if (!response.ok) {
  const error = await response.json();

  switch (error.code) {
    case 'VALIDATION_ERROR':
      console.error('Validace selhala:', error.details);
      break;
    case 'CONFLICT':
      console.error('Pravidlo již existuje');
      break;
    case 'NOT_FOUND':
      console.error('Prostředek nenalezen');
      break;
    default:
      console.error('API chyba:', error.message);
  }
}
```

---

## Viz také

- [Validace](./17-validation.md) — Validace pravidel s `RuleInputValidator`
- [DSL Builder](./09-dsl-builder.md) — Fluent builder API
- [DSL YAML](./14-dsl-yaml.md) — YAML loader
- [DSL Šablony](./15-dsl-templates.md) — Šablony pravidel
- [DSL Tagged Templates](./13-dsl-tagged-templates.md) — Tagged template syntaxe
- [REST API](./25-rest-api.md) — REST API endpointy
