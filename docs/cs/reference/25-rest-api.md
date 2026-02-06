# REST API

HTTP REST API pro správu pravidel, faktů, událostí, časovačů a dalších zdrojů enginu. API dodržuje RESTful konvence s JSON request/response body.

## Základní URL

```
http://localhost:7226/api/v1
```

Výchozí port je `7226`. Prefix `/api/v1` je konfigurovatelný přes `ServerConfig.apiPrefix`.

---

## Autentizace

REST API neobsahuje vestavěnou autentizaci. Implementujte autentizaci pomocí:
- Reverzní proxy (nginx, Traefik)
- Vlastní Fastify plugin
- API gateway

---

## Formát chybových odpovědí

Všechny chyby mají konzistentní formát:

```typescript
interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}
```

**Příklad:**

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Rule 'my-rule' not found",
  "code": "NOT_FOUND"
}
```

### Kódy chyb

| Kód | Status | Popis |
|-----|--------|-------|
| `NOT_FOUND` | 404 | Zdroj nenalezen |
| `CONFLICT` | 409 | Zdroj již existuje |
| `VALIDATION_ERROR` | 400 | Validace requestu selhala |
| `BAD_REQUEST` | 400 | Neplatný request |
| `INVALID_JSON` | 400 | Poškozený JSON body |
| `SERVICE_UNAVAILABLE` | 503 | Požadovaná služba není nakonfigurována |

---

## Rules (Pravidla)

### GET /rules

Vrací všechna registrovaná pravidla.

**Odpověď:** `200 OK`

```typescript
Rule[]
```

**Příklad:**

```bash
curl http://localhost:7226/api/v1/rules
```

---

### GET /rules/:id

Vrací jedno pravidlo podle ID.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| id | path | `string` | ano | ID pravidla |

**Odpověď:** `200 OK`

```typescript
Rule
```

**Chyby:**

| Status | Kód | Popis |
|--------|-----|-------|
| 404 | `NOT_FOUND` | Pravidlo nenalezeno |

**Příklad:**

```bash
curl http://localhost:7226/api/v1/rules/my-rule
```

---

### POST /rules

Vytvoří nové pravidlo.

**Tělo requestu:**

```typescript
interface CreateRuleBody {
  id: string;
  name?: string;
  description?: string;
  priority?: number;        // výchozí: 0
  enabled?: boolean;        // výchozí: true
  tags?: string[];
  group?: string;
  trigger: Trigger;
  conditions?: Condition[];
  actions: Action[];
}
```

**Odpověď:** `201 Created`

```typescript
Rule
```

**Chyby:**

| Status | Kód | Popis |
|--------|-----|-------|
| 400 | `VALIDATION_ERROR` | Neplatná definice pravidla |
| 409 | `CONFLICT` | Pravidlo s tímto ID již existuje |

**Příklad:**

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

Validuje definici pravidla bez registrace.

**Tělo requestu:** Stejné jako `POST /rules`

**Odpověď:** `200 OK`

```typescript
interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
```

**Příklad:**

```bash
curl -X POST http://localhost:7226/api/v1/rules/validate \
  -H "Content-Type: application/json" \
  -d '{ "id": "test", "trigger": { "type": "event" } }'
```

---

### PUT /rules/:id

Aktualizuje existující pravidlo.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| id | path | `string` | ano | ID pravidla |

**Tělo requestu:**

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

**Odpověď:** `200 OK`

```typescript
Rule
```

**Chyby:**

| Status | Kód | Popis |
|--------|-----|-------|
| 404 | `NOT_FOUND` | Pravidlo nenalezeno |

**Příklad:**

```bash
curl -X PUT http://localhost:7226/api/v1/rules/my-rule \
  -H "Content-Type: application/json" \
  -d '{ "priority": 10 }'
```

---

### DELETE /rules/:id

Smaže pravidlo.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| id | path | `string` | ano | ID pravidla |

**Odpověď:** `204 No Content`

**Chyby:**

| Status | Kód | Popis |
|--------|-----|-------|
| 404 | `NOT_FOUND` | Pravidlo nenalezeno |

**Příklad:**

```bash
curl -X DELETE http://localhost:7226/api/v1/rules/my-rule
```

---

### POST /rules/:id/enable

Povolí zakázané pravidlo.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| id | path | `string` | ano | ID pravidla |

**Odpověď:** `200 OK`

```typescript
Rule
```

**Příklad:**

```bash
curl -X POST http://localhost:7226/api/v1/rules/my-rule/enable
```

---

### POST /rules/:id/disable

Zakáže pravidlo.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| id | path | `string` | ano | ID pravidla |

**Odpověď:** `200 OK`

```typescript
Rule
```

**Příklad:**

```bash
curl -X POST http://localhost:7226/api/v1/rules/my-rule/disable
```

---

## Groups (Skupiny)

### GET /groups

Vrací všechny skupiny pravidel.

**Odpověď:** `200 OK`

```typescript
RuleGroup[]
```

---

### GET /groups/:id

Vrací jednu skupinu podle ID.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| id | path | `string` | ano | ID skupiny |

**Odpověď:** `200 OK`

```typescript
RuleGroup
```

---

### POST /groups

Vytvoří novou skupinu pravidel.

**Tělo requestu:**

```typescript
interface CreateGroupBody {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;  // výchozí: true
}
```

**Odpověď:** `201 Created`

```typescript
RuleGroup
```

**Chyby:**

| Status | Kód | Popis |
|--------|-----|-------|
| 409 | `CONFLICT` | Skupina s tímto ID již existuje |

---

### PUT /groups/:id

Aktualizuje existující skupinu.

**Tělo requestu:**

```typescript
interface UpdateGroupBody {
  name?: string;
  description?: string;
  enabled?: boolean;
}
```

**Odpověď:** `200 OK`

```typescript
RuleGroup
```

---

### DELETE /groups/:id

Smaže skupinu.

**Odpověď:** `204 No Content`

---

### POST /groups/:id/enable

Povolí skupinu a všechna její pravidla.

**Odpověď:** `200 OK`

```typescript
RuleGroup
```

---

### POST /groups/:id/disable

Zakáže skupinu a všechna její pravidla.

**Odpověď:** `200 OK`

```typescript
RuleGroup
```

---

### GET /groups/:id/rules

Vrací všechna pravidla ve skupině.

**Odpověď:** `200 OK`

```typescript
Rule[]
```

---

## Facts (Fakta)

### GET /facts

Vrací všechna fakta.

**Odpověď:** `200 OK`

```typescript
Fact[]
```

---

### GET /facts/:key

Vrací jeden fakt podle klíče.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| key | path | `string` | ano | Klíč faktu |

**Odpověď:** `200 OK`

```typescript
interface Fact {
  key: string;
  value: unknown;
  updatedAt: number;
}
```

---

### PUT /facts/:key

Nastaví hodnotu faktu. Vytvoří fakt, pokud neexistuje.

**Tělo requestu:**

```typescript
interface SetFactBody {
  value: unknown;
}
```

**Odpověď:** `200 OK` (aktualizace) nebo `201 Created` (nový)

```typescript
Fact
```

**Příklad:**

```bash
curl -X PUT http://localhost:7226/api/v1/facts/user:123:status \
  -H "Content-Type: application/json" \
  -d '{ "value": "active" }'
```

---

### DELETE /facts/:key

Smaže fakt.

**Odpověď:** `204 No Content`

---

### POST /facts/query

Dotazuje fakta podle patternu. Podporuje wildcard `*`.

**Tělo requestu:**

```typescript
interface QueryFactsBody {
  pattern: string;
}
```

**Odpověď:** `200 OK`

```typescript
Fact[]
```

**Příklad:**

```bash
curl -X POST http://localhost:7226/api/v1/facts/query \
  -H "Content-Type: application/json" \
  -d '{ "pattern": "user:*:status" }'
```

---

## Events (Události)

### POST /events

Emituje událost do enginu.

**Tělo requestu:**

```typescript
interface EmitEventBody {
  topic: string;
  data?: Record<string, unknown>;
}
```

**Odpověď:** `201 Created`

```typescript
Event
```

**Příklad:**

```bash
curl -X POST http://localhost:7226/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{ "topic": "order.placed", "data": { "orderId": "12345", "amount": 99.99 } }'
```

---

### POST /events/correlated

Emituje událost s korelačním sledováním.

**Tělo requestu:**

```typescript
interface EmitCorrelatedEventBody {
  topic: string;
  data?: Record<string, unknown>;
  correlationId: string;
  causationId?: string;
}
```

**Odpověď:** `201 Created`

```typescript
Event
```

**Příklad:**

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

## Timers (Časovače)

### GET /timers

Vrací všechny aktivní časovače.

**Odpověď:** `200 OK`

```typescript
Timer[]
```

---

### GET /timers/:name

Vrací jeden časovač podle názvu.

**Parametry:**

| Název | V | Typ | Povinný | Popis |
|-------|---|-----|---------|-------|
| name | path | `string` | ano | Název časovače |

**Odpověď:** `200 OK`

```typescript
Timer
```

---

### POST /timers

Vytvoří nový časovač.

**Tělo requestu:**

```typescript
interface CreateTimerBody {
  name: string;
  duration: string | number;  // např. "5m", "1h", 30000
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

**Odpověď:** `201 Created`

```typescript
Timer
```

**Příklad:**

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

Zruší časovač.

**Odpověď:** `204 No Content`

---

## Webhooks

### GET /webhooks

Vrací všechny registrované webhooky.

**Odpověď:** `200 OK`

```typescript
WebhookResponse[]
```

---

### GET /webhooks/:id

Vrací jeden webhook.

**Odpověď:** `200 OK`

```typescript
interface WebhookResponse {
  id: string;
  url: string;
  patterns: string[];
  headers?: Record<string, string>;
  timeout?: number;
  enabled: boolean;
  hasSecret: boolean;  // secret není vystaven
}
```

---

### GET /webhooks/stats

Vrací statistiky doručování webhooků.

**Odpověď:** `200 OK`

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

Registruje nový webhook.

**Tělo requestu:**

```typescript
interface CreateWebhookBody {
  url: string;
  patterns?: string[];           // výchozí: ["*"]
  secret?: string;               // pro HMAC podpis
  headers?: Record<string, string>;
  timeout?: number;              // ms
}
```

**Odpověď:** `201 Created`

```typescript
WebhookResponse
```

**Příklad:**

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

Povolí webhook.

**Odpověď:** `200 OK`

---

### POST /webhooks/:id/disable

Zakáže webhook.

**Odpověď:** `200 OK`

---

### DELETE /webhooks/:id

Odregistruje webhook.

**Odpověď:** `204 No Content`

---

## Stream (SSE)

### GET /stream/events

Server-Sent Events stream pro real-time notifikace událostí.

**Query parametry:**

| Název | Typ | Výchozí | Popis |
|-------|-----|---------|-------|
| patterns | `string` | `*` | Čárkou oddělené topic patterny |

**Odpověď:** `200 OK` (text/event-stream)

**Příklad:**

```bash
curl -N http://localhost:7226/api/v1/stream/events?patterns=order.*,payment.*
```

**Formát událostí:**

```
event: order.placed
data: {"id":"evt-123","topic":"order.placed","data":{"orderId":"12345"},"timestamp":1234567890}

```

---

### GET /stream/stats

Vrací statistiky SSE připojení.

**Odpověď:** `200 OK`

```typescript
interface SSEManagerStats {
  activeConnections: number;
  totalConnections: number;
  totalMessagesSent: number;
}
```

---

### GET /stream/connections

Vrací aktivní SSE připojení (admin/debug).

**Odpověď:** `200 OK`

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

Endpoint pro kontrolu zdraví.

**Odpověď:** `200 OK`

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

Vrací statistiky enginu.

**Odpověď:** `200 OK`

```typescript
interface StatsResponse extends EngineStats {
  timestamp: number;
}
```

---

## Metrics (Metriky)

### GET /metrics

Vrací metriky ve formátu Prometheus. Dostupné pouze když jsou metriky povoleny.

**Odpověď:** `200 OK` (text/plain)

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

Vyžaduje `audit.enabled: true` v konfiguraci enginu.

### GET /audit/entries

Dotazuje záznamy audit logu.

**Query parametry:**

| Název | Typ | Popis |
|-------|-----|-------|
| category | `string` | Filtr podle kategorie |
| types | `string` | Čárkou oddělené typy událostí |
| ruleId | `string` | Filtr podle ID pravidla |
| source | `string` | Filtr podle zdroje |
| correlationId | `string` | Filtr podle correlation ID |
| from | `number` | Počáteční timestamp |
| to | `number` | Koncový timestamp |
| limit | `number` | Max záznamů (výchozí: 100) |
| offset | `number` | Offset pro stránkování |

**Odpověď:** `200 OK`

```typescript
AuditQueryResult
```

---

### GET /audit/entries/:id

Vrací jeden audit záznam.

**Odpověď:** `200 OK`

```typescript
AuditEntry
```

---

### GET /audit/stats

Vrací statistiky auditu.

**Odpověď:** `200 OK`

```typescript
AuditStats
```

---

### GET /audit/stream

SSE stream pro real-time audit události.

**Query parametry:**

| Název | Typ | Popis |
|-------|-----|-------|
| categories | `string` | Čárkou oddělené kategorie |
| types | `string` | Čárkou oddělené typy událostí |
| ruleIds | `string` | Čárkou oddělená ID pravidel |
| sources | `string` | Čárkou oddělené zdroje |

**Odpověď:** `200 OK` (text/event-stream)

---

### GET /audit/stream/stats

Vrací statistiky audit SSE.

**Odpověď:** `200 OK`

```typescript
AuditSSEManagerStats
```

---

### GET /audit/export

Exportuje audit záznamy.

**Query parametry:**

| Název | Typ | Výchozí | Popis |
|-------|-----|---------|-------|
| format | `string` | `json` | Formát exportu: `json` nebo `csv` |
| category | `string` | — | Filtr podle kategorie |
| types | `string` | — | Čárkou oddělené typy událostí |
| from | `number` | — | Počáteční timestamp |
| to | `number` | — | Koncový timestamp |

**Odpověď:** `200 OK` s `Content-Disposition: attachment`

---

### POST /audit/cleanup

Manuálně spustí čištění starých audit záznamů.

**Odpověď:** `200 OK`

```typescript
{
  removedCount: number;
  remainingCount: number;
}
```

---

## Versioning (Verzování)

Vyžaduje `versioning.enabled: true` v konfiguraci enginu.

### GET /rules/:id/versions

Vrací historii verzí pravidla.

**Query parametry:**

| Název | Typ | Popis |
|-------|-----|-------|
| limit | `number` | Max záznamů |
| offset | `number` | Offset pro stránkování |
| order | `string` | `asc` nebo `desc` |
| fromVersion | `number` | Min číslo verze |
| toVersion | `number` | Max číslo verze |
| changeTypes | `string` | Čárkou oddělené: created, updated, deleted |
| from | `number` | Počáteční timestamp |
| to | `number` | Koncový timestamp |

**Odpověď:** `200 OK`

```typescript
RuleVersionQueryResult
```

---

### GET /rules/:id/versions/:version

Vrací konkrétní verzi.

**Odpověď:** `200 OK`

```typescript
RuleVersionEntry
```

---

### POST /rules/:id/rollback

Vrátí pravidlo na předchozí verzi.

**Tělo requestu:**

```typescript
interface RollbackBody {
  version: number;
}
```

**Odpověď:** `200 OK`

```typescript
Rule
```

---

### GET /rules/:id/diff

Porovná dvě verze.

**Query parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| from | `number` | ano | Zdrojová verze |
| to | `number` | ano | Cílová verze |

**Odpověď:** `200 OK`

```typescript
RuleVersionDiff
```

---

## Debug

### GET /debug/history

Dotazuje historii událostí.

**Query parametry:**

| Název | Typ | Popis |
|-------|-----|-------|
| topic | `string` | Filtr podle topicu |
| correlationId | `string` | Filtr podle correlation ID |
| from | `number` | Počáteční timestamp |
| to | `number` | Koncový timestamp |
| limit | `number` | Max záznamů |
| includeContext | `boolean` | Zahrnout kontext exekuce pravidla |

**Odpověď:** `200 OK`

```typescript
HistoryResult
```

---

### GET /debug/history/:eventId

Vrací událost s kompletním kontextem exekuce.

**Odpověď:** `200 OK`

```typescript
EventWithContext
```

---

### GET /debug/correlation/:correlationId

Vrací všechny události v korelačním řetězci.

**Odpověď:** `200 OK`

```typescript
Event[]
```

---

### GET /debug/correlation/:correlationId/timeline

Vrací vizuální timeline korelovaných událostí.

**Odpověď:** `200 OK`

```typescript
TimelineEntry[]
```

---

### GET /debug/correlation/:correlationId/export

Exportuje korelační trace.

**Query parametry:**

| Název | Typ | Výchozí | Popis |
|-------|-----|---------|-------|
| format | `string` | `json` | `json` nebo `mermaid` |

**Odpověď:** `200 OK`

---

### GET /debug/traces

Vrací nedávné trace záznamy.

**Query parametry:**

| Název | Typ | Popis |
|-------|-----|-------|
| correlationId | `string` | Filtr podle correlation ID |
| ruleId | `string` | Filtr podle ID pravidla |
| types | `string` | Čárkou oddělené typy trace |
| limit | `number` | Max záznamů (výchozí: 100) |

**Odpověď:** `200 OK`

```typescript
DebugTraceEntry[]
```

---

### GET /debug/tracing

Vrací stav tracingu.

**Odpověď:** `200 OK`

```typescript
{ enabled: boolean }
```

---

### POST /debug/tracing/enable

Povolí tracing.

**Odpověď:** `200 OK`

```typescript
{ enabled: true }
```

---

### POST /debug/tracing/disable

Zakáže tracing.

**Odpověď:** `200 OK`

```typescript
{ enabled: false }
```

---

### GET /debug/profile

Vrací všechny profily exekuce pravidel.

**Odpověď:** `200 OK`

```typescript
RuleProfile[]
```

---

### GET /debug/profile/summary

Vrací souhrn profilování.

**Odpověď:** `200 OK`

```typescript
ProfilingSummary
```

---

### GET /debug/profile/slowest

Vrací nejpomalejší pravidla.

**Query parametry:**

| Název | Typ | Výchozí | Popis |
|-------|-----|---------|-------|
| limit | `number` | 10 | Počet pravidel |

**Odpověď:** `200 OK`

```typescript
RuleProfile[]
```

---

### GET /debug/profile/hottest

Vrací nejčastěji spouštěná pravidla.

**Query parametry:**

| Název | Typ | Výchozí | Popis |
|-------|-----|---------|-------|
| limit | `number` | 10 | Počet pravidel |

**Odpověď:** `200 OK`

```typescript
RuleProfile[]
```

---

### GET /debug/profile/:ruleId

Vrací profil pro konkrétní pravidlo.

**Odpověď:** `200 OK`

```typescript
RuleProfile
```

---

### POST /debug/profile/reset

Resetuje všechna data profilování.

**Odpověď:** `200 OK`

```typescript
{ reset: true }
```

---

### GET /debug/stream

SSE stream pro real-time trace záznamy.

**Query parametry:**

| Název | Typ | Popis |
|-------|-----|-------|
| types | `string` | Čárkou oddělené typy trace |
| ruleIds | `string` | Čárkou oddělená ID pravidel |
| correlationIds | `string` | Čárkou oddělená correlation IDs |
| minDurationMs | `number` | Minimální duration filtr |

**Odpověď:** `200 OK` (text/event-stream)

---

### GET /debug/stream/connections

Vrací aktivní debug SSE připojení.

**Odpověď:** `200 OK`

---

### GET /debug/stream/stats

Vrací statistiky debug SSE.

**Odpověď:** `200 OK`

```typescript
DebugSSEManagerStats
```

---

## Debug Sessions (Debugovací relace)

Interaktivní debugování s breakpointy a snapshoty.

### POST /debug/sessions

Vytvoří novou debug relaci.

**Odpověď:** `200 OK`

```typescript
DebugSession
```

---

### GET /debug/sessions

Vrací všechny debug relace.

**Odpověď:** `200 OK`

```typescript
DebugSession[]
```

---

### GET /debug/sessions/:sessionId

Vrací konkrétní relaci.

**Odpověď:** `200 OK`

```typescript
DebugSession
```

---

### DELETE /debug/sessions/:sessionId

Ukončí debug relaci.

**Odpověď:** `200 OK`

```typescript
{ deleted: true }
```

---

### POST /debug/sessions/:sessionId/breakpoints

Přidá breakpoint do relace.

**Tělo requestu:**

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

**Odpověď:** `200 OK`

```typescript
Breakpoint
```

---

### DELETE /debug/sessions/:sessionId/breakpoints/:breakpointId

Odstraní breakpoint.

**Odpověď:** `200 OK`

```typescript
{ deleted: true }
```

---

### POST /debug/sessions/:sessionId/breakpoints/:breakpointId/enable

Povolí breakpoint.

**Odpověď:** `200 OK`

---

### POST /debug/sessions/:sessionId/breakpoints/:breakpointId/disable

Zakáže breakpoint.

**Odpověď:** `200 OK`

---

### POST /debug/sessions/:sessionId/resume

Obnoví exekuci z pozastaveného stavu.

**Odpověď:** `200 OK`

```typescript
{ resumed: boolean }
```

---

### POST /debug/sessions/:sessionId/step

Krokuje na další bod exekuce.

**Odpověď:** `200 OK`

```typescript
{ stepped: boolean }
```

---

### POST /debug/sessions/:sessionId/snapshot

Pořídí snapshot stavu.

**Tělo requestu:**

```typescript
interface TakeSnapshotBody {
  label?: string;
}
```

**Odpověď:** `200 OK`

```typescript
Snapshot
```

---

### GET /debug/sessions/:sessionId/snapshots/:snapshotId

Vrací konkrétní snapshot.

**Odpověď:** `200 OK`

```typescript
Snapshot
```

---

### DELETE /debug/sessions/:sessionId/snapshots

Vymaže všechny snapshoty v relaci.

**Odpověď:** `200 OK`

```typescript
{ cleared: true }
```

---

## OpenAPI / Swagger

Když je `swagger: true` v konfiguraci serveru, OpenAPI dokumentace je dostupná na:

- **Swagger UI:** `http://localhost:7226/documentation`
- **OpenAPI JSON:** `http://localhost:7226/documentation/json`
- **OpenAPI YAML:** `http://localhost:7226/documentation/yaml`

---

## Viz také

- [RuleEngineServer](./28-server.md) — Konfigurace a lifecycle serveru
- [GraphQL API](./26-graphql-api.md) — GraphQL alternativa
- [Observability](./21-observability.md) — Metriky a tracing
- [Audit](./20-audit.md) — Audit logging
