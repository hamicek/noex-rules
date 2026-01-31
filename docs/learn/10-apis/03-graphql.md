# GraphQL API

REST endpoints work well for simple CRUD operations, but sometimes you need more flexibility: fetching a rule together with its group, version history, and recent audit entries — all in one request. The noex-rules GraphQL API lets you request exactly the data you need, with nested field resolution, real-time subscriptions over WebSocket, and an interactive GraphiQL IDE for exploration.

## What You'll Learn

- How GraphQL complements the REST API
- The full query, mutation, and subscription schema
- Fetching nested data in a single request
- Real-time event subscriptions over WebSocket
- Using GraphiQL IDE for exploration and debugging
- When to choose GraphQL vs REST

## Setup

GraphQL is enabled by default when you start the server. The endpoint is registered at the root level (not under the API prefix):

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: {
    graphql: true, // Default — enabled with all features
  },
});

// GraphQL endpoint:  http://localhost:7226/graphql
// GraphiQL IDE:      http://localhost:7226/graphql (in browser)
```

### Configuration

```typescript
const server = await RuleEngineServer.start({
  server: {
    graphql: {
      path: '/graphql',        // Default: '/graphql'
      graphiql: true,          // Default: true — interactive IDE
      subscriptions: true,     // Default: true — WebSocket subscriptions
    },
  },
});
```

To disable GraphQL entirely:

```typescript
const server = await RuleEngineServer.start({
  server: { graphql: false },
});
```

## Queries

Queries are read-only operations. The GraphQL schema exposes all engine data through a typed hierarchy:

### Rules

```graphql
# List all rules
{
  rules {
    id
    name
    priority
    enabled
    tags
    trigger { type topic pattern name }
    conditions { source field operator value }
    actions { type topic key value message }
  }
}

# Get a single rule with nested group and version history
{
  rule(id: "order-alert") {
    id
    name
    enabled
    group {
      id
      name
      enabled
    }
    versions(limit: 5) {
      entries {
        version
        timestamp
        changes
      }
      total
    }
    auditEntries(limit: 3) {
      id
      type
      summary
      timestamp
    }
  }
}
```

The `group`, `versions`, and `auditEntries` fields are **field resolvers** — they load data on demand, only when requested. A query that doesn't ask for versions won't incur the cost of fetching them.

### Facts, Events, and Timers

```graphql
# All facts
{
  facts {
    key
    value
    updatedAt
  }
}

# Query facts by glob pattern
{
  factsQuery(pattern: "customer:c-42:*") {
    key
    value
  }
}

# Single fact
{
  fact(key: "customer:c-42:tier") {
    key
    value
    updatedAt
  }
}

# All active timers
{
  timers {
    name
    expiresAt
    onExpire { topic data }
    repeat { interval maxCount currentCount }
  }
}
```

### Health and Statistics

```graphql
{
  health {
    status
    timestamp
    uptime
    version
    engine { name running }
  }

  stats {
    ruleCount
    factCount
    timerCount
    eventCount
  }
}
```

### Backward Chaining

```graphql
{
  query(goal: {
    type: fact
    key: "customer:c-42:tier"
    operator: eq
    value: "vip"
  }) {
    achievable
    exploredRules
    maxDepthReached
    durationMs
    proof
  }
}
```

### Audit and Versions

```graphql
# Query audit entries with filters
{
  auditEntries(query: {
    category: rule_execution
    ruleId: "order-alert"
    limit: 10
  }) {
    entries {
      id
      timestamp
      type
      summary
      durationMs
      details
    }
    total
  }
}

# Compare two rule versions
{
  ruleVersionDiff(ruleId: "order-alert", fromVersion: 1, toVersion: 3) {
    fromVersion
    toVersion
    changes {
      field
      from
      to
    }
  }
}
```

## Mutations

Mutations modify engine state. They mirror the REST API's write operations:

### Rule Management

```graphql
# Create a rule
mutation {
  createRule(input: {
    id: "new-rule"
    name: "New Rule"
    trigger: { type: event, topic: "order.created" }
    conditions: [{
      source: event
      field: "total"
      operator: gte
      value: 1000
    }]
    actions: [{
      type: emit_event
      topic: "alert.high-value"
      data: { orderId: "${event.orderId}" }
    }]
  }) {
    id
    name
    enabled
    version
  }
}

# Update a rule
mutation {
  updateRule(id: "new-rule", input: {
    priority: 10
    tags: ["orders", "alerts"]
  }) {
    id
    priority
    tags
    version
  }
}

# Delete, enable, disable
mutation { deleteRule(id: "new-rule") }
mutation { enableRule(id: "new-rule") { id enabled } }
mutation { disableRule(id: "new-rule") { id enabled } }

# Rollback to a previous version
mutation {
  rollbackRule(id: "order-alert", version: 2) {
    id
    version
    name
  }
}
```

### Facts and Events

```graphql
# Set a fact
mutation {
  setFact(key: "customer:c-42:tier", value: "vip") {
    key
    value
    updatedAt
  }
}

# Delete a fact
mutation { deleteFact(key: "customer:c-42:tier") }

# Emit an event
mutation {
  emitEvent(input: {
    topic: "order.created"
    data: { orderId: "ord-1", total: 2500 }
  }) {
    id
    topic
    timestamp
  }
}

# Emit a correlated event
mutation {
  emitCorrelatedEvent(input: {
    topic: "payment.completed"
    data: { orderId: "ord-1", amount: 2500 }
    correlationId: "txn-abc"
    causationId: "evt-1"
  }) {
    id
    topic
    correlationId
  }
}
```

### Timers and Groups

```graphql
# Create a timer
mutation {
  createTimer(input: {
    name: "payment-timeout"
    duration: "30m"
    onExpire: { topic: "payment.timeout", data: { orderId: "ord-1" } }
  }) {
    name
    expiresAt
  }
}

# Cancel a timer
mutation { cancelTimer(name: "payment-timeout") }

# Create a group
mutation {
  createGroup(input: {
    id: "fraud-rules"
    name: "Fraud Detection Rules"
    description: "All rules related to fraud detection"
    enabled: true
  }) {
    id
    name
    enabled
  }
}
```

## Subscriptions

Subscriptions deliver events in real time over WebSocket. They're the GraphQL equivalent of SSE:

### Engine Events

```graphql
# Subscribe to all events
subscription {
  engineEvent {
    id
    topic
    data
    timestamp
    correlationId
    source
  }
}

# Subscribe with topic filtering
subscription {
  engineEvent(patterns: ["order.*", "payment.*"]) {
    id
    topic
    data
    timestamp
  }
}
```

### Audit Events

```graphql
# Subscribe to rule execution audit events
subscription {
  auditEvent(categories: [rule_execution]) {
    id
    timestamp
    type
    summary
    ruleId
    ruleName
    durationMs
    details
  }
}

# Filter by specific event types and rules
subscription {
  auditEvent(
    types: [rule_executed, rule_failed]
    ruleIds: ["order-alert", "fraud-check"]
  ) {
    id
    type
    summary
    ruleId
  }
}
```

### Using Subscriptions from JavaScript

The server uses Mercurius (Fastify's GraphQL plugin) with WebSocket transport. Any GraphQL client with subscription support works:

```typescript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:7226/graphql',
});

// Subscribe to order events
const unsubscribe = client.subscribe(
  {
    query: `
      subscription {
        engineEvent(patterns: ["order.*"]) {
          id
          topic
          data
          timestamp
        }
      }
    `,
  },
  {
    next: (result) => {
      const event = result.data?.engineEvent;
      console.log(`[${event.topic}]`, event.data);
    },
    error: (err) => console.error('Subscription error:', err),
    complete: () => console.log('Subscription closed'),
  }
);

// Later: unsubscribe to close the WebSocket
// unsubscribe();
```

## GraphiQL IDE

When `graphiql: true` (default), opening `http://localhost:7226/graphql` in a browser shows the GraphiQL interactive IDE:

```text
  ┌──────────────────────────────────────────────────┐
  │  GraphiQL                                         │
  ├─────────────────────┬────────────────────────────┤
  │  Query Editor       │  Result Panel              │
  │                     │                            │
  │  {                  │  {                         │
  │    rules {          │    "data": {               │
  │      id             │      "rules": [            │
  │      name           │        { "id": "...", ... }│
  │      enabled        │      ]                     │
  │    }                │    }                       │
  │  }                  │  }                         │
  │                     │                            │
  ├─────────────────────┴────────────────────────────┤
  │  Documentation Explorer  │  Schema auto-complete  │
  └──────────────────────────────────────────────────┘
```

Features:
- Auto-complete for queries, mutations, and subscriptions
- Documentation explorer showing all types and fields
- Query history
- Variable editor for parameterized queries

## REST vs GraphQL

| Aspect | REST | GraphQL |
|--------|------|---------|
| **Endpoints** | One per resource (many URLs) | Single endpoint (`/graphql`) |
| **Data shape** | Fixed response structure | Client chooses fields |
| **Nested data** | Multiple requests needed | Single request with nesting |
| **Subscriptions** | SSE (separate endpoint) | Built-in over WebSocket |
| **Documentation** | Swagger/OpenAPI | Introspectable schema + GraphiQL |
| **Caching** | HTTP cache (ETags, Cache-Control) | Requires client-side cache |
| **Tooling** | curl, Postman, any HTTP client | GraphQL clients (Apollo, urql, graphql-ws) |
| **Best for** | Simple CRUD, external APIs | Dashboards, complex queries, real-time |

Both APIs are active simultaneously. Use REST for simple operations and external integrations, GraphQL for dashboards and complex data needs.

## Exercise

1. Start a server with GraphQL enabled (default)
2. Open GraphiQL at `http://localhost:7226/graphql` in your browser
3. Create a rule using a GraphQL mutation that fires on `order.created` events
4. Using a single GraphQL query, fetch all rules including their trigger details and tags
5. Emit an `order.created` event via a mutation
6. Query the engine's health and stats in a single request

<details>
<summary>Solution</summary>

Start the server:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start();
console.log(`GraphiQL: ${server.address}/graphql`);
```

Create a rule (paste into GraphiQL):

```graphql
mutation {
  createRule(input: {
    id: "order-tracker"
    name: "Order Tracker"
    trigger: { type: event, topic: "order.created" }
    actions: [{
      type: set_fact
      key: "order:${event.orderId}:status"
      value: "pending"
    }]
  }) {
    id
    name
    enabled
    version
  }
}
```

Fetch all rules:

```graphql
{
  rules {
    id
    name
    priority
    enabled
    tags
    trigger {
      type
      topic
      pattern
      name
    }
  }
}
```

Emit an event:

```graphql
mutation {
  emitEvent(input: {
    topic: "order.created"
    data: { orderId: "ord-1", total: 150 }
  }) {
    id
    topic
    timestamp
  }
}
```

Health and stats in one query:

```graphql
{
  health {
    status
    uptime
    version
    engine { name running }
  }
  stats {
    ruleCount
    factCount
    timerCount
    eventCount
  }
}
```

</details>

## Summary

- GraphQL runs alongside REST on the same server, default endpoint `/graphql`
- Queries let you fetch exactly the fields you need — including nested `group`, `versions`, and `auditEntries`
- Mutations mirror REST write operations: create/update/delete rules, emit events, set facts, manage timers
- Subscriptions deliver real-time events over WebSocket — equivalent to SSE but with topic filtering and typed payloads
- GraphiQL IDE provides auto-complete, documentation explorer, and interactive query execution
- The schema is built from `.graphql` files and uses Mercurius (Fastify GraphQL plugin) with WebSocket subscription support
- Use REST for simple operations and external APIs; use GraphQL for dashboards and complex queries that need nested data

---

Next: [Command Line Interface](./04-cli.md)
