# Váš první pravidlový engine

V této kapitole nainstalujete noex-rules, vytvoříte běžící engine a ověříte, že funguje. Na konci budete mít plně funkční engine zpracovávající události a vykonávající pravidla.

## Co se naučíte

- Jak nainstalovat noex-rules a nastavit TypeScript
- Jak vytvořit a spustit engine pomocí `RuleEngine.start()`
- Jaké konfigurační volby jsou k dispozici
- Jak zkontrolovat stav enginu a čistě ho ukončit

## Instalace

Nainstalujte balíček:

```bash
npm install @hamicek/noex-rules
```

noex-rules je napsaný v TypeScriptu a dodává se s typovými deklaracemi. Žádný další balíček `@types` není potřeba.

### Konfigurace TypeScriptu

Zajistěte, aby váš `tsconfig.json` měl tato nastavení:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  }
}
```

Engine používá async/await a ESM importy, proto je doporučen `ES2022` nebo novější.

## Spuštění enginu

Vstupním bodem je `RuleEngine.start()` — statická factory metoda, která vytvoří a inicializuje engine:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();
```

To je vše. Nyní máte běžící engine s rozumnými výchozími hodnotami. Metoda `start()` je asynchronní, protože inicializuje interní úložiště a volitelně načítá perzistovaný stav.

### S konfigurací

Předejte konfigurační objekt pro přizpůsobení chování:

```typescript
const engine = await RuleEngine.start({
  name: 'my-app',
  maxConcurrency: 20,
  debounceMs: 50,
});
```

### Konfigurační volby

| Volba | Výchozí | Účel |
|-------|---------|------|
| `name` | `'rule-engine'` | Název instance, užitečný při více enginech |
| `maxConcurrency` | `10` | Maximální počet paralelních vyhodnocení pravidel |
| `debounceMs` | `0` | Zpoždění debounce pro změny faktů (ms) |
| `services` | `{}` | Externí služby pro akce `call_service` |
| `tracing` | — | Povolení debug trasování |
| `persistence` | — | Perzistence pravidel a faktů do úložiště |
| `timerPersistence` | — | Perzistence časovačů přes restarty |
| `audit` | — | Audit logování pro změny pravidel |
| `versioning` | — | Historie verzí pravidel a rollback |
| `hotReload` | — | Auto-reload pravidel ze souborů |
| `metrics` | — | Sběr Prometheus metrik |
| `opentelemetry` | — | Integrace OpenTelemetry trasování |
| `baseline` | — | Baseline detekce anomálií |
| `backwardChaining` | — | Povolení cílově řízených dotazů |

Pokročilé volby pokryjeme v pozdějších kapitolách. Prozatím jsou `name` a `maxConcurrency` vše, co potřebujete.

## Životní cyklus enginu

```text
  RuleEngine.start(config)
         │
         ▼
  ┌─────────────────┐
  │  Engine běží     │◄──── engine.isRunning === true
  │                  │
  │  • Registr. prav.│
  │  • Emit událostí │
  │  • Nastavení fakt│
  │  • Nastavení čas.│
  └────────┬────────┘
           │
    engine.stop()
           │
           ▼
  ┌─────────────────┐
  │  Engine zastaven │◄──── engine.isRunning === false
  │                  │
  │  Časovače smazan│
  │  Listenery uvoln│
  └─────────────────┘
```

### Kontrola stavu

```typescript
if (engine.isRunning) {
  console.log('Engine je aktivní');
}
```

### Statistiky enginu

Engine sleduje klíčové metriky od momentu spuštění:

```typescript
const stats = engine.getStats();
console.log(stats);
// {
//   rulesCount: 0,
//   factsCount: 0,
//   timersCount: 0,
//   eventsProcessed: 0,
//   rulesExecuted: 0,
//   avgProcessingTimeMs: 0,
// }
```

### Zastavení enginu

Vždy zastavte engine, když s ním skončíte. Tím se vymažou všechny časovače, dokončí čekající operace a uvolní prostředky:

```typescript
await engine.stop();
```

Po `stop()` nebude volání `emit()`, `setFact()` ani `setTimer()` mít žádný efekt.

## Kompletní funkční příklad

Minimální skript, který spustí engine, zaregistruje jedno pravidlo, zpracuje jednu událost a ukončí se:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  // 1. Spuštění enginu
  const engine = await RuleEngine.start({
    name: 'hello-rules',
  });

  console.log('Engine spuštěn:', engine.isRunning);
  // Engine spuštěn: true

  // 2. Registrace jednoduchého pravidla
  engine.registerRule({
    id: 'hello-world',
    name: 'Hello World Rule',
    priority: 100,
    enabled: true,
    tags: ['demo'],
    trigger: { type: 'event', topic: 'greeting' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Ahoj z pravidlového enginu! Přijato: ${event.name}',
      },
    ],
  });

  console.log('Registrovaná pravidla:', engine.getStats().rulesCount);
  // Registrovaná pravidla: 1

  // 3. Odběr všech událostí
  engine.subscribe('*', (event) => {
    console.log(`Událost: ${event.topic}`, event.data);
  });

  // 4. Emitování události pro spuštění pravidla
  await engine.emit('greeting', { name: 'World' });

  // 5. Kontrola statistik
  const stats = engine.getStats();
  console.log('Zpracované události:', stats.eventsProcessed);
  console.log('Vykonaná pravidla:', stats.rulesExecuted);

  // 6. Ukončení
  await engine.stop();
  console.log('Engine zastaven:', !engine.isRunning);
}

main();
```

### Co se děje krok za krokem

1. `RuleEngine.start()` vytvoří engine a inicializuje všechna interní úložiště
2. `registerRule()` přidá pravidlo, které se spouští na topic `greeting`
3. `subscribe('*', ...)` zaregistruje listener pro všechny události (včetně interních)
4. `emit('greeting', { name: 'World' })` odešle událost do enginu
5. Engine porovná topic události se všemi triggery pravidel
6. „Hello World Rule" odpovídá, jeho (prázdné) podmínky projdou a log akce se vykoná
7. `stop()` čistě ukončí engine

## Cvičení

Vytvořte skript, který:

1. Spustí engine pojmenovaný `'exercise-01'` s `maxConcurrency: 5`
2. Zaregistruje dvě pravidla:
   - Pravidlo A: spouští se na `app.start`, loguje "Application started"
   - Pravidlo B: spouští se na `app.stop`, loguje "Application shutting down"
3. Emituje `app.start`, poté `app.stop`
4. Vypíše `engine.getStats()` před ukončením
5. Zastaví engine

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

async function main() {
  const engine = await RuleEngine.start({
    name: 'exercise-01',
    maxConcurrency: 5,
  });

  engine.registerRule({
    id: 'app-start-log',
    name: 'Log App Start',
    priority: 100,
    enabled: true,
    tags: ['lifecycle'],
    trigger: { type: 'event', topic: 'app.start' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Application started',
      },
    ],
  });

  engine.registerRule({
    id: 'app-stop-log',
    name: 'Log App Stop',
    priority: 100,
    enabled: true,
    tags: ['lifecycle'],
    trigger: { type: 'event', topic: 'app.stop' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'info',
        message: 'Application shutting down',
      },
    ],
  });

  await engine.emit('app.start', {});
  await engine.emit('app.stop', {});

  console.log(engine.getStats());
  // { rulesCount: 2, eventsProcessed: 2, rulesExecuted: 2, ... }

  await engine.stop();
}

main();
```

Obě pravidla se spouštějí na různé topiky a vykonávají se nezávisle. Statistiky ukazují 2 zpracované události a 2 vykonaná pravidla.

</details>

## Shrnutí

- Instalace přes `npm install @hamicek/noex-rules` — žádné extra typové balíčky nejsou potřeba
- `RuleEngine.start(config)` je jediný vstupní bod — vrací běžící engine
- `name` a `maxConcurrency` jsou nejběžnější konfigurační volby
- `engine.isRunning` kontroluje, zda je engine aktivní
- `engine.getStats()` poskytuje runtime metriky: počet pravidel, počet událostí, dobu vykonání
- `engine.stop()` čistě ukončí — vždy ho zavolejte, když skončíte
- Engine je plně asynchronní: `start()`, `emit()`, `setFact()` a `stop()` vracejí promise

---

Další: [Pravidla a eventy](./02-pravidla-a-eventy.md)
