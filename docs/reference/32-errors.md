# Errors

Error classes and API error response format for the noex-rules library.

## Import

```typescript
// Main package
import { RuleValidationError } from '@hamicek/noex-rules';

// DSL module
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

## Error Hierarchy

All DSL-related errors inherit from `DslError`, enabling unified error handling:

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

**Example:**

```typescript
import { DslError } from '@hamicek/noex-rules/dsl';

try {
  const rule = Rule.create('').build();
} catch (err) {
  if (err instanceof DslError) {
    // Catches any DSL-related error
    console.error('DSL error:', err.message);
  }
}
```

---

## Validation Errors

### RuleValidationError

Thrown when rule validation fails via `RuleInputValidator`.

```typescript
class RuleValidationError extends Error {
  readonly statusCode: 400;
  readonly code: 'RULE_VALIDATION_ERROR';
  readonly issues: ValidationIssue[];
  readonly details: ValidationIssue[];  // alias for issues

  constructor(message: string, issues: ValidationIssue[]);
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| statusCode | `400` | HTTP status code for API compatibility |
| code | `'RULE_VALIDATION_ERROR'` | Error code for programmatic handling |
| issues | `ValidationIssue[]` | Array of validation issues |
| details | `ValidationIssue[]` | Alias for `issues` (API compatibility) |

**Example:**

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
    console.error('Validation failed:', err.message);
    for (const issue of err.issues) {
      console.error(`  - ${issue.path}: ${issue.message}`);
    }
  }
}
```

---

## DSL Errors

### DslError

Base class for all DSL-related errors.

```typescript
class DslError extends Error {
  constructor(message: string);
}
```

Use `instanceof DslError` to catch any error from the DSL module (builder, YAML, templates, parser).

---

### DslValidationError

Thrown when a DSL builder receives invalid input.

```typescript
class DslValidationError extends DslError {
  constructor(message: string);
}
```

**Common causes:**

- Empty string passed to required parameter
- Missing builder state at `build()` time
- Out-of-range numeric values
- Invalid configuration

**Example:**

```typescript
import { Rule, DslValidationError } from '@hamicek/noex-rules/dsl';

try {
  Rule.create('')  // Empty ID
    .when(onEvent('order.created'))
    .then(emit('notification.send'))
    .build();
} catch (err) {
  if (err instanceof DslValidationError) {
    console.error('Invalid input:', err.message);
    // "Rule ID must be a non-empty string"
  }
}
```

---

### ParseError

Thrown when the tagged template parser encounters a syntax error.

```typescript
class ParseError extends DslError {
  readonly line: number;
  readonly source: string;

  constructor(message: string, line: number, source: string);
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| line | `number` | Line number where error occurred (1-based) |
| source | `string` | The offending source line |

**Example:**

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
    console.error(`Line ${err.line}: ${err.message}`);
    console.error(`  Source: ${err.source}`);
  }
}
```

---

### YamlLoadError

Thrown on YAML file read errors or YAML syntax errors.

```typescript
class YamlLoadError extends DslError {
  readonly filePath?: string;

  constructor(message: string, filePath?: string);
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| filePath | `string \| undefined` | Path to the file (if loading from file) |

**Common causes:**

- File not found or unreadable
- YAML syntax error
- Empty YAML content
- Invalid top-level structure

**Example:**

```typescript
import { loadRulesFromFile, YamlLoadError } from '@hamicek/noex-rules/dsl';

try {
  await loadRulesFromFile('./rules/orders.yaml');
} catch (err) {
  if (err instanceof YamlLoadError) {
    console.error('Failed to load rules:', err.message);
    if (err.filePath) {
      console.error('File:', err.filePath);
    }
  }
}
```

---

### YamlValidationError

Thrown when YAML content fails structural validation.

```typescript
class YamlValidationError extends DslError {
  readonly path: string;

  constructor(message: string, path: string);
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| path | `string` | Dot-notation path to the invalid field |

**Example:**

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

Thrown when template parameter validation fails.

```typescript
class TemplateValidationError extends DslError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]);
}
```

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| issues | `readonly string[]` | Array of validation issue descriptions |

**Common causes:**

- Missing required parameters
- Type mismatches (e.g., string instead of number)
- Custom validator failures
- Unknown parameters (strict mode)

**Example:**

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
    console.error('Validation failed:');
    for (const issue of err.issues) {
      console.error(`  - ${issue}`);
    }
  }
}
```

---

### TemplateInstantiationError

Thrown when template instantiation fails for reasons other than parameter validation.

```typescript
class TemplateInstantiationError extends DslError {
  constructor(message: string);
}
```

**Common causes:**

- Parameter marker references undeclared parameter
- Substituted blueprint produces invalid rule data

**Example:**

```typescript
import { TemplateInstantiationError } from '@hamicek/noex-rules/dsl';

try {
  template.instantiate({ topic: 'metrics.cpu' });
} catch (err) {
  if (err instanceof TemplateInstantiationError) {
    console.error('Instantiation failed:', err.message);
  }
}
```

---

## REST API Error Format

The REST API returns errors in a consistent JSON format.

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

| Field | Type | Description |
|-------|------|-------------|
| statusCode | `number` | HTTP status code |
| error | `string` | HTTP status name (e.g., "Bad Request") |
| message | `string` | Human-readable error description |
| code | `string` | Machine-readable error code (optional) |
| details | `unknown` | Additional error details (optional) |

**Example response:**

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

## Error Codes

### Validation Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `RULE_VALIDATION_ERROR` | 400 | Rule structure validation failed |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_JSON` | 400 | Malformed JSON in request body |

### Resource Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `NOT_FOUND` | 404 | Requested resource not found |
| `CONFLICT` | 409 | Resource already exists or conflict |
| `BAD_REQUEST` | 400 | Invalid request parameters |

### System Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Error Handling Patterns

### Unified DSL Error Handling

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
  // Any DSL operation
} catch (err) {
  if (err instanceof TemplateValidationError) {
    // Handle template parameter errors
    console.error('Template params:', err.issues);
  } else if (err instanceof YamlValidationError) {
    // Handle YAML structure errors
    console.error(`Field ${err.path}:`, err.message);
  } else if (err instanceof ParseError) {
    // Handle tagged template syntax errors
    console.error(`Line ${err.line}:`, err.message);
  } else if (err instanceof DslError) {
    // Handle any other DSL error
    console.error('DSL error:', err.message);
  }
}
```

### API Error Handling

```typescript
const response = await fetch('/api/rules', {
  method: 'POST',
  body: JSON.stringify(rule),
});

if (!response.ok) {
  const error = await response.json();

  switch (error.code) {
    case 'VALIDATION_ERROR':
      console.error('Validation failed:', error.details);
      break;
    case 'CONFLICT':
      console.error('Rule already exists');
      break;
    case 'NOT_FOUND':
      console.error('Resource not found');
      break;
    default:
      console.error('API error:', error.message);
  }
}
```

---

## See Also

- [Validation](./17-validation.md) — Rule validation with `RuleInputValidator`
- [DSL Builder](./09-dsl-builder.md) — Fluent builder API
- [DSL YAML](./14-dsl-yaml.md) — YAML loader
- [DSL Templates](./15-dsl-templates.md) — Rule templates
- [DSL Tagged Templates](./13-dsl-tagged-templates.md) — Tagged template syntax
- [REST API](./25-rest-api.md) — REST API endpoints
