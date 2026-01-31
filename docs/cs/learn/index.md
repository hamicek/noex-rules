# Naučte se noex-rules

Komplexní příručka pro Node.js vývojáře, kteří chtějí zvládnout pravidlové enginy a Complex Event Processing. Tato příručka učí nejen API, ale hlavně **způsob myšlení** v deklarativních business pravidlech.

## Pro koho je tato příručka?

- Node.js / TypeScript vývojáři (intermediate+)
- Znáte async/await a základní event-driven vzory
- Nepotřebujete předchozí zkušenosti s pravidlovými enginy nebo CEP
- Hledáte strukturovaný způsob, jak vyjádřit business logiku mimo kód

## Cesta učení

### Část 1: Úvod

Pochopte, proč pravidlový engine existuje a jaké problémy řeší.

| Kapitola | Popis |
|----------|-------|
| [1.1 Proč pravidlový engine?](./01-uvod/01-proc-pravidla.md) | Problémy s hardcoded business logikou a jak pomáhá pravidlový engine |
| [1.2 Klíčové koncepty](./01-uvod/02-klicove-koncepty.md) | Přehled pravidel, faktů, událostí, časovačů, forward chainingu a CEP |

### Část 2: Začínáme

Naučte se základní stavební bloky.

| Kapitola | Popis |
|----------|-------|
| [2.1 Váš první pravidlový engine](./02-zaciname/01-prvni-engine.md) | Instalace, konfigurace, spuštění a zastavení enginu |
| [2.2 Pravidla a eventy](./02-zaciname/02-pravidla-a-eventy.md) | Registrace pravidel, emitování událostí, odběr výsledků |
| [2.3 Práce s fakty](./02-zaciname/03-fakta.md) | Nastavení, čtení, mazání, dotazování faktů a fakty spouštěná pravidla |
| [2.4 Podmínky do hloubky](./02-zaciname/04-podminky.md) | Všechny operátory, zdroje dat, reference a interpolace řetězců |

### Část 3: Akce

Řízení toho, co se stane při spuštění pravidla.

| Kapitola | Popis |
|----------|-------|
| [3.1 Základní akce](./03-akce/01-zakladni-akce.md) | emit_event, set_fact, delete_fact, log a interpolace řetězců |
| [3.2 Časovače a plánování](./03-akce/02-casovace.md) | set_timer, cancel_timer, syntaxe trvání, pravidla spouštěná časovačem |
| [3.3 Volání externích služeb](./03-akce/03-externi-sluzby.md) | Akce call_service, registrace služeb, datové požadavky |

### Část 4: DSL

Psaní pravidel s typově bezpečnou, expresivní syntaxí.

| Kapitola | Popis |
|----------|-------|
| [4.1 Fluent Builder API](./04-dsl/01-fluent-builder.md) | Rule.create(), řetězení triggerů, podmínek a akcí |
| [4.2 Tagged šablonové literály](./04-dsl/02-tagged-sablony.md) | Kompaktní syntaxe pravidel s tagged šablonou `rule` |
| [4.3 YAML pravidla](./04-dsl/03-yaml-pravidla.md) | Načítání pravidel z YAML řetězců a souborů |
| [4.4 Volba správného přístupu](./04-dsl/04-volba-pristupu.md) | Srovnávací tabulka, rozhodovací strom, míchání přístupů |

### Část 5: Complex Event Processing

Detekce temporálních vzorů napříč událostmi.

| Kapitola | Popis |
|----------|-------|
| [5.1 Co je CEP?](./05-cep/01-co-je-cep.md) | Proč jednotlivé události nestačí, temporální uvažování |
| [5.2 Sekvence a absence](./05-cep/02-sekvence-a-absence.md) | Detekce uspořádaných a chybějících událostí v časových oknech |
| [5.3 Počet a agregace](./05-cep/03-pocet-a-agregace.md) | Frekvenční prahy a vzory numerické agregace |
| [5.4 CEP vzory v praxi](./05-cep/04-cep-vzory.md) | Kombinování vzorů, vícestupňová detekce, výkon |

### Část 6: Organizace pravidel

Struktura pravidel pro reálné aplikace.

| Kapitola | Popis |
|----------|-------|
| [6.1 Skupiny a tagy pravidel](./06-organizace/01-skupiny-a-tagy.md) | Životní cyklus skupin, feature flags, A/B testování |
| [6.2 Priorita a pořadí provádění](./06-organizace/02-priorita-a-razeni.md) | Sémantika priorit, řetězení pravidel, prevence nekonečných smyček |
| [6.3 Verzování pravidel](./06-organizace/03-verzovani.md) | Historie verzí, diffy, rollback, audit trail |

### Část 7: Persistence a spolehlivost

Přežijte restarty a zotavte se z chyb.

| Kapitola | Popis |
|----------|-------|
| [7.1 Persistence pravidel a faktů](./07-persistence/01-persistence-stavu.md) | StorageAdapter, cyklus uložení/načtení, obnova po restartu |
| [7.2 Trvanlivé časovače](./07-persistence/02-persistence-casovcu.md) | Konfigurace persistence časovačů, proč na trvanlivosti záleží |
| [7.3 Hot reload](./07-persistence/03-hot-reload.md) | Souborové zdroje, atomický reload, validace před aplikováním |

### Část 8: Pozorovatelnost

Pozorujte, debugujte a profilujte svůj pravidlový engine.

| Kapitola | Popis |
|----------|-------|
| [8.1 Debugging pravidel](./08-pozorovatelnost/01-debugging.md) | DebugController, breakpointy, snapshoty, tracing |
| [8.2 Profilování výkonu](./08-pozorovatelnost/02-profilaci.md) | Časování pravidel, počty spuštění, nejaktivnější pravidla |
| [8.3 Audit logging](./08-pozorovatelnost/03-audit-log.md) | Typy audit událostí, persistence, dotazování, retence |
| [8.4 Metriky a tracing](./08-pozorovatelnost/04-metriky.md) | Prometheus metriky, OpenTelemetry, detekce anomálií |

### Část 9: Zpětné řetězení

Dotazujte se, co musí platit, aby cíl byl splněn.

| Kapitola | Popis |
|----------|-------|
| [9.1 Dopředné vs zpětné řetězení](./09-zpetne-retezeni/01-dopredu-vs-zpet.md) | Data-driven vs goal-driven vyhodnocování |
| [9.2 Dotazování cílů](./09-zpetne-retezeni/02-dotazovani-cilu.md) | FactGoal, EventGoal, QueryResult, proof stromy |

### Část 10: API a integrace

Vystavte engine přes HTTP, SSE, GraphQL a CLI.

| Kapitola | Popis |
|----------|-------|
| [10.1 REST API](./10-api/01-rest-api.md) | RuleEngineServer, endpointy, Swagger, curl příklady |
| [10.2 Notifikace v reálném čase](./10-api/02-realtime.md) | SSE streaming, webhooky s HMAC podpisy |
| [10.3 GraphQL API](./10-api/03-graphql.md) | Schéma, dotazy, mutace, subscriptions |
| [10.4 Příkazový řádek](./10-api/04-cli.md) | Všechny CLI příkazy, CI/CD workflow |

### Část 11: Webové rozhraní

Správa pravidel vizuálně.

| Kapitola | Popis |
|----------|-------|
| [11.1 Přehled webového rozhraní](./11-webove-rozhrani/01-zaciname-s-ui.md) | Dashboard, seznam pravidel, prohlížeč faktů, emitter událostí |
| [11.2 Vizuální tvorba pravidel](./11-webove-rozhrani/02-vizualni-tvorba-pravidel.md) | Flow editor, drag-and-drop, konverze kód/vizuál |

### Část 12: Projekty

Aplikujte vše v reálných projektech.

| Kapitola | Popis |
|----------|-------|
| [12.1 Pravidlový systém pro e-shop](./12-projekty/01-eshop.md) | Dynamická cenotvorba, věrnostní úrovně, detekce opuštěného košíku |
| [12.2 Systém detekce podvodů](./12-projekty/02-detekce-podvodu.md) | Anomálie přihlášení, rychlost transakcí, skórování rizik |
| [12.3 IoT monitoring pipeline](./12-projekty/03-iot-monitoring.md) | Prahy senzorů, monitoring heartbeatu, klouzavé průměry |

## Formát kapitol

Každá kapitola obsahuje:

1. **Úvod** - Co se naučíte a proč je to důležité
2. **Teorie** - Vysvětlení konceptu s diagramy a srovnávacími tabulkami
3. **Příklad** - Kompletní spustitelný kód s postupnými kroky
4. **Cvičení** - Praktický úkol s řešením
5. **Shrnutí** - Klíčové poznatky
6. **Další kroky** - Odkaz na další kapitolu

## Získání pomoci

- [API Reference](../../../README.md) - Kompletní API dokumentace
- [Průvodce migrací](../../migration-to-dsl.md) - Migrace na DSL

---

Připraveni začít? Začněte s [Proč pravidlový engine?](./01-uvod/01-proc-pravidla.md)
