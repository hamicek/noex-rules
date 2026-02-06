# Backward Chaining

Goal-driven backward chaining engine for rule inference. Given a goal (fact or event), the BackwardChainer searches the rule graph in reverse — finding rules whose actions produce the goal, then recursively checking whether their conditions can be satisfied from existing facts or from other rules.

## Import

```typescript
import {
  BackwardChainer,
  // Types
  Goal,
  FactGoal,
  EventGoal,
  QueryResult,
  ProofNode,
  FactExistsNode,
  RuleProofNode,
  ConditionProofNode,
  UnachievableNode,
  BackwardChainingConfig,
} from '@hamicek/noex-rules';
```

---

## BackwardChainer

Performs goal-driven backward chaining over registered rules. The evaluation is read-only — it never modifies facts or fires actions. The result is a proof tree that explains why the goal is achievable or not.

### Constructor

```typescript
constructor(
  ruleManager: RuleManager,
  conditionEvaluator: ConditionEvaluator,
  factStore: FactStore,
  config?: BackwardChainingConfig,
  traceCollector?: TraceCollector
)
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ruleManager | `RuleManager` | yes | Rule manager with registered rules |
| conditionEvaluator | `ConditionEvaluator` | yes | Evaluator for rule conditions |
| factStore | `FactStore` | yes | Fact store for base case checks |
| config | `BackwardChainingConfig` | no | Configuration options |
| traceCollector | `TraceCollector` | no | Collector for debug tracing |

**Note:** In typical usage, BackwardChainer is created internally by RuleEngine and accessed via `engine.getBackwardChainer()` or used implicitly via `engine.query()`.

### evaluate()

```typescript
evaluate(goal: Goal): QueryResult
```

Evaluates whether the given goal is achievable using the current fact store and registered rules.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| goal | `Goal` | yes | The goal to evaluate (fact or event) |

**Returns:** `QueryResult` — Result with achievability status and proof tree

**Example:**

```typescript
import { RuleEngine, factGoal, eventGoal } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

// Query if a fact can be achieved
const factResult = engine.query(factGoal('customer:123:tier').equals('vip'));

if (factResult.achievable) {
  console.log('Goal is achievable!');
  console.log('Explored rules:', factResult.exploredRules);
}

// Query if an event can be emitted
const eventResult = engine.query(eventGoal('notification.sent'));

console.log('Proof:', JSON.stringify(eventResult.proof, null, 2));
```

---

## BackwardChainingConfig

```typescript
interface BackwardChainingConfig {
  maxDepth?: number;
  maxExploredRules?: number;
}
```

Configuration for backward chaining behavior.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| maxDepth | `number` | `10` | Maximum recursion depth for goal evaluation |
| maxExploredRules | `number` | `100` | Maximum number of rules to explore before stopping |

**Example:**

```typescript
const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,
    maxExploredRules: 200,
  },
});
```

---

## Goal

```typescript
type Goal = FactGoal | EventGoal;
```

Union type representing any backward chaining goal.

---

## FactGoal

```typescript
interface FactGoal {
  type: 'fact';
  key: string;
  value?: unknown;
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
}
```

Goal for verifying or achieving a fact.

| Field | Type | Description |
|-------|------|-------------|
| type | `'fact'` | Discriminator |
| key | `string` | Fact key or pattern |
| value | `unknown` | Expected value (omit for existence check) |
| operator | `string` | Comparison operator (default: `'eq'`) |

**Example:**

```typescript
// Check if fact exists
const existsGoal: FactGoal = { type: 'fact', key: 'customer:123:tier' };

// Check for specific value
const valueGoal: FactGoal = {
  type: 'fact',
  key: 'customer:123:tier',
  value: 'vip',
  operator: 'eq'
};

// Check numeric threshold
const thresholdGoal: FactGoal = {
  type: 'fact',
  key: 'sensor:temp',
  value: 100,
  operator: 'gte'
};
```

---

## EventGoal

```typescript
interface EventGoal {
  type: 'event';
  topic: string;
}
```

Goal for achieving event emission.

| Field | Type | Description |
|-------|------|-------------|
| type | `'event'` | Discriminator |
| topic | `string` | Event topic to achieve |

**Example:**

```typescript
const goal: EventGoal = { type: 'event', topic: 'order.completed' };
```

---

## QueryResult

```typescript
interface QueryResult {
  goal: Goal;
  achievable: boolean;
  proof: ProofNode;
  exploredRules: number;
  maxDepthReached: boolean;
  durationMs: number;
}
```

Result of a backward chaining query.

| Field | Type | Description |
|-------|------|-------------|
| goal | `Goal` | The evaluated goal |
| achievable | `boolean` | Whether the goal is achievable |
| proof | `ProofNode` | Proof tree explaining the result |
| exploredRules | `number` | Number of rules explored during evaluation |
| maxDepthReached | `boolean` | Whether evaluation was limited by max depth |
| durationMs | `number` | Evaluation duration in milliseconds |

**Example:**

```typescript
const result = engine.query(factGoal('order:status').equals('shipped'));

console.log(`Achievable: ${result.achievable}`);
console.log(`Rules explored: ${result.exploredRules}`);
console.log(`Max depth reached: ${result.maxDepthReached}`);
console.log(`Duration: ${result.durationMs.toFixed(2)}ms`);
```

---

## ProofNode

```typescript
type ProofNode = FactExistsNode | RuleProofNode | UnachievableNode;
```

Union type for nodes in the proof tree.

---

## FactExistsNode

```typescript
interface FactExistsNode {
  type: 'fact_exists';
  key: string;
  currentValue: unknown;
  satisfied: boolean;
}
```

Proof node indicating a fact already exists in the store.

| Field | Type | Description |
|-------|------|-------------|
| type | `'fact_exists'` | Discriminator |
| key | `string` | Fact key |
| currentValue | `unknown` | Current value in the store |
| satisfied | `boolean` | Whether the value satisfies the goal |

---

## RuleProofNode

```typescript
interface RuleProofNode {
  type: 'rule';
  ruleId: string;
  ruleName: string;
  satisfied: boolean;
  conditions: ConditionProofNode[];
  children: ProofNode[];
}
```

Proof node representing a rule in the inference chain.

| Field | Type | Description |
|-------|------|-------------|
| type | `'rule'` | Discriminator |
| ruleId | `string` | Rule identifier |
| ruleName | `string` | Rule name |
| satisfied | `boolean` | Whether all conditions are satisfied |
| conditions | `ConditionProofNode[]` | Evaluation results for each condition |
| children | `ProofNode[]` | Recursive sub-goals (for fact conditions that need chaining) |

---

## ConditionProofNode

```typescript
interface ConditionProofNode {
  source: string;
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  satisfied: boolean;
}
```

Evaluation result for a single condition within a rule.

| Field | Type | Description |
|-------|------|-------------|
| source | `string` | Human-readable source description (e.g., `fact:order:status`) |
| operator | `string` | Comparison operator used |
| expectedValue | `unknown` | Expected value from the condition |
| actualValue | `unknown` | Actual value found |
| satisfied | `boolean` | Whether the condition is satisfied |

---

## UnachievableNode

```typescript
interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}
```

Proof node indicating the goal cannot be achieved.

| Field | Type | Description |
|-------|------|-------------|
| type | `'unachievable'` | Discriminator |
| reason | `string` | Reason code for failure |
| details | `string` | Additional details about the failure |

**Reason codes:**

| Code | Description |
|------|-------------|
| `'no_rules'` | No rules produce the required fact or event |
| `'cycle_detected'` | Circular dependency detected in rule chain |
| `'max_depth'` | Maximum recursion depth exceeded |
| `'all_paths_failed'` | All candidate rules failed to satisfy |

---

## Complete Example

```typescript
import {
  RuleEngine,
  Rule,
  onFact,
  fact,
  setFact,
  emit,
  factGoal,
  eventGoal,
} from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,
    maxExploredRules: 200,
  },
});

// Rule: High spenders become VIP
await engine.registerRule(
  Rule.create('vip-promotion')
    .name('VIP Promotion')
    .when(onFact('customer:*:totalSpent'))
    .if(fact('customer:*:totalSpent').gte(10000))
    .then(setFact('customer:*:tier', 'vip'))
    .build()
);

// Rule: VIP customers get notification
await engine.registerRule(
  Rule.create('vip-notification')
    .name('VIP Notification')
    .when(onFact('customer:*:tier'))
    .if(fact('customer:*:tier').eq('vip'))
    .then(emit('notification.vip'))
    .build()
);

// Set initial fact
await engine.setFact('customer:123:totalSpent', 15000);

// Query: Can customer 123 become VIP?
const factResult = engine.query(factGoal('customer:123:tier').equals('vip'));

console.log('--- Fact Goal Result ---');
console.log(`Achievable: ${factResult.achievable}`);
console.log(`Rules explored: ${factResult.exploredRules}`);
console.log('Proof:', JSON.stringify(factResult.proof, null, 2));

// Query: Can VIP notification be sent?
const eventResult = engine.query(eventGoal('notification.vip'));

console.log('\n--- Event Goal Result ---');
console.log(`Achievable: ${eventResult.achievable}`);
console.log(`Duration: ${eventResult.durationMs.toFixed(2)}ms`);

// Inspect proof tree
function printProof(node: ProofNode, indent = 0): void {
  const pad = '  '.repeat(indent);

  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}✓ Fact ${node.key} = ${node.currentValue} (satisfied: ${node.satisfied})`);
      break;
    case 'rule':
      console.log(`${pad}Rule: ${node.ruleName} (satisfied: ${node.satisfied})`);
      for (const cond of node.conditions) {
        const symbol = cond.satisfied ? '✓' : '✗';
        console.log(`${pad}  ${symbol} ${cond.source} ${cond.operator} ${cond.expectedValue} (actual: ${cond.actualValue})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 2);
      }
      break;
    case 'unachievable':
      console.log(`${pad}✗ Unachievable: ${node.reason}${node.details ? ` - ${node.details}` : ''}`);
      break;
  }
}

console.log('\n--- Proof Tree ---');
printProof(eventResult.proof);

await engine.stop();
```

---

## Using with DSL Goal Builders

The DSL provides fluent builders for creating goals:

```typescript
import { factGoal, eventGoal } from '@hamicek/noex-rules';

// Fact goals with operators
engine.query(factGoal('user:balance').gt(0));
engine.query(factGoal('order:status').equals('shipped'));
engine.query(factGoal('config:debug').exists());

// Event goals
engine.query(eventGoal('email.sent'));
engine.query(eventGoal('webhook.triggered'));
```

---

## See Also

- [RuleEngine](./01-rule-engine.md) — Main orchestrator with `query()` method
- [DSL Goal Builders](./16-dsl-goals.md) — Fluent builders for goals (`factGoal`, `eventGoal`)
- [Rule Manager](./05-rule-manager.md) — Rule registration and indexing
- [Condition Evaluator](./07-condition-evaluator.md) — Condition evaluation used in proof building
- [Fact Store](./02-fact-store.md) — Fact storage for base case checks
