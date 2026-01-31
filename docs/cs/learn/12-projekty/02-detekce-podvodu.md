# System detekce podvodu

Tento projekt buduje vicevrstvou pipeline detekce podvodu. Misto monoliticke kontroly podvodu v jednom bode postavite system, kde nezavisle detektory bezi paralelne, kazdy prispiva rizikovymi signaly do skorovaciho enginu, ktery rozhoduje o eskalaci. Architektura oddeluje **detekci** od **skorovani** od **reakce**, coz zjednodusuje pridavani novych detecnich vzoru bez zasahu do existujici logiky.

## Co se naucite

- Jak navrhnout vrstvenou architekturu detekce → skorovani → reakce
- Detekce anomalii prihlaseni s ochranou proti brute force (CEP count)
- Monitoring rychlosti transakci (CEP aggregate)
- Detekce nemozneho cestovani (CEP sequence)
- Detekce anomalii otisku zarizeni
- Engine skorovani rizik, ktery akumuluje signaly
- Odstupnovana eskalace alertu s integraci externich sluzeb
- Pouziti datovych pozadavku pro geolokacni vyhledavani IP

## Prehled architektury

```text
┌────────────────────────────────────────────────────────────────────────┐
│                    Pipeline detekce podvodu                             │
│                                                                        │
│  Vrstva 1: Detektory (paralelni, nezavisle)          Priorita: 300    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Brute Force  │ │ Rychlost     │ │ Nemozne      │ │ Nove         │ │
│  │ count()      │ │ transakci    │ │ cestovani    │ │ zarizeni     │ │
│  │ 5 selhani   │ │ aggregate()  │ │ sequence()   │ │ onEvent()    │ │
│  │ za 5 min    │ │ $10K za 1h   │ │ 2 prihlaseni │ │ + kontrola   │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ │
│         │                │                │                │          │
│         └────────────────┼────────────────┼────────────────┘          │
│                          ▼                ▼                            │
│  Vrstva 2: Skorovani rizik                            Priorita: 200   │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Kazdy detektor emituje risk.signal { userId, category, score }  │  │
│  │                                                                  │  │
│  │ score-accumulator: nastavi fakt risk:userId:category = score     │  │
│  │ score-aggregate:   aggregate() risk.signal.score sum > 70 → alert│  │
│  └────────────────────────────────┬───────────────────────────────┘   │
│                                   │                                    │
│  Vrstva 3: Reakce                 │                    Priorita: 100   │
│  ┌────────────────────────────────▼───────────────────────────────┐   │
│  │ riziko < 50:  pouze log                                        │   │
│  │ riziko 50-80: oznaceni uctu, upozorneni bezpecnostniho tymu    │   │
│  │ riziko > 80:  zamceni uctu, privolani pohotovosti, blokovani   │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Kompletni implementace

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event, fact,
  emit, setFact, callService, log, ref,
  sequence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  // Externi sluzby
  const geoService = {
    locate: async (ip: string) => {
      // V produkci: MaxMind, ip-api atd.
      const locations: Record<string, { lat: number; lon: number; country: string }> = {
        '192.168.1.1': { lat: 50.08, lon: 14.43, country: 'CZ' },
        '10.0.0.1': { lat: 40.71, lon: -74.01, country: 'US' },
        '172.16.0.1': { lat: 35.68, lon: 139.69, country: 'JP' },
      };
      return locations[ip] ?? { lat: 0, lon: 0, country: 'UNKNOWN' };
    },
    distance: async (lat1: number, lon1: number, lat2: number, lon2: number) => {
      // Haversinova vzdalenost v km
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },
  };

  const alertService = {
    notify: async (channel: string, message: string, severity: string) => {
      console.log(`[ALERT:${severity}] #${channel}: ${message}`);
    },
    page: async (team: string, message: string) => {
      console.log(`[PAGE] @${team}: ${message}`);
    },
  };

  const accountService = {
    lock: async (userId: string, reason: string) => {
      console.log(`[ZAMCENI] Ucet ${userId} zamcen: ${reason}`);
    },
    flag: async (userId: string, reason: string) => {
      console.log(`[OZNACENI] Ucet ${userId} oznacen: ${reason}`);
    },
  };

  const engine = await RuleEngine.start({
    name: 'fraud-detection',
    services: { geoService, alertService, accountService },
  });

  // ================================================================
  // VRSTVA 1: DETEKTORY (priorita 300)
  // ================================================================

  // 1. Detekce brute force: 5+ selhanich prihlaseni za 5 minut
  engine.registerRule(
    Rule.create('detect-brute-force')
      .name('Brute Force Detector')
      .description('Detekce opakovanych selhani prihlaseni indikujicich credential stuffing')
      .priority(300)
      .tags('fraud', 'detector', 'login')
      .when(count()
        .event('auth.login_failed')
        .threshold(5)
        .window('5m')
        .groupBy('userId')
        .sliding()
      )
      .then(emit('risk.signal', {
        userId: ref('trigger.groupKey'),
        category: 'brute_force',
        score: 30,
        details: {
          attempts: ref('trigger.count'),
          window: '5m',
        },
      }))
      .also(log('warn', 'Brute force detekovano: ${trigger.groupKey}, ${trigger.count} pokusu'))
      .build()
  );

  // 2. Rychlost transakci: celkove prevody > $10,000 za 1 hodinu
  engine.registerRule(
    Rule.create('detect-tx-velocity')
      .name('Transaction Velocity Detector')
      .description('Detekce narazoveho vyskeho vysokych transakci')
      .priority(300)
      .tags('fraud', 'detector', 'transaction')
      .when(aggregate()
        .event('transaction.completed')
        .field('amount')
        .function('sum')
        .threshold(10000)
        .window('1h')
        .groupBy('userId')
      )
      .then(emit('risk.signal', {
        userId: ref('trigger.groupKey'),
        category: 'tx_velocity',
        score: 40,
        details: {
          totalAmount: ref('trigger.value'),
          window: '1h',
        },
      }))
      .also(log('warn', 'Alert rychlosti transakci: ${trigger.groupKey}, celkem $${trigger.value}'))
      .build()
  );

  // 3. Nemozne cestovani: prihlaseni ze vzdalenych lokaci behem 1 hodiny
  engine.registerRule(
    Rule.create('detect-impossible-travel')
      .name('Impossible Travel Detector')
      .description('Detekce prihlaseni z geograficky nemoznych lokaci')
      .priority(300)
      .tags('fraud', 'detector', 'geo')
      .when(sequence()
        .event('auth.login_success')
        .event('auth.login_success')
        .within('1h')
        .groupBy('userId')
      )
      .then(emit('fraud.travel_check', {
        userId: ref('trigger.events.0.userId'),
        ip1: ref('trigger.events.0.ip'),
        ip2: ref('trigger.events.1.ip'),
        country1: ref('trigger.events.0.country'),
        country2: ref('trigger.events.1.country'),
      }))
      .build()
  );

  // 3b. Zpracovani kontroly cestovani s geo vyhledavanim
  engine.registerRule(
    Rule.create('process-travel-check')
      .name('Process Travel Distance')
      .description('Vypocet vzdalenosti mezi lokacemi prihlaseni a skorovani pri nemoznosti')
      .priority(290)
      .tags('fraud', 'detector', 'geo')
      .when(onEvent('fraud.travel_check'))
      .if(event('country1').neq(ref('event.country2')))
      .then(emit('risk.signal', {
        userId: ref('event.userId'),
        category: 'impossible_travel',
        score: 50,
        details: {
          from: ref('event.country1'),
          to: ref('event.country2'),
        },
      }))
      .also(log('warn', 'Nemozne cestovani: ${event.userId} z ${event.country1} do ${event.country2}'))
      .build()
  );

  // 4. Detekce prihlaseni z noveho zarizeni
  engine.registerRule(
    Rule.create('detect-new-device')
      .name('New Device Login Detector')
      .description('Detekce prihlaseni z drive nevideneho zarizeni')
      .priority(300)
      .tags('fraud', 'detector', 'device')
      .when(onEvent('auth.login_success'))
      .if(event('newDevice').eq(true))
      .then(emit('risk.signal', {
        userId: ref('event.userId'),
        category: 'new_device',
        score: 15,
        details: {
          deviceId: ref('event.deviceId'),
          ip: ref('event.ip'),
        },
      }))
      .also(setFact('user:${event.userId}:lastDevice', ref('event.deviceId')))
      .also(log('info', 'Prihlaseni z noveho zarizeni: ${event.userId} z ${event.deviceId}'))
      .build()
  );

  // 5. Rychle zmeny uctu po prihlaseni
  engine.registerRule(
    Rule.create('detect-account-takeover')
      .name('Account Takeover Pattern')
      .description('Detekce prihlaseni nasledovaneho citlivymi zmenami behem 10 minut')
      .priority(300)
      .tags('fraud', 'detector', 'takeover')
      .when(sequence()
        .event('auth.login_success', { newDevice: true })
        .event('account.email_changed')
        .within('10m')
        .groupBy('userId')
      )
      .then(emit('risk.signal', {
        userId: ref('trigger.events.0.userId'),
        category: 'account_takeover',
        score: 60,
        details: {
          deviceId: ref('trigger.events.0.deviceId'),
          newEmail: ref('trigger.events.1.newEmail'),
        },
      }))
      .also(log('error', 'Vzor prevzeti uctu: ${trigger.events.0.userId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 2: SKOROVANI RIZIK (priorita 200)
  // ================================================================

  // 6. Akumulace rizikovych signalu jako faktu
  engine.registerRule(
    Rule.create('score-accumulator')
      .name('Risk Score Accumulator')
      .description('Ulozeni kazdeho rizikoveho signalu jako faktu pro audit trail')
      .priority(200)
      .tags('fraud', 'scoring')
      .when(onEvent('risk.signal'))
      .then(setFact('risk:${event.userId}:${event.category}', ref('event.score')))
      .also(setFact('risk:${event.userId}:lastSignal', ref('event.category')))
      .also(log('info', 'Rizikovy signal: ${event.userId} +${event.score} (${event.category})'))
      .build()
  );

  // 7. Agregace rizikoveho skore v casovem okne
  engine.registerRule(
    Rule.create('score-threshold-medium')
      .name('Medium Risk Threshold')
      .description('Spusteni stredniho alertu pri previseni rizikoveho skore 50 za 1 hodinu')
      .priority(200)
      .tags('fraud', 'scoring')
      .when(aggregate()
        .event('risk.signal')
        .field('score')
        .function('sum')
        .threshold(50)
        .window('1h')
        .groupBy('userId')
      )
      .then(emit('fraud.alert', {
        userId: ref('trigger.groupKey'),
        totalRisk: ref('trigger.value'),
        severity: 'medium',
      }))
      .build()
  );

  // 8. Vysoky prah rizika
  engine.registerRule(
    Rule.create('score-threshold-high')
      .name('High Risk Threshold')
      .description('Spusteni kritickeho alertu pri previseni rizikoveho skore 80 za 1 hodinu')
      .priority(200)
      .tags('fraud', 'scoring')
      .when(aggregate()
        .event('risk.signal')
        .field('score')
        .function('sum')
        .threshold(80)
        .window('1h')
        .groupBy('userId')
      )
      .then(emit('fraud.alert', {
        userId: ref('trigger.groupKey'),
        totalRisk: ref('trigger.value'),
        severity: 'critical',
      }))
      .build()
  );

  // ================================================================
  // VRSTVA 3: REAKCE (priorita 100)
  // ================================================================

  // 9. Stredni zavaznost: oznaceni uctu
  engine.registerRule(
    Rule.create('response-medium')
      .name('Medium Risk Response')
      .description('Oznaceni uctu a upozorneni bezpecnostniho tymu pri strednim riziku')
      .priority(100)
      .tags('fraud', 'response')
      .when(onEvent('fraud.alert'))
      .if(event('severity').eq('medium'))
      .then(setFact('user:${event.userId}:riskLevel', 'medium'))
      .also(callService('accountService', 'flag', [
        ref('event.userId'),
        'Rizikove skore ${event.totalRisk}',
      ]))
      .also(callService('alertService', 'notify', [
        'fraud-alerts',
        'Stredni riziko: uzivatel ${event.userId}, skore ${event.totalRisk}',
        'medium',
      ]))
      .also(log('warn', 'STREDNI RIZIKO: ${event.userId}, skore ${event.totalRisk}'))
      .build()
  );

  // 10. Kriticka zavaznost: zamceni uctu
  engine.registerRule(
    Rule.create('response-critical')
      .name('Critical Risk Response')
      .description('Zamceni uctu a privolani pohotovosti pri kritickem riziku')
      .priority(100)
      .tags('fraud', 'response')
      .when(onEvent('fraud.alert'))
      .if(event('severity').eq('critical'))
      .then(setFact('user:${event.userId}:riskLevel', 'critical'))
      .also(setFact('user:${event.userId}:locked', true))
      .also(callService('accountService', 'lock', [
        ref('event.userId'),
        'Kriticke rizikove skore ${event.totalRisk}',
      ]))
      .also(callService('alertService', 'page', [
        'security-oncall',
        'KRITICKE: uzivatel ${event.userId}, rizikove skore ${event.totalRisk}',
      ]))
      .also(log('error', 'KRITICKE RIZIKO: ${event.userId}, skore ${event.totalRisk}'))
      .build()
  );

  // 11. Audit trail pro vsechny alerty podvodu
  engine.registerRule(
    Rule.create('fraud-audit')
      .name('Fraud Alert Audit Log')
      .description('Zaznam vsech alertu podvodu pro compliance')
      .priority(50)
      .tags('fraud', 'audit')
      .when(onEvent('fraud.alert'))
      .then(setFact('audit:fraud:${event.userId}:${Date.now()}', {
        severity: ref('event.severity'),
        totalRisk: ref('event.totalRisk'),
        timestamp: '${Date.now()}',
      }))
      .build()
  );

  // ================================================================
  // SIMULACE
  // ================================================================

  console.log('=== System detekce podvodu spusten ===\n');

  // Odber udalosti podvodu
  engine.subscribe('risk.*', (event) => {
    console.log(`[RIZIKO] ${event.topic}:`, event.data);
  });

  engine.subscribe('fraud.*', (event) => {
    console.log(`[PODVOD] ${event.topic}:`, event.data);
  });

  // Scenar 1: Utok brute force
  console.log('--- Scenar 1: Utok brute force ---');
  for (let i = 0; i < 6; i++) {
    await engine.emit('auth.login_failed', {
      userId: 'U-200',
      ip: '10.0.0.1',
      reason: 'invalid_password',
    });
  }

  // Scenar 2: Nove zarizeni + zmena emailu (prevzeti uctu)
  console.log('\n--- Scenar 2: Vzor prevzeti uctu ---');
  await engine.emit('auth.login_success', {
    userId: 'U-200',
    ip: '172.16.0.1',
    country: 'JP',
    deviceId: 'DEV-NEW-1',
    newDevice: true,
  });

  await engine.emit('account.email_changed', {
    userId: 'U-200',
    oldEmail: 'user@example.com',
    newEmail: 'attacker@evil.com',
  });

  // Kontrola akumulovaneho rizika
  console.log('\n=== Hodnoceni rizik ===');
  console.log('Skore brute force:', engine.getFact('risk:U-200:brute_force'));
  console.log('Skore noveho zarizeni:', engine.getFact('risk:U-200:new_device'));
  console.log('Skore prevzeti:', engine.getFact('risk:U-200:account_takeover'));
  console.log('Uroven rizika:', engine.getFact('user:U-200:riskLevel'));
  console.log('Zamcen:', engine.getFact('user:U-200:locked'));

  await engine.stop();
  console.log('\nEngine zastaven.');
}

main();
```

## Detailni rozbor

### Vrstva detekce

Kazdy detektor bezi nezavisle a produkuje standardizovane eventy `risk.signal`:

```typescript
emit('risk.signal', {
  userId: '...',
  category: 'brute_force',   // Unikatni kategorie pro kazdy detektor
  score: 30,                  // Vaha rizika
  details: { ... },           // Kontext specificke pro detektor
})
```

Tento kontrakt znamena, ze detektory o sobe navzajem nevedi. Pridani noveho detektoru je jedno pravidlo emitujici `risk.signal` — zadne zmeny ve skorovacich nebo reakcnich pravidlech.

| Detektor | CEP vzor | Skore | Co zachycuje |
|----------|----------|-------|-------------|
| Brute force | `count()` 5 za 5m | 30 | Credential stuffing, hadani hesel |
| Rychlost transakci | `aggregate()` sum > $10K/1h | 40 | Prani spinavych penez, rychle pouziti ukradene karty |
| Nemozne cestovani | `sequence()` 2 prihlaseni/1h | 50 | Kompromitovane povereni pouzite ze vzdalene lokace |
| Nove zarizeni | `onEvent()` + kontrola faktu | 15 | Prvni prihlaseni z neznameho zarizeni |
| Prevzeti uctu | `sequence()` prihlaseni + zmena emailu/10m | 60 | Utocnik meni obnovovaci email po kompromitaci |

### Vrstva skorovani

Vrstva skorovani pouziva dva mechanismy:

1. **Akumulace faktu**: Kazdy signal je ulozen jako `risk:userId:category = score`. To poskytuje dotazovatelny snimek aktivnich rizikovych faktoru na uzivatele.

2. **Temporalni agregace**: Vzor `aggregate()` sumarizuje skore rizikovych signalu na uzivatele v 1hodinovem okne. Dve prahova pravidla se spousteji na ruznych urovnich:

```text
  eventy risk.signal (na uzivatele, 1 hodinove okno)
       │
       ├──── soucet >= 50  ──→ fraud.alert { severity: 'medium' }
       └──── soucet >= 80  ──→ fraud.alert { severity: 'critical' }
```

Oba prahy se mohou spustit pro stejneho uzivatele — stredni alert se spusti prvni, a pokud dorazsi vice signalu tlacicich celkovy soucet nad 80, nasleduje kriticky alert.

### Vrstva reakce

Reakce jsou odstupnovane podle zavaznosti:

| Zavaznost | Akce |
|-----------|------|
| Stredni (50-80) | Oznaceni uctu, upozorneni kanalu `#fraud-alerts` |
| Kriticka (> 80) | Zamceni uctu, privolani pohotovostniho tymu, nastaveni faktu zamceni |

Reakcni pravidla volaji externi sluzby (`accountService.lock`, `alertService.page`) pro integraci s realnou infrastrukturou. Fakt `user:ID:locked` muze byt kontrolovan jinymi systemy (API gateway, prihlasovaci sluzba) pro blokovani pristupu.

### Priklad toku dat

Takto se signaly akumuluji pro jednoho uzivatele behem utoku:

```text
  Cas    Udalost                  Detektor              Skore  Celkem
  ─────  ─────────────────────    ──────────────────    ─────  ──────
  0:00   5x login_failed          brute_force           +30     30
  0:02   prihlaseni z nov. zariz. new_device            +15     45
  0:03   zmena emailu             account_takeover      +60    105
                                                                 │
                                  stredni prah (50)    ◄────────┤ spusten
                                  kriticky prah (80)   ◄────────┘ spusten
                                                                  │
                                  response-medium ◄───────────────┤
                                  response-critical ◄─────────────┘
```

## Cviceni

Rozsirte system o dva nove detektory:

1. **Vice selhalych transakci**: Pokud ma uzivatel 3+ selhalych transakci (`transaction.failed`) za 30 minut, emitujte rizikovy signal se skore 35 a kategorii `tx_failures`.

2. **Aktivita v noci**: Pokud event prihlaseni dorazi mezi 2:00 a 5:00 rano (mistni cas uzivatele), emitujte rizikovy signal se skore 20 a kategorii `unusual_hours`. Pouzijte bezne event-triggered pravidlo s podminkou kontrolujici pole `hour` z dat eventu.

<details>
<summary>Reseni</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// 1. Vice selhalych transakci (CEP count)
engine.registerRule(
  Rule.create('detect-tx-failures')
    .name('Transaction Failure Detector')
    .priority(300)
    .tags('fraud', 'detector', 'transaction')
    .when(count()
      .event('transaction.failed')
      .threshold(3)
      .window('30m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('risk.signal', {
      userId: ref('trigger.groupKey'),
      category: 'tx_failures',
      score: 35,
      details: {
        failedCount: ref('trigger.count'),
        window: '30m',
      },
    }))
    .also(log('warn', 'Selhani transakci: ${trigger.groupKey}, ${trigger.count} za 30m'))
    .build()
);

// 2. Aktivita v noci (event-triggered s podminkou)
engine.registerRule(
  Rule.create('detect-unusual-hours')
    .name('Unusual Hours Detector')
    .priority(300)
    .tags('fraud', 'detector', 'behavior')
    .when(onEvent('auth.login_success'))
    .if(event('hour').gte(2))
    .and(event('hour').lt(5))
    .then(emit('risk.signal', {
      userId: ref('event.userId'),
      category: 'unusual_hours',
      score: 20,
      details: {
        hour: ref('event.hour'),
        ip: ref('event.ip'),
      },
    }))
    .also(log('info', 'Prihlaseni v neobvyklou hodinu: ${event.userId} v ${event.hour}:00'))
    .build()
);
```

Oba detektory nasleduji stejny vzor: detekce anomalie, emitovani `risk.signal` se standardizovanou strukturou. Existujici skorovaci a reakcni pravidla je zpracuji automaticky — zadne zmeny nejsou potreba v navazujicich vrstvach.

</details>

## Shrnuti

- Oddelujte detekci podvodu do **tri vrstev**: detekce (co se stalo), skorovani (jak vazne to je), reakce (co delat)
- Kazdy detektor je **nezavisle pravidlo** emitujici standardizovany event `risk.signal`
- Pouzivejte `count()` pro frekvencne zalozene anomalie (brute force, selhale transakce)
- Pouzivejte `aggregate()` pro objemove anomalie (rychlost transakci)
- Pouzivejte `sequence()` pro behavioralni vzory (nemozne cestovani, prevzeti uctu)
- Vrstva skorovani pouziva **temporalni agregaci** pro secteni rizikovych skore na uzivatele v casovem okne
- **Odstupnovane reakce** (stredni vs kriticke) umoznuji proporcionalni reakci
- Externi sluzby (`accountService`, `alertService`) se integrujici s realnou infrastrukturou
- Fakta (`risk:userId:category`, `user:userId:locked`) poskytuji **audit trail** a stav **rizeni pristupu**
- Pridani noveho detektoru vyzaduje **jedno nove pravidlo** — skorovaci a reakcni pravidla se nemeni
- Topic eventu `risk.signal` je kontrakt, ktery oddeluje detekci od reakce

---

Dalsi: [IoT monitoring pipeline](./03-iot-monitoring.md)
