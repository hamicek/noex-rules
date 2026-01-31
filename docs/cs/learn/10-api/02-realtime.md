# Notifikace v reálném čase

REST endpointy fungují na principu request-response: klient se zeptá, server odpoví. Pravidlové enginy jsou však ze své podstaty reaktivní — eventy spouští pravidla, pravidla produkují nové eventy a externí systémy o nich potřebují vědět **v okamžiku jejich vzniku**. noex-rules poskytuje dva push mechanismy: **Server-Sent Events (SSE)** pro prohlížeče a lehké klienty, a **webhooky** pro server-to-server doručování s HMAC podpisy a retry logikou.

## Co se naučíte

- Jak se připojit k SSE event streamu s filtrováním podle topic patternů
- Tvorbu real-time dashboardů pomocí browserového API `EventSource`
- Registraci webhooku s ověřováním HMAC-SHA256 podpisů
- Webhook retry logiku s exponenciálním backoffem
- Volbu mezi SSE a webhooky pro různé případy použití
- Správu připojení a monitoring statistik doručování

## Server-Sent Events (SSE)

SSE je browserově-nativní protokol pro příjem jednosměrného streamu eventů ze serveru. Klient otevře dlouhodobé HTTP spojení a server pushuje eventy, jak nastaly.

### Architektura

```text
  ┌──────────┐                   ┌─────────────────┐
  │  Prohlížeč│── GET /stream ──▶│  noex-rules      │
  │  nebo CLI │   events?       │  SSE Manager     │
  │  klient   │◀─ data: {...} ──│                   │
  │           │◀─ data: {...} ──│  (filtruje eventy │
  │           │◀─ : heartbeat ──│   podle topic     │
  │           │                  │   patternů)       │
  └──────────┘                   └─────────────────┘
```

### Připojení ke streamu

SSE endpoint je na `GET /api/v1/stream/events`. Pomocí query parametru `patterns` filtrujte, které eventy přijímat:

```bash
# Všechny eventy
curl -N http://localhost:7226/api/v1/stream/events

# Pouze objednávkové eventy
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*

# Více patternů
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*,payment.completed
```

Server odpoví SSE hlavičkami a drží spojení otevřené:

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

**Řádky začínající `:`** jsou SSE komentáře — komentář `connected:` potvrzuje ID připojení a komentáře `heartbeat` (každých 30 sekund ve výchozím nastavení) drží spojení aktivní přes proxy a load balancery.

### Matchování topic patternů

Patterny používají tečkou oddělené segmenty s podporou wildcardů:

| Pattern | Matchuje | Nematchuje |
|---------|----------|------------|
| `*` | Všechno | — |
| `order.*` | `order.created`, `order.paid` | `payment.completed` |
| `order.created` | pouze `order.created` | `order.paid` |
| `alert.*` | `alert.high-value`, `alert.fraud` | `order.alert` |

Výchozí pattern (když `patterns` chybí) je `*` — všechny eventy.

### Browserový EventSource klient

API `EventSource` je součástí každého moderního prohlížeče:

```typescript
// Připojení k SSE streamu
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
  console.error('Chyba SSE připojení:', error);
  // EventSource se automaticky znovu připojí
};
```

`EventSource` zvládá opětovné připojení automaticky — pokud spojení spadne, prohlížeč to zkusí znovu s exponenciálním backoffem. Není potřeba žádná manuální logika pro opětovné připojení.

### Konfigurace SSE

Nakonfigurujte interval heartbeatu při spouštění serveru:

```typescript
const server = await RuleEngineServer.start({
  sseConfig: {
    heartbeatInterval: 15000, // 15 sekund (výchozí: 30000)
  },
});
```

### Statistiky a připojení SSE

Monitorujte aktivní SSE připojení přes REST endpointy:

```bash
# Statistiky připojení
curl http://localhost:7226/api/v1/stream/stats | jq
# { "activeConnections": 5, "totalEventsSent": 12345 }

# Výpis aktivních připojení
curl http://localhost:7226/api/v1/stream/connections | jq
# [{ "id": "sse-170...", "patterns": ["order.*"], "connectedAt": 1706745600000 }]
```

## Webhooky

Webhooky posílají eventy na externí HTTP endpointy. Na rozdíl od SSE (kde se klient připojuje k vám) jsou webhooky server-to-server: zaregistrujete URL a noex-rules posílá POST requesty na něj, kdykoli nastanou odpovídající eventy.

### Architektura

```text
  ┌──────────────────┐         ┌─────────────────┐         ┌──────────────────┐
  │  RuleEngine       │────────▶│  Webhook Manager │────────▶│  Vaše služba     │
  │  emituje eventy   │         │                  │         │                  │
  │                    │         │  - Pattern match │  POST   │  POST /webhook   │
  │                    │         │  - HMAC podpis   │────────▶│  X-Webhook-      │
  │                    │         │  - Retry při     │         │  Signature: ...  │
  │                    │         │    selhání       │         │                  │
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

Odpověď:

```json
{
  "id": "a1b2c3d4-...",
  "url": "https://my-service.example.com/webhook",
  "patterns": ["order.*", "payment.completed"],
  "enabled": true,
  "createdAt": 1706745600000
}
```

### Formát webhook payloadu

Když nastane odpovídající event, noex-rules pošle POST request s tímto JSON tělem:

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

Když je při registraci zadán `secret`, každý webhook request obsahuje hlavičku `X-Webhook-Signature`:

```
X-Webhook-Signature: sha256=a1b2c3d4e5f6...
```

Podpis se počítá jako `HMAC-SHA256(secret, JSON tělo)`. Ověření na přijímací straně:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

const app = express();
app.use(express.raw({ type: 'application/json' }));

const WEBHOOK_SECRET = 'muj-webhook-secret';

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const body = req.body as Buffer;

  // Výpočet očekávaného podpisu
  const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  // Konstantně časové porovnání pro prevenci timing útoků
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(401).send('Neplatný podpis');
  }

  const payload = JSON.parse(body.toString());
  console.log(`Webhook přijat: ${payload.event.topic}`, payload.event.data);

  res.status(200).send('OK');
});
```

### Retry logika

Když doručení webhooku selže (ne-2xx odpověď nebo síťová chyba), manager to zkusí znovu s **exponenciálním backoffem**:

```text
  Pokus 1  ──▶  Selhal
       │
       ▼  čekání 1000ms
  Pokus 2  ──▶  Selhal
       │
       ▼  čekání 2000ms
  Pokus 3  ──▶  Selhal  ──▶  Označeno jako selhané
```

Vzorec je: `delay = retryBaseDelay * 2^(pokus - 1)`

Výchozí konfigurace: 3 pokusy se základním zpožděním 1000ms. Přizpůsobení v `webhookConfig`:

```typescript
const server = await RuleEngineServer.start({
  webhookConfig: {
    maxRetries: 5,         // 5 pokusů celkem
    retryBaseDelay: 500,   // 500ms, 1s, 2s, 4s, 8s
    defaultTimeout: 15000, // 15s timeout na request
  },
});
```

### Správa webhooků

```bash
# Výpis všech webhooků
curl http://localhost:7226/api/v1/webhooks | jq

# Získání konkrétního webhooku
curl http://localhost:7226/api/v1/webhooks/a1b2c3d4-... | jq

# Deaktivace webhooku (zastaví doručování)
curl -X POST http://localhost:7226/api/v1/webhooks/a1b2c3d4-.../disable

# Aktivace webhooku
curl -X POST http://localhost:7226/api/v1/webhooks/a1b2c3d4-.../enable

# Smazání webhooku
curl -X DELETE http://localhost:7226/api/v1/webhooks/a1b2c3d4-...

# Statistiky doručování
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
| **Směr** | Klient pulluje (dlouhodobé GET) | Server pushuje (POST na URL) |
| **Protokol** | HTTP/1.1 text/event-stream | HTTP POST s JSON tělem |
| **Typ klienta** | Prohlížeče, lehčí klienti | Backendové služby |
| **Autentizace** | Query parametry / cookies | HMAC podpisy |
| **Opětovné připojení** | Automatické (browserově-nativní) | Retry s exponenciálním backoffem |
| **Řazení** | Zaručené (jedno spojení) | Best-effort (paralelní doručování) |
| **Firewall** | Klient iniciuje — snadné | Server iniciuje — potřebuje přístup |
| **Případ použití** | Dashboardy, live monitoring | Integrace služeb, alertovací systémy |

**Pravidlo**: Použijte SSE pro prohlížeče a monitorovací UI. Použijte webhooky pro backend server-to-server integraci.

## Kompletní příklad: Real-time dashboard objednávek

Tento příklad spustí server, zaregistruje pravidla a demonstruje jak SSE, tak webhook konzumaci:

```typescript
import { RuleEngineServer, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, setFact, event } from '@hamicek/noex-rules/dsl';

// --- Nastavení serveru ---

const server = await RuleEngineServer.start({
  server: { port: 7226 },
  webhookConfig: { maxRetries: 3 },
  sseConfig: { heartbeatInterval: 15000 },
});

const engine = server.getEngine();

// --- Registrace pravidel ---

engine.registerRule(
  Rule.create('order-status')
    .name('Sledování stavu objednávky')
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
    .name('Webhook pro objednávky vysoké hodnoty')
    .when(onEvent('order.created'))
    .if(event('total').gte(5000))
    .then(emit('alert.high-value', {
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

// --- Registrace webhooku pro alerty vysoké hodnoty ---

const webhookManager = server.getWebhookManager();
webhookManager.register({
  url: 'https://alerts.example.com/high-value',
  patterns: ['alert.high-value'],
  secret: 'alert-webhook-secret',
});

console.log(`Dashboard API: ${server.address}`);
console.log(`SSE stream:    ${server.address}/api/v1/stream/events?patterns=dashboard.*`);
console.log(`Swagger docs:  ${server.address}/documentation`);

// --- Browserový klient (vložte do konzole prohlížeče) ---

// const source = new EventSource(
//   'http://localhost:7226/api/v1/stream/events?patterns=dashboard.*'
// );
// source.onmessage = (e) => {
//   const data = JSON.parse(e.data);
//   document.getElementById('orders').innerHTML +=
//     `<div>Objednávka ${data.data.orderId}: $${data.data.total}</div>`;
// };
```

## Cvičení

1. Spusťte server na portu 7226
2. Zaregistrujte pravidlo, které emituje `alert.temperature`, když event `sensor.reading` má `temperature > 90`
3. Zaregistrujte webhook pro eventy `alert.*` směřující na `https://httpbin.org/post` se secretem
4. Připojte se k SSE streamu s patternem `alert.*` pomocí curl (`curl -N`)
5. Emitujte event `sensor.reading` s `temperature: 95` přes REST API
6. Pozorujte event přicházející na SSE stream a ověřte statistiky doručování webhooku

<details>
<summary>Řešení</summary>

Spuštění serveru a registrace pravidla:

```typescript
import { RuleEngineServer, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, event } from '@hamicek/noex-rules/dsl';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

const engine = server.getEngine();

engine.registerRule(
  Rule.create('temp-alert')
    .name('Teplotní alert')
    .when(onEvent('sensor.reading'))
    .if(event('temperature').gt(90))
    .then(emit('alert.temperature', {
      sensorId: '${event.sensorId}',
      temperature: '${event.temperature}',
    }))
    .build()
);
```

Registrace webhooku (v odděleném terminálu):

```bash
curl -X POST http://localhost:7226/api/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://httpbin.org/post",
    "patterns": ["alert.*"],
    "secret": "muj-secret"
  }'
```

Připojení k SSE streamu (v odděleném terminálu):

```bash
curl -N http://localhost:7226/api/v1/stream/events?patterns=alert.*
```

Emitování eventu (v odděleném terminálu):

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "sensor.reading",
    "data": { "sensorId": "s-1", "temperature": 95 }
  }'
```

SSE terminál zobrazí:

```
data: {"id":"...","topic":"alert.temperature","data":{"sensorId":"s-1","temperature":"95"},...}
```

Ověření statistik webhooku:

```bash
curl http://localhost:7226/api/v1/webhooks/stats | jq
# { "webhookCount": 1, "activeWebhookCount": 1, "totalDeliveries": 1, ... }
```

</details>

## Shrnutí

- **SSE** streamuje eventy přes dlouhodobé HTTP spojení na `GET /stream/events?patterns=...`
- Klienti filtrovat eventy pomocí tečkou oddělených topic patternů s podporou wildcardů (`order.*`, `*`)
- Browserové API `EventSource` zvládá automatické opětovné připojení bez dalšího kódu
- Heartbeat komentáře (každých 30 sekund) drží SSE spojení aktivní přes proxy servery
- **Webhooky** pushují eventy přes POST requesty na zaregistrované URL s JSON payloady
- HMAC-SHA256 podpisy v hlavičce `X-Webhook-Signature` autentizují doručení webhooku
- Selhané doručení se opakují s exponenciálním backoffem: `delay = retryBaseDelay * 2^(pokus - 1)`
- SSE je ideální pro prohlížeče a dashboardy; webhooky jsou ideální pro backend integraci služeb
- Oba mechanismy monitorujte přes `/stream/stats`, `/stream/connections` a `/webhooks/stats`

---

Další: [GraphQL API](./03-graphql.md)
