# Part 2: Getting Started

This section walks you through the fundamental building blocks of noex-rules: creating an engine, registering rules, emitting events, managing facts, and writing conditions.

## Chapters

### [2.1 Your First Rule Engine](./01-first-engine.md)

Install the package, configure the engine, and start processing events:
- Installation and TypeScript setup
- `RuleEngine.start()` and configuration options
- Starting, stopping, and checking engine status

### [2.2 Rules and Events](./02-rules-and-events.md)

Register rules and drive them with events:
- Rule anatomy: id, name, priority, tags, trigger, conditions, actions
- Emitting events and subscribing to results
- How the engine evaluates rules when an event arrives

### [2.3 Working with Facts](./03-facts.md)

Manage persistent state that rules reason about:
- `setFact`, `getFact`, `deleteFact`, `queryFacts`
- Fact-triggered rules and key format conventions
- When to use facts vs events

### [2.4 Conditions in Depth](./04-conditions.md)

Master the condition system for precise rule targeting:
- All 12 operators with examples
- Source types: event, fact, context, lookup
- Dynamic references and string interpolation

## What You'll Learn

By the end of this section, you'll be able to:
- Set up a running rule engine from scratch
- Register rules that react to events and fact changes
- Manage persistent state with the fact store
- Write precise conditions using the full operator set

---

Start with: [Your First Rule Engine](./01-first-engine.md)
