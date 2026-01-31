# CEP vzory v praxi

Naucili jste se ctyri jednotlive typy CEP vzoru. Realne systemy je zridka pouzivaji izolovane — kombinuji vice vzoru, michaji CEP s bezpymi pravidly a vrsti detakcni stupne pro stavbu kompletnich monitorovacich pipeline. Tato kapitola vam ukaze, jak skladat vzory pro produkcni scenare.

## Co se naucite

- Jak kombinovat CEP vzory s bezpymi pravidly pro udalosti a fakta
- Jak stavet vicestupnove detakcni pipeline
- Kompletni priklad IoT monitorovacich pipeline
- Vykonnostni aspekty temporalnich vzoru
- Strategie debuggovani pro CEP pravidla

## Kombinovani CEP s bezpymi pravidly

CEP pravidla produkcji udalosti stejne jako kazde jine pravidlo. To znamena, ze muzete retezit vystup CEP do bezpych pravidel spoustenych udalostmi, pravidel spoustenych fakty, nebo dokonce do dalsich CEP vzoru:

```text
  CEP pravidlo               Bezne pravidlo              CEP pravidlo
  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
  │ count()      │──emituje→ │ onEvent()    │──nastavi→ │ aggregate()  │
  │ 5 selhani    │  "alert"  │ obohatuje    │  fakt     │ prah rizika  │
  │ za 5 min     │           │ kontextem    │           │              │
  └──────────────┘           └──────────────┘           └──────────────┘
```

### Vzor: CEP → obohaceni → akce

Bezny vzor je pouzit CEP pravidlo pro detekci stavu, pak bezne pravidlo pro obohaceni detekce dalsim kontextem pred provedenim akce:

```typescript
import {
  Rule, onEvent, event, fact,
  emit, setFact, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// Stupen 1: CEP detekuje brute force
engine.registerRule(
  Rule.create('detect-brute-force')
    .priority(200)
    .tags('security', 'detection')
    .when(count()
      .event('auth.login_failed')
      .threshold(5)
      .window('5m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('security.brute_force_detected', {
      userId: ref('trigger.groupKey'),
      attempts: ref('trigger.count'),
    }))
    .build()
);

// Stupen 2: Bezne pravidlo obohatuje kontextem uzivatele
engine.registerRule(
  Rule.create('enrich-brute-force')
    .priority(150)
    .tags('security', 'enrichment')
    .when(onEvent('security.brute_force_detected'))
    .then(setFact('security:${event.userId}:threat', 'brute_force'))
    .also(emit('security.threat_assessed', {
      userId: ref('event.userId'),
      threat: 'brute_force',
      attempts: ref('event.attempts'),
    }))
    .build()
);

// Stupen 3: Bezne pravidlo provede akci na zaklade obohenych dat
engine.registerRule(
  Rule.create('lock-account')
    .priority(100)
    .tags('security', 'response')
    .when(onEvent('security.threat_assessed'))
    .if(event('threat').eq('brute_force'))
    .then(setFact('user:${event.userId}:locked', true))
    .also(log('warn', 'Ucet zamcen: ${event.userId}'))
    .build()
);
```

### Vzor: CEP + podminky na faktech

CEP pravidla mohou mit dalsi podminky kontrolujici fakta, coz vam dava kontextove vedomij pattern matching:

```typescript
// Alertovat na brute force pouze pro ne-admin uzivatele
engine.registerRule(
  Rule.create('brute-force-non-admin')
    .priority(200)
    .when(count()
      .event('auth.login_failed')
      .threshold(5)
      .window('5m')
      .groupBy('userId')
      .sliding()
    )
    .if(fact('user:${trigger.groupKey}:role').neq('admin'))
    .then(emit('security.alert', { userId: ref('trigger.groupKey') }))
    .build()
);
```

CEP vzor se spousti na frekvenci, ale akce se provede pouze pokud fakt role uzivatele neni `admin`.

## Vicestupnova detakcni pipeline

Komplexni bezpecnostni nebo monitorovaci systemy pouzivaji vice CEP vzoru v pipeline. Kazdy stupen detekuje jiny aspekt a predava do dalsiho:

```text
  ┌───────────────────────────────────────────────────────┐
  │            Vicestupnova detekce podvodu                │
  │                                                       │
  │  Stupen 1: Detekce vzoru                              │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
  │  │ count()     │  │ aggregate() │  │ sequence()  │  │
  │  │ Neuspecna   │  │ Vysokohodnotne│ │ Neobvykly   │  │
  │  │ prihlaseni  │  │ prevody     │  │ tok         │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
  │         │                │                │          │
  │  Stupen 2: Skorovani rizika                          │
  │         ▼                ▼                ▼          │
  │  ┌────────────────────────────────────────────────┐  │
  │  │ Kazda detekce nastavi fakt skore rizika        │  │
  │  │ risk:userId:login = 30                          │  │
  │  │ risk:userId:transfer = 50                       │  │
  │  │ risk:userId:flow = 20                           │  │
  │  └─────────────────────┬──────────────────────────┘  │
  │                        │                              │
  │  Stupen 3: Agregace                                  │
  │                        ▼                              │
  │  ┌────────────────────────────────────────────────┐  │
  │  │ aggregate() nad udalostmi skore rizika         │  │
  │  │ Soucet skore rizika > 70 za 1 hodinu → ALERT  │  │
  │  └────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────┘
```

```typescript
// Stupen 1a: Frekvence neuspecnych prihlaseni
engine.registerRule(
  Rule.create('risk-failed-logins')
    .priority(200)
    .tags('fraud', 'stage-1')
    .when(count()
      .event('auth.login_failed')
      .threshold(3)
      .window('10m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'login',
      score: 30,
    }))
    .build()
);

// Stupen 1b: Vysokohodnotne prevody
engine.registerRule(
  Rule.create('risk-high-transfers')
    .priority(200)
    .tags('fraud', 'stage-1')
    .when(aggregate()
      .event('transfer.completed')
      .field('amount')
      .function('sum')
      .threshold(20000)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'transfer',
      score: 50,
    }))
    .build()
);

// Stupen 1c: Neobvykla sekvence prihlaseni → prevod
engine.registerRule(
  Rule.create('risk-unusual-flow')
    .priority(200)
    .tags('fraud', 'stage-1')
    .when(sequence()
      .event('auth.login', { newDevice: true })
      .event('transfer.completed')
      .within('30m')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.events.0.userId'),
      category: 'flow',
      score: 40,
    }))
    .build()
);

// Stupen 2: Akumulace skore rizika
engine.registerRule(
  Rule.create('accumulate-risk')
    .priority(150)
    .tags('fraud', 'stage-2')
    .when(onEvent('risk.score_added'))
    .then(setFact(
      'risk:${event.userId}:${event.category}',
      ref('event.score'),
    ))
    .build()
);

// Stupen 3: Agregace skore rizika
engine.registerRule(
  Rule.create('risk-threshold')
    .priority(100)
    .tags('fraud', 'stage-3')
    .when(aggregate()
      .event('risk.score_added')
      .field('score')
      .function('sum')
      .threshold(70)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('fraud.alert', {
      userId: ref('trigger.groupKey'),
      totalRisk: ref('trigger.value'),
    }))
    .also(log('error', 'FRAUD ALERT: uzivatel ${trigger.groupKey}, skore rizika ${trigger.value}'))
    .build()
);
```

## Kompletni priklad: IoT monitorovaci pipeline

Komplexni IoT monitorovaci system vyuzivajici vsechny ctyri typy CEP vzoru:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event, fact,
  emit, setFact, log, ref,
  sequence, absence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  const engine = await RuleEngine.start({ name: 'iot-monitor' });

  // ================================================================
  // STUPEN 1: Detekce vzoru jednotlivych senzoru
  // ================================================================

  // 1a. Teplotni skok: prumerna teplota > 80°C za 5 minut
  engine.registerRule(
    Rule.create('temp-spike')
      .name('Temperature Spike')
      .priority(200)
      .tags('iot', 'temperature')
      .when(aggregate()
        .event('sensor.temperature')
        .field('value')
        .function('avg')
        .threshold(80)
        .window('5m')
        .groupBy('sensorId')
      )
      .then(emit('alert.temp_high', {
        sensorId: ref('trigger.groupKey'),
        avgTemp: ref('trigger.value'),
      }))
      .also(setFact('sensor:${trigger.groupKey}:status', 'warning'))
      .build()
  );

  // 1b. Monitoring heartbeatu: zadny odecet za 2 minuty
  engine.registerRule(
    Rule.create('sensor-offline')
      .name('Sensor Offline Detection')
      .priority(200)
      .tags('iot', 'health')
      .when(absence()
        .after('sensor.heartbeat')
        .expected('sensor.heartbeat')
        .within('2m')
        .groupBy('sensorId')
      )
      .then(emit('alert.sensor_offline', {
        sensorId: ref('trigger.after.sensorId'),
      }))
      .also(setFact('sensor:${trigger.after.sensorId}:status', 'offline'))
      .build()
  );

  // 1c. Rychla fluktuace: 10+ odectu za 1 minutu (porucha senzoru)
  engine.registerRule(
    Rule.create('rapid-fluctuation')
      .name('Rapid Sensor Fluctuation')
      .priority(150)
      .tags('iot', 'diagnostics')
      .when(count()
        .event('sensor.temperature', { anomaly: true })
        .threshold(10)
        .window('1m')
        .groupBy('sensorId')
        .sliding()
      )
      .then(emit('alert.sensor_malfunction', {
        sensorId: ref('trigger.groupKey'),
        readingCount: ref('trigger.count'),
      }))
      .also(setFact('sensor:${trigger.groupKey}:status', 'malfunction'))
      .build()
  );

  // 1d. Kaskada selhani: teplotni skok → tlakovy skok → alert vibraci
  engine.registerRule(
    Rule.create('failure-cascade')
      .name('Multi-Sensor Failure Cascade')
      .priority(250)
      .tags('iot', 'critical')
      .when(sequence()
        .event('alert.temp_high')
        .event('alert.pressure_high')
        .event('alert.vibration_high')
        .within('10m')
        .groupBy('zoneId')
      )
      .then(emit('alert.critical_failure', {
        zoneId: ref('trigger.events.0.zoneId'),
      }))
      .also(setFact('zone:${trigger.events.0.zoneId}:status', 'critical'))
      .also(log('error', 'KRITICKE: Kaskada selhani v zone ${trigger.events.0.zoneId}'))
      .build()
  );

  // ================================================================
  // STUPEN 2: Smerovani a eskalace alertu
  // ================================================================

  // Eskalace kritickych selhani
  engine.registerRule(
    Rule.create('escalate-critical')
      .name('Escalate Critical Alerts')
      .priority(300)
      .tags('iot', 'escalation')
      .when(onEvent('alert.critical_failure'))
      .then(emit('notification.page_oncall', {
        zoneId: ref('event.zoneId'),
        severity: 'critical',
        message: 'Detekovana kaskada selhani v zone ${event.zoneId}',
      }))
      .build()
  );

  // Logovani vsech alertu
  engine.registerRule(
    Rule.create('log-alerts')
      .name('Alert Logger')
      .priority(10)
      .tags('iot', 'logging')
      .when(onEvent('alert.*'))
      .then(log('warn', 'IOT ALERT: ${event.topic}'))
      .build()
  );

  // ================================================================
  // STUPEN 3: Sprava stavu dashboardu
  // ================================================================

  // Sledovani zdravi zon ve faktech
  engine.registerRule(
    Rule.create('zone-health')
      .name('Zone Health Tracker')
      .when(onEvent('alert.*'))
      .if(event('zoneId').exists())
      .then(setFact('zone:${event.zoneId}:lastAlert', ref('event.topic')))
      .build()
  );

  // --- Simulace dat senzoru ---
  const sensors = ['S-1', 'S-2', 'S-3'];

  for (const sensorId of sensors) {
    // Normalní heartbeat
    await engine.emit('sensor.heartbeat', { sensorId });

    // Odecet teploty
    await engine.emit('sensor.temperature', {
      sensorId,
      zoneId: 'ZONE-A',
      value: 85, // nad prahem
    });
  }

  console.log('S-1 status:', engine.getFact('sensor:S-1:status'));
  // "warning" (detekovan teplotni skok)

  await engine.stop();
}

main();
```

### Poznamky k architekture

Tato pipeline demonstruje nekolik dulezitych vzoru:

1. **Vrstvena detekce**: Stupen 1 detekuje jednotlive vzory, stupen 2 smeruje a eskaluje, stupen 3 spravuje stav pro dashboardy.

2. **Event topicy jako kontrakty**: Kazdy stupen komunikuje pres zname event topicy (`alert.temp_high`, `alert.critical_failure`, `notification.page_oncall`). Nova pravidla se mohou prihlasit ke kteremukoli stupni.

3. **Fakta jako sdileny stav**: Fakta statusu senzoru a zon vytvareji dotazovatelny pohled na zdravi systemu, ktery mohou dashboardy a API cist.

4. **Razeni podle priority**: Kriticke vzory (detekce kaskad, priorita 250) se vyhodnocuji pred nize prioritnimi vzory (logovani, priorita 10).

## Vykonnostni aspekty

### Velikost EventStore

EventStore drzi nedavne udalosti v pameti pro dotazy poctu a agregace. Konfigurujte retenci na zaklade vaseho nejdelsiho casoveho okna:

```typescript
const engine = await RuleEngine.start({
  name: 'production',
  events: {
    maxEvents: 50000,   // Max udalosti v pameti
    maxAgeMs: 86400000, // 24 hodin
  },
});
```

Pokud je vase nejdelsi CEP okno 1 hodina, nepotrebujete 24 hodin retence. Snizte `maxAgeMs` pro uvolneni pameti.

### Kardinalita groupBy

Kazda unikatni hodnota `groupBy` vytvori samostatnou instanci vzoru. Pole s vysokou kardinalitou (jako `requestId` nebo `sessionId`) mohou vytvorit tisice instanci:

```typescript
// Dobre: ohranicena kardinalita
count().event('api.error').groupBy('endpoint')     // ~50 endpointu
aggregate().event('order.paid').groupBy('region')  // ~10 regionu

// Opatrne: potencialne vysoka kardinalita
count().event('api.error').groupBy('userId')       // ~100K uzivatelu
aggregate().event('tx.completed').groupBy('txId')  // neohranicene!
```

Pro pole s vysokou kardinalitou preferujte klouzava okna (ktera se uklidi po kazdem vyhodnoceni) a udrzujte casova okna kratka.

### Velikost okna vs pamet

Vetsi okna vyzaduji ukladani vice udalosti:

| Okno | Rychlost udalosti | Dopad na pamet |
|------|--------------------|--------------------|
| 1 minuta | 100/s | ~6 000 udalosti |
| 5 minut | 100/s | ~30 000 udalosti |
| 1 hodina | 100/s | ~360 000 udalosti |
| 24 hodin | 100/s | ~8,6M udalosti |

Pouzijte nejkratsi okno, ktere splnuje vas business pozadavek. Pokud potrebujete dlouha okna s vysokym tokem udalosti, zvazste pred-agregaci v kratsich intervalech.

### Pocet vzoru

Kazdy registrovany CEP vzor pridava rezie zpracovani na udalost. Engine vyhodnocuje kazdou prichozi udalost vuci vsem aktivnim vzorum. Pro systemy se stovkami CEP pravidel zvazte:

- Pouzivani filtru udalosti pro zuzeni matchovani
- Organizaci pravidel s tagy a skupinami pro selektivni povoleni
- Pred-filtrovani udalosti pred dosazenem do enginu

## Debuggovani CEP pravidel

### Bezne problemy

**Vzor se nikdy nespusti**:
1. Zkontrolujte, ze event topic presne odpovida (vcetne wildcardu)
2. Overte, ze pole `groupBy` existuje v datech udalosti
3. Overte, ze casove okno je dostatecne dlouhe pro vase testovaci data
4. Pro pocet/agregaci: zkontrolujte, ze bylo emitovano dostatek udalosti
5. Pro sekvenci: overte, ze udalosti prichazeji ve spravnem poradi
6. Pro absenci: pockejte na celou dobu timeoutu

**Vzor se spousti prilis casto**:
1. Zkontrolujte `groupBy` — chybejici `groupBy` zachazi se vsemi udalostmi jako s jednou skupinou
2. Overte, ze filtry jsou dostatecne restriktivni
3. Pro klouzavy pocet: kazda udalost znovu vyhodnocuje, muze se spustit pri kazde udalosti nad prahem

**Vzor se spousti s nespravnymi daty**:
1. Zkontrolujte cesty `ref()` odpovidajici typu triggeru (napr. `trigger.events.0` pro sekvenci, `trigger.after` pro absenci, `trigger.groupKey` pro pocet/agregaci)
2. Overte, ze nazvy poli v datech udalosti odpovidaji ocekavani vzoru

### Inspekce aktivnich instanci

TemporalProcessor vystavuje svuj stav pro debuggovani:

```typescript
// Ziskat vsechny aktivni instance vzoru
const instances = engine.temporalProcessor.getActiveInstances();
console.log('Aktivnich instanci:', instances.length);

for (const inst of instances) {
  console.log(`  ${inst.id}: ${inst.pattern.type} [${inst.state}]`);
  console.log(`    Pravidlo: ${inst.ruleId}`);
  console.log(`    Skupina: ${inst.groupKey}`);
  console.log(`    Expiruje: ${new Date(inst.expiresAt).toISOString()}`);
}

// Ziskat instance pro konkretni pravidlo
const ruleInstances = engine.temporalProcessor.getInstancesForRule('brute-force');
```

### Trasovani udalosti skrze vzory

Povolte trasovani pro zobrazeni toku udalosti CEP matchery:

```typescript
engine.on('temporal.match', (match) => {
  console.log('Vzor matchnul:', {
    ruleId: match.ruleId,
    pattern: match.pattern.type,
    groupKey: match.groupKey,
    matchedEvents: match.matchedEvents.length,
    aggregateValue: match.aggregateValue,
    count: match.count,
  });
});
```

## Cviceni

Navrhněte kompletni system detekce e-commerce podvodu s vyuzitim vice CEP vzoru. System by mel detekovat:

1. **Rychle objednavky**: Vice nez 3 objednavky od stejneho uzivatele za 10 minut (podezrela automatizace)
2. **Skok vysokych hodnot**: Celkova castka objednavek prekracuje $5 000 pro uzivatele za 1 hodinu
3. **Nove zarizeni + velky nakup**: Uzivatel se prihlasi z noveho zarizeni, pak zada objednavku nad $500, behem 30 minut
4. **Agregace rizika**: Kdyz kombinovane skore rizika (z vyse uvedenych detekci) prekroci 60 pro uzivatele za 1 hodinu, emitujte fraud alert

<details>
<summary>Reseni</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  sequence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

// 1. Rychle objednavky (pocet)
engine.registerRule(
  Rule.create('rapid-orders')
    .priority(200)
    .tags('fraud', 'detection')
    .when(count()
      .event('order.created')
      .threshold(3)
      .window('10m')
      .groupBy('userId')
      .sliding()
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'rapid_orders',
      score: 25,
    }))
    .also(log('warn', 'Rychle objednavky detekovany: ${trigger.groupKey}'))
    .build()
);

// 2. Skok vysokych hodnot (agregace)
engine.registerRule(
  Rule.create('high-value-spike')
    .priority(200)
    .tags('fraud', 'detection')
    .when(aggregate()
      .event('order.created')
      .field('total')
      .function('sum')
      .threshold(5000)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.groupKey'),
      category: 'high_value',
      score: 35,
    }))
    .also(log('warn', 'Skok vysokych hodnot: ${trigger.groupKey} = $${trigger.value}'))
    .build()
);

// 3. Nove zarizeni + velky nakup (sekvence)
engine.registerRule(
  Rule.create('new-device-purchase')
    .priority(200)
    .tags('fraud', 'detection')
    .when(sequence()
      .event('auth.login', { newDevice: true })
      .event('order.created', { total: { $gte: 500 } })
      .within('30m')
      .groupBy('userId')
    )
    .then(emit('risk.score_added', {
      userId: ref('trigger.events.0.userId'),
      category: 'new_device',
      score: 40,
    }))
    .also(log('warn', 'Nakup z noveho zarizeni: ${trigger.events.0.userId}'))
    .build()
);

// 4. Agregace rizika (agregace nad skore rizika)
engine.registerRule(
  Rule.create('fraud-alert')
    .priority(100)
    .tags('fraud', 'response')
    .when(aggregate()
      .event('risk.score_added')
      .field('score')
      .function('sum')
      .threshold(60)
      .window('1h')
      .groupBy('userId')
    )
    .then(emit('fraud.alert', {
      userId: ref('trigger.groupKey'),
      totalRisk: ref('trigger.value'),
    }))
    .also(setFact('user:${trigger.groupKey}:fraudAlert', true))
    .also(log('error', 'FRAUD ALERT: ${trigger.groupKey}, riziko = ${trigger.value}'))
    .build()
);

// Odezva: zamceni uctu pri fraud alertu
engine.registerRule(
  Rule.create('fraud-lockout')
    .priority(50)
    .tags('fraud', 'response')
    .when(onEvent('fraud.alert'))
    .then(setFact('user:${event.userId}:locked', true))
    .also(log('error', 'Ucet zamcen kvuli podvodu: ${event.userId}'))
    .build()
);
```

System pracuje ve vrstvach: tri detakcni pravidla (pocet, agregace, sekvence) kazde emituji udalosti `risk.score_added` s ruznymi skore. Agregacni pravidlo secte tato skore na uzivatele za 1 hodinu. Kdyz celkem prekroci 60, spusti se fraud alert a pravidlo odezvy zamkne ucet.

Tato architektura je rozsiritelna — pridani noveho detakcniho vzoru vyzaduje pouze pridani noveho pravidla, ktere emituje `risk.score_added`. Zadna existujici pravidla se nemusi menit.

</details>

## Shrnuti

- CEP vzory produkcji udalosti, ktere mohou bezna pravidla konzumovat, coz umoznuje **vicestupnove pipeline**
- Vzor **CEP → obohaceni → akce** oddeluje detekci od odezvy
- **Podminky na faktech** u CEP pravidel pridavaji kontextove vedomy matching
- Vrstvete vzory do **stupnu**: detekce → skorovani → agregace → odezva
- Konfigurujte retenci **EventStore** na zaklade vaseho nejdelsiho casoveho okna
- Sledujte **kardinalitu groupBy** — pole s vysokou kardinalitou vytvareji mnoho instanci
- Pouzijte **kratka okna** a **filtry udalosti** pro minimalizaci pameti a CPU rezie
- Debuggujte pomoci `getActiveInstances()` a `temporal.match` event listeneru
- Bezne problemy: chybejici `groupBy`, spatne cesty `ref()`, nedostatecne casove okno

---

Dalsi: [Skupiny a tagy pravidel](../06-organizace/01-skupiny-a-tagy.md)
