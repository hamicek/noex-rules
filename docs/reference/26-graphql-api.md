# GraphQL API

GraphQL API for querying and mutating rules, facts, events, timers, and engine state. Uses [Mercurius](https://mercurius.dev/) on Fastify with WebSocket subscriptions.

## Endpoint

```
POST http://localhost:7226/graphql
GET  http://localhost:7226/graphql (GraphiQL IDE when enabled)
WS   ws://localhost:7226/graphql   (Subscriptions)
```

Default port is `7226`. The endpoint path is configurable via `GraphQLConfig.path`.

---

## Configuration

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  graphql: {
    graphiql: true,        // Enable GraphiQL IDE (default: true)
    path: '/graphql',      // Endpoint path (default: '/graphql')
    subscriptions: true,   // Enable WebSocket subscriptions (default: true)
  },
});
```

Disable GraphQL entirely:

```typescript
const server = await RuleEngineServer.start({
  graphql: false,
});
```

---

## Scalars

| Scalar | Description |
|--------|-------------|
| `JSON` | Arbitrary JSON value for dynamic/polymorphic data |
| `Timestamp` | Unix timestamp in milliseconds |
| `ID` | Unique identifier string |

---

## Queries

### Rules

#### rules

Returns all registered rules.

```graphql
query {
  rules {
    id
    name
    enabled
    priority
    tags
  }
}
```

#### rule

Returns a single rule by ID.

```graphql
query {
  rule(id: "my-rule") {
    id
    name
    trigger {
      type
      topic
    }
    conditions {
      source { type field }
      operator
      value
    }
    actions {
      type
      topic
      data
    }
  }
}
```

---

### Groups

#### groups

Returns all rule groups.

```graphql
query {
  groups {
    id
    name
    enabled
    rulesCount
  }
}
```

#### group

Returns a single group with its rules.

```graphql
query {
  group(id: "fraud-detection") {
    id
    name
    rules {
      id
      name
    }
  }
}
```

---

### Facts

#### facts

Returns all facts in working memory.

```graphql
query {
  facts {
    key
    value
    timestamp
    source
  }
}
```

#### fact

Returns a single fact by key.

```graphql
query {
  fact(key: "user:123:status") {
    key
    value
    version
  }
}
```

#### factsQuery

Queries facts by glob pattern.

```graphql
query {
  factsQuery(pattern: "user:*:status") {
    key
    value
  }
}
```

---

### Timers

#### timers

Returns all active timers.

```graphql
query {
  timers {
    id
    name
    expiresAt
    onExpire {
      topic
      data
    }
    repeat {
      interval
      maxCount
    }
  }
}
```

#### timer

Returns a single timer by name.

```graphql
query {
  timer(name: "session-timeout") {
    name
    expiresAt
  }
}
```

---

### Audit

#### auditEntries

Queries audit log entries with filters and pagination.

```graphql
query {
  auditEntries(query: {
    category: rule_execution
    limit: 50
    offset: 0
  }) {
    entries {
      id
      timestamp
      category
      type
      summary
      ruleId
      durationMs
    }
    totalCount
    hasMore
  }
}
```

**Input: AuditQueryInput**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| category | `AuditCategory` | — | Filter by category |
| types | `[AuditEventType!]` | — | Filter by event types |
| ruleId | `String` | — | Filter by rule ID |
| source | `String` | — | Filter by source |
| correlationId | `String` | — | Filter by correlation ID |
| from | `Timestamp` | — | Start timestamp (inclusive) |
| to | `Timestamp` | — | End timestamp (inclusive) |
| limit | `Int` | 100 | Max entries |
| offset | `Int` | 0 | Pagination offset |

---

### Versioning

#### ruleVersions

Returns version history for a rule.

```graphql
query {
  ruleVersions(ruleId: "my-rule", query: { limit: 10 }) {
    entries {
      version
      timestamp
      changeType
      ruleSnapshot {
        name
        enabled
      }
    }
    totalVersions
    hasMore
  }
}
```

#### ruleVersion

Returns a specific version snapshot.

```graphql
query {
  ruleVersion(ruleId: "my-rule", version: 3) {
    version
    timestamp
    changeType
    ruleSnapshot {
      id
      name
      trigger { type topic }
    }
  }
}
```

#### ruleVersionDiff

Compares two versions field-by-field.

```graphql
query {
  ruleVersionDiff(ruleId: "my-rule", fromVersion: 1, toVersion: 3) {
    ruleId
    fromVersion
    toVersion
    changes {
      field
      oldValue
      newValue
    }
  }
}
```

---

### Backward Chaining

#### query

Executes a backward chaining query to determine goal achievability.

```graphql
query {
  query(goal: { type: fact, key: "order:status", value: "shipped" }) {
    achievable
    exploredRules
    durationMs
    proof {
      ... on FactExistsNode {
        type
        key
        currentValue
        satisfied
      }
      ... on RuleProofNode {
        type
        ruleId
        ruleName
        satisfied
        conditions {
          source
          operator
          satisfied
        }
      }
      ... on UnachievableNode {
        type
        reason
        details
      }
    }
  }
}
```

**Input: GoalInput**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `GoalType!` | yes | `fact` or `event` |
| key | `String` | fact | Fact key pattern |
| value | `JSON` | — | Expected value (omit for existence check) |
| operator | `GoalOperator` | — | Comparison: eq, neq, gt, gte, lt, lte |
| topic | `String` | event | Event topic |

---

### Engine

#### health

Health check endpoint.

```graphql
query {
  health {
    status
    timestamp
    uptime
    version
    engine {
      name
      running
    }
  }
}
```

#### stats

Aggregate engine statistics.

```graphql
query {
  stats {
    rulesCount
    factsCount
    timersCount
    eventsProcessed
    rulesExecuted
    avgProcessingTimeMs
    tracing {
      enabled
      entriesCount
    }
    audit {
      totalEntries
      subscribersCount
    }
  }
}
```

#### tracingStatus

Current tracing subsystem status.

```graphql
query {
  tracingStatus {
    enabled
    entriesCount
    maxEntries
  }
}
```

---

## Mutations

### Rules

#### createRule

Registers a new rule.

```graphql
mutation {
  createRule(input: {
    id: "welcome-user"
    name: "Welcome User"
    trigger: { type: event, topic: "user.registered" }
    actions: [
      { type: emit_event, topic: "email.send", data: { template: "welcome" } }
    ]
  }) {
    id
    name
    version
  }
}
```

#### updateRule

Updates an existing rule (partial update).

```graphql
mutation {
  updateRule(id: "welcome-user", input: {
    priority: 10
    tags: ["onboarding", "email"]
  }) {
    id
    priority
    tags
    version
  }
}
```

#### deleteRule

Deletes a rule.

```graphql
mutation {
  deleteRule(id: "welcome-user")
}
```

#### enableRule / disableRule

Enables or disables a rule.

```graphql
mutation {
  enableRule(id: "welcome-user") {
    id
    enabled
  }
}

mutation {
  disableRule(id: "welcome-user") {
    id
    enabled
  }
}
```

#### rollbackRule

Rolls back a rule to a previous version.

```graphql
mutation {
  rollbackRule(id: "my-rule", version: 2) {
    id
    version
    name
  }
}
```

---

### Groups

#### createGroup

Creates a new rule group.

```graphql
mutation {
  createGroup(input: {
    id: "fraud-detection"
    name: "Fraud Detection Rules"
    description: "Rules for detecting fraudulent transactions"
  }) {
    id
    name
  }
}
```

#### updateGroup

Updates a group.

```graphql
mutation {
  updateGroup(id: "fraud-detection", input: {
    description: "Updated description"
  }) {
    id
    description
  }
}
```

#### deleteGroup

Deletes a group.

```graphql
mutation {
  deleteGroup(id: "fraud-detection")
}
```

#### enableGroup / disableGroup

Enables or disables a group and all its rules.

```graphql
mutation {
  enableGroup(id: "fraud-detection") {
    id
    enabled
    rulesCount
  }
}
```

---

### Facts

#### setFact

Sets a fact value (creates or updates).

```graphql
mutation {
  setFact(key: "user:123:status", value: "active") {
    key
    value
    version
    timestamp
  }
}
```

#### deleteFact

Deletes a fact.

```graphql
mutation {
  deleteFact(key: "user:123:status")
}
```

---

### Events

#### emitEvent

Emits an event into the engine.

```graphql
mutation {
  emitEvent(input: {
    topic: "order.placed"
    data: { orderId: "12345", amount: 99.99 }
  }) {
    id
    topic
    timestamp
  }
}
```

#### emitCorrelatedEvent

Emits an event with correlation tracking.

```graphql
mutation {
  emitCorrelatedEvent(input: {
    topic: "payment.completed"
    data: { orderId: "12345" }
    correlationId: "txn-abc-123"
    causationId: "evt-xyz-789"
  }) {
    id
    topic
    correlationId
    causationId
  }
}
```

---

### Timers

#### createTimer

Creates a new timer.

```graphql
mutation {
  createTimer(input: {
    name: "session-timeout"
    duration: "30m"
    onExpire: {
      topic: "session.expired"
      data: { userId: "123" }
    }
  }) {
    id
    name
    expiresAt
  }
}
```

With repeat configuration:

```graphql
mutation {
  createTimer(input: {
    name: "heartbeat"
    duration: "1m"
    onExpire: { topic: "system.heartbeat" }
    repeat: {
      interval: "1m"
      maxCount: 60
    }
  }) {
    id
    name
    repeat {
      interval
      maxCount
    }
  }
}
```

#### cancelTimer

Cancels an active timer.

```graphql
mutation {
  cancelTimer(name: "session-timeout")
}
```

---

### Debug

#### enableTracing / disableTracing

Enables or disables debug tracing.

```graphql
mutation {
  enableTracing {
    enabled
    entriesCount
    maxEntries
  }
}

mutation {
  disableTracing {
    enabled
  }
}
```

---

## Subscriptions

WebSocket subscriptions for real-time updates. Requires `subscriptions: true` in config.

### engineEvent

Subscribe to engine events matching topic patterns.

```graphql
subscription {
  engineEvent(patterns: ["order.*", "payment.*"]) {
    id
    topic
    data
    timestamp
    correlationId
  }
}
```

**Arguments:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| patterns | `[String!]` | `["*"]` | Topic patterns (supports wildcards) |

### auditEvent

Subscribe to real-time audit log entries.

```graphql
subscription {
  auditEvent(
    categories: [rule_execution]
    ruleIds: ["my-rule"]
  ) {
    id
    timestamp
    category
    type
    summary
    ruleId
    durationMs
  }
}
```

**Arguments:**

| Name | Type | Description |
|------|------|-------------|
| categories | `[AuditCategory!]` | Filter by categories |
| types | `[AuditEventType!]` | Filter by event types |
| ruleIds | `[String!]` | Filter by rule IDs |

---

## Enums

### TriggerType

```graphql
enum TriggerType {
  fact
  event
  timer
  temporal
}
```

### ActionType

```graphql
enum ActionType {
  set_fact
  delete_fact
  emit_event
  set_timer
  cancel_timer
  call_service
  log
  conditional
}
```

### ConditionOperator

```graphql
enum ConditionOperator {
  eq
  neq
  gt
  gte
  lt
  lte
  in
  not_in
  contains
  not_contains
  matches
  exists
  not_exists
}
```

### ConditionSourceType

```graphql
enum ConditionSourceType {
  fact
  event
  context
  lookup
  baseline
}
```

### AuditCategory

```graphql
enum AuditCategory {
  rule_management
  rule_execution
  fact_change
  event_emitted
  system
}
```

### AuditEventType

```graphql
enum AuditEventType {
  rule_registered
  rule_unregistered
  rule_enabled
  rule_disabled
  rule_rolled_back
  rule_executed
  rule_skipped
  rule_failed
  group_created
  group_updated
  group_deleted
  group_enabled
  group_disabled
  fact_created
  fact_updated
  fact_deleted
  event_emitted
  engine_started
  engine_stopped
  hot_reload_started
  hot_reload_completed
  hot_reload_failed
  baseline_registered
  baseline_recalculated
  baseline_anomaly_detected
  backward_query_started
  backward_query_completed
}
```

### RuleChangeType

```graphql
enum RuleChangeType {
  registered
  updated
  enabled
  disabled
  unregistered
  rolled_back
}
```

### GoalType

```graphql
enum GoalType {
  fact
  event
}
```

### TemporalPatternType

```graphql
enum TemporalPatternType {
  sequence
  absence
  count
  aggregate
}
```

---

## Error Handling

GraphQL errors follow the standard GraphQL error format:

```json
{
  "errors": [
    {
      "message": "Rule 'my-rule' not found",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["rule"],
      "extensions": {
        "code": "NOT_FOUND",
        "statusCode": 404
      }
    }
  ]
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource already exists |
| `VALIDATION_ERROR` | Input validation failed |
| `SERVICE_UNAVAILABLE` | Required service not configured |

---

## Introspection

Query the schema:

```graphql
query {
  __schema {
    types {
      name
      kind
    }
  }
}
```

Get type details:

```graphql
query {
  __type(name: "Rule") {
    name
    fields {
      name
      type {
        name
        kind
      }
    }
  }
}
```

---

## Client Examples

### JavaScript (graphql-request)

```typescript
import { GraphQLClient, gql } from 'graphql-request';

const client = new GraphQLClient('http://localhost:7226/graphql');

// Query rules
const { rules } = await client.request(gql`
  query {
    rules {
      id
      name
      enabled
    }
  }
`);

// Create a rule
const { createRule } = await client.request(gql`
  mutation CreateRule($input: CreateRuleInput!) {
    createRule(input: $input) {
      id
      version
    }
  }
`, {
  input: {
    id: 'my-rule',
    name: 'My Rule',
    trigger: { type: 'event', topic: 'user.created' },
    actions: [{ type: 'emit_event', topic: 'welcome.send' }],
  },
});
```

### Subscriptions (graphql-ws)

```typescript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:7226/graphql',
});

const unsubscribe = client.subscribe(
  {
    query: `subscription { engineEvent(patterns: ["*"]) { topic data } }`,
  },
  {
    next: (data) => console.log('Event:', data),
    error: (err) => console.error('Error:', err),
    complete: () => console.log('Subscription closed'),
  },
);
```

### curl

```bash
# Query
curl -X POST http://localhost:7226/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ rules { id name } }"}'

# Mutation
curl -X POST http://localhost:7226/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { setFact(key: \"test\", value: 42) { key value } }"
  }'
```

---

## See Also

- [REST API](./25-rest-api.md) — REST alternative
- [Server](./28-server.md) — Server configuration
- [Audit](./20-audit.md) — Audit logging
- [Versioning](./19-versioning.md) — Rule versioning
- [Backward Chaining](./23-backward-chaining.md) — Goal-driven queries
