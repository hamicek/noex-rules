# DSL YAML Loader

Load rule definitions, groups, goals, and templates from YAML files or strings.

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

Parses a YAML string and returns an array of validated rule definitions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| yamlContent | `string` | yes | Raw YAML string |

**Returns:** `RuleInput[]` — Array of validated rule input objects

**Throws:**

- `YamlLoadError` — On YAML syntax errors or empty content
- `YamlValidationError` — On rule structure validation errors

**Accepted Input Formats:**

| Format | Description |
|--------|-------------|
| Single object | A single rule definition → `[RuleInput]` |
| Array | YAML array of rules → `RuleInput[]` |
| Object with `rules` key | `{ rules: [...] }` → `RuleInput[]` |

**Example:**

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

Reads a YAML file from disk and returns validated rule definitions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | `string` | yes | Path to the YAML file |

**Returns:** `Promise<RuleInput[]>` — Array of validated rule input objects

**Throws:**

- `YamlLoadError` — On file read errors, YAML syntax errors, or empty files
- `YamlValidationError` — On rule structure validation errors

**Example:**

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

Parses a YAML string and returns an array of validated group definitions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| yamlContent | `string` | yes | Raw YAML string |

**Returns:** `RuleGroupInput[]` — Array of validated group input objects

**Throws:**

- `YamlLoadError` — On YAML syntax errors or empty content
- `YamlValidationError` — On group structure validation errors

**Accepted Input Formats:**

| Format | Description |
|--------|-------------|
| Single object | A single group definition → `[RuleGroupInput]` |
| Array | YAML array of groups → `RuleGroupInput[]` |
| Object with `groups` key | `{ groups: [...] }` → `RuleGroupInput[]` |

**Example:**

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

Reads a YAML file from disk and returns validated group definitions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | `string` | yes | Path to the YAML file |

**Returns:** `Promise<RuleGroupInput[]>` — Array of validated group input objects

**Throws:**

- `YamlLoadError` — On file read errors, YAML syntax errors, or empty files
- `YamlValidationError` — On group structure validation errors

**Example:**

```typescript
const groups = await loadGroupsFromFile('./config/groups.yaml');
```

---

## loadGoalsFromYAML()

```typescript
function loadGoalsFromYAML(yamlContent: string): Goal[]
```

Parses a YAML string and returns an array of validated goal definitions for backward chaining queries.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| yamlContent | `string` | yes | Raw YAML string |

**Returns:** `Goal[]` — Array of validated goal objects

**Throws:**

- `YamlLoadError` — On YAML syntax errors or empty content
- `YamlValidationError` — On goal structure validation errors

**Accepted Input Formats:**

| Format | Description |
|--------|-------------|
| Single object | A single goal definition → `[Goal]` |
| Array | YAML array of goals → `Goal[]` |
| Object with `queries` key | `{ queries: [...] }` → `Goal[]` |

**Example:**

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

Reads a YAML file from disk and returns validated goal definitions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | `string` | yes | Path to the YAML file |

**Returns:** `Promise<Goal[]>` — Array of validated goal objects

**Throws:**

- `YamlLoadError` — On file read errors, YAML syntax errors, or empty files
- `YamlValidationError` — On goal structure validation errors

**Example:**

```typescript
const goals = await loadGoalsFromFile('./queries/customer-tier.yaml');
```

---

## loadTemplateFromYAML()

```typescript
function loadTemplateFromYAML(yamlContent: string): RuleTemplate
```

Parses a YAML string containing a template definition and returns a compiled `RuleTemplate`.

Template parameter placeholders use `{{paramName}}` syntax. Runtime references (`${path}` or `{ ref: path }`) are preserved for rule evaluation.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| yamlContent | `string` | yes | Raw YAML string |

**Returns:** `RuleTemplate` — A compiled template ready for instantiation

**Throws:**

- `YamlLoadError` — On YAML syntax errors, missing/invalid fields, or undeclared template parameters in the blueprint

**Expected YAML Structure:**

```yaml
template:
  templateId: my-template      # required
  name: My Template            # optional
  description: ...             # optional
  version: "1.0.0"             # optional
  tags: [alert, monitoring]    # optional
  parameters:                  # required
    - name: topic
      type: string
    - name: threshold
      type: number
      default: 100
  blueprint:                   # required
    id: "rule-{{topic}}"
    trigger:
      type: event
      topic: "{{topic}}"
    actions:
      - type: emit_event
        topic: alert.triggered
```

**Example:**

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

Reads a YAML file from disk and returns a compiled `RuleTemplate`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filePath | `string` | yes | Path to the YAML file |

**Returns:** `Promise<RuleTemplate>` — A compiled template ready for instantiation

**Throws:**

- `YamlLoadError` — On file read errors, YAML syntax errors, or template validation errors

**Example:**

```typescript
const template = await loadTemplateFromFile('./templates/threshold-alert.yaml');
const rule = template.instantiate({ topic: 'metrics.memory', threshold: 80 });
```

---

## isTemplateYAML()

```typescript
function isTemplateYAML(parsed: unknown): boolean
```

Checks whether a parsed YAML value represents a template definition (has a `template` top-level key). Useful for distinguishing template YAML from plain rule YAML before choosing which loader to invoke.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| parsed | `unknown` | yes | The value returned by `yaml.parse()` |

**Returns:** `boolean` — `true` if `parsed` is a non-array object with a `template` key

**Example:**

```typescript
import { parse } from 'yaml';

const content = await fs.readFile('rules.yaml', 'utf-8');
const parsed = parse(content);

if (isTemplateYAML(parsed)) {
  const template = loadTemplateFromYAML(content);
  // Use template...
} else {
  const rules = loadRulesFromYAML(content);
  // Use rules...
}
```

---

## validateRule()

```typescript
function validateRule(obj: unknown, path?: string): RuleInput
```

Validates a raw object (typically from a YAML parser) and returns a type-safe `RuleInput`. This is the internal validation function used by `loadRulesFromYAML`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| obj | `unknown` | yes | The raw parsed object |
| path | `string` | no | Dot-notated path prefix for error messages (default: `"rule"`) |

**Returns:** `RuleInput` — A validated rule input object

**Throws:**

- `YamlValidationError` — On any validation error (message includes the field path)

**Default Values Applied:**

| Field | Default |
|-------|---------|
| name | Same as `id` |
| priority | `0` |
| enabled | `true` |
| tags | `[]` |
| conditions | `[]` |

**Example:**

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

Validates a raw object and returns a type-safe backward chaining `Goal`.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| obj | `unknown` | yes | The raw parsed object |
| path | `string` | no | Dot-notated path prefix for error messages (default: `"goal"`) |

**Returns:** `Goal` — A validated goal object (`FactGoal` or `EventGoal`)

**Throws:**

- `YamlValidationError` — On any validation error

**Example:**

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

Thrown on file read errors, YAML syntax errors, or empty content.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| message | `string` | Full error message (includes file path if available) |
| filePath | `string \| undefined` | Path to the file that caused the error |
| name | `string` | Always `'YamlLoadError'` |

**Error Handling:**

```typescript
import { loadRulesFromFile, YamlLoadError } from '@hamicek/noex-rules';

try {
  const rules = await loadRulesFromFile('./rules.yaml');
} catch (err) {
  if (err instanceof YamlLoadError) {
    console.error(`Failed to load ${err.filePath}: ${err.message}`);
  }
}
```

**Common Errors:**

| Error | Cause |
|-------|-------|
| `Failed to read file: ...` | File doesn't exist or is not readable |
| `YAML syntax error: ...` | Invalid YAML syntax |
| `YAML content is empty` | File is empty or contains only whitespace |
| `YAML array is empty, expected at least one rule` | Array contains no rules |
| `"rules" must be an array` | `rules` key is not an array |

---

## YamlValidationError

```typescript
class YamlValidationError extends DslError {
  readonly path: string;

  constructor(message: string, path: string);
}
```

Thrown on rule structure validation errors. Includes the dot-notated path to the invalid field for easy debugging.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| message | `string` | Full error message including field path |
| path | `string` | Dot-notated path to the invalid field |
| name | `string` | Always `'YamlValidationError'` |

**Error Handling:**

```typescript
import { loadRulesFromYAML, YamlValidationError } from '@hamicek/noex-rules';

try {
  const rules = loadRulesFromYAML(yamlContent);
} catch (err) {
  if (err instanceof YamlValidationError) {
    console.error(`Validation error at ${err.path}: ${err.message}`);
  }
}
```

**Common Errors:**

| Error | Path Example | Cause |
|-------|--------------|-------|
| `missing required field "id"` | `rule` | Rule has no `id` |
| `must be a non-empty string` | `rule.id` | Empty or non-string `id` |
| `invalid trigger type "..."` | `rule.trigger.type` | Unknown trigger type |
| `invalid operator "..."` | `rule.conditions[0].operator` | Unknown condition operator |
| `must have at least one action` | `rule.actions` | Empty actions array |
| `invalid action type "..."` | `rule.actions[0].type` | Unknown action type |

---

## YAML Schema

### Rule Schema

```yaml
# Required
id: string                    # Unique rule identifier

# Optional metadata
name: string                  # Human-readable name (defaults to id)
description: string           # Rule description
priority: number              # Execution priority (default: 0)
enabled: boolean              # Whether rule is active (default: true)
tags: string[]                # Tags for categorization
group: string                 # Group identifier

# Required trigger
trigger:
  type: event | fact | timer | temporal
  # For event trigger:
  topic: string               # Event topic
  # For fact trigger:
  pattern: string             # Fact pattern (supports wildcards)
  # For timer trigger:
  name: string                # Timer name
  # For temporal trigger:
  pattern:                    # Temporal pattern (see below)

# Optional conditions (all must be true)
conditions:
  - source:
      type: event | fact | context | lookup | baseline
      # Type-specific fields...
    operator: eq | neq | gt | gte | lt | lte | in | not_in | contains | not_contains | matches | exists | not_exists | between | starts_with | ends_with
    value: any                # Not required for exists/not_exists

# Required actions (at least one)
actions:
  - type: emit_event | set_fact | delete_fact | set_timer | cancel_timer | call_service | log | conditional
    # Type-specific fields...

# Optional lookups (external data)
lookups:
  - name: string              # Unique lookup name
    service: string           # Service identifier
    method: string            # Method to call
    args: any[]               # Arguments (supports references)
    cache:                    # Optional caching
      ttl: duration
    onError: skip | fail      # Error handling strategy
```

### Group Schema

```yaml
id: string                    # Required - unique group identifier
name: string                  # Required - human-readable name
description: string           # Optional - group description
enabled: boolean              # Optional - default: true
```

### Goal Schema

```yaml
# Fact goal
type: fact
key: string                   # Required - fact key
value: any                    # Optional - expected value
operator: eq | neq | gt | gte | lt | lte | in | not_in | contains | exists | not_exists  # Optional

# Event goal
type: event
topic: string                 # Required - event topic
```

### Template Schema

```yaml
template:
  templateId: string          # Required - unique template identifier
  name: string                # Optional - human-readable name
  description: string         # Optional - template description
  version: string             # Optional - version string
  tags: string[]              # Optional - tags for categorization

  parameters:                 # Required - array of parameter definitions
    - name: string            # Required - parameter name
      type: string | number | boolean | object | array | any  # Optional
      default: any            # Optional - default value
      description: string     # Optional - parameter description

  blueprint:                  # Required - rule blueprint with {{param}} placeholders
    id: string | "{{param}}"  # Required - rule ID (can use params)
    name: string              # Optional
    trigger: ...              # Required
    conditions: ...           # Optional
    actions: ...              # Required
```

---

## Reference Syntax

Two reference syntaxes are supported in YAML values:

### Interpolation Shorthand

```yaml
data:
  orderId: ${event.orderId}
  customerName: ${fact.customer:name}
```

### Explicit Object

```yaml
data:
  orderId:
    ref: event.orderId
  customerName:
    ref: fact.customer:name
```

Both are normalized to `{ ref: "path" }` during validation and resolved at rule execution time.

---

## Duration Syntax

Duration values accept either milliseconds (number) or human-readable strings:

| Format | Example | Equivalent |
|--------|---------|------------|
| Milliseconds | `5000` | 5000ms |
| Seconds | `"5s"` | 5000ms |
| Minutes | `"5m"` | 300000ms |
| Hours | `"1h"` | 3600000ms |
| Combined | `"1h30m"` | 5400000ms |
| With ms | `"500ms"` | 500ms |

---

## Complete Example

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

## See Also

- [DSL Builder](./09-dsl-builder.md) — Type-safe fluent builder API
- [DSL Triggers](./10-dsl-triggers.md) — Trigger builders including temporal patterns
- [DSL Templates](./15-dsl-templates.md) — Rule template system
- [DSL Goals](./16-dsl-goals.md) — Goal builders for backward chaining
- [Tagged Templates](./13-dsl-tagged-templates.md) — Text-based rule definitions
- [Validation](./17-validation.md) — Rule validation API
