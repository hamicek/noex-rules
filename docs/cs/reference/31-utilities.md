# Utility funkce

Utility funkce pro generování ID, parsování duration, pattern matching, interpolaci a vyhodnocení podmínek.

## Import

```typescript
import {
  generateId,
  parseDuration,
  formatDuration,
  matchesTopic,
  matchesFactPattern,
  matchesTimerPattern,
  matchesFilter,
  getNestedValue,
  interpolate,
  resolve,
  resolveRef,
  resolveObject,
  evaluateCondition,
  clearPatternCache,
  clearMatchesCache,
} from '@hamicek/noex-rules';

import type { InterpolationContext } from '@hamicek/noex-rules';
```

---

## Generování ID

### generateId()

Generuje unikátní identifikátor.

```typescript
function generateId(): string
```

**Vrací:** `string` — Unikátní ID ve formátu `{timestamp36}-{random9}`

**Příklad:**

```typescript
import { generateId } from '@hamicek/noex-rules';

const id = generateId();
// "lxk5m8p2-abc123def"
```

---

## Parsování duration

### parseDuration()

Parsuje duration string na milisekundy.

```typescript
function parseDuration(duration: string | number): number
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| duration | `string \| number` | ano | Duration string nebo číslo v ms |

**Vrací:** `number` — Doba trvání v milisekundách

**Vyhazuje:** `Error` pokud je formát duration neplatný

**Podporované jednotky:**

| Jednotka | Význam | Příklad |
|----------|--------|---------|
| `ms` | milisekundy | `500ms` → 500 |
| `s` | sekundy | `30s` → 30 000 |
| `m` | minuty | `5m` → 300 000 |
| `h` | hodiny | `2h` → 7 200 000 |
| `d` | dny | `7d` → 604 800 000 |
| `w` | týdny | `1w` → 604 800 000 |
| `y` | roky | `1y` → 31 536 000 000 |

**Příklad:**

```typescript
import { parseDuration } from '@hamicek/noex-rules';

parseDuration('5m');     // 300000
parseDuration('1h');     // 3600000
parseDuration('30s');    // 30000
parseDuration(5000);     // 5000 (passthrough)
parseDuration('invalid'); // vyhazuje Error
```

---

### formatDuration()

Formátuje milisekundy na čitelný duration string.

```typescript
function formatDuration(ms: number): string
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ms | `number` | ano | Doba trvání v milisekundách |

**Vrací:** `string` — Formátovaný duration string

**Příklad:**

```typescript
import { formatDuration } from '@hamicek/noex-rules';

formatDuration(500);      // "500ms"
formatDuration(30000);    // "30s"
formatDuration(300000);   // "5m"
formatDuration(7200000);  // "2h"
formatDuration(86400000); // "1d"
```

---

## Pattern matching

### matchesTopic()

Kontroluje, zda topic matchuje pattern s podporou wildcardů.

```typescript
function matchesTopic(topic: string, pattern: string): boolean
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Název topicu ke kontrole |
| pattern | `string` | ano | Pattern s volitelnými wildcardy |

**Vrací:** `boolean` — `true` pokud topic matchuje pattern

**Syntaxe wildcardů:**
- `*` matchuje jakýkoliv jeden segment (oddělený `.`)
- `order.*` matchuje `order.created`, `order.updated`, atd.
- `*.error` matchuje `payment.error`, `auth.error`, atd.

**Příklad:**

```typescript
import { matchesTopic } from '@hamicek/noex-rules';

matchesTopic('order.created', 'order.created');  // true
matchesTopic('order.created', 'order.*');        // true
matchesTopic('order.created', 'payment.*');      // false
matchesTopic('user.auth.login', 'user.*.login'); // true
```

---

### matchesFactPattern()

Kontroluje, zda klíč faktu matchuje pattern s podporou wildcardů.

```typescript
function matchesFactPattern(key: string, pattern: string): boolean
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu ke kontrole |
| pattern | `string` | ano | Pattern s volitelnými wildcardy |

**Vrací:** `boolean` — `true` pokud klíč matchuje pattern

**Syntaxe wildcardů:**
- `*` matchuje jakýkoliv jeden segment (oddělený `:`)
- `customer:*:status` matchuje `customer:123:status`, `customer:abc:status`

**Příklad:**

```typescript
import { matchesFactPattern } from '@hamicek/noex-rules';

matchesFactPattern('customer:123:age', 'customer:123:age');    // true
matchesFactPattern('customer:123:age', 'customer:*:age');      // true
matchesFactPattern('customer:123:age', 'customer:*');          // true
matchesFactPattern('order:456:status', 'customer:*:status');   // false
```

---

### matchesTimerPattern()

Kontroluje, zda název časovače matchuje pattern s podporou wildcardů.

```typescript
function matchesTimerPattern(name: string, pattern: string): boolean
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Název časovače ke kontrole |
| pattern | `string` | ano | Pattern s volitelnými wildcardy |

**Vrací:** `boolean` — `true` pokud název matchuje pattern

**Příklad:**

```typescript
import { matchesTimerPattern } from '@hamicek/noex-rules';

matchesTimerPattern('payment-timeout:order123', 'payment-timeout:*'); // true
matchesTimerPattern('reminder:user:456', 'reminder:*:456');           // true
```

---

### matchesFilter()

Kontroluje, zda data odpovídají filtru.

```typescript
function matchesFilter(
  data: Record<string, unknown>,
  filter: Record<string, unknown>
): boolean
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| data | `Record<string, unknown>` | ano | Datový objekt ke kontrole |
| filter | `Record<string, unknown>` | ano | Kritéria filtru (všechna musí splňovat) |

**Vrací:** `boolean` — `true` pokud všechny podmínky filtru jsou splněny

**Příklad:**

```typescript
import { matchesFilter } from '@hamicek/noex-rules';

const event = { type: 'order', status: 'paid', amount: 100 };

matchesFilter(event, { type: 'order' });                  // true
matchesFilter(event, { type: 'order', status: 'paid' });  // true
matchesFilter(event, { type: 'payment' });                // false
```

---

### getNestedValue()

Získá vnořenou hodnotu z objektu pomocí tečkové notace.

```typescript
function getNestedValue(obj: unknown, path: string): unknown
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| obj | `unknown` | ano | Zdrojový objekt |
| path | `string` | ano | Cesta k hodnotě oddělená tečkami |

**Vrací:** `unknown` — Hodnota na cestě, nebo `undefined` pokud nenalezena

**Příklad:**

```typescript
import { getNestedValue } from '@hamicek/noex-rules';

const data = {
  user: {
    profile: {
      name: 'Alice',
      age: 30
    }
  }
};

getNestedValue(data, 'user.profile.name'); // "Alice"
getNestedValue(data, 'user.profile.age');  // 30
getNestedValue(data, 'user.address');      // undefined
```

---

### clearPatternCache()

Vymaže interní regex cache používanou funkcemi pro pattern matching. Užitečné pro testy.

```typescript
function clearPatternCache(): void
```

---

## Interpolace

### InterpolationContext

Kontextový objekt pro interpolaci a resolvování referencí.

```typescript
interface InterpolationContext {
  trigger: {
    type: string;
    data: Record<string, unknown>;
  };
  facts: {
    get(key: string): { value: unknown } | undefined;
  };
  matchedEvents?: Array<{ data: Record<string, unknown> }>;
  variables: Map<string, unknown>;
  lookups?: Map<string, unknown>;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| trigger | `{ type: string; data: Record<string, unknown> }` | Data spouštěcí události |
| facts | `{ get(key: string): { value: unknown } \| undefined }` | Accessor k fact store |
| matchedEvents | `Array<{ data: Record<string, unknown> }>` | Matchnuté události pro temporální vzory |
| variables | `Map<string, unknown>` | Kontextové proměnné |
| lookups | `Map<string, unknown>` | Výsledky lookup služeb |

---

### interpolate()

Interpoluje template string s hodnotami z kontextu.

```typescript
function interpolate(template: string, ctx: InterpolationContext): string
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| template | `string` | ano | Template string s výrazy `${...}` |
| ctx | `InterpolationContext` | ano | Interpolační kontext |

**Vrací:** `string` — Interpolovaný string

**Syntaxe template:**
- `${trigger.field}` — Hodnota z dat triggeru
- `${event.field}` — Alias pro trigger
- `${fact.key}` — Hodnota faktu
- `${var.name}` — Hodnota kontextové proměnné
- `${matched.0.field}` — Hodnota z matchnutých událostí
- `${lookup.service.field}` — Hodnota z výsledků lookup

**Příklad:**

```typescript
import { interpolate, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: {
    type: 'event',
    data: { orderId: 'ORD-123', customerId: 'C-456' }
  },
  facts: {
    get: (key) => key === 'customer:C-456:name' ? { value: 'Alice' } : undefined
  },
  variables: new Map(),
};

interpolate('order:${trigger.orderId}:status', ctx);
// "order:ORD-123:status"

interpolate('Processing order for ${trigger.customerId}', ctx);
// "Processing order for C-456"
```

---

### resolve()

Resolvuje referenční objekt `{ ref: "..." }` na jeho skutečnou hodnotu.

```typescript
function resolve(value: unknown, ctx: InterpolationContext): unknown
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| value | `unknown` | ano | Hodnota, která může být referenčním objektem |
| ctx | `InterpolationContext` | ano | Interpolační kontext |

**Vrací:** `unknown` — Resolvovaná hodnota, nebo původní hodnota pokud to není reference

**Příklad:**

```typescript
import { resolve, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: { type: 'event', data: { amount: 99.50 } },
  facts: { get: () => undefined },
  variables: new Map(),
};

resolve({ ref: 'trigger.amount' }, ctx);  // 99.50
resolve('static value', ctx);             // "static value"
resolve(42, ctx);                         // 42
```

---

### resolveRef()

Resolvuje referenční string na hodnotu.

```typescript
function resolveRef(ref: string, ctx: InterpolationContext): unknown
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ref | `string` | ano | Referenční string |
| ctx | `InterpolationContext` | ano | Interpolační kontext |

**Vrací:** `unknown` — Resolvovaná hodnota

**Vyhazuje:** `Error` pokud je zdroj reference neznámý

**Zdroje referencí:**

| Prefix | Popis | Příklad |
|--------|-------|---------|
| `event.*` | Data triggeru/události | `event.orderId` |
| `trigger.*` | Alias pro event | `trigger.amount` |
| `fact.*` | Hodnota faktu | `fact.customer:123:status` |
| `var.*` | Kontextová proměnná | `var.computedValue` |
| `matched.*` | Pole matchnutých událostí | `matched.0.timestamp` |
| `lookup.*` | Výsledky lookup | `lookup.userService.email` |

**Příklad:**

```typescript
import { resolveRef, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: { type: 'event', data: { orderId: 'ORD-123' } },
  facts: { get: () => undefined },
  variables: new Map([['total', 250]]),
};

resolveRef('trigger.orderId', ctx);  // "ORD-123"
resolveRef('var.total', ctx);        // 250
```

---

### resolveObject()

Resolvuje všechny referenční hodnoty v objektu.

```typescript
function resolveObject(
  obj: Record<string, unknown>,
  ctx: InterpolationContext
): Record<string, unknown>
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| obj | `Record<string, unknown>` | ano | Objekt s možnými referencemi |
| ctx | `InterpolationContext` | ano | Interpolační kontext |

**Vrací:** `Record<string, unknown>` — Objekt se všemi resolvovanými referencemi

**Příklad:**

```typescript
import { resolveObject, InterpolationContext } from '@hamicek/noex-rules';

const ctx: InterpolationContext = {
  trigger: { type: 'event', data: { orderId: 'ORD-123', amount: 99.50 } },
  facts: { get: () => undefined },
  variables: new Map(),
};

resolveObject({
  id: { ref: 'trigger.orderId' },
  total: { ref: 'trigger.amount' },
  static: 'value'
}, ctx);
// { id: "ORD-123", total: 99.50, static: "value" }
```

---

## Vyhodnocení podmínek

### evaluateCondition()

Vyhodnotí podmínku s danou hodnotou a porovnávací hodnotou.

```typescript
function evaluateCondition(
  condition: RuleCondition,
  value: unknown,
  compareValue: unknown
): boolean
```

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| condition | `RuleCondition` | ano | Objekt podmínky s operátorem |
| value | `unknown` | ano | Skutečná hodnota k testování |
| compareValue | `unknown` | ano | Očekávaná/porovnávací hodnota |

**Vrací:** `boolean` — `true` pokud je podmínka splněna

**Podporované operátory:**

| Operátor | Popis | Příklad |
|----------|-------|---------|
| `eq` | Rovná se (strict) | `value === compareValue` |
| `neq` | Nerovná se | `value !== compareValue` |
| `gt` | Větší než | `value > compareValue` |
| `gte` | Větší nebo rovno | `value >= compareValue` |
| `lt` | Menší než | `value < compareValue` |
| `lte` | Menší nebo rovno | `value <= compareValue` |
| `in` | Hodnota v poli | `compareValue.includes(value)` |
| `not_in` | Hodnota není v poli | `!compareValue.includes(value)` |
| `contains` | String/pole obsahuje | `value.includes(compareValue)` |
| `not_contains` | String/pole neobsahuje | `!value.includes(compareValue)` |
| `matches` | Regex match | `new RegExp(compareValue).test(value)` |
| `exists` | Hodnota existuje | `value !== undefined && value !== null` |
| `not_exists` | Hodnota neexistuje | `value === undefined \|\| value === null` |

**Příklad:**

```typescript
import { evaluateCondition } from '@hamicek/noex-rules';

evaluateCondition({ operator: 'gt' }, 100, 50);           // true
evaluateCondition({ operator: 'eq' }, 'active', 'active'); // true
evaluateCondition({ operator: 'in' }, 'a', ['a', 'b']);   // true
evaluateCondition({ operator: 'matches' }, 'hello', '^h'); // true
evaluateCondition({ operator: 'exists' }, null, true);    // false
```

---

### clearMatchesCache()

Vymaže interní regex cache používanou operátorem `matches`. Užitečné pro testy.

```typescript
function clearMatchesCache(): void
```

---

## Viz také

- [ConditionEvaluator](./07-condition-evaluator.md) — Engine pro vyhodnocení podmínek
- [ActionExecutor](./08-action-executor.md) — Vykonávání akcí s interpolací
- [TimerManager](./04-timer-manager.md) — Použití duration syntaxe
- [DSL Podmínky](./11-dsl-conditions.md) — Buildery podmínek
