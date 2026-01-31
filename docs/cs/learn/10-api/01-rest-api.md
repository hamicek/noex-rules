# REST API

noex-rules obsahuje produkčně připraveným HTTP server postavený na Fastify. Jedním voláním `RuleEngineServer.start()` získáte kompletní REST API pro správu pravidel, faktů, eventů, časovačů a skupin — plus automatickou Swagger dokumentaci, CORS handling a health checky. Tato kapitola prochází nastavení serveru, každý endpoint a praktické curl příklady, které můžete spustit proti běžícímu serveru.

## Co se naučíte

- Jak spustit a nakonfigurovat HTTP server pomocí `RuleEngineServer.start()`
- Kompletní referenční přehled REST endpointů: pravidla, fakta, eventy, časovače, skupiny, health
- Jak použít Swagger/OpenAPI dokumentaci na `/documentation`
- Možnosti konfigurace CORS pro cross-origin přístup
- Praktické curl příklady pro vytváření pravidel, emitování eventů a dotazování faktů

## Spuštění serveru

Nejjednodušší způsob spuštění serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start();

console.log(`Server běží na ${server.address}`);
// Server běží na http://0.0.0.0:7226
```

Toto spustí Fastify HTTP server na portu 7226 se všemi výchozími hodnotami: CORS povolený, Swagger povolený, GraphQL povolený a logování requestů povoleno. Server automaticky vytvoří instanci `RuleEngine`, spustí ji a prováže všechny routy.

### Konfigurace

Každý aspekt serveru je konfigurovatelný:

```typescript
const server = await RuleEngineServer.start({
  server: {
    port: 3000,              // Výchozí: 7226
    host: 'localhost',       // Výchozí: '0.0.0.0'
    apiPrefix: '/api/v2',    // Výchozí: '/api/v1'
    cors: true,              // Výchozí: true (viz sekce CORS níže)
    swagger: true,           // Výchozí: true
    logger: true,            // Výchozí: true
    graphql: true,           // Výchozí: true (viz kapitola 10.3)
  },

  // Varianta A: Předejte existující engine
  engine: myExistingEngine,

  // Varianta B: Nechte server vytvořit nový (ignorováno pokud je engine předán)
  engineConfig: {
    persistence: { adapter: sqliteAdapter },
    backwardChaining: { maxDepth: 15 },
  },

  // Nastavení doručování webhooků (viz kapitola 10.2)
  webhookConfig: {
    maxRetries: 3,
    retryBaseDelay: 1000,
    defaultTimeout: 10000,
  },

  // Nastavení SSE heartbeatu (viz kapitola 10.2)
  sseConfig: {
    heartbeatInterval: 30000,
  },

  // Prometheus metriky (viz kapitola 8.4)
  metricsConfig: {
    enabled: true,
  },
});
```

### Životní cyklus serveru

```typescript
// Přístup k podkladovému enginu
const engine = server.getEngine();

// Přístup k adrese a portu serveru
console.log(server.address); // http://localhost:3000
console.log(server.port);    // 3000

// Elegantní ukončení: zastaví SSE, zavře HTTP spojení, zastaví engine
await server.stop();
```

Pokud předáte vlastní instanci `engine`, `server.stop()` zavře HTTP server, ale **nezastaví** engine — ten spravujete odděleně. Pokud server vytvořil engine interně, zastaví oba.

## Reference endpointů

Všechny endpointy používají nakonfigurovaný API prefix (výchozí: `/api/v1`).

### Pravidla

| Metoda | Endpoint | Popis | Status |
|--------|----------|-------|--------|
| GET | `/rules` | Výpis všech pravidel | 200 |
| GET | `/rules/:id` | Získání pravidla podle ID | 200 / 404 |
| POST | `/rules` | Vytvoření nového pravidla | 201 |
| POST | `/rules/validate` | Validace pravidla (dry-run, bez registrace) | 200 |
| PUT | `/rules/:id` | Částečná aktualizace | 200 / 404 |
| DELETE | `/rules/:id` | Smazání pravidla | 204 / 404 |
| POST | `/rules/:id/enable` | Povolení pravidla | 200 / 404 |
| POST | `/rules/:id/disable` | Zakázání pravidla | 200 / 404 |

### Verze pravidel

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/rules/:id/versions` | Historie verzí pravidla |
| GET | `/rules/:id/versions/:version` | Získání konkrétního snapshotu verze |
| POST | `/rules/:id/rollback` | Rollback na předchozí verzi |
| GET | `/rules/:id/diff` | Diff dvou verzí |

### Skupiny

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/groups` | Výpis všech skupin |
| GET | `/groups/:id` | Získání skupiny podle ID |
| POST | `/groups` | Vytvoření nové skupiny |
| PUT | `/groups/:id` | Aktualizace skupiny |
| DELETE | `/groups/:id` | Smazání skupiny |
| POST | `/groups/:id/enable` | Povolení skupiny |
| POST | `/groups/:id/disable` | Zakázání skupiny |
| GET | `/groups/:id/rules` | Výpis pravidel ve skupině |

### Fakta

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/facts` | Výpis všech faktů |
| GET | `/facts/:key` | Získání faktu podle klíče |
| PUT | `/facts/:key` | Nastavení/aktualizace hodnoty faktu |
| DELETE | `/facts/:key` | Smazání faktu |
| POST | `/facts/query` | Dotaz na fakta podle glob patternu |

### Eventy

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| POST | `/events` | Emitování eventu |
| POST | `/events/correlated` | Emitování korelovaného eventu se sledovacími ID |

### Časovače

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/timers` | Výpis všech aktivních časovačů |
| GET | `/timers/:name` | Získání časovače podle jména |
| POST | `/timers` | Vytvoření časovače |
| DELETE | `/timers/:name` | Zrušení časovače |

### Health a statistiky

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/health` | Health check (status, uptime, verze) |
| GET | `/stats` | Agregované statistiky enginu |
| GET | `/metrics` | Prometheus metriky (text/plain) |

### Audit, debug a streaming

Tyto endpointy jsou detailně popsány v předchozích kapitolách ([8.1 Debugging](../08-pozorovatelnost/01-debugging.md), [8.3 Audit logging](../08-pozorovatelnost/03-audit-log.md)) a v další kapitole ([10.2 Notifikace v reálném čase](./02-realtime.md)):

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/audit/entries` | Dotaz na audit záznamy s filtry |
| GET | `/audit/export` | Export audit záznamů (JSON/CSV) |
| GET | `/audit/stream` | SSE real-time audit stream |
| GET | `/stream/events` | SSE event stream |
| GET | `/webhooks` | Výpis registrovaných webhooků |
| POST | `/webhooks` | Registrace nového webhooku |
| GET | `/debug/history` | Dotaz na historii eventů |
| GET | `/debug/profile` | Všechna profilovací data pravidel |
| GET | `/debug/traces` | Poslední trace záznamy |

## Curl příklady

Spusťte server a spusťte tyto příklady proti němu:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});
```

### Vytvoření pravidla

```bash
curl -X POST http://localhost:7226/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-alert",
    "name": "Order Alert",
    "description": "Upozornění při objednávce vysoké hodnoty",
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

### Výpis pravidel

```bash
curl http://localhost:7226/api/v1/rules | jq
```

### Validace pravidla (dry run)

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

### Emitování eventu

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "order.created",
    "data": { "orderId": "ord-1", "total": 2500, "customerId": "c-42" }
  }'
```

### Emitování korelovaného eventu

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

### Nastavení faktu

```bash
curl -X PUT http://localhost:7226/api/v1/facts/customer:c-42:tier \
  -H "Content-Type: application/json" \
  -d '{ "value": "vip" }'
```

### Dotaz na fakta podle patternu

```bash
curl -X POST http://localhost:7226/api/v1/facts/query \
  -H "Content-Type: application/json" \
  -d '{ "pattern": "customer:c-42:*" }'
```

### Vytvoření časovače

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

### Health check

```bash
curl http://localhost:7226/api/v1/health | jq
```

Odpověď:

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

## Swagger / OpenAPI dokumentace

Když je `swagger: true` (výchozí), server registruje Swagger UI na:

```
http://localhost:7226/documentation
```

UI poskytuje:
- Interaktivní prohledávač endpointů s funkcionalitou "Try it out"
- Dokumentaci schémat requestů/responsů pro každý endpoint
- Zobrazení doby trvání requestu
- Deep linking pro sdílení konkrétních URL endpointů

OpenAPI 3.0.3 specifikace je generována ze schémat rout automaticky. Můžete ji použít s nástroji jako Postman, Insomnia nebo generátory kódu.

## Konfigurace CORS

Ve výchozím nastavení jsou povoleny všechny origins. Pro produkci přístup omezte:

```typescript
const server = await RuleEngineServer.start({
  server: {
    cors: {
      origin: ['https://dashboard.example.com', 'https://admin.example.com'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id'],
      credentials: true,
      maxAge: 86400, // 24 hodin cache pro preflight
    },
  },
});
```

Pro úplné vypnutí CORS:

```typescript
const server = await RuleEngineServer.start({
  server: { cors: false },
});
```

## Kompletní příklad: API pro správu objednávek

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event } from '@hamicek/noex-rules/dsl';

// Spuštění serveru s vlastním portem
const server = await RuleEngineServer.start({
  server: { port: 3000 },
});

const engine = server.getEngine();

// Registrace pravidel programaticky (nebo přes POST /rules)
engine.registerRule(
  Rule.create('track-order')
    .name('Sledování stavu objednávky')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(setFact('order:${event.orderId}:total', '${event.total}'))
    .build()
);

engine.registerRule(
  Rule.create('high-value-alert')
    .name('Upozornění na objednávku vysoké hodnoty')
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
    .name('Platba přijata')
    .when(onEvent('payment.completed'))
    .then(setFact('order:${event.orderId}:status', 'paid'))
    .also(emit('order.status-changed', {
      orderId: '${event.orderId}',
      status: 'paid',
    }))
    .build()
);

console.log(`API pro správu objednávek běží na ${server.address}`);
console.log(`Swagger dokumentace: ${server.address}/documentation`);

// Externí služby nyní mohou:
// POST /api/v1/events  { "topic": "order.created", "data": { ... } }
// GET  /api/v1/facts/order:ord-1:status
// GET  /api/v1/rules
```

## Cvičení

1. Spusťte server na portu 4000 se zapnutým Swaggerem
2. Pomocí curl (nebo Swagger UI) vytvořte pravidlo, které nastaví fakt `sensor:{sensorId}:alert` na `true`, když event `sensor.reading` má `temperature > 80`
3. Emitujte event `sensor.reading` s `{ "sensorId": "s-1", "temperature": 95 }`
4. Dotažte se na fakt `sensor:s-1:alert` přes REST API a ověřte, že je `true`
5. Deaktivujte pravidlo přes `POST /rules/:id/disable` a emitujte další event — ověřte, že nový alert nevznikl

<details>
<summary>Řešení</summary>

Spuštění serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: { port: 4000 },
});

console.log(`Server běží na ${server.address}`);
```

Vytvoření pravidla:

```bash
curl -X POST http://localhost:4000/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "temp-alert",
    "name": "Teplotní alert",
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

Emitování eventu:

```bash
curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 95 }
  }'
```

Ověření faktu:

```bash
curl http://localhost:4000/api/v1/facts/sensor:s-1:alert | jq
# { "key": "sensor:s-1:alert", "value": true, ... }
```

Deaktivace pravidla:

```bash
curl -X POST http://localhost:4000/api/v1/rules/temp-alert/disable
```

Emitování dalšího eventu a ověření, že nový fakt nevznikl:

```bash
curl -X DELETE http://localhost:4000/api/v1/facts/sensor:s-1:alert

curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 90 }
  }'

curl http://localhost:4000/api/v1/facts/sensor:s-1:alert
# 404 — fakt není nastaven, protože pravidlo je deaktivované
```

</details>

## Shrnutí

- `RuleEngineServer.start()` spustí Fastify HTTP server s REST, GraphQL, SSE, Swaggerem a CORS
- Výchozí konfigurace: port 7226, všechny origins povoleny, Swagger na `/documentation`, GraphQL na `/graphql`
- REST API vystavuje CRUD endpointy pro pravidla, skupiny, fakta, eventy a časovače pod `/api/v1`
- `POST /rules/validate` provádí dry-run validaci bez registrace pravidla
- `POST /events/correlated` emituje eventy s `correlationId` a `causationId` pro distribuovaný tracing
- Health check na `GET /health` vrací status serveru, uptime, verzi a stav enginu
- Swagger UI poskytuje interaktivní dokumentaci s funkcionalitou "Try it out"
- CORS je plně konfigurovatelný — omezte origins, metody, hlavičky a credentials pro produkci
- Pokud předáte existující engine, `server.stop()` zavře pouze HTTP server; jinak zastaví oba

---

Další: [Notifikace v reálném čase](./02-realtime.md)
