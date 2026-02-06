# RuleEngineServer

HTTP server pro zpřístupnění funkcí RuleEngine přes REST API, GraphQL, webhooky a Server-Sent Events. Postaven na Fastify s volitelnou Swagger dokumentací.

## Import

```typescript
import {
  RuleEngineServer,
  // Typy
  ServerOptions,
  ServerConfig,
  ServerConfigInput,
  CorsConfig,
  GraphQLConfig,
} from '@hamicek/noex-rules';
```

---

## RuleEngineServer

Hlavní třída HTTP serveru, která obaluje RuleEngine a zpřístupňuje ho přes REST a GraphQL API. Spravuje životní cyklus připojených subsystémů včetně webhooků, SSE a metrik.

### Factory metoda

```typescript
static async start(options?: ServerOptions): Promise<RuleEngineServer>
```

Vytvoří a spustí HTTP server se všemi nakonfigurovanými funkcemi. Pokud není poskytnut engine, vytvoří nový.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| options | `ServerOptions` | ne | Konfigurační možnosti serveru |

**Návratová hodnota:** `Promise<RuleEngineServer>` — Běžící instance serveru

**Příklad:**

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

// Minimální — použije všechny výchozí hodnoty
const server = await RuleEngineServer.start();

console.log(`Server běží na ${server.address}`);
```

**Příklad s konfigurací:**

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

**Příklad s existujícím enginem:**

```typescript
import { RuleEngine, RuleEngineServer } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  persistence: { enabled: true },
});

// Registrace pravidel na enginu...

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

Vrací podkladovou instanci RuleEngine. Použijte pro programatickou interakci s enginem za běhu serveru.

**Návratová hodnota:** `RuleEngine` — Instance enginu

**Příklad:**

```typescript
const engine = server.getEngine();

await engine.registerRule(myRule);
await engine.emit('my-topic', { data: 'value' });

const stats = engine.getStats();
console.log(`Pravidla: ${stats.ruleCount}, Události: ${stats.eventCount}`);
```

---

### getWebhookManager()

```typescript
getWebhookManager(): WebhookManager
```

Vrací WebhookManager pro programatickou správu webhooků. Webhooky lze spravovat i přes REST API.

**Návratová hodnota:** `WebhookManager` — Instance správce webhooků

**Příklad:**

```typescript
const webhookManager = server.getWebhookManager();

// Registrace webhooku programaticky
webhookManager.register({
  url: 'https://example.com/webhook',
  patterns: ['order.*', 'payment.completed'],
  secret: 'my-secret',
});

const stats = webhookManager.getStats();
console.log(`Aktivní webhooky: ${stats.activeWebhookCount}`);
```

---

### getSSEManager()

```typescript
getSSEManager(): SSEManager
```

Vrací SSE manager pro sledování aktivních připojení. Klienti se připojují přes endpoint `GET /stream`.

**Návratová hodnota:** `SSEManager` — Instance SSE manageru

**Příklad:**

```typescript
const sseManager = server.getSSEManager();

const stats = sseManager.getStats();
console.log(`Aktivní SSE připojení: ${stats.activeConnections}`);
console.log(`Celkem odeslaných událostí: ${stats.totalEventsSent}`);
```

---

### getMetricsCollector()

```typescript
getMetricsCollector(): MetricsCollector | null
```

Vrací MetricsCollector pokud jsou metriky povoleny. Vrací `null` pokud jsou metriky vypnuty na enginu i serveru.

**Návratová hodnota:** `MetricsCollector | null` — Kolektor metrik nebo null

**Příklad:**

```typescript
const metrics = server.getMetricsCollector();

if (metrics) {
  const data = metrics.getMetrics();
  console.log(`Exekuce pravidel: ${data.ruleExecutions.total}`);
}
```

---

### address (getter)

```typescript
get address(): string
```

Vrací plnou adresu serveru včetně protokolu, hostu a portu.

**Návratová hodnota:** `string` — Adresa serveru (např. `http://localhost:7226`)

**Příklad:**

```typescript
console.log(`API dostupné na ${server.address}/api/v1`);
// Výstup: API dostupné na http://localhost:7226/api/v1
```

---

### port (getter)

```typescript
get port(): number
```

Vrací nakonfigurované číslo portu.

**Návratová hodnota:** `number` — Číslo portu

**Příklad:**

```typescript
console.log(`Server naslouchá na portu ${server.port}`);
```

---

### stop()

```typescript
async stop(): Promise<void>
```

Elegantně zastaví server. Uzavře všechna SSE připojení, zastaví sběr metrik (pokud vlastněn serverem), uzavře HTTP server a zastaví engine (pokud vytvořen serverem).

**Příklad:**

```typescript
// Elegantní ukončení
process.on('SIGTERM', async () => {
  console.log('Ukončování...');
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

Možnosti pro vytvoření instance RuleEngineServer.

| Pole | Typ | Popis |
|------|-----|-------|
| server | `ServerConfigInput` | Konfigurace HTTP serveru |
| engine | `RuleEngine` | Existující instance enginu (pokud není poskytnuta, vytvoří novou) |
| engineConfig | `RuleEngineConfig` | Konfigurace pro nový engine (ignorováno pokud je `engine` poskytnut) |
| webhookConfig | `WebhookManagerConfig` | Konfigurace doručování webhooků |
| sseConfig | `SSEManagerConfig` | Konfigurace SSE připojení |
| metricsConfig | `MetricsConfig` | Konfigurace Prometheus metrik |

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

Úplná konfigurace serveru (vyřešená z `ServerConfigInput`).

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| port | `number` | `7226` | Port pro naslouchání |
| host | `string` | `'0.0.0.0'` | Adresa hostu pro binding |
| apiPrefix | `string` | `'/api/v1'` | Prefix cesty REST API |
| cors | `boolean \| CorsConfig` | `true` | Konfigurace CORS |
| swagger | `boolean` | `true` | Povolit Swagger/OpenAPI dokumentaci |
| logger | `boolean` | `true` | Povolit Fastify logování |
| graphql | `boolean \| GraphQLConfig` | `true` | Konfigurace GraphQL API |
| fastifyOptions | `FastifyServerOptions` | — | Dodatečné Fastify možnosti |

---

## ServerConfigInput

```typescript
type ServerConfigInput = Partial<ServerConfig>;
```

Částečná konfigurace serveru. Všechna pole jsou volitelná s rozumnými výchozími hodnotami.

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

Konfigurace CORS pro cross-origin požadavky.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| origin | `boolean \| string \| string[] \| RegExp \| Function` | `true` | Povolené origins |
| methods | `string[]` | `['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']` | Povolené HTTP metody |
| allowedHeaders | `string[]` | `['Content-Type', 'Authorization', 'X-Requested-With']` | Povolené hlavičky požadavku |
| exposedHeaders | `string[]` | `['X-Request-Id']` | Hlavičky vystavené klientovi |
| credentials | `boolean` | `false` | Povolit credentials (cookies, auth hlavičky) |
| maxAge | `number` | `86400` | Doba cache preflight v sekundách |
| preflightContinue | `boolean` | `false` | Předat preflight dalšímu handleru |
| optionsSuccessStatus | `number` | `204` | Stavový kód pro úspěšný OPTIONS |

**Příklad:**

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

Konfigurace GraphQL API.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| graphiql | `boolean` | `true` | Povolit GraphiQL IDE playground |
| path | `string` | `'/graphql'` | Cesta GraphQL endpointu |
| subscriptions | `boolean` | `true` | Povolit WebSocket subscriptions |

**Příklad:**

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

Konfigurace doručování webhooků.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| maxRetries | `number` | `3` | Maximální počet pokusů o doručení |
| retryBaseDelay | `number` | `1000` | Základní zpoždění pro exponential backoff (ms) |
| defaultTimeout | `number` | `10000` | Výchozí timeout požadavku (ms) |

---

## SSEManagerConfig

```typescript
interface SSEManagerConfig {
  heartbeatInterval?: number;
}
```

Konfigurace Server-Sent Events.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| heartbeatInterval | `number` | `30000` | Interval heartbeatu v milisekundách |

---

## Kompletní příklad

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
  // Možnost 1: Server vytvoří a vlastní engine
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

  // Přístup k enginu pro registraci pravidel
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
    Server běží na ${server.address}
    REST API: ${server.address}/api/v1
    GraphQL: ${server.address}/graphql
    Swagger: ${server.address}/documentation
  `);

  // Elegantní ukončení
  const shutdown = async () => {
    console.log('Ukončování...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
```

---

## Přehled endpointů

Po startu serveru jsou dostupné následující endpointy:

| Endpoint | Popis |
|----------|-------|
| `GET /api/v1/rules` | Seznam všech pravidel |
| `POST /api/v1/rules` | Vytvoření pravidla |
| `GET /api/v1/facts` | Seznam všech faktů |
| `POST /api/v1/events/emit` | Emitování události |
| `GET /api/v1/stream` | SSE stream událostí |
| `GET /api/v1/health` | Health check |
| `GET /api/v1/metrics` | Prometheus metriky |
| `GET /graphql` | GraphQL endpoint |
| `GET /documentation` | Swagger UI |

Viz [REST API](./25-rest-api.md) a [GraphQL API](./26-graphql-api.md) pro kompletní dokumentaci endpointů.

---

## Viz také

- [REST API](./25-rest-api.md) — Kompletní reference REST endpointů
- [GraphQL API](./26-graphql-api.md) — GraphQL schéma a operace
- [RuleEngine](./01-rule-engine.md) — Hlavní třída enginu
- [Konfigurace](./30-configuration.md) — Všechny konfigurační možnosti
- [Observabilita](./21-observability.md) — Metriky a tracing
