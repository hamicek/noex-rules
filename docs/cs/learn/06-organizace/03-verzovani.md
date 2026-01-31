# Verzování pravidel

Pravidla se mění. Práh se upraví, podmínka se přidá, rozbité pravidlo je potřeba vrátit na včerejší verzi. Bez historie verzí jsou tyto změny neviditelné — nemůžete odpovědět na "co se změnilo?", "kdo to změnil?" nebo "můžeme to vrátit?". Verzovací systém v noex-rules automaticky zaznamenává snapshot každé změny pravidla, umožňuje diffovat libovolné dvě verze a podporuje rollback jedním příkazem.

## Co se naučíte

- Jak povolit a nakonfigurovat verzovací systém
- Jaké změny se sledují a kdy se vytvářejí verze
- Jak dotazovat historii verzí s filtrováním a stránkováním
- Jak diffovat dvě verze pravidla na úrovni polí
- Jak vrátit pravidlo na předchozí verzi

## Povolení verzování

Verzování vyžaduje `StorageAdapter` (z `@hamicek/noex`) pro persistenci historie verzí. Povolte ho přes konfiguraci `versioning`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { MemoryAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new MemoryAdapter(),
    maxVersionsPerRule: 100,  // Uchovávat posledních 100 verzí na pravidlo (výchozí)
    maxAgeMs: 90 * 24 * 60 * 60 * 1000,  // Uchovávat 90 dní (výchozí)
  },
});
```

### VersioningConfig

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;        // Povinné: kam ukládat historii verzí
  maxVersionsPerRule?: number;    // Max verzí na pravidlo (výchozí: 100)
  maxAgeMs?: number;              // Max stáří v ms (výchozí: 90 dní)
}
```

| Parametr | Výchozí | Popis |
|----------|---------|-------|
| `adapter` | — | Storage backend (`MemoryAdapter`, `FileAdapter` atd.) |
| `maxVersionsPerRule` | `100` | Nejstarší verze se odstraní při překročení limitu |
| `maxAgeMs` | 90 dní | Verze starší než tato hodnota se odstraní |

## Co se sleduje

Jakmile je verzování povoleno, engine automaticky zaznamenává verzní položku při každé změně pravidla. Žádná explicitní volání nejsou potřeba — každá mutace pravidla je zachycena:

| Operace | Typ změny | Kdy |
|---------|-----------|-----|
| `registerRule()` | `'registered'` | Nové pravidlo vytvořeno |
| `updateRule()` | `'updated'` | Vlastnosti pravidla změněny |
| `enableRule()` | `'enabled'` | Pravidlo aktivováno |
| `disableRule()` | `'disabled'` | Pravidlo deaktivováno |
| `unregisterRule()` | `'unregistered'` | Pravidlo smazáno |
| `rollbackRule()` | `'rolled_back'` | Pravidlo obnoveno z historie |

### Verzní položka

Každá verzní položka obsahuje úplný snapshot pravidla v daném okamžiku:

```typescript
interface RuleVersionEntry {
  version: number;            // Sekvenční v rámci pravidla (od 1)
  ruleSnapshot: Rule;         // Kompletní stav pravidla v této verzi
  timestamp: number;          // Kdy byla tato verze vytvořena
  changeType: RuleChangeType; // Co spustilo vytvoření verze
  rolledBackFrom?: number;    // Předchozí globální verze (při rollbacku)
  description?: string;       // Volitelná lidsky čitelná poznámka
}
```

```text
  registerRule()     updateRule()      disableRule()     rollbackRule(v1)
       │                 │                 │                  │
       ▼                 ▼                 ▼                  ▼
  ┌──────────┐     ┌──────────┐     ┌──────────┐      ┌──────────┐
  │ verze 1  │     │ verze 2  │     │ verze 3  │      │ verze 4  │
  │ registered│    │ updated  │     │ disabled │      │ rolled_back│
  │ snapshot │     │ snapshot │     │ snapshot │      │ snapshot  │
  └──────────┘     └──────────┘     └──────────┘      └──────────┘
```

## Dotazování na historii verzí

Použijte `getRuleVersions()` pro dotazování na historii pravidla s filtrováním a stránkováním:

```typescript
// Získat nedávnou historii (výchozí: posledních 50 verzí, nejnovější první)
const history = engine.getRuleVersions('fraud-velocity-check');

console.log(history.totalVersions);  // Celkový počet verzí pro toto pravidlo
console.log(history.hasMore);        // Zda existují další stránky
console.log(history.entries.length); // Položky na této stránce

for (const entry of history.entries) {
  console.log(
    `v${entry.version} [${entry.changeType}] v ${new Date(entry.timestamp).toISOString()}`
  );
}
```

### Parametry dotazu

```typescript
interface RuleVersionQuery {
  ruleId: string;                   // Povinné
  limit?: number;                   // Max položek (výchozí: 50)
  offset?: number;                  // Přeskočit pro stránkování
  order?: 'asc' | 'desc';          // Podle čísla verze (výchozí: 'desc')
  fromVersion?: number;             // Min verze (včetně)
  toVersion?: number;               // Max verze (včetně)
  changeTypes?: RuleChangeType[];   // Filtr podle typu změny
  from?: number;                    // Po časovém razítku (včetně)
  to?: number;                      // Před časovým razítkem (včetně)
}
```

### Příklady filtrování

```typescript
// Pouze aktualizace — přeskočit registraci a povolení/zakázání
const updates = engine.getRuleVersions('fraud-velocity-check', {
  changeTypes: ['updated'],
});

// Posledních 24 hodin
const recent = engine.getRuleVersions('fraud-velocity-check', {
  from: Date.now() - 24 * 60 * 60 * 1000,
});

// Stránkování celou historií (nejstarší první)
const page1 = engine.getRuleVersions('fraud-velocity-check', {
  order: 'asc',
  limit: 10,
  offset: 0,
});
const page2 = engine.getRuleVersions('fraud-velocity-check', {
  order: 'asc',
  limit: 10,
  offset: 10,
});
```

## Získání konkrétní verze

```typescript
const entry = engine.getRuleVersion('fraud-velocity-check', 3);
if (entry) {
  console.log(entry.changeType);              // 'updated'
  console.log(entry.ruleSnapshot.priority);   // 100
  console.log(entry.ruleSnapshot.conditions); // [...podmínky ve v3...]
}
```

## Porovnávání verzí (Diff)

`diffRuleVersions()` vytvoří diff na úrovni polí mezi libovolnými dvěma verzemi pravidla:

```typescript
const diff = engine.diffRuleVersions('fraud-velocity-check', 1, 3);
if (diff) {
  console.log(`Porovnání v${diff.fromVersion} → v${diff.toVersion}`);
  for (const change of diff.changes) {
    console.log(`  ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
  }
}
```

### Výsledek diffu

```typescript
interface RuleVersionDiff {
  ruleId: string;
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}

interface RuleFieldChange {
  field: string;       // např. 'name', 'priority', 'trigger.type'
  oldValue: unknown;   // Hodnota ve starší verzi
  newValue: unknown;   // Hodnota v novější verzi
}
```

### Příklad výstupu diffu

```typescript
// Po změně priority z 50 na 100 a přidání tagu:
const diff = engine.diffRuleVersions('my-rule', 1, 2);
// diff.changes:
// [
//   { field: 'priority', oldValue: 50, newValue: 100 },
//   { field: 'tags', oldValue: ['fraud'], newValue: ['fraud', 'critical'] },
// ]
```

## Rollback

`rollbackRule()` obnoví pravidlo na stav předchozí verze. Obnovené pravidlo dostane **nové globální číslo verze** — nepíše historii:

```typescript
// Aktuální stav: verze 5 s rozbitou podmínkou
// Vrátit na verzi 3 (poslední známá dobrá verze)
const restored = engine.rollbackRule('fraud-velocity-check', 3);

console.log(restored.version);  // Nové globální číslo verze (např. 42)
// Stav pravidla (podmínky, akce, priorita atd.) odpovídá verzi 3
```

### Sémantika rollbacku

```text
  Historie verzí:
  v1: registered  (originál)
  v2: updated     (přidána podmínka)
  v3: updated     (změněna priorita)
  v4: updated     (rozbitá podmínka)      ← aktuální
  v5: rolled_back (obnoveno z v2)         ← po rollbackRule('rule', 2)
```

- Rollback vytvoří **novou verzní položku** s `changeType: 'rolled_back'`
- Pole `rolledBackFrom` zaznamenává číslo verze před rollbackem
- Snapshot pravidla ve v5 odpovídá snapshotu v2
- Pravidlo dostane nové globální číslo verze (odlišné od v2)
- Můžete rollbackovat rollback — historie je vždy append-only

### Bezpečnost

```typescript
// Rollback vyžaduje nakonfigurované verzování
// Vyhodí: 'Rule versioning is not configured'
engine.rollbackRule('rule', 1);

// Vyhodí, pokud verze neexistuje
// Vyhodí: 'Version 99 not found for rule "fraud-velocity-check"'
engine.rollbackRule('fraud-velocity-check', 99);
```

## Kompletní příklad: Životní cyklus pravidla s verzováním

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { onEvent, emit, ref, event } from '@hamicek/noex-rules/dsl';
import { MemoryAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new MemoryAdapter(),
    maxVersionsPerRule: 50,
  },
});

// v1: Registrace počátečního pravidla
engine.registerRule(
  Rule.create('high-value-alert')
    .name('Alert na vysokou hodnotu transakce')
    .priority(50)
    .tags('fraud', 'alerts')
    .when(onEvent('transaction.created'))
    .if(event('amount').gte(10000))
    .then(emit('alert.high_value', {
      transactionId: ref('event.transactionId'),
      amount: ref('event.amount'),
    }))
    .build()
);

// v2: Snížení prahu na základě nových dat o podvodech
engine.updateRule('high-value-alert', {
  conditions: [{
    source: 'event',
    field: 'amount',
    operator: 'gte',
    value: 5000,  // Sníženo z 10000
  }],
});

// v3: Přidání tagu critical
engine.updateRule('high-value-alert', {
  tags: ['fraud', 'alerts', 'critical'],
});

// v4: Náhodné rozbití pravidla (špatný operátor)
engine.updateRule('high-value-alert', {
  conditions: [{
    source: 'event',
    field: 'amount',
    operator: 'lte',  // Chyba: mělo být 'gte'
    value: 5000,
  }],
});

// --- Vyšetřování problému ---

// Co se změnilo?
const history = engine.getRuleVersions('high-value-alert');
for (const entry of history.entries) {
  console.log(`v${entry.version} [${entry.changeType}] v ${new Date(entry.timestamp).toISOString()}`);
}
// v4 [updated] v 2025-...
// v3 [updated] v 2025-...
// v2 [updated] v 2025-...
// v1 [registered] v 2025-...

// Co se změnilo mezi v3 (dobrá) a v4 (rozbitá)?
const diff = engine.diffRuleVersions('high-value-alert', 3, 4);
for (const change of diff!.changes) {
  console.log(`${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
}
// conditions: [...gte 5000...] → [...lte 5000...]

// --- Oprava ---

// Rollback na v3 (poslední známá dobrá verze)
const restored = engine.rollbackRule('high-value-alert', 3);
console.log(restored.version);  // Nové globální číslo verze

// Ověření opravy
const current = engine.getRule('high-value-alert')!;
console.log(current.conditions[0].operator);  // 'gte' — opraveno!

// Historie verzí nyní ukazuje rollback
const afterRollback = engine.getRuleVersions('high-value-alert');
for (const entry of afterRollback.entries) {
  console.log(`v${entry.version} [${entry.changeType}]`);
}
// v5 [rolled_back]
// v4 [updated]
// v3 [updated]
// v2 [updated]
// v1 [registered]
```

## Úložiště a retence

Verzní položky se ukládají pomocí nakonfigurovaného `StorageAdapter`. Store udržuje in-memory cache pro rychlé čtení a periodicky zapisuje do adaptéru.

### Politika retence

Dva limity řídí, kolik historie se uchovává:

- **`maxVersionsPerRule`** (výchozí: 100) — Když pravidlo překročí tento počet verzí, nejstarší položky se odstraní.
- **`maxAgeMs`** (výchozí: 90 dní) — Položky starší než tato hodnota se odstraní bez ohledu na počet.

Oba limity se vynucují při zápisech, což udržuje store omezený.

### Statistiky verzování

```typescript
const store = engine.getVersionStore();
if (store) {
  const stats = store.getStats();
  console.log(stats.trackedRules);   // Počet pravidel s historií
  console.log(stats.totalVersions);  // Celkový počet položek přes všechna pravidla
  console.log(stats.dirtyRules);     // Pravidla s neuloženými změnami
  console.log(stats.oldestEntry);    // Časové razítko nejstarší položky
  console.log(stats.newestEntry);    // Časové razítko nejnovější položky
}
```

## Cvičení

Máte pravidlo `rate-limiter`, které bylo několikrát aktualizováno. Napište kód, který:

1. Dotáže pouze verze typu `'updated'`, seřazené od nejstarší
2. Najde diff mezi první a poslední verzí `'updated'`
3. Pokud diff ukazuje, že se změnilo pole `priority`, provede rollback na první verzi `'updated'`

<details>
<summary>Řešení</summary>

```typescript
// 1. Dotaz pouze na 'updated' verze, nejstarší první
const updates = engine.getRuleVersions('rate-limiter', {
  changeTypes: ['updated'],
  order: 'asc',
});

if (updates.entries.length >= 2) {
  const firstUpdate = updates.entries[0];
  const lastUpdate = updates.entries[updates.entries.length - 1];

  // 2. Diff první a poslední aktualizované verze
  const diff = engine.diffRuleVersions(
    'rate-limiter',
    firstUpdate.version,
    lastUpdate.version,
  );

  if (diff) {
    // 3. Zkontrolovat, zda se změnila priorita, a případně rollbackovat
    const priorityChanged = diff.changes.some(c => c.field === 'priority');

    if (priorityChanged) {
      const restored = engine.rollbackRule('rate-limiter', firstUpdate.version);
      console.log(
        `Rollback na v${firstUpdate.version}, nová verze: ${restored.version}`
      );
    }
  }
}
```

Klíčové body:
- `changeTypes: ['updated']` odfiltruje registraci, povolení/zakázání a rollback položky
- `order: 'asc'` dává nejstarší první, takže `entries[0]` je první aktualizace
- Pole `changes` diffu obsahuje pouze pole, která se liší mezi dvěma verzemi
- `rollbackRule()` vytvoří novou verzní položku — nikdy nepíše historii

</details>

## Shrnutí

- Povolte verzování předáním `VersioningConfig` se `StorageAdapter` do `RuleEngine.start()`
- Každá mutace pravidla (`registerRule`, `updateRule`, `enableRule`, `disableRule`, `unregisterRule`, `rollbackRule`) automaticky vytvoří verzní položku
- Každá verzní položka obsahuje úplný snapshot pravidla, časové razítko a typ změny
- Dotazujte historii s `getRuleVersions()` — podporuje filtrování podle typu změny, rozsahu verzí, časového rozsahu a stránkování
- Použijte `diffRuleVersions()` pro porovnání na úrovni polí mezi libovolnými dvěma verzemi
- `rollbackRule()` obnoví pravidlo z historického snapshotu a vytvoří novou verzní položku — historie je append-only
- Retence je řízena pomocí `maxVersionsPerRule` (výchozí: 100) a `maxAgeMs` (výchozí: 90 dní)

---

Další: [Persistence pravidel a faktů](../07-persistence/01-persistence-stavu.md)
