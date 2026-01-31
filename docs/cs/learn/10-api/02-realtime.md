# Notifikace v realnem case

REST endpointy fungují na principu request-response: klient se zepta, server odpovi. Pravidlove enginy jsou vsak ze sve podstaty reaktivni — eventy spousti pravidla, pravidla produji nove eventy a externi systemy o nich potrebuji vedet **v okamziku jejich vzniku**. noex-rules poskytuje dva push mechanismy: **Server-Sent Events (SSE)** pro prohlizece a lehke klienty, a **webhooky** pro server-to-server dorucovani s HMAC podpisy a retry logikou.

## Co se naucite

- Jak se pripojit k SSE event streamu s filtrovanim podle topic patternu
- Tvorbu real-time dashboardu pomoci browseroveho API `EventSource`
- Registraci webhooku s overovanim HMAC-SHA256 podpisu
- Webhook retry logiku s exponencialnim backoffem
- Volbu mezi SSE a webhooky pro ruzne pripady pouziti
- Spravu pripojeni a monitoring statistik dorucovani

## Server-Sent Events (SSE)

SSE je browserove-nativni protokol pro prijem jednosmerneho streamu eventu ze serveru. Klient otevre dlouhodobe HTTP spojeni a server pushuje eventy, jak nastaly.

### Architektura

```text
  ┌──────────┐                   ┌─────────────────┐
  │  Prohlizec│── GET /stream ──▶│  noex-rules      │
  │  nebo CLI │   events?       │  SSE Manager     │
  │  klient   │◀─ data: {...} ──│                   │
  │           │◀─ data: {...} ──│  (filtruje eventy │
  │           │◀─ : heartbeat ──│   podle topic     │
  │           │                  │   patternu)       │
  └──────────┘                   └─────────────────┘
```

### Pripojeni ke streamu

SSE endpoint je na `GET /api/v1/stream/events`. Pomoci query parametru `patterns` filtrujte, ktere eventy prijimat:

```bash
# Vsechny eventy
curl -N http://localhost:7226/api/v1/stream/events

# Pouze objednavkove eventy
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*

# Vice patternu
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*,payment.completed
```

Server odpovi SSE hlavickami a drzi spojeni otevrene:

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

**Radky zacinajici `:`** jsou SSE komentare — komentar `connected:` potvrzuje ID pripojeni a komentare `heartbeat` (kazdy 30 sekund ve vychozim nastaveni) drzi spojeni aktivni pres proxy a load balancery.

### Matchovani topic patternu

Patterny pouzivaji teckou oddelene segmenty s podporou wildcardu:

| Pattern | Matchuje | Nematchuje |
|---------|----------|------------|
| `*` | Vsechno | — |
| `order.*` | `order.created`, `order.paid` | `payment.completed` |
| `order.created` | pouze `order.created` | `order.paid` |
| `alert.*` | `alert.high-value`, `alert.fraud` | `order.alert` |

Vychozi pattern (kdyz `patterns` chybi) je `*` — vsechny eventy.

### Browserovy EventSource klient

API `EventSource` je soucasti kazdeho moderniho prohlizece:

```typescript
// Pripojeni k SSE streamu
const source = new EventSource(
  'http://localhost:7226/api/v1/stream/events?patterns=order.*,alert.*'
);

source.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`[${data.topic}]`, data.data);

  // Aktualizace dashboardu
  updateDashboard(data);
};

source.onerror = (error) => {
  console.error('Chyba SSE pripojeni:', error);
  // EventSource se automaticky znovu pripoji
};
```

`EventSource` zvlada opetovne pripojeni automaticky — pokud spojeni spadne, prohlizec to zkusi znovu s exponencialnim backoffem. Neni potreba zadna manualni logika pro opetovne pripojeni.

### Konfigurace SSE

Nakonfigurujte interval heartbeatu pri spousteni serveru:

```typescript
const server = await RuleEngineServer.start({
  sseConfig: {
    heartbeatInterval: 15000, // 15 sekund (vychozi: 30000)
  },
});
```

### Statistiky a pripojeni SSE

Monitorujte aktivni SSE pripojeni pres REST endpointy:

```bash
# Statistiky pripojeni
curl http://localhost:7226/api/v1/stream/stats | jq
# { "activeConnections": 5, "totalEventsSent": 12345 }

# Vypis aktivnich pripojeni
curl http://localhost:7226/api/v1/stream/connections | jq
# [{ "id": "sse-170...", "patterns": ["order.*"], "connectedAt": 1706745600000 }]
```

## Webhooky

Webhooky posilaji eventy na externi HTTP endpointy. Na rozdil od SSE (kde se klient pripojuje k vam) jsou webhooky server-to-server: zaregistrujete URL a noex-rules posila POST requesty na nej, kdykoli nastanou odpovidajici eventy.

### Architektura

```text
  ┌──────────────────┐         ┌─────────────────┐         ┌──────────────────┐
  │  RuleEngine       │────────▶│  Webhook Manager │────────▶│  Vase sluzba     │
  │  emituje eventy   │         │                  │         │                  │
  │                    │         │  - Pattern match │  POST   │  POST /webhook   │
  │                    │         │  - HMAC podpis   │────────▶│  X-Webhook-      │
  │                    │         │  - Retry pri     │         │  Signature: ...  │
  │                    │         │    selhani       │         │                  │
  └──────────────────┘         └─────────────────┘         └──────────────────┘
```

### Registrace webhooku

```bash
curl -X POST http://localhost:7226/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://my-service.example.com/webhook",
    "patterns": ["order.*", "payment.completed"],
    "secret": "muj-webhook-secret",
    "headers": { "X-Custom-Header": "moje-hodnota" },
    "timeout": 10000
  }'
```

Odpoved:

```json
{
  "id": "a1b2c3d4-...",
  "url": "https://my-service.example.com/webhook",
  "patterns": ["order.*", "payment.completed"],
  "enabled": true,
  "createdAt": 1706745600000
}
```

### Format webhook payloadu

Kdyz nastane odpovidajici event, noex-rules posle POST request s timto JSON telem:

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

### HMAC-SHA256 podpisy

Kdyz je pri registraci zadan `secret`, kazdy webhook request obsahuje hlavicku `X-Webhook-Signature`:

```
X-Webhook-Signature: sha256=a1b2c3d4e5f6...
```

Podpis se pocita jako `HMAC-SHA256(secret, JSON telo)`. Overeni na prijimaci strane:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

const app = express();
app.use(express.raw({ type: 'application/json' }));

const WEBHOOK_SECRET = 'muj-webhook-secret';

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const body = req.body as Buffer;

  // Vypocet ocekavaneho podpisu
  const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  // Konstantne casove porovnani pro prevenci timing utoku
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(401).send('Neplatny podpis');
  }

  const payload = JSON.parse(body.toString());
  console.log(`Webhook prijat: ${payload.event.topic}`, payload.event.data);

  res.status(200).send('OK');
});
```

### Retry logika

Kdyz doruceni webhooku selze (ne-2xx odpoved nebo sitova chyba), manager to zkusi znovu s **exponencialnim backoffem**:

```text
  Pokus 1  ──▶  Selhal
       │
       ▼  cekani 1000ms
  Pokus 2  ──▶  Selhal
       │
       ▼  cekani 2000ms
  Pokus 3  ──▶  Selhal  ──▶  Oznaceno jako selhane
```

Vzorec je: `delay = retryBaseDelay * 2^(pokus - 1)`

Vychozi konfigurace: 3 pokusy se zakladnim zpozdenim 1000ms. Prizpusobeni v `webhookConfig`:

```typescript
const server = await RuleEngineServer.start({
  webhookConfig: {
    maxRetries: 5,         // 5 pokusu celkem
    retryBaseDelay: 500,   // 500ms, 1s, 2s, 4s, 8s
    defaultTimeout: 15000, // 15s timeout na request
  },
});
```

### Sprava webhooku

```bash
# Vypis vsech webhooku
curl http://localhost:7226/api/v1/webhooks | jq

# Ziskani konkretniho webhooku
curl http://localhost:7226/api/v1/webhooks/a1b2c3d4-... | jq

# Deaktivace webhooku (zastavi dorucovani)
curl -X POST http://localhost:7226/api/v1/webhooks/a1b2c3d4-.../disable

# Aktivace webhooku
curl -X POST http://localhost:7226/api/v1/webhooks/a1b2c3d4-.../enable

# Smazani webhooku
curl -X DELETE http://localhost:7226/api/v1/webhooks/a1b2c3d4-...

# Statistiky dorucovani
curl http://localhost:7226/api/v1/webhooks/stats | jq
# {
#   "webhookCount": 5,
#   "activeWebhookCount": 4,
#   "totalDeliveries": 1250,
#   "successfulDeliveries": 1200,
#   "failedDeliveries": 50
# }
```

## SSE vs webhooky

| Aspekt | SSE | Webhooky |
|--------|-----|----------|
| **Smer** | Klient pulluje (dlouhodobe GET) | Server pushuje (POST na URL) |
| **Protokol** | HTTP/1.1 text/event-stream | HTTP POST s JSON telem |
| **Typ klienta** | Prohlizece, lehci klienti | Backendove sluzby |
| **Autentizace** | Query parametry / cookies | HMAC podpisy |
| **Opetovne pripojeni** | Automaticke (browserove-nativni) | Retry s exponencialnim backoffem |
| **Razeni** | Zaruene (jedno spojeni) | Best-effort (paralelni dorucovani) |
| **Firewall** | Klient iniciuje — snadne | Server iniciuje — potrebuje pristup |
| **Pripad pouziti** | Dashboardy, live monitoring | Integrace sluzeb, alertovaci systemy |

**Pravidlo**: Pouzijte SSE pro prohlizece a monitorovaci UI. Pouzijte webhooky pro backend server-to-server integraci.

## Kompletni priklad: Real-time dashboard objednavek

Tento priklad spusti server, zaregistruje pravidla a demonstruje jak SSE, tak webhook konzumaci:

```typescript
import { RuleEngineServer, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event } from '@hamicek/noex-rules/dsl';

// --- Nastaveni serveru ---

const server = await RuleEngineServer.start({
  server: { port: 7226 },
  webhookConfig: { maxRetries: 3 },
  sseConfig: { heartbeatInterval: 15000 },
});

const engine = server.getEngine();

// --- Registrace pravidel ---

engine.registerRule(
  Rule.create('order-status')
    .name('Sledovani stavu objednavky')
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
    .name('Webhook pro objednavky vysoke hodnoty')
    .when(onEvent('order.created'))
    .if(event('total').gte(5000))
    .then(emit('alert.high-value', {
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

// --- Registrace webhooku pro alerty vysoke hodnoty ---

const webhookManager = server.getWebhookManager();
webhookManager.register({
  url: 'https://alerts.example.com/high-value',
  patterns: ['alert.high-value'],
  secret: 'alert-webhook-secret',
});

console.log(`Dashboard API: ${server.address}`);
console.log(`SSE stream:    ${server.address}/api/v1/stream/events?patterns=dashboard.*`);
console.log(`Swagger docs:  ${server.address}/documentation`);

// --- Browserovy klient (vlozte do konzole prohlizece) ---

// const source = new EventSource(
//   'http://localhost:7226/api/v1/stream/events?patterns=dashboard.*'
// );
// source.onmessage = (e) => {
//   const data = JSON.parse(e.data);
//   document.getElementById('orders').innerHTML +=
//     `<div>Objednavka ${data.data.orderId}: $${data.data.total}</div>`;
// };
```

## Cviceni

1. Spustte server na portu 7226
2. Zaregistrujte pravidlo, ktere emituje `alert.temperature`, kdyz event `sensor.reading` ma `temperature > 90`
3. Zaregistrujte webhook pro eventy `alert.*` smerujici na `https://httpbin.org/post` se secretem
4. Pripojte se k SSE streamu s patternem `alert.*` pomoci curl (`curl -N`)
5. Emitujte event `sensor.reading` s `temperature: 95` pres REST API
6. Pozorujte event prichazejici na SSE stream a overte statistiky dorucovani webhooku

<details>
<summary>Reseni</summary>

Spusteni serveru a registrace pravidla:

```typescript
import { RuleEngineServer, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, event } from '@hamicek/noex-rules/dsl';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

const engine = server.getEngine();

engine.registerRule(
  Rule.create('temp-alert')
    .name('Teplotni alert')
    .when(onEvent('sensor.reading'))
    .if(event('temperature').gt(90))
    .then(emit('alert.temperature', {
      sensorId: '${event.sensorId}',
      temperature: '${event.temperature}',
    }))
    .build()
);
```

Registrace webhooku (v oddelene terminalu):

```bash
curl -X POST http://localhost:7226/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/post",
    "patterns": ["alert.*"],
    "secret": "muj-secret"
  }'
```

Pripojeni k SSE streamu (v oddelene terminalu):

```bash
curl -N http://localhost:7226/api/v1/stream/events?patterns=alert.*
```

Emitovani eventu (v oddelene terminalu):

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 95 }
  }'
```

SSE terminal zobrazi:

```
data: {"id":"...","topic":"alert.temperature","data":{"sensorId":"s-1","temperature":"95"},...}
```

Overeni statistik webhooku:

```bash
curl http://localhost:7226/api/v1/webhooks/stats | jq
# { "webhookCount": 1, "activeWebhookCount": 1, "totalDeliveries": 1, ... }
```

</details>

## Shrnuti

- **SSE** streamuje eventy pres dlouhodobe HTTP spojeni na `GET /stream/events?patterns=...`
- Klienti filtrovat eventy pomoci teckou oddelenych topic patternu s podporou wildcardu (`order.*`, `*`)
- Browserove API `EventSource` zvlada automaticke opetovne pripojeni bez dalsiho kodu
- Heartbeat komentare (kazdy 30 sekund) drzi SSE spojeni aktivni pres proxy servery
- **Webhooky** pushují eventy pres POST requesty na zaregistrovane URL s JSON payloady
- HMAC-SHA256 podpisy v hlavicce `X-Webhook-Signature` autentizuji doruceni webhooku
- Selhane doruceni se opakuji s exponencialnim backoffem: `delay = retryBaseDelay * 2^(pokus - 1)`
- SSE je idealni pro prohlizece a dashboardy; webhooky jsou idealni pro backend integraci sluzeb
- Oba mechanismy monitorujte pres `/stream/stats`, `/stream/connections` a `/webhooks/stats`

---

Dalsi: [GraphQL API](./03-graphql.md)
