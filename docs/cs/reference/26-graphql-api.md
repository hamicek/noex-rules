# GraphQL API

GraphQL API pro dotazování a mutace pravidel, faktů, událostí, časovačů a stavu engine. Využívá [Mercurius](https://mercurius.dev/) na Fastify s WebSocket subscriptions.

## Endpoint

```
POST http://localhost:7226/graphql
GET  http://localhost:7226/graphql (GraphiQL IDE pokud je povoleno)
WS   ws://localhost:7226/graphql   (Subscriptions)
```

Výchozí port je `7226`. Cesta endpointu je konfigurovatelná přes `GraphQLConfig.path`.

---

## Konfigurace

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  graphql: {
    graphiql: true,        // Povolit GraphiQL IDE (výchozí: true)
    path: '/graphql',      // Cesta endpointu (výchozí: '/graphql')
    subscriptions: true,   // Povolit WebSocket subscriptions (výchozí: true)
  },
});
```

Vypnutí GraphQL:

```typescript
const server = await RuleEngineServer.start({
  graphql: false,
});
```

---

## Scalars

| Scalar | Popis |
|--------|-------|
| `JSON` | Libovolná JSON hodnota pro dynamická/polymorfní data |
| `Timestamp` | Unix timestamp v milisekundách |
| `ID` | Unikátní identifikátor (string) |

---

## Queries

### Rules

#### rules

Vrátí všechna registrovaná pravidla.

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

Vrátí pravidlo podle ID.

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

Vrátí všechny skupiny pravidel.

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

Vrátí skupinu včetně jejích pravidel.

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

Vrátí všechna fakta v pracovní paměti.

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

Vrátí fakt podle klíče.

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

Dotazuje fakta podle glob patternu.

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

Vrátí všechny aktivní časovače.

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

Vrátí časovač podle jména.

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

Dotazuje záznamy audit logu s filtry a stránkováním.

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

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| category | `AuditCategory` | — | Filtr podle kategorie |
| types | `[AuditEventType!]` | — | Filtr podle typů událostí |
| ruleId | `String` | — | Filtr podle ID pravidla |
| source | `String` | — | Filtr podle zdroje |
| correlationId | `String` | — | Filtr podle correlation ID |
| from | `Timestamp` | — | Počáteční timestamp (včetně) |
| to | `Timestamp` | — | Koncový timestamp (včetně) |
| limit | `Int` | 100 | Max počet záznamů |
| offset | `Int` | 0 | Offset pro stránkování |

---

### Versioning

#### ruleVersions

Vrátí historii verzí pravidla.

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

Vrátí konkrétní verzi pravidla.

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

Porovná dvě verze pravidla pole po poli.

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

Provede backward chaining dotaz pro určení dosažitelnosti cíle.

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

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| type | `GoalType!` | ano | `fact` nebo `event` |
| key | `String` | fact | Klíč faktu |
| value | `JSON` | — | Očekávaná hodnota (vynechte pro kontrolu existence) |
| operator | `GoalOperator` | — | Porovnání: eq, neq, gt, gte, lt, lte |
| topic | `String` | event | Topic události |

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

Agregované statistiky engine.

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

Aktuální stav tracing subsystému.

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

Registruje nové pravidlo.

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

Aktualizuje existující pravidlo (částečná aktualizace).

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

Smaže pravidlo.

```graphql
mutation {
  deleteRule(id: "welcome-user")
}
```

#### enableRule / disableRule

Povolí nebo zakáže pravidlo.

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

Vrátí pravidlo na předchozí verzi.

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

Vytvoří novou skupinu pravidel.

```graphql
mutation {
  createGroup(input: {
    id: "fraud-detection"
    name: "Fraud Detection Rules"
    description: "Pravidla pro detekci podvodných transakcí"
  }) {
    id
    name
  }
}
```

#### updateGroup

Aktualizuje skupinu.

```graphql
mutation {
  updateGroup(id: "fraud-detection", input: {
    description: "Aktualizovaný popis"
  }) {
    id
    description
  }
}
```

#### deleteGroup

Smaže skupinu.

```graphql
mutation {
  deleteGroup(id: "fraud-detection")
}
```

#### enableGroup / disableGroup

Povolí nebo zakáže skupinu a všechna její pravidla.

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

Nastaví hodnotu faktu (vytvoří nebo aktualizuje).

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

Smaže fakt.

```graphql
mutation {
  deleteFact(key: "user:123:status")
}
```

---

### Events

#### emitEvent

Emituje událost do engine.

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

Emituje událost s korelačním sledováním.

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

Vytvoří nový časovač.

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

S opakováním:

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

Zruší aktivní časovač.

```graphql
mutation {
  cancelTimer(name: "session-timeout")
}
```

---

### Debug

#### enableTracing / disableTracing

Povolí nebo zakáže debug tracing.

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

WebSocket subscriptions pro real-time aktualizace. Vyžaduje `subscriptions: true` v konfiguraci.

### engineEvent

Odběr událostí engine podle topic patterns.

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

**Argumenty:**

| Název | Typ | Výchozí | Popis |
|-------|-----|---------|-------|
| patterns | `[String!]` | `["*"]` | Topic patterns (podporuje wildcards) |

### auditEvent

Odběr real-time záznamů audit logu.

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

**Argumenty:**

| Název | Typ | Popis |
|-------|-----|-------|
| categories | `[AuditCategory!]` | Filtr podle kategorií |
| types | `[AuditEventType!]` | Filtr podle typů událostí |
| ruleIds | `[String!]` | Filtr podle ID pravidel |

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

## Zpracování chyb

GraphQL chyby následují standardní GraphQL formát:

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

### Chybové kódy

| Kód | Popis |
|-----|-------|
| `NOT_FOUND` | Zdroj nenalezen |
| `CONFLICT` | Zdroj již existuje |
| `VALIDATION_ERROR` | Validace vstupu selhala |
| `SERVICE_UNAVAILABLE` | Požadovaná služba není nakonfigurována |

---

## Introspekce

Dotaz na schéma:

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

Detail typu:

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

## Příklady klientů

### JavaScript (graphql-request)

```typescript
import { GraphQLClient, gql } from 'graphql-request';

const client = new GraphQLClient('http://localhost:7226/graphql');

// Dotaz na pravidla
const { rules } = await client.request(gql`
  query {
    rules {
      id
      name
      enabled
    }
  }
`);

// Vytvoření pravidla
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

## Viz také

- [REST API](./25-rest-api.md) — REST alternativa
- [Server](./28-server.md) — Konfigurace serveru
- [Audit](./20-audit.md) — Audit logging
- [Versioning](./19-versioning.md) — Verzování pravidel
- [Backward Chaining](./23-backward-chaining.md) — Dotazy orientované na cíle
