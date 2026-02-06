# DSL Rule Templates

Define parameterized rule blueprints that can be instantiated with different values to produce concrete rules.

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

Entry point for creating a new template via the fluent builder API.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| templateId | `string` | yes | Unique template identifier |

**Returns:** `TemplateBuilder` — A fresh builder instance for defining the template

**Throws:**

- `DslValidationError` — If `templateId` is empty or not a string

**Example:**

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

Fluent builder for assembling parameterized rule templates. Mirrors the `RuleBuilder` API for defining rule structure while adding template-specific methods for declaring parameters.

### Template Metadata Methods

#### templateName()

```typescript
templateName(value: string): this
```

Sets a human-readable name for the template itself.

#### templateDescription()

```typescript
templateDescription(value: string): this
```

Sets a description for the template.

#### templateVersion()

```typescript
templateVersion(value: string): this
```

Sets a semantic version string for the template (e.g. `"1.0.0"`).

#### templateTags()

```typescript
templateTags(...values: string[]): this
```

Appends one or more tags for categorizing/filtering templates.

---

### param()

```typescript
param(name: string, options?: TemplateParamOptions): this
```

Declares a template parameter.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Unique parameter name |
| options | `TemplateParamOptions` | no | Type, default, validator, and description |

**Throws:**

- `DslValidationError` — If `name` is empty or already declared

**Example:**

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

### Rule Blueprint Methods

#### ruleId()

```typescript
ruleId(value: string | ((params: TemplateParams) => string)): this
```

Sets the rule ID pattern — a static string or a function that computes the ID from instantiation parameters.

**Example:**

```typescript
// Static ID
.ruleId('fixed-rule-id')

// Dynamic ID based on parameters
.ruleId(p => `alert-${p.topic}-${p.severity}`)
```

#### name()

```typescript
name(value: string | ((params: TemplateParams) => string)): this
```

Sets the rule name — a static string or a function that computes the name from parameters.

#### description()

```typescript
description(value: string): this
```

Sets an optional description for instantiated rules.

#### priority()

```typescript
priority(value: number): this
```

Sets the evaluation priority for instantiated rules.

**Throws:**

- `DslValidationError` — If `value` is not a finite number

#### enabled()

```typescript
enabled(value: boolean): this
```

Enables or disables instantiated rules.

#### tags()

```typescript
tags(...values: string[]): this
```

Appends one or more tags to instantiated rules.

#### when()

```typescript
when(trigger: TriggerBuilder | RuleTrigger): this
```

Sets the trigger for instantiated rules. Accepts a `TriggerBuilder` (which is `.build()`-ed immediately) or a raw trigger object containing `param()` markers.

**Example:**

```typescript
// Using raw object with param markers
.when({ type: 'event', topic: param('topic') })

// Using trigger builder (no param markers possible)
.when(onEvent('orders.created'))
```

#### if()

```typescript
if(condition: ConditionBuilder | RuleCondition): this
```

Adds a condition for instantiated rules. Accepts a `ConditionBuilder` or a raw condition object with `param()` markers.

#### and()

```typescript
and(condition: ConditionBuilder | RuleCondition): this
```

Alias for `if()` — adds another condition (logical AND).

#### then()

```typescript
then(action: ActionBuilder | RuleAction): this
```

Adds an action for instantiated rules. Accepts an `ActionBuilder` or a raw action object with `param()` markers.

#### also()

```typescript
also(action: ActionBuilder | RuleAction): this
```

Alias for `then()` — adds another action.

---

### build()

```typescript
build(): RuleTemplate
```

Validates the accumulated state and produces a compiled `RuleTemplate`.

**Build-time Checks:**

- Trigger is required
- At least one action is required
- All `param()` markers in the blueprint must reference declared parameters

**Returns:** `RuleTemplate` — A compiled, immutable template

**Throws:**

- `DslValidationError` — If any build-time check fails

---

## RuleTemplate

A compiled, immutable rule template that can be instantiated with parameter values to produce concrete `RuleInput` objects.

### definition

```typescript
readonly definition: RuleTemplateDefinition
```

The complete, immutable template definition containing metadata, parameters, and the rule blueprint.

### instantiate()

```typescript
instantiate(params: TemplateParams, options?: TemplateInstantiateOptions): RuleInput
```

Instantiates the template with the given parameters, producing a concrete `RuleInput` ready for engine registration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| params | `TemplateParams` | yes | Parameter name–value pairs |
| options | `TemplateInstantiateOptions` | no | Instantiation behaviour overrides |

**Returns:** `RuleInput` — A fully resolved rule input object

**Throws:**

- `TemplateValidationError` — If parameter validation fails
- `TemplateInstantiationError` — If a param marker references a missing parameter or the resolved rule ID is invalid

**Example:**

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

// Instantiate with required parameter, using default for threshold
const rule1 = template.instantiate({ topic: 'metrics.cpu' });
// rule1.id === 'alert-metrics.cpu'
// threshold === 100 (default)

// Instantiate with custom threshold
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

Creates a compile-time parameter marker for use in template blueprints. The marker is replaced with the actual parameter value during instantiation.

**Type Parameters:**

| Name | Description |
|------|-------------|
| T | Expected type of the parameter value (compile-time only) |

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| paramName | `string` | yes | Name of the declared template parameter |

**Returns:** `T` — A `TemplateParamMarker` cast to `T` for type-safe embedding

**Example:**

```typescript
// In template blueprints:
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

Type guard that checks whether a value is a `TemplateParamMarker`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| value | `unknown` | yes | The value to test |

**Returns:** `boolean` — `true` if `value` is a `TemplateParamMarker`

**Example:**

```typescript
const marker = param('topic');
isTemplateParam(marker); // true

isTemplateParam({ ref: 'event.topic' }); // false (this is a Ref)
isTemplateParam('topic'); // false
```

---

## Types

### TemplateParamOptions

```typescript
interface TemplateParamOptions {
  type?: TemplateParamType;
  default?: unknown;
  validate?: (value: unknown) => string | undefined;
  description?: string;
}
```

Options for declaring a template parameter via `TemplateBuilder.param()`.

| Field | Type | Description |
|-------|------|-------------|
| type | `TemplateParamType` | Expected value type (default: `'any'`) |
| default | `unknown` | Default value — makes the parameter optional |
| validate | `(value: unknown) => string \| undefined` | Custom validator returning error message on failure |
| description | `string` | Human-readable description (documentation only) |

### TemplateParamType

```typescript
type TemplateParamType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
```

Supported primitive types for template parameters. Used for runtime type checking:

| Type | Validation |
|------|------------|
| `string` | `typeof value === 'string'` |
| `number` | `typeof value === 'number'` |
| `boolean` | `typeof value === 'boolean'` |
| `object` | Non-null, non-array object |
| `array` | `Array.isArray(value)` |
| `any` | Skips type checking |

### TemplateParams

```typescript
type TemplateParams = Record<string, unknown>;
```

Record of parameter name–value pairs passed to `RuleTemplate.instantiate()`.

### TemplateInstantiateOptions

```typescript
interface TemplateInstantiateOptions {
  skipValidation?: boolean;
}
```

Options controlling template instantiation behaviour.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| skipValidation | `boolean` | `false` | Skip parameter validation (required checks, type checks, custom validators) |

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

Definition of a single template parameter.

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Unique parameter name |
| type | `TemplateParamType` | Expected value type |
| default | `unknown` | Default value (makes parameter optional) |
| validate | `function` | Custom validation function |
| description | `string` | Human-readable description |

### TemplateParamMarker

```typescript
interface TemplateParamMarker {
  readonly __templateParam: true;
  readonly paramName: string;
}
```

Compile-time marker embedded in template blueprints as a placeholder for a declared parameter.

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

Complete, immutable template definition.

| Field | Type | Description |
|-------|------|-------------|
| templateId | `string` | Unique template identifier |
| templateName | `string` | Human-readable template name |
| templateDescription | `string` | Template description |
| templateVersion | `string` | Semantic version (e.g. `"1.0.0"`) |
| templateTags | `string[]` | Tags for categorization |
| parameters | `TemplateParameterDef[]` | Declared parameters |
| blueprint | `TemplateBlueprintData` | Rule blueprint with param markers |

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

Internal rule blueprint accumulated by the template builder. May contain `TemplateParamMarker` placeholders and function-based computed fields.

---

## Errors

### TemplateValidationError

```typescript
class TemplateValidationError extends DslError {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]);
}
```

Thrown when template parameter validation fails. Collects all validation issues into a single error.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| message | `string` | Summary error message |
| issues | `readonly string[]` | Individual validation issue descriptions |
| name | `string` | Always `'TemplateValidationError'` |

**Common Issues:**

| Issue | Cause |
|-------|-------|
| `Missing required parameter "..."` | Required parameter not provided |
| `Parameter "...": expected ..., got ...` | Type mismatch |
| `Parameter "...": [custom message]` | Custom validator failed |
| `Unknown parameter "..."` | Parameter not declared in template |

**Example:**

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

Thrown when template instantiation fails for reasons other than parameter validation.

**Common Causes:**

- Param marker references an undeclared parameter
- Resolved rule ID is empty or not a string

**Example:**

```typescript
try {
  template.instantiate({ topic: '' }); // Results in empty rule ID
} catch (err) {
  if (err instanceof TemplateInstantiationError) {
    console.error('Instantiation failed:', err.message);
  }
}
```

---

## Complete Example

```typescript
import { RuleTemplate, param, RuleEngine } from '@hamicek/noex-rules';

// Define a reusable alert template
const alertTemplate = RuleTemplate.create('threshold-alert')
  .templateName('Threshold Alert')
  .templateDescription('Fires when a metric exceeds a threshold')
  .templateVersion('1.0.0')
  .templateTags('monitoring', 'alerts')

  // Declare parameters
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

  // Define rule blueprint with param markers
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

// Create multiple rules from the template
const engine = await RuleEngine.start();

const cpuAlert = alertTemplate.instantiate({
  topic: 'metrics.cpu',
  threshold: 90,
  severity: 'critical',
});

const memoryAlert = alertTemplate.instantiate({
  topic: 'metrics.memory',
  threshold: 80,
  // field defaults to 'value'
  // severity defaults to 'warning'
});

engine.registerRule(cpuAlert);
engine.registerRule(memoryAlert);

// cpuAlert.id === 'alert-metrics.cpu-critical'
// memoryAlert.id === 'alert-metrics.memory-warning'
```

---

## See Also

- [DSL Builder](./09-dsl-builder.md) — Type-safe fluent builder API for single rules
- [DSL Triggers](./10-dsl-triggers.md) — Trigger builders
- [DSL Conditions](./11-dsl-conditions.md) — Condition builders
- [DSL Actions](./12-dsl-actions.md) — Action builders
- [DSL YAML Loader](./14-dsl-yaml.md) — Load templates from YAML files
- [Validation](./17-validation.md) — Rule validation API
