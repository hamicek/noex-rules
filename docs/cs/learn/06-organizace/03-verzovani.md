# Verzovani pravidel

Pravidla se meni. Prah se upravi, podminka se prida, rozbite pravidlo je potreba vratit na vceresjsi verzi. Bez historie verzi jsou tyto zmeny neviditelne — nemuzete odpovedet na "co se zmenilo?", "kdo to zmenil?" nebo "muzeme to vratit?". Verzovaci system v noex-rules automaticky zaznamenava snapshot kazde zmeny pravidla, umoznuje diffovat libovolne dve verze a podporuje rollback jednim prikazem.

## Co se naucite

- Jak povolit a nakonfigurovat verzovaci system
- Jake zmeny se sleduji a kdy se vytvareji verze
- Jak dotazovat historii verzi s filtrovanim a stankovanim
- Jak diffovat dve verze pravidla na urovni poli
- Jak vratit pravidlo na predchozi verzi

## Povoleni verzovani

Verzovani vyzaduje `StorageAdapter` (z `@hamicek/noex`) pro persistenci historie verzi. Povolte ho pres konfiguraci `versioning`:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { MemoryAdapter } from '@hamicek/noex';

const engine = await RuleEngine.start({
  versioning: {
    adapter: new MemoryAdapter(),
    maxVersionsPerRule: 100,  // Uchovavat poslednich 100 verzi na pravidlo (vychozi)
    maxAgeMs: 90 * 24 * 60 * 60 * 1000,  // Uchovavat 90 dni (vychozi)
  },
});
```

### VersioningConfig

```typescript
interface VersioningConfig {
  adapter: StorageAdapter;        // Povinne: kam ukladat historii verzi
  maxVersionsPerRule?: number;    // Max verzi na pravidlo (vychozi: 100)
  maxAgeMs?: number;              // Max stari v ms (vychozi: 90 dni)
}
```

| Parametr | Vychozi | Popis |
|----------|---------|-------|
| `adapter` | — | Storage backend (`MemoryAdapter`, `FileAdapter` atd.) |
| `maxVersionsPerRule` | `100` | Nejstarsi verze se odstrani pri prekroceni limitu |
| `maxAgeMs` | 90 dni | Verze starsi nez tato hodnota se odstrani |

## Co se sleduje

Jakmile je verzovani povoleno, engine automaticky zaznamenava verzni polozku pri kazde zmene pravidla. Zadna explicitni volani nejsou potreba — kazda mutace pravidla je zachycena:

| Operace | Typ zmeny | Kdy |
|---------|-----------|-----|
| `registerRule()` | `'registered'` | Nove pravidlo vytvoreno |
| `updateRule()` | `'updated'` | Vlastnosti pravidla zmeneny |
| `enableRule()` | `'enabled'` | Pravidlo aktivovano |
| `disableRule()` | `'disabled'` | Pravidlo deaktivovano |
| `unregisterRule()` | `'unregistered'` | Pravidlo smazano |
| `rollbackRule()` | `'rolled_back'` | Pravidlo obnoveno z historie |

### Verzni polozka

Kazda verzni polozka obsahuje uplny snapshot pravidla v danem okamziku:

```typescript
interface RuleVersionEntry {
  version: number;            // Sekvencni v ramci pravidla (od 1)
  ruleSnapshot: Rule;         // Kompletni stav pravidla v teto verzi
  timestamp: number;          // Kdy byla tato verze vytvorena
  changeType: RuleChangeType; // Co spustilo vytvoreni verze
  rolledBackFrom?: number;    // Predchozi globalni verze (pri rollbacku)
  description?: string;       // Volitelna lidsky citelna poznamka
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

## Dotazovani na historii verzi

Pouzijte `getRuleVersions()` pro dotazovani na historii pravidla s filtrovanim a strankovani:

```typescript
// Ziskat nedavnou historii (vychozi: poslednich 50 verzi, nejnovejsi prvni)
const history = engine.getRuleVersions('fraud-velocity-check');

console.log(history.totalVersions);  // Celkovy pocet verzi pro toto pravidlo
console.log(history.hasMore);        // Zda existuji dalsi stranky
console.log(history.entries.length); // Polozky na teto strance

for (const entry of history.entries) {
  console.log(
    `v${entry.version} [${entry.changeType}] v ${new Date(entry.timestamp).toISOString()}`
  );
}
```

### Parametry dotazu

```typescript
interface RuleVersionQuery {
  ruleId: string;                   // Povinne
  limit?: number;                   // Max polozek (vychozi: 50)
  offset?: number;                  // Preskocit pro strankovani
  order?: 'asc' | 'desc';          // Podle cisla verze (vychozi: 'desc')
  fromVersion?: number;             // Min verze (vcetne)
  toVersion?: number;               // Max verze (vcetne)
  changeTypes?: RuleChangeType[];   // Filtr podle typu zmeny
  from?: number;                    // Po casovem razitku (vcetne)
  to?: number;                      // Pred casovym razitkem (vcetne)
}
```

### Priklady filtrovani

```typescript
// Pouze aktualizace — preskocit registraci a povoleni/zakazani
const updates = engine.getRuleVersions('fraud-velocity-check', {
  changeTypes: ['updated'],
});

// Poslednich 24 hodin
const recent = engine.getRuleVersions('fraud-velocity-check', {
  from: Date.now() - 24 * 60 * 60 * 1000,
});

// Strankovani celou historii (nejstarsi prvni)
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

## Ziskani konkretni verze

```typescript
const entry = engine.getRuleVersion('fraud-velocity-check', 3);
if (entry) {
  console.log(entry.changeType);              // 'updated'
  console.log(entry.ruleSnapshot.priority);   // 100
  console.log(entry.ruleSnapshot.conditions); // [...podminky ve v3...]
}
```

## Porovnavani verzi (Diff)

`diffRuleVersions()` vytvori diff na urovni poli mezi libovolnymi dvema verzemi pravidla:

```typescript
const diff = engine.diffRuleVersions('fraud-velocity-check', 1, 3);
if (diff) {
  console.log(`Porovnani v${diff.fromVersion} → v${diff.toVersion}`);
  for (const change of diff.changes) {
    console.log(`  ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
  }
}
```

### Vysledek diffu

```typescript
interface RuleVersionDiff {
  ruleId: string;
  fromVersion: number;
  toVersion: number;
  changes: RuleFieldChange[];
}

interface RuleFieldChange {
  field: string;       // napr. 'name', 'priority', 'trigger.type'
  oldValue: unknown;   // Hodnota ve starsi verzi
  newValue: unknown;   // Hodnota v novejsi verzi
}
```

### Priklad vystupu diffu

```typescript
// Po zmene priority z 50 na 100 a pridani tagu:
const diff = engine.diffRuleVersions('my-rule', 1, 2);
// diff.changes:
// [
//   { field: 'priority', oldValue: 50, newValue: 100 },
//   { field: 'tags', oldValue: ['fraud'], newValue: ['fraud', 'critical'] },
// ]
```

## Rollback

`rollbackRule()` obnovi pravidlo na stav predchozi verze. Obnovene pravidlo dostane **nove globalni cislo verze** — nepise historii:

```typescript
// Aktualni stav: verze 5 s rozbitou podminkou
// Vratit na verzi 3 (posledni znama dobra verze)
const restored = engine.rollbackRule('fraud-velocity-check', 3);

console.log(restored.version);  // Nove globalni cislo verze (napr. 42)
// Stav pravidla (podminky, akce, priorita atd.) odpovida verzi 3
```

### Semantika rollbacku

```text
  Historie verzi:
  v1: registered  (original)
  v2: updated     (pridana podminka)
  v3: updated     (zmenena priorita)
  v4: updated     (rozbita podminka)      ← aktualni
  v5: rolled_back (obnoveno z v2)         ← po rollbackRule('rule', 2)
```

- Rollback vytvori **novou verzni polozku** s `changeType: 'rolled_back'`
- Pole `rolledBackFrom` zaznamenava cislo verze pred rollbackem
- Snapshot pravidla ve v5 odpovida snapshotu v2
- Pravidlo dostane nove globalni cislo verze (odlisne od v2)
- Muzete rollbackovat rollback — historie je vzdy append-only

### Bezpecnost

```typescript
// Rollback vyzaduje nakonfigurovane verzovani
// Vyhodi: 'Rule versioning is not configured'
engine.rollbackRule('rule', 1);

// Vyhodi, pokud verze neexistuje
// Vyhodi: 'Version 99 not found for rule "fraud-velocity-check"'
engine.rollbackRule('fraud-velocity-check', 99);
```

## Kompletni priklad: Zivotni cyklus pravidla s verzovanim

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

// v1: Registrace pocatecniho pravidla
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

// v2: Snizeni prahu na zaklade novych dat o podvodech
engine.updateRule('high-value-alert', {
  conditions: [{
    source: 'event',
    field: 'amount',
    operator: 'gte',
    value: 5000,  // Snizeno z 10000
  }],
});

// v3: Pridani tagu critical
engine.updateRule('high-value-alert', {
  tags: ['fraud', 'alerts', 'critical'],
});

// v4: Nahodne rozbiti pravidla (spatny operator)
engine.updateRule('high-value-alert', {
  conditions: [{
    source: 'event',
    field: 'amount',
    operator: 'lte',  // Chyba: melo byt 'gte'
    value: 5000,
  }],
});

// --- Vysetrovani problemu ---

// Co se zmenilo?
const history = engine.getRuleVersions('high-value-alert');
for (const entry of history.entries) {
  console.log(`v${entry.version} [${entry.changeType}] v ${new Date(entry.timestamp).toISOString()}`);
}
// v4 [updated] v 2025-...
// v3 [updated] v 2025-...
// v2 [updated] v 2025-...
// v1 [registered] v 2025-...

// Co se zmenilo mezi v3 (dobra) a v4 (rozbita)?
const diff = engine.diffRuleVersions('high-value-alert', 3, 4);
for (const change of diff!.changes) {
  console.log(`${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
}
// conditions: [...gte 5000...] → [...lte 5000...]

// --- Oprava ---

// Rollback na v3 (posledni znama dobra verze)
const restored = engine.rollbackRule('high-value-alert', 3);
console.log(restored.version);  // Nove globalni cislo verze

// Overeni opravy
const current = engine.getRule('high-value-alert')!;
console.log(current.conditions[0].operator);  // 'gte' — opraveno!

// Historie verzi nyni ukazuje rollback
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

## Ulozeni a retence

Verzni polozky se ukladaji pomoci nakonfigurovaneho `StorageAdapter`. Store udrzuje in-memory cache pro rychle cteni a periodicky zapisuje do adapteru.

### Politika retence

Dva limity ridia, kolik historie se uchovava:

- **`maxVersionsPerRule`** (vychozi: 100) — Kdyz pravidlo prekroci tento pocet verzi, nejstarsi polozky se odstrani.
- **`maxAgeMs`** (vychozi: 90 dni) — Polozky starsi nez tato hodnota se odstrani bez ohledu na pocet.

Oba limity se vynucuji pri zapisech, coz udrzuje store omezeny.

### Statistiky verzovani

```typescript
const store = engine.getVersionStore();
if (store) {
  const stats = store.getStats();
  console.log(stats.trackedRules);   // Pocet pravidel s historii
  console.log(stats.totalVersions);  // Celkovy pocet polozek pres vsechna pravidla
  console.log(stats.dirtyRules);     // Pravidla s neulozenymi zmenami
  console.log(stats.oldestEntry);    // Casove razitko nejstarsi polozky
  console.log(stats.newestEntry);    // Casove razitko nejnovejsi polozky
}
```

## Cviceni

Mate pravidlo `rate-limiter`, ktere bylo nekolikrat aktualizovano. Napiste kod, ktery:

1. Dotaze pouze verze typu `'updated'`, serazene od nejstarsi
2. Najde diff mezi prvni a posledni verzi `'updated'`
3. Pokud diff ukazuje, ze se zmenilo pole `priority`, provede rollback na prvni verzi `'updated'`

<details>
<summary>Reseni</summary>

```typescript
// 1. Dotaz pouze na 'updated' verze, nejstarsi prvni
const updates = engine.getRuleVersions('rate-limiter', {
  changeTypes: ['updated'],
  order: 'asc',
});

if (updates.entries.length >= 2) {
  const firstUpdate = updates.entries[0];
  const lastUpdate = updates.entries[updates.entries.length - 1];

  // 2. Diff prvni a posledni aktualizovane verze
  const diff = engine.diffRuleVersions(
    'rate-limiter',
    firstUpdate.version,
    lastUpdate.version,
  );

  if (diff) {
    // 3. Zkontrolovat, zda se zmenila priorita, a pripadne rollbackovat
    const priorityChanged = diff.changes.some(c => c.field === 'priority');

    if (priorityChanged) {
      const restored = engine.rollbackRule('rate-limiter', firstUpdate.version);
      console.log(
        `Rollback na v${firstUpdate.version}, nova verze: ${restored.version}`
      );
    }
  }
}
```

Klicove body:
- `changeTypes: ['updated']` odfiltruje registraci, povoleni/zakazani a rollback polozky
- `order: 'asc'` dava nejstarsi prvni, takze `entries[0]` je prvni aktualizace
- Pole `changes` diffu obsahuje pouze pole, ktera se lisi mezi dvema verzemi
- `rollbackRule()` vytvori novou verzni polozku — nikdy nepise historii

</details>

## Shrnuti

- Povolte verzovani predanim `VersioningConfig` se `StorageAdapter` do `RuleEngine.start()`
- Kazda mutace pravidla (`registerRule`, `updateRule`, `enableRule`, `disableRule`, `unregisterRule`, `rollbackRule`) automaticky vytvori verzni polozku
- Kazda verzni polozka obsahuje uplny snapshot pravidla, casove razitko a typ zmeny
- Dotazujte historii s `getRuleVersions()` — podporuje filtrovani podle typu zmeny, rozsahu verzi, casoveho rozsahu a strankovani
- Pouzijte `diffRuleVersions()` pro porovnani na urovni poli mezi libovolnymi dvema verzemi
- `rollbackRule()` obnovi pravidlo z historickeho snapshotu a vytvori novou verzni polozku — historie je append-only
- Retence je rizena pomoci `maxVersionsPerRule` (vychozi: 100) a `maxAgeMs` (vychozi: 90 dni)

---

Dalsi: [Persistence pravidel a faktu](../07-persistence/01-persistence-stavu.md)
