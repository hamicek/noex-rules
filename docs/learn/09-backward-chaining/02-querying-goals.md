# Querying Goals

The previous chapter explained the theory behind backward chaining. This chapter is the complete API reference: how to construct goals, configure the engine, call `engine.query()`, and interpret the proof tree it returns. You'll build a multi-rule eligibility system and learn to read proof trees that span several levels of rule chaining.

## What You'll Learn

- How to configure backward chaining with `BackwardChainingConfig`
- Constructing goals with raw objects and DSL builders (`factGoal`, `eventGoal`)
- Calling `engine.query()` and reading `QueryResult`
- All `ProofNode` types: `FactExistsNode`, `RuleProofNode`, `UnachievableNode`
- How rule chaining, cycle detection, and depth limits work
- Observability: tracing and audit logging for backward queries

## Configuration

Backward chaining is available on every engine with no extra configuration. To tune limits, pass `backwardChaining` to `RuleEngine.start()`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  backwardChaining: {
    maxDepth: 15,           // Max recursion depth (default: 10)
    maxExploredRules: 200,  // Max rules examined per query (default: 100)
  },
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxDepth` | `10` | Maximum recursion depth for sub-goal evaluation |
| `maxExploredRules` | `100` | Maximum total rules examined across the entire query |

Both limits protect against runaway queries in large rule sets. When either limit is reached, the affected branch returns an `UnachievableNode` with reason `'max_depth'`.

## Goals

A **goal** is the question you ask the engine. There are two types:

### FactGoal

"Can this fact exist (or have a specific value)?"

```typescript
import { factGoal } from '@hamicek/noex-rules/dsl';

// Existence check — does the fact exist with any value?
factGoal('customer:c-42:tier')

// Value equality — does the fact equal 'vip'?
factGoal('customer:c-42:tier').equals('vip')

// Numeric comparisons
factGoal('customer:c-42:points').gte(1000)
factGoal('order:ord-1:total').lt(500)
factGoal('sensor:temp:current').gt(100)
factGoal('account:a-1:balance').lte(0)

// Negation
factGoal('user:u-1:status').neq('banned')
```

The `.exists()` method is available as a readability aid but is the default behavior — calling `factGoal('key')` and `factGoal('key').exists()` produce the same goal.

**Available operators**:

| Method | Operator | Description |
|--------|----------|-------------|
| `.exists()` | — | Fact exists with any value (default) |
| `.equals(v)` | `eq` | Fact value equals `v` |
| `.neq(v)` | `neq` | Fact value does not equal `v` |
| `.gt(n)` | `gt` | Fact value is greater than `n` |
| `.gte(n)` | `gte` | Fact value is greater than or equal to `n` |
| `.lt(n)` | `lt` | Fact value is less than `n` |
| `.lte(n)` | `lte` | Fact value is less than or equal to `n` |

Numeric operators (`.gt()`, `.gte()`, `.lt()`, `.lte()`) require a finite number and throw `DslValidationError` for non-numeric values.

### EventGoal

"Can this event be emitted by some rule chain?"

```typescript
import { eventGoal } from '@hamicek/noex-rules/dsl';

// Can any rule chain produce this event?
eventGoal('order.completed')
eventGoal('notification.sent')
eventGoal('fraud.alert')
```

Event goals search for rules whose actions include an `emit_event` action with the matching topic.

### Raw Goal Objects

You can also construct goals as plain objects without the DSL:

```typescript
// Fact goal (raw)
const goal = { type: 'fact' as const, key: 'customer:c-42:tier', value: 'vip', operator: 'eq' as const };

// Event goal (raw)
const goal = { type: 'event' as const, topic: 'order.completed' };

engine.query(goal);
```

The DSL builders are preferred for type safety and readability.

## Querying

Call `engine.query()` with a goal or goal builder:

```typescript
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));
```

The method accepts both raw `Goal` objects and `GoalBuilder` instances (from the DSL). It resolves builders automatically by calling `.build()`.

### QueryResult

Every query returns a `QueryResult`:

```typescript
interface QueryResult {
  goal: Goal;              // The goal that was queried
  achievable: boolean;     // Whether the goal can be achieved
  proof: ProofNode;        // Proof tree explaining why
  exploredRules: number;   // Total rules examined
  maxDepthReached: boolean; // Whether recursion hit the depth limit
  durationMs: number;      // Query execution time in milliseconds
}
```

The `achievable` field is the headline answer. The `proof` tree explains the reasoning.

## Proof Trees

The proof tree is a recursive structure with three node types:

```text
  ProofNode
  ├── FactExistsNode     — Base case: fact already in the store
  ├── RuleProofNode      — A rule was explored with its conditions
  └── UnachievableNode   — Goal cannot be reached (with reason)
```

### FactExistsNode

Returned when the fact already exists in the store:

```typescript
interface FactExistsNode {
  type: 'fact_exists';
  key: string;          // The fact key
  currentValue: unknown; // Current value in the store
  satisfied: boolean;    // Whether the value matches the goal
}
```

A `FactExistsNode` can be satisfied (fact exists and matches) or unsatisfied (fact exists but doesn't match the goal's operator/value). When the fact doesn't exist at all and no rules produce it, you get an `UnachievableNode` instead.

### RuleProofNode

Returned when a rule was found that could produce the goal:

```typescript
interface RuleProofNode {
  type: 'rule';
  ruleId: string;                     // Rule ID
  ruleName: string;                   // Human-readable name
  satisfied: boolean;                 // Whether all conditions pass
  conditions: ConditionProofNode[];   // Per-condition evaluation results
  children: ProofNode[];              // Sub-goals from unsatisfied conditions
}

interface ConditionProofNode {
  source: string;         // Human-readable source (e.g., 'fact:customer:points')
  operator: string;       // Condition operator (e.g., 'gte')
  expectedValue: unknown; // What the condition expects
  actualValue: unknown;   // What the fact store returned
  satisfied: boolean;     // Whether this condition passed
}
```

The `children` array contains sub-goals — recursive proof nodes for conditions that reference facts not yet in the store. This is where the tree grows deeper.

### UnachievableNode

Returned when the goal cannot be reached:

```typescript
interface UnachievableNode {
  type: 'unachievable';
  reason: 'no_rules' | 'cycle_detected' | 'max_depth' | 'all_paths_failed';
  details?: string;
}
```

| Reason | Meaning |
|--------|---------|
| `no_rules` | No rule's actions produce the goal |
| `cycle_detected` | All candidate rules form a circular dependency |
| `max_depth` | Recursion depth limit reached |
| `all_paths_failed` | Rules exist but none have satisfiable conditions |

## Rule Chaining

Backward chaining's power comes from following rule chains. When a condition references a missing fact, the engine automatically creates a sub-goal and searches for rules that produce it:

```typescript
const engine = await RuleEngine.start();

// Rule 1: Earn points from orders
engine.registerRule(
  Rule.create('earn-points')
    .name('Earn Loyalty Points')
    .when(onEvent('order.completed'))
    .then(setFact('customer:c-42:points', 1500))
    .build()
);

// Rule 2: Upgrade to VIP when points are high enough
engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP Tier Upgrade')
    .when(onEvent('loyalty.check'))
    .if(fact('customer:c-42:points').gte(1000))
    .then(setFact('customer:c-42:tier', 'vip'))
    .build()
);

// Query: Can customer c-42 have VIP tier?
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));
```

The engine traces backwards:

1. Goal: `customer:c-42:tier = 'vip'` → finds `vip-upgrade` rule
2. Condition: `customer:c-42:points >= 1000` → fact missing → sub-goal
3. Sub-goal: `customer:c-42:points` exists → finds `earn-points` rule
4. `earn-points` has no conditions → satisfied

Result: achievable = `true`, with a two-level proof tree.

If `customer:c-42:points` already existed with value `1500`, the engine wouldn't need to recurse — step 2 would return a satisfied `FactExistsNode`.

## Cycle Detection

When rules form circular dependencies, the engine detects the cycle and stops:

```typescript
// Rule A produces fact-x when fact-y exists
engine.registerRule(
  Rule.create('rule-a')
    .name('Rule A')
    .when(onEvent('trigger'))
    .if(fact('fact-y').exists())
    .then(setFact('fact-x', true))
    .build()
);

// Rule B produces fact-y when fact-x exists
engine.registerRule(
  Rule.create('rule-b')
    .name('Rule B')
    .when(onEvent('trigger'))
    .if(fact('fact-x').exists())
    .then(setFact('fact-y', true))
    .build()
);

const result = engine.query(factGoal('fact-x'));
// result.achievable === false
// result.proof.reason === 'cycle_detected'
```

The engine maintains a visited set during traversal. When it encounters a rule+goal combination it has already seen in the current path, it backtracks. If all candidate rules are part of cycles, the result is an `UnachievableNode` with reason `'cycle_detected'`.

## Disabled Rules and Groups

Backward chaining respects rule and group state. Disabled rules and rules in disabled groups are skipped during the search:

```typescript
engine.registerRule(
  Rule.create('my-rule')
    .name('My Rule')
    .enabled(false) // Disabled — backward chaining ignores this rule
    .when(onEvent('trigger'))
    .then(setFact('output', true))
    .build()
);

const result = engine.query(factGoal('output'));
// result.achievable === false
// result.proof.reason === 'no_rules' (disabled rule is invisible)
```

## Complete Example: Loan Eligibility System

This example demonstrates a multi-rule system where backward chaining traces through three levels of rules to determine loan eligibility:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';
import { factGoal, eventGoal } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  backwardChaining: { maxDepth: 15 },
});

// --- Level 1: Base data rules ---

// Credit score lookup produces a score fact
engine.registerRule(
  Rule.create('credit-score-lookup')
    .name('Credit Score Lookup')
    .when(onEvent('applicant.submitted'))
    .then(setFact(
      'applicant:${event.applicantId}:creditScore',
      '${event.creditScore}'
    ))
    .build()
);

// Income verification produces an income fact
engine.registerRule(
  Rule.create('income-verification')
    .name('Income Verification')
    .when(onEvent('applicant.submitted'))
    .then(setFact(
      'applicant:${event.applicantId}:verifiedIncome',
      '${event.annualIncome}'
    ))
    .build()
);

// --- Level 2: Derived eligibility criteria ---

// Credit eligible when score >= 680
engine.registerRule(
  Rule.create('credit-eligible')
    .name('Credit Eligibility')
    .when(onFact('applicant:*:creditScore'))
    .if(fact('applicant:${fact.key.split(":")[1]}:creditScore').gte(680))
    .then(setFact('applicant:${fact.key.split(":")[1]}:creditEligible', true))
    .build()
);

// Income eligible when verified income >= 45000
engine.registerRule(
  Rule.create('income-eligible')
    .name('Income Eligibility')
    .when(onFact('applicant:*:verifiedIncome'))
    .if(fact('applicant:${fact.key.split(":")[1]}:verifiedIncome').gte(45000))
    .then(setFact('applicant:${fact.key.split(":")[1]}:incomeEligible', true))
    .build()
);

// --- Level 3: Final loan decision ---

// Approve loan when both credit and income are eligible
engine.registerRule(
  Rule.create('loan-approval')
    .name('Loan Approval')
    .when(onFact('applicant:*:creditEligible'))
    .if(fact('applicant:${fact.key.split(":")[1]}:creditEligible').equals(true))
    .if(fact('applicant:${fact.key.split(":")[1]}:incomeEligible').equals(true))
    .then(setFact('applicant:${fact.key.split(":")[1]}:loanApproved', true))
    .also(emit('loan.approved', {
      applicantId: '${fact.key.split(":")[1]}',
    }))
    .build()
);

// --- Scenario 1: Fully eligible applicant ---

engine.setFact('applicant:A-1:creditScore', 750);
engine.setFact('applicant:A-1:verifiedIncome', 85000);
engine.setFact('applicant:A-1:creditEligible', true);
engine.setFact('applicant:A-1:incomeEligible', true);

const eligible = engine.query(factGoal('applicant:A-1:loanApproved').equals(true));

console.log('Applicant A-1 loan approved:', eligible.achievable);
// true — all conditions satisfied from existing facts
console.log('Rules explored:', eligible.exploredRules);
// 1 — only loan-approval needed

// --- Scenario 2: Missing income eligibility ---

engine.setFact('applicant:A-2:creditScore', 720);
engine.setFact('applicant:A-2:creditEligible', true);
// No incomeEligible fact set — backward chaining will search for it

const partial = engine.query(factGoal('applicant:A-2:loanApproved').equals(true));

console.log('Applicant A-2 loan approved:', partial.achievable);
// false — incomeEligible fact is missing and income-eligible rule needs
//         verifiedIncome which also doesn't exist
console.log('Rules explored:', partial.exploredRules);

// --- Inspect the proof tree ---

function printProof(node: any, indent = 0): void {
  const pad = '  '.repeat(indent);

  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}[FACT] ${node.key} = ${node.currentValue} (${node.satisfied ? '✓' : '✗'})`);
      break;

    case 'rule':
      console.log(`${pad}[RULE] ${node.ruleName} (${node.satisfied ? '✓' : '✗'})`);
      for (const cond of node.conditions) {
        console.log(`${pad}  ${cond.source} ${cond.operator} ${cond.expectedValue} → actual: ${cond.actualValue} (${cond.satisfied ? '✓' : '✗'})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 1);
      }
      break;

    case 'unachievable':
      console.log(`${pad}[UNACHIEVABLE] ${node.reason}${node.details ? ': ' + node.details : ''}`);
      break;
  }
}

console.log('\n--- Proof tree for A-2 ---');
printProof(partial.proof);

// --- Can the loan.approved event be emitted? ---

const canEmit = engine.query(eventGoal('loan.approved'));
console.log('\nCan emit loan.approved:', canEmit.achievable);

await engine.stop();
```

## Observability

Backward chaining integrates with the engine's tracing and audit systems.

### Trace Entries

When tracing is enabled, backward queries emit two trace entry types:

| Type | When | Key details |
|------|------|-------------|
| `backward_goal_evaluated` | A goal (fact or event) is evaluated | `goalType`, `key`/`topic`, `depth`, `satisfied`, `proofType` |
| `backward_rule_explored` | A rule is explored during the search | `ruleId`, `ruleName`, `satisfied`, `conditionsCount`, `childrenCount`, `depth` |

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// After a query, trace entries are in the collector
engine.query(factGoal('customer:c-42:tier').equals('vip'));

const goalTraces = engine.traceCollector.getByType('backward_goal_evaluated');
const ruleTraces = engine.traceCollector.getByType('backward_rule_explored');

for (const trace of goalTraces) {
  console.log(`Goal ${trace.details.goalType}:${trace.details.key ?? trace.details.topic}`
    + ` at depth ${trace.details.depth}: ${trace.details.satisfied ? 'satisfied' : 'unsatisfied'}`);
}
```

### Audit Logging

When audit logging is enabled, backward queries record start and completion events:

| Audit event | Details |
|-------------|---------|
| `backward_query_started` | `goalType`, `key`/`topic`, `value`, `operator` |
| `backward_query_completed` | `goalType`, `achievable`, `exploredRules`, `maxDepthReached`, `durationMs` |

## Exercise

Build a customer reward eligibility system:

1. Create an engine with backward chaining enabled (maxDepth: 20)
2. Register these rules:
   - `active-customer`: sets `customer:${id}:active` to `true` when `customer.login` event is received
   - `purchase-milestone`: sets `customer:${id}:milestone` to `true` when `customer:${id}:totalPurchases` >= 500
   - `reward-eligible`: sets `customer:${id}:rewardEligible` to `true` when both `customer:${id}:active` is `true` AND `customer:${id}:milestone` is `true`
3. Set facts: `customer:c-1:active = true`, `customer:c-1:totalPurchases = 750`
4. Query: Can `customer:c-1:rewardEligible` equal `true`?
5. Print the proof tree to see the chain of reasoning
6. Query a second customer `c-2` who has `active = true` but `totalPurchases = 200` — verify it's not achievable and inspect why

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, onFact, setFact, event, fact,
} from '@hamicek/noex-rules/dsl';
import { factGoal } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  backwardChaining: { maxDepth: 20 },
});

// Rule 1: Mark customer as active on login
engine.registerRule(
  Rule.create('active-customer')
    .name('Active Customer')
    .when(onEvent('customer.login'))
    .then(setFact('customer:${event.customerId}:active', true))
    .build()
);

// Rule 2: Set milestone when purchases reach 500
engine.registerRule(
  Rule.create('purchase-milestone')
    .name('Purchase Milestone')
    .when(onFact('customer:*:totalPurchases'))
    .if(fact('customer:${fact.key.split(":")[1]}:totalPurchases').gte(500))
    .then(setFact('customer:${fact.key.split(":")[1]}:milestone', true))
    .build()
);

// Rule 3: Reward eligible when active AND milestone reached
engine.registerRule(
  Rule.create('reward-eligible')
    .name('Reward Eligibility')
    .when(onFact('customer:*:milestone'))
    .if(fact('customer:${fact.key.split(":")[1]}:active').equals(true))
    .if(fact('customer:${fact.key.split(":")[1]}:milestone').equals(true))
    .then(setFact('customer:${fact.key.split(":")[1]}:rewardEligible', true))
    .build()
);

// --- Customer c-1: eligible ---

engine.setFact('customer:c-1:active', true);
engine.setFact('customer:c-1:totalPurchases', 750);
engine.setFact('customer:c-1:milestone', true);

const c1Result = engine.query(factGoal('customer:c-1:rewardEligible').equals(true));

console.log('Customer c-1 reward eligible:', c1Result.achievable);
// true

function printProof(node: any, indent = 0): void {
  const pad = '  '.repeat(indent);
  switch (node.type) {
    case 'fact_exists':
      console.log(`${pad}[FACT] ${node.key} = ${JSON.stringify(node.currentValue)} (${node.satisfied ? '✓' : '✗'})`);
      break;
    case 'rule':
      console.log(`${pad}[RULE] ${node.ruleName} (${node.satisfied ? '✓' : '✗'})`);
      for (const c of node.conditions) {
        console.log(`${pad}  ${c.source} ${c.operator} ${JSON.stringify(c.expectedValue)} → ${JSON.stringify(c.actualValue)} (${c.satisfied ? '✓' : '✗'})`);
      }
      for (const child of node.children) {
        printProof(child, indent + 1);
      }
      break;
    case 'unachievable':
      console.log(`${pad}[UNACHIEVABLE] ${node.reason}${node.details ? ': ' + node.details : ''}`);
      break;
  }
}

console.log('\n--- Proof tree for c-1 ---');
printProof(c1Result.proof);

// --- Customer c-2: not eligible ---

engine.setFact('customer:c-2:active', true);
engine.setFact('customer:c-2:totalPurchases', 200);

const c2Result = engine.query(factGoal('customer:c-2:rewardEligible').equals(true));

console.log('\nCustomer c-2 reward eligible:', c2Result.achievable);
// false — milestone not reached, totalPurchases only 200

console.log('\n--- Proof tree for c-2 ---');
printProof(c2Result.proof);

// The proof tree shows:
// [RULE] Reward Eligibility (✗)
//   fact:customer:c-2:active equals true → true (✓)
//   fact:customer:c-2:milestone equals true → undefined (✗)
//   [RULE] Purchase Milestone (✗)
//     fact:customer:c-2:totalPurchases gte 500 → 200 (✗)

console.log('\nRules explored for c-1:', c1Result.exploredRules);
console.log('Rules explored for c-2:', c2Result.exploredRules);

await engine.stop();
```

Customer c-1 is eligible because all three facts exist: `active = true`, `totalPurchases = 750`, and `milestone = true`. Customer c-2 fails because the milestone fact doesn't exist, and when backward chaining looks for the `purchase-milestone` rule, the `totalPurchases = 200` condition fails (200 < 500).

</details>

## Summary

- Configure backward chaining limits with `backwardChaining: { maxDepth, maxExploredRules }` in `RuleEngine.start()`
- Construct fact goals with `factGoal(key)` and chain operators: `.equals()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`
- Construct event goals with `eventGoal(topic)` to check if an event can be emitted
- Call `engine.query(goal)` — accepts both raw `Goal` objects and DSL builders
- `QueryResult` contains `achievable`, `proof` tree, `exploredRules`, `maxDepthReached`, and `durationMs`
- Three proof node types: `FactExistsNode` (base case), `RuleProofNode` (rule explored), `UnachievableNode` (goal unreachable)
- The engine **recursively chains** through rules: missing facts become sub-goals that search for producing rules
- **Cycle detection** prevents infinite loops — circular rule dependencies return `'cycle_detected'`
- Disabled rules and rules in disabled groups are **invisible** to backward chaining
- Backward queries emit `backward_goal_evaluated` and `backward_rule_explored` trace entries
- Audit logging records `backward_query_started` and `backward_query_completed` events

---

Next: [REST API](../10-apis/01-rest-api.md)
