# Hot reload

V bezicim produkcnim systemu nekdy potrebujete aktualizovat pravidla bez restartu enginu. Ne-vyvojar muze upravit YAML soubor s novymi cenovymi pravidly. Deployment pipeline muze vlozit aktualizovana pravidla do databaze. Hot reload sleduje externi zdroje zmeny a aplikuje je do enginu automaticky — s validaci a atomickou bezpecnosti.

## Co se naucite

- Jak konfigurovat `HotReloadConfig` se souborovymi a storage zdroji
- Jak funguje detekce zmen na bazi pollingu
- Atomicke vs neatomicke chovani reloadu
- Validace pred aplikovanim pro prevenci vadnych pravidel
- Monitorovani stavu hot reloadu

## HotReloadConfig

Povolte hot reload predanim `hotReload` do `RuleEngine.start()`:

```typescript
interface HotReloadConfig {
  /** Interval kontroly zmen v ms (vychozi: 5000) */
  intervalMs?: number;

  /** Konfigurace souborovych zdroju */
  files?: FileSourceConfig;

  /** Konfigurace zdroje ze StorageAdapteru */
  storage?: StorageSourceConfig;

  /** Validovat pravidla pred aplikovanim (vychozi: true) */
  validateBeforeApply?: boolean;

  /** Atomicky reload - bud vsechny zmeny nebo zadne (vychozi: true) */
  atomicReload?: boolean;
}

interface FileSourceConfig {
  /** Cesty k YAML souborum nebo adresarum */
  paths: string[];

  /** Glob patterny pro filtrovani (vychozi: ['*.yaml', '*.yml']) */
  patterns?: string[];

  /** Rekurzivni prochazeni adresaru (vychozi: false) */
  recursive?: boolean;
}

interface StorageSourceConfig {
  /** Storage adapter pro nacitani pravidel */
  adapter: StorageAdapter;

  /** Klic v ulozisti (vychozi: 'hot-reload:rules') */
  key?: string;
}
```

Muzete konfigurovat jeden nebo oba typy zdroju. Watcher slouci pravidla ze vsech zdroju pred vypoctem diffu.

## Typy zdroju

### Souborovy zdroj

Nacita pravidla z YAML souboru na disku. Idealni pro pravidla spravovana ne-vyvojari nebo verzovana v Git repozitari:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 10000,   // Kontrola kazdych 10 sekund
    files: {
      paths: ['./rules'],
      patterns: ['*.yaml', '*.yml'],
      recursive: true,
    },
  },
});
```

Souborovy zdroj prohledava kazdou cestu v poli `paths`:
- Pokud je cesta **soubor**, nacte pravidla primo z nej
- Pokud je cesta **adresar**, prohledava soubory odpovidajici patternum

### Storage zdroj

Nacita pravidla ze `StorageAdapteru`. Uzitecne kdyz jsou pravidla vlozena do sdilene databaze deployment pipeline nebo admin rozhranim:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/engine.db' });

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 5000,
    storage: {
      adapter,
      key: 'hot-reload:rules',  // Vychozi klic
    },
  },
});
```

Storage zdroj ocekava pravidla ulozena v tomto formatu:

```typescript
// Co storage adapter vraci:
{
  state: { rules: RuleInput[] },
  metadata: { persistedAt: number, serverId: string, schemaVersion: number }
}
```

### Kombinovane zdroje

Muzete sledovat soubory i storage soucasne:

```typescript
const engine = await RuleEngine.start({
  hotReload: {
    files: {
      paths: ['./rules/base', './rules/overrides'],
      recursive: true,
    },
    storage: {
      adapter,
      key: 'dynamic-rules',
    },
  },
});
```

Pravidla ze vsech zdroju se slouci do jednoho seznamu pred porovnanim s aktualnimi pravidly enginu.

## Jak funguje detekce zmen

Hot reload watcher pouziva polling model implementovany pres GenServer:

```text
  HotReloadWatcher.start()
       │
       ▼
  ┌───────────────────────┐
  │ Inicializace hash cache│ ◀── SHA-256 kazdeho aktualniho pravidla
  │ Start GenServeru       │
  │ Naplanovani prvni kontr│
  └───────────┬───────────┘
              │
              ▼ (kazdych intervalMs)
  ┌───────────────────────┐
  │ Nacteni pravidel ze    │
  │ vsech zdroju (soubory  │
  │ + storage)             │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐     ┌────────────────────────┐
  │ Vypocet diffu          │────▶│ Porovnani SHA-256 hashi│
  │                       │     │ s ulozenyma verzemi    │
  └───────────┬───────────┘     └────────────────────────┘
              │
    ┌─────────┼─────────┐
    │ Zadne zmeny?       │── Ano ──▶ Naplanovani dalsi kontroly
    │                    │
    │ Detekovane zmeny:  │
    │ - added[]          │
    │ - removed[]        │
    │ - modified[]       │
    └─────────┬──────────┘
              │
              ▼
  ┌───────────────────────┐
  │ Validace (pokud povol.)│── Selhani ──▶ Inkrementace failureCount
  └───────────┬───────────┘               Naplanovani dalsi kontroly
              │ Uspech
              ▼
  ┌───────────────────────┐
  │ Aplikace zmen          │
  │ 1. Odstraneni smazanych│
  │ 2. Aktualizace zmenenych│
  │ 3. Pridani novych      │
  │ 4. Aktualizace hash    │
  │    cache               │
  └───────────┬───────────┘
              │
              ▼
  Naplanovani dalsi kontroly
```

### SHA-256 hashovani

Kazde pravidlo je hashovano pomoci SHA-256 jeho serializovane formy. Watcher udrzuje cache `Map<ruleId, hash>`. Pri kazdem kontrolnim cyklu:

- **Pridana pravidla**: ID pravidla existuje ve zdroji, ale ne v cache
- **Odebrana pravidla**: ID pravidla existuje v cache, ale ne ve zdroji
- **Zmenena pravidla**: ID pravidla existuje v obou, ale hashe se lisi

To je efektivni — porovnavaji se pouze ID a hashe, ne cele objekty pravidel.

## Atomicky reload

Kdyz `atomicReload: true` (vychozi), zmeny se aplikuji jako operace vsechno-nebo-nic:

```text
  Atomicky rezim (vychozi):

  ┌─────────────────────────────────────────┐
  │ Transakce                                │
  │                                         │
  │  1. Odebrani pravidla-A  ──┐            │
  │  2. Aktualizace pravidla-B ┤  Vse OK    │──▶ Potvrzeni
  │  3. Pridani pravidla-C   ──┘            │
  │                                         │
  │  Pokud JAKYKOLIV krok selze ────────────│──▶ Rollback (zadne zmeny)
  └─────────────────────────────────────────┘

  Neatomicky rezim:

  1. Odebrani pravidla-A     ──▶ Aplikovano (i kdyz krok 2 selze)
  2. Aktualizace pravidla-B  ──▶ Selhalo! (castecny stav)
  3. Pridani pravidla-C      ──▶ Nepokuseno
```

Atomicky rezim zabratnuje tomu, aby engine skoncil v nekonzistentnim stavu, kde jsou nektera pravidla aktualizovana a jina ne. V neatomickem rezimu se kazda zmena aplikuje nezavisle — selhani jedne nebrani ostatnim.

Pouzijte atomicky rezim (vychozi), pokud nemate konkretni duvod to neudelat.

## Validace pred aplikovanim

Kdyz `validateBeforeApply: true` (vychozi), vsechna nova a zmenena pravidla se validuji pred jakoukoli aplikaci zmen:

```typescript
const engine = await RuleEngine.start({
  hotReload: {
    files: { paths: ['./rules'] },
    validateBeforeApply: true,  // Vychozi
  },
});
```

Validace kontroluje:
- Povinne pole (id, trigger, alespon jednu akci)
- Format triggeru (platne event patterny, fact patterny, timer patterny)
- Strukturu podminek (platne operatory, spravne zdrojove reference)
- Strukturu akci (platne typy akci, povinne parametry)

Pokud validace selze, cely reload cyklus se preskoci a `failureCount` se inkrementuje. Existujici pravidla zustanou nezmenena.

## Monitorovani hot reloadu

Watcher vystavuje svuj stav pres `getHotReloadStatus()`:

```typescript
interface HotReloadStatus {
  running: boolean;          // Aktivne watcher polluje?
  intervalMs: number;        // Interval pollingu
  trackedRulesCount: number; // Pocet pravidel v hash cache
  lastReloadAt: number | null; // Casove razitko posledniho uspesneho reloadu
  reloadCount: number;       // Celkem uspesnych reloadu
  failureCount: number;      // Celkem neuspesnych pokusu o reload
}
```

```typescript
const status = engine.getHotReloadStatus();
console.log(status);
// {
//   running: true,
//   intervalMs: 5000,
//   trackedRulesCount: 12,
//   lastReloadAt: 1706886400000,
//   reloadCount: 3,
//   failureCount: 0,
// }
```

## Kompletni priklad: YAML-rizene cenove pravidla

Cenovy system, kde byznys uzivatele upravuji YAML soubory a engine automaticky zachyti zmeny:

```yaml
# rules/pricing/summer-sale.yaml
- id: summer-discount
  name: Letni vyprodej sleva 20%
  tags: [pricing, seasonal]
  trigger:
    type: event
    topic: order.created
  conditions:
    - source: event
      field: total
      operator: gte
      value: 50
  actions:
    - type: emit_event
      topic: discount.applied
      data:
        orderId: "${event.orderId}"
        discount: 0.2
        reason: summer-sale

- id: summer-free-shipping
  name: Letni doprava zdarma
  tags: [pricing, seasonal, shipping]
  trigger:
    type: event
    topic: order.created
  conditions:
    - source: event
      field: total
      operator: gte
      value: 100
  actions:
    - type: set_fact
      key: "order:${event.orderId}:freeShipping"
      value: true
```

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/pricing.db' });

const engine = await RuleEngine.start({
  // Persistovat stav enginu
  persistence: { adapter },

  // Sledovat zmeny YAML
  hotReload: {
    intervalMs: 5000,
    files: {
      paths: ['./rules/pricing'],
      patterns: ['*.yaml'],
      recursive: false,
    },
    validateBeforeApply: true,
    atomicReload: true,
  },
});

// Odber cenovych udalosti
engine.subscribe('discount.applied', (event) => {
  console.log(`Sleva aplikovana: ${event.data.discount * 100}% na objednavku ${event.data.orderId}`);
});

// Engine nyni monitoruje ./rules/pricing/ kazdych 5 sekund.
// Upravte summer-sale.yaml a zmente slevu z 0.2 na 0.3 —
// watcher detekuje zmenu, validuje nova pravidla
// a atomicky je aplikuje.

// Kontrola stavu
setInterval(() => {
  const status = engine.getHotReloadStatus();
  if (status.reloadCount > 0) {
    console.log(`Posledni reload: ${new Date(status.lastReloadAt!).toISOString()}`);
    console.log(`Sledovanych pravidel: ${status.trackedRulesCount}`);
  }
}, 30000);

// Elegantni vypnuti zastavi watcher
// await engine.stop();
```

Kdyz byznys uzivatel upravi `summer-sale.yaml`, watcher:
1. Detekuje zmenu hashe pri pristim polling cyklu
2. Validuje obe pravidla v souboru
3. Atomicky aktualizuje zmenene pravidlo(a) v enginu
4. Aktualizuje hash cache

Zadny restart. Zadna API volani. Staci upravit a ulozit.

## Hot reload vs persistence

Hot reload a persistence pravidel se doplnuji, nekonkuruji si:

| Aspekt | Persistence | Hot reload |
|--------|-------------|------------|
| **Smer** | Stav enginu -> uloziste | Externi zdroje -> engine |
| **Kdy** | Pri zmenach pravidel + vypnuti | V intervalu pollingu |
| **Ucel** | Preziti restartu | Aktualizace z externich zdroju |
| **Zdroj pravdy** | Vnitrni stav enginu | YAML soubory nebo storage |

Typicke produkcni nastaveni pouziva obe:
- **Persistence** zajistuje, ze pravidla preziji restarty
- **Hot reload** zachycuje zmeny z YAML souboru nebo deployment pipeline

Kdyz jsou obe aktivni a hot reload aktualizuje pravidlo, zmena je zachycena beznym mechanismem persistence (debounced save) a automaticky persistovana.

## Cviceni

Vybudujte hot-reloadovatelny notifikacni system:

1. Vytvorte adresar `rules/notifications/` s YAML souborem obsahujicim dve pravidla:
   - Pravidlo, ktere emituje `alert.email` pri prijeti `system.error` se `severity >= 3`
   - Pravidlo, ktere emituje `alert.slack` pri prijeti `system.error` se `severity >= 5`
2. Spustte engine s hot reloadem sledujicim tento adresar
3. Prihlaste se k odberu obou alert topicu a logujte prijate udalosti
4. Popiste, co se stane, kdyz upravite YAML a zmenite prah severity z 5 na 4

<details>
<summary>Reseni</summary>

Nejprve YAML soubor (`rules/notifications/alerts.yaml`):

```yaml
- id: email-alert
  name: Emailovy alert pri systemove chybe
  tags: [alerts, email]
  trigger:
    type: event
    topic: system.error
  conditions:
    - source: event
      field: severity
      operator: gte
      value: 3
  actions:
    - type: emit_event
      topic: alert.email
      data:
        message: "${event.message}"
        severity: "${event.severity}"
        service: "${event.service}"

- id: slack-alert
  name: Slack alert pri kriticke chybe
  tags: [alerts, slack]
  trigger:
    type: event
    topic: system.error
  conditions:
    - source: event
      field: severity
      operator: gte
      value: 5
  actions:
    - type: emit_event
      topic: alert.slack
      data:
        message: "${event.message}"
        severity: "${event.severity}"
        service: "${event.service}"
        channel: "#incidents"
```

Potom nastaveni enginu:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 3000,
    files: {
      paths: ['./rules/notifications'],
      patterns: ['*.yaml'],
    },
    validateBeforeApply: true,
    atomicReload: true,
  },
});

// Odber alertovych udalosti
engine.subscribe('alert.email', (event) => {
  console.log(`[EMAIL] ${event.data.service}: ${event.data.message} (severity: ${event.data.severity})`);
});

engine.subscribe('alert.slack', (event) => {
  console.log(`[SLACK] #incidents - ${event.data.service}: ${event.data.message} (severity: ${event.data.severity})`);
});

// Test: emitovani chyby se severity 4
await engine.emit('system.error', {
  message: 'Pool pripojeni k databazi vycerpan',
  severity: 4,
  service: 'api-gateway',
});
// Vystup: [EMAIL] api-gateway: Pool pripojeni k databazi vycerpan (severity: 4)
// (Zadny Slack alert — severity 4 < prah 5)

// Nyni upravte alerts.yaml: zmente severity slack-alertu z 5 na 4
// Watcher detekuje zmenu behem 3 sekund, validuje a aplikuje.

// Po reloadu stejna udalost take spusti Slack:
// [EMAIL] api-gateway: ... (severity: 4)
// [SLACK] #incidents - api-gateway: ... (severity: 4)

const status = engine.getHotReloadStatus();
console.log(`Reloady: ${status.reloadCount}, Selhani: ${status.failureCount}`);
```

Kdyz se prah v YAML zmeni z 5 na 4:
1. Watcher vypocita novy SHA-256 hash pro `slack-alert`
2. Hash se lisi od uloze verze — pravidlo je oznaceno jako **zmenene**
3. Validace projde (nove pravidlo je strukturalne platne)
4. Engine odregistruje stary `slack-alert` a zaregistruje novy
5. Hash cache se aktualizuje
6. Budouci udalosti `system.error` se severity 4 nyni spusti oba alerty

</details>

## Shrnuti

- **Hot reload** sleduje externi zdroje (YAML soubory, storage adaptery) a aplikuje zmeny pravidel bez restartu enginu
- Konfigurujte pres `hotReload` v `RuleEngine.start()` s `files`, `storage` nebo obojim
- Detekce zmen pouziva **SHA-256 hashovani** — efektivni porovnani bez plneho diffovani objektu
- **Atomicky reload** (vychozi) aplikuje vsechny zmeny nebo zadne, coz zabratnuje nekonzistentnimu stavu
- **Validace pred aplikovanim** (vychozi) odmitne neplatna pravidla pred jejich dosazenim do enginu
- Watcher pouziva **polling model** pres GenServer, s konfigurovatelnym intervalem (vychozi: 5000ms)
- Monitorujte stav pres `getHotReloadStatus()` — sledujte pocet reloadu, selhani a cas posledniho reloadu
- Hot reload doplnuje persistenci: reload prinasi externi zmeny dovnitr, persistence uklada stav ven

---

Dalsi: [Debugging pravidel](../08-pozorovatelnost/01-debugging.md)
