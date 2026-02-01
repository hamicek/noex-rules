# Začínáme s webovým rozhraním

Webové rozhraní noex-rules je dashboard postavený na Reactu, který se připojuje k běžícímu serveru pravidlového enginu a poskytuje grafické rozhraní pro vše, co jste dosud dělali přes kód, REST a CLI. Komunikuje přes GraphQL pro datové dotazy a mutace a přes Server-Sent Events pro real-time streaming. Tato kapitola pokrývá instalaci, integraci se serverem a průchod všemi stránkami UI.

## Co se naučíte

- Jak nainstalovat a zaregistrovat UI plugin s Fastify
- Rozložení dashboardu: boční navigace, zdraví enginu, statistické karty
- Jak funguje každá stránka: pravidla, skupiny, fakta, eventy, časovače, audit, nastavení
- Real-time streaming eventů s filtrováním patternů, pause/resume a testovacím emitováním
- Přepínání motivu (světlý/tmavý) a předvolby zobrazení
- Klávesové zkratky pro navigaci celým UI bez myši

## Instalace webového rozhraní

Webové rozhraní je distribuováno jako samostatný balíček:

```bash
npm install @hamicek/noex-rules-ui @fastify/static
```

`@fastify/static` je peer závislost potřebná pro servování sestavených frontend assetů.

## Registrace UI pluginu

UI se integruje do stejného Fastify serveru, který spouští REST a GraphQL API. Zaregistrujte ho po spuštění serveru:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

// Registrace UI pluginu — servuje React aplikaci na /ui
await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Engine API: ${server.address}/api/v1`);
console.log(`GraphQL:    ${server.address}/graphql`);
console.log(`Web UI:     ${server.address}/ui`);
```

### UIPluginOptions

| Možnost | Typ | Výchozí | Popis |
|---------|-----|---------|-------|
| `basePath` | `string` | `'/ui'` | URL prefix, kde je UI servováno |

Plugin registruje `@fastify/static` pro servování předsestavěného React bundlu a nastavuje SPA fallback, takže všechny routy pod `basePath` vrací `index.html` — client-side router se stará o navigaci.

## Architektura

```
Prohlížeč (React aplikace)
    |
    |--- GraphQL (/graphql) ---> Fastify Server ---> RuleEngine
    |--- SSE (/stream/events) -> Fastify Server ---> RuleEngine
    |--- REST (/api/v1/*)  ----> Fastify Server ---> RuleEngine
    |
    |--- Statické assety (/ui) -> @fastify/static
```

UI používá `graphql-request` pro API volání, TanStack React Query pro klientský caching a synchronizaci a browserové API `EventSource` pro SSE. URL serveru je konfigurovatelná ze stránky Nastavení a uložena v `localStorage`.

## Dashboard

Po otevření UI (např. `http://localhost:7226/ui`) se zobrazí stránka **Dashboard**, která ukazuje:

### Zdraví enginu

Stavová karta zobrazující:
- Název enginu (`noex-rules`)
- Stav zdraví: `ok`, `degraded` nebo `error` s barevným indikátorem
- Verzi serveru
- Uptime

Health endpoint je dotazován každých 5 sekund.

### Statistické karty

Šest metrických karet zobrazujících real-time počítadla enginu:

| Metrika | Popis |
|---------|-------|
| Rules | Celkový počet registrovaných pravidel |
| Facts | Celkový počet faktů v úložišti |
| Active Timers | Aktuálně běžící časovače |
| Events Processed | Kumulativní počet emitovaných eventů |
| Rules Executed | Kumulativní počet spuštěných pravidel |
| Avg Latency | Průměrná doba zpracování pravidla (ms) |

Statistiky jsou dotazovány každých 5 sekund.

## Boční navigace

Boční panel poskytuje přístup ke všem stránkám s klávesovými zkratkami zobrazenými u každé položky:

| Stránka | Zkratka | Popis |
|---------|---------|-------|
| Dashboard | `g d` | Přehled zdraví a statistik enginu |
| Rules | `g r` | Seznam pravidel s hledáním, filtrem, vytvářením, povolením/zakázáním |
| Groups | `g g` | Správa skupin pravidel (vytvoření, povolení/zakázání, zobrazení pravidel) |
| Facts | `g f` | Prohlížeč faktů se zobrazením a úpravou klíče/hodnoty |
| Events | `g e` | Real-time stream eventů s filtrováním a testovacím emitováním |
| Timers | `g t` | Seznam aktivních časovačů s vytvářením a rušením |
| Audit Log | `g a` | Prohlížeč audit záznamů s filtry kategorie/typu/zdroje |
| Settings | `g s` | URL serveru, motiv, zobrazení, notifikace |

Další zkratky:
- `b` — Přepnutí sbalení/rozbalení bočního panelu
- `?` — Zobrazení dialogu s klávesovými zkratkami

Boční panel je sbalitelný na desktopu a vysouvá se jako overlay na mobilech.

## Stránka Rules

Stránka Rules (`/rules`) zobrazuje všechna registrovaná pravidla v řaditelné, prohledávatelné tabulce:

- **Hledání** — Filtrování podle ID, názvu, tagů nebo skupiny
- **Stavové indikátory** — Odznak povoleno/zakázáno, priorita, verze, přiřazení skupiny
- **Akce** — Povolení, zakázání, smazání ze zobrazení seznamu
- **Vytvoření** — Zkratka `g n` nebo tlačítko "New Rule" naviguje na formulář pro vytvoření pravidla

Kliknutím na pravidlo se otevře stránka **Rule Detail** (`/rules/:ruleId`) se čtyřmi záložkami: Form, YAML, Flow a History (pokryto v další kapitole).

## Stránka Groups

Stránka Groups (`/groups`) spravuje skupiny pravidel:

- Vytváření skupin s názvem a popisem
- Povolení/zakázání skupin (přepnutí skupiny ovlivní všechna její pravidla)
- Zobrazení pravidel přiřazených ke každé skupině
- Mazání skupin

## Stránka Facts

Stránka Facts (`/facts`) poskytuje prohlížeč úložiště faktů:

- Výpis všech faktů s klíčem, hodnotou, časovým razítkem, zdrojem a verzí
- Editace na místě — klikněte na hodnotu faktu pro její úpravu
- Vytváření nových faktů s formulářem klíč/hodnota
- Mazání faktů
- Vyhledávání podle patternu klíče

## Stránka Events

Stránka Events (`/events`) kombinuje real-time SSE stream s testovacím emitováním:

### Stream eventů

```
+------------------------------------------------------------------+
| Filtr eventů...  | Patterns: [*           ] | ● Live | 42 events |
+------------------------------------------------------------------+
|   | Topic              | Source    | Correlation | Timestamp      |
|---|--------------------|-----------|-------------|----------------|
| ▶ | order.created      | api       | txn-abc     | 14:32:01.234   |
| ▶ | alert.high-value   | rule:...  | txn-abc     | 14:32:01.256   |
| ▶ | payment.completed  | api       | txn-abc     | 14:33:15.012   |
+------------------------------------------------------------------+
```

- **Filtrování patternů** — Vzory oddělené čárkami (např. `order.*, payment.*`). UI otevře SSE připojení na `/stream/events?patterns=...`
- **Pause/Resume** — Pozastavení streamu pro prozkoumání eventů; při obnovení se buffered eventy slijí zpět
- **Clear** — Reset seznamu eventů
- **Rozbalení** — Kliknutím na řádek zobrazíte úplná data eventu (ID, causation ID, JSON payload)
- **Vyhledávání** — Klientský filtr napříč topicem, zdrojem, correlation ID a daty

### Testovací emitování eventů

Tlačítko "Emit Event" otevře inline formulář:

```
+------------------------------------------------------------------+
| Emit Test Event                                                   |
| Topic: [order.created        ] Data (JSON): [{"orderId":"o-1"}]  |
| [Emit] [Cancel]                                                   |
+------------------------------------------------------------------+
```

Eventy emitované tímto formulářem jdou přes `POST /api/v1/events` a spouštějí pravidla jako jakékoliv jiné eventy — reakce pravidel můžete sledovat v reálném čase ve streamu výše.

## Stránka Timers

Stránka Timers (`/timers`) ukazuje všechny aktivní časovače:

- Název, čas expirace, `onExpire` topic a data, konfigurace opakování
- Vytváření nových časovačů s názvem, trváním a `onExpire` nastavením
- Rušení jednotlivých časovačů
- Časovače jsou dotazovány každých 10 sekund

## Stránka Audit Log

Stránka Audit (`/audit`) poskytuje filtrovatelný pohled na všechny audit záznamy:

- **Filtr kategorie** — `rule_management`, `rule_execution`, `fact_change`, `event_emitted`, `system`
- **Filtr typu** — `rule_registered`, `rule_executed`, `fact_updated` atd.
- **Filtr zdroje** — Filtrování podle zdrojové komponenty
- **Časový rozsah** — Záznamy řazené podle časového razítka, nejnovější první
- **Rozbalení detailu** — Kliknutím na záznam zobrazíte úplné JSON detaily, trvání a correlation ID

Audit data jsou dotazována každých 15 sekund.

## Stránka Settings

Stránka Settings (`/settings`) ovládá předvolby UI uložené v `localStorage`:

### Připojení k serveru

Konfigurace URL API endpointu. UI zobrazuje stav připojení (`connected`, `connecting`, `disconnected`) s barevným indikátorem. Po připojení se objeví odkaz na Swagger API dokumentaci.

URL serveru se výchozí hodnoty nastaví na aktuální origin (`window.location.origin`) nebo proměnnou prostředí `VITE_SERVER_URL` při vývoji.

### Motiv

Přepínání mezi světlým a tmavým režimem. UI respektuje `prefers-color-scheme` ve výchozím stavu a ukládá přepis do `localStorage` pod klíčem `noex-rules-theme`.

### Předvolby zobrazení

- **Výchozí pohled na detail pravidla** — Vyberte, která záložka se otevře jako první: Form, YAML nebo Flow
- **Položek na stránku** — 10, 25, 50 nebo 100 položek v seznamových zobrazeních

### Notifikace

Přepnutí toast notifikací pro eventy pravidlového enginu (spouštění pravidel, změny faktů, chyby).

### Reset

Tlačítko "Reset to defaults" obnoví všechna nastavení na původní hodnoty.

## Vývojový režim

Pro vývoj UI běží frontend na samostatném Vite dev serveru s hot module replacement:

```bash
cd ui
npm install
npm run dev
```

Toto spustí Vite dev server na portu 7227 s proxy pravidly, která přepošlou API volání na backend:

```typescript
// vite.config.ts
server: {
  port: 7227,
  proxy: {
    '/graphql': { target: 'http://localhost:7226', ws: true },
    '/api': 'http://localhost:7226',
    '/stream': 'http://localhost:7226',
  },
},
```

Možnost `ws: true` na GraphQL proxy umožňuje přeposílání WebSocketů pro GraphQL subscriptions.

## Kompletní příklad: monitorovaný pravidlový engine

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';
import {
  onEvent, onFact, emit, setFact, deleteFact, setTimer, log,
  event, fact,
} from '@hamicek/noex-rules/dsl';

// Spuštění serveru se všemi integracemi
const server = await RuleEngineServer.start({
  server: {
    port: 7226,
    swagger: true,
    graphql: true,
  },
  sseConfig: { heartbeatInterval: 15_000 },
  metricsConfig: { enabled: true },
});

const engine = server.getEngine();

// Registrace pravidel
engine.registerRule(
  Rule.create('track-order')
    .name('Sledování objednávky')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(log('info', 'Objednávka ${event.orderId} vytvořena'))
    .build()
);

engine.registerRule(
  Rule.create('high-value-alert')
    .name('Upozornění na vysokou hodnotu')
    .priority(10)
    .tags(['alerts', 'orders'])
    .when(onEvent('order.created'))
    .if(event('total').gte(500))
    .then(emit('alert.high-value', {
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('payment-timeout')
    .name('Timeout platby')
    .when(onEvent('order.created'))
    .then(setTimer({
      name: 'payment-deadline-${event.orderId}',
      duration: '30m',
      onExpire: {
        topic: 'order.payment-expired',
        data: { orderId: '${event.orderId}' },
      },
    }))
    .build()
);

engine.registerRule(
  Rule.create('cancel-expired')
    .name('Zrušení expirované objednávky')
    .when(onEvent('order.payment-expired'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .also(emit('notification.order-cancelled', {
      orderId: '${event.orderId}',
    }))
    .build()
);

// Registrace webového rozhraní
await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Pravidlový engine: ${server.address}/api/v1`);
console.log(`Swagger docs:      ${server.address}/documentation`);
console.log(`GraphQL:           ${server.address}/graphql`);
console.log(`Webové rozhraní:   ${server.address}/ui`);
```

Otevřete `http://localhost:7226/ui` v prohlížeči. Přejděte na stránku Events, emitujte event `order.created` s `{ "orderId": "o-1", "total": 750 }` a sledujte, jak se aktualizují statistiky na Dashboardu, ve streamu eventů se objeví emitované i odvozené eventy a na stránce Facts se projeví nový fakt `order:o-1:status`.

## Cvičení

1. Spusťte server pravidlového enginu na portu 7226 s webovým rozhraním registrovaným na `/ui`
2. Zaregistrujte pravidlo, které nastaví `sensor:{sensorId}:status` na `"warning"`, když event `sensor.reading` má `temperature > 60`
3. Otevřete Dashboard webového rozhraní a ověřte, že engine ukazuje stav `ok` s 1 pravidlem
4. Přejděte na stránku Events a emitujte `{ "topic": "sensor.reading", "data": { "sensorId": "s-1", "temperature": 72 } }` pomocí testovacího emitovače
5. Přejděte na stránku Facts a potvrďte, že `sensor:s-1:status` je `"warning"`
6. Přejděte na stránku Rules, najděte své pravidlo a zakažte ho přes UI
7. Emitujte další sensor reading event a ověřte, že se nevytvoří žádný nový fakt

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';
import { onEvent, setFact, event } from '@hamicek/noex-rules/dsl';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

const engine = server.getEngine();

engine.registerRule(
  Rule.create('temp-warning')
    .name('Varování teploty')
    .when(onEvent('sensor.reading'))
    .if(event('temperature').gt(60))
    .then(setFact('sensor:${event.sensorId}:status', 'warning'))
    .build()
);

await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Webové rozhraní: ${server.address}/ui`);
```

Kroky v prohlížeči:

1. Otevřete `http://localhost:7226/ui` — Dashboard ukazuje stav `ok`, 1 pravidlo
2. Stiskněte `g e` pro navigaci na Events
3. Klikněte na "Emit Event", nastavte topic na `sensor.reading`, data na `{"sensorId": "s-1", "temperature": 72}`, klikněte na Emit
4. Stiskněte `g f` pro navigaci na Facts — `sensor:s-1:status` ukazuje `"warning"`
5. Stiskněte `g r` pro navigaci na Rules — klikněte na tlačítko zakázání u "Varování teploty"
6. Stiskněte `g e`, emitujte další event s `temperature: 80`
7. Stiskněte `g f` — žádný nový fakt nevznikl (pravidlo je zakázané)

</details>

## Shrnutí

- Nainstalujte `@hamicek/noex-rules-ui` a `@fastify/static`, pak zavolejte `registerUI(fastify, { basePath })` pro servování webového rozhraní
- UI komunikuje přes GraphQL pro datové operace a SSE pro real-time streaming eventů
- Dashboard zobrazuje zdraví enginu (dotazováno každých 5s) a šest statistických karet (pravidla, fakta, časovače, eventy, spuštění, latence)
- Boční panel poskytuje navigaci na všechny stránky: Dashboard, Rules, Groups, Facts, Events, Timers, Audit Log, Settings
- Stránka Events kombinuje real-time SSE stream (s filtrováním patternů a pause/resume) s testovacím emitováním eventů
- Stránka Facts podporuje prohlížení, editaci na místě, vytváření a mazání faktů
- Nastavení se ukládají do `localStorage`: URL serveru, motiv (světlý/tmavý/systémový), výchozí pohled na pravidla, velikost stránky, notifikace
- Klávesové zkratky používají Vim-styl s prefixem `g` pro navigaci (`g d` Dashboard, `g r` Rules, `g n` New Rule atd.)
- Pro vývoj Vite dev server na portu 7227 proxyuje GraphQL (s WebSocketem), REST a SSE na backend na portu 7226

---

Další: [Vizuální tvorba pravidel](./02-vizualni-tvorba-pravidel.md)
