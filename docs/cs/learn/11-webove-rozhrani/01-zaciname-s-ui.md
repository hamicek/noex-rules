# Zaciname s webovym rozhranim

Webove rozhrani noex-rules je dashboard postaveny na Reactu, ktery se pripojuje k bezicimu serveru pravidloveho enginu a poskytuje graficke rozhrani pro vse, co jste dosud delali pres kod, REST a CLI. Komunikuje pres GraphQL pro datove dotazy a mutace a pres Server-Sent Events pro real-time streaming. Tato kapitola pokryva instalaci, integraci se serverem a pruchod vsemi strankami UI.

## Co se naucite

- Jak nainstalovat a zaregistrovat UI plugin s Fastify
- Rozlozeni dashboardu: bocni navigace, zdravi enginu, statisticke karty
- Jak funguje kazda stranka: pravidla, skupiny, fakta, eventy, casovace, audit, nastaveni
- Real-time streaming eventu s filtrovanim patternu, pause/resume a testovacim emitovanim
- Prepinani motivu (svetly/tmavy) a predvolby zobrazeni
- Klavesove zkratky pro navigaci celym UI bez mysi

## Instalace weboveho rozhrani

Webove rozhrani je distribuovano jako samostatny balicek:

```bash
npm install @hamicek/noex-rules-ui @fastify/static
```

`@fastify/static` je peer zavislost potrebna pro servovani sestavenych frontend assetu.

## Registrace UI pluginu

UI se integruje do stejneho Fastify serveru, ktery spousti REST a GraphQL API. Zaregistrujte ho po spusteni serveru:

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

| Moznost | Typ | Vychozi | Popis |
|---------|-----|---------|-------|
| `basePath` | `string` | `'/ui'` | URL prefix, kde je UI servovano |

Plugin registruje `@fastify/static` pro servovani predsestaveneho React bundlu a nastavuje SPA fallback, takze vsechny routy pod `basePath` vraci `index.html` — client-side router se stara o navigaci.

## Architektura

```
Prohlizec (React aplikace)
    |
    |--- GraphQL (/graphql) ---> Fastify Server ---> RuleEngine
    |--- SSE (/stream/events) -> Fastify Server ---> RuleEngine
    |--- REST (/api/v1/*)  ----> Fastify Server ---> RuleEngine
    |
    |--- Staticke assety (/ui) -> @fastify/static
```

UI pouziva `graphql-request` pro API volani, TanStack React Query pro klientsky caching a synchronizaci a browserove API `EventSource` pro SSE. URL serveru je konfigurovatelna ze stranky Nastaveni a ulozena v `localStorage`.

## Dashboard

Po otevreni UI (napr. `http://localhost:7226/ui`) se zobrazí stranka **Dashboard**, ktera ukazuje:

### Zdravi enginu

Stavova karta zobrazujici:
- Nazev enginu (`noex-rules`)
- Stav zdravi: `ok`, `degraded` nebo `error` s barevnym indikatorem
- Verzi serveru
- Uptime

Health endpoint je dotazovan kazdych 5 sekund.

### Statisticke karty

Sest metricnych karet zobrazujicich real-time pocitadla enginu:

| Metrika | Popis |
|---------|-------|
| Rules | Celkovy pocet registrovanych pravidel |
| Facts | Celkovy pocet faktu v ulozisti |
| Active Timers | Aktualne bezici casovace |
| Events Processed | Kumulativni pocet emitovanych eventu |
| Rules Executed | Kumulativni pocet spustenych pravidel |
| Avg Latency | Prumerna doba zpracovani pravidla (ms) |

Statistiky jsou dotazovany kazdych 5 sekund.

## Bocni navigace

Bocni panel poskytuje pristup ke vsem strankam s klavesovymi zkratkami zobrazenymi u kazde polozky:

| Stranka | Zkratka | Popis |
|---------|---------|-------|
| Dashboard | `g d` | Prehled zdravi a statistik enginu |
| Rules | `g r` | Seznam pravidel s hledanim, filtrem, vytvarenim, povolenim/zakazanim |
| Groups | `g g` | Sprava skupin pravidel (vytvoreni, povoleni/zakazani, zobrazeni pravidel) |
| Facts | `g f` | Prohlizec faktu se zobrazenim a upravou klice/hodnoty |
| Events | `g e` | Real-time stream eventu s filtrovanim a testovacim emitovanim |
| Timers | `g t` | Seznam aktivnich casovcu s vytvarenim a rusenim |
| Audit Log | `g a` | Prohlizec audit zaznamu s filtry kategorie/typu/zdroje |
| Settings | `g s` | URL serveru, motiv, zobrazeni, notifikace |

Dalsi zkratky:
- `b` — Prepnuti sbaleni/rozbaleni bocniho panelu
- `?` — Zobrazeni dialogu s klavesovymi zkratkami

Bocni panel je sbalitelny na desktopu a vysouva se jako overlay na mobilech.

## Stranka Rules

Stranka Rules (`/rules`) zobrazuje vsechna registrovana pravidla v razitelne, prohledavatelne tabulce:

- **Hledani** — Filtrovani podle ID, nazvu, tagu nebo skupiny
- **Stavove indikatory** — Odznak povoleno/zakazano, priorita, verze, prirazeni skupiny
- **Akce** — Povoleni, zakazani, smazani ze zobrazeni seznamu
- **Vytvoreni** — Zkratka `g n` nebo tlacitko "New Rule" naviguje na formular pro vytvoreni pravidla

Kliknutim na pravidlo se otevre stranka **Rule Detail** (`/rules/:ruleId`) se ctyrmi zalozkami: Form, YAML, Flow a History (pokryto v dalsi kapitole).

## Stranka Groups

Stranka Groups (`/groups`) spravuje skupiny pravidel:

- Vytvareni skupin s nazvem a popisem
- Povoleni/zakazani skupin (prepnuti skupiny ovlivni vsechna jeji pravidla)
- Zobrazeni pravidel prirazenych ke kazde skupine
- Mazani skupin

## Stranka Facts

Stranka Facts (`/facts`) poskytuje prohlizec uloziste faktu:

- Vypis vsech faktu s klicem, hodnotou, casovym razitkem, zdrojem a verzi
- Editace na miste — kliknete na hodnotu faktu pro jeji upravu
- Vytvareni novych faktu s formularem klic/hodnota
- Mazani faktu
- Vyhledavani podle patternu klice

## Stranka Events

Stranka Events (`/events`) kombinuje real-time SSE stream s testovacim emitovanim:

### Stream eventu

```
+------------------------------------------------------------------+
| Filtr eventu...   | Patterns: [*           ] | ● Live | 42 events |
+------------------------------------------------------------------+
|   | Topic              | Source    | Correlation | Timestamp      |
|---|--------------------|-----------|-------------|----------------|
| ▶ | order.created      | api       | txn-abc     | 14:32:01.234   |
| ▶ | alert.high-value   | rule:...  | txn-abc     | 14:32:01.256   |
| ▶ | payment.completed  | api       | txn-abc     | 14:33:15.012   |
+------------------------------------------------------------------+
```

- **Filtrovani patternu** — Vzory oddelene carkami (napr. `order.*, payment.*`). UI otevre SSE pripojeni na `/stream/events?patterns=...`
- **Pause/Resume** — Pozastaveni streamu pro prozkoumani eventu; pri obnoveni se buffered eventy sliji zpet
- **Clear** — Reset seznamu eventu
- **Rozbaleni** — Kliknutim na radek zobrazite uplna data eventu (ID, causation ID, JSON payload)
- **Vyhledavani** — Klientsky filtr napric topicem, zdrojem, correlation ID a daty

### Testovaci emitovani eventu

Tlacitko "Emit Event" otevre inline formular:

```
+------------------------------------------------------------------+
| Emit Test Event                                                   |
| Topic: [order.created        ] Data (JSON): [{"orderId":"o-1"}]  |
| [Emit] [Cancel]                                                   |
+------------------------------------------------------------------+
```

Eventy emitovane timto formularem jdou pres `POST /api/v1/events` a spousteji pravidla jako jakekoliv jine eventy — reakce pravidel muzete sledovat v realnem case ve streamu vyse.

## Stranka Timers

Stranka Timers (`/timers`) ukazuje vsechny aktivni casovace:

- Nazev, cas expirace, `onExpire` topic a data, konfigurace opakovani
- Vytvareni novych casovcu s nazvem, trvanim a `onExpire` nastavenim
- Ruseni jednotlivych casovcu
- Casovace jsou dotazovany kazdych 10 sekund

## Stranka Audit Log

Stranka Audit (`/audit`) poskytuje filtrovatelny pohled na vsechny audit zaznamy:

- **Filtr kategorie** — `rule_management`, `rule_execution`, `fact_change`, `event_emitted`, `system`
- **Filtr typu** — `rule_registered`, `rule_executed`, `fact_updated` atd.
- **Filtr zdroje** — Filtrovani podle zdrojove komponenty
- **Casovy rozsah** — Zaznamy razene podle casoveho razitka, nejnovejsi prvni
- **Rozbaleni detailu** — Kliknutim na zaznam zobrazite uplne JSON detaily, trvani a correlation ID

Audit data jsou dotazovana kazdych 15 sekund.

## Stranka Settings

Stranka Settings (`/settings`) ovlada predvolby UI ulozene v `localStorage`:

### Pripojeni k serveru

Konfigurace URL API endpointu. UI zobrazuje stav pripojeni (`connected`, `connecting`, `disconnected`) s barevnym indikatorem. Po pripojeni se objevi odkaz na Swagger API dokumentaci.

URL serveru se vychozi hodnoty nastavi na aktualni origin (`window.location.origin`) nebo promennou prostredi `VITE_SERVER_URL` pri vyvoji.

### Motiv

Prepinani mezi svetlym a tmavym rezimem. UI respektuje `prefers-color-scheme` ve vychozim stavu a uklada prepis do `localStorage` pod klicem `noex-rules-theme`.

### Predvolby zobrazeni

- **Vychozi pohled na detail pravidla** — Vyberte, ktera zalozka se otevre jako prvni: Form, YAML nebo Flow
- **Polozek na stranku** — 10, 25, 50 nebo 100 polozek v seznamovych zobrazenich

### Notifikace

Prepnuti toast notifikaci pro eventy pravidloveho enginu (spousteni pravidel, zmeny faktu, chyby).

### Reset

Tlacitko "Reset to defaults" obnovi vsechna nastaveni na puvodni hodnoty.

## Vyvojovy rezim

Pro vyvoj UI bezi frontend na samostatnem Vite dev serveru s hot module replacement:

```bash
cd ui
npm install
npm run dev
```

Toto spusti Vite dev server na portu 7227 s proxy pravidly, ktera preposou API volani na backend:

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

Moznost `ws: true` na GraphQL proxy umoznuje preposani WebSocketu pro GraphQL subscriptions.

## Kompletni priklad: monitorovany pravidlovy engine

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';
import {
  onEvent, onFact, emit, setFact, deleteFact, setTimer, log,
  event, fact,
} from '@hamicek/noex-rules/dsl';

// Spusteni serveru se vsemi integracemi
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
    .name('Sledovani objednavky')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(log('info', 'Objednavka ${event.orderId} vytvorena'))
    .build()
);

engine.registerRule(
  Rule.create('high-value-alert')
    .name('Upozorneni na vysokou hodnotu')
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
    .name('Zruseni expirovane objednavky')
    .when(onEvent('order.payment-expired'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .also(emit('notification.order-cancelled', {
      orderId: '${event.orderId}',
    }))
    .build()
);

// Registrace weboveho rozhrani
await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Pravidlovy engine: ${server.address}/api/v1`);
console.log(`Swagger docs:      ${server.address}/documentation`);
console.log(`GraphQL:           ${server.address}/graphql`);
console.log(`Webove rozhrani:   ${server.address}/ui`);
```

Otevrete `http://localhost:7226/ui` v prohlizeci. Prejdete na stranku Events, emitujte event `order.created` s `{ "orderId": "o-1", "total": 750 }` a sledujte, jak se aktualizuji statistiky na Dashboardu, ve streamu eventu se objevi emitovane i odvozene eventy a na strance Facts se projevi novy fakt `order:o-1:status`.

## Cviceni

1. Spustte server pravidloveho enginu na portu 7226 s webovym rozhranim registrovanym na `/ui`
2. Zaregistrujte pravidlo, ktere nastavi `sensor:{sensorId}:status` na `"warning"`, kdyz event `sensor.reading` ma `temperature > 60`
3. Otevrete Dashboard weboveho rozhrani a overte, ze engine ukazuje stav `ok` s 1 pravidlem
4. Prejdete na stranku Events a emitujte `{ "topic": "sensor.reading", "data": { "sensorId": "s-1", "temperature": 72 } }` pomoci testovacim emitovace
5. Prejdete na stranku Facts a potvrdite, ze `sensor:s-1:status` je `"warning"`
6. Prejdete na stranku Rules, najdete sve pravidlo a zakazte ho pres UI
7. Emitujte dalsi sensor reading event a overte, ze se nevytvori zadny novy fakt

<details>
<summary>Reseni</summary>

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
    .name('Varovani teploty')
    .when(onEvent('sensor.reading'))
    .if(event('temperature').gt(60))
    .then(setFact('sensor:${event.sensorId}:status', 'warning'))
    .build()
);

await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Webove rozhrani: ${server.address}/ui`);
```

Kroky v prohlizeci:

1. Otevrete `http://localhost:7226/ui` — Dashboard ukazuje stav `ok`, 1 pravidlo
2. Stisknete `g e` pro navigaci na Events
3. Kliknete na "Emit Event", nastavte topic na `sensor.reading`, data na `{"sensorId": "s-1", "temperature": 72}`, kliknete na Emit
4. Stisknete `g f` pro navigaci na Facts — `sensor:s-1:status` ukazuje `"warning"`
5. Stisknete `g r` pro navigaci na Rules — kliknete na tlacitko zakazani u "Varovani teploty"
6. Stisknete `g e`, emitujte dalsi event s `temperature: 80`
7. Stisknete `g f` — zadny novy fakt nevznikl (pravidlo je zakazane)

</details>

## Shrnuti

- Nainstalujte `@hamicek/noex-rules-ui` a `@fastify/static`, pak zavolejte `registerUI(fastify, { basePath })` pro servovani weboveho rozhrani
- UI komunikuje pres GraphQL pro datove operace a SSE pro real-time streaming eventu
- Dashboard zobrazuje zdravi enginu (dotazovano kazdych 5s) a sest statistickych karet (pravidla, fakta, casovace, eventy, spusteni, latence)
- Bocni panel poskytuje navigaci na vsechny stranky: Dashboard, Rules, Groups, Facts, Events, Timers, Audit Log, Settings
- Stranka Events kombinuje real-time SSE stream (s filtrovanim patternu a pause/resume) s testovacim emitovanim eventu
- Stranka Facts podporuje prohlizeni, editaci na miste, vytvareni a mazani faktu
- Nastaveni se ukladaji do `localStorage`: URL serveru, motiv (svetly/tmavy/systemovy), vychozi pohled na pravidla, velikost stranky, notifikace
- Klavesove zkratky pouzivaji Vim-styl s prefixem `g` pro navigaci (`g d` Dashboard, `g r` Rules, `g n` New Rule atd.)
- Pro vyvoj Vite dev server na portu 7227 proxyuje GraphQL (s WebSocketem), REST a SSE na backend na portu 7226

---

Dalsi: [Vizualni tvorba pravidel](./02-vizualni-tvorba-pravidel.md)
