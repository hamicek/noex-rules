# Hot reload

V běžícím produkčním systému někdy potřebujete aktualizovat pravidla bez restartu enginu. Ne-vývojář může upravit YAML soubor s novými cenovými pravidly. Deployment pipeline může vložit aktualizovaná pravidla do databáze. Hot reload sleduje externí zdroje změn a aplikuje je do enginu automaticky — s validací a atomickou bezpečností.

## Co se naučíte

- Jak konfigurovat `HotReloadConfig` se souborovými a storage zdroji
- Jak funguje detekce změn na bázi pollingu
- Atomické vs neatomické chování reloadu
- Validace před aplikováním pro prevenci vadných pravidel
- Monitorování stavu hot reloadu

## HotReloadConfig

Povolte hot reload předáním `hotReload` do `RuleEngine.start()`:

```typescript
interface HotReloadConfig {
  /** Interval kontroly změn v ms (výchozí: 5000) */
  intervalMs?: number;

  /** Konfigurace souborových zdrojů */
  files?: FileSourceConfig;

  /** Konfigurace zdroje ze StorageAdapteru */
  storage?: StorageSourceConfig;

  /** Validovat pravidla před aplikováním (výchozí: true) */
  validateBeforeApply?: boolean;

  /** Atomický reload - buď všechny změny nebo žádné (výchozí: true) */
  atomicReload?: boolean;
}

interface FileSourceConfig {
  /** Cesty k YAML souborům nebo adresářům */
  paths: string[];

  /** Glob patterny pro filtrování (výchozí: ['*.yaml', '*.yml']) */
  patterns?: string[];

  /** Rekurzivní procházení adresářů (výchozí: false) */
  recursive?: boolean;
}

interface StorageSourceConfig {
  /** Storage adapter pro načítání pravidel */
  adapter: StorageAdapter;

  /** Klíč v úložišti (výchozí: 'hot-reload:rules') */
  key?: string;
}
```

Můžete konfigurovat jeden nebo oba typy zdrojů. Watcher sloučí pravidla ze všech zdrojů před výpočtem diffu.

## Typy zdrojů

### Souborový zdroj

Načítá pravidla z YAML souborů na disku. Ideální pro pravidla spravovaná ne-vývojáři nebo verzovaná v Git repozitáři:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 10000,   // Kontrola každých 10 sekund
    files: {
      paths: ['./rules'],
      patterns: ['*.yaml', '*.yml'],
      recursive: true,
    },
  },
});
```

Souborový zdroj prohledává každou cestu v poli `paths`:
- Pokud je cesta **soubor**, načte pravidla přímo z něj
- Pokud je cesta **adresář**, prohledává soubory odpovídající patternům

### Storage zdroj

Načítá pravidla ze `StorageAdapteru`. Užitečné když jsou pravidla vložena do sdílené databáze deployment pipeline nebo admin rozhraním:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import { SQLiteAdapter } from '@hamicek/noex';

const adapter = await SQLiteAdapter.start({ path: './data/engine.db' });

const engine = await RuleEngine.start({
  hotReload: {
    intervalMs: 5000,
    storage: {
      adapter,
      key: 'hot-reload:rules',  // Výchozí klíč
    },
  },
});
```

Storage zdroj očekává pravidla uložená v tomto formátu:

```typescript
// Co storage adapter vrací:
{
  state: { rules: RuleInput[] },
  metadata: { persistedAt: number, serverId: string, schemaVersion: number }
}
```

### Kombinované zdroje

Můžete sledovat soubory i storage současně:

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

Pravidla ze všech zdrojů se sloučí do jednoho seznamu před porovnáním s aktuálními pravidly enginu.

## Jak funguje detekce změn

Hot reload watcher používá polling model implementovaný přes GenServer:

```text
  HotReloadWatcher.start()
       │
       ▼
  ┌───────────────────────┐
  │ Inicializace hash cache│ ◀── SHA-256 každého aktuálního pravidla
  │ Start GenServeru       │
  │ Naplánování první kontr│
  └───────────┬───────────┘
              │
              ▼ (každých intervalMs)
  ┌───────────────────────┐
  │ Načtení pravidel ze    │
  │ všech zdrojů (soubory  │
  │ + storage)             │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐     ┌────────────────────────┐
  │ Výpočet diffu          │────▶│ Porovnání SHA-256 hashí│
  │                       │     │ s uloženými verzemi    │
  └───────────┬───────────┘     └────────────────────────┘
              │
    ┌─────────┼─────────┐
    │ Žádné změny?       │── Ano ──▶ Naplánování další kontroly
    │                    │
    │ Detekované změny:  │
    │ - added[]          │
    │ - removed[]        │
    │ - modified[]       │
    └─────────┬──────────┘
              │
              ▼
  ┌───────────────────────┐
  │ Validace (pokud povol.)│── Selhání ──▶ Inkrementace failureCount
  └───────────┬───────────┘               Naplánování další kontroly
              │ Úspěch
              ▼
  ┌───────────────────────┐
  │ Aplikace změn          │
  │ 1. Odstranění smazaných│
  │ 2. Aktualizace změněných│
  │ 3. Přidání nových      │
  │ 4. Aktualizace hash    │
  │    cache               │
  └───────────┬───────────┘
              │
              ▼
  Naplánování další kontroly
```

### SHA-256 hashování

Každé pravidlo je hashováno pomocí SHA-256 jeho serializované formy. Watcher udržuje cache `Map<ruleId, hash>`. Při každém kontrolním cyklu:

- **Přidaná pravidla**: ID pravidla existuje ve zdroji, ale ne v cache
- **Odebraná pravidla**: ID pravidla existuje v cache, ale ne ve zdroji
- **Změněná pravidla**: ID pravidla existuje v obou, ale hashe se liší

To je efektivní — porovnávají se pouze ID a hashe, ne celé objekty pravidel.

## Atomický reload

Když `atomicReload: true` (výchozí), změny se aplikují jako operace všechno-nebo-nic:

```text
  Atomický režim (výchozí):

  ┌─────────────────────────────────────────┐
  │ Transakce                                │
  │                                         │
  │  1. Odebrání pravidla-A  ──┐            │
  │  2. Aktualizace pravidla-B ┤  Vše OK    │──▶ Potvrzení
  │  3. Přidání pravidla-C   ──┘            │
  │                                         │
  │  Pokud JAKÝKOLIV krok selže ────────────│──▶ Rollback (žádné změny)
  └─────────────────────────────────────────┘

  Neatomický režim:

  1. Odebrání pravidla-A     ──▶ Aplikováno (i když krok 2 selže)
  2. Aktualizace pravidla-B  ──▶ Selhalo! (částečný stav)
  3. Přidání pravidla-C      ──▶ Nepokuseno
```

Atomický režim zabraňuje tomu, aby engine skončil v nekonzistentním stavu, kde jsou některá pravidla aktualizována a jiná ne. V neatomickém režimu se každá změna aplikuje nezávisle — selhání jedné nebrání ostatním.

Použijte atomický režim (výchozí), pokud nemáte konkrétní důvod to neudělat.

## Validace před aplikováním

Když `validateBeforeApply: true` (výchozí), všechna nová a změněná pravidla se validují před jakoukoli aplikací změn:

```typescript
const engine = await RuleEngine.start({
  hotReload: {
    files: { paths: ['./rules'] },
    validateBeforeApply: true,  // Výchozí
  },
});
```

Validace kontroluje:
- Povinné pole (id, trigger, alespoň jednu akci)
- Formát triggeru (platné event patterny, fact patterny, timer patterny)
- Strukturu podmínek (platné operátory, správné zdrojové reference)
- Strukturu akcí (platné typy akcí, povinné parametry)

Pokud validace selže, celý reload cyklus se přeskočí a `failureCount` se inkrementuje. Existující pravidla zůstanou nezměněna.

## Monitorování hot reloadu

Watcher vystavuje svůj stav přes `getHotReloadStatus()`:

```typescript
interface HotReloadStatus {
  running: boolean;          // Aktivně watcher polluje?
  intervalMs: number;        // Interval pollingu
  trackedRulesCount: number; // Počet pravidel v hash cache
  lastReloadAt: number | null; // Časové razítko posledního úspěšného reloadu
  reloadCount: number;       // Celkem úspěšných reloadů
  failureCount: number;      // Celkem neúspěšných pokusů o reload
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

## Kompletní příklad: YAML-řízené cenové pravidla

Cenový systém, kde byznys uživatelé upravují YAML soubory a engine automaticky zachytí změny:

```yaml
# rules/pricing/summer-sale.yaml
- id: summer-discount
  name: Letní výprodej sleva 20%
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
  name: Letní doprava zdarma
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

  // Sledovat změny YAML
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

// Odběr cenových událostí
engine.subscribe('discount.applied', (event) => {
  console.log(`Sleva aplikována: ${event.data.discount * 100}% na objednávku ${event.data.orderId}`);
});

// Engine nyní monitoruje ./rules/pricing/ každých 5 sekund.
// Upravte summer-sale.yaml a změňte slevu z 0.2 na 0.3 —
// watcher detekuje změnu, validuje nová pravidla
// a atomicky je aplikuje.

// Kontrola stavu
setInterval(() => {
  const status = engine.getHotReloadStatus();
  if (status.reloadCount > 0) {
    console.log(`Poslední reload: ${new Date(status.lastReloadAt!).toISOString()}`);
    console.log(`Sledovaných pravidel: ${status.trackedRulesCount}`);
  }
}, 30000);

// Elegantní vypnutí zastaví watcher
// await engine.stop();
```

Když byznys uživatel upraví `summer-sale.yaml`, watcher:
1. Detekuje změnu hashe při příštím polling cyklu
2. Validuje obě pravidla v souboru
3. Atomicky aktualizuje změněné pravidlo(a) v enginu
4. Aktualizuje hash cache

Žádný restart. Žádná API volání. Stačí upravit a uložit.

## Hot reload vs persistence

Hot reload a persistence pravidel se doplňují, nekonkurují si:

| Aspekt | Persistence | Hot reload |
|--------|-------------|------------|
| **Směr** | Stav enginu -> úložiště | Externí zdroje -> engine |
| **Kdy** | Při změnách pravidel + vypnutí | V intervalu pollingu |
| **Účel** | Přežití restartu | Aktualizace z externích zdrojů |
| **Zdroj pravdy** | Vnitřní stav enginu | YAML soubory nebo storage |

Typické produkční nastavení používá obě:
- **Persistence** zajišťuje, že pravidla přežijí restarty
- **Hot reload** zachycuje změny z YAML souborů nebo deployment pipeline

Když jsou obě aktivní a hot reload aktualizuje pravidlo, změna je zachycena běžným mechanismem persistence (debounced save) a automaticky persistována.

## Cvičení

Vybudujte hot-reloadovatelný notifikační systém:

1. Vytvořte adresář `rules/notifications/` s YAML souborem obsahujícím dvě pravidla:
   - Pravidlo, které emituje `alert.email` při přijetí `system.error` se `severity >= 3`
   - Pravidlo, které emituje `alert.slack` při přijetí `system.error` se `severity >= 5`
2. Spusťte engine s hot reloadem sledujícím tento adresář
3. Přihlaste se k odběru obou alert topiců a logujte přijaté události
4. Popište, co se stane, když upravíte YAML a změníte práh severity z 5 na 4

<details>
<summary>Řešení</summary>

Nejprve YAML soubor (`rules/notifications/alerts.yaml`):

```yaml
- id: email-alert
  name: Emailový alert při systémové chybě
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
  name: Slack alert při kritické chybě
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

Potom nastavení enginu:

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

// Odběr alertových událostí
engine.subscribe('alert.email', (event) => {
  console.log(`[EMAIL] ${event.data.service}: ${event.data.message} (severity: ${event.data.severity})`);
});

engine.subscribe('alert.slack', (event) => {
  console.log(`[SLACK] #incidents - ${event.data.service}: ${event.data.message} (severity: ${event.data.severity})`);
});

// Test: emitování chyby se severity 4
await engine.emit('system.error', {
  message: 'Pool připojení k databázi vyčerpán',
  severity: 4,
  service: 'api-gateway',
});
// Výstup: [EMAIL] api-gateway: Pool připojení k databázi vyčerpán (severity: 4)
// (Žádný Slack alert — severity 4 < práh 5)

// Nyní upravte alerts.yaml: změňte severity slack-alertu z 5 na 4
// Watcher detekuje změnu během 3 sekund, validuje a aplikuje.

// Po reloadu stejná událost také spustí Slack:
// [EMAIL] api-gateway: ... (severity: 4)
// [SLACK] #incidents - api-gateway: ... (severity: 4)

const status = engine.getHotReloadStatus();
console.log(`Reloady: ${status.reloadCount}, Selhání: ${status.failureCount}`);
```

Když se práh v YAML změní z 5 na 4:
1. Watcher vypočítá nový SHA-256 hash pro `slack-alert`
2. Hash se liší od uložené verze — pravidlo je označeno jako **změněné**
3. Validace projde (nové pravidlo je strukturálně platné)
4. Engine odregistruje starý `slack-alert` a zaregistruje nový
5. Hash cache se aktualizuje
6. Budoucí události `system.error` se severity 4 nyní spustí oba alerty

</details>

## Shrnutí

- **Hot reload** sleduje externí zdroje (YAML soubory, storage adaptéry) a aplikuje změny pravidel bez restartu enginu
- Konfigurujte přes `hotReload` v `RuleEngine.start()` s `files`, `storage` nebo obojím
- Detekce změn používá **SHA-256 hashování** — efektivní porovnání bez plného diffování objektů
- **Atomický reload** (výchozí) aplikuje všechny změny nebo žádné, což zabraňuje nekonzistentnímu stavu
- **Validace před aplikováním** (výchozí) odmítne neplatná pravidla před jejich dosažením do enginu
- Watcher používá **polling model** přes GenServer, s konfigurovatelným intervalem (výchozí: 5000ms)
- Monitorujte stav přes `getHotReloadStatus()` — sledujte počet reloadů, selhání a čas posledního reloadu
- Hot reload doplňuje persistenci: reload přináší externí změny dovnitř, persistence ukládá stav ven

---

Další: [Debugging pravidel](../08-pozorovatelnost/01-debugging.md)
