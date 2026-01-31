# Persistence pravidel a faktu

Bez persistence kazdy restart enginu znamena znovu registraci vsech pravidel z kodu. To funguje pro vyvoj, ale v produkci — kde jsou pravidla vytvavena dynamicky pres API, admin rozhrani nebo hot reload — potrebujete, aby pravidla prezila restarty. noex-rules se integruje s rozhranim `StorageAdapter` z `@hamicek/noex` pro automaticke ukladani a obnovu pravidel a skupin.

## Co se naucite

- Jak `PersistenceConfig` propojuje engine se storage backendem
- Automaticky zivotni cyklus ulozeni/obnovy
- Jak debounced persistence sdruzi rychle zmeny
- Verzovani schematu pro bezpecne migrace
- Vnitrni fungování tridy `RulePersistence`

## Rozhrani StorageAdapter

noex-rules neimplementuje vlastni storage vrstvu. Misto toho deleguje na rozhrani `StorageAdapter` z `@hamicek/noex`, ktere poskytuje zapojitelne storage backendy:

```text
  ┌──────────────┐       ┌──────────────────┐
  │  RuleEngine   │──────▶│  RulePersistence  │
  └──────────────┘       └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  StorageAdapter   │ (rozhrani z @hamicek/noex)
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
              │  SQLite    │ │  File   │ │   Memory    │
              │  Adapter   │ │ Adapter │ │   Adapter   │
              └───────────┘ └─────────┘ └─────────────┘
```

Jakykoliv adapter implementujici `save()`, `load()`, `delete()` a `exists()` funguje. Nejcastejsi volbou je `SQLiteAdapter` z `@hamicek/noex`.

## PersistenceConfig

Pro povoleni persistence predejte volbu `persistence` do `RuleEngine.start()`:

```typescript
interface PersistenceConfig {
  /** Storage adapter (napr. SQLiteAdapter z @hamicek/noex) */
  adapter: StorageAdapter;

  /** Klic pro ulozeni v databazi (vychozi: 'rules') */
  key?: string;

  /** Verze schematu pro migrace (vychozi: 1) */
  schemaVersion?: number;
}
```

### Minimalni nastaveni

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/rules.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});
```

To je vse. Engine bude:
1. Obnovovat drive ulozena pravidla a skupiny pri startu
2. Automaticky ukladat pravidla pri kazde zmene (debounced)
3. Provadet finalni ulozeni pri `engine.stop()`

### Vlastni klic a verze schematu

Pokud provozujete vice enginu proti stejne databazi, pouzijte ruzne klice:

```typescript
const engine = await RuleEngine.start({
  persistence: {
    adapter,
    key: 'pricing-rules',       // Oddeleny jmenny prostor
    schemaVersion: 2,           // Ignorovat data z verze 1
  },
});
```

Kdyz `schemaVersion` neodpovida persistovanym datum, engine startuje s prazdnou sadou pravidel. To poskytuje bezpecnou migracni cestu: zvyste verzi, kdyz se zmeni format pravidel.

## Zivotni cyklus ulozeni/obnovy

Zivotni cyklus persistence je plne automaticky:

```text
  RuleEngine.start()
       │
       ▼
  ┌─────────────────┐
  │ Vytvoreni adapt. │
  │ Vytvoreni RuleP. │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐     ┌──────────────────────────────┐
  │ restore()       │────▶│ Nacteni pravidel + skupin z DB │
  │                 │     │ Registrace skupin jako prvni   │
  │                 │     │ Registrace pravidel (ref. sk.) │
  └────────┬────────┘     └──────────────────────────────┘
           │
           ▼
  ┌─────────────────┐
  │ Engine bezi      │◀──── registerRule(), disableGroup() atd.
  │                 │────▶ schedulePersist() (10ms debounce)
  └────────┬────────┘
           │
           ▼ engine.stop()
  ┌─────────────────┐
  │ persist()       │────▶ Finalni ulozeni vsech pravidel + skupin
  └─────────────────┘
```

### Automaticka debounced persistence

Kazda mutace spusti debounced ulozeni s 10ms zpozdenem:

- `registerRule()` — ulozi po pridani noveho pravidla
- `unregisterRule()` — ulozi po odebrani pravidla
- `enableRule()` / `disableRule()` — ulozi po zmene stavu pravidla
- `createGroup()` / `deleteGroup()` — ulozi po zmene skupiny
- `enableGroup()` / `disableGroup()` — ulozi po zmene stavu skupiny
- `updateGroup()` — ulozi po zmene metadat skupiny

10ms debounce sdruzi rychle zmeny (napr. registrace 50 pravidel ve smycce) do jednoho zapisu. Pokud se engine zastavi pred vystrelenim debounce, `engine.stop()` vynuti okamzite ulozeni.

### Poradi obnovy

Pri startu obnovovaci proces nacte skupiny pred pravidly. To je dulezite, protoze pravidla mohou odkazovat na skupiny pres pole `group`. Pokud pravidlo odkazuje na skupinu `"pricing"`, tato skupina uz musi existovat, aby reference byla platna.

Obnova take sleduje nejvyssi cislo verze mezi nactenymi pravidly a nastavi `nextVersion = maxVersion + 1`, coz zajistuje, ze nova pravidla vzdy dostanou vyssi verzi nez obnovena.

## Co se persistuje

Engine persistuje kompletni stav vsech pravidel a skupin:

```typescript
// Vnitrne RulePersistence uklada tuto strukturu:
interface PersistedRulesState {
  state: {
    rules: Rule[];        // Vsechna registrovana pravidla
    groups?: RuleGroup[]; // Vsechny skupiny (vynechano pokud prazdne)
  };
  metadata: {
    persistedAt: number;      // Casove razitko
    serverId: 'rule-engine';  // Fixni identifikator
    schemaVersion: number;    // Pro bezpecnost migraci
  };
}
```

**Co SE persistuje:**
- Definice pravidel (id, name, trigger, conditions, actions, priority, tags, group, enabled)
- Skupiny pravidel (id, name, description, enabled, casova razitka)
- Metadata schematu pro verzovani

**Co se NEPERSISTUJE:**
- Fakta (fact store je in-memory; pro persistence faktu pouzijte separatni strategii)
- Historie udalosti (udalosti jsou designem efemerni)
- Casovace (pro ty pouzijte `timerPersistence` — viz dalsi kapitola)
- Runtime stav (fronta zpracovani, odberatele, data profileru)

## Kompletni priklad: Onboarding uzivatelu s persistentnimi pravidly

Tento priklad demonstruje onboardingovy system, kde jsou pravidla vytvavena dynamicky a musi prezit restarty:

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import {
  onEvent, onFact, emit, setFact, setTimer, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

// --- Nastaveni s persistenci ---

const adapter = await SQLiteAdapter.start({ path: './data/onboarding.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});

// --- Vytvoreni skupiny pro onboarding pravidla ---

engine.createGroup({
  id: 'onboarding',
  name: 'Onboarding uzivatelu',
  description: 'Uvitaci tok a pripominky',
  enabled: true,
});

// --- Pravidlo 1: Uvitaci email pri registraci ---

engine.registerRule(
  Rule.create('welcome-email')
    .name('Odeslani uvitaciho emailu')
    .group('onboarding')
    .tags('onboarding', 'email')
    .when(onEvent('user.registered'))
    .then(emit('email.send', {
      to: ref('event.email'),
      template: 'welcome',
      name: ref('event.name'),
    }))
    .also(setFact('user:${event.userId}:onboardingStep', 'registered'))
    .also(log('Uzivatel ${event.userId} registrovan, uvitaci email zarazen'))
    .build()
);

// --- Pravidlo 2: Nastaveni casovace pripominky pokud profil nedokonchen ---

engine.registerRule(
  Rule.create('profile-reminder-timer')
    .name('Naplanovani pripominky dokonceni profilu')
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

// --- Pravidlo 3: Zruseni pripominky pri dokonceni profilu ---

engine.registerRule(
  Rule.create('profile-completed')
    .name('Zruseni pripominky pri dokonceni profilu')
    .group('onboarding')
    .tags('onboarding', 'reminders')
    .when(onFact('user:*:profileCompleted'))
    .then(setFact('user:${fact.key.split(":")[1]}:onboardingStep', 'completed'))
    .build()
);

// --- Pravidlo 4: Odeslani pripominkovoho emailu ---

engine.registerRule(
  Rule.create('send-reminder')
    .name('Odeslani emailu s pripominkou profilu')
    .group('onboarding')
    .tags('onboarding', 'email', 'reminders')
    .when(onEvent('onboarding.reminder_due'))
    .if(fact('user:${event.userId}:onboardingStep').neq('completed'))
    .then(emit('email.send', {
      to: ref('event.email'),
      template: 'profile-reminder',
      userId: ref('event.userId'),
    }))
    .also(log('Pripominka profilu odeslana uzivateli ${event.userId}'))
    .build()
);

// --- Simulace pouziti ---

// Registrace uzivatele
await engine.emit('user.registered', {
  userId: 'u-42',
  email: 'alice@example.com',
  name: 'Alice',
});

console.log(engine.getStats().rules.total);
// 4

// --- Simulace restartu ---
// Pri pristim startu RuleEngine.start() se stejnym adapterem
// se vsechna 4 pravidla a skupina 'onboarding' obnovi automaticky.

await engine.stop();
```

Po `engine.stop()` jsou ctyri pravidla a skupina `onboarding` ulozena do SQLite. Pri pristim `RuleEngine.start()` se stejnym adapterem se obnovi automaticky — neni potreba znovu registrovat z kodu.

## API reference

### Trida RulePersistence

Engine ji vytvari vnitrne, kdyz je nakonfigurovana `persistence`. Neinstanciujete ji sami, ale porozumeni API pomaha pri debugovani:

| Metoda | Popis |
|--------|-------|
| `save(rules, groups?)` | Persistuje vsechna pravidla a skupiny do storage |
| `load()` | Vrati `{ rules: Rule[], groups: RuleGroup[] }` |
| `clear()` | Smaze vsechna persistovana data. Vrati `true` pri uspechu |
| `exists()` | Zkontroluje, zda existuji persistovana data |
| `getKey()` | Vrati storage klic (vychozi: `'rules'`) |
| `getSchemaVersion()` | Vrati verzi schematu (vychozi: `1`) |

### Chovani verze schematu

| Persistovana verze | Verze v konfiguraci | Vysledek |
|:-:|:-:|:--|
| 1 | 1 | Pravidla obnovena normalne |
| 1 | 2 | Prazdna obnova (nesoulad verzi) |
| — (zadna data) | jakakoliv | Prazdna obnova (zatim zadna data) |

## Cviceni

Vybudujte persistentni system notifikacnich pravidel:

1. Vytvorte `SQLiteAdapter` a spustte engine s persistenci
2. Vytvorte skupinu `notifications` se tremi pravidly:
   - Pravidlo, ktere emituje `notification.email` pri prijeti `order.shipped`
   - Pravidlo, ktere emituje `notification.sms` pri prijeti `delivery.failed`
   - Pravidlo, ktere nastavi fakt `customer:{customerId}:lastNotified` pri jakoliv notifikacni udalosti
3. Zastavte engine, spustte novou instanci se stejnym adapterem a overte, ze vsechna pravidla byla obnovena

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';
import { onEvent, emit, setFact, ref, event } from '@hamicek/noex-rules/dsl';

// Prvni beh: vytvoreni a persistovani pravidel
const adapter = await SQLiteAdapter.start({ path: './data/notifications.db' });

const engine = await RuleEngine.start({
  persistence: { adapter },
});

engine.createGroup({
  id: 'notifications',
  name: 'Zakaznicke notifikace',
  description: 'Pravidla emailovych a SMS notifikaci',
  enabled: true,
});

engine.registerRule(
  Rule.create('ship-email')
    .name('Emailova notifikace o odeslani')
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
    .name('SMS o selhani doruceni')
    .group('notifications')
    .tags('notifications', 'sms', 'delivery')
    .when(onEvent('delivery.failed'))
    .then(emit('notification.sms', {
      customerId: ref('event.customerId'),
      message: 'Doruceni selhalo pro objednavku ${event.orderId}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('track-notification')
    .name('Sledovani posledni notifikace')
    .group('notifications')
    .tags('notifications', 'tracking')
    .when(onEvent('notification.*'))
    .then(setFact(
      'customer:${event.customerId}:lastNotified',
      Date.now()
    ))
    .build()
);

console.log(`Pravidla pred zastavenim: ${engine.getStats().rules.total}`);
// Pravidla pred zastavenim: 3

await engine.stop();

// Druhy beh: obnova z persistence
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

Klicovy poznatek: druha instance enginu neregistruje zadna pravidla rucne. Vse se obnovi z databaze.

</details>

## Shrnuti

- **`PersistenceConfig`** propojuje engine se `StorageAdapter` pro persistenci pravidel
- Pravidla a skupiny jsou **automaticky obnovena** pri `RuleEngine.start()` a **ulozena pri `engine.stop()`**
- Kazda mutace pravidla/skupiny spusti **debounced ulozeni** (10ms), coz sdruzi rychle zmeny
- Skupiny se obnovuji pred pravidly, aby reference na skupiny zustaly platne
- **`schemaVersion`** poskytuje bezpecnostni sit pro migrace — nesoulad verzi znamena cisty start
- Fakta, udalosti a casovace **nejsou persistovany** timto mechanismem (casovace maji vlastni — viz dalsi kapitola)
- Pouzijte ruzne hodnoty `key` pro izolaci vice enginu sdilicich stejnou databazi

---

Dalsi: [Trvanlive casovace](./02-persistence-casovcu.md)
