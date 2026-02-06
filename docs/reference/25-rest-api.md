# REST API

HTTP REST API for managing rules, facts, events, timers, and other engine resources. The API follows RESTful conventions with JSON request/response bodies.

## Base URL

```
http://localhost:7226/api/v1
```

Default port is `7226`. The `/api/v1` prefix is configurable via `ServerConfig.apiPrefix`.

---

## Authentication

The REST API does not include built-in authentication. Implement authentication via:
- Reverse proxy (nginx, Traefik)
- Custom Fastify plugin
- API gateway

---

## Error Response Format

All errors follow a consistent format:

```typescript
interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}
```

**Example:**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Rule 'my-rule' not found",
  "code": "NOT_FOUND"
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `BAD_REQUEST` | 400 | Invalid request |
| `INVALID_JSON` | 400 | Malformed JSON body |
| `SERVICE_UNAVAILABLE` | 503 | Required service not configured |

---

## Rules

### GET /rules

Returns all registered rules.

**Response:** `200 OK`

```typescript
Rule[]
```

**Example:**

```bash
curl http://localhost:7226/api/v1/rules
```

---

### GET /rules/:id

Returns a single rule by ID.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| id | path | `string` | yes | Rule ID |

**Response:** `200 OK`

```typescript
Rule
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Rule not found |

**Example:**

```bash
curl http://localhost:7226/api/v1/rules/my-rule
```

---

### POST /rules

Creates a new rule.

**Request Body:**

```typescript
interface CreateRuleBody {
  id: string;
  name?: string;
  description?: string;
  priority?: number;        // default: 0
  enabled?: boolean;        // default: true
  tags?: string[];
  group?: string;
  trigger: Trigger;
  conditions?: Condition[];
  actions: Action[];
}
```

**Response:** `201 Created`

```typescript
Rule
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid rule definition |
| 409 | `CONFLICT` | Rule with this ID already exists |

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "user-welcome",
    "trigger": { "type": "event", "topic": "user.created" },
    "actions": [{ "type": "emit_event", "topic": "email.send", "payload": { "template": "welcome" } }]
  }'
```

---

### POST /rules/validate

Validates a rule definition without registering it.

**Request Body:** Same as `POST /rules`

**Response:** `200 OK`

```typescript
interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/rules/validate \
  -H "Content-Type: application/json" \
  -d '{ "id": "test", "trigger": { "type": "event" } }'
```

---

### PUT /rules/:id

Updates an existing rule.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| id | path | `string` | yes | Rule ID |

**Request Body:**

```typescript
interface UpdateRuleBody {
  name?: string;
  description?: string;
  priority?: number;
  enabled?: boolean;
  tags?: string[];
  group?: string;
  trigger?: Trigger;
  conditions?: Condition[];
  actions?: Action[];
}
```

**Response:** `200 OK`

```typescript
Rule
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Rule not found |

**Example:**

```bash
curl -X PUT http://localhost:7226/api/v1/rules/my-rule \
  -H "Content-Type: application/json" \
  -d '{ "priority": 10 }'
```

---

### DELETE /rules/:id

Deletes a rule.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| id | path | `string` | yes | Rule ID |

**Response:** `204 No Content`

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 404 | `NOT_FOUND` | Rule not found |

**Example:**

```bash
curl -X DELETE http://localhost:7226/api/v1/rules/my-rule
```

---

### POST /rules/:id/enable

Enables a disabled rule.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| id | path | `string` | yes | Rule ID |

**Response:** `200 OK`

```typescript
Rule
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/rules/my-rule/enable
```

---

### POST /rules/:id/disable

Disables a rule.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| id | path | `string` | yes | Rule ID |

**Response:** `200 OK`

```typescript
Rule
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/rules/my-rule/disable
```

---

## Groups

### GET /groups

Returns all rule groups.

**Response:** `200 OK`

```typescript
RuleGroup[]
```

---

### GET /groups/:id

Returns a single group by ID.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| id | path | `string` | yes | Group ID |

**Response:** `200 OK`

```typescript
RuleGroup
```

---

### POST /groups

Creates a new rule group.

**Request Body:**

```typescript
interface CreateGroupBody {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;  // default: true
}
```

**Response:** `201 Created`

```typescript
RuleGroup
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| 409 | `CONFLICT` | Group with this ID already exists |

---

### PUT /groups/:id

Updates an existing group.

**Request Body:**

```typescript
interface UpdateGroupBody {
  name?: string;
  description?: string;
  enabled?: boolean;
}
```

**Response:** `200 OK`

```typescript
RuleGroup
```

---

### DELETE /groups/:id

Deletes a group.

**Response:** `204 No Content`

---

### POST /groups/:id/enable

Enables a group and all its rules.

**Response:** `200 OK`

```typescript
RuleGroup
```

---

### POST /groups/:id/disable

Disables a group and all its rules.

**Response:** `200 OK`

```typescript
RuleGroup
```

---

### GET /groups/:id/rules

Returns all rules in a group.

**Response:** `200 OK`

```typescript
Rule[]
```

---

## Facts

### GET /facts

Returns all facts.

**Response:** `200 OK`

```typescript
Fact[]
```

---

### GET /facts/:key

Returns a single fact by key.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| key | path | `string` | yes | Fact key |

**Response:** `200 OK`

```typescript
interface Fact {
  key: string;
  value: unknown;
  updatedAt: number;
}
```

---

### PUT /facts/:key

Sets a fact value. Creates the fact if it doesn't exist.

**Request Body:**

```typescript
interface SetFactBody {
  value: unknown;
}
```

**Response:** `200 OK` (updated) or `201 Created` (new)

```typescript
Fact
```

**Example:**

```bash
curl -X PUT http://localhost:7226/api/v1/facts/user:123:status \
  -H "Content-Type: application/json" \
  -d '{ "value": "active" }'
```

---

### DELETE /facts/:key

Deletes a fact.

**Response:** `204 No Content`

---

### POST /facts/query

Queries facts by pattern. Supports wildcard `*`.

**Request Body:**

```typescript
interface QueryFactsBody {
  pattern: string;
}
```

**Response:** `200 OK`

```typescript
Fact[]
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/facts/query \
  -H "Content-Type: application/json" \
  -d '{ "pattern": "user:*:status" }'
```

---

## Events

### POST /events

Emits an event to the engine.

**Request Body:**

```typescript
interface EmitEventBody {
  topic: string;
  data?: Record<string, unknown>;
}
```

**Response:** `201 Created`

```typescript
Event
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{ "topic": "order.placed", "data": { "orderId": "12345", "amount": 99.99 } }'
```

---

### POST /events/correlated

Emits an event with correlation tracking.

**Request Body:**

```typescript
interface EmitCorrelatedEventBody {
  topic: string;
  data?: Record<string, unknown>;
  correlationId: string;
  causationId?: string;
}
```

**Response:** `201 Created`

```typescript
Event
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/events/correlated \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "payment.completed",
    "data": { "orderId": "12345" },
    "correlationId": "txn-abc-123",
    "causationId": "evt-xyz-789"
  }'
```

---

## Timers

### GET /timers

Returns all active timers.

**Response:** `200 OK`

```typescript
Timer[]
```

---

### GET /timers/:name

Returns a single timer by name.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| name | path | `string` | yes | Timer name |

**Response:** `200 OK`

```typescript
Timer
```

---

### POST /timers

Creates a new timer.

**Request Body:**

```typescript
interface CreateTimerBody {
  name: string;
  duration: string | number;  // e.g., "5m", "1h", 30000
  onExpire: {
    topic: string;
    data?: Record<string, unknown>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

**Response:** `201 Created`

```typescript
Timer
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/timers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "session-timeout",
    "duration": "30m",
    "onExpire": { "topic": "session.expired", "data": { "userId": "123" } }
  }'
```

---

### DELETE /timers/:name

Cancels a timer.

**Response:** `204 No Content`

---

## Webhooks

### GET /webhooks

Returns all registered webhooks.

**Response:** `200 OK`

```typescript
WebhookResponse[]
```

---

### GET /webhooks/:id

Returns a single webhook.

**Response:** `200 OK`

```typescript
interface WebhookResponse {
  id: string;
  url: string;
  patterns: string[];
  headers?: Record<string, string>;
  timeout?: number;
  enabled: boolean;
  hasSecret: boolean;  // secret is not exposed
}
```

---

### GET /webhooks/stats

Returns webhook delivery statistics.

**Response:** `200 OK`

```typescript
interface WebhookManagerStats {
  totalWebhooks: number;
  enabledWebhooks: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
}
```

---

### POST /webhooks

Registers a new webhook.

**Request Body:**

```typescript
interface CreateWebhookBody {
  url: string;
  patterns?: string[];           // default: ["*"]
  secret?: string;               // for HMAC signature
  headers?: Record<string, string>;
  timeout?: number;              // ms
}
```

**Response:** `201 Created`

```typescript
WebhookResponse
```

**Example:**

```bash
curl -X POST http://localhost:7226/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhook",
    "patterns": ["order.*", "payment.*"],
    "secret": "my-secret-key"
  }'
```

---

### POST /webhooks/:id/enable

Enables a webhook.

**Response:** `200 OK`

---

### POST /webhooks/:id/disable

Disables a webhook.

**Response:** `200 OK`

---

### DELETE /webhooks/:id

Unregisters a webhook.

**Response:** `204 No Content`

---

## Stream (SSE)

### GET /stream/events

Server-Sent Events stream for real-time event notifications.

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| patterns | `string` | `*` | Comma-separated topic patterns |

**Response:** `200 OK` (text/event-stream)

**Example:**

```bash
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*,payment.*
```

**Event Format:**

```
event: order.placed
data: {"id":"evt-123","topic":"order.placed","data":{"orderId":"12345"},"timestamp":1234567890}

```

---

### GET /stream/stats

Returns SSE connection statistics.

**Response:** `200 OK`

```typescript
interface SSEManagerStats {
  activeConnections: number;
  totalConnections: number;
  totalMessagesSent: number;
}
```

---

### GET /stream/connections

Returns active SSE connections (admin/debug).

**Response:** `200 OK`

```typescript
Array<{
  id: string;
  patterns: string[];
  connectedAt: number;
}>
```

---

## Health & Stats

### GET /health

Health check endpoint.

**Response:** `200 OK`

```typescript
interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: number;
  uptime: number;
  version: string;
  engine: {
    name: string;
    running: boolean;
  };
}
```

---

### GET /stats

Returns engine statistics.

**Response:** `200 OK`

```typescript
interface StatsResponse extends EngineStats {
  timestamp: number;
}
```

---

## Metrics

### GET /metrics

Returns Prometheus-formatted metrics. Only available when metrics are enabled.

**Response:** `200 OK` (text/plain)

```
# HELP noex_rules_total Total number of registered rules
# TYPE noex_rules_total gauge
noex_rules_total 42

# HELP noex_rule_executions_total Total rule executions
# TYPE noex_rule_executions_total counter
noex_rule_executions_total{rule_id="my-rule",status="success"} 1234
```

---

## Audit

Requires `audit.enabled: true` in engine config.

### GET /audit/entries

Queries audit log entries.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| category | `string` | Filter by category |
| types | `string` | Comma-separated event types |
| ruleId | `string` | Filter by rule ID |
| source | `string` | Filter by source |
| correlationId | `string` | Filter by correlation ID |
| from | `number` | Start timestamp |
| to | `number` | End timestamp |
| limit | `number` | Max entries (default: 100) |
| offset | `number` | Pagination offset |

**Response:** `200 OK`

```typescript
AuditQueryResult
```

---

### GET /audit/entries/:id

Returns a single audit entry.

**Response:** `200 OK`

```typescript
AuditEntry
```

---

### GET /audit/stats

Returns audit statistics.

**Response:** `200 OK`

```typescript
AuditStats
```

---

### GET /audit/stream

SSE stream for real-time audit events.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| categories | `string` | Comma-separated categories |
| types | `string` | Comma-separated event types |
| ruleIds | `string` | Comma-separated rule IDs |
| sources | `string` | Comma-separated sources |

**Response:** `200 OK` (text/event-stream)

---

### GET /audit/stream/stats

Returns audit SSE statistics.

**Response:** `200 OK`

```typescript
AuditSSEManagerStats
```

---

### GET /audit/export

Exports audit entries.

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| format | `string` | `json` | Export format: `json` or `csv` |
| category | `string` | — | Filter by category |
| types | `string` | — | Comma-separated event types |
| from | `number` | — | Start timestamp |
| to | `number` | — | End timestamp |

**Response:** `200 OK` with `Content-Disposition: attachment`

---

### POST /audit/cleanup

Manually triggers cleanup of old audit entries.

**Response:** `200 OK`

```typescript
{
  removedCount: number;
  remainingCount: number;
}
```

---

## Versioning

Requires `versioning.enabled: true` in engine config.

### GET /rules/:id/versions

Returns version history for a rule.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| limit | `number` | Max entries |
| offset | `number` | Pagination offset |
| order | `string` | `asc` or `desc` |
| fromVersion | `number` | Min version number |
| toVersion | `number` | Max version number |
| changeTypes | `string` | Comma-separated: created, updated, deleted |
| from | `number` | Start timestamp |
| to | `number` | End timestamp |

**Response:** `200 OK`

```typescript
RuleVersionQueryResult
```

---

### GET /rules/:id/versions/:version

Returns a specific version.

**Response:** `200 OK`

```typescript
RuleVersionEntry
```

---

### POST /rules/:id/rollback

Rolls back a rule to a previous version.

**Request Body:**

```typescript
interface RollbackBody {
  version: number;
}
```

**Response:** `200 OK`

```typescript
Rule
```

---

### GET /rules/:id/diff

Compares two versions.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| from | `number` | yes | Source version |
| to | `number` | yes | Target version |

**Response:** `200 OK`

```typescript
RuleVersionDiff
```

---

## Debug

### GET /debug/history

Queries event history.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| topic | `string` | Filter by topic |
| correlationId | `string` | Filter by correlation ID |
| from | `number` | Start timestamp |
| to | `number` | End timestamp |
| limit | `number` | Max entries |
| includeContext | `boolean` | Include rule execution context |

**Response:** `200 OK`

```typescript
HistoryResult
```

---

### GET /debug/history/:eventId

Returns an event with full execution context.

**Response:** `200 OK`

```typescript
EventWithContext
```

---

### GET /debug/correlation/:correlationId

Returns all events in a correlation chain.

**Response:** `200 OK`

```typescript
Event[]
```

---

### GET /debug/correlation/:correlationId/timeline

Returns a visual timeline of correlated events.

**Response:** `200 OK`

```typescript
TimelineEntry[]
```

---

### GET /debug/correlation/:correlationId/export

Exports correlation trace.

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| format | `string` | `json` | `json` or `mermaid` |

**Response:** `200 OK`

---

### GET /debug/traces

Returns recent trace entries.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| correlationId | `string` | Filter by correlation ID |
| ruleId | `string` | Filter by rule ID |
| types | `string` | Comma-separated trace types |
| limit | `number` | Max entries (default: 100) |

**Response:** `200 OK`

```typescript
DebugTraceEntry[]
```

---

### GET /debug/tracing

Returns tracing status.

**Response:** `200 OK`

```typescript
{ enabled: boolean }
```

---

### POST /debug/tracing/enable

Enables tracing.

**Response:** `200 OK`

```typescript
{ enabled: true }
```

---

### POST /debug/tracing/disable

Disables tracing.

**Response:** `200 OK`

```typescript
{ enabled: false }
```

---

### GET /debug/profile

Returns all rule execution profiles.

**Response:** `200 OK`

```typescript
RuleProfile[]
```

---

### GET /debug/profile/summary

Returns profiling summary.

**Response:** `200 OK`

```typescript
ProfilingSummary
```

---

### GET /debug/profile/slowest

Returns slowest rules.

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| limit | `number` | 10 | Number of rules |

**Response:** `200 OK`

```typescript
RuleProfile[]
```

---

### GET /debug/profile/hottest

Returns most frequently triggered rules.

**Query Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| limit | `number` | 10 | Number of rules |

**Response:** `200 OK`

```typescript
RuleProfile[]
```

---

### GET /debug/profile/:ruleId

Returns profile for a specific rule.

**Response:** `200 OK`

```typescript
RuleProfile
```

---

### POST /debug/profile/reset

Resets all profiling data.

**Response:** `200 OK`

```typescript
{ reset: true }
```

---

### GET /debug/stream

SSE stream for real-time trace entries.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| types | `string` | Comma-separated trace types |
| ruleIds | `string` | Comma-separated rule IDs |
| correlationIds | `string` | Comma-separated correlation IDs |
| minDurationMs | `number` | Minimum duration filter |

**Response:** `200 OK` (text/event-stream)

---

### GET /debug/stream/connections

Returns active debug SSE connections.

**Response:** `200 OK`

---

### GET /debug/stream/stats

Returns debug SSE statistics.

**Response:** `200 OK`

```typescript
DebugSSEManagerStats
```

---

## Debug Sessions

Interactive debugging with breakpoints and snapshots.

### POST /debug/sessions

Creates a new debug session.

**Response:** `200 OK`

```typescript
DebugSession
```

---

### GET /debug/sessions

Returns all debug sessions.

**Response:** `200 OK`

```typescript
DebugSession[]
```

---

### GET /debug/sessions/:sessionId

Returns a specific session.

**Response:** `200 OK`

```typescript
DebugSession
```

---

### DELETE /debug/sessions/:sessionId

Ends a debug session.

**Response:** `200 OK`

```typescript
{ deleted: true }
```

---

### POST /debug/sessions/:sessionId/breakpoints

Adds a breakpoint to a session.

**Request Body:**

```typescript
interface CreateBreakpointBody {
  type: 'rule' | 'event' | 'fact' | 'action';
  condition: {
    ruleId?: string;
    topic?: string;
    factPattern?: string;
    actionType?: string;
  };
  action: 'pause' | 'log' | 'snapshot';
  enabled?: boolean;
}
```

**Response:** `200 OK`

```typescript
Breakpoint
```

---

### DELETE /debug/sessions/:sessionId/breakpoints/:breakpointId

Removes a breakpoint.

**Response:** `200 OK`

```typescript
{ deleted: true }
```

---

### POST /debug/sessions/:sessionId/breakpoints/:breakpointId/enable

Enables a breakpoint.

**Response:** `200 OK`

---

### POST /debug/sessions/:sessionId/breakpoints/:breakpointId/disable

Disables a breakpoint.

**Response:** `200 OK`

---

### POST /debug/sessions/:sessionId/resume

Resumes execution from a paused state.

**Response:** `200 OK`

```typescript
{ resumed: boolean }
```

---

### POST /debug/sessions/:sessionId/step

Steps to the next execution point.

**Response:** `200 OK`

```typescript
{ stepped: boolean }
```

---

### POST /debug/sessions/:sessionId/snapshot

Takes a state snapshot.

**Request Body:**

```typescript
interface TakeSnapshotBody {
  label?: string;
}
```

**Response:** `200 OK`

```typescript
Snapshot
```

---

### GET /debug/sessions/:sessionId/snapshots/:snapshotId

Returns a specific snapshot.

**Response:** `200 OK`

```typescript
Snapshot
```

---

### DELETE /debug/sessions/:sessionId/snapshots

Clears all snapshots in a session.

**Response:** `200 OK`

```typescript
{ cleared: true }
```

---

## OpenAPI / Swagger

When `swagger: true` in server config, OpenAPI documentation is available at:

- **Swagger UI:** `http://localhost:7226/documentation`
- **OpenAPI JSON:** `http://localhost:7226/documentation/json`
- **OpenAPI YAML:** `http://localhost:7226/documentation/yaml`

---

## See Also

- [RuleEngineServer](./28-server.md) — Server configuration and lifecycle
- [GraphQL API](./26-graphql-api.md) — GraphQL alternative
- [Observability](./21-observability.md) — Metrics and tracing
- [Audit](./20-audit.md) — Audit logging
