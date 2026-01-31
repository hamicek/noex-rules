# REST API

noex-rules obsahuje produkcne pripravenym HTTP server postaveny na Fastify. Jednim volanim `RuleEngineServer.start()` ziskate kompletni REST API pro spravu pravidel, faktu, eventu, casovacu a skupin — plus automatickou Swagger dokumentaci, CORS handling a health checky. Tato kapitola prochazi nastaveni serveru, kazdy endpoint a prakticke curl priklady, ktere muzete spustit proti bezicimu serveru.

## Co se naucite

- Jak spustit a nakonfigurovat HTTP server pomoci `RuleEngineServer.start()`
- Kompletni referencni prehled REST endpointu: pravidla, fakta, eventy, casovace, skupiny, health
- Jak pouzit Swagger/OpenAPI dokumentaci na `/documentation`
- Moznosti konfigurace CORS pro cross-origin pristup
- Prakticke curl priklady pro vytvareni pravidel, emitovani eventu a dotazovani faktu

## Spusteni serveru

Nejjednodussi zpusob spusteni serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start();

console.log(`Server bezi na ${server.address}`);
// Server bezi na http://0.0.0.0:7226
```

Toto spusti Fastify HTTP server na portu 7226 se vsemi vychozimi hodnotami: CORS povoleny, Swagger povoleny, GraphQL povoleny a logovani requestu povoleno. Server automaticky vytvori instanci `RuleEngine`, spusti ji a provaze vsechny routy.

### Konfigurace

Kazdy aspekt serveru je konfigurovatelny:

```typescript
const server = await RuleEngineServer.start({
  server: {
    port: 3000,              // Vychozi: 7226
    host: 'localhost',       // Vychozi: '0.0.0.0'
    apiPrefix: '/api/v2',    // Vychozi: '/api/v1'
    cors: true,              // Vychozi: true (viz sekce CORS nize)
    swagger: true,           // Vychozi: true
    logger: true,            // Vychozi: true
    graphql: true,           // Vychozi: true (viz kapitola 10.3)
  },

  // Varianta A: Predejte existujici engine
  engine: myExistingEngine,

  // Varianta B: Nechte server vytvorit novy (ignorovano pokud je engine predan)
  engineConfig: {
    persistence: { adapter: sqliteAdapter },
    backwardChaining: { maxDepth: 15 },
  },

  // Nastaveni dorucovani webhooku (viz kapitola 10.2)
  webhookConfig: {
    maxRetries: 3,
    retryBaseDelay: 1000,
    defaultTimeout: 10000,
  },

  // Nastaveni SSE heartbeatu (viz kapitola 10.2)
  sseConfig: {
    heartbeatInterval: 30000,
  },

  // Prometheus metriky (viz kapitola 8.4)
  metricsConfig: {
    enabled: true,
  },
});
```

### Zivotni cyklus serveru

```typescript
// Pristup k podkladovemu enginu
const engine = server.getEngine();

// Pristup k adrese a portu serveru
console.log(server.address); // http://localhost:3000
console.log(server.port);    // 3000

// Elegantni ukonceni: zastavi SSE, zavre HTTP spojeni, zastavi engine
await server.stop();
```

Pokud predate vlastni instanci `engine`, `server.stop()` zavre HTTP server, ale **nezastavi** engine — ten spravujete oddelene. Pokud server vytvoril engine interni, zastavi oba.

## Reference endpointu

Vsechny endpointy pouzivaji nakonfigurovany API prefix (vychozi: `/api/v1`).

### Pravidla

| Metoda | Endpoint | Popis | Status |
|--------|----------|-------|--------|
| GET | `/rules` | Vypis vsech pravidel | 200 |
| GET | `/rules/:id` | Ziskani pravidla podle ID | 200 / 404 |
| POST | `/rules` | Vytvoreni noveho pravidla | 201 |
| POST | `/rules/validate` | Validace pravidla (dry-run, bez registrace) | 200 |
| PUT | `/rules/:id` | Castecna aktualizace | 200 / 404 |
| DELETE | `/rules/:id` | Smazani pravidla | 204 / 404 |
| POST | `/rules/:id/enable` | Povoleni pravidla | 200 / 404 |
| POST | `/rules/:id/disable` | Zakazani pravidla | 200 / 404 |

### Verze pravidel

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/rules/:id/versions` | Historie verzi pravidla |
| GET | `/rules/:id/versions/:version` | Ziskani konkretniho snapshotu verze |
| POST | `/rules/:id/rollback` | Rollback na predchozi verzi |
| GET | `/rules/:id/diff` | Diff dvou verzi |

### Skupiny

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/groups` | Vypis vsech skupin |
| GET | `/groups/:id` | Ziskani skupiny podle ID |
| POST | `/groups` | Vytvoreni nove skupiny |
| PUT | `/groups/:id` | Aktualizace skupiny |
| DELETE | `/groups/:id` | Smazani skupiny |
| POST | `/groups/:id/enable` | Povoleni skupiny |
| POST | `/groups/:id/disable` | Zakazani skupiny |
| GET | `/groups/:id/rules` | Vypis pravidel ve skupine |

### Fakta

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/facts` | Vypis vsech faktu |
| GET | `/facts/:key` | Ziskani faktu podle klice |
| PUT | `/facts/:key` | Nastaveni/aktualizace hodnoty faktu |
| DELETE | `/facts/:key` | Smazani faktu |
| POST | `/facts/query` | Dotaz na fakta podle glob patternu |

### Eventy

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| POST | `/events` | Emitovani eventu |
| POST | `/events/correlated` | Emitovani korelovaneho eventu se sledovacimi ID |

### Casovace

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/timers` | Vypis vsech aktivnich casovacu |
| GET | `/timers/:name` | Ziskani casovace podle jmena |
| POST | `/timers` | Vytvoreni casovace |
| DELETE | `/timers/:name` | Zruseni casovace |

### Health a statistiky

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/health` | Health check (status, uptime, verze) |
| GET | `/stats` | Agregovane statistiky enginu |
| GET | `/metrics` | Prometheus metriky (text/plain) |

### Audit, debug a streaming

Tyto endpointy jsou detailne popsany v predchozich kapitolach ([8.1 Debugging](../08-pozorovatelnost/01-debugging.md), [8.3 Audit logging](../08-pozorovatelnost/03-audit-log.md)) a v dalsi kapitole ([10.2 Notifikace v realnem case](./02-realtime.md)):

| Metoda | Endpoint | Popis |
|--------|----------|-------|
| GET | `/audit/entries` | Dotaz na audit zaznamy s filtry |
| GET | `/audit/export` | Export audit zaznamu (JSON/CSV) |
| GET | `/audit/stream` | SSE real-time audit stream |
| GET | `/stream/events` | SSE event stream |
| GET | `/webhooks` | Vypis registrovanych webhooku |
| POST | `/webhooks` | Registrace noveho webhooku |
| GET | `/debug/history` | Dotaz na historii eventu |
| GET | `/debug/profile` | Vsechna profilovaci data pravidel |
| GET | `/debug/traces` | Posledni trace zaznamy |

## Curl priklady

Spustte server a spustte tyto priklady proti nemu:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});
```

### Vytvoreni pravidla

```bash
curl -X POST http://localhost:7226/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-alert",
    "name": "Order Alert",
    "description": "Upozorneni pri objednavce vysoke hodnoty",
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

### Vypis pravidel

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

### Emitovani eventu

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "order.created",
    "data": { "orderId": "ord-1", "total": 2500, "customerId": "c-42" }
  }'
```

### Emitovani korelovaneho eventu

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

### Nastaveni faktu

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

### Vytvoreni casovace

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

Odpoved:

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

Kdyz je `swagger: true` (vychozi), server registruje Swagger UI na:

```
http://localhost:7226/documentation
```

UI poskytuje:
- Interaktivni prohledavac endpointu s funkcionalitou "Try it out"
- Dokumentaci schemat requestu/responsu pro kazdy endpoint
- Zobrazeni doby trvani requestu
- Deep linking pro sdileni konkretnich URL endpointu

OpenAPI 3.0.3 specifikace je generovana ze schemat rout automaticky. Muzete ji pouzit s nastroji jako Postman, Insomnia nebo generatory kodu.

## Konfigurace CORS

Ve vychozim nastaveni jsou povoleny vsechny origins. Pro produkci pristup omezte:

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

Pro uplne vypnuti CORS:

```typescript
const server = await RuleEngineServer.start({
  server: { cors: false },
});
```

## Kompletni priklad: API pro spravu objednavek

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event } from '@hamicek/noex-rules/dsl';

// Spusteni serveru s vlastnim portem
const server = await RuleEngineServer.start({
  server: { port: 3000 },
});

const engine = server.getEngine();

// Registrace pravidel programaticky (nebo pres POST /rules)
engine.registerRule(
  Rule.create('track-order')
    .name('Sledovani stavu objednavky')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(setFact('order:${event.orderId}:total', '${event.total}'))
    .build()
);

engine.registerRule(
  Rule.create('high-value-alert')
    .name('Upozorneni na objednavku vysoke hodnoty')
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
    .name('Platba prijata')
    .when(onEvent('payment.completed'))
    .then(setFact('order:${event.orderId}:status', 'paid'))
    .also(emit('order.status-changed', {
      orderId: '${event.orderId}',
      status: 'paid',
    }))
    .build()
);

console.log(`API pro spravu objednavek bezi na ${server.address}`);
console.log(`Swagger dokumentace: ${server.address}/documentation`);

// Externi sluzby nyni mohou:
// POST /api/v1/events  { "topic": "order.created", "data": { ... } }
// GET  /api/v1/facts/order:ord-1:status
// GET  /api/v1/rules
```

## Cviceni

1. Spustte server na portu 4000 se zapnutym Swaggerem
2. Pomoci curl (nebo Swagger UI) vytvorte pravidlo, ktere nastavi fakt `sensor:{sensorId}:alert` na `true`, kdyz event `sensor.reading` ma `temperature > 80`
3. Emitujte event `sensor.reading` s `{ "sensorId": "s-1", "temperature": 95 }`
4. Dotazte se na fakt `sensor:s-1:alert` pres REST API a overte, ze je `true`
5. Deaktivujte pravidlo pres `POST /rules/:id/disable` a emitujte dalsi event — overte, ze novy alert nevznikl

<details>
<summary>Reseni</summary>

Spusteni serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: { port: 4000 },
});

console.log(`Server bezi na ${server.address}`);
```

Vytvoreni pravidla:

```bash
curl -X POST http://localhost:4000/api/v1/rules \
  -H "Content-Type: application/json" \
  -d '{
    "id": "temp-alert",
    "name": "Teplotni alert",
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

Emitovani eventu:

```bash
curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 95 }
  }'
```

Overeni faktu:

```bash
curl http://localhost:4000/api/v1/facts/sensor:s-1:alert | jq
# { "key": "sensor:s-1:alert", "value": true, ... }
```

Deaktivace pravidla:

```bash
curl -X POST http://localhost:4000/api/v1/rules/temp-alert/disable
```

Emitovani dalsiho eventu a overeni, ze novy fakt nevznikl:

```bash
curl -X DELETE http://localhost:4000/api/v1/facts/sensor:s-1:alert

curl -X POST http://localhost:4000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 90 }
  }'

curl http://localhost:4000/api/v1/facts/sensor:s-1:alert
# 404 — fakt neni nastaven, protoze pravidlo je deaktivovane
```

</details>

## Shrnuti

- `RuleEngineServer.start()` spusti Fastify HTTP server s REST, GraphQL, SSE, Swaggerem a CORS
- Vychozi konfigurace: port 7226, vsechny origins povoleny, Swagger na `/documentation`, GraphQL na `/graphql`
- REST API vystavuje CRUD endpointy pro pravidla, skupiny, fakta, eventy a casovace pod `/api/v1`
- `POST /rules/validate` provadi dry-run validaci bez registrace pravidla
- `POST /events/correlated` emituje eventy s `correlationId` a `causationId` pro distribuovany tracing
- Health check na `GET /health` vraci status serveru, uptime, verzi a stav enginu
- Swagger UI poskytuje interaktivni dokumentaci s funkcionalitou "Try it out"
- CORS je plne konfigurovatelny — omezte origins, metody, hlavicky a credentials pro produkci
- Pokud predate existujici engine, `server.stop()` zavre pouze HTTP server; jinak zastavi oba

---

Dalsi: [Notifikace v realnem case](./02-realtime.md)
