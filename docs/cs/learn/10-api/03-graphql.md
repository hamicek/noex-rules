# GraphQL API

REST endpointy fungují dobře pro jednoduché CRUD operace, ale někdy potřebujete větší flexibilitu: načtení pravidla spolu s jeho skupinou, historií verzí a posledních audit záznamů — vše v jednom requestu. GraphQL API v noex-rules vám umožňuje požadovat přesně ta data, která potřebujete, s vnořeným rozlišením polí, real-time subscriptions přes WebSocket a interaktivním GraphiQL IDE pro exploraci.

## Co se naučíte

- Jak GraphQL doplňuje REST API
- Kompletní schéma dotazů, mutací a subscriptions
- Načítání vnořených dat v jediném requestu
- Real-time event subscriptions přes WebSocket
- Používání GraphiQL IDE pro exploraci a debugging
- Kdy zvolit GraphQL vs REST

## Nastavení

GraphQL je ve výchozím nastavení povolený při spuštění serveru. Endpoint je registrovaný na root úrovni (ne pod API prefixem):

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start({
  server: {
    graphql: true, // Výchozí — povoleno se všemi funkcemi
  },
});

// GraphQL endpoint:  http://localhost:7226/graphql
// GraphiQL IDE:      http://localhost:7226/graphql (v prohlížeči)
```

### Konfigurace

```typescript
const server = await RuleEngineServer.start({
  server: {
    graphql: {
      path: '/graphql',        // Výchozí: '/graphql'
      graphiql: true,          // Výchozí: true — interaktivní IDE
      subscriptions: true,     // Výchozí: true — WebSocket subscriptions
    },
  },
});
```

Pro úplné vypnutí GraphQL:

```typescript
const server = await RuleEngineServer.start({
  server: { graphql: false },
});
```

## Dotazy

Dotazy jsou read-only operace. GraphQL schéma vystavuje všechna data enginu přes typovanou hierarchii:

### Pravidla

```graphql
# Výpis všech pravidel
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

# Získání jednoho pravidla s vnořenou skupinou a historií verzí
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

Pole `group`, `versions` a `auditEntries` jsou **field resolvery** — načítají data na vyžádání, pouze když jsou požadována. Dotaz, který nepožaduje verze, nebude mít náklady na jejich načítání.

### Fakta, eventy a časovače

```graphql
# Všechna fakta
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

# Všechny aktivní časovače
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

### Zpětné řetězení

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
# Dotaz na audit záznamy s filtry
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

# Porovnání dvou verzí pravidla
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

Mutace modifikují stav enginu. Odrážejí zápisové operace REST API:

### Správa pravidel

```graphql
# Vytvoření pravidla
mutation {
  createRule(input: {
    id: "new-rule"
    name: "Nové pravidlo"
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

# Smazání, povolení, zakázání
mutation { deleteRule(id: "new-rule") }
mutation { enableRule(id: "new-rule") { id enabled } }
mutation { disableRule(id: "new-rule") { id enabled } }

# Rollback na předchozí verzi
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
# Nastavení faktu
mutation {
  setFact(key: "customer:c-42:tier", value: "vip") {
    key
    value
    updatedAt
  }
}

# Smazání faktu
mutation { deleteFact(key: "customer:c-42:tier") }

# Emitování eventu
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

# Emitování korelovaného eventu
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

### Časovače a skupiny

```graphql
# Vytvoření časovače
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

# Zrušení časovače
mutation { cancelTimer(name: "payment-timeout") }

# Vytvoření skupiny
mutation {
  createGroup(input: {
    id: "fraud-rules"
    name: "Pravidla detekce podvodů"
    description: "Všechna pravidla související s detekcí podvodů"
    enabled: true
  }) {
    id
    name
    enabled
  }
}
```

## Subscriptions

Subscriptions doručují eventy v reálném čase přes WebSocket. Jsou GraphQL ekvivalentem SSE:

### Engine eventy

```graphql
# Odběr všech eventů
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

# Odběr s filtrováním topiců
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
# Odběr audit eventů provádění pravidel
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

# Filtrování podle konkrétních typů eventů a pravidel
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

### Použití subscriptions z JavaScriptu

Server používá Mercurius (Fastify GraphQL plugin) s WebSocket transportem. Jakýkoli GraphQL klient s podporou subscriptions funguje:

```typescript
import { createClient } from 'graphql-ws';

const client = createClient({
  url: 'ws://localhost:7226/graphql',
});

// Odběr objednávkových eventů
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
    complete: () => console.log('Subscription uzavřena'),
  }
);

// Později: unsubscribe pro uzavření WebSocket
// unsubscribe();
```

## GraphiQL IDE

Když je `graphiql: true` (výchozí), otevření `http://localhost:7226/graphql` v prohlížeči zobrazí interaktivní GraphiQL IDE:

```text
  ┌──────────────────────────────────────────────────┐
  │  GraphiQL                                         │
  ├─────────────────────┬────────────────────────────┤
  │  Editor dotazů      │  Panel výsledků            │
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
  │  Prohlížeč dokumentace │  Auto-doplňování        │
  └──────────────────────────────────────────────────┘
```

Funkce:
- Auto-doplňování pro dotazy, mutace a subscriptions
- Prohlížeč dokumentace zobrazující všechny typy a pole
- Historie dotazů
- Editor proměnných pro parametrizované dotazy

## REST vs GraphQL

| Aspekt | REST | GraphQL |
|--------|------|---------|
| **Endpointy** | Jeden na resource (mnoho URL) | Jediný endpoint (`/graphql`) |
| **Tvar dat** | Fixní struktura odpovědi | Klient volí pole |
| **Vnořená data** | Potřeba více requestů | Jeden request s vnořením |
| **Subscriptions** | SSE (oddělený endpoint) | Vestavěné přes WebSocket |
| **Dokumentace** | Swagger/OpenAPI | Introspektovatelné schéma + GraphiQL |
| **Cache** | HTTP cache (ETags, Cache-Control) | Vyžaduje klientskou cache |
| **Nástroje** | curl, Postman, jakýkoli HTTP klient | GraphQL klienti (Apollo, urql, graphql-ws) |
| **Nejlepší pro** | Jednoduchý CRUD, externí API | Dashboardy, složité dotazy, real-time |

Obě API běží současně. Použijte REST pro jednoduché operace a externí integrace, GraphQL pro dashboardy a složité datové potřeby.

## Cvičení

1. Spusťte server s povoleným GraphQL (výchozí)
2. Otevřete GraphiQL na `http://localhost:7226/graphql` v prohlížeči
3. Vytvořte pravidlo pomocí GraphQL mutace, které reaguje na eventy `order.created`
4. Pomocí jednoho GraphQL dotazu načtěte všechna pravidla včetně detailů triggerů a tagů
5. Emitujte event `order.created` přes mutaci
6. Dotažte se na health a stats enginu v jediném requestu

<details>
<summary>Řešení</summary>

Spuštění serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';

const server = await RuleEngineServer.start();
console.log(`GraphiQL: ${server.address}/graphql`);
```

Vytvoření pravidla (vložte do GraphiQL):

```graphql
mutation {
  createRule(input: {
    id: "order-tracker"
    name: "Sledovač objednávek"
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

Načtení všech pravidel:

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

Emitování eventu:

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

## Shrnutí

- GraphQL běží vedle REST na stejném serveru, výchozí endpoint `/graphql`
- Dotazy vám umožňují načíst přesně ta pole, která potřebujete — včetně vnořených `group`, `versions` a `auditEntries`
- Mutace odrážejí zápisové operace REST: vytvoření/aktualizace/smazání pravidel, emitování eventů, nastavení faktů, správa časovačů
- Subscriptions doručují real-time eventy přes WebSocket — ekvivalent SSE s filtrováním topiců a typovanými payloady
- GraphiQL IDE poskytuje auto-doplňování, prohlížeč dokumentace a interaktivní provádění dotazů
- Schéma je postaveno ze souborů `.graphql` a používá Mercurius (Fastify GraphQL plugin) s podporou WebSocket subscriptions
- Použijte REST pro jednoduché operace a externí API; použijte GraphQL pro dashboardy a složité dotazy vyžadující vnořená data

---

Další: [Příkazový řádek](./04-cli.md)
