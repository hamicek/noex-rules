# RuleEngineServer

HTTP server for exposing RuleEngine capabilities via REST API, GraphQL, webhooks, and Server-Sent Events. Built on Fastify with optional Swagger documentation.

## Import

```typescript
import {
  RuleEngineServer,
  // Types
  ServerOptions,
  ServerConfig,
  ServerConfigInput,
  CorsConfig,
  GraphQLConfig,
} from '@hamicek/noex-rules';
```

---

## RuleEngineServer

Main HTTP server class that wraps RuleEngine and exposes it through REST and GraphQL APIs. Manages lifecycle of connected subsystems including webhooks, SSE, and metrics.

### Factory Method

```typescript
static async start(options?: ServerOptions): Promise<RuleEngineServer>
```

Creates and starts an HTTP server with all configured features. If no engine is provided, creates a new one.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| options | `ServerOptions` | no | Server configuration options |

**Returns:** `Promise<RuleEngineServer>` — Running server instance

**Example:**

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

// Minimal — uses all defaults
const server = await RuleEngineServer.start();

console.log(`Server running at ${server.address}`);
```

**Example with configuration:**

```typescript
const server = await RuleEngineServer.start({
  server: {
    port: 8080,
    host: 'localhost',
    apiPrefix: '/api/v2',
    cors: {
      origin: ['https://example.com'],
      credentials: true,
    },
    swagger: true,
    graphql: {
      graphiql: true,
      path: '/graphql',
    },
  },
  engineConfig: {
    persistence: { enabled: true },
    audit: { enabled: true },
  },
});
```

**Example with existing engine:**

```typescript
import { RuleEngine, RuleEngineServer } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  persistence: { enabled: true },
});

// Register rules on engine...

const server = await RuleEngineServer.start({
  engine,
  server: { port: 3000 },
});
```

---

### getEngine()

```typescript
getEngine(): RuleEngine
```

Returns the underlying RuleEngine instance. Use this to interact with the engine programmatically while the server is running.

**Returns:** `RuleEngine` — The engine instance

**Example:**

```typescript
const engine = server.getEngine();

await engine.registerRule(myRule);
await engine.emit('my-topic', { data: 'value' });

const stats = engine.getStats();
console.log(`Rules: ${stats.ruleCount}, Events: ${stats.eventCount}`);
```

---

### getWebhookManager()

```typescript
getWebhookManager(): WebhookManager
```

Returns the WebhookManager for programmatic webhook management. Webhooks can also be managed via REST API.

**Returns:** `WebhookManager` — Webhook manager instance

**Example:**

```typescript
const webhookManager = server.getWebhookManager();

// Register a webhook programmatically
webhookManager.register({
  url: 'https://example.com/webhook',
  patterns: ['order.*', 'payment.completed'],
  secret: 'my-secret',
});

const stats = webhookManager.getStats();
console.log(`Active webhooks: ${stats.activeWebhookCount}`);
```

---

### getSSEManager()

```typescript
getSSEManager(): SSEManager
```

Returns the SSE manager for monitoring active connections. Clients connect via `GET /stream` endpoint.

**Returns:** `SSEManager` — SSE manager instance

**Example:**

```typescript
const sseManager = server.getSSEManager();

const stats = sseManager.getStats();
console.log(`Active SSE connections: ${stats.activeConnections}`);
console.log(`Total events sent: ${stats.totalEventsSent}`);
```

---

### getMetricsCollector()

```typescript
getMetricsCollector(): MetricsCollector | null
```

Returns the MetricsCollector if metrics are enabled. Returns `null` if metrics are disabled on both engine and server.

**Returns:** `MetricsCollector | null` — Metrics collector or null

**Example:**

```typescript
const metrics = server.getMetricsCollector();

if (metrics) {
  const data = metrics.getMetrics();
  console.log(`Rule executions: ${data.ruleExecutions.total}`);
}
```

---

### address (getter)

```typescript
get address(): string
```

Returns the full server address including protocol, host, and port.

**Returns:** `string` — Server address (e.g., `http://localhost:7226`)

**Example:**

```typescript
console.log(`API available at ${server.address}/api/v1`);
// Output: API available at http://localhost:7226/api/v1
```

---

### port (getter)

```typescript
get port(): number
```

Returns the configured port number.

**Returns:** `number` — Port number

**Example:**

```typescript
console.log(`Server listening on port ${server.port}`);
```

---

### stop()

```typescript
async stop(): Promise<void>
```

Gracefully stops the server. Closes all SSE connections, stops metrics collection (if server-owned), closes HTTP server, and stops the engine (if server-created).

**Example:**

```typescript
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
});
```

---

## ServerOptions

```typescript
interface ServerOptions {
  server?: ServerConfigInput;
  engine?: RuleEngine;
  engineConfig?: RuleEngineConfig;
  webhookConfig?: WebhookManagerConfig;
  sseConfig?: SSEManagerConfig;
  metricsConfig?: MetricsConfig;
}
```

Options for creating a RuleEngineServer instance.

| Field | Type | Description |
|-------|------|-------------|
| server | `ServerConfigInput` | HTTP server configuration |
| engine | `RuleEngine` | Existing engine instance (if not provided, creates new) |
| engineConfig | `RuleEngineConfig` | Config for new engine (ignored if `engine` provided) |
| webhookConfig | `WebhookManagerConfig` | Webhook delivery configuration |
| sseConfig | `SSEManagerConfig` | SSE connection configuration |
| metricsConfig | `MetricsConfig` | Prometheus metrics configuration |

---

## ServerConfig

```typescript
interface ServerConfig {
  port: number;
  host: string;
  apiPrefix: string;
  cors: boolean | CorsConfig;
  swagger: boolean;
  logger: boolean;
  graphql: boolean | GraphQLConfig;
  fastifyOptions: Omit<FastifyServerOptions, 'logger'> | undefined;
}
```

Full server configuration (resolved from `ServerConfigInput`).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| port | `number` | `7226` | Port to listen on |
| host | `string` | `'0.0.0.0'` | Host address to bind |
| apiPrefix | `string` | `'/api/v1'` | REST API path prefix |
| cors | `boolean \| CorsConfig` | `true` | CORS configuration |
| swagger | `boolean` | `true` | Enable Swagger/OpenAPI docs |
| logger | `boolean` | `true` | Enable Fastify logging |
| graphql | `boolean \| GraphQLConfig` | `true` | GraphQL API configuration |
| fastifyOptions | `FastifyServerOptions` | — | Additional Fastify options |

---

## ServerConfigInput

```typescript
type ServerConfigInput = Partial<ServerConfig>;
```

Partial server configuration. All fields are optional with sensible defaults.

---

## CorsConfig

```typescript
interface CorsConfig {
  origin?: boolean | string | string[] | RegExp | ((origin: string | undefined) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}
```

CORS configuration for cross-origin requests.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| origin | `boolean \| string \| string[] \| RegExp \| Function` | `true` | Allowed origins |
| methods | `string[]` | `['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']` | Allowed HTTP methods |
| allowedHeaders | `string[]` | `['Content-Type', 'Authorization', 'X-Requested-With']` | Allowed request headers |
| exposedHeaders | `string[]` | `['X-Request-Id']` | Headers exposed to client |
| credentials | `boolean` | `false` | Allow credentials (cookies, auth headers) |
| maxAge | `number` | `86400` | Preflight cache duration in seconds |
| preflightContinue | `boolean` | `false` | Pass preflight to next handler |
| optionsSuccessStatus | `number` | `204` | Status code for OPTIONS success |

**Example:**

```typescript
const corsConfig: CorsConfig = {
  origin: ['https://app.example.com', 'https://admin.example.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  maxAge: 3600,
};
```

---

## GraphQLConfig

```typescript
interface GraphQLConfig {
  graphiql?: boolean;
  path?: string;
  subscriptions?: boolean;
}
```

GraphQL API configuration.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| graphiql | `boolean` | `true` | Enable GraphiQL IDE playground |
| path | `string` | `'/graphql'` | GraphQL endpoint path |
| subscriptions | `boolean` | `true` | Enable WebSocket subscriptions |

**Example:**

```typescript
const graphqlConfig: GraphQLConfig = {
  graphiql: process.env.NODE_ENV !== 'production',
  path: '/graphql',
  subscriptions: true,
};
```

---

## WebhookManagerConfig

```typescript
interface WebhookManagerConfig {
  maxRetries?: number;
  retryBaseDelay?: number;
  defaultTimeout?: number;
}
```

Configuration for webhook delivery.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| maxRetries | `number` | `3` | Maximum delivery attempts |
| retryBaseDelay | `number` | `1000` | Base delay for exponential backoff (ms) |
| defaultTimeout | `number` | `10000` | Default request timeout (ms) |

---

## SSEManagerConfig

```typescript
interface SSEManagerConfig {
  heartbeatInterval?: number;
}
```

Configuration for Server-Sent Events.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| heartbeatInterval | `number` | `30000` | Heartbeat interval in milliseconds |

---

## Complete Example

```typescript
import {
  RuleEngineServer,
  RuleEngine,
  Rule,
  onEvent,
  emit,
  setFact,
} from '@hamicek/noex-rules';

async function main() {
  // Option 1: Server creates and owns the engine
  const server = await RuleEngineServer.start({
    server: {
      port: 8080,
      cors: true,
      swagger: true,
      graphql: true,
    },
    engineConfig: {
      persistence: { enabled: true },
      audit: { enabled: true },
      metrics: { enabled: true },
    },
    webhookConfig: {
      maxRetries: 5,
      retryBaseDelay: 2000,
    },
  });

  // Access engine to register rules
  const engine = server.getEngine();

  await engine.registerRule(
    Rule.create('track-orders')
      .when(onEvent('order.placed'))
      .then(
        setFact('orders:${event.orderId}', { status: 'placed' }),
        emit('notification.send', { type: 'order_confirmation' })
      )
      .build()
  );

  console.log(`
    Server running at ${server.address}
    REST API: ${server.address}/api/v1
    GraphQL: ${server.address}/graphql
    Swagger: ${server.address}/documentation
  `);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
```

---

## Endpoints Summary

When server starts, the following endpoints are available:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/rules` | List all rules |
| `POST /api/v1/rules` | Create rule |
| `GET /api/v1/facts` | List all facts |
| `POST /api/v1/events/emit` | Emit event |
| `GET /api/v1/stream` | SSE event stream |
| `GET /api/v1/health` | Health check |
| `GET /api/v1/metrics` | Prometheus metrics |
| `GET /graphql` | GraphQL endpoint |
| `GET /documentation` | Swagger UI |

See [REST API](./25-rest-api.md) and [GraphQL API](./26-graphql-api.md) for complete endpoint documentation.

---

## See Also

- [REST API](./25-rest-api.md) — Complete REST endpoint reference
- [GraphQL API](./26-graphql-api.md) — GraphQL schema and operations
- [RuleEngine](./01-rule-engine.md) — Main engine class
- [Configuration](./30-configuration.md) — All configuration options
- [Observability](./21-observability.md) — Metrics and tracing
