# API Reference

Complete API reference for `@hamicek/noex-rules`. Every class, method, type, and configuration option documented with signatures and examples.

> **Learning first?** See the [Learning Guide](../learn/index.md) for tutorials and concepts.

## Core Components

| Module | Description |
|--------|-------------|
| [RuleEngine](./01-rule-engine.md) | Main orchestrator — start, configure, and control the engine |
| [FactStore](./02-fact-store.md) | Manage facts — set, get, delete, pattern matching |
| [EventStore](./03-event-store.md) | Store and query events by topic, correlation, time range |
| [TimerManager](./04-timer-manager.md) | Schedule and cancel timers, duration parsing |
| [RuleManager](./05-rule-manager.md) | Register, enable, disable, and query rules |
| [TemporalProcessor](./06-temporal-processor.md) | CEP pattern matching — sequence, absence, count, aggregate |

## Evaluation

| Module | Description |
|--------|-------------|
| [ConditionEvaluator](./07-condition-evaluator.md) | Evaluate conditions with all operators and source types |
| [ActionExecutor](./08-action-executor.md) | Execute actions — emit, set_fact, call_service, and more |

## DSL (Domain Specific Language)

| Module | Description |
|--------|-------------|
| [Fluent Builder](./09-dsl-builder.md) | `Rule.create()` — type-safe rule construction |
| [Triggers](./10-dsl-triggers.md) | `onEvent()`, `onFact()`, `onTimer()`, temporal patterns |
| [Conditions](./11-dsl-conditions.md) | `event()`, `fact()`, `context()`, `lookup()`, `baseline()` |
| [Actions](./12-dsl-actions.md) | `emit()`, `setFact()`, `setTimer()`, `callService()`, `conditional()` |
| [Tagged Templates](./13-dsl-tagged-templates.md) | `rule` tagged template literal syntax |
| [YAML Loader](./14-dsl-yaml.md) | Load rules, groups, goals, templates from YAML |
| [Rule Templates](./15-dsl-templates.md) | `RuleTemplate.create()` — parameterized rule blueprints |
| [Goal Builders](./16-dsl-goals.md) | `factGoal()`, `eventGoal()` for backward chaining |

## Infrastructure

| Module | Description |
|--------|-------------|
| [Validation](./17-validation.md) | `RuleInputValidator`, operators, constants |
| [Persistence](./18-persistence.md) | `RulePersistence`, StorageAdapter |
| [Versioning](./19-versioning.md) | `RuleVersionStore` — history, diff, rollback |
| [Audit](./20-audit.md) | `AuditLogService` — record, query, export |
| [Observability](./21-observability.md) | `MetricsCollector`, `OpenTelemetryBridge` |
| [Baseline](./22-baseline.md) | `BaselineStore` — anomaly detection |
| [Backward Chaining](./23-backward-chaining.md) | `BackwardChainer` — goal-driven queries |
| [Hot Reload](./24-hot-reload.md) | `HotReloadWatcher` — live rule updates |

## APIs

| Module | Description |
|--------|-------------|
| [REST API](./25-rest-api.md) | All HTTP endpoints with request/response schemas |
| [GraphQL API](./26-graphql-api.md) | Schema, queries, mutations, subscriptions |
| [CLI](./27-cli.md) | Command reference — validate, import, export, test |
| [Server](./28-server.md) | `RuleEngineServer` — HTTP server setup |

## Reference Tables

| Module | Description |
|--------|-------------|
| [Types](./29-types.md) | All exported types and interfaces |
| [Configuration](./30-configuration.md) | All configuration options with defaults |
| [Utilities](./31-utilities.md) | Helper functions — `generateId`, `parseDuration`, `interpolate` |
| [Errors](./32-errors.md) | Error classes and codes |

## Quick Links

```typescript
import {
  RuleEngine,
  Rule,
  onEvent,
  onFact,
  emit,
  setFact,
  event,
  fact,
  loadRulesFromYAML,
  RuleEngineServer,
} from '@hamicek/noex-rules';
```

### Start an Engine

```typescript
const engine = await RuleEngine.start();
```

### Register a Rule

```typescript
engine.registerRule(
  Rule.create('welcome-user')
    .when(onEvent('user:registered'))
    .then(emit('notification:send', { type: 'welcome' }))
    .build()
);
```

### Emit an Event

```typescript
engine.emit('user:registered', { userId: '123', email: 'user@example.com' });
```

### Start an HTTP Server

```typescript
const server = await RuleEngineServer.start({ port: 3000 });
```

---

Looking for tutorials? Start with the [Learning Guide](../learn/index.md).
