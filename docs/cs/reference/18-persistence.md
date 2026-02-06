# Persistence

Persistence pravidel pomocí externích storage adapterů. Ukládá pravidla do úložiště (SQLite, soubor, paměť) a umožňuje jejich obnovení po restartu.

## Import

```typescript
import {
  RulePersistence,
  // Typy
  RulePersistenceOptions,
  PersistenceConfig,
  TimerPersistenceConfig,
  AuditPersistenceConfig,
} from '@hamicek/noex-rules';

// StorageAdapter z core noex balíčku
import { StorageAdapter, SQLiteAdapter, FileAdapter } from '@hamicek/noex';
```

---

## RulePersistence

Persistuje pravidla do externího úložiště pomocí `StorageAdapter`. Podporuje verzování schématu pro budoucí migrace.

### Konstruktor

```typescript
new RulePersistence(adapter: StorageAdapter, options?: RulePersistenceOptions)
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| adapter | `StorageAdapter` | ano | Instance storage adapteru (SQLite, soubor, paměť) |
| options | `RulePersistenceOptions` | ne | Možnosti persistence |

**Příklad:**

```typescript
import { RulePersistence } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = new SQLiteAdapter({ filename: './rules.db' });
const persistence = new RulePersistence(adapter);
```

### save()

```typescript
async save(rules: Rule[], groups?: RuleGroup[]): Promise<void>
```

Uloží pravidla a volitelně skupiny do úložiště.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| rules | `Rule[]` | ano | Pole pravidel k uložení |
| groups | `RuleGroup[]` | ne | Pole skupin pravidel k uložení |

**Příklad:**

```typescript
const rules = engine.getAllRules();
const groups = engine.getAllGroups();

await persistence.save(rules, groups);
```

### load()

```typescript
async load(): Promise<LoadResult>
```

Načte pravidla a skupiny z úložiště. Vrátí prázdná pole pokud data neexistují nebo nesouhlasí verze schématu.

**Návratová hodnota:** `LoadResult` — objekt s poli `rules` a `groups`

**Příklad:**

```typescript
const { rules, groups } = await persistence.load();

for (const rule of rules) {
  await engine.registerRule(rule);
}

for (const group of groups) {
  engine.createGroup(group);
}
```

### clear()

```typescript
async clear(): Promise<boolean>
```

Smaže všechna persistovaná pravidla z úložiště.

**Návratová hodnota:** `boolean` — `true` pokud byla data smazána

**Příklad:**

```typescript
const deleted = await persistence.clear();
console.log(deleted ? 'Pravidla smazána' : 'Žádná pravidla ke smazání');
```

### exists()

```typescript
async exists(): Promise<boolean>
```

Zkontroluje, zda existují uložená pravidla v úložišti.

**Návratová hodnota:** `boolean` — `true` pokud persistovaná pravidla existují

**Příklad:**

```typescript
if (await persistence.exists()) {
  const { rules } = await persistence.load();
  console.log(`Načteno ${rules.length} persistovaných pravidel`);
}
```

### getKey()

```typescript
getKey(): string
```

Vrátí klíč použitý pro persistenci v úložišti.

**Návratová hodnota:** `string` — klíč úložiště (výchozí: `'rules'`)

### getSchemaVersion()

```typescript
getSchemaVersion(): number
```

Vrátí aktuální verzi schématu.

**Návratová hodnota:** `number` — verze schématu (výchozí: `1`)

---

## RulePersistenceOptions

```typescript
interface RulePersistenceOptions {
  key?: string;
  schemaVersion?: number;
}
```

Možnosti pro `RulePersistence`.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| key | `string` | `'rules'` | Klíč úložiště pro persistenci |
| schemaVersion | `number` | `1` | Verze schématu pro migrace |

**Příklad:**

```typescript
const persistence = new RulePersistence(adapter, {
  key: 'my-rules',
  schemaVersion: 2,
});
```

---

## LoadResult

```typescript
interface LoadResult {
  rules: Rule[];
  groups: RuleGroup[];
}
```

Výsledek načtení persistovaného stavu.

| Pole | Typ | Popis |
|------|-----|-------|
| rules | `Rule[]` | Načtená pravidla (prázdné pokud žádná nebo nesouhlasí schéma) |
| groups | `RuleGroup[]` | Načtené skupiny (prázdné pokud žádné) |

---

## PersistenceConfig

```typescript
interface PersistenceConfig {
  adapter: StorageAdapter;
  key?: string;
  schemaVersion?: number;
}
```

Konfigurace persistence pravidel v `RuleEngineConfig`.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Storage adapter (např. `SQLiteAdapter` z `@hamicek/noex`) |
| key | `string` | `'rules'` | Klíč úložiště |
| schemaVersion | `number` | `1` | Verze schématu |

**Příklad:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  persistence: {
    adapter: new SQLiteAdapter({ filename: './data/rules.db' }),
    key: 'production-rules',
  },
});
```

---

## TimerPersistenceConfig

```typescript
interface TimerPersistenceConfig {
  adapter: StorageAdapter;
  checkIntervalMs?: number;
}
```

Konfigurace persistence trvalých časovačů.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Storage adapter pro metadata časovačů |
| checkIntervalMs | `number` | `1000` | Interval kontroly vypršených časovačů v ms |

**Příklad:**

```typescript
const engine = await RuleEngine.start({
  timerPersistence: {
    adapter: new SQLiteAdapter({ filename: './data/timers.db' }),
    checkIntervalMs: 500,
  },
});
```

---

## AuditPersistenceConfig

```typescript
interface AuditPersistenceConfig {
  adapter: StorageAdapter;
  retentionMs?: number;
  batchSize?: number;
}
```

Konfigurace persistence audit logu.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Storage adapter pro audit záznamy |
| retentionMs | `number` | 30 dní | Jak dlouho uchovávat záznamy v ms |
| batchSize | `number` | `100` | Počet záznamů na persistence batch |

**Příklad:**

```typescript
const engine = await RuleEngine.start({
  audit: {
    adapter: new SQLiteAdapter({ filename: './data/audit.db' }),
    retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 dní
    batchSize: 50,
  },
});
```

---

## StorageAdapter Interface

Interface `StorageAdapter` je poskytován balíčkem `@hamicek/noex`. Běžné implementace:

| Adapter | Balíček | Popis |
|---------|---------|-------|
| `SQLiteAdapter` | `@hamicek/noex` | SQLite souborové úložiště |
| `FileAdapter` | `@hamicek/noex` | JSON souborové úložiště |
| `MemoryAdapter` | `@hamicek/noex` | In-memory úložiště (neperzistentní) |

```typescript
interface StorageAdapter {
  save<T>(key: string, state: PersistedState<T>): Promise<void>;
  load<T>(key: string): Promise<PersistedState<T> | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

interface PersistedState<T> {
  state: T;
  metadata: StateMetadata;
}

interface StateMetadata {
  persistedAt: number;
  serverId: string;
  schemaVersion: number;
}
```

---

## Kompletní příklad

```typescript
import { RuleEngine, RulePersistence, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// Vytvoření storage adapteru
const adapter = new SQLiteAdapter({ filename: './rules.db' });

// Možnost 1: Použití RulePersistence přímo
const persistence = new RulePersistence(adapter);

// Ruční uložení pravidel
const rules = engine.getAllRules();
await persistence.save(rules);

// Načtení pravidel při startu
if (await persistence.exists()) {
  const { rules, groups } = await persistence.load();
  for (const rule of rules) {
    await engine.registerRule(rule);
  }
}

// Možnost 2: Konfigurace persistence v RuleEngine
const engine = await RuleEngine.start({
  persistence: {
    adapter: new SQLiteAdapter({ filename: './data/rules.db' }),
  },
  timerPersistence: {
    adapter: new SQLiteAdapter({ filename: './data/timers.db' }),
  },
});

// Engine automaticky načte persistovaná pravidla při startu
// a ukládá při registerRule/unregisterRule
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Používá persistenci pro automatické načítání/ukládání pravidel
- [TimerManager](./04-timer-manager.md) — Používá timer persistenci pro trvalé časovače
- [Audit](./20-audit.md) — Používá audit persistenci pro záznamy logu
- [Configuration](./30-configuration.md) — Kompletní reference konfigurace
