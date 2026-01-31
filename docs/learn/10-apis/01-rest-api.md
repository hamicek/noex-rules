# REST API

noex-rules includes a production-ready HTTP server built on Fastify. A single call to `RuleEngineServer.start()` gives you a complete REST API for managing rules, facts, events, timers, and groups — plus automatic Swagger documentation, CORS handling, and health checks. This chapter walks through server setup, every endpoint, and practical curl examples you can run against a live server.

## What You'll Learn

- How to start and configure the HTTP server with `RuleEngineServer.start()`
- The full REST endpoint reference: rules, facts, events, timers, groups, health
- How to use Swagger/OpenAPI documentation at `/documentation`
- CORS configuration options for cross-origin access
- Practical curl examples for creating rules, emitting events, and querying facts

## Starting the Server

The simplest way to start the server:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start();

console.log(`Server running at ${server.address}`);
// Server running at http://0.0.0.0:7226
```

This starts a Fastify HTTP server on port 7226 with all defaults: CORS enabled, Swagger enabled, GraphQL enabled, and request logging enabled. The server automatically creates a `RuleEngine` instance, starts it, and wires all routes.

### Configuration

Every aspect of the server is configurable:

```typescript
const server = await RuleEngineServer.start({
  server: {
    port: 3000,              // Default: 7226
    host: 'localhost',       // Default: '0.0.0.0'
    apiPrefix: '/api/v2',    // Default: '/api/v1'
    cors: true,              // Default: true (see CORS section below)
    swagger: true,           // Default: true
    logger: true,            // Default: true
    graphql: true,           // Default: true (see Chapter 10.3)
  },

  // Option A: Pass an existing engine
  engine: myExistingEngine,

  // Option B: Let the server create one (ignored if engine is provided)
  engineConfig: {
    persistence: { adapter: sqliteAdapter },
    backwardChaining: { maxDepth: 15 },
  },

  // Webhook delivery settings (see Chapter 10.2)
  webhookConfig: {
    maxRetries: 3,
    retryBaseDelay: 1000,
    defaultTimeout: 10000,
  },

  // SSE heartbeat settings (see Chapter 10.2)
  sseConfig: {
    heartbeatInterval: 30000,
  },

  // Prometheus metrics (see Chapter 8.4)
  metricsConfig: {
    enabled: true,
  },
});
```

### Server Lifecycle

```typescript
// Access the underlying engine
const engine = server.getEngine();

// Access the server address and port
console.log(server.address); // http://localhost:3000
console.log(server.port);    // 3000

// Graceful shutdown: stops SSE, closes HTTP connections, stops the engine
await server.stop();
```

If you provide your own `engine` instance, `server.stop()` closes the HTTP server but does **not** stop the engine — you manage that separately. If the server created the engine internally, it stops both.

## Endpoint Reference

All endpoints use the configured API prefix (default: `/api/v1`).

### Rules

| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| GET | `/rules` | List all rules | 200 |
| GET | `/rules/:id` | Get rule by ID | 200 / 404 |
| POST | `/rules` | Create new rule | 201 |
| POST | `/rules/validate` | Validate rule (dry-run, no registration) | 200 |
| PUT | `/rules/:id` | Partial update | 200 / 404 |
| DELETE | `/rules/:id` | Delete rule | 204 / 404 |
| POST | `/rules/:id/enable` | Enable rule | 200 / 404 |
| POST | `/rules/:id/disable` | Disable rule | 200 / 404 |

### Rule Versions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rules/:id/versions` | Version history for a rule |
| GET | `/rules/:id/versions/:version` | Get a specific version snapshot |
| POST | `/rules/:id/rollback` | Rollback to a previous version |
| GET | `/rules/:id/diff` | Diff two versions |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/groups` | List all groups |
| GET | `/groups/:id` | Get group by ID |
| POST | `/groups` | Create new group |
| PUT | `/groups/:id` | Update group |
| DELETE | `/groups/:id` | Delete group |
| POST | `/groups/:id/enable` | Enable group |
| POST | `/groups/:id/disable` | Disable group |
| GET | `/groups/:id/rules` | List rules in group |

### Facts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/facts` | List all facts |
| GET | `/facts/:key` | Get fact by key |
| PUT | `/facts/:key` | Set/update fact value |
| DELETE | `/facts/:key` | Delete fact |
| POST | `/facts/query` | Query facts by glob pattern |

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/events` | Emit event |
| POST | `/events/correlated` | Emit correlated event with tracking IDs |

### Timers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/timers` | List all active timers |
| GET | `/timers/:name` | Get timer by name |
| POST | `/timers` | Create timer |
| DELETE | `/timers/:name` | Cancel timer |

### Health and Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (status, uptime, version) |
| GET | `/stats` | Aggregate engine statistics |
| GET | `/metrics` | Prometheus metrics (text/plain) |

### Audit, Debug, and Streaming

These endpoints are covered in detail in previous chapters ([8.1 Debugging](../08-observability/01-debugging.md), [8.3 Audit Logging](../08-observability/03-audit-logging.md)) and the next chapter ([10.2 Real-time Notifications](./02-realtime.md)):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit/entries` | Query audit entries with filters |
| GET | `/audit/export` | Export audit entries (JSON/CSV) |
| GET | `/audit/stream` | SSE real-time audit stream |
| GET | `/stream/events` | SSE event stream |
| GET | `/webhooks` | List registered webhooks |
| POST | `/webhooks` | Register new webhook |
| GET | `/debug/history` | Query event history |
| GET | `/debug/profile` | All rule profiling data |
| GET | `/debug/traces` | Recent trace entries |

## Curl Examples

Start the server and run these examples against it:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});
```

### Create a Rule

```bash
curl -X POST http://localhost:7226/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-alert",
    "name": "Order Alert",
    "description": "Notify when a high-value order is placed",
    "priority": 10,
    "enabled": true,
    "tags": ["orders", "alerts"],
    "trigger": { "type": "event", "topic": "order.created" },
    "conditions": [{
      "source": "event",
      "field": "total",
      "operator": "gte",
      "value": 1000
    }],
    "actions": [{
      "type": "emit_event",
      "topic": "alert.high-value-order",
      "data": { "orderId": "${event.orderId}", "total": "${event.total}" }
    }]
  }'
```

### List Rules

```bash
curl http://localhost:7226/api/v1/rules | jq
```

### Validate a Rule (Dry Run)

```bash
curl -X POST http://localhost:7226/api/v1/rules/validate \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-rule",
    "name": "Test",
    "trigger": { "type": "event", "topic": "test" },
    "actions": [{ "type": "log", "message": "ok" }]
  }'
```

### Emit an Event

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "order.created",
    "data": { "orderId": "ord-1", "total": 2500, "customerId": "c-42" }
  }'
```

### Emit a Correlated Event

```bash
curl -X POST http://localhost:7226/api/v1/events/correlated \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "payment.completed",
    "data": { "orderId": "ord-1", "amount": 2500 },
    "correlationId": "txn-abc-123",
    "causationId": "evt-order-created-1"
  }'
```

### Set a Fact

```bash
curl -X PUT http://localhost:7226/api/v1/facts/customer:c-42:tier \
  -H "Content-Type: application/json" \
  -d '{ "value": "vip" }'
```

### Query Facts by Pattern

```bash
curl -X POST http://localhost:7226/api/v1/facts/query \
  -H "Content-Type: application/json" \
  -d '{ "pattern": "customer:c-42:*" }'
```

### Create a Timer

```bash
curl -X POST http://localhost:7226/api/v1/timers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "payment-timeout-ord-1",
    "duration": "30m",
    "onExpire": {
      "topic": "payment.timeout",
      "data": { "orderId": "ord-1" }
    }
  }'
```

### Health Check

```bash
curl http://localhost:7226/api/v1/health | jq
```

Response:

```json
{
  "status": "ok",
  "timestamp": 1706745600000,
  "uptime": 3600,
  "version": "1.0.0",
  "engine": {
    "name": "noex-rules",
    "running": true
  }
}
```

## Swagger / OpenAPI Documentation

When `swagger: true` (the default), the server registers a Swagger UI at:

```
http://localhost:7226/documentation
```

The UI provides:
- Interactive endpoint explorer with "Try it out" functionality
- Request/response schema documentation for every endpoint
- Request duration display
- Deep linking for sharing specific endpoint URLs

The OpenAPI 3.0.3 spec is generated from route schemas automatically. You can use it with tools like Postman, Insomnia, or code generators.

## CORS Configuration

By default, all origins are allowed. For production, restrict access:

```typescript
const server = await RuleEngineServer.start({
  server: {
    cors: {
      origin: ['https://dashboard.example.com', 'https://admin.example.com'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id'],
      credentials: true,
      maxAge: 86400, // 24 hours preflight cache
    },
  },
});
```

To disable CORS entirely:

```typescript
const server = await RuleEngineServer.start({
  server: { cors: false },
});
```

## Complete Example: Order Management API

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event } from '@hamicek/noex-rules/dsl';

// Start server with custom port
const server = await RuleEngineServer.start({
  server: { port: 3000 },
});

const engine = server.getEngine();

// Register rules programmatically (or via POST /rules)
engine.registerRule(
  Rule.create('track-order')
    .name('Track Order Status')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(setFact('order:${event.orderId}:total', '${event.total}'))
    .build()
);

engine.registerRule(
  Rule.create('high-value-alert')
    .name('High Value Order Alert')
    .priority(10)
    .tags(['orders', 'alerts'])
    .when(onEvent('order.created'))
    .if(event('total').gte(1000))
    .then(emit('alert.high-value', {
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('payment-received')
    .name('Payment Received')
    .when(onEvent('payment.completed'))
    .then(setFact('order:${event.orderId}:status', 'paid'))
    .also(emit('order.status-changed', {
      orderId: '${event.orderId}',
      status: 'paid',
    }))
    .build()
);

console.log(`Order management API running at ${server.address}`);
console.log(`Swagger docs: ${server.address}/documentation`);

// Now external services can:
// POST /api/v1/events  { "topic": "order.created", "data": { ... } }
// GET  /api/v1/facts/order:ord-1:status
// GET  /api/v1/rules
```

## Exercise

1. Start a server on port 4000 with Swagger enabled
2. Using curl (or Swagger UI), create a rule that sets fact `sensor:{sensorId}:alert` to `true` when a `sensor.reading` event has `temperature > 80`
3. Emit a `sensor.reading` event with `{ "sensorId": "s-1", "temperature": 95 }`
4. Query the fact `sensor:s-1:alert` via the REST API and verify it's `true`
5. Disable the rule via `POST /rules/:id/disable` and emit another event — verify no new alert is generated

<details>
<summary>Solution</summary>

Start the server:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: { port: 4000 },
});

console.log(`Server running at ${server.address}`);
```

Create the rule:

```bash
curl -X POST http://localhost:4000/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "temp-alert",
    "name": "Temperature Alert",
    "trigger": { "type": "event", "topic": "sensor.reading" },
    "conditions": [{
      "source": "event",
      "field": "temperature",
      "operator": "gt",
      "value": 80
    }],
    "actions": [{
      "type": "set_fact",
      "key": "sensor:${event.sensorId}:alert",
      "value": true
    }]
  }'
```

Emit the event:

```bash
curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 95 }
  }'
```

Check the fact:

```bash
curl http://localhost:4000/api/v1/facts/sensor:s-1:alert | jq
# { "key": "sensor:s-1:alert", "value": true, ... }
```

Disable the rule:

```bash
curl -X POST http://localhost:4000/api/v1/rules/temp-alert/disable
```

Emit another event and verify no new fact is set:

```bash
curl -X DELETE http://localhost:4000/api/v1/facts/sensor:s-1:alert

curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 90 }
  }'

curl http://localhost:4000/api/v1/facts/sensor:s-1:alert
# 404 — fact not set because rule is disabled
```

</details>

## Summary

- `RuleEngineServer.start()` launches a Fastify HTTP server with REST, GraphQL, SSE, Swagger, and CORS
- Default configuration: port 7226, all origins allowed, Swagger at `/documentation`, GraphQL at `/graphql`
- The REST API exposes CRUD endpoints for rules, groups, facts, events, and timers under `/api/v1`
- `POST /rules/validate` performs dry-run validation without registering the rule
- `POST /events/correlated` emits events with `correlationId` and `causationId` for distributed tracing
- Health check at `GET /health` returns server status, uptime, version, and engine state
- Swagger UI provides interactive documentation and "Try it out" functionality
- CORS is fully configurable — restrict origins, methods, headers, and credentials for production
- If you pass an existing engine, `server.stop()` only closes the HTTP server; otherwise it stops both

---

Next: [Real-time Notifications](./02-realtime.md)
