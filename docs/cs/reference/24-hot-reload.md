# Hot Reload

Automatická synchronizace pravidel z externích zdrojů. HotReloadWatcher monitoruje YAML soubory nebo StorageAdapter na změny a aplikuje je do běžícího enginu bez restartu.

## Import

```typescript
import {
  HotReloadWatcher,
  // Typy
  HotReloadConfig,
  HotReloadStatus,
  ReloadResult,
  RuleDiff,
  RuleSource,
  FileSourceConfig,
  StorageSourceConfig,
  FileRuleSource,
  StorageRuleSource,
} from '@hamicek/noex-rules';
```

---

## HotReloadWatcher

Monitoruje externí zdroje pravidel a automaticky synchronizuje změny do enginu. Používá polling s konfigurovatelným intervalem. Změny jsou detekovány pomocí SHA-256 hashování definic pravidel.

### Factory metoda

```typescript
static async start(
  engine: RuleEngine,
  config: HotReloadConfig
): Promise<HotReloadWatcher>
```

Vytvoří a spustí instanci HotReloadWatcher. Inicializuje baseline hashe z aktuálně registrovaných pravidel a naplánuje první kontrolu.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| engine | `RuleEngine` | ano | Engine pro synchronizaci pravidel |
| config | `HotReloadConfig` | ano | Konfigurace hot reload |

**Návratová hodnota:** `Promise<HotReloadWatcher>` — Běžící instance watcheru

**Příklad:**

```typescript
import { RuleEngine, HotReloadWatcher } from '@hamicek/noex-rules';

const engine = await RuleEngine.start();

const watcher = await HotReloadWatcher.start(engine, {
  intervalMs: 5000,
  files: {
    paths: ['./rules'],
    patterns: ['*.yaml', '*.yml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
});
```

### stop()

```typescript
async stop(): Promise<void>
```

Zastaví watcher a uvolní zdroje. Zruší čekající timer a zastaví interní GenServer.

**Příklad:**

```typescript
await watcher.stop();
```

### getStatus()

```typescript
getStatus(): HotReloadStatus
```

Vrátí aktuální stav watcheru včetně stavu běhu, statistik a konfigurace.

**Návratová hodnota:** `HotReloadStatus` — Aktuální stav watcheru

**Příklad:**

```typescript
const status = watcher.getStatus();

console.log(`Běží: ${status.running}`);
console.log(`Sledovaných pravidel: ${status.trackedRulesCount}`);
console.log(`Úspěšných reloadů: ${status.reloadCount}`);
console.log(`Neúspěšných reloadů: ${status.failureCount}`);

if (status.lastReloadAt) {
  console.log(`Poslední reload: ${new Date(status.lastReloadAt).toISOString()}`);
}
```

### computeRuleHash()

```typescript
static computeRuleHash(rule: RuleInput): string
```

Vypočítá deterministický SHA-256 hash pro pravidlo. Klíče jsou seřazeny abecedně pro zajištění konzistence bez ohledu na pořadí vlastností.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| rule | `RuleInput` | ano | Pravidlo k hashování |

**Návratová hodnota:** `string` — Hexadecimální SHA-256 hash

**Příklad:**

```typescript
const hash = HotReloadWatcher.computeRuleHash({
  id: 'my-rule',
  trigger: { type: 'event', topic: 'user.created' },
  conditions: [],
  actions: [{ type: 'emit_event', topic: 'welcome.send' }],
});

console.log(hash); // '3a7bd...'
```

---

## HotReloadConfig

```typescript
interface HotReloadConfig {
  intervalMs?: number;
  files?: FileSourceConfig;
  storage?: StorageSourceConfig;
  validateBeforeApply?: boolean;
  atomicReload?: boolean;
}
```

Konfigurace chování hot reload.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| intervalMs | `number` | `5000` | Interval pollingu v milisekundách |
| files | `FileSourceConfig` | — | Konfigurace souborového zdroje |
| storage | `StorageSourceConfig` | — | Konfigurace zdroje storage adapteru |
| validateBeforeApply | `boolean` | `true` | Validovat pravidla před aplikací změn |
| atomicReload | `boolean` | `true` | Aplikovat všechny změny atomicky nebo žádné |

**Příklad:**

```typescript
const config: HotReloadConfig = {
  intervalMs: 10000,
  files: {
    paths: ['./rules', './rules-extra'],
    patterns: ['*.yaml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
};
```

---

## FileSourceConfig

```typescript
interface FileSourceConfig {
  paths: string[];
  patterns?: string[];
  recursive?: boolean;
}
```

Konfigurace souborových zdrojů pravidel.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| paths | `string[]` | — | Cesty k YAML souborům nebo adresářům |
| patterns | `string[]` | `['*.yaml', '*.yml']` | Glob patterny pro filtrování |
| recursive | `boolean` | `false` | Rekurzivně procházet adresáře |

**Příklad:**

```typescript
const fileConfig: FileSourceConfig = {
  paths: ['./rules', './config/rules.yaml'],
  patterns: ['*.yaml', '*.yml'],
  recursive: true,
};
```

---

## StorageSourceConfig

```typescript
interface StorageSourceConfig {
  adapter: StorageAdapter;
  key?: string;
}
```

Konfigurace zdrojů pravidel ze StorageAdapteru.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Storage adapter pro načítání pravidel |
| key | `string` | `'hot-reload:rules'` | Klíč v úložišti |

**Příklad:**

```typescript
import { RedisStorageAdapter } from '@hamicek/noex';

const storageConfig: StorageSourceConfig = {
  adapter: new RedisStorageAdapter({ url: 'redis://localhost:6379' }),
  key: 'myapp:rules',
};
```

---

## HotReloadStatus

```typescript
interface HotReloadStatus {
  running: boolean;
  intervalMs: number;
  trackedRulesCount: number;
  lastReloadAt: number | null;
  reloadCount: number;
  failureCount: number;
}
```

Veřejný stav hot reload watcheru.

| Pole | Typ | Popis |
|------|-----|-------|
| running | `boolean` | Zda watcher aktivně polluje |
| intervalMs | `number` | Nakonfigurovaný interval pollingu |
| trackedRulesCount | `number` | Počet sledovaných pravidel |
| lastReloadAt | `number \| null` | Timestamp posledního úspěšného reloadu |
| reloadCount | `number` | Celkový počet úspěšných reloadů |
| failureCount | `number` | Celkový počet neúspěšných reloadů |

---

## ReloadResult

```typescript
interface ReloadResult {
  success: boolean;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  durationMs: number;
  error?: string;
  timestamp: number;
}
```

Výsledek jednoho reload cyklu.

| Pole | Typ | Popis |
|------|-----|-------|
| success | `boolean` | Zda reload proběhl úspěšně |
| addedCount | `number` | Počet přidaných pravidel |
| removedCount | `number` | Počet odebraných pravidel |
| modifiedCount | `number` | Počet modifikovaných pravidel |
| durationMs | `number` | Doba trvání reloadu v milisekundách |
| error | `string` | Chybová zpráva pokud reload selhal |
| timestamp | `number` | Timestamp dokončení reloadu |

---

## RuleDiff

```typescript
interface RuleDiff {
  added: RuleInput[];
  removed: string[];
  modified: RuleInput[];
}
```

Výsledek porovnání aktuálních a nových pravidel.

| Pole | Typ | Popis |
|------|-----|-------|
| added | `RuleInput[]` | Pravidla přítomná ve zdroji ale ne v enginu |
| removed | `string[]` | ID pravidel přítomných v enginu ale ne ve zdroji |
| modified | `RuleInput[]` | Pravidla se změněným obsahem |

---

## RuleSource

```typescript
interface RuleSource {
  loadRules(): Promise<RuleInput[]>;
  readonly name: string;
}
```

Rozhraní pro zdroje pravidel. Implementujte pro vytvoření vlastních zdrojů.

| Člen | Typ | Popis |
|------|-----|-------|
| loadRules | `() => Promise<RuleInput[]>` | Načte pravidla ze zdroje |
| name | `string` | Název zdroje pro logování a diagnostiku |

---

## FileRuleSource

```typescript
class FileRuleSource implements RuleSource {
  readonly name = 'file';
  constructor(config: FileSourceConfig);
  loadRules(): Promise<RuleInput[]>;
}
```

Načítá pravidla z YAML souborů a adresářů. Každá cesta může být soubor (načten přímo) nebo adresář (prohledán na odpovídající soubory).

**Příklad:**

```typescript
const source = new FileRuleSource({
  paths: ['./rules'],
  patterns: ['*.yaml'],
  recursive: true,
});

const rules = await source.loadRules();
console.log(`Načteno ${rules.length} pravidel ze souborů`);
```

---

## StorageRuleSource

```typescript
class StorageRuleSource implements RuleSource {
  readonly name = 'storage';
  constructor(config: StorageSourceConfig);
  loadRules(): Promise<RuleInput[]>;
}
```

Načítá pravidla z externího StorageAdapteru. Očekává data ve formátu `{ rules: RuleInput[] }`.

**Příklad:**

```typescript
const source = new StorageRuleSource({
  adapter: myStorageAdapter,
  key: 'app:rules',
});

const rules = await source.loadRules();
```

---

## Kompletní příklad

```typescript
import {
  RuleEngine,
  HotReloadWatcher,
  Rule,
  onEvent,
  emit,
} from '@hamicek/noex-rules';

// Spuštění enginu s počátečními pravidly
const engine = await RuleEngine.start();

await engine.registerRule(
  Rule.create('initial-rule')
    .when(onEvent('user.created'))
    .then(emit('welcome.send'))
    .build()
);

// Spuštění hot reload watcheru
const watcher = await HotReloadWatcher.start(engine, {
  intervalMs: 5000,
  files: {
    paths: ['./rules'],
    patterns: ['*.yaml', '*.yml'],
    recursive: true,
  },
  validateBeforeApply: true,
  atomicReload: true,
});

// Monitorování stavu
setInterval(() => {
  const status = watcher.getStatus();
  console.log(`[Hot Reload] Sledováno: ${status.trackedRulesCount}, ` +
    `Reloadů: ${status.reloadCount}, Selhání: ${status.failureCount}`);
}, 30000);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await watcher.stop();
  await engine.stop();
});
```

---

## Audit události

HotReloadWatcher zaznamenává následující audit události, když je audit logging povolen:

| Událost | Kdy |
|---------|-----|
| `hot_reload_started` | Reload cyklus začíná s detekovanými změnami |
| `hot_reload_completed` | Reload cyklus úspěšně dokončen |
| `hot_reload_failed` | Reload cyklus selhal (validace nebo chyba) |

**Příklad audit záznamu:**

```json
{
  "type": "hot_reload_completed",
  "data": {
    "addedCount": 2,
    "removedCount": 1,
    "modifiedCount": 3,
    "durationMs": 45
  }
}
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [YAML Loader](./14-dsl-yaml.md) — Funkce pro načítání YAML pravidel
- [Validation](./17-validation.md) — Validace pravidel před aplikací
- [Audit](./20-audit.md) — Audit logování pro reload události
- [Persistence](./18-persistence.md) — Rozhraní StorageAdapter
