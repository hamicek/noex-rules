# Forward vs Backward Chaining

Throughout this guide you've been writing rules that react to data: an event arrives, conditions are checked, and actions fire. This is **forward chaining** — the engine's default reasoning mode. But there's a second, complementary mode: **backward chaining**, where you start from a desired conclusion and ask the engine whether it can be reached. Understanding both modes — and when to use each — unlocks a powerful new class of queries.

## What You'll Learn

- How forward chaining drives rule evaluation (data-driven recap)
- How backward chaining reverses the direction (goal-driven reasoning)
- The read-only semantics of backward chaining
- When to use forward vs backward chaining
- How the two modes complement each other in a single engine

## Forward Chaining: Data Pushes Forward

Forward chaining is what you've used in every chapter so far. Data enters the engine (events, fact changes, timer expirations), rules whose triggers match are evaluated, and actions produce new data that can trigger further rules:

```text
  ┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
  │  Data    │────▶│  Rule Match  │────▶│  Conditions  │────▶│  Actions │
  │ (event,  │     │  (trigger    │     │  (evaluate)  │     │ (emit,   │
  │  fact,   │     │   matches)   │     │              │     │  setFact │
  │  timer)  │     └──────────────┘     └─────────────┘     │  ...)    │
  └─────────┘                                               └────┬─────┘
                                                                 │
                                                    ┌────────────┘
                                                    │  New data
                                                    ▼
                                              ┌─────────┐
                                              │  Data    │──▶ ... (cascading)
                                              └─────────┘
```

**Direction**: Data → Rules → New Data → More Rules → ...

**Characteristics**:
- **Reactive**: fires automatically when data arrives
- **Exhaustive**: evaluates all matching rules every time
- **Side-effecting**: actions modify engine state (facts, events, timers)
- **Continuous**: runs as long as the engine is started

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event, fact } from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start();

// Forward chaining: data pushes through rules
engine.registerRule(
  Rule.create('earn-points')
    .name('Earn Loyalty Points')
    .when(onEvent('order.completed'))
    .then(setFact(
      'customer:${event.customerId}:points',
      '${(parseInt(fact.value || "0") + Math.floor(event.total / 10))}'
    ))
    .build()
);

engine.registerRule(
  Rule.create('vip-upgrade')
    .name('VIP Tier Upgrade')
    .when(onEvent('order.completed'))
    .if(fact('customer:${event.customerId}:points').gte(1000))
    .then(setFact('customer:${event.customerId}:tier', 'vip'))
    .also(emit('notification.send', {
      to: '${event.customerId}',
      message: 'You reached VIP status!',
    }))
    .build()
);

// Data arrives → rules fire → new facts are created
await engine.emit('order.completed', { customerId: 'c-42', total: 250 });
```

The engine doesn't stop to ask "should this customer become VIP?". It simply processes the incoming event, evaluates all matching rules, and fires the ones whose conditions pass.

## Backward Chaining: Goals Pull Backward

Backward chaining reverses the direction. Instead of pushing data forward, you start with a **goal** — a fact or event you want to know about — and the engine traces backwards through the rule graph:

```text
  ┌──────────┐     ┌───────────────┐     ┌──────────────┐     ┌───────────┐
  │   Goal   │────▶│ Find rules    │────▶│  Check rule   │────▶│ Sub-goals │
  │ "Can X   │     │ whose actions │     │  conditions   │     │ (recurse) │
  │  be      │     │ produce X"    │     │  against      │     │           │
  │  true?"  │     └───────────────┘     │  fact store   │     └─────┬─────┘
  └──────────┘                           └──────────────┘           │
                                                              ┌─────┘
                                                              ▼
                                                        ┌───────────┐
                                                        │ Proof Tree│
                                                        │ (why/why  │
                                                        │  not)     │
                                                        └───────────┘
```

**Direction**: Goal → Rules (reversed) → Conditions → Sub-goals → ... → Facts

**Characteristics**:
- **Interrogative**: you ask a specific question
- **Targeted**: only explores rules relevant to the goal
- **Read-only**: never modifies facts, events, or timers
- **On-demand**: runs only when you call `engine.query()`

```typescript
import { factGoal, eventGoal } from '@hamicek/noex-rules/dsl';

// Backward chaining: ask a specific question
const result = engine.query(factGoal('customer:c-42:tier').equals('vip'));

console.log(result.achievable);    // true or false
console.log(result.exploredRules); // how many rules were examined
console.log(result.proof);         // full explanation tree
```

The engine doesn't fire any actions. It examines the rule graph to answer the question: "Given the current facts and rules, can this goal be reached?"

## How Backward Chaining Works

The algorithm follows these steps:

1. **Check the base case**: Does the fact already exist and satisfy the goal? If yes, return immediately with a `fact_exists` proof node.

2. **Find candidate rules**: Search for rules whose **actions** would produce the goal (e.g., rules with a `set_fact` action matching the goal's fact key, or rules with an `emit_event` action matching the goal's topic).

3. **Evaluate conditions**: For each candidate rule, check whether its conditions are satisfied by the current fact store.

4. **Recurse for missing facts**: If a condition references a fact that doesn't exist, create a **sub-goal** for that fact and recurse (step 1).

5. **Build proof tree**: The result is a tree that shows which rules were explored, which conditions passed or failed, and how sub-goals were resolved.

```text
  Goal: customer:c-42:tier = 'vip'
  │
  └─ Rule: vip-upgrade (conditions: customer:c-42:points >= 1000)
     │
     ├─ Condition: fact:customer:c-42:points >= 1000
     │  └─ Fact exists: customer:c-42:points = 1500  ✓
     │
     └─ Result: SATISFIED ✓
```

If the points fact didn't exist but another rule could produce it:

```text
  Goal: customer:c-42:tier = 'vip'
  │
  └─ Rule: vip-upgrade (conditions: customer:c-42:points >= 1000)
     │
     ├─ Condition: fact:customer:c-42:points >= 1000
     │  └─ Sub-goal: customer:c-42:points (existence)
     │     └─ Rule: earn-points (conditions: event trigger)
     │        └─ Condition: event:order.completed — UNSATISFIED
     │           (backward chaining has no trigger event)
     │
     └─ Result: UNSATISFIED ✗
```

Event-based and context-based conditions are always unsatisfied in backward chaining because there's no triggering event to evaluate against. This is by design — backward chaining answers what's possible given the **current state**, not what would happen if a specific event were emitted.

## Comparison

| Aspect | Forward Chaining | Backward Chaining |
|--------|-----------------|-------------------|
| **Direction** | Data → Rules → Conclusions | Goal → Rules → Preconditions |
| **Trigger** | Automatic (events, facts, timers) | Manual (`engine.query()`) |
| **Purpose** | React to changes | Answer questions |
| **State mutation** | Yes (sets facts, emits events) | No (read-only) |
| **Output** | Side effects (new facts, events) | `QueryResult` with proof tree |
| **Scope** | All matching rules | Only rules relevant to the goal |
| **API** | `engine.emit()`, `engine.setFact()` | `engine.query(goal)` |
| **Analogy** | Spreadsheet recalculation | SQL query / Prolog query |

## When to Use Each Approach

### Forward Chaining

Use forward chaining when you need the engine to **react** to changes automatically:

- Processing incoming orders, payments, sensor readings
- Triggering notifications, alerts, and escalations
- Maintaining derived facts (aggregates, statuses, scores)
- Executing business workflows with cascading rule chains
- Anything that should happen **because** something changed

### Backward Chaining

Use backward chaining when you need to **ask a question** without causing side effects:

- **Eligibility checks**: "Is this customer eligible for a VIP upgrade?"
- **Prerequisite validation**: "Can this order be fulfilled with current inventory?"
- **What-if analysis**: "If I set this fact, would this goal become achievable?"
- **Debugging**: "Why didn't this rule fire?" (inspect the proof tree)
- **Impact analysis**: "Which rules could produce this event?"
- **Compliance**: "Can this approval be granted given current policies?"

### Both Together

The most powerful pattern uses both modes together. Forward chaining handles the live processing, while backward chaining provides on-demand queries:

```typescript
// Forward chaining: process orders as they come in
engine.registerRule(
  Rule.create('process-order')
    .name('Process Order')
    .when(onEvent('order.submitted'))
    .if(fact('inventory:${event.productId}:stock').gt(0))
    .then(setFact('order:${event.orderId}:status', 'processing'))
    .also(emit('order.processing', { orderId: '${event.orderId}' }))
    .build()
);

// Backward chaining: check if an order CAN be processed before submitting
const canProcess = engine.query(
  factGoal('order:ord-99:status').equals('processing')
);

if (canProcess.achievable) {
  await engine.emit('order.submitted', {
    orderId: 'ord-99',
    productId: 'prod-1',
  });
} else {
  console.log('Order cannot be processed:', canProcess.proof);
}
```

## Exercise

Consider the following rule set:

```typescript
engine.registerRule(
  Rule.create('approve-loan')
    .name('Approve Loan')
    .when(onEvent('loan.requested'))
    .if(fact('applicant:${event.applicantId}:creditScore').gte(700))
    .if(fact('applicant:${event.applicantId}:income').gte(50000))
    .if(fact('applicant:${event.applicantId}:debtRatio').lt(0.4))
    .then(setFact('loan:${event.loanId}:status', 'approved'))
    .build()
);

engine.registerRule(
  Rule.create('calculate-debt-ratio')
    .name('Calculate Debt Ratio')
    .when(onEvent('applicant.financials.updated'))
    .then(setFact(
      'applicant:${event.applicantId}:debtRatio',
      '${event.totalDebt / event.annualIncome}'
    ))
    .build()
);
```

For each question below, decide whether forward chaining, backward chaining, or both is the appropriate approach:

1. A loan request event arrives and needs to be processed.
2. A loan officer wants to check whether a specific applicant qualifies for a loan before the applicant submits.
3. A dashboard shows real-time loan approval notifications.
4. An audit system needs to explain why a loan was denied.

<details>
<summary>Solution</summary>

1. **Forward chaining**. The loan request event triggers `approve-loan`, which evaluates conditions and sets the loan status. This is reactive processing.

2. **Backward chaining**. The loan officer calls `engine.query(factGoal('loan:L-1:status').equals('approved'))`. The engine traces back through `approve-loan`'s conditions without modifying state. The proof tree reveals which conditions pass and which fail (e.g., credit score too low).

3. **Forward chaining**. The dashboard subscribes to events emitted by forward chaining rules. When a loan is approved, an event fires and the dashboard updates.

4. **Both**. Forward chaining processed the loan and the denial happened in real time. But to explain *why* it was denied after the fact, backward chaining produces a proof tree showing which conditions failed. The proof tree is the audit artifact.

</details>

## Summary

- **Forward chaining** is data-driven: events and facts push through rules, producing new data and side effects
- **Backward chaining** is goal-driven: you ask "Can this goal be achieved?" and the engine searches rules in reverse
- Backward chaining is **read-only** — it never modifies facts, emits events, or fires actions
- The engine searches for rules whose **actions** produce the goal, then recursively checks their **conditions**
- Conditions based on events, context, or lookups are always unsatisfied in backward chaining (no trigger context)
- The result is a **proof tree** (`ProofNode`) that explains exactly why a goal is or isn't achievable
- Use forward chaining for **reactive processing** and backward chaining for **interrogative queries**
- The most powerful pattern combines both: forward chaining for live processing, backward chaining for on-demand analysis

---

Next: [Querying Goals](./02-querying-goals.md)
