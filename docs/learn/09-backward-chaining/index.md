# Part 9: Backward Chaining

Forward chaining — the default mode of noex-rules — is **data-driven**: events and facts push through rules and produce new facts and events. But sometimes you need to ask the opposite question: "**Can this goal be achieved?**" Backward chaining reverses the direction. Given a goal (a fact or event you want to be true), the engine searches the rule graph in reverse, finding rules whose actions produce the goal and recursively checking whether their conditions can be satisfied. The result is a **proof tree** that explains exactly why the goal is or isn't achievable — without modifying any engine state.

## Chapters

### [9.1 Forward vs Backward Chaining](./01-forward-vs-backward.md)

Two complementary reasoning strategies:
- Forward chaining recap: data pushes through rules to produce conclusions
- Backward chaining: start from a goal and work backwards through rule conditions
- When to use each approach and how they complement each other
- Comparison table and decision guidelines

### [9.2 Querying Goals](./02-querying-goals.md)

The complete backward chaining API:
- `FactGoal` and `EventGoal` types with DSL builders
- `engine.query()` method and `BackwardChainingConfig`
- `QueryResult` and proof tree structure (`ProofNode` union)
- Rule chaining, cycle detection, and depth limits
- Complete eligibility checking example with multi-level proof trees

## What You'll Learn

By the end of this section, you'll be able to:
- Explain the difference between forward and backward chaining
- Choose the right reasoning strategy for a given problem
- Query the engine with `factGoal()` and `eventGoal()` builders
- Read and interpret proof trees to understand why goals succeed or fail
- Configure depth and rule limits for backward chaining queries
- Use backward chaining for eligibility checks, prerequisite validation, and impact analysis

---

Start with: [Forward vs Backward Chaining](./01-forward-vs-backward.md)
