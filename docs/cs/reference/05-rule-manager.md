# RuleManager

Interní úložiště pravidel s optimalizovanou indexací podle triggerů. Používá se interně v RuleEngine; přístup přes `engine.getRuleManager()` pro debugging nebo vlastní dotazy.

## Import

```typescript
import { RuleManager } from '@hamicek/noex-rules';
```

## Factory

### start()

```typescript
static async start(): Promise<RuleManager>
```

Vytvoří novou instanci RuleManager.

**Návratová hodnota:** `Promise<RuleManager>` — instance manageru

**Příklad:**

```typescript
const manager = await RuleManager.start();
```

---

## Správa pravidel

### register()

```typescript
register(input: RuleInput): Rule
```

Registruje nové pravidlo. Automaticky indexuje pravidlo podle typu triggeru a tagů.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| input | `RuleInput` | ano | Definice pravidla |

**Návratová hodnota:** `Rule` — registrované pravidlo s vygenerovanými metadaty (version, createdAt, updatedAt)

**Příklad:**

```typescript
const rule = manager.register({
  id: 'low-stock-alert',
  name: 'Low Stock Alert',
  priority: 100,
  enabled: true,
  tags: ['inventory', 'alerts'],
  trigger: { type: 'fact', pattern: 'inventory:*' },
  conditions: [{ source: 'fact', field: 'quantity', operator: 'lt', value: 10 }],
  actions: [{ type: 'emit_event', topic: 'stock:low', payload: {} }],
});
```

### unregister()

```typescript
unregister(ruleId: string): boolean
```

Odstraní pravidlo a jeho indexy.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| ruleId | `string` | ano | Identifikátor pravidla |

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a odstraněno

**Příklad:**

```typescript
const removed = manager.unregister('low-stock-alert');
```

### enable()

```typescript
enable(ruleId: string): boolean
```

Povolí zakázané pravidlo.

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a povoleno

### disable()

```typescript
disable(ruleId: string): boolean
```

Zakáže pravidlo bez jeho odstranění.

**Návratová hodnota:** `boolean` — true pokud bylo pravidlo nalezeno a zakázáno

### get()

```typescript
get(ruleId: string): Rule | undefined
```

Vrátí pravidlo podle ID.

**Návratová hodnota:** `Rule | undefined` — pravidlo nebo undefined pokud nenalezeno

### getAll()

```typescript
getAll(): Rule[]
```

Vrátí všechna registrovaná pravidla.

**Návratová hodnota:** `Rule[]` — pole všech pravidel

---

## Indexované dotazy

RuleManager udržuje optimalizované indexy pro O(1) přesné vyhledávání a O(k) prohledávání wildcardových vzorů, kde k << n (počet wildcardových vzorů).

### getByFactPattern()

```typescript
getByFactPattern(key: string): Rule[]
```

Vrátí aktivní pravidla spouštěná klíčem faktu. Matchuje přesné vzory i wildcardy.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu k matchování (např. `user.123.status`) |

**Návratová hodnota:** `Rule[]` — odpovídající aktivní pravidla seřazená podle priority (sestupně)

**Příklad:**

```typescript
const rules = manager.getByFactPattern('user.123.premium');
// Matchuje pravidla s triggery: 'user.123.premium', 'user.*', 'user.123.*'
```

### getByEventTopic()

```typescript
getByEventTopic(topic: string): Rule[]
```

Vrátí aktivní pravidla spouštěná event topicem. Matchuje přesné topicy i wildcardy.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Event topic k matchování (např. `order:created`) |

**Návratová hodnota:** `Rule[]` — odpovídající aktivní pravidla seřazená podle priority (sestupně)

**Příklad:**

```typescript
const rules = manager.getByEventTopic('order:created');
// Matchuje pravidla s triggery: 'order:created', 'order:*', '*'
```

### getByTimerName()

```typescript
getByTimerName(name: string): Rule[]
```

Vrátí aktivní pravidla spouštěná jménem timeru. Podporuje wildcardy.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| name | `string` | ano | Jméno timeru k matchování |

**Návratová hodnota:** `Rule[]` — odpovídající aktivní pravidla seřazená podle priority (sestupně)

**Příklad:**

```typescript
const rules = manager.getByTimerName('payment-timeout:ORD-123');
// Matchuje pravidla s triggery: 'payment-timeout:ORD-123', 'payment-timeout:*'
```

### getByFactAction()

```typescript
getByFactAction(key: string): Rule[]
```

Vrátí aktivní pravidla, jejichž akce nastavují fakt s daným klíčem (set_fact). Používá se pro backward chaining k nalezení pravidel produkujících cílový fakt.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| key | `string` | ano | Klíč faktu, který pravidla produkují |

**Návratová hodnota:** `Rule[]` — pravidla nastavující tento fakt, seřazená podle priority (sestupně)

**Příklad:**

```typescript
const producers = manager.getByFactAction('user.123.premium');
// Vrátí pravidla s akcemi jako: { type: 'set_fact', key: 'user.123.premium', value: true }
```

### getByEventAction()

```typescript
getByEventAction(topic: string): Rule[]
```

Vrátí aktivní pravidla, jejichž akce emitují event s daným topicem (emit_event). Používá se pro backward chaining k nalezení pravidel produkujících cílový event.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| topic | `string` | ano | Event topic, který pravidla produkují |

**Návratová hodnota:** `Rule[]` — pravidla emitující tento event, seřazená podle priority (sestupně)

**Příklad:**

```typescript
const producers = manager.getByEventAction('notification:sent');
```

### getTemporalRules()

```typescript
getTemporalRules(): Rule[]
```

Vrátí všechna aktivní pravidla s temporálními triggery (CEP vzory).

**Návratová hodnota:** `Rule[]` — temporální pravidla

---

## Stav pravidla

### isRuleActive()

```typescript
isRuleActive(rule: Rule): boolean
```

Zjistí, zda je pravidlo aktivní. Pravidlo je aktivní, když:
1. Pravidlo samotné je povoleno
2. Pokud pravidlo patří do skupiny, skupina je také povolena

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| rule | `Rule` | ano | Pravidlo ke kontrole |

**Návratová hodnota:** `boolean` — true pokud je pravidlo aktivní

**Příklad:**

```typescript
const rule = manager.get('my-rule');
if (rule && manager.isRuleActive(rule)) {
  console.log('Pravidlo je aktivní a bude vyhodnoceno');
}
```

---

## Správa skupin

### registerGroup()

```typescript
registerGroup(input: RuleGroupInput): RuleGroup
```

Registruje novou skupinu pravidel.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| input | `RuleGroupInput` | ano | Definice skupiny |

**Návratová hodnota:** `RuleGroup` — vytvořená skupina s metadaty

**Příklad:**

```typescript
const group = manager.registerGroup({
  id: 'notifications',
  name: 'Notification Rules',
  description: 'Všechna pravidla týkající se notifikací',
  enabled: true,
});
```

### unregisterGroup()

```typescript
unregisterGroup(groupId: string): boolean
```

Odstraní skupinu. Pravidla ve skupině se stanou neseskupenými (jejich pole `group` je odstraněno).

**Návratová hodnota:** `boolean` — true pokud byla skupina nalezena a odstraněna

### enableGroup()

```typescript
enableGroup(groupId: string): boolean
```

Povolí skupinu, čímž aktivuje všechna její pravidla (pokud jsou individuálně povolena).

**Návratová hodnota:** `boolean` — true pokud byla skupina nalezena a povolena

### disableGroup()

```typescript
disableGroup(groupId: string): boolean
```

Zakáže skupinu, čímž deaktivuje všechna její pravidla bez ohledu na jejich individuální stav.

**Návratová hodnota:** `boolean` — true pokud byla skupina nalezena a zakázána

### updateGroup()

```typescript
updateGroup(groupId: string, updates: { name?: string; description?: string; enabled?: boolean }): RuleGroup | undefined
```

Aktualizuje vlastnosti skupiny.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| groupId | `string` | ano | Identifikátor skupiny |
| updates | `object` | ano | Pole k aktualizaci |

**Návratová hodnota:** `RuleGroup | undefined` — aktualizovaná skupina nebo undefined pokud nenalezena

### getGroup()

```typescript
getGroup(groupId: string): RuleGroup | undefined
```

Vrátí skupinu podle ID.

### getAllGroups()

```typescript
getAllGroups(): RuleGroup[]
```

Vrátí všechny registrované skupiny.

### getGroupRules()

```typescript
getGroupRules(groupId: string): Rule[]
```

Vrátí všechna pravidla patřící do skupiny.

**Příklad:**

```typescript
const rules = manager.getGroupRules('notifications');
console.log(`Skupina má ${rules.length} pravidel`);
```

---

## Persistence

### setPersistence()

```typescript
setPersistence(persistence: RulePersistence): void
```

Nastaví persistence adaptér pro ukládání pravidel a skupin.

**Parametry:**

| Název | Typ | Povinný | Popis |
|-------|-----|---------|-------|
| persistence | `RulePersistence` | ano | Persistence adaptér |

### restore()

```typescript
async restore(): Promise<number>
```

Načte pravidla a skupiny z persistence storage. Skupiny se obnovují první, aby reference skupin v pravidlech fungovaly správně.

**Návratová hodnota:** `Promise<number>` — počet obnovených pravidel

**Příklad:**

```typescript
manager.setPersistence(persistence);
const count = await manager.restore();
console.log(`Obnoveno ${count} pravidel`);
```

### persist()

```typescript
async persist(): Promise<void>
```

Manuálně uloží všechna pravidla a skupiny do persistence storage.

**Příklad:**

```typescript
await manager.persist();
```

---

## Vlastnosti

### size

```typescript
get size(): number
```

Vrátí počet registrovaných pravidel.

**Příklad:**

```typescript
console.log(`Celkem pravidel: ${manager.size}`);
```

---

## Typy

### Rule

```typescript
interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  enabled: boolean;
  version: number;
  tags: string[];
  group?: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  lookups?: DataRequirement[];
  createdAt: number;
  updatedAt: number;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| id | `string` | Unikátní identifikátor pravidla |
| name | `string` | Lidsky čitelný název pravidla |
| description | `string` | Volitelný popis |
| priority | `number` | Priorita vykonání (vyšší = dříve) |
| enabled | `boolean` | Zda je pravidlo povoleno |
| version | `number` | Automaticky inkrementované číslo verze |
| tags | `string[]` | Tagy pro kategorizaci |
| group | `string` | Volitelné členství ve skupině |
| trigger | `RuleTrigger` | Co aktivuje pravidlo |
| conditions | `RuleCondition[]` | Podmínky, které musí být splněny |
| actions | `RuleAction[]` | Akce k vykonání |
| lookups | `DataRequirement[]` | Požadavky na externí data |
| createdAt | `number` | Unix timestamp vytvoření |
| updatedAt | `number` | Unix timestamp poslední aktualizace |

### RuleInput

```typescript
type RuleInput = Omit<Rule, 'version' | 'createdAt' | 'updatedAt'>;
```

Definice pravidla bez automaticky generovaných polí. Používá se pro registraci.

### RuleTrigger

```typescript
type RuleTrigger =
  | { type: 'fact'; pattern: string }
  | { type: 'event'; topic: string }
  | { type: 'timer'; name: string }
  | { type: 'temporal'; pattern: TemporalPattern };
```

| Typ triggeru | Pole | Popis |
|--------------|------|-------|
| `fact` | `pattern` | Vzor klíče faktu (podporuje `*` wildcard) |
| `event` | `topic` | Event topic (podporuje `*` wildcard) |
| `timer` | `name` | Jméno timeru (podporuje `*` wildcard) |
| `temporal` | `pattern` | CEP vzor (sequence, absence, count, aggregate) |

### RuleGroup

```typescript
interface RuleGroup {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

| Pole | Typ | Popis |
|------|-----|-------|
| id | `string` | Unikátní identifikátor skupiny |
| name | `string` | Lidsky čitelný název skupiny |
| description | `string` | Volitelný popis |
| enabled | `boolean` | Zda je skupina povolena |
| createdAt | `number` | Unix timestamp vytvoření |
| updatedAt | `number` | Unix timestamp poslední aktualizace |

### RuleGroupInput

```typescript
interface RuleGroupInput {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
}
```

Definice skupiny pro registraci. `enabled` má výchozí hodnotu `true`.

---

## Pattern matching

RuleManager podporuje wildcardové vzory v triggerech pomocí `*`:

```typescript
// Fact vzory
'user.123.status'    // Přesná shoda
'user.*'             // Matchuje jakýkoliv user klíč
'user.*.premium'     // Matchuje user.123.premium, user.456.premium
'*'                  // Matchuje všechny fakty

// Event topicy
'order:created'      // Přesná shoda
'order:*'            // Matchuje order:created, order:shipped atd.
'*'                  // Matchuje všechny eventy

// Jména timerů
'payment-timeout:ORD-123'  // Přesná shoda
'payment-timeout:*'        // Matchuje jakýkoliv payment timeout timer
```

---

## Architektura indexů

RuleManager udržuje oddělené indexy pro optimální výkon dotazů:

1. **Přesné indexy** (O(1) lookup):
   - `exactFactPatterns`: Pravidla s přesnými fact vzory
   - `exactEventTopics`: Pravidla s přesnými event topicy
   - `exactTimerNames`: Pravidla s přesnými jmény timerů

2. **Wildcardové indexy** (O(k) prohledávání kde k << n):
   - `wildcardFactPatterns`: Pravidla s wildcardovými fact vzory
   - `wildcardEventTopics`: Pravidla s wildcardovými event topicy
   - `wildcardTimerNames`: Pravidla s wildcardovými jmény timerů

3. **Reverzní indexy** (pro backward chaining):
   - `exactFactActions`: Pravidla nastavující konkrétní fakty
   - `templateFactActions`: Pravidla s šablonovými fact akcemi
   - `exactEventActions`: Pravidla emitující konkrétní eventy
   - `templateEventActions`: Pravidla s šablonovými event akcemi

4. **Tag a group indexy**:
   - `byTags`: Pravidla indexovaná podle tagů
   - `byGroup`: Pravidla indexovaná podle členství ve skupině

---

## Automatická persistence

Když je persistence nakonfigurována, RuleManager automaticky ukládá změny s debounce (výchozí 10ms). Manuální persistence lze vyvolat pomocí `persist()`.

---

## Viz také

- [RuleEngine](./01-rule-engine.md) — Hlavní orchestrátor
- [TemporalProcessor](./06-temporal-processor.md) — Zpracování CEP vzorů
- [Fluent Builder](./09-dsl-builder.md) — Rule.create() DSL
- [Skupiny pravidel](../learn/07-groups-webhooks/01-rule-groups.md) — Tutoriál
