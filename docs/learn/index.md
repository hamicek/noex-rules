# Learning noex-rules

A comprehensive guide for Node.js developers who want to master rule engines and Complex Event Processing. This guide teaches not just the API, but the **way of thinking** in declarative business rules.

## Who Is This For?

- Node.js / TypeScript developers (intermediate+)
- You know async/await and basic event-driven patterns
- You don't need prior rule engine or CEP experience
- You're looking for a structured way to express business logic outside of code

## Learning Path

### Part 1: Introduction

Understand why a rule engine exists and what problems it solves.

| Chapter | Description |
|---------|-------------|
| [1.1 Why a Rule Engine?](./01-introduction/01-why-rules.md) | Problems with hardcoded business logic and how a rule engine helps |
| [1.2 Key Concepts](./01-introduction/02-key-concepts.md) | Overview of rules, facts, events, timers, forward chaining, and CEP |

### Part 2: Getting Started

Learn the fundamental building blocks.

| Chapter | Description |
|---------|-------------|
| [2.1 Your First Rule Engine](./02-getting-started/01-first-engine.md) | Installation, configuration, starting and stopping the engine |
| [2.2 Rules and Events](./02-getting-started/02-rules-and-events.md) | Register rules, emit events, subscribe to results |
| [2.3 Working with Facts](./02-getting-started/03-facts.md) | Set, get, delete, query facts and fact-triggered rules |
| [2.4 Conditions in Depth](./02-getting-started/04-conditions.md) | All operators, source types, references, and string interpolation |

### Part 3: Actions

Control what happens when rules fire.

| Chapter | Description |
|---------|-------------|
| [3.1 Core Actions](./03-actions/01-core-actions.md) | emit_event, set_fact, delete_fact, log, and string interpolation |
| [3.2 Timers and Scheduling](./03-actions/02-timers.md) | set_timer, cancel_timer, duration syntax, timer-triggered rules |
| [3.3 Calling External Services](./03-actions/03-external-services.md) | call_service action, registering services, data requirements |

### Part 4: The DSL

Write rules with type-safe, expressive syntax.

| Chapter | Description |
|---------|-------------|
| [4.1 Fluent Builder API](./04-dsl/01-fluent-builder.md) | Rule.create(), chaining triggers, conditions, and actions |
| [4.2 Tagged Template Literals](./04-dsl/02-tagged-templates.md) | Compact rule syntax with the `rule` tagged template |
| [4.3 YAML Rules](./04-dsl/03-yaml-rules.md) | Load rules from YAML strings and files |
| [4.4 Choosing the Right Approach](./04-dsl/04-choosing-approach.md) | Comparison table, decision tree, mixing approaches |

### Part 5: Complex Event Processing

Detect temporal patterns across multiple events.

| Chapter | Description |
|---------|-------------|
| [5.1 What is CEP?](./05-cep/01-what-is-cep.md) | Why individual events aren't enough, temporal reasoning |
| [5.2 Sequence and Absence](./05-cep/02-sequence-and-absence.md) | Detect ordered events and missing events within time windows |
| [5.3 Count and Aggregate](./05-cep/03-count-and-aggregate.md) | Frequency thresholds and numeric aggregation patterns |
| [5.4 CEP Patterns in Practice](./05-cep/04-cep-patterns.md) | Combining patterns, multi-stage detection, performance |

### Part 6: Rule Organization

Structure rules for real-world applications.

| Chapter | Description |
|---------|-------------|
| [6.1 Rule Groups and Tags](./06-organization/01-groups-and-tags.md) | Group lifecycle, feature flags, A/B testing |
| [6.2 Priority and Execution Order](./06-organization/02-priority-and-ordering.md) | Priority semantics, rule chaining, avoiding infinite loops |
| [6.3 Rule Versioning](./06-organization/03-versioning.md) | Version history, diffs, rollback, audit trail |

### Part 7: Persistence and Reliability

Survive restarts and recover from failures.

| Chapter | Description |
|---------|-------------|
| [7.1 Persisting Rules and Facts](./07-persistence/01-state-persistence.md) | StorageAdapter, save/load cycle, restart recovery |
| [7.2 Durable Timers](./07-persistence/02-timer-persistence.md) | Timer persistence config, why durability matters |
| [7.3 Hot Reload](./07-persistence/03-hot-reload.md) | File-based sources, atomic reload, validation before apply |

### Part 8: Observability

Observe, debug, and profile your rule engine.

| Chapter | Description |
|---------|-------------|
| [8.1 Debugging Rules](./08-observability/01-debugging.md) | DebugController, breakpoints, snapshots, tracing |
| [8.2 Profiling Performance](./08-observability/02-profiling.md) | Per-rule timing, trigger counts, hottest rules |
| [8.3 Audit Logging](./08-observability/03-audit-logging.md) | Audit event types, persistence, querying, retention |
| [8.4 Metrics and Tracing](./08-observability/04-metrics.md) | Prometheus metrics, OpenTelemetry, anomaly detection |

### Part 9: Backward Chaining

Query what needs to be true for a goal to hold.

| Chapter | Description |
|---------|-------------|
| [9.1 Forward vs Backward Chaining](./09-backward-chaining/01-forward-vs-backward.md) | Data-driven vs goal-driven evaluation |
| [9.2 Querying Goals](./09-backward-chaining/02-querying-goals.md) | FactGoal, EventGoal, QueryResult, proof trees |

### Part 10: APIs and Integration

Expose the engine over HTTP, SSE, GraphQL, and CLI.

| Chapter | Description |
|---------|-------------|
| [10.1 REST API](./10-apis/01-rest-api.md) | RuleEngineServer, endpoints, Swagger, curl examples |
| [10.2 Real-time Notifications](./10-apis/02-realtime.md) | SSE streaming, webhooks with HMAC signatures |
| [10.3 GraphQL API](./10-apis/03-graphql.md) | Schema, queries, mutations, subscriptions |
| [10.4 Command Line Interface](./10-apis/04-cli.md) | All CLI commands, CI/CD workflows |

### Part 11: Web UI

Manage rules visually.

| Chapter | Description |
|---------|-------------|
| [11.1 Web UI Overview](./11-web-ui/01-getting-started-ui.md) | Dashboard, rule list, fact browser, event emitter |
| [11.2 Visual Rule Builder](./11-web-ui/02-visual-rule-builder.md) | Flow editor, drag-and-drop, code/visual conversion |

### Part 12: Projects

Apply everything in real-world projects.

| Chapter | Description |
|---------|-------------|
| [12.1 E-Commerce Rules System](./12-projects/01-ecommerce.md) | Dynamic pricing, loyalty tiers, abandoned cart detection |
| [12.2 Fraud Detection System](./12-projects/02-fraud-detection.md) | Login anomaly, transaction velocity, risk scoring |
| [12.3 IoT Monitoring Pipeline](./12-projects/03-iot-monitoring.md) | Sensor thresholds, heartbeat monitoring, rolling averages |

## Chapter Format

Each chapter includes:

1. **Introduction** - What you'll learn and why it matters
2. **Theory** - Concept explanation with diagrams and comparison tables
3. **Example** - Complete runnable code with progressive steps
4. **Exercise** - Practical task with solution
5. **Summary** - Key takeaways
6. **Next Steps** - Link to next chapter

## Getting Help

- [API Reference](../../README.md) - Complete API documentation
- [Migration Guide](../migration-to-dsl.md) - Migrating to the DSL

---

Ready to start? Begin with [Why a Rule Engine?](./01-introduction/01-why-rules.md)
