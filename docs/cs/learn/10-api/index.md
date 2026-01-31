# Část 10: API a integrace

Dosud jste s pravidlovým enginem komunikovali výhradně přes TypeScript kód — přímým voláním `engine.emit()`, `engine.setFact()` a `engine.query()`. V produkci však engine musí být přístupný dalším službám, dashboardům a operátorům. noex-rules obsahuje plnohodnotný HTTP server, který vystavuje **REST endpointy**, **Server-Sent Events** pro real-time streaming, **webhooky** pro push doručování, **GraphQL API** pro flexibilní dotazování a **CLI** pro operace a CI/CD workflow.

## Kapitoly

### [10.1 REST API](./01-rest-api.md)

Spusťte HTTP server a komunikujte s enginem přes REST:
- Konfigurace a životní cyklus `RuleEngineServer.start()`
- Kompletní reference endpointů: pravidla, fakta, eventy, časovače, skupiny, health
- Swagger/OpenAPI dokumentace a CORS konfigurace
- Praktické curl příklady pro každý resource

### [10.2 Notifikace v reálném čase](./02-realtime.md)

Posílejte eventy klientům v okamžiku jejich vzniku:
- Server-Sent Events (SSE) s filtrováním podle topic patternů s wildcardy
- Webhooky s HMAC-SHA256 podpisy a exponenciálním backoff opakováním
- Tvorba real-time dashboardů s browserovým API `EventSource`
- Volba mezi SSE a webhooky pro různé případy použití

### [10.3 GraphQL API](./03-graphql.md)

Dotazujte engine s flexibilním, typovaným API:
- Kompletní přehled schématu: dotazy, mutace, subscriptions
- Načítání vnořených dat v jediném requestu (pravidla se skupinami, verzemi, audit záznamy)
- Real-time subscriptions přes WebSocket
- GraphiQL IDE pro exploraci a debugging

### [10.4 Příkazový řádek](./04-cli.md)

Ovládejte engine z terminálu:
- Všechny CLI příkazy: server, rule, audit, validate, test, import, export, stats, init
- Výstupní formáty: pretty, JSON, table
- CI/CD integrační vzory pro validaci a nasazení pravidel

## Co se naučíte

Na konci této sekce budete schopni:
- Spustit a nakonfigurovat HTTP server s REST, GraphQL, SSE a Swaggerem
- Spravovat pravidla, fakta, eventy, časovače a skupiny přes REST endpointy
- Streamovat real-time eventy do prohlížečů přes SSE a do externích služeb přes webhooky
- Ověřovat autenticitu webhooku pomocí HMAC-SHA256 podpisů
- Dotazovat a mutovat engine přes GraphQL s vnořeným rozlišením polí
- Odebírat živé engine eventy přes WebSocket
- Ovládat engine z příkazové řádky pro vývoj a CI/CD

---

Začněte s: [REST API](./01-rest-api.md)
