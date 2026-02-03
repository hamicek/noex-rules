# API Reference

Kompletní API reference pro `@hamicek/noex-rules`. Každá třída, metoda, typ a konfigurační možnost zdokumentovaná se signaturami a příklady.

> **Nejprve učení?** Podívejte se na [Příručku učení](../learn/index.md) pro tutoriály a koncepty.

## Základní komponenty

| Modul | Popis |
|-------|-------|
| [RuleEngine](./01-rule-engine.md) | Hlavní orchestrátor — spuštění, konfigurace a řízení enginu |
| [FactStore](./02-fact-store.md) | Správa faktů — nastavení, čtení, mazání, pattern matching |
| [EventStore](./03-event-store.md) | Ukládání a dotazování událostí podle topicu, korelace, časového rozsahu |
| [TimerManager](./04-timer-manager.md) | Plánování a rušení časovačů, parsování doby trvání |
| [RuleManager](./05-rule-manager.md) | Registrace, povolení, zakázání a dotazování pravidel |
| [TemporalProcessor](./06-temporal-processor.md) | CEP pattern matching — sekvence, absence, počet, agregace |

## Vyhodnocování

| Modul | Popis |
|-------|-------|
| [ConditionEvaluator](./07-condition-evaluator.md) | Vyhodnocení podmínek se všemi operátory a typy zdrojů |
| [ActionExecutor](./08-action-executor.md) | Vykonání akcí — emit, set_fact, call_service a další |

## DSL (Domain Specific Language)

| Modul | Popis |
|-------|-------|
| [Fluent Builder](./09-dsl-builder.md) | `Rule.create()` — typově bezpečná konstrukce pravidel |
| [Triggery](./10-dsl-triggers.md) | `onEvent()`, `onFact()`, `onTimer()`, temporální vzory |
| [Podmínky](./11-dsl-conditions.md) | `event()`, `fact()`, `context()`, `lookup()`, `baseline()` |
| [Akce](./12-dsl-actions.md) | `emit()`, `setFact()`, `setTimer()`, `callService()`, `conditional()` |
| [Tagged šablony](./13-dsl-tagged-templates.md) | `rule` tagged template literal syntaxe |
| [YAML Loader](./14-dsl-yaml.md) | Načítání pravidel, skupin, cílů, šablon z YAML |
| [Šablony pravidel](./15-dsl-templates.md) | `RuleTemplate.create()` — parametrizované blueprinty pravidel |
| [Goal Builders](./16-dsl-goals.md) | `factGoal()`, `eventGoal()` pro zpětné řetězení |

## Infrastruktura

| Modul | Popis |
|-------|-------|
| [Validace](./17-validation.md) | `RuleInputValidator`, operátory, konstanty |
| [Persistence](./18-persistence.md) | `RulePersistence`, StorageAdapter |
| [Verzování](./19-versioning.md) | `RuleVersionStore` — historie, diff, rollback |
| [Audit](./20-audit.md) | `AuditLogService` — záznam, dotazování, export |
| [Pozorovatelnost](./21-observability.md) | `MetricsCollector`, `OpenTelemetryBridge` |
| [Baseline](./22-baseline.md) | `BaselineStore` — detekce anomálií |
| [Zpětné řetězení](./23-backward-chaining.md) | `BackwardChainer` — cílově řízené dotazy |
| [Hot Reload](./24-hot-reload.md) | `HotReloadWatcher` — živé aktualizace pravidel |

## API

| Modul | Popis |
|-------|-------|
| [REST API](./25-rest-api.md) | Všechny HTTP endpointy s request/response schématy |
| [GraphQL API](./26-graphql-api.md) | Schéma, dotazy, mutace, subscriptions |
| [CLI](./27-cli.md) | Reference příkazů — validate, import, export, test |
| [Server](./28-server.md) | `RuleEngineServer` — nastavení HTTP serveru |

## Referenční tabulky

| Modul | Popis |
|-------|-------|
| [Typy](./29-types.md) | Všechny exportované typy a rozhraní |
| [Konfigurace](./30-configuration.md) | Všechny konfigurační možnosti s výchozími hodnotami |
| [Utility](./31-utilities.md) | Pomocné funkce — `generateId`, `parseDuration`, `interpolate` |
| [Chyby](./32-errors.md) | Třídy chyb a kódy |

## Rychlé odkazy

```typescript
import {
  RuleEngine,
  Rule,
  onEvent,
  onFact,
  emit,
  setFact,
  event,
  fact,
  loadRulesFromYAML,
  RuleEngineServer,
} from '@hamicek/noex-rules';
```

### Spuštění enginu

```typescript
const engine = await RuleEngine.start();
```

### Registrace pravidla

```typescript
engine.registerRule(
  Rule.create('welcome-user')
    .when(onEvent('user:registered'))
    .then(emit('notification:send', { type: 'welcome' }))
    .build()
);
```

### Emitování události

```typescript
engine.emit('user:registered', { userId: '123', email: 'user@example.com' });
```

### Spuštění HTTP serveru

```typescript
const server = await RuleEngineServer.start({ port: 3000 });
```

---

Hledáte tutoriály? Začněte s [Příručkou učení](../learn/index.md).
