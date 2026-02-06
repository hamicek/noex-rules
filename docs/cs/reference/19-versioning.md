# Versioning

Sledování historie verzí pravidel s možností porovnání a návratu k předchozímu stavu. Zaznamenává snapshoty pravidel při každé změně, což umožňuje audit trail a obnovení předchozích stavů.

## Import

```typescript
import {
  RuleVersionStore,
  // Typy
  RuleVersionEntry,
  RuleVersionQuery,
  RuleVersionQueryResult,
  RuleVersionDiff,
  RuleFieldChange,
  RuleChangeType,
  RecordVersionOptions,
  VersioningConfig,
  VersioningStats,
} from '@hamicek/noex-rules';

// StorageAdapter z core noex balíčku
import { StorageAdapter, SQLiteAdapter } from '@hamicek/noex';
```

---

## RuleVersionStore

In-memory cache s asynchronní persistencí pro historii verzí pravidel. Používá write-behind pattern: `recordVersion()` je synchronní (zapisuje do cache) a periodické flushe batch dirty záznamy do storage adapteru.

### Factory metoda

```typescript
static async start(config: VersioningConfig): Promise<RuleVersionStore>
```

Vytvoří a spustí instanci `RuleVersionStore`.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `VersioningConfig` | ano | Konfigurace se storage adapterem a nastavením retence |

**Návratová hodnota:** `Promise<RuleVersionStore>` — inicializovaná instance version store

**Příklad:**

```typescript
import { RuleVersionStore } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = new SQLiteAdapter({ filename: './versions.db' });
const versionStore = await RuleVersionStore.start({
  adapter,
  maxVersionsPerRule: 50,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 dní
});
```

### recordVersion()

```typescript
recordVersion(
  rule: Rule,
  changeType: RuleChangeType,
  options?: RecordVersionOptions
): RuleVersionEntry
```

Zaznamená nový snapshot verze pravidla. Synchronní — zapisuje do cache a označí pravidlo jako dirty pro další flush cyklus. Automaticky vynucuje retenční limity.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| rule | `Rule` | ano | Pravidlo k vytvoření snapshotu |
| changeType | `RuleChangeType` | ano | Typ změny, která vyvolala tuto verzi |
| options | `RecordVersionOptions` | ne | Dodatečná metadata pro záznam verze |

**Návratová hodnota:** `RuleVersionEntry` — vytvořený záznam verze

**Příklad:**

```typescript
const entry = versionStore.recordVersion(rule, 'updated', {
  description: 'Zvýšena priorita pro kritické alerty',
});

console.log(`Zaznamenána verze ${entry.version} v čase ${entry.timestamp}`);
```

### getVersions()

```typescript
getVersions(ruleId: string): RuleVersionEntry[]
```

Vrátí všechny záznamy verzí pravidla, seřazené od nejstarší podle čísla verze.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | ID pravidla pro získání historie verzí |

**Návratová hodnota:** `RuleVersionEntry[]` — pole záznamů verzí (prázdné pokud žádná historie)

**Příklad:**

```typescript
const versions = versionStore.getVersions('rule-123');
console.log(`Pravidlo má ${versions.length} verzí`);
```

### getVersion()

```typescript
getVersion(ruleId: string, version: number): RuleVersionEntry | undefined
```

Vrátí konkrétní záznam verze podle čísla verze.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | ID pravidla |
| version | `number` | ano | Číslo verze (začíná od 1) |

**Návratová hodnota:** `RuleVersionEntry | undefined` — záznam verze, nebo `undefined` pokud nenalezen

**Příklad:**

```typescript
const v2 = versionStore.getVersion('rule-123', 2);
if (v2) {
  console.log(`Verze 2 byla ${v2.changeType} v ${new Date(v2.timestamp)}`);
}
```

### getLatestVersion()

```typescript
getLatestVersion(ruleId: string): RuleVersionEntry | undefined
```

Vrátí nejnovější záznam verze pravidla.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | ID pravidla |

**Návratová hodnota:** `RuleVersionEntry | undefined` — nejnovější záznam verze, nebo `undefined` pokud žádná historie

**Příklad:**

```typescript
const latest = versionStore.getLatestVersion('rule-123');
if (latest) {
  console.log(`Aktuální verze: ${latest.version}`);
}
```

### query()

```typescript
query(params: RuleVersionQuery): RuleVersionQueryResult
```

Dotazuje historii verzí s filtrováním, řazením a stránkováním.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| params | `RuleVersionQuery` | ano | Parametry dotazu |

**Návratová hodnota:** `RuleVersionQueryResult` — stránkovaný výsledek dotazu

**Příklad:**

```typescript
const result = versionStore.query({
  ruleId: 'rule-123',
  changeTypes: ['updated', 'enabled', 'disabled'],
  order: 'desc',
  limit: 10,
});

console.log(`Nalezeno ${result.entries.length} z ${result.totalVersions} verzí`);
console.log(`Má další: ${result.hasMore}`);
```

### diff()

```typescript
diff(ruleId: string, fromVersion: number, toVersion: number): RuleVersionDiff | undefined
```

Vypočítá rozdíly na úrovni polí mezi dvěma snapshoty verzí.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | ID pravidla |
| fromVersion | `number` | ano | Číslo verze staršího snapshotu |
| toVersion | `number` | ano | Číslo verze novějšího snapshotu |

**Návratová hodnota:** `RuleVersionDiff | undefined` — výsledek diffu, nebo `undefined` pokud některá verze nenalezena

**Příklad:**

```typescript
const diff = versionStore.diff('rule-123', 1, 3);
if (diff) {
  for (const change of diff.changes) {
    console.log(`${change.field}: ${change.oldValue} -> ${change.newValue}`);
  }
}
```

### getStats()

```typescript
getStats(): VersioningStats
```

Vrátí statistiky o version store.

**Návratová hodnota:** `VersioningStats` — objekt se statistikami

**Příklad:**

```typescript
const stats = versionStore.getStats();
console.log(`Sleduje ${stats.trackedRules} pravidel s ${stats.totalVersions} celkem verzí`);
console.log(`${stats.dirtyRules} pravidel čeká na flush`);
```

### flush()

```typescript
async flush(): Promise<void>
```

Zapíše všechny dirty historie verzí pravidel do storage adapteru. Každé pravidlo je uloženo pod vlastním klíčem (`rule-version:{ruleId}`).

**Příklad:**

```typescript
await versionStore.flush();
```

### cleanup()

```typescript
async cleanup(): Promise<number>
```

Odstraní záznamy verzí starší než nakonfigurovaný `maxAgeMs` z paměti i úložiště.

**Návratová hodnota:** `number` — celkový počet odstraněných záznamů napříč všemi pravidly

**Příklad:**

```typescript
const removed = await versionStore.cleanup();
console.log(`Odstraněno ${removed} starých záznamů verzí`);
```

### loadRule()

```typescript
async loadRule(ruleId: string): Promise<void>
```

Načte historii verzí pravidla z úložiště do cache. Určeno pro předběžné načtení nebo obnovení stavu při startu. Nic nedělá pokud již načteno.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | ID pravidla k načtení |

**Příklad:**

```typescript
await versionStore.loadRule('rule-123');
const versions = versionStore.getVersions('rule-123');
```

### stop()

```typescript
async stop(): Promise<void>
```

Zastaví version store: zapíše zbývající dirty záznamy a zruší periodický flush timer.

**Příklad:**

```typescript
await versionStore.stop();
```

---

## RuleChangeType

```typescript
type RuleChangeType =
  | 'registered'
  | 'updated'
  | 'enabled'
  | 'disabled'
  | 'unregistered'
  | 'rolled_back';
```

Typ změny, která vytvořila záznam verze.

| Hodnota | Popis |
|---------|-------|
| `'registered'` | Pravidlo bylo poprvé zaregistrováno |
| `'updated'` | Definice pravidla byla upravena |
| `'enabled'` | Pravidlo bylo povoleno |
| `'disabled'` | Pravidlo bylo zakázáno |
| `'unregistered'` | Pravidlo bylo odebráno |
| `'rolled_back'` | Pravidlo bylo obnoveno na předchozí verzi |

---

## RuleVersionEntry

```typescript
interface RuleVersionEntry {
  version: number;
  ruleSnapshot: Rule;
  timestamp: number;
  changeType: RuleChangeType;
  rolledBackFrom?: number;
  description?: string;
}
```

Jeden snapshot verze pravidla.

| Pole | Typ | Popis |
|------|-----|-------|
| version | `number` | Sekvenční číslo verze (začíná od 1) |
| ruleSnapshot | `Rule` | Kompletní snapshot pravidla v této verzi |
| timestamp | `number` | Unix timestamp vytvoření této verze |
| changeType | `RuleChangeType` | Typ změny, která vytvořila tuto verzi |
| rolledBackFrom | `number` | Pokud `changeType` je `'rolled_back'`, verze před rollbackem |
| description | `string` | Volitelný lidsky čitelný popis změny |

---

## RecordVersionOptions

```typescript
interface RecordVersionOptions {
  rolledBackFrom?: number;
  description?: string;
}
```

Možnosti pro `recordVersion()`.

| Pole | Typ | Popis |
|------|-----|-------|
| rolledBackFrom | `number` | Pokud zaznamenáváme rollback, verze před rollbackem |
| description | `string` | Lidsky čitelný popis změny |

---

## RuleVersionQuery

```typescript
interface RuleVersionQuery {
  ruleId: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
  fromVersion?: number;
  toVersion?: number;
  changeTypes?: RuleChangeType[];
  from?: number;
  to?: number;
}
```

Parametry dotazu pro historii verzí.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| ruleId | `string` | — | ID pravidla pro dotaz na verze |
| limit | `number` | `50` | Maximální počet záznamů k vrácení |
| offset | `number` | `0` | Počet záznamů k přeskočení pro stránkování |
| order | `'asc' \| 'desc'` | `'desc'` | Pořadí řazení podle čísla verze |
| fromVersion | `number` | — | Filtr: minimální číslo verze (včetně) |
| toVersion | `number` | — | Filtr: maximální číslo verze (včetně) |
| changeTypes | `RuleChangeType[]` | — | Filtr: pouze specifické typy změn |
| from | `number` | — | Filtr: záznamy vytvořené po tomto timestampu (včetně) |
| to | `number` | — | Filtr: záznamy vytvořené před tímto timestampem (včetně) |

---

## RuleVersionQueryResult

```typescript
interface RuleVersionQueryResult {
  entries: RuleVersionEntry[];
  totalVersions: number;
  hasMore: boolean;
}
```

Výsledek dotazu na historii verzí.

| Pole | Typ | Popis |
|------|-----|-------|
| entries | `RuleVersionEntry[]` | Odpovídající záznamy verzí |
| totalVersions | `number` | Celkový počet verzí pro toto pravidlo (před filtrováním) |
| hasMore | `boolean` | Zda existují další záznamy za aktuální stránkou |

---

## RuleVersionDiff

```typescript
interface RuleVersionDiff {
  ruleId: string;
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}
```

Výsledek porovnání dvou verzí pravidla.

| Pole | Typ | Popis |
|------|-----|-------|
| ruleId | `string` | ID porovnávaného pravidla |
| fromVersion | `number` | Číslo verze staršího snapshotu |
| toVersion | `number` | Číslo verze novějšího snapshotu |
| changes | `RuleFieldChange[]` | Seznam změn na úrovni polí |

---

## RuleFieldChange

```typescript
interface RuleFieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}
```

Jedna změna na úrovni pole mezi dvěma verzemi.

| Pole | Typ | Popis |
|------|-----|-------|
| field | `string` | Název změněného pole (např. `'name'`, `'priority'`, `'trigger'`) |
| oldValue | `unknown` | Hodnota ve starší verzi |
| newValue | `unknown` | Hodnota v novější verzi |

**Porovnávaná pole:** `name`, `description`, `priority`, `enabled`, `tags`, `group`, `trigger`, `conditions`, `actions`

---

## VersioningConfig

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;
  maxVersionsPerRule?: number;
  maxAgeMs?: number;
}
```

Konfigurace verzování pravidel.

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| adapter | `StorageAdapter` | — | Storage adapter pro persistenci historie verzí |
| maxVersionsPerRule | `number` | `100` | Maximální počet verzí na pravidlo |
| maxAgeMs | `number` | 90 dní | Maximální stáří záznamů verzí v milisekundách |

**Příklad:**

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new SQLiteAdapter({ filename: './data/versions.db' }),
    maxVersionsPerRule: 50,
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 dní
  },
});
```

---

## VersioningStats

```typescript
interface VersioningStats {
  trackedRules: number;
  totalVersions: number;
  dirtyRules: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}
```

Statistiky o službě verzování.

| Pole | Typ | Popis |
|------|-----|-------|
| trackedRules | `number` | Počet pravidel s historií verzí |
| totalVersions | `number` | Celkový počet záznamů verzí napříč všemi pravidly |
| dirtyRules | `number` | Počet pravidel s neuloženými změnami |
| oldestEntry | `number \| null` | Timestamp nejstaršího záznamu verze, nebo `null` pokud prázdné |
| newestEntry | `number \| null` | Timestamp nejnovějšího záznamu verze, nebo `null` pokud prázdné |

---

## Kompletní příklad

```typescript
import { RuleEngine, RuleVersionStore, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

// Možnost 1: Použití RuleVersionStore přímo
const adapter = new SQLiteAdapter({ filename: './versions.db' });
const versionStore = await RuleVersionStore.start({ adapter });

// Zaznamenání verze při změně pravidla
versionStore.recordVersion(rule, 'updated', {
  description: 'Změněn threshold ze 100 na 150',
});

// Dotaz na historii verzí
const result = versionStore.query({
  ruleId: rule.id,
  order: 'desc',
  limit: 5,
});

// Zobrazení změn mezi verzemi
const diff = versionStore.diff(rule.id, 1, 3);
if (diff) {
  for (const change of diff.changes) {
    console.log(`${change.field}: ${JSON.stringify(change.oldValue)} -> ${JSON.stringify(change.newValue)}`);
  }
}

// Možnost 2: Konfigurace verzování v RuleEngine
const engine = await RuleEngine.start({
  versioning: {
    adapter: new SQLiteAdapter({ filename: './data/versions.db' }),
    maxVersionsPerRule: 100,
  },
});

// Engine automaticky zaznamenává verze při změnách pravidel
// Přístup k version store přes engine
const store = engine.getVersionStore();
const history = store?.getVersions('my-rule');
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Používá verzování pro automatické sledování verzí
- [Persistence](./18-persistence.md) — Persistence pravidel a časovačů
- [Audit](./20-audit.md) — Audit logging pro všechny operace engine
- [Configuration](./30-configuration.md) — Kompletní reference konfigurace
