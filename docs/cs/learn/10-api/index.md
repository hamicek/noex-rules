# Cast 10: API a integrace

Dosud jste s pravidlovym enginem komunikovali vyhradne pres TypeScript kod — primy volanim `engine.emit()`, `engine.setFact()` a `engine.query()`. V produkci vsak engine musi byt pristupny dalsim sluzbam, dashboardum a operatorum. noex-rules obsahuje plnohodnotny HTTP server, ktery vystavuje **REST endpointy**, **Server-Sent Events** pro real-time streaming, **webhooky** pro push dorucovani, **GraphQL API** pro flexibilni dotazovani a **CLI** pro operace a CI/CD workflow.

## Kapitoly

### [10.1 REST API](./01-rest-api.md)

Spustte HTTP server a komunikujte s enginem pres REST:
- Konfigurace a zivotni cyklus `RuleEngineServer.start()`
- Kompletni reference endpointu: pravidla, fakta, eventy, casovace, skupiny, health
- Swagger/OpenAPI dokumentace a CORS konfigurace
- Prakticke curl priklady pro kazdy resource

### [10.2 Notifikace v realnem case](./02-realtime.md)

Posilejte eventy klientum v okamziku jejich vzniku:
- Server-Sent Events (SSE) s filtrovanim podle topic patternu s wildcardy
- Webhooky s HMAC-SHA256 podpisy a exponencialnim backoff opakovanim
- Tvorba real-time dashboardu s browserovym API `EventSource`
- Volba mezi SSE a webhooky pro ruzne pripady pouziti

### [10.3 GraphQL API](./03-graphql.md)

Dotazujte engine s flexibilnim, typovanym API:
- Kompletni prehled schematu: dotazy, mutace, subscriptions
- Nacitani vnorenych dat v jedinem requestu (pravidla se skupinami, verzemi, audit zaznamy)
- Real-time subscriptions pres WebSocket
- GraphiQL IDE pro exploraci a debugging

### [10.4 Prikazovy radek](./04-cli.md)

Ovladejte engine z terminalu:
- Vsechny CLI prikazy: server, rule, audit, validate, test, import, export, stats, init
- Vystupni formaty: pretty, JSON, table
- CI/CD integracni vzory pro validaci a nasazeni pravidel

## Co se naucite

Na konci teto sekce budete schopni:
- Spustit a nakonfigurovat HTTP server s REST, GraphQL, SSE a Swaggerem
- Spravovat pravidla, fakta, eventy, casovace a skupiny pres REST endpointy
- Streamovat real-time eventy do prohlizecu pres SSE a do externich sluzeb pres webhooky
- Overovat autenticitu webhooku pomoci HMAC-SHA256 podpisu
- Dotazovat a mutovat engine pres GraphQL s vnorenym rozlisenim poli
- Odbirat zive engine eventy pres WebSocket
- Ovladat engine z prikazove radky pro vyvoj a CI/CD

---

Zacnete s: [REST API](./01-rest-api.md)
