# YAML Rules

YAML rules let you define business logic in configuration files that live outside your TypeScript code. This decouples rule authoring from application deployment — a product manager can edit a YAML file and deploy new rules without touching the codebase. noex-rules provides `loadRulesFromYAML()` for parsing YAML strings and `loadRulesFromFile()` for reading YAML files directly.

## What You'll Learn

- How to load rules from YAML strings with `loadRulesFromYAML()`
- How to load rules from files with `loadRulesFromFile()`
- The three supported YAML formats (single rule, array, `rules` key)
- YAML syntax for triggers, conditions, and actions
- Validation and error handling (`YamlLoadError`, `YamlValidationError`)
- When YAML rules are the right choice

## Loading Rules from YAML

### From a String

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

`loadRulesFromYAML()` always returns an array, even for a single rule definition.

### From a File

```typescript
import { loadRulesFromFile } from '@hamicek/noex-rules/dsl';

const rules = await loadRulesFromFile('./rules/orders.yaml');
rules.forEach(r => engine.registerRule(r));
```

`loadRulesFromFile()` is async — it reads the file from disk, parses the YAML content, validates each rule, and returns the array. Use it in application startup or hot-reload scenarios.

## YAML Formats

The loader accepts three formats. All produce the same output: an array of `RuleInput` objects.

### Format 1: Single Rule Object

A YAML document that defines one rule at the top level:

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

### Format 2: Array of Rules

A YAML document with a top-level array:

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

### Format 3: Object with `rules` Key

A YAML document with a `rules` property containing the array:

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

This format is useful when you want to add metadata or other top-level keys alongside the rules in the same file.

## YAML Rule Structure

Every YAML rule maps directly to the `RuleInput` type. The structure mirrors the raw object format:

```yaml
# Required
id: rule-unique-id
trigger:
  type: event | fact | timer
  topic: event.topic           # for event triggers
  pattern: "fact:*:pattern"    # for fact triggers
  name: timer-name             # for timer triggers

# Required (at least one)
actions:
  - type: emit_event | set_fact | delete_fact | log | set_timer | cancel_timer | call_service
    # ... action-specific properties

# Optional
name: Human Readable Name
description: What the rule does
priority: 100
enabled: true
tags:
  - tag1
  - tag2
conditions:
  - source:
      type: event | fact | context
      field: fieldName         # for event source
      pattern: "fact:pattern"  # for fact source
      key: contextKey          # for context source
    operator: eq | neq | gt | gte | lt | lte | in | not_in | contains | not_contains | matches | exists | not_exists
    value: comparison-value
```

### Triggers

```yaml
# Event trigger
trigger:
  type: event
  topic: order.created

# Event trigger with wildcard
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

### Conditions

```yaml
conditions:
  # Event field comparison
  - source:
      type: event
      field: total
    operator: gte
    value: 100

  # Fact value comparison (with interpolation)
  - source:
      type: fact
      pattern: "customer:${event.customerId}:tier"
    operator: eq
    value: vip

  # Context comparison
  - source:
      type: context
      key: environment
    operator: eq
    value: production

  # Existence check (no value needed)
  - source:
      type: event
      field: couponCode
    operator: exists
    value: true
```

### Actions

```yaml
actions:
  # Emit event
  - type: emit_event
    topic: order.confirmed
    data:
      orderId: "${event.orderId}"
      total: "${event.total}"

  # Set fact
  - type: set_fact
    key: "order:${event.orderId}:status"
    value: confirmed

  # Set fact with reference
  - type: set_fact
    key: "order:${event.orderId}:total"
    value:
      ref: event.total

  # Delete fact
  - type: delete_fact
    key: "order:${event.orderId}:pending"

  # Log
  - type: log
    level: info
    message: "Order ${event.orderId} confirmed"

  # Set timer
  - type: set_timer
    name: "payment-timeout:${event.orderId}"
    duration: 15m
    onExpire:
      topic: order.payment_timeout
      data:
        orderId: "${event.orderId}"

  # Cancel timer
  - type: cancel_timer
    name: "payment-timeout:${event.orderId}"

  # Call service
  - type: call_service
    service: emailService
    method: send
    args:
      - "${event.email}"
      - "Order Confirmed"
```

### References in YAML

Use the `ref` key to create runtime references that preserve the original type:

```yaml
# String interpolation — result is always a string
message: "Total: ${event.total}"

# Reference — preserves type (number stays number)
value:
  ref: event.total
```

In `data` objects, you can use either `${expression}` interpolation (always produces strings) or explicit `ref` objects:

```yaml
data:
  # String interpolation
  label: "Order ${event.orderId}"

  # Typed reference
  amount:
    ref: event.total
```

## Error Handling

The YAML loader throws specific errors for different failure modes:

### YamlLoadError

Thrown when the YAML content can't be parsed or the file can't be read:

```typescript
import { loadRulesFromYAML, YamlLoadError } from '@hamicek/noex-rules/dsl';

try {
  const rules = loadRulesFromYAML('invalid: yaml: content: [');
} catch (error) {
  if (error instanceof YamlLoadError) {
    console.error('YAML parsing failed:', error.message);
  }
}
```

### YamlValidationError

Thrown when the YAML parses successfully but the rule structure is invalid:

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
    console.error('Invalid rule structure:', error.message);
  }
}
```

### Defensive Loading

For production use, wrap loading in error handling:

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
      console.error(`Failed to read/parse ${path}:`, error.message);
    } else if (error instanceof YamlValidationError) {
      console.error(`Invalid rule in ${path}:`, error.message);
    } else {
      throw error;
    }
    return [];
  }
}
```

## Additional YAML Loaders

noex-rules also provides specialized YAML loaders for other resource types:

```typescript
import {
  loadGroupsFromYAML,     // Load rule groups
  loadGroupsFromFile,
  loadGoalsFromYAML,       // Load backward chaining goals
  loadGoalsFromFile,
  loadTemplateFromYAML,    // Load rule templates
  loadTemplateFromFile,
} from '@hamicek/noex-rules/dsl';
```

These follow the same pattern: synchronous string parsing or async file loading, with validation errors on invalid structures.

## Complete Working Example

A file-based rule management system that loads rules from a YAML file:

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

  // Load all rules from file
  const rules = await loadRulesFromFile('./rules/order-pipeline.yaml');
  rules.forEach(r => engine.registerRule(r));

  console.log(`Loaded ${rules.length} rules`);
  // Loaded 3 rules

  // Set up customer data
  await engine.setFact('customer:C-100:tier', 'vip');

  // Run pipeline
  await engine.emit('order.created', {
    orderId: 'ORD-001',
    customerId: 'C-100',
    total: 250,
  });

  console.log('Status:', engine.getFact('order:ORD-001:status'));
  // "confirmed"
  console.log('Discount:', engine.getFact('order:ORD-001:discount'));
  // 0.1

  await engine.stop();
}

main();
```

## Exercise

Create a YAML file that defines two rules:

1. **Temperature Alert**: Triggers on event `sensor.reading`. If the `temperature` field > 40, emit `alert.overheat` with the sensor ID and temperature, and log a warning.
2. **Sensor Offline**: Triggers on event `sensor.heartbeat_missed`. Set fact `sensor:${sensorId}:status` to `"offline"` and log an error.

Then write the TypeScript code to load and register the rules.

<details>
<summary>Solution</summary>

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
        message: "Sensor ${event.sensorId} overheating: ${event.temperature}C"

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
        message: "Sensor ${event.sensorId} is offline"
```

**app.ts:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { loadRulesFromFile } from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'sensors' });

  const rules = await loadRulesFromFile('./rules/sensors.yaml');
  rules.forEach(r => engine.registerRule(r));

  // Test temperature alert
  await engine.emit('sensor.reading', { sensorId: 'S-01', temperature: 45 });

  // Test sensor offline
  await engine.emit('sensor.heartbeat_missed', { sensorId: 'S-02' });
  console.log('S-02 status:', engine.getFact('sensor:S-02:status'));
  // "offline"

  await engine.stop();
}

main();
```

The YAML file is completely separate from the application code. Rules can be updated by editing the YAML file and reloading (manually or via hot-reload), without recompiling the TypeScript.

</details>

## Summary

- `loadRulesFromYAML(yamlString)` parses YAML content synchronously and returns `RuleInput[]`
- `loadRulesFromFile(path)` reads and parses a YAML file asynchronously
- Three YAML formats: single rule object, array of rules, object with `rules` key
- YAML rule structure mirrors the raw `RuleInput` type: `id`, `trigger`, `conditions`, `actions`, plus optional metadata
- Use `${expression}` interpolation in strings for runtime-resolved values
- Use `ref: path` objects for typed runtime references
- `YamlLoadError` on parsing/file errors, `YamlValidationError` on invalid rule structures
- Additional loaders for groups, goals, and templates follow the same pattern
- YAML rules are ideal when non-developers need to author rules or rules need to change without code deployment

---

Next: [Choosing the Right Approach](./04-choosing-approach.md)
