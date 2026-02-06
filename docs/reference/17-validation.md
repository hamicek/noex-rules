# Validation

Rule input validation with comprehensive error reporting. Validates rules against the expected schema before registration.

## Import

```typescript
import {
  RuleInputValidator,
  RuleValidationError,
  // Types
  ValidatorOptions,
  ValidationIssue,
  ValidationResult,
  // Constants
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
  // Constant types
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

Validates rule inputs against the expected schema. Reports all issues (errors and warnings) rather than throwing on the first problem.

### Constructor

```typescript
new RuleInputValidator(options?: ValidatorOptions)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| options | `ValidatorOptions` | no | Validation options |

**Example:**

```typescript
const validator = new RuleInputValidator();
const strictValidator = new RuleInputValidator({ strict: true });
```

### validate()

```typescript
validate(input: unknown): ValidationResult
```

Validates a single rule input.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input | `unknown` | yes | Rule input to validate |

**Returns:** `ValidationResult` — Validation result with errors and warnings

**Example:**

```typescript
const validator = new RuleInputValidator();

const result = validator.validate({
  id: 'my-rule',
  name: 'My Rule',
  trigger: { type: 'event', topic: 'order.created' },
  actions: [{ type: 'emit_event', topic: 'notification.send' }],
});

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

if (result.warnings.length > 0) {
  console.warn('Validation warnings:', result.warnings);
}
```

### validateMany()

```typescript
validateMany(inputs: unknown): ValidationResult
```

Validates an array of rule inputs, including duplicate ID detection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| inputs | `unknown` | yes | Array of rule inputs to validate |

**Returns:** `ValidationResult` — Combined validation result for all rules

**Example:**

```typescript
const validator = new RuleInputValidator();

const result = validator.validateMany([
  { id: 'rule-1', name: 'Rule 1', trigger: { type: 'event', topic: 'a' } },
  { id: 'rule-2', name: 'Rule 2', trigger: { type: 'event', topic: 'b' } },
  { id: 'rule-1', name: 'Duplicate', trigger: { type: 'event', topic: 'c' } },
]);

// result.errors will include:
// { path: '[2].id', message: 'Duplicate rule ID: rule-1', severity: 'error' }
```

---

## ValidatorOptions

```typescript
interface ValidatorOptions {
  strict?: boolean;
}
```

Options for `RuleInputValidator`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| strict | `boolean` | `false` | When true, reports unused aliases as warnings |

**Example:**

```typescript
// Strict mode warns about unused temporal pattern aliases
const validator = new RuleInputValidator({ strict: true });

const result = validator.validate({
  id: 'rule-with-unused-alias',
  name: 'Test',
  trigger: {
    type: 'temporal',
    pattern: {
      type: 'sequence',
      events: [
        { topic: 'event.a', alias: 'a' },  // alias defined
        { topic: 'event.b', alias: 'b' },  // alias defined but never used
      ],
    },
  },
  conditions: [
    { source: 'event', field: 'a.amount', operator: 'gt', value: 100 },
    // 'b' alias is never referenced
  ],
});

// In strict mode, result.warnings will include:
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

Single validation issue (error or warning).

| Field | Type | Description |
|-------|------|-------------|
| path | `string` | JSON path to the problematic field (e.g., `trigger.topic`, `actions[0].type`) |
| message | `string` | Human-readable error message |
| severity | `'error' \| 'warning'` | Issue severity |

---

## ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
```

Result of a validation run.

| Field | Type | Description |
|-------|------|-------------|
| valid | `boolean` | `true` if no errors (warnings don't affect validity) |
| errors | `ValidationIssue[]` | All validation errors |
| warnings | `ValidationIssue[]` | All validation warnings |

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

Error thrown when rule validation fails. Compatible with REST API error handlers.

| Property | Type | Description |
|----------|------|-------------|
| statusCode | `400` | HTTP status code for API responses |
| code | `'RULE_VALIDATION_ERROR'` | Error code for programmatic handling |
| issues | `ValidationIssue[]` | All validation issues |
| details | `ValidationIssue[]` | Alias for `issues` (API compatibility) |

**Example:**

```typescript
import { RuleValidationError } from '@hamicek/noex-rules';

const validator = new RuleInputValidator();
const result = validator.validate(input);

if (!result.valid) {
  throw new RuleValidationError(
    `Rule validation failed with ${result.errors.length} error(s)`,
    result.errors
  );
}
```

---

## Constants

Shared validation constants used by the validator, CLI, and YAML schema.

### TRIGGER_TYPES

```typescript
const TRIGGER_TYPES = ['event', 'fact', 'timer', 'temporal'] as const;
type TriggerType = 'event' | 'fact' | 'timer' | 'temporal';
```

Valid trigger types for rules.

| Value | Description |
|-------|-------------|
| `'event'` | Trigger on event emission |
| `'fact'` | Trigger on fact change |
| `'timer'` | Trigger on timer expiration |
| `'temporal'` | Trigger on CEP pattern match |

### TEMPORAL_PATTERN_TYPES

```typescript
const TEMPORAL_PATTERN_TYPES = ['sequence', 'absence', 'count', 'aggregate'] as const;
type TemporalPatternType = 'sequence' | 'absence' | 'count' | 'aggregate';
```

Valid temporal (CEP) pattern types.

| Value | Description |
|-------|-------------|
| `'sequence'` | Match ordered sequence of events |
| `'absence'` | Detect missing expected event |
| `'count'` | Count events within window |
| `'aggregate'` | Aggregate values across events |

### CONDITION_OPERATORS

```typescript
const CONDITION_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'exists', 'not_exists',
] as const;
type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
```

Valid operators for condition evaluation.

| Operator | Description | Example |
|----------|-------------|---------|
| `'eq'` | Equal | `status eq 'active'` |
| `'neq'` | Not equal | `status neq 'deleted'` |
| `'gt'` | Greater than | `amount gt 100` |
| `'gte'` | Greater than or equal | `age gte 18` |
| `'lt'` | Less than | `stock lt 10` |
| `'lte'` | Less than or equal | `price lte 50` |
| `'in'` | In array | `status in ['pending', 'active']` |
| `'not_in'` | Not in array | `type not_in ['spam', 'test']` |
| `'contains'` | Array/string contains | `tags contains 'vip'` |
| `'not_contains'` | Does not contain | `roles not_contains 'admin'` |
| `'matches'` | Regex match | `email matches '^.*@corp\\.com$'` |
| `'exists'` | Value exists (not null/undefined) | `metadata.custom exists` |
| `'not_exists'` | Value does not exist | `deletedAt not_exists` |

### CONDITION_SOURCE_TYPES

```typescript
const CONDITION_SOURCE_TYPES = ['event', 'fact', 'context', 'lookup', 'baseline'] as const;
type ConditionSourceType = 'event' | 'fact' | 'context' | 'lookup' | 'baseline';
```

Valid data sources for condition values.

| Value | Description |
|-------|-------------|
| `'event'` | Data from triggering event payload |
| `'fact'` | Data from fact store |
| `'context'` | Data from execution context |
| `'lookup'` | Data from external service lookup |
| `'baseline'` | Data from baseline anomaly detection |

### ACTION_TYPES

```typescript
const ACTION_TYPES = [
  'set_fact', 'delete_fact', 'emit_event',
  'set_timer', 'cancel_timer', 'call_service', 'log',
  'conditional',
] as const;
type ActionType = (typeof ACTION_TYPES)[number];
```

Valid action types.

| Value | Description |
|-------|-------------|
| `'set_fact'` | Set a fact value |
| `'delete_fact'` | Delete a fact |
| `'emit_event'` | Emit an event |
| `'set_timer'` | Schedule a timer |
| `'cancel_timer'` | Cancel a timer |
| `'call_service'` | Call external service |
| `'log'` | Log a message |
| `'conditional'` | Conditional action with if/then/else |

### LOG_LEVELS

```typescript
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

Valid log levels for `log` action.

### AGGREGATE_FUNCTIONS

```typescript
const AGGREGATE_FUNCTIONS = ['sum', 'avg', 'min', 'max', 'count'] as const;
type AggregateFunction = 'sum' | 'avg' | 'min' | 'max' | 'count';
```

Valid aggregate functions for temporal patterns.

| Value | Description |
|-------|-------------|
| `'sum'` | Sum of values |
| `'avg'` | Average of values |
| `'min'` | Minimum value |
| `'max'` | Maximum value |
| `'count'` | Count of events |

### COMPARISONS

```typescript
const COMPARISONS = ['gte', 'lte', 'eq'] as const;
type Comparison = 'gte' | 'lte' | 'eq';
```

Valid comparison operators for aggregate thresholds.

### UNARY_OPERATORS

```typescript
const UNARY_OPERATORS = ['exists', 'not_exists'] as const;
type UnaryOperator = 'exists' | 'not_exists';
```

Operators that don't require a value operand.

---

## Duration Utilities

### DURATION_RE

```typescript
const DURATION_RE: RegExp = /^\d+(ms|s|m|h|d|w|y)$/;
```

Regular expression matching duration strings with units.

**Supported units:**

| Unit | Meaning |
|------|---------|
| `ms` | Milliseconds |
| `s` | Seconds |
| `m` | Minutes |
| `h` | Hours |
| `d` | Days |
| `w` | Weeks |
| `y` | Years |

**Example:**

```typescript
DURATION_RE.test('5m');      // true
DURATION_RE.test('1h30m');   // false (compound not supported by regex alone)
DURATION_RE.test('500ms');   // true
DURATION_RE.test('invalid'); // false
```

### isValidDuration()

```typescript
function isValidDuration(value: string): boolean
```

Checks whether a string is a valid duration (unit-based or pure numeric milliseconds).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `string` | yes | Duration string to validate |

**Returns:** `boolean` — `true` if valid duration format

**Example:**

```typescript
isValidDuration('5m');     // true
isValidDuration('30s');    // true
isValidDuration('1000');   // true (pure ms)
isValidDuration('abc');    // false
isValidDuration('');       // false
```

---

## Validated Rule Structure

The validator checks the following rule structure:

```typescript
interface RuleInput {
  // Required fields
  id: string;           // Non-empty unique identifier
  name: string;         // Non-empty display name
  trigger: Trigger;     // Rule trigger

  // Optional fields
  description?: string;
  priority?: number;    // Integer recommended
  enabled?: boolean;
  tags?: string[];
  group?: string;       // Non-empty if provided
  conditions?: Condition[];
  actions?: Action[];
  lookups?: Lookup[];
}
```

### Required Field Validation

| Field | Validation |
|-------|------------|
| `id` | Must be a non-empty string |
| `name` | Must be a non-empty string |
| `trigger` | Must be present and valid |

### Optional Field Validation

| Field | Validation |
|-------|------------|
| `description` | Must be a string if provided |
| `priority` | Must be a number; warning if not integer |
| `enabled` | Must be a boolean if provided |
| `tags` | Must be array of strings if provided |
| `group` | Must be non-empty string if provided |

---

## Complete Example

```typescript
import {
  RuleInputValidator,
  RuleValidationError,
  TRIGGER_TYPES,
  CONDITION_OPERATORS,
  isValidDuration,
} from '@hamicek/noex-rules';

// Create validator with strict mode
const validator = new RuleInputValidator({ strict: true });

// Validate a single rule
const singleResult = validator.validate({
  id: 'fraud-detection',
  name: 'Fraud Detection Rule',
  description: 'Detects suspicious transaction patterns',
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
  throw new RuleValidationError('Rule validation failed', singleResult.errors);
}

// Validate multiple rules with duplicate detection
const batchResult = validator.validateMany(rulesFromYaml);

console.log(`Validated ${batchResult.valid ? 'successfully' : 'with errors'}`);
console.log(`Errors: ${batchResult.errors.length}`);
console.log(`Warnings: ${batchResult.warnings.length}`);

// Use constants for runtime checks
function isValidTrigger(type: string): type is TriggerType {
  return TRIGGER_TYPES.includes(type as TriggerType);
}

// Validate duration before use
const timeout = '5m';
if (!isValidDuration(timeout)) {
  throw new Error(`Invalid duration: ${timeout}`);
}
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Uses validator internally on `registerRule()`
- [YAML Loader](./14-dsl-yaml.md) — Validates rules loaded from YAML
- [REST API](./25-rest-api.md) — Uses validator for POST/PUT /rules endpoints
- [Errors](./32-errors.md) — All error classes including `RuleValidationError`
