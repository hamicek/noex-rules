# CEP vzory v praxi

Naučili jste se čtyři jednotlivé typy CEP vzorů. Reálné systémy je zřídka používají izolovaně — kombinují více vzorů, míchají CEP s běžnými pravidly a vrství detekční stupně pro stavbu kompletních monitorovacích pipeline. Tato kapitola vám ukáže, jak skládat vzory pro produkční scénáře.

## Co se naučíte

- Jak kombinovat CEP vzory s běžnými pravidly pro události a fakta
- Jak stavět vícestupňové detekční pipeline
- Kompletní příklad IoT monitorovacích pipeline
- Výkonnostní aspekty temporálních vzorů
- Strategie debuggování pro CEP pravidla

## Kombinování CEP s běžnými pravidly

CEP pravidla produkují události stejně jako každé jiné pravidlo. To znamená, že můžete řetězit výstup CEP do běžných pravidel spouštěných událostmi, pravidel spouštěných fakty, nebo dokonce do dalších CEP vzorů:

```text
  CEP pravidlo               Běžné pravidlo              CEP pravidlo
  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
  │ count()      │──emituje→ │ onEvent()    │──nastaví→ │ aggregate()  │
  │ 5 selhání    │  "alert"  │ obohacuje    │  fakt     │ práh rizika  │
  │ za 5 min     │           │ kontextem    │           │              │
  └──────────────┘           └──────────────┘           └──────────────┘
```

### Vzor: CEP → obohacení → akce

Běžný vzor je použít CEP pravidlo pro detekci stavu, pak běžné pravidlo pro obohacení detekce dalším kontextem před provedením akce:

```typescript
import {
  Rule, onEvent, event, fact,
  emit, setFact, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// Stupeň 1: CEP detekuje brute force
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

// Stupeň 2: Běžné pravidlo obohacuje kontextem uživatele
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

// Stupeň 3: Běžné pravidlo provede akci na základě obohacených dat
engine.registerRule(
  Rule.create('lock-account')
    .priority(100)
    .tags('security', 'response')
    .when(onEvent('security.threat_assessed'))
    .if(event('threat').eq('brute_force'))
    .then(setFact('user:${event.userId}:locked', true))
    .also(log('warn', 'Účet zamčen: ${event.userId}'))
    .build()
);
```

### Vzor: CEP + podmínky na faktech

CEP pravidla mohou mít další podmínky kontrolující fakta, což vám dává kontextově vědomý pattern matching:

```typescript
// Alertovat na brute force pouze pro ne-admin uživatele
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

CEP vzor se spouští na frekvenci, ale akce se provede pouze pokud fakt role uživatele není `admin`.

## Vícestupňová detekční pipeline

Komplexní bezpečnostní nebo monitorovací systémy používají více CEP vzorů v pipeline. Každý stupeň detekuje jiný aspekt a předává do dalšího:

```text
  ┌───────────────────────────────────────────────────────┐
  │            Vícestupňová detekce podvodů                │
  │                                                       │
  │  Stupeň 1: Detekce vzorů                              │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
  │  │ count()     │  │ aggregate() │  │ sequence()  │  │
  │  │ Neúspěšná   │  │ Vysokohodnotné│ │ Neobvyklý   │  │
  │  │ přihlášení  │  │ převody     │  │ tok         │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
  │         │                │                │          │
  │  Stupeň 2: Skórování rizika                          │
  │         ▼                ▼                ▼          │
  │  ┌────────────────────────────────────────────────┐  │
  │  │ Každá detekce nastaví fakt skóre rizika        │  │
  │  │ risk:userId:login = 30                          │  │
  │  │ risk:userId:transfer = 50                       │  │
  │  │ risk:userId:flow = 20                           │  │
  │  └─────────────────────┬──────────────────────────┘  │
  │                        │                              │
  │  Stupeň 3: Agregace                                  │
  │                        ▼                              │
  │  ┌────────────────────────────────────────────────┐  │
  │  │ aggregate() nad událostmi skóre rizika         │  │
  │  │ Součet skóre rizika > 70 za 1 hodinu → ALERT  │  │
  │  └────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────┘
```

```typescript
// Stupeň 1a: Frekvence neúspěšných přihlášení
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

// Stupeň 1b: Vysokohodnotné převody
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

// Stupeň 1c: Neobvyklá sekvence přihlášení → převod
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

// Stupeň 2: Akumulace skóre rizika
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

// Stupeň 3: Agregace skóre rizika
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
    .also(log('error', 'FRAUD ALERT: uživatel ${trigger.groupKey}, skóre rizika ${trigger.value}'))
    .build()
);
```

## Kompletní příklad: IoT monitorovací pipeline

Komplexní IoT monitorovací systém využívající všechny čtyři typy CEP vzorů:

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
  // STUPEŇ 1: Detekce vzorů jednotlivých senzorů
  // ================================================================

  // 1a. Teplotní skok: průměrná teplota > 80°C za 5 minut
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

  // 1b. Monitoring heartbeatu: žádný odečet za 2 minuty
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

  // 1c. Rychlá fluktuace: 10+ odečtů za 1 minutu (porucha senzoru)
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

  // 1d. Kaskáda selhání: teplotní skok → tlakový skok → alert vibrací
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
      .also(log('error', 'KRITICKÉ: Kaskáda selhání v zóně ${trigger.events.0.zoneId}'))
      .build()
  );

  // ================================================================
  // STUPEŇ 2: Směrování a eskalace alertů
  // ================================================================

  // Eskalace kritických selhání
  engine.registerRule(
    Rule.create('escalate-critical')
      .name('Escalate Critical Alerts')
      .priority(300)
      .tags('iot', 'escalation')
      .when(onEvent('alert.critical_failure'))
      .then(emit('notification.page_oncall', {
        zoneId: ref('event.zoneId'),
        severity: 'critical',
        message: 'Detekována kaskáda selhání v zóně ${event.zoneId}',
      }))
      .build()
  );

  // Logování všech alertů
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
  // STUPEŇ 3: Správa stavu dashboardu
  // ================================================================

  // Sledování zdraví zón ve faktech
  engine.registerRule(
    Rule.create('zone-health')
      .name('Zone Health Tracker')
      .when(onEvent('alert.*'))
      .if(event('zoneId').exists())
      .then(setFact('zone:${event.zoneId}:lastAlert', ref('event.topic')))
      .build()
  );

  // --- Simulace dat senzorů ---
  const sensors = ['S-1', 'S-2', 'S-3'];

  for (const sensorId of sensors) {
    // Normální heartbeat
    await engine.emit('sensor.heartbeat', { sensorId });

    // Odečet teploty
    await engine.emit('sensor.temperature', {
      sensorId,
      zoneId: 'ZONE-A',
      value: 85, // nad prahem
    });
  }

  console.log('S-1 status:', engine.getFact('sensor:S-1:status'));
  // "warning" (detekován teplotní skok)

  await engine.stop();
}

main();
```

### Poznámky k architektuře

Tato pipeline demonstruje několik důležitých vzorů:

1. **Vrstvená detekce**: Stupeň 1 detekuje jednotlivé vzory, stupeň 2 směruje a eskaluje, stupeň 3 spravuje stav pro dashboardy.

2. **Event topicy jako kontrakty**: Každý stupeň komunikuje přes známé event topicy (`alert.temp_high`, `alert.critical_failure`, `notification.page_oncall`). Nová pravidla se mohou přihlásit ke kterémukoli stupni.

3. **Fakta jako sdílený stav**: Fakta statusu senzorů a zón vytvářejí dotazovatelný pohled na zdraví systému, který mohou dashboardy a API číst.

4. **Řazení podle priority**: Kritické vzory (detekce kaskád, priorita 250) se vyhodnocují před níže prioritními vzory (logování, priorita 10).

## Výkonnostní aspekty

### Velikost EventStore

EventStore drží nedávné události v paměti pro dotazy počtu a agregace. Konfigurujte retenci na základě vašeho nejdelšího časového okna:

```typescript
const engine = await RuleEngine.start({
  name: 'production',
  events: {
    maxEvents: 50000,   // Max událostí v paměti
    maxAgeMs: 86400000, // 24 hodin
  },
});
```

Pokud je vaše nejdelší CEP okno 1 hodina, nepotřebujete 24 hodin retence. Snižte `maxAgeMs` pro uvolnění paměti.

### Kardinalita groupBy

Každá unikátní hodnota `groupBy` vytvoří samostatnou instanci vzoru. Pole s vysokou kardinalitou (jako `requestId` nebo `sessionId`) mohou vytvořit tisíce instancí:

```typescript
// Dobré: ohraničená kardinalita
count().event('api.error').groupBy('endpoint')     // ~50 endpointů
aggregate().event('order.paid').groupBy('region')  // ~10 regionů

// Opatrně: potenciálně vysoká kardinalita
count().event('api.error').groupBy('userId')       // ~100K uživatelů
aggregate().event('tx.completed').groupBy('txId')  // neohraničené!
```

Pro pole s vysokou kardinalitou preferujte klouzavá okna (která se uklidí po každém vyhodnocení) a udržujte časová okna krátká.

### Velikost okna vs paměť

Větší okna vyžadují ukládání více událostí:

| Okno | Rychlost událostí | Dopad na paměť |
|------|--------------------|--------------------|
| 1 minuta | 100/s | ~6 000 událostí |
| 5 minut | 100/s | ~30 000 událostí |
| 1 hodina | 100/s | ~360 000 událostí |
| 24 hodin | 100/s | ~8,6M událostí |

Použijte nejkratší okno, které splňuje váš business požadavek. Pokud potřebujete dlouhá okna s vysokým tokem událostí, zvažte před-agregaci v kratších intervalech.

### Počet vzorů

Každý registrovaný CEP vzor přidává režie zpracování na událost. Engine vyhodnocuje každou příchozí událost vůči všem aktivním vzorům. Pro systémy se stovkami CEP pravidel zvažte:

- Používání filtrů událostí pro zúžení matchování
- Organizaci pravidel s tagy a skupinami pro selektivní povolení
- Před-filtrování událostí před dosažením do enginu

## Debuggování CEP pravidel

### Běžné problémy

**Vzor se nikdy nespustí**:
1. Zkontrolujte, že event topic přesně odpovídá (včetně wildcardů)
2. Ověřte, že pole `groupBy` existuje v datech události
3. Ověřte, že časové okno je dostatečně dlouhé pro vaše testovací data
4. Pro počet/agregaci: zkontrolujte, že bylo emitováno dostatek událostí
5. Pro sekvenci: ověřte, že události přicházejí ve správném pořadí
6. Pro absenci: počkejte na celou dobu timeoutu

**Vzor se spouští příliš často**:
1. Zkontrolujte `groupBy` — chybějící `groupBy` zachází se všemi událostmi jako s jednou skupinou
2. Ověřte, že filtry jsou dostatečně restriktivní
3. Pro klouzavý počet: každá událost znovu vyhodnocuje, může se spustit při každé události nad prahem

**Vzor se spouští s nesprávnými daty**:
1. Zkontrolujte cesty `ref()` odpovídající typu triggeru (např. `trigger.events.0` pro sekvenci, `trigger.after` pro absenci, `trigger.groupKey` pro počet/agregaci)
2. Ověřte, že názvy polí v datech události odpovídají očekávání vzoru

### Inspekce aktivních instancí

TemporalProcessor vystavuje svůj stav pro debuggování:

```typescript
// Získat všechny aktivní instance vzorů
const instances = engine.temporalProcessor.getActiveInstances();
console.log('Aktivních instancí:', instances.length);

for (const inst of instances) {
  console.log(`  ${inst.id}: ${inst.pattern.type} [${inst.state}]`);
  console.log(`    Pravidlo: ${inst.ruleId}`);
  console.log(`    Skupina: ${inst.groupKey}`);
  console.log(`    Expiruje: ${new Date(inst.expiresAt).toISOString()}`);
}

// Získat instance pro konkrétní pravidlo
const ruleInstances = engine.temporalProcessor.getInstancesForRule('brute-force');
```

### Trasování událostí skrze vzory

Povolte trasování pro zobrazení toku událostí CEP matchery:

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

## Cvičení

Navrhněte kompletní systém detekce e-commerce podvodů s využitím více CEP vzorů. Systém by měl detekovat:

1. **Rychlé objednávky**: Více než 3 objednávky od stejného uživatele za 10 minut (podezřelá automatizace)
2. **Skok vysokých hodnot**: Celková částka objednávek překračuje $5 000 pro uživatele za 1 hodinu
3. **Nové zařízení + velký nákup**: Uživatel se přihlásí z nového zařízení, pak zadá objednávku nad $500, během 30 minut
4. **Agregace rizika**: Když kombinované skóre rizika (z výše uvedených detekcí) překročí 60 pro uživatele za 1 hodinu, emitujte fraud alert

<details>
<summary>Řešení</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, setFact, log, ref,
  sequence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

// 1. Rychlé objednávky (počet)
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
    .also(log('warn', 'Rychlé objednávky detekovány: ${trigger.groupKey}'))
    .build()
);

// 2. Skok vysokých hodnot (agregace)
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
    .also(log('warn', 'Skok vysokých hodnot: ${trigger.groupKey} = $${trigger.value}'))
    .build()
);

// 3. Nové zařízení + velký nákup (sekvence)
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
    .also(log('warn', 'Nákup z nového zařízení: ${trigger.events.0.userId}'))
    .build()
);

// 4. Agregace rizika (agregace nad skóre rizika)
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

// Odezva: zamčení účtu při fraud alertu
engine.registerRule(
  Rule.create('fraud-lockout')
    .priority(50)
    .tags('fraud', 'response')
    .when(onEvent('fraud.alert'))
    .then(setFact('user:${event.userId}:locked', true))
    .also(log('error', 'Účet zamčen kvůli podvodu: ${event.userId}'))
    .build()
);
```

Systém pracuje ve vrstvách: tři detekční pravidla (počet, agregace, sekvence) každé emitují události `risk.score_added` s různými skóre. Agregační pravidlo sečte tato skóre na uživatele za 1 hodinu. Když celkem překročí 60, spustí se fraud alert a pravidlo odezvy zamkne účet.

Tato architektura je rozšiřitelná — přidání nového detekčního vzoru vyžaduje pouze přidání nového pravidla, které emituje `risk.score_added`. Žádná existující pravidla se nemusí měnit.

</details>

## Shrnutí

- CEP vzory produkují události, které mohou běžná pravidla konzumovat, což umožňuje **vícestupňové pipeline**
- Vzor **CEP → obohacení → akce** odděluje detekci od odezvy
- **Podmínky na faktech** u CEP pravidel přidávají kontextově vědomý matching
- Vrstvěte vzory do **stupňů**: detekce → skórování → agregace → odezva
- Konfigurujte retenci **EventStore** na základě vašeho nejdelšího časového okna
- Sledujte **kardinalitu groupBy** — pole s vysokou kardinalitou vytvářejí mnoho instancí
- Použijte **krátká okna** a **filtry událostí** pro minimalizaci paměti a CPU režie
- Debuggujte pomocí `getActiveInstances()` a `temporal.match` event listeneru
- Běžné problémy: chybějící `groupBy`, špatné cesty `ref()`, nedostatečné časové okno

---

Další: [Skupiny a tagy pravidel](../06-organizace/01-skupiny-a-tagy.md)
