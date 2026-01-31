# GraphQL API

REST endpointy fungují dobre pro jednoduche CRUD operace, ale nekdy potrebujete vetsi flexibilitu: nacteni pravidla spolu s jeho skupinou, histori verzi a poslednich audit zaznamy — vse v jednom requestu. GraphQL API v noex-rules vam umoznuje pozadovat presne ta data, ktera potrebujete, s vnorenym rozlisenim poli, real-time subscriptions pres WebSocket a interaktivnim GraphiQL IDE pro exploraci.

## Co se naucite

- Jak GraphQL doplnuje REST API
- Kompletni schema dotazu, mutaci a subscriptions
- Nacitani vnorenych dat v jedinem requestu
- Real-time event subscriptions pres WebSocket
- Pouzivani GraphiQL IDE pro exploraci a debugging
- Kdy zvolit GraphQL vs REST

## Nastaveni

GraphQL je ve vychozim nastaveni povoleny pri spusteni serveru. Endpoint je registrovany na root urovni (ne pod API prefixem):

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: {
    graphql: true, // Vychozi — povoleno se vsemi funkcemi
  },
});

// GraphQL endpoint:  http://localhost:7226/graphql
// GraphiQL IDE:      http://localhost:7226/graphql (v prohlizeci)
```

### Konfigurace

```typescript
const server = await RuleEngineServer.start({
  server: {
    graphql: {
      path: '/graphql',        // Vychozi: '/graphql'
      graphiql: true,          // Vychozi: true — interaktivni IDE
      subscriptions: true,     // Vychozi: true — WebSocket subscriptions
    },
  },
});
```

Pro uplne vypnuti GraphQL:

```typescript
const server = await RuleEngineServer.start({
  server: { graphql: false },
});
```

## Dotazy

Dotazy jsou read-only operace. GraphQL schema vystavuje vsechna data enginu pres typovanou hierarchii:

### Pravidla

```graphql
# Vypis vsech pravidel
{
  rules {
    id
    name
    priority
    enabled
    tags
    trigger { type topic pattern name }
    conditions { source field operator value }
    actions { type topic key value message }
  }
}

# Ziskani jednoho pravidla s vnorenou skupinou a historii verzi
{
  rule(id: "order-alert") {
    id
    name
    enabled
    group {
      id
      name
      enabled
    }
    versions(limit: 5) {
      entries {
        version
        timestamp
        changes
      }
      total
    }
    auditEntries(limit: 3) {
      id
      type
      summary
      timestamp
    }
  }
}
```

Pole `group`, `versions` a `auditEntries` jsou **field resolvery** — nacitaji data na vyzadani, pouze kdyz jsou pozadovana. Dotaz, ktery nepozaduje verze, nebude mit naklady na jejich nacitani.

### Fakta, eventy a casovace

```graphql
# Vsechna fakta
{
  facts {
    key
    value
    updatedAt
  }
}

# Dotaz na fakta podle glob patternu
{
  factsQuery(pattern: "customer:c-42:*") {
    key
    value
  }
}

# Jeden fakt
{
  fact(key: "customer:c-42:tier") {
    key
    value
    updatedAt
  }
}

# Vsechny aktivni casovace
{
  timers {
    name
    expiresAt
    onExpire { topic data }
    repeat { interval maxCount currentCount }
  }
}
```

### Health a statistiky

```graphql
{
  health {
    status
    timestamp
    uptime
    version
    engine { name running }
  }

  stats {
    ruleCount
    factCount
    timerCount
    eventCount
  }
}
```

### Zpetne retezeni

```graphql
{
  query(goal: {
    type: fact
    key: "customer:c-42:tier"
    operator: eq
    value: "vip"
  }) {
    achievable
    exploredRules
    maxDepthReached
    durationMs
    proof
  }
}
```

### Audit a verze

```graphql
# Dotaz na audit zaznamy s filtry
{
  auditEntries(query: {
    category: rule_execution
    ruleId: "order-alert"
    limit: 10
  }) {
    entries {
      id
      timestamp
      type
      summary
      durationMs
      details
    }
    total
  }
}

# Porovnani dvou verzi pravidla
{
  ruleVersionDiff(ruleId: "order-alert", fromVersion: 1, toVersion: 3) {
    fromVersion
    toVersion
    changes {
      field
      from
      to
    }
  }
}
```

## Mutace

Mutace modifikuji stav enginu. Odrazejí zapisove operace REST API:

### Sprava pravidel

```graphql
# Vytvoreni pravidla
mutation {
  createRule(input: {
    id: "new-rule"
    name: "Nove pravidlo"
    trigger: { type: event, topic: "order.created" }
    conditions: [{
      source: event
      field: "total"
      operator: gte
      value: 1000
    }]
    actions: [{
      type: emit_event
      topic: "alert.high-value"
      data: { orderId: "${event.orderId}" }
    }]
  }) {
    id
    name
    enabled
    version
  }
}

# Aktualizace pravidla
mutation {
  updateRule(id: "new-rule", input: {
    priority: 10
    tags: ["orders", "alerts"]
  }) {
    id
    priority
    tags
    version
  }
}

# Smazani, povoleni, zakazani
mutation { deleteRule(id: "new-rule") }
mutation { enableRule(id: "new-rule") { id enabled } }
mutation { disableRule(id: "new-rule") { id enabled } }

# Rollback na predchozi verzi
mutation {
  rollbackRule(id: "order-alert", version: 2) {
    id
    version
    name
  }
}
```

### Fakta a eventy

```graphql
# Nastaveni faktu
mutation {
  setFact(key: "customer:c-42:tier", value: "vip") {
    key
    value
    updatedAt
  }
}

# Smazani faktu
mutation { deleteFact(key: "customer:c-42:tier") }

# Emitovani eventu
mutation {
  emitEvent(input: {
    topic: "order.created"
    data: { orderId: "ord-1", total: 2500 }
  }) {
    id
    topic
    timestamp
  }
}

# Emitovani korelovaneho eventu
mutation {
  emitCorrelatedEvent(input: {
    topic: "payment.completed"
    data: { orderId: "ord-1", amount: 2500 }
    correlationId: "txn-abc"
    causationId: "evt-1"
  }) {
    id
    topic
    correlationId
  }
}
```

### Casovace a skupiny

```graphql
# Vytvoreni casovace
mutation {
  createTimer(input: {
    name: "payment-timeout"
    duration: "30m"
    onExpire: { topic: "payment.timeout", data: { orderId: "ord-1" } }
  }) {
    name
    expiresAt
  }
}

# Zruseni casovace
mutation { cancelTimer(name: "payment-timeout") }

# Vytvoreni skupiny
mutation {
  createGroup(input: {
    id: "fraud-rules"
    name: "Pravidla detekce podvodu"
    description: "Vsechna pravidla souvisejici s detekci podvodu"
    enabled: true
  }) {
    id
    name
    enabled
  }
}
```

## Subscriptions

Subscriptions dorucuji eventy v realnem case pres WebSocket. Jsou GraphQL ekvivalentem SSE:

### Engine eventy

```graphql
# Odber vsech eventu
subscription {
  engineEvent {
    id
    topic
    data
    timestamp
    correlationId
    source
  }
}

# Odber s filtrovanim topicu
subscription {
  engineEvent(patterns: ["order.*", "payment.*"]) {
    id
    topic
    data
    timestamp
  }
}
```

### Audit eventy

```graphql
# Odber audit eventu provadeni pravidel
subscription {
  auditEvent(categories: [rule_execution]) {
    id
    timestamp
    type
    summary
    ruleId
    ruleName
    durationMs
    details
  }
}

# Filtrovani podle konkretnich typu eventu a pravidel
subscription {
  auditEvent(
    types: [rule_executed, rule_failed]
    ruleIds: ["order-alert", "fraud-check"]
  ) {
    id
    type
    summary
    ruleId
  }
}
```

### Pouziti subscriptions z JavaScriptu

Server pouziva Mercurius (Fastify GraphQL plugin) s WebSocket transportem. Jakykoli GraphQL klient s podporou subscriptions funguje:

```typescript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:7226/graphql',
});

// Odber objednavkovych eventu
const unsubscribe = client.subscribe(
  {
    query: `
      subscription {
        engineEvent(patterns: ["order.*"]) {
          id
          topic
          data
          timestamp
        }
      }
    `,
  },
  {
    next: (result) => {
      const event = result.data?.engineEvent;
      console.log(`[${event.topic}]`, event.data);
    },
    error: (err) => console.error('Chyba subscription:', err),
    complete: () => console.log('Subscription uzavrena'),
  }
);

// Pozdeji: unsubscribe pro uzavreni WebSocket
// unsubscribe();
```

## GraphiQL IDE

Kdyz je `graphiql: true` (vychozi), otevreni `http://localhost:7226/graphql` v prohlizeci zobrazi interaktivni GraphiQL IDE:

```text
  ┌──────────────────────────────────────────────────┐
  │  GraphiQL                                         │
  ├─────────────────────┬────────────────────────────┤
  │  Editor dotazu      │  Panel vysledku            │
  │                     │                            │
  │  {                  │  {                         │
  │    rules {          │    "data": {               │
  │      id             │      "rules": [            │
  │      name           │        { "id": "...", ... }│
  │      enabled        │      ]                     │
  │    }                │    }                       │
  │  }                  │  }                         │
  │                     │                            │
  ├─────────────────────┴────────────────────────────┤
  │  Prohledavac dokumentace │  Auto-doplnovani       │
  └──────────────────────────────────────────────────┘
```

Funkce:
- Auto-doplnovani pro dotazy, mutace a subscriptions
- Prohledavac dokumentace zobrazujici vsechny typy a pole
- Historie dotazu
- Editor promennych pro parametrizovane dotazy

## REST vs GraphQL

| Aspekt | REST | GraphQL |
|--------|------|---------|
| **Endpointy** | Jeden na resource (mnoho URL) | Jediny endpoint (`/graphql`) |
| **Tvar dat** | Fixni struktura odpovedi | Klient voli pole |
| **Vnorena data** | Potreba vice requestu | Jeden request s vnorenim |
| **Subscriptions** | SSE (oddeleny endpoint) | Vestavene pres WebSocket |
| **Dokumentace** | Swagger/OpenAPI | Introspektovatelne schema + GraphiQL |
| **Cache** | HTTP cache (ETags, Cache-Control) | Vyzaduje klientskou cache |
| **Nastroje** | curl, Postman, jakykoli HTTP klient | GraphQL klienti (Apollo, urql, graphql-ws) |
| **Nejlepsi pro** | Jednoduchy CRUD, externi API | Dashboardy, slozite dotazy, real-time |

Obe API bezi soucasne. Pouzijte REST pro jednoduche operace a externi integrace, GraphQL pro dashboardy a slozite datove potreby.

## Cviceni

1. Spustte server s povolenym GraphQL (vychozi)
2. Otevrete GraphiQL na `http://localhost:7226/graphql` v prohlizeci
3. Vytvorte pravidlo pomoci GraphQL mutace, ktere reaguje na eventy `order.created`
4. Pomoci jednoho GraphQL dotazu nacente vsechna pravidla vcetne detailu triggeru a tagu
5. Emitujte event `order.created` pres mutaci
6. Dotazte se na health a stats enginu v jedinem requestu

<details>
<summary>Reseni</summary>

Spusteni serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start();
console.log(`GraphiQL: ${server.address}/graphql`);
```

Vytvoreni pravidla (vlozte do GraphiQL):

```graphql
mutation {
  createRule(input: {
    id: "order-tracker"
    name: "Sledovac objednavek"
    trigger: { type: event, topic: "order.created" }
    actions: [{
      type: set_fact
      key: "order:${event.orderId}:status"
      value: "pending"
    }]
  }) {
    id
    name
    enabled
    version
  }
}
```

Nacteni vsech pravidel:

```graphql
{
  rules {
    id
    name
    priority
    enabled
    tags
    trigger {
      type
      topic
      pattern
      name
    }
  }
}
```

Emitovani eventu:

```graphql
mutation {
  emitEvent(input: {
    topic: "order.created"
    data: { orderId: "ord-1", total: 150 }
  }) {
    id
    topic
    timestamp
  }
}
```

Health a stats v jednom dotazu:

```graphql
{
  health {
    status
    uptime
    version
    engine { name running }
  }
  stats {
    ruleCount
    factCount
    timerCount
    eventCount
  }
}
```

</details>

## Shrnuti

- GraphQL bezi vedle REST na stejnem serveru, vychozi endpoint `/graphql`
- Dotazy vam umoznuji nacist presne ta pole, ktera potrebujete — vcetne vnorenych `group`, `versions` a `auditEntries`
- Mutace odrazejí zapisove operace REST: vytvoreni/aktualizace/smazani pravidel, emitovani eventu, nastaveni faktu, sprava casovacu
- Subscriptions dorucuji real-time eventy pres WebSocket — ekvivalent SSE s filtrovanim topicu a typovanymi payloady
- GraphiQL IDE poskytuje auto-doplnovani, prohledavac dokumentace a interaktivni provadeni dotazu
- Schema je postaveno ze souboru `.graphql` a pouziva Mercurius (Fastify GraphQL plugin) s podporou WebSocket subscriptions
- Pouzijte REST pro jednoduche operace a externi API; pouzijte GraphQL pro dashboardy a slozite dotazy vyzadujici vnorena data

---

Dalsi: [Prikazovy radek](./04-cli.md)
