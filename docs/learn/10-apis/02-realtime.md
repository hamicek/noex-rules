# Real-time Notifications

REST endpoints are request-response: the client asks, the server answers. But rule engines are inherently reactive — events trigger rules, rules produce new events, and external systems need to know about them **as they happen**. noex-rules provides two push mechanisms: **Server-Sent Events (SSE)** for browser and lightweight clients, and **webhooks** for server-to-server delivery with HMAC signatures and retry logic.

## What You'll Learn

- How to connect to the SSE event stream with topic pattern filtering
- Building a real-time dashboard using the browser `EventSource` API
- Registering webhooks with HMAC-SHA256 signature verification
- Webhook retry logic with exponential backoff
- Choosing between SSE and webhooks for different use cases
- Managing connections and monitoring delivery statistics

## Server-Sent Events (SSE)

SSE is a browser-native protocol for receiving a unidirectional stream of events from the server. The client opens a long-lived HTTP connection, and the server pushes events as they occur.

### Architecture

```text
  ┌──────────┐                   ┌─────────────────┐
  │  Browser  │── GET /stream ──▶│  noex-rules      │
  │  or CLI   │   events?       │  SSE Manager     │
  │  client   │◀─ data: {...} ──│                   │
  │           │◀─ data: {...} ──│  (filters events  │
  │           │◀─ : heartbeat ──│   by topic        │
  │           │                  │   patterns)       │
  └──────────┘                   └─────────────────┘
```

### Connecting to the Stream

The SSE endpoint is at `GET /api/v1/stream/events`. Use the `patterns` query parameter to filter which events you receive:

```bash
# All events
curl -N http://localhost:7226/api/v1/stream/events

# Only order events
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*

# Multiple patterns
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*,payment.completed
```

The server responds with SSE headers and keeps the connection open:

```text
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no

: connected:sse-1706745600000-abc123def

data: {"id":"evt-1","topic":"order.created","data":{"orderId":"ord-1"},"timestamp":1706745600000,"source":"engine"}

: heartbeat

data: {"id":"evt-2","topic":"order.paid","data":{"orderId":"ord-1"},"timestamp":1706745630000,"source":"engine"}
```

**Lines starting with `:`** are SSE comments — the `connected:` comment confirms the connection ID, and `heartbeat` comments (every 30 seconds by default) keep the connection alive through proxies and load balancers.

### Topic Pattern Matching

Patterns use dot-separated segments with wildcard support:

| Pattern | Matches | Doesn't Match |
|---------|---------|---------------|
| `*` | Everything | — |
| `order.*` | `order.created`, `order.paid` | `payment.completed` |
| `order.created` | `order.created` only | `order.paid` |
| `alert.*` | `alert.high-value`, `alert.fraud` | `order.alert` |

The default pattern (when `patterns` is omitted) is `*` — all events.

### Browser EventSource Client

The `EventSource` API is built into every modern browser:

```typescript
// Connect to the SSE stream
const source = new EventSource(
  'http://localhost:7226/api/v1/stream/events?patterns=order.*,alert.*'
);

source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.topic}]`, data.data);

  // Update the dashboard
  updateDashboard(data);
};

source.onerror = (error) => {
  console.error('SSE connection error:', error);
  // EventSource automatically reconnects
};
```

`EventSource` handles reconnection automatically — if the connection drops, the browser will retry with exponential backoff. No manual reconnection logic is needed.

### SSE Configuration

Configure the heartbeat interval when starting the server:

```typescript
const server = await RuleEngineServer.start({
  sseConfig: {
    heartbeatInterval: 15000, // 15 seconds (default: 30000)
  },
});
```

### SSE Statistics and Connections

Monitor active SSE connections through REST endpoints:

```bash
# Connection statistics
curl http://localhost:7226/api/v1/stream/stats | jq
# { "activeConnections": 5, "totalEventsSent": 12345 }

# List active connections
curl http://localhost:7226/api/v1/stream/connections | jq
# [{ "id": "sse-170...", "patterns": ["order.*"], "connectedAt": 1706745600000 }]
```

## Webhooks

Webhooks push events to external HTTP endpoints. Unlike SSE (where the client connects to you), webhooks are server-to-server: you register a URL, and noex-rules sends POST requests to it whenever matching events occur.

### Architecture

```text
  ┌──────────────────┐         ┌─────────────────┐         ┌──────────────────┐
  │  RuleEngine       │────────▶│  Webhook Manager │────────▶│  Your Service    │
  │  emits events     │         │                  │         │                  │
  │                    │         │  - Pattern match │  POST   │  POST /webhook   │
  │                    │         │  - HMAC sign     │────────▶│  X-Webhook-      │
  │                    │         │  - Retry on fail │         │  Signature: ...  │
  └──────────────────┘         └─────────────────┘         └──────────────────┘
```

### Registering a Webhook

```bash
curl -X POST http://localhost:7226/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://my-service.example.com/webhook",
    "patterns": ["order.*", "payment.completed"],
    "secret": "my-webhook-secret",
    "headers": { "X-Custom-Header": "my-value" },
    "timeout": 10000
  }'
```

Response:

```json
{
  "id": "a1b2c3d4-...",
  "url": "https://my-service.example.com/webhook",
  "patterns": ["order.*", "payment.completed"],
  "enabled": true,
  "createdAt": 1706745600000
}
```

### Webhook Payload Format

When a matching event occurs, noex-rules sends a POST request with this JSON body:

```json
{
  "id": "delivery-uuid",
  "webhookId": "a1b2c3d4-...",
  "event": {
    "id": "evt-1",
    "topic": "order.created",
    "data": { "orderId": "ord-1", "total": 2500 },
    "timestamp": 1706745600000,
    "correlationId": "txn-abc",
    "source": "engine"
  },
  "deliveredAt": 1706745600100
}
```

### HMAC-SHA256 Signatures

When a `secret` is provided during registration, every webhook request includes an `X-Webhook-Signature` header:

```
X-Webhook-Signature: sha256=a1b2c3d4e5f6...
```

The signature is computed as `HMAC-SHA256(secret, JSON body)`. Verify it on the receiving end:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

const app = express();
app.use(express.raw({ type: 'application/json' }));

const WEBHOOK_SECRET = 'my-webhook-secret';

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const body = req.body as Buffer;

  // Compute expected signature
  const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(401).send('Invalid signature');
  }

  const payload = JSON.parse(body.toString());
  console.log(`Webhook received: ${payload.event.topic}`, payload.event.data);

  res.status(200).send('OK');
});
```

### Retry Logic

When a webhook delivery fails (non-2xx response or network error), the manager retries with **exponential backoff**:

```text
  Attempt 1  ──▶  Failed
       │
       ▼  wait 1000ms
  Attempt 2  ──▶  Failed
       │
       ▼  wait 2000ms
  Attempt 3  ──▶  Failed  ──▶  Marked as failed
```

The formula is: `delay = retryBaseDelay * 2^(attempt - 1)`

Default configuration: 3 retries with base delay 1000ms. Customize in `webhookConfig`:

```typescript
const server = await RuleEngineServer.start({
  webhookConfig: {
    maxRetries: 5,         // 5 attempts total
    retryBaseDelay: 500,   // 500ms, 1s, 2s, 4s, 8s
    defaultTimeout: 15000, // 15s timeout per request
  },
});
```

### Managing Webhooks

```bash
# List all webhooks
curl http://localhost:7226/api/v1/webhooks | jq

# Get a specific webhook
curl http://localhost:7226/api/v1/webhooks/a1b2c3d4-... | jq

# Disable a webhook (stops deliveries)
curl -X POST http://localhost:7226/api/v1/webhooks/a1b2c3d4-.../disable

# Enable a webhook
curl -X POST http://localhost:7226/api/v1/webhooks/a1b2c3d4-.../enable

# Delete a webhook
curl -X DELETE http://localhost:7226/api/v1/webhooks/a1b2c3d4-...

# Delivery statistics
curl http://localhost:7226/api/v1/webhooks/stats | jq
# {
#   "webhookCount": 5,
#   "activeWebhookCount": 4,
#   "totalDeliveries": 1250,
#   "successfulDeliveries": 1200,
#   "failedDeliveries": 50
# }
```

## SSE vs Webhooks

| Aspect | SSE | Webhooks |
|--------|-----|----------|
| **Direction** | Client pulls (long-lived GET) | Server pushes (POST to URL) |
| **Protocol** | HTTP/1.1 text/event-stream | HTTP POST with JSON body |
| **Client type** | Browsers, lightweight clients | Backend services |
| **Authentication** | Query params / cookies | HMAC signatures |
| **Reconnection** | Automatic (browser-native) | Retry with exponential backoff |
| **Ordering** | Guaranteed (single connection) | Best-effort (parallel delivery) |
| **Firewall** | Client initiates — easy | Server initiates — needs inbound access |
| **Use case** | Dashboards, live monitoring | Service integration, alerting systems |

**Rule of thumb**: Use SSE for browsers and monitoring UIs. Use webhooks for backend service-to-service integration.

## Complete Example: Real-time Order Dashboard

This example starts a server, registers rules, and demonstrates both SSE and webhook consumption:

```typescript
import { RuleEngineServer, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event } from '@hamicek/noex-rules/dsl';

// --- Server setup ---

const server = await RuleEngineServer.start({
  server: { port: 7226 },
  webhookConfig: { maxRetries: 3 },
  sseConfig: { heartbeatInterval: 15000 },
});

const engine = server.getEngine();

// --- Register rules ---

engine.registerRule(
  Rule.create('order-status')
    .name('Track Order Status')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(emit('dashboard.update', {
      type: 'new-order',
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('high-value-webhook')
    .name('High Value Order Webhook Trigger')
    .when(onEvent('order.created'))
    .if(event('total').gte(5000))
    .then(emit('alert.high-value', {
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

// --- Register a webhook for high-value alerts ---

const webhookManager = server.getWebhookManager();
webhookManager.register({
  url: 'https://alerts.example.com/high-value',
  patterns: ['alert.high-value'],
  secret: 'alert-webhook-secret',
});

console.log(`Dashboard API: ${server.address}`);
console.log(`SSE stream:    ${server.address}/api/v1/stream/events?patterns=dashboard.*`);
console.log(`Swagger docs:  ${server.address}/documentation`);

// --- Browser client (paste into browser console) ---

// const source = new EventSource(
//   'http://localhost:7226/api/v1/stream/events?patterns=dashboard.*'
// );
// source.onmessage = (e) => {
//   const data = JSON.parse(e.data);
//   document.getElementById('orders').innerHTML +=
//     `<div>Order ${data.data.orderId}: $${data.data.total}</div>`;
// };
```

## Exercise

1. Start a server on port 7226
2. Register a rule that emits `alert.temperature` when a `sensor.reading` event has `temperature > 90`
3. Register a webhook for `alert.*` events pointing to `https://httpbin.org/post` with a secret
4. Connect to the SSE stream with pattern `alert.*` using curl (`curl -N`)
5. Emit a `sensor.reading` event with `temperature: 95` via the REST API
6. Observe the event arriving on the SSE stream and verify the webhook delivery statistics

<details>
<summary>Solution</summary>

Start server and register the rule:

```typescript
import { RuleEngineServer, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, event } from '@hamicek/noex-rules/dsl';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

const engine = server.getEngine();

engine.registerRule(
  Rule.create('temp-alert')
    .name('Temperature Alert')
    .when(onEvent('sensor.reading'))
    .if(event('temperature').gt(90))
    .then(emit('alert.temperature', {
      sensorId: '${event.sensorId}',
      temperature: '${event.temperature}',
    }))
    .build()
);
```

Register the webhook (in a separate terminal):

```bash
curl -X POST http://localhost:7226/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/post",
    "patterns": ["alert.*"],
    "secret": "my-secret"
  }'
```

Connect to SSE stream (in a separate terminal):

```bash
curl -N http://localhost:7226/api/v1/stream/events?patterns=alert.*
```

Emit the event (in a separate terminal):

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 95 }
  }'
```

The SSE terminal shows:

```
data: {"id":"...","topic":"alert.temperature","data":{"sensorId":"s-1","temperature":"95"},...}
```

Check webhook statistics:

```bash
curl http://localhost:7226/api/v1/webhooks/stats | jq
# { "webhookCount": 1, "activeWebhookCount": 1, "totalDeliveries": 1, ... }
```

</details>

## Summary

- **SSE** streams events over a long-lived HTTP connection at `GET /stream/events?patterns=...`
- Clients filter events using dot-separated topic patterns with wildcard support (`order.*`, `*`)
- The browser `EventSource` API handles automatic reconnection out of the box
- Heartbeat comments (every 30 seconds) keep SSE connections alive through proxies
- **Webhooks** push events via POST requests to registered URLs with JSON payloads
- HMAC-SHA256 signatures in the `X-Webhook-Signature` header authenticate webhook deliveries
- Failed deliveries retry with exponential backoff: `delay = retryBaseDelay * 2^(attempt - 1)`
- SSE is ideal for browsers and dashboards; webhooks are ideal for backend service integration
- Monitor both mechanisms through `/stream/stats`, `/stream/connections`, and `/webhooks/stats`

---

Next: [GraphQL API](./03-graphql.md)
