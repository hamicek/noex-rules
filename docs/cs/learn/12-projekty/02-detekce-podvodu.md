# Systém detekce podvodů

Tento projekt buduje vícevrstvou pipeline detekce podvodů. Místo monolitické kontroly podvodů v jednom bodě postavíte systém, kde nezávislé detektory běží paralelně, každý přispívá rizikovými signály do skórovacího enginu, který rozhoduje o eskalaci. Architektura odděluje **detekci** od **skórování** od **reakce**, což zjednodušuje přidávání nových detekčních vzorů bez zásahu do existující logiky.

## Co se naučíte

- Jak navrhnout vrstvenou architekturu detekce → skórování → reakce
- Detekce anomálií přihlášení s ochranou proti brute force (CEP count)
- Monitoring rychlosti transakcí (CEP aggregate)
- Detekce nemožného cestování (CEP sequence)
- Detekce anomálií otisku zařízení
- Engine skórování rizik, který akumuluje signály
- Odstupňovaná eskalace alertů s integrací externích služeb
- Použití datových požadavků pro geolokační vyhledávání IP

## Přehled architektury

```text
┌────────────────────────────────────────────────────────────────────────┐
│                    Pipeline detekce podvodů                             │
│                                                                        │
│  Vrstva 1: Detektory (paralelní, nezávislé)          Priorita: 300    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Brute Force  │ │ Rychlost     │ │ Nemožné      │ │ Nové         │ │
│  │ count()      │ │ transakcí    │ │ cestování    │ │ zařízení     │ │
│  │ 5 selhání   │ │ aggregate()  │ │ sequence()   │ │ onEvent()    │ │
│  │ za 5 min    │ │ $10K za 1h   │ │ 2 přihlášení │ │ + kontrola   │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ │
│         │                │                │                │          │
│         └────────────────┼────────────────┼────────────────┘          │
│                          ▼                ▼                            │
│  Vrstva 2: Skórování rizik                            Priorita: 200   │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Každý detektor emituje risk.signal { userId, category, score }  │  │
│  │                                                                  │  │
│  │ score-accumulator: nastaví fakt risk:userId:category = score     │  │
│  │ score-aggregate:   aggregate() risk.signal.score sum > 70 → alert│  │
│  └────────────────────────────────┬───────────────────────────────┘   │
│                                   │                                    │
│  Vrstva 3: Reakce                 │                    Priorita: 100   │
│  ┌────────────────────────────────▼───────────────────────────────┐   │
│  │ riziko < 50:  pouze log                                        │   │
│  │ riziko 50-80: označení účtu, upozornění bezpečnostního týmu    │   │
│  │ riziko > 80:  zamčení účtu, přivolání pohotovosti, blokování   │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Kompletní implementace

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event, fact,
  emit, setFact, callService, log, ref,
  sequence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  // Externí služby
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
      // Haversinova vzdálenost v km
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
      console.log(`[ZAMČENÍ] Účet ${userId} zamčen: ${reason}`);
    },
    flag: async (userId: string, reason: string) => {
      console.log(`[OZNAČENÍ] Účet ${userId} označen: ${reason}`);
    },
  };

  const engine = await RuleEngine.start({
    name: 'fraud-detection',
    services: { geoService, alertService, accountService },
  });

  // ================================================================
  // VRSTVA 1: DETEKTORY (priorita 300)
  // ================================================================

  // 1. Detekce brute force: 5+ selhání přihlášení za 5 minut
  engine.registerRule(
    Rule.create('detect-brute-force')
      .name('Brute Force Detector')
      .description('Detekce opakovaných selhání přihlášení indikujících credential stuffing')
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
      .also(log('warn', 'Brute force detekováno: ${trigger.groupKey}, ${trigger.count} pokusů'))
      .build()
  );

  // 2. Rychlost transakcí: celkové převody > $10,000 za 1 hodinu
  engine.registerRule(
    Rule.create('detect-tx-velocity')
      .name('Transaction Velocity Detector')
      .description('Detekce nárazového výskytu vysokých transakcí')
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
      .also(log('warn', 'Alert rychlosti transakcí: ${trigger.groupKey}, celkem $${trigger.value}'))
      .build()
  );

  // 3. Nemožné cestování: přihlášení ze vzdálených lokací během 1 hodiny
  engine.registerRule(
    Rule.create('detect-impossible-travel')
      .name('Impossible Travel Detector')
      .description('Detekce přihlášení z geograficky nemožných lokací')
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

  // 3b. Zpracování kontroly cestování s geo vyhledáváním
  engine.registerRule(
    Rule.create('process-travel-check')
      .name('Process Travel Distance')
      .description('Výpočet vzdálenosti mezi lokacemi přihlášení a skórování při nemožnosti')
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
      .also(log('warn', 'Nemožné cestování: ${event.userId} z ${event.country1} do ${event.country2}'))
      .build()
  );

  // 4. Detekce přihlášení z nového zařízení
  engine.registerRule(
    Rule.create('detect-new-device')
      .name('New Device Login Detector')
      .description('Detekce přihlášení z dříve neviděného zařízení')
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
      .also(log('info', 'Přihlášení z nového zařízení: ${event.userId} z ${event.deviceId}'))
      .build()
  );

  // 5. Rychlé změny účtu po přihlášení
  engine.registerRule(
    Rule.create('detect-account-takeover')
      .name('Account Takeover Pattern')
      .description('Detekce přihlášení následovaného citlivými změnami během 10 minut')
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
      .also(log('error', 'Vzor převzetí účtu: ${trigger.events.0.userId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 2: SKÓROVÁNÍ RIZIK (priorita 200)
  // ================================================================

  // 6. Akumulace rizikových signálů jako faktů
  engine.registerRule(
    Rule.create('score-accumulator')
      .name('Risk Score Accumulator')
      .description('Uložení každého rizikového signálu jako faktu pro audit trail')
      .priority(200)
      .tags('fraud', 'scoring')
      .when(onEvent('risk.signal'))
      .then(setFact('risk:${event.userId}:${event.category}', ref('event.score')))
      .also(setFact('risk:${event.userId}:lastSignal', ref('event.category')))
      .also(log('info', 'Rizikový signál: ${event.userId} +${event.score} (${event.category})'))
      .build()
  );

  // 7. Agregace rizikového skóre v časovém okně
  engine.registerRule(
    Rule.create('score-threshold-medium')
      .name('Medium Risk Threshold')
      .description('Spuštění středního alertu při převýšení rizikového skóre 50 za 1 hodinu')
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

  // 8. Vysoký práh rizika
  engine.registerRule(
    Rule.create('score-threshold-high')
      .name('High Risk Threshold')
      .description('Spuštění kritického alertu při převýšení rizikového skóre 80 za 1 hodinu')
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

  // 9. Střední závažnost: označení účtu
  engine.registerRule(
    Rule.create('response-medium')
      .name('Medium Risk Response')
      .description('Označení účtu a upozornění bezpečnostního týmu při středním riziku')
      .priority(100)
      .tags('fraud', 'response')
      .when(onEvent('fraud.alert'))
      .if(event('severity').eq('medium'))
      .then(setFact('user:${event.userId}:riskLevel', 'medium'))
      .also(callService('accountService', 'flag', [
        ref('event.userId'),
        'Rizikové skóre ${event.totalRisk}',
      ]))
      .also(callService('alertService', 'notify', [
        'fraud-alerts',
        'Střední riziko: uživatel ${event.userId}, skóre ${event.totalRisk}',
        'medium',
      ]))
      .also(log('warn', 'STŘEDNÍ RIZIKO: ${event.userId}, skóre ${event.totalRisk}'))
      .build()
  );

  // 10. Kritická závažnost: zamčení účtu
  engine.registerRule(
    Rule.create('response-critical')
      .name('Critical Risk Response')
      .description('Zamčení účtu a přivolání pohotovosti při kritickém riziku')
      .priority(100)
      .tags('fraud', 'response')
      .when(onEvent('fraud.alert'))
      .if(event('severity').eq('critical'))
      .then(setFact('user:${event.userId}:riskLevel', 'critical'))
      .also(setFact('user:${event.userId}:locked', true))
      .also(callService('accountService', 'lock', [
        ref('event.userId'),
        'Kritické rizikové skóre ${event.totalRisk}',
      ]))
      .also(callService('alertService', 'page', [
        'security-oncall',
        'KRITICKÉ: uživatel ${event.userId}, rizikové skóre ${event.totalRisk}',
      ]))
      .also(log('error', 'KRITICKÉ RIZIKO: ${event.userId}, skóre ${event.totalRisk}'))
      .build()
  );

  // 11. Audit trail pro všechny alerty podvodů
  engine.registerRule(
    Rule.create('fraud-audit')
      .name('Fraud Alert Audit Log')
      .description('Záznam všech alertů podvodů pro compliance')
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

  console.log('=== Systém detekce podvodů spuštěn ===\n');

  // Odběr událostí podvodů
  engine.subscribe('risk.*', (event) => {
    console.log(`[RIZIKO] ${event.topic}:`, event.data);
  });

  engine.subscribe('fraud.*', (event) => {
    console.log(`[PODVOD] ${event.topic}:`, event.data);
  });

  // Scénář 1: Útok brute force
  console.log('--- Scénář 1: Útok brute force ---');
  for (let i = 0; i < 6; i++) {
    await engine.emit('auth.login_failed', {
      userId: 'U-200',
      ip: '10.0.0.1',
      reason: 'invalid_password',
    });
  }

  // Scénář 2: Nové zařízení + změna emailu (převzetí účtu)
  console.log('\n--- Scénář 2: Vzor převzetí účtu ---');
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

  // Kontrola akumulovaného rizika
  console.log('\n=== Hodnocení rizik ===');
  console.log('Skóre brute force:', engine.getFact('risk:U-200:brute_force'));
  console.log('Skóre nového zařízení:', engine.getFact('risk:U-200:new_device'));
  console.log('Skóre převzetí:', engine.getFact('risk:U-200:account_takeover'));
  console.log('Úroveň rizika:', engine.getFact('user:U-200:riskLevel'));
  console.log('Zamčen:', engine.getFact('user:U-200:locked'));

  await engine.stop();
  console.log('\nEngine zastaven.');
}

main();
```

## Detailní rozbor

### Vrstva detekce

Každý detektor běží nezávisle a produkuje standardizované eventy `risk.signal`:

```typescript
emit('risk.signal', {
  userId: '...',
  category: 'brute_force',   // Unikátní kategorie pro každý detektor
  score: 30,                  // Váha rizika
  details: { ... },           // Kontext specifické pro detektor
})
```

Tento kontrakt znamená, že detektory o sobě navzájem nevědí. Přidání nového detektoru je jedno pravidlo emitující `risk.signal` — žádné změny ve skórovacích nebo reakčních pravidlech.

| Detektor | CEP vzor | Skóre | Co zachycuje |
|----------|----------|-------|-------------|
| Brute force | `count()` 5 za 5m | 30 | Credential stuffing, hádání hesel |
| Rychlost transakcí | `aggregate()` sum > $10K/1h | 40 | Praní špinavých peněz, rychlé použití ukradené karty |
| Nemožné cestování | `sequence()` 2 přihlášení/1h | 50 | Kompromitované pověření použité ze vzdálené lokace |
| Nové zařízení | `onEvent()` + kontrola faktů | 15 | První přihlášení z neznámého zařízení |
| Převzetí účtu | `sequence()` přihlášení + změna emailu/10m | 60 | Útočník mění obnovovací email po kompromitaci |

### Vrstva skórování

Vrstva skórování používá dva mechanismy:

1. **Akumulace faktů**: Každý signál je uložen jako `risk:userId:category = score`. To poskytuje dotazovatelný snímek aktivních rizikových faktorů na uživatele.

2. **Temporální agregace**: Vzor `aggregate()` sumarizuje skóre rizikových signálů na uživatele v 1hodinovém okně. Dvě prahová pravidla se spouštějí na různých úrovních:

```text
  eventy risk.signal (na uživatele, 1 hodinové okno)
       │
       ├──── součet >= 50  ──→ fraud.alert { severity: 'medium' }
       └──── součet >= 80  ──→ fraud.alert { severity: 'critical' }
```

Oba prahy se mohou spustit pro stejného uživatele — střední alert se spustí první, a pokud dorazí více signálů tlačících celkový součet nad 80, následuje kritický alert.

### Vrstva reakce

Reakce jsou odstupňované podle závažnosti:

| Závažnost | Akce |
|-----------|------|
| Střední (50-80) | Označení účtu, upozornění kanálu `#fraud-alerts` |
| Kritická (> 80) | Zamčení účtu, přivolání pohotovostního týmu, nastavení faktu zamčení |

Reakční pravidla volají externí služby (`accountService.lock`, `alertService.page`) pro integraci s reálnou infrastrukturou. Fakt `user:ID:locked` může být kontrolován jinými systémy (API gateway, přihlašovací služba) pro blokování přístupu.

### Příklad toku dat

Takto se signály akumulují pro jednoho uživatele během útoku:

```text
  Čas    Událost                  Detektor              Skóre  Celkem
  ─────  ─────────────────────    ──────────────────    ─────  ──────
  0:00   5x login_failed          brute_force           +30     30
  0:02   přihlášení z nov. zaříz. new_device            +15     45
  0:03   změna emailu             account_takeover      +60    105
                                                                 │
                                  střední práh (50)    ◄────────┤ spuštěn
                                  kritický práh (80)   ◄────────┘ spuštěn
                                                                  │
                                  response-medium ◄───────────────┤
                                  response-critical ◄─────────────┘
```

## Cvičení

Rozšiřte systém o dva nové detektory:

1. **Více selhalých transakcí**: Pokud má uživatel 3+ selhalých transakcí (`transaction.failed`) za 30 minut, emitujte rizikový signál se skóre 35 a kategorií `tx_failures`.

2. **Aktivita v noci**: Pokud event přihlášení dorazí mezi 2:00 a 5:00 ráno (místní čas uživatele), emitujte rizikový signál se skóre 20 a kategorií `unusual_hours`. Použijte běžné event-triggered pravidlo s podmínkou kontrolující pole `hour` z dat eventu.

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// 1. Více selhalých transakcí (CEP count)
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
    .also(log('warn', 'Selhání transakcí: ${trigger.groupKey}, ${trigger.count} za 30m'))
    .build()
);

// 2. Aktivita v noci (event-triggered s podmínkou)
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
    .also(log('info', 'Přihlášení v neobvyklou hodinu: ${event.userId} v ${event.hour}:00'))
    .build()
);
```

Oba detektory následují stejný vzor: detekce anomálie, emitování `risk.signal` se standardizovanou strukturou. Existující skórovací a reakční pravidla je zpracují automaticky — žádné změny nejsou potřeba v navazujících vrstvách.

</details>

## Shrnutí

- Oddělujte detekci podvodů do **tří vrstev**: detekce (co se stalo), skórování (jak vážné to je), reakce (co dělat)
- Každý detektor je **nezávislé pravidlo** emitující standardizovaný event `risk.signal`
- Používejte `count()` pro frekvenčně založené anomálie (brute force, selhalé transakce)
- Používejte `aggregate()` pro objemové anomálie (rychlost transakcí)
- Používejte `sequence()` pro behaviorální vzory (nemožné cestování, převzetí účtu)
- Vrstva skórování používá **temporální agregaci** pro sečtení rizikových skóre na uživatele v časovém okně
- **Odstupňované reakce** (střední vs kritické) umožňují proporcionální reakci
- Externí služby (`accountService`, `alertService`) se integrují s reálnou infrastrukturou
- Fakta (`risk:userId:category`, `user:userId:locked`) poskytují **audit trail** a stav **řízení přístupu**
- Přidání nového detektoru vyžaduje **jedno nové pravidlo** — skórovací a reakční pravidla se nemění
- Topic eventu `risk.signal` je kontrakt, který odděluje detekci od reakce

---

Další: [IoT monitoring pipeline](./03-iot-monitoring.md)
