# RuleManager

Internal rule storage with optimized indexing by triggers. Used internally by RuleEngine; access via `engine.getRuleManager()` for debugging or custom queries.

## Import

```typescript
import { RuleManager } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(): Promise<RuleManager>
```

Creates a new RuleManager instance.

**Returns:** `Promise<RuleManager>` — manager instance

**Example:**

```typescript
const manager = await RuleManager.start();
```

---

## Rule Management

### register()

```typescript
register(input: RuleInput): Rule
```

Registers a new rule. Automatically indexes the rule by trigger type and tags.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input | `RuleInput` | yes | Rule definition |

**Returns:** `Rule` — registered rule with generated metadata (version, createdAt, updatedAt)

**Example:**

```typescript
const rule = manager.register({
  id: 'low-stock-alert',
  name: 'Low Stock Alert',
  priority: 100,
  enabled: true,
  tags: ['inventory', 'alerts'],
  trigger: { type: 'fact', pattern: 'inventory:*' },
  conditions: [{ source: 'fact', field: 'quantity', operator: 'lt', value: 10 }],
  actions: [{ type: 'emit_event', topic: 'stock:low', payload: {} }],
});
```

### unregister()

```typescript
unregister(ruleId: string): boolean
```

Removes a rule and its indexes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleId | `string` | yes | Rule identifier |

**Returns:** `boolean` — true if rule was found and removed

**Example:**

```typescript
const removed = manager.unregister('low-stock-alert');
```

### enable()

```typescript
enable(ruleId: string): boolean
```

Enables a disabled rule.

**Returns:** `boolean` — true if rule was found and enabled

### disable()

```typescript
disable(ruleId: string): boolean
```

Disables a rule without removing it.

**Returns:** `boolean` — true if rule was found and disabled

### get()

```typescript
get(ruleId: string): Rule | undefined
```

Returns a rule by ID.

**Returns:** `Rule | undefined` — rule or undefined if not found

### getAll()

```typescript
getAll(): Rule[]
```

Returns all registered rules.

**Returns:** `Rule[]` — array of all rules

---

## Indexed Queries

RuleManager maintains optimized indexes for O(1) exact-match lookups and O(k) wildcard pattern scans where k << n (number of wildcard patterns).

### getByFactPattern()

```typescript
getByFactPattern(key: string): Rule[]
```

Returns active rules triggered by a fact key. Matches both exact patterns and wildcards.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key to match (e.g., `user.123.status`) |

**Returns:** `Rule[]` — matching active rules sorted by priority (descending)

**Example:**

```typescript
const rules = manager.getByFactPattern('user.123.premium');
// Matches rules with triggers: 'user.123.premium', 'user.*', 'user.123.*'
```

### getByEventTopic()

```typescript
getByEventTopic(topic: string): Rule[]
```

Returns active rules triggered by an event topic. Matches both exact topics and wildcards.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic to match (e.g., `order:created`) |

**Returns:** `Rule[]` — matching active rules sorted by priority (descending)

**Example:**

```typescript
const rules = manager.getByEventTopic('order:created');
// Matches rules with triggers: 'order:created', 'order:*', '*'
```

### getByTimerName()

```typescript
getByTimerName(name: string): Rule[]
```

Returns active rules triggered by a timer name. Supports wildcards.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| name | `string` | yes | Timer name to match |

**Returns:** `Rule[]` — matching active rules sorted by priority (descending)

**Example:**

```typescript
const rules = manager.getByTimerName('payment-timeout:ORD-123');
// Matches rules with triggers: 'payment-timeout:ORD-123', 'payment-timeout:*'
```

### getByFactAction()

```typescript
getByFactAction(key: string): Rule[]
```

Returns active rules whose actions set a fact with the given key (set_fact). Used for backward chaining to find rules producing a target fact.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| key | `string` | yes | Fact key that rules produce |

**Returns:** `Rule[]` — rules that set this fact, sorted by priority (descending)

**Example:**

```typescript
const producers = manager.getByFactAction('user.123.premium');
// Returns rules with actions like: { type: 'set_fact', key: 'user.123.premium', value: true }
```

### getByEventAction()

```typescript
getByEventAction(topic: string): Rule[]
```

Returns active rules whose actions emit an event with the given topic (emit_event). Used for backward chaining to find rules producing a target event.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| topic | `string` | yes | Event topic that rules produce |

**Returns:** `Rule[]` — rules that emit this event, sorted by priority (descending)

**Example:**

```typescript
const producers = manager.getByEventAction('notification:sent');
```

### getTemporalRules()

```typescript
getTemporalRules(): Rule[]
```

Returns all active rules with temporal triggers (CEP patterns).

**Returns:** `Rule[]` — temporal rules

---

## Rule State

### isRuleActive()

```typescript
isRuleActive(rule: Rule): boolean
```

Checks if a rule is active. A rule is active when:
1. The rule itself is enabled
2. If the rule belongs to a group, the group is also enabled

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| rule | `Rule` | yes | Rule to check |

**Returns:** `boolean` — true if rule is active

**Example:**

```typescript
const rule = manager.get('my-rule');
if (rule && manager.isRuleActive(rule)) {
  console.log('Rule is active and will be evaluated');
}
```

---

## Group Management

### registerGroup()

```typescript
registerGroup(input: RuleGroupInput): RuleGroup
```

Registers a new rule group.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| input | `RuleGroupInput` | yes | Group definition |

**Returns:** `RuleGroup` — created group with metadata

**Example:**

```typescript
const group = manager.registerGroup({
  id: 'notifications',
  name: 'Notification Rules',
  description: 'All notification-related rules',
  enabled: true,
});
```

### unregisterGroup()

```typescript
unregisterGroup(groupId: string): boolean
```

Removes a group. Rules in the group become ungrouped (their `group` field is removed).

**Returns:** `boolean` — true if group was found and removed

### enableGroup()

```typescript
enableGroup(groupId: string): boolean
```

Enables a group, making all its rules active (if individually enabled).

**Returns:** `boolean` — true if group was found and enabled

### disableGroup()

```typescript
disableGroup(groupId: string): boolean
```

Disables a group, making all its rules inactive regardless of their individual state.

**Returns:** `boolean` — true if group was found and disabled

### updateGroup()

```typescript
updateGroup(groupId: string, updates: { name?: string; description?: string; enabled?: boolean }): RuleGroup | undefined
```

Updates group properties.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| groupId | `string` | yes | Group identifier |
| updates | `object` | yes | Fields to update |

**Returns:** `RuleGroup | undefined` — updated group or undefined if not found

### getGroup()

```typescript
getGroup(groupId: string): RuleGroup | undefined
```

Returns a group by ID.

### getAllGroups()

```typescript
getAllGroups(): RuleGroup[]
```

Returns all registered groups.

### getGroupRules()

```typescript
getGroupRules(groupId: string): Rule[]
```

Returns all rules belonging to a group.

**Example:**

```typescript
const rules = manager.getGroupRules('notifications');
console.log(`Group has ${rules.length} rules`);
```

---

## Persistence

### setPersistence()

```typescript
setPersistence(persistence: RulePersistence): void
```

Sets the persistence adapter for saving rules and groups.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| persistence | `RulePersistence` | yes | Persistence adapter |

### restore()

```typescript
async restore(): Promise<number>
```

Loads rules and groups from persistence storage. Groups are restored first to ensure rule group references work correctly.

**Returns:** `Promise<number>` — number of restored rules

**Example:**

```typescript
manager.setPersistence(persistence);
const count = await manager.restore();
console.log(`Restored ${count} rules`);
```

### persist()

```typescript
async persist(): Promise<void>
```

Manually saves all rules and groups to persistence storage.

**Example:**

```typescript
await manager.persist();
```

---

## Properties

### size

```typescript
get size(): number
```

Returns the number of registered rules.

**Example:**

```typescript
console.log(`Total rules: ${manager.size}`);
```

---

## Types

### Rule

```typescript
interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  version: number;
  tags: string[];
  group?: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  lookups?: DataRequirement[];
  createdAt: number;
  updatedAt: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique rule identifier |
| name | `string` | Human-readable rule name |
| description | `string` | Optional description |
| priority | `number` | Execution priority (higher = earlier) |
| enabled | `boolean` | Whether rule is enabled |
| version | `number` | Auto-incremented version number |
| tags | `string[]` | Tags for categorization |
| group | `string` | Optional group membership |
| trigger | `RuleTrigger` | What activates the rule |
| conditions | `RuleCondition[]` | Conditions that must be met |
| actions | `RuleAction[]` | Actions to execute |
| lookups | `DataRequirement[]` | External data requirements |
| createdAt | `number` | Unix timestamp of creation |
| updatedAt | `number` | Unix timestamp of last update |

### RuleInput

```typescript
type RuleInput = Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>;
```

Rule definition without auto-generated fields. Used for registration.

### RuleTrigger

```typescript
type RuleTrigger =
  | { type: 'fact'; pattern: string }
  | { type: 'event'; topic: string }
  | { type: 'timer'; name: string }
  | { type: 'temporal'; pattern: TemporalPattern };
```

| Trigger Type | Field | Description |
|--------------|-------|-------------|
| `fact` | `pattern` | Fact key pattern (supports `*` wildcard) |
| `event` | `topic` | Event topic (supports `*` wildcard) |
| `timer` | `name` | Timer name (supports `*` wildcard) |
| `temporal` | `pattern` | CEP pattern (sequence, absence, count, aggregate) |

### RuleGroup

```typescript
interface RuleGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique group identifier |
| name | `string` | Human-readable group name |
| description | `string` | Optional description |
| enabled | `boolean` | Whether group is enabled |
| createdAt | `number` | Unix timestamp of creation |
| updatedAt | `number` | Unix timestamp of last update |

### RuleGroupInput

```typescript
interface RuleGroupInput {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
}
```

Group definition for registration. `enabled` defaults to `true`.

---

## Pattern Matching

RuleManager supports wildcard patterns in triggers using `*`:

```typescript
// Fact patterns
'user.123.status'    // Exact match
'user.*'             // Matches any user key
'user.*.premium'     // Matches user.123.premium, user.456.premium
'*'                  // Matches all facts

// Event topics
'order:created'      // Exact match
'order:*'            // Matches order:created, order:shipped, etc.
'*'                  // Matches all events

// Timer names
'payment-timeout:ORD-123'  // Exact match
'payment-timeout:*'        // Matches any payment timeout timer
```

---

## Indexing Architecture

RuleManager maintains separate indexes for optimal query performance:

1. **Exact indexes** (O(1) lookup):
   - `exactFactPatterns`: Rules with exact fact patterns
   - `exactEventTopics`: Rules with exact event topics
   - `exactTimerNames`: Rules with exact timer names

2. **Wildcard indexes** (O(k) scan where k << n):
   - `wildcardFactPatterns`: Rules with wildcard fact patterns
   - `wildcardEventTopics`: Rules with wildcard event topics
   - `wildcardTimerNames`: Rules with wildcard timer names

3. **Reverse indexes** (for backward chaining):
   - `exactFactActions`: Rules that set specific facts
   - `templateFactActions`: Rules with templated fact actions
   - `exactEventActions`: Rules that emit specific events
   - `templateEventActions`: Rules with templated event actions

4. **Tag and group indexes**:
   - `byTags`: Rules indexed by tags
   - `byGroup`: Rules indexed by group membership

---

## Automatic Persistence

When persistence is configured, RuleManager automatically saves changes with debouncing (10ms default). Manual persistence can be triggered with `persist()`.

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator
- [TemporalProcessor](./06-temporal-processor.md) — CEP pattern processing
- [Fluent Builder](./09-dsl-builder.md) — Rule.create() DSL
- [Rule Groups](../learn/07-groups-webhooks/01-rule-groups.md) — Tutorial
