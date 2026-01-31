# Persistence pravidel a faktů

Bez persistence každý restart enginu znamená znovu registraci všech pravidel z kódu. To funguje pro vývoj, ale v produkci — kde jsou pravidla vytvářena dynamicky přes API, admin rozhraní nebo hot reload — potřebujete, aby pravidla přežila restarty. noex-rules se integruje s rozhraním `StorageAdapter` z `@hamicek/noex` pro automatické ukládání a obnovu pravidel a skupin.

## Co se naučíte

- Jak `PersistenceConfig` propojuje engine se storage backendem
- Automatický životní cyklus uložení/obnovy
- Jak debounced persistence sdruží rychlé změny
- Verzování schématu pro bezpečné migrace
- Vnitřní fungování třídy `RulePersistence`

## Rozhraní StorageAdapter

noex-rules neimplementuje vlastní storage vrstvu. Místo toho deleguje na rozhraní `StorageAdapter` z `@hamicek/noex`, které poskytuje zapojitelné storage backendy:

```text
  ┌──────────────┐       ┌──────────────────┐
  │  RuleEngine   │──────▶│  RulePersistence  │
  └──────────────┘       └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  StorageAdapter   │ (rozhraní z @hamicek/noex)
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
              │  SQLite    │ │  File   │ │   Memory    │
              │  Adapter   │ │ Adapter │ │   Adapter   │
              └───────────┘ └─────────┘ └─────────────┘
```

Jakýkoliv adapter implementující `save()`, `load()`, `delete()` a `exists()` funguje. Nejčastější volbou je `SQLiteAdapter` z `@hamicek/noex`.

## PersistenceConfig

Pro povolení persistence předejte volbu `persistence` do `RuleEngine.start()`:

```typescript
interface PersistenceConfig {
  /** Storage adapter (např. SQLiteAdapter z @hamicek/noex) */
  adapter: StorageAdapter;

  /** Klíč pro uložení v databázi (výchozí: 'rules') */
  key?: string;

  /** Verze schématu pro migrace (výchozí: 1) */
  schemaVersion?: number;
}
```

### Minimální nastavení

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/rules.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});
```

To je vše. Engine bude:
1. Obnovovat dříve uložená pravidla a skupiny při startu
2. Automaticky ukládat pravidla při každé změně (debounced)
3. Provádět finální uložení při `engine.stop()`

### Vlastní klíč a verze schématu

Pokud provozujete více enginů proti stejné databázi, použijte různé klíče:

```typescript
const engine = await RuleEngine.start({
  persistence: {
    adapter,
    key: 'pricing-rules',       // Oddělený jmenný prostor
    schemaVersion: 2,           // Ignorovat data z verze 1
  },
});
```

Když `schemaVersion` neodpovídá persistovaným datům, engine startuje s prázdnou sadou pravidel. To poskytuje bezpečnou migrační cestu: zvyšte verzi, když se změní formát pravidel.

## Životní cyklus uložení/obnovy

Životní cyklus persistence je plně automatický:

```text
  RuleEngine.start()
       │
       ▼
  ┌─────────────────┐
  │ Vytvoření adapt. │
  │ Vytvoření RuleP. │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐     ┌──────────────────────────────┐
  │ restore()       │────▶│ Načtení pravidel + skupin z DB │
  │                 │     │ Registrace skupin jako první   │
  │                 │     │ Registrace pravidel (ref. sk.) │
  └────────┬────────┘     └──────────────────────────────┘
           │
           ▼
  ┌─────────────────┐
  │ Engine běží      │◀──── registerRule(), disableGroup() atd.
  │                 │────▶ schedulePersist() (10ms debounce)
  └────────┬────────┘
           │
           ▼ engine.stop()
  ┌─────────────────┐
  │ persist()       │────▶ Finální uložení všech pravidel + skupin
  └─────────────────┘
```

### Automatická debounced persistence

Každá mutace spustí debounced uložení s 10ms zpožděním:

- `registerRule()` — uloží po přidání nového pravidla
- `unregisterRule()` — uloží po odebrání pravidla
- `enableRule()` / `disableRule()` — uloží po změně stavu pravidla
- `createGroup()` / `deleteGroup()` — uloží po změně skupiny
- `enableGroup()` / `disableGroup()` — uloží po změně stavu skupiny
- `updateGroup()` — uloží po změně metadat skupiny

10ms debounce sdruží rychlé změny (např. registrace 50 pravidel ve smyčce) do jednoho zápisu. Pokud se engine zastaví před vystřelením debounce, `engine.stop()` vynutí okamžité uložení.

### Pořadí obnovy

Při startu obnovovací proces načte skupiny před pravidly. To je důležité, protože pravidla mohou odkazovat na skupiny přes pole `group`. Pokud pravidlo odkazuje na skupinu `"pricing"`, tato skupina už musí existovat, aby reference byla platná.

Obnova také sleduje nejvyšší číslo verze mezi načtenými pravidly a nastaví `nextVersion = maxVersion + 1`, což zajišťuje, že nová pravidla vždy dostanou vyšší verzi než obnovená.

## Co se persistuje

Engine persistuje kompletní stav všech pravidel a skupin:

```typescript
// Vnitřně RulePersistence ukládá tuto strukturu:
interface PersistedRulesState {
  state: {
    rules: Rule[];        // Všechna registrovaná pravidla
    groups?: RuleGroup[]; // Všechny skupiny (vynecháno pokud prázdné)
  };
  metadata: {
    persistedAt: number;      // Časové razítko
    serverId: 'rule-engine';  // Fixní identifikátor
    schemaVersion: number;    // Pro bezpečnost migrací
  };
}
```

**Co SE persistuje:**
- Definice pravidel (id, name, trigger, conditions, actions, priority, tags, group, enabled)
- Skupiny pravidel (id, name, description, enabled, časová razítka)
- Metadata schématu pro verzování

**Co se NEPERSISTUJE:**
- Fakta (fact store je in-memory; pro persistence faktů použijte separátní strategii)
- Historie událostí (události jsou designem efemerní)
- Časovače (pro ty použijte `timerPersistence` — viz další kapitola)
- Runtime stav (fronta zpracování, odběratelé, data profileru)

## Kompletní příklad: Onboarding uživatelů s persistentními pravidly

Tento příklad demonstruje onboardingový systém, kde jsou pravidla vytvářena dynamicky a musí přežít restarty:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, onFact, emit, setFact, setTimer, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

// --- Nastavení s persistencí ---

const adapter = await SQLiteAdapter.start({ path: './data/onboarding.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});

// --- Vytvoření skupiny pro onboarding pravidla ---

engine.createGroup({
  id: 'onboarding',
  name: 'Onboarding uživatelů',
  description: 'Uvítací tok a připomínky',
  enabled: true,
});

// --- Pravidlo 1: Uvítací email při registraci ---

engine.registerRule(
  Rule.create('welcome-email')
    .name('Odeslání uvítacího emailu')
    .group('onboarding')
    .tags('onboarding', 'email')
    .when(onEvent('user.registered'))
    .then(emit('email.send', {
      to: ref('event.email'),
      template: 'welcome',
      name: ref('event.name'),
    }))
    .also(setFact('user:${event.userId}:onboardingStep', 'registered'))
    .also(log('Uživatel ${event.userId} registrován, uvítací email zařazen'))
    .build()
);

// --- Pravidlo 2: Nastavení časovače připomínky pokud profil nedokončen ---

engine.registerRule(
  Rule.create('profile-reminder-timer')
    .name('Naplánování připomínky dokončení profilu')
    .group('onboarding')
    .tags('onboarding', 'reminders')
    .when(onEvent('user.registered'))
    .then(setTimer({
      name: 'profile-reminder:${event.userId}',
      duration: '24h',
      onExpire: {
        topic: 'onboarding.reminder_due',
        data: { userId: ref('event.userId'), email: ref('event.email') },
      },
    }))
    .build()
);

// --- Pravidlo 3: Zrušení připomínky při dokončení profilu ---

engine.registerRule(
  Rule.create('profile-completed')
    .name('Zrušení připomínky při dokončení profilu')
    .group('onboarding')
    .tags('onboarding', 'reminders')
    .when(onFact('user:*:profileCompleted'))
    .then(setFact('user:${fact.key.split(":")[1]}:onboardingStep', 'completed'))
    .build()
);

// --- Pravidlo 4: Odeslání připomínkového emailu ---

engine.registerRule(
  Rule.create('send-reminder')
    .name('Odeslání emailu s připomínkou profilu')
    .group('onboarding')
    .tags('onboarding', 'email', 'reminders')
    .when(onEvent('onboarding.reminder_due'))
    .if(fact('user:${event.userId}:onboardingStep').neq('completed'))
    .then(emit('email.send', {
      to: ref('event.email'),
      template: 'profile-reminder',
      userId: ref('event.userId'),
    }))
    .also(log('Připomínka profilu odeslána uživateli ${event.userId}'))
    .build()
);

// --- Simulace použití ---

// Registrace uživatele
await engine.emit('user.registered', {
  userId: 'u-42',
  email: 'alice@example.com',
  name: 'Alice',
});

console.log(engine.getStats().rules.total);
// 4

// --- Simulace restartu ---
// Při příštím startu RuleEngine.start() se stejným adapterem
// se všechna 4 pravidla a skupina 'onboarding' obnoví automaticky.

await engine.stop();
```

Po `engine.stop()` jsou čtyři pravidla a skupina `onboarding` uložena do SQLite. Při příštím `RuleEngine.start()` se stejným adapterem se obnoví automaticky — není potřeba znovu registrovat z kódu.

## API reference

### Třída RulePersistence

Engine ji vytváří vnitřně, když je nakonfigurována `persistence`. Neinstanciujete ji sami, ale porozumění API pomáhá při debugování:

| Metoda | Popis |
|--------|-------|
| `save(rules, groups?)` | Persistuje všechna pravidla a skupiny do storage |
| `load()` | Vrátí `{ rules: Rule[], groups: RuleGroup[] }` |
| `clear()` | Smaže všechna persistovaná data. Vrátí `true` při úspěchu |
| `exists()` | Zkontroluje, zda existují persistovaná data |
| `getKey()` | Vrátí storage klíč (výchozí: `'rules'`) |
| `getSchemaVersion()` | Vrátí verzi schématu (výchozí: `1`) |

### Chování verze schématu

| Persistovaná verze | Verze v konfiguraci | Výsledek |
|:-:|:-:|:--|
| 1 | 1 | Pravidla obnovena normálně |
| 1 | 2 | Prázdná obnova (nesoulad verzí) |
| — (žádná data) | jakákoliv | Prázdná obnova (zatím žádná data) |

## Cvičení

Vybudujte persistentní systém notifikačních pravidel:

1. Vytvořte `SQLiteAdapter` a spusťte engine s persistencí
2. Vytvořte skupinu `notifications` se třemi pravidly:
   - Pravidlo, které emituje `notification.email` při přijetí `order.shipped`
   - Pravidlo, které emituje `notification.sms` při přijetí `delivery.failed`
   - Pravidlo, které nastaví fakt `customer:{customerId}:lastNotified` při jakékoliv notifikační události
3. Zastavte engine, spusťte novou instanci se stejným adapterem a ověřte, že všechna pravidla byla obnovena

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, ref, event } from '@hamicek/noex-rules/dsl';

// První běh: vytvoření a persistování pravidel
const adapter = await SQLiteAdapter.start({ path: './data/notifications.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});

engine.createGroup({
  id: 'notifications',
  name: 'Zákaznické notifikace',
  description: 'Pravidla emailových a SMS notifikací',
  enabled: true,
});

engine.registerRule(
  Rule.create('ship-email')
    .name('Emailová notifikace o odeslání')
    .group('notifications')
    .tags('notifications', 'email', 'shipping')
    .when(onEvent('order.shipped'))
    .then(emit('notification.email', {
      customerId: ref('event.customerId'),
      template: 'order-shipped',
      orderId: ref('event.orderId'),
    }))
    .build()
);

engine.registerRule(
  Rule.create('delivery-sms')
    .name('SMS o selhání doručení')
    .group('notifications')
    .tags('notifications', 'sms', 'delivery')
    .when(onEvent('delivery.failed'))
    .then(emit('notification.sms', {
      customerId: ref('event.customerId'),
      message: 'Doručení selhalo pro objednávku ${event.orderId}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('track-notification')
    .name('Sledování poslední notifikace')
    .group('notifications')
    .tags('notifications', 'tracking')
    .when(onEvent('notification.*'))
    .then(setFact(
      'customer:${event.customerId}:lastNotified',
      Date.now()
    ))
    .build()
);

console.log(`Pravidla před zastavením: ${engine.getStats().rules.total}`);
// Pravidla před zastavením: 3

await engine.stop();

// Druhý běh: obnova z persistence
const engine2 = await RuleEngine.start({
  persistence: { adapter },
});

console.log(`Pravidla po restartu: ${engine2.getStats().rules.total}`);
// Pravidla po restartu: 3

const groups = engine2.getGroups();
console.log(`Skupiny: ${groups.map(g => g.id).join(', ')}`);
// Skupiny: notifications

await engine2.stop();
```

Klíčový poznatek: druhá instance enginu neregistruje žádná pravidla ručně. Vše se obnoví z databáze.

</details>

## Shrnutí

- **`PersistenceConfig`** propojuje engine se `StorageAdapter` pro persistenci pravidel
- Pravidla a skupiny jsou **automaticky obnovena** při `RuleEngine.start()` a **uložena při `engine.stop()`**
- Každá mutace pravidla/skupiny spustí **debounced uložení** (10ms), což sdruží rychlé změny
- Skupiny se obnovují před pravidly, aby reference na skupiny zůstaly platné
- **`schemaVersion`** poskytuje bezpečnostní síť pro migrace — nesoulad verzí znamená čistý start
- Fakta, události a časovače **nejsou persistovány** tímto mechanismem (časovače mají vlastní — viz další kapitola)
- Použijte různé hodnoty `key` pro izolaci více enginů sdílejících stejnou databázi

---

Další: [Trvanlivé časovače](./02-persistence-casovcu.md)
