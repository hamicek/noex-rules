# FactStore

Rychlé in-memory úložiště faktů s pattern matchingem a notifikacemi o změnách. Používá se interně v RuleEngine; přístup přes `engine.getFactStore()` pro debugging nebo snapshoty.

## Import

```typescript
import { FactStore } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(config?: FactStoreConfig): Promise<FactStore>
```

Vytvoří novou instanci FactStore.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| config | `FactStoreConfig` | ne | Konfigurace úložiště |

**Návratová hodnota:** `Promise<FactStore>` — instance úložiště

**Příklad:**

```typescript
const store = await FactStore.start({
  name: 'my-facts',
  onFactChange: (event) => {
    console.log(`Fakt ${event.type}: ${event.fact.key}`);
  },
});
```

---

## Metody

### set()

```typescript
set(key: string, value: unknown, source?: string): Fact
```

Nastaví hodnotu faktu. Vytvoří nebo aktualizuje fakt a spustí notifikaci o změně.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu (podporuje hierarchické klíče jako `customer:123:age`) |
| value | `unknown` | ano | Hodnota faktu |
| source | `string` | ne | Identifikátor zdroje (výchozí: `'system'`) |

**Návratová hodnota:** `Fact` — uložený fakt s metadaty

**Příklad:**

```typescript
const fact = store.set('customer:123:premium', true, 'billing-service');
console.log(fact.version); // 1 (inkrementuje se při aktualizaci)
```

### get()

```typescript
get(key: string): Fact | undefined
```

Vrátí kompletní fakt s metadaty podle klíče.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu |

**Návratová hodnota:** `Fact | undefined` — fakt s metadaty nebo undefined pokud nenalezen

**Příklad:**

```typescript
const fact = store.get('customer:123:premium');
if (fact) {
  console.log(`Hodnota: ${fact.value}, Verze: ${fact.version}`);
}
```

### delete()

```typescript
delete(key: string): boolean
```

Smaže fakt a spustí notifikaci o změně.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu |

**Návratová hodnota:** `boolean` — true pokud byl fakt nalezen a smazán

### query()

```typescript
query(pattern: string): Fact[]
```

Najde fakta odpovídající patternu. Podporuje wildcardy pro flexibilní dotazy.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| pattern | `string` | ano | Pattern s volitelnými wildcardy (`*`) |

**Návratová hodnota:** `Fact[]` — odpovídající fakta

**Syntaxe patternů:**

| Pattern | Odpovídá |
|---------|----------|
| `customer:123:*` | Všechna fakta pro zákazníka 123 |
| `customer:*:age` | Věk všech zákazníků |
| `*` | Všechna fakta |
| `order:*:status` | Status všech objednávek |

**Příklad:**

```typescript
// Získání všech faktů pro konkrétního zákazníka
const customerFacts = store.query('customer:123:*');

// Získání všech premium statusů
const premiumFacts = store.query('customer:*:premium');
```

### filter()

```typescript
filter(predicate: (fact: Fact) => boolean): Fact[]
```

Vrátí fakta odpovídající predikátové funkci.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| predicate | `(fact: Fact) => boolean` | ano | Filtrovací funkce |

**Návratová hodnota:** `Fact[]` — odpovídající fakta

**Příklad:**

```typescript
// Najdi všechna fakta s numerickou hodnotou větší než 100
const highValues = store.filter((fact) =>
  typeof fact.value === 'number' && fact.value > 100
);
```

### getAll()

```typescript
getAll(): Fact[]
```

Vrátí všechna uložená fakta.

**Návratová hodnota:** `Fact[]` — všechna fakta

### clear()

```typescript
clear(): void
```

Odstraní všechna fakta z úložiště.

---

## Vlastnosti

### size

```typescript
get size(): number
```

Vrátí počet uložených faktů.

**Příklad:**

```typescript
console.log(`Počet faktů: ${store.size}`);
```

---

## Typy

### Fact

```typescript
interface Fact {
  key: string;
  value: unknown;
  timestamp: number;
  source: string;
  version: number;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| key | `string` | Hierarchický klíč (např. `customer:123:age`) |
| value | `unknown` | Hodnota faktu |
| timestamp | `number` | Unix timestamp nastavení |
| source | `string` | Identifikátor toho, kdo fakt nastavil |
| version | `number` | Číslo verze (inkrementuje se při aktualizaci) |

### FactStoreConfig

```typescript
interface FactStoreConfig {
  name?: string;
  onFactChange?: FactChangeListener;
}
```

| Pole | Typ | Výchozí | Popis |
|------|-----|---------|-------|
| name | `string` | `'facts'` | Název úložiště pro logování |
| onFactChange | `FactChangeListener` | — | Callback pro notifikace o změnách |

### FactChangeEvent

```typescript
interface FactChangeEvent {
  type: FactChangeType;
  fact: Fact;
  previousValue?: unknown;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| type | `FactChangeType` | Typ změny |
| fact | `Fact` | Dotčený fakt |
| previousValue | `unknown` | Předchozí hodnota (pro aktualizace) |

### FactChangeType

```typescript
type FactChangeType = 'created' | 'updated' | 'deleted';
```

### FactChangeListener

```typescript
type FactChangeListener = (event: FactChangeEvent) => void;
```

---

## Pattern Matching

FactStore používá prefixové indexování pro efektivní pattern matching. Očekává se, že klíče používají `:` jako oddělovač.

**Výkonnostní charakteristiky:**

| Pattern | Výkon |
|---------|-------|
| Přesný klíč (`customer:123:age`) | O(1) |
| Prefixový pattern (`customer:123:*`) | O(k) kde k = klíče s prefixem |
| Wildcard prefix (`*:age`) | O(n) plný průchod |

**Příklady klíčů:**

```typescript
store.set('customer:123:name', 'Jan');
store.set('customer:123:age', 30);
store.set('customer:123:premium', true);
store.set('customer:456:name', 'Jana');
store.set('order:ORD-001:status', 'pending');
```

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [EventStore](./03-event-store.md) — Ukládání událostí
- [Utilities](./31-utilities.md) — Funkce pro pattern matching
- [Fakta a stav](../learn/02-core-concepts/03-facts-and-state.md) — Tutoriál
