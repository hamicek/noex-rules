# IoT monitoring pipeline

Tento projekt buduje vicezonovy prumyslovy monitorovaci system. Senzory rozmistene pres vice fyzickych zon hlasi teplotu, tlak, vlhkost a heartbeat data. Pravidlovy engine zpracovava tuto telemetrii v realnem case, detekuje anomalie pomoci CEP vzoru a baselin, planuje udrzbu s trvanlivymi casovaci a streamuje alerty na zivy dashboard pres SSE. Architektura je organizovana podle zon, se skupinami pravidel umoznujicimi konfiguraci pro jednotlive zony.

## Co se naucite

- Jak navrhnout vicezonovou architekturu monitoringu senzoru
- Monitoring prahovych hodnot s konfiguraci pro jednotlive zony
- Monitoring heartbeatu pro zdravi zarizeni (CEP absence)
- Klouzave prumery a detekce anomalii s baselinami
- Planovani udrzby s trvanlivymi casovaci
- Real-time SSE dashboard pro zivy monitoring
- Vicezonova architektura se skupinami pravidel
- Kompletni nastaveni serveru s REST API a SSE notifikacemi

## Prehled architektury

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    IoT monitoring pipeline                               │
│                                                                         │
│  Zony                                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│  │ ZONE-A        │  │ ZONE-B        │  │ ZONE-C        │              │
│  │ (Vyroba)      │  │ (Sklad)       │  │ (Serverovna)  │              │
│  │ Senzory:      │  │ Senzory:      │  │ Senzory:      │              │
│  │ tepl,tlak     │  │ tepl,vlhkost │  │ teplota       │              │
│  │ vibrace       │  │               │  │               │              │
│  └──────┬────────┘  └──────┬────────┘  └──────┬────────┘              │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Vrstva 1: Zpracovani telemetrie (priorita 300)                   │  │
│  │  ├─ threshold-temp        Teplota > limit zony                   │  │
│  │  ├─ threshold-pressure    Tlak > limit zony                      │  │
│  │  └─ threshold-humidity    Vlhkost > limit zony                   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Vrstva 2: Detekce vzoru (priorita 200)                           │  │
│  │  ├─ sensor-offline        Zadny heartbeat 2 min (CEP absence)   │  │
│  │  ├─ temp-spike            Prumer tepl > 80°C za 5 min (aggregate)│  │
│  │  ├─ rapid-fluctuation     10+ anomalnich cteni za 1 min (count) │  │
│  │  └─ failure-cascade       tepl→tlak→vibrace (sequence)          │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Vrstva 3: Udrzba a planovani (priorita 150)                     │  │
│  │  ├─ schedule-inspection   Nastaveni casovace pri prekroceni      │  │
│  │  ├─ inspection-due        Emitovani notifikace pri expiraci      │  │
│  │  └─ cooldown-monitor      Sledovani obdobi ochlazeni zony        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Vrstva 4: Smerovani alertu (priorita 100)                       │  │
│  │  ├─ route-warning         Odeslani varovani na dashboard         │  │
│  │  ├─ route-critical        Privolani pohotovosti, zamceni zony    │  │
│  │  └─ zone-status           Aktualizace faktu zdravi zony          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                            │                                            │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ REST API + SSE Dashboard                                         │  │
│  │  GET /api/v1/facts (stav zon)       GET /api/v1/stream/events   │  │
│  │  GET /api/v1/stats (zdravi enginu)  (zivy feed alertu)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Kompletni implementace

### Cast 1: Engine a pravidla

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, onTimer, event, fact,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log, ref,
  sequence, absence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function createMonitoringEngine() {
  const maintenanceService = {
    createTicket: async (zoneId: string, type: string, description: string) => {
      console.log(`[TIKET] Zona ${zoneId}: ${type} — ${description}`);
      return { ticketId: `TK-${Date.now()}` };
    },
  };

  const notificationService = {
    send: async (channel: string, message: string, severity: string) => {
      console.log(`[NOTIFIKACE:${severity}] #${channel}: ${message}`);
    },
    page: async (team: string, message: string) => {
      console.log(`[PAGE] @${team}: ${message}`);
    },
  };

  const engine = await RuleEngine.start({
    name: 'iot-monitor',
    services: { maintenanceService, notificationService },
    baseline: {
      metrics: [
        {
          name: 'temperature_baseline',
          topic: 'sensor.temperature',
          field: 'value',
          function: 'avg',
          sampleWindow: '5m',
          trainingPeriod: '24h',
          recalcInterval: '1h',
          method: 'zscore',
          groupBy: 'zoneId',
        },
        {
          name: 'pressure_baseline',
          topic: 'sensor.pressure',
          field: 'value',
          function: 'avg',
          sampleWindow: '5m',
          trainingPeriod: '24h',
          recalcInterval: '1h',
          method: 'zscore',
          groupBy: 'zoneId',
        },
      ],
      defaultSensitivity: 2.0,
      minSamples: 10,
    },
  });

  // ================================================================
  // KONFIGURACE ZON
  // ================================================================

  // Definice prahovych hodnot pro jednotlive zony jako faktu
  const zones = {
    'ZONE-A': {
      name: 'Vyrobni hala', tempMax: 75, pressureMax: 150, humidityMax: 80,
    },
    'ZONE-B': {
      name: 'Sklad', tempMax: 40, pressureMax: 120, humidityMax: 70,
    },
    'ZONE-C': {
      name: 'Serverovna', tempMax: 28, pressureMax: 110, humidityMax: 50,
    },
  };

  for (const [zoneId, config] of Object.entries(zones)) {
    await engine.setFact(`zone:${zoneId}:name`, config.name);
    await engine.setFact(`zone:${zoneId}:tempMax`, config.tempMax);
    await engine.setFact(`zone:${zoneId}:pressureMax`, config.pressureMax);
    await engine.setFact(`zone:${zoneId}:humidityMax`, config.humidityMax);
    await engine.setFact(`zone:${zoneId}:status`, 'healthy');

    // Vytvoreni skupiny pravidel pro kazdou zonu
    engine.createGroup({
      id: `zone-${zoneId}`,
      name: `Pravidla ${config.name}`,
      description: `Pravidla specificka pro ${zoneId}`,
      enabled: true,
    });
  }

  // ================================================================
  // VRSTVA 1: ZPRACOVANI TELEMETRIE (priorita 300)
  // ================================================================

  // 1. Prah teploty
  engine.registerRule(
    Rule.create('threshold-temp')
      .name('Temperature Threshold')
      .description('Alert pri prekroceni zonove specifickeho maxima teploty')
      .priority(300)
      .tags('iot', 'telemetry', 'temperature')
      .when(onEvent('sensor.temperature'))
      .if(event('value').gt(ref('fact.zone:${event.zoneId}:tempMax')))
      .then(emit('alert.threshold_breach', {
        zoneId: ref('event.zoneId'),
        sensorId: ref('event.sensorId'),
        metric: 'temperature',
        value: ref('event.value'),
        threshold: ref('fact.zone:${event.zoneId}:tempMax'),
        severity: 'warning',
      }))
      .also(log('warn', 'Prekroceni teploty: ${event.sensorId} v ${event.zoneId} = ${event.value}°C'))
      .build()
  );

  // 2. Prah tlaku
  engine.registerRule(
    Rule.create('threshold-pressure')
      .name('Pressure Threshold')
      .description('Alert pri prekroceni zonove specifickeho maxima tlaku')
      .priority(300)
      .tags('iot', 'telemetry', 'pressure')
      .when(onEvent('sensor.pressure'))
      .if(event('value').gt(ref('fact.zone:${event.zoneId}:pressureMax')))
      .then(emit('alert.threshold_breach', {
        zoneId: ref('event.zoneId'),
        sensorId: ref('event.sensorId'),
        metric: 'pressure',
        value: ref('event.value'),
        threshold: ref('fact.zone:${event.zoneId}:pressureMax'),
        severity: 'warning',
      }))
      .also(log('warn', 'Prekroceni tlaku: ${event.sensorId} v ${event.zoneId} = ${event.value} PSI'))
      .build()
  );

  // 3. Prah vlhkosti
  engine.registerRule(
    Rule.create('threshold-humidity')
      .name('Humidity Threshold')
      .description('Alert pri prekroceni zonove specifickeho maxima vlhkosti')
      .priority(300)
      .tags('iot', 'telemetry', 'humidity')
      .when(onEvent('sensor.humidity'))
      .if(event('value').gt(ref('fact.zone:${event.zoneId}:humidityMax')))
      .then(emit('alert.threshold_breach', {
        zoneId: ref('event.zoneId'),
        sensorId: ref('event.sensorId'),
        metric: 'humidity',
        value: ref('event.value'),
        threshold: ref('fact.zone:${event.zoneId}:humidityMax'),
        severity: 'warning',
      }))
      .also(log('warn', 'Prekroceni vlhkosti: ${event.sensorId} v ${event.zoneId} = ${event.value}%'))
      .build()
  );

  // ================================================================
  // VRSTVA 2: DETEKCE VZORU (priorita 200)
  // ================================================================

  // 4. Detekce offline senzoru (CEP absence)
  engine.registerRule(
    Rule.create('sensor-offline')
      .name('Sensor Offline Detection')
      .description('Detekce zastaveni odesilani heartbeatu senzorem')
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
        zoneId: ref('trigger.after.zoneId'),
        lastSeen: ref('trigger.after.timestamp'),
      }))
      .also(setFact('sensor:${trigger.after.sensorId}:status', 'offline'))
      .also(log('error', 'Senzor offline: ${trigger.after.sensorId} v ${trigger.after.zoneId}'))
      .build()
  );

  // 5. Teplotni spicka: prumer > 80°C za 5 minut
  engine.registerRule(
    Rule.create('temp-spike')
      .name('Temperature Spike Detection')
      .description('Detekce trvale vysoke teploty v casovem okne')
      .priority(200)
      .tags('iot', 'pattern', 'temperature')
      .when(aggregate()
        .event('sensor.temperature')
        .field('value')
        .function('avg')
        .threshold(80)
        .window('5m')
        .groupBy('zoneId')
      )
      .then(emit('alert.temp_spike', {
        zoneId: ref('trigger.groupKey'),
        avgTemp: ref('trigger.value'),
        severity: 'high',
      }))
      .also(setFact('zone:${trigger.groupKey}:status', 'warning'))
      .also(log('warn', 'Teplotni spicka: ${trigger.groupKey} prumer ${trigger.value}°C za 5m'))
      .build()
  );

  // 6. Rychle vykyvy: indikator poruchy senzoru
  engine.registerRule(
    Rule.create('rapid-fluctuation')
      .name('Rapid Sensor Fluctuation')
      .description('Detekce potencialni poruchy senzoru z nadmernych anomalnich cteni')
      .priority(200)
      .tags('iot', 'pattern', 'diagnostics')
      .when(count()
        .event('sensor.anomaly')
        .threshold(10)
        .window('1m')
        .groupBy('sensorId')
        .sliding()
      )
      .then(emit('alert.sensor_malfunction', {
        sensorId: ref('trigger.groupKey'),
        readingCount: ref('trigger.count'),
        severity: 'high',
      }))
      .also(setFact('sensor:${trigger.groupKey}:status', 'malfunction'))
      .also(log('error', 'Porucha senzoru: ${trigger.groupKey}, ${trigger.count} anomalii za 1m'))
      .build()
  );

  // 7. Kaskada selhani: alerty teploty → tlaku → vibraci v sekvenci
  engine.registerRule(
    Rule.create('failure-cascade')
      .name('Multi-Sensor Failure Cascade')
      .description('Detekce kaskadoveho selhani pres vice typu senzoru')
      .priority(250)
      .tags('iot', 'pattern', 'critical')
      .when(sequence()
        .event('alert.temp_spike')
        .event('alert.threshold_breach', { metric: 'pressure' })
        .within('10m')
        .groupBy('zoneId')
      )
      .then(emit('alert.failure_cascade', {
        zoneId: ref('trigger.events.0.zoneId'),
        severity: 'critical',
      }))
      .also(setFact('zone:${trigger.events.0.zoneId}:status', 'critical'))
      .also(log('error', 'KRITICKE: Kaskada selhani v ${trigger.events.0.zoneId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 3: UDRZBA A PLANOVANI (priorita 150)
  // ================================================================

  // 8. Naplanovani inspekce pri prekroceni prahu
  engine.registerRule(
    Rule.create('schedule-inspection')
      .name('Schedule Maintenance Inspection')
      .description('Vytvoreni casovace udrzby pri prekroceni prahove hodnoty')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('alert.threshold_breach'))
      .then(setTimer({
        name: 'inspection:${event.zoneId}:${event.metric}',
        duration: '4h',
        onExpire: {
          topic: 'maintenance.inspection_due',
          data: {
            zoneId: ref('event.zoneId'),
            metric: ref('event.metric'),
            triggerValue: ref('event.value'),
          },
        },
      }))
      .also(setFact('maintenance:${event.zoneId}:${event.metric}:scheduled', true))
      .also(log('info', 'Inspekce naplanovana: ${event.zoneId} ${event.metric} za 4h'))
      .build()
  );

  // 9. Notifikace o nutne inspekci
  engine.registerRule(
    Rule.create('inspection-due')
      .name('Inspection Due Notification')
      .description('Upozorneni tymu udrzby pri expiraci casovace inspekce')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('maintenance.inspection_due'))
      .then(callService('maintenanceService', 'createTicket', [
        ref('event.zoneId'),
        'inspection',
        'Planovana inspekce pro ${event.metric} v zone ${event.zoneId}. Spousteci hodnota: ${event.triggerValue}',
      ]))
      .also(callService('notificationService', 'send', [
        'maintenance',
        'Inspekce nutna: ${event.zoneId} ${event.metric}',
        'info',
      ]))
      .also(deleteFact('maintenance:${event.zoneId}:${event.metric}:scheduled'))
      .also(log('info', 'Inspekce nutna: ${event.zoneId} ${event.metric}'))
      .build()
  );

  // 10. Monitor ochlazeni: sledovani navratu zony do normalu
  engine.registerRule(
    Rule.create('cooldown-monitor')
      .name('Zone Cooldown Monitor')
      .description('Reset stavu zony pri navratu teploty na bezpecnou uroven')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('sensor.temperature'))
      .if(event('value').lt(ref('fact.zone:${event.zoneId}:tempMax')))
      .and(fact('zone:${event.zoneId}:status').neq('healthy'))
      .then(setFact('zone:${event.zoneId}:status', 'healthy'))
      .also(emit('zone.recovered', {
        zoneId: ref('event.zoneId'),
      }))
      .also(log('info', 'Zona obnovena: ${event.zoneId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 4: SMEROVANI ALERTU (priorita 100)
  // ================================================================

  // 11. Smerovani varovnych alertu na dashboard
  engine.registerRule(
    Rule.create('route-warning')
      .name('Route Warning Alerts')
      .description('Odeslani alertu urovne varovani na dashboard kanal')
      .priority(100)
      .tags('iot', 'routing')
      .when(onEvent('alert.*'))
      .if(event('severity').eq('warning'))
      .then(callService('notificationService', 'send', [
        'iot-dashboard',
        'VAROVANI: prekroceni ${event.metric} v ${event.zoneId} — ${event.sensorId} = ${event.value}',
        'warning',
      ]))
      .build()
  );

  // 12. Smerovani kritickych alertu: privolani pohotovosti
  engine.registerRule(
    Rule.create('route-critical')
      .name('Route Critical Alerts')
      .description('Privolani pohotovostniho tymu pro kriticke alerty')
      .priority(100)
      .tags('iot', 'routing')
      .when(onEvent('alert.failure_cascade'))
      .then(callService('notificationService', 'page', [
        'iot-oncall',
        'KRITICKE: Kaskada selhani v zone ${event.zoneId}',
      ]))
      .also(callService('maintenanceService', 'createTicket', [
        ref('event.zoneId'),
        'emergency',
        'Detekovana kaskada selhani — nutna okamzita inspekce',
      ]))
      .build()
  );

  // 13. Aktualizace faktu stavu zony pro dotazy dashboardu
  engine.registerRule(
    Rule.create('zone-status-tracker')
      .name('Zone Status Tracker')
      .description('Udrzovani faktu stavu zony aktualnich pro konzumenty API')
      .priority(100)
      .tags('iot', 'status')
      .when(onEvent('alert.*'))
      .if(event('zoneId').exists())
      .then(setFact('zone:${event.zoneId}:lastAlert', ref('event.topic')))
      .also(setFact('zone:${event.zoneId}:lastAlertTime', '${Date.now()}'))
      .build()
  );

  // 14. Detekce navratu senzoru online
  engine.registerRule(
    Rule.create('sensor-online')
      .name('Sensor Online Detection')
      .description('Oznaceni senzoru jako online pri obnoveni heartbeatu')
      .priority(100)
      .tags('iot', 'health')
      .when(onEvent('sensor.heartbeat'))
      .if(fact('sensor:${event.sensorId}:status').eq('offline'))
      .then(setFact('sensor:${event.sensorId}:status', 'online'))
      .also(emit('alert.sensor_recovered', {
        sensorId: ref('event.sensorId'),
        zoneId: ref('event.zoneId'),
      }))
      .also(log('info', 'Senzor zpet online: ${event.sensorId}'))
      .build()
  );

  return engine;
}
```

### Cast 2: Server s SSE dashboardem

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules/api';

async function main() {
  const engine = await createMonitoringEngine();

  // Spusteni API serveru s SSE
  const server = await RuleEngineServer.start({
    engine,
    server: {
      port: 7226,
      cors: true,
      swagger: true,
      graphql: true,
    },
    sseConfig: {
      heartbeatInterval: 15000,
    },
  });

  console.log(`IoT Dashboard: ${server.address}`);
  console.log(`Swagger UI:    ${server.address}/docs`);
  console.log(`SSE stream:    ${server.address}/api/v1/stream/events?topics=alert.*,zone.*`);

  // Registrace webhooku pro kriticke alerty
  await fetch(`${server.address}/api/v1/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://ops.example.com/webhook/iot',
      patterns: ['alert.failure_cascade', 'alert.sensor_offline'],
      secret: 'webhook-signing-secret',
    }),
  });

  // ================================================================
  // SIMULACE SENZOROVYCH DAT
  // ================================================================

  console.log('\n=== Simulace spustena ===\n');

  // Zdrave heartbeaty
  for (const sensorId of ['S-A1', 'S-A2', 'S-B1', 'S-C1']) {
    await engine.emit('sensor.heartbeat', {
      sensorId,
      zoneId: sensorId.startsWith('S-A') ? 'ZONE-A' :
              sensorId.startsWith('S-B') ? 'ZONE-B' : 'ZONE-C',
    });
  }

  // Normalni cteni
  await engine.emit('sensor.temperature', {
    sensorId: 'S-A1', zoneId: 'ZONE-A', value: 65,
  });
  await engine.emit('sensor.pressure', {
    sensorId: 'S-A2', zoneId: 'ZONE-A', value: 120,
  });
  await engine.emit('sensor.temperature', {
    sensorId: 'S-C1', zoneId: 'ZONE-C', value: 22,
  });

  console.log('--- Normalni cteni zpracovana ---');
  console.log('Stav ZONE-A:', engine.getFact('zone:ZONE-A:status'));
  console.log('Stav ZONE-C:', engine.getFact('zone:ZONE-C:status'));

  // Teplotni spicka v ZONE-A
  console.log('\n--- Simulace teplotni spicky v ZONE-A ---');
  for (let i = 0; i < 5; i++) {
    await engine.emit('sensor.temperature', {
      sensorId: 'S-A1', zoneId: 'ZONE-A', value: 82 + i,
    });
  }

  console.log('Stav ZONE-A:', engine.getFact('zone:ZONE-A:status'));

  // Prehrivani serverovny
  console.log('\n--- Simulace prehrivani serverovny ---');
  await engine.emit('sensor.temperature', {
    sensorId: 'S-C1', zoneId: 'ZONE-C', value: 35,
  });

  console.log('Stav ZONE-C:', engine.getFact('zone:ZONE-C:status'));

  // Dotaz na stav zon pres API
  console.log('\n--- Stav zon (pres fakta) ---');
  const allZoneFacts = engine.queryFacts('zone:*:status');
  for (const f of allZoneFacts) {
    console.log(`  ${f.key} = ${f.value}`);
  }

  // Server bezi pro SSE klienty
  console.log(`\nServer bezi na ${server.address}`);
  console.log('Stisknete Ctrl+C pro zastaveni.');
}

main();
```

### Cast 3: Klient SSE dashboardu

Jednoduchy dashboard zalozeny na prohlizeci, ktery se pripojuje k SSE streamu:

```html
<!DOCTYPE html>
<html>
<head>
  <title>IoT Monitoring Dashboard</title>
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px; }
    .zone { border: 1px solid #333; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .zone.healthy { border-color: #4caf50; }
    .zone.warning { border-color: #ff9800; }
    .zone.critical { border-color: #f44336; background: #2d1111; }
    .alert { padding: 8px; margin: 4px 0; border-left: 3px solid; font-size: 13px; }
    .alert.warning { border-color: #ff9800; }
    .alert.critical { border-color: #f44336; }
    .alert.info { border-color: #2196f3; }
    h1 { color: #7b68ee; }
    h2 { color: #9e9e9e; }
    #alerts { max-height: 400px; overflow-y: auto; }
  </style>
</head>
<body>
  <h1>IoT Monitoring Dashboard</h1>
  <div id="zones"></div>
  <h2>Zive alerty</h2>
  <div id="alerts"></div>

  <script>
    const SERVER = 'http://localhost:7226';

    // Periodicke nacitani stavu zon
    async function updateZones() {
      const res = await fetch(`${SERVER}/api/v1/facts`);
      const facts = await res.json();

      const zones = {};
      for (const fact of facts) {
        const match = fact.key.match(/^zone:(\w+):(\w+)$/);
        if (match) {
          const [, zoneId, field] = match;
          zones[zoneId] = zones[zoneId] || {};
          zones[zoneId][field] = fact.value;
        }
      }

      const container = document.getElementById('zones');
      container.innerHTML = Object.entries(zones)
        .map(([id, z]) => `
          <div class="zone ${z.status || 'healthy'}">
            <strong>${id}</strong> — ${z.name || 'Neznama'}
            | Stav: <strong>${z.status || 'healthy'}</strong>
            | Posledni alert: ${z.lastAlert || 'zadny'}
          </div>
        `).join('');
    }

    // SSE pripojeni pro zive alerty
    const events = new EventSource(
      `${SERVER}/api/v1/stream/events?topics=alert.*,zone.*,maintenance.*`
    );

    events.onmessage = (e) => {
      const data = JSON.parse(e.data);
      const severity = data.data?.severity || 'info';
      const alertDiv = document.createElement('div');
      alertDiv.className = `alert ${severity}`;
      alertDiv.textContent = `[${new Date().toLocaleTimeString()}] ${data.topic}: ${
        JSON.stringify(data.data)
      }`;

      const container = document.getElementById('alerts');
      container.prepend(alertDiv);

      // Obnoveni stavu zon pri kazdem alertu
      updateZones();
    };

    events.onerror = () => {
      console.log('SSE pripojeni ztraceno, probiha znovupripojeni...');
    };

    // Pocatecni nacteni
    updateZones();
    setInterval(updateZones, 10000);
  </script>
</body>
</html>
```

## Detailni rozbor

### Konfigurace zon

Misto hardcodovanych prahovych hodnot v pravidlech jsou limity zon ulozeny jako **fakta**:

```text
  zone:ZONE-A:tempMax = 75       zone:ZONE-B:tempMax = 40
  zone:ZONE-A:pressureMax = 150  zone:ZONE-B:humidityMax = 70
  zone:ZONE-C:tempMax = 28       ...
```

Pravidla pouzivaji `ref('fact.zone:${event.zoneId}:tempMax')` pro dynamicke vyhledani zonove specifickeho prahu. To znamena:

- Prahy lze menit za behu pres `setFact()` nebo REST API — zadne zmeny pravidel nejsou potreba
- Ruzne zony maji ruzne limity odpovidajici jejich ucelu (serverovna je mnohem citlivejsi na teplotu nez vyrobni hala)
- UI muze zobrazovat a upravovat prahy jako obycejne fakta

### CEP vzory

| Vzor | Typ | Co detekuje | Casove okno |
|------|-----|-------------|-------------|
| Senzor offline | `absence()` | Zadny heartbeat za 2 minuty | 2m |
| Teplotni spicka | `aggregate()` prumer > 80°C | Trvale prehrivani | 5m |
| Rychle vykyvy | `count()` 10+ anomalii | Porucha senzoru | 1m |
| Kaskada selhani | `sequence()` teplota → tlak | Vicesenzorove selhani | 10m |

Vzor kaskady selhani je obzvlaste dulezity: kdyz teplota stoupne, tlak casto nasleduje a pak se zvysi vibrace. Vcasna detekce teto sekvence umoznuje preventivni odstaveni pred poskozenim zarizeni.

### Planovani udrzby

Vrstva udrzby premostuje monitoring a provoz:

```text
  alert.threshold_breach
       │
       ▼
  ┌────────────────────────┐
  │ schedule-inspection    │
  │ Nastaveni casovace: 4h │
  │ Nastaveni faktu: sched.│
  └───────────┬────────────┘
              │ (za 4 hodiny)
              ▼
  ┌────────────────────────┐
  │ inspection-due         │
  │ Vytvoreni tiketu       │
  │ Upozorneni udrzby      │
  │ Smazani faktu sched.   │
  └────────────────────────┘
```

Casovace preziji restarty enginu, pokud je nakonfigurovana persistence casovcu. Fakt `scheduled` brrani duplicitnimu planovani — pravidla mohou kontrolovat `fact('maintenance:zoneId:metric:scheduled').exists()` pred nastavenim dalsiho casovace.

### Detekce anomalii pomoci baselin

Baseline system enginu se uci normalni rozsahy z historickych dat:

```typescript
baseline: {
  metrics: [{
    name: 'temperature_baseline',
    topic: 'sensor.temperature',
    field: 'value',
    function: 'avg',
    sampleWindow: '5m',
    trainingPeriod: '24h',
    recalcInterval: '1h',
    method: 'zscore',
    groupBy: 'zoneId',
  }],
}
```

Po trenovacim obdobi engine zna normalni teplotni rozsah pro kazdou zonu. Cteni mimo 2 standardni odchylky (vychozi citlivost) jsou oznacena jako anomalie. Toto je adaptivnejsi nez fixni prahy — vyrobni hala, ktera normalne bezi na 70°C, negeneruje falesne poplachy pri 72°C, zatimco serverovna, ktera normalne bezi na 22°C, spravne oznaci 25°C jako neobvyklou.

### Integrace SSE dashboardu

SSE endpoint poskytuje real-time feed s filtrovanim topiku:

```
GET /api/v1/stream/events?topics=alert.*,zone.*,maintenance.*
```

Klient dashboardu prijima kazdy alert, zmenu stavu zony a notifikaci udrzby jako server-sent event. V kombinaci s periodickym dotazovanim faktu pro stav zon to poskytuje kompletni real-time pohled na monitorovaci system.

## Cviceni

Rozsirte system o dve nove schopnosti:

1. **Korelace vlhkosti**: Pokud vlhkost presahne 90% a teplota presahne prah zony soucasne (oba eventy v 5minutovem okne, stejna zona), emitujte event `alert.condensation_risk` se zavaznosti `high`. Pouzijte vzor `sequence()`.

2. **Automaticke odstaveni**: Kdyz se spusti event `alert.failure_cascade`, nastavte casovac na 5 minut. Pokud je stav zony stale `critical` pri expiraci casovace (kontrola faktu), emitujte `maintenance.emergency_shutdown` a zavolejte `notificationService.page` pro provozni tym.

<details>
<summary>Reseni</summary>

```typescript
import {
  Rule, onEvent, onTimer, event, fact,
  emit, setFact, setTimer, callService, log, ref,
  sequence,
} from '@hamicek/noex-rules/dsl';

// 1. Korelace vlhkosti a teploty
engine.registerRule(
  Rule.create('condensation-risk')
    .name('Condensation Risk Detection')
    .priority(200)
    .tags('iot', 'pattern', 'humidity')
    .when(sequence()
      .event('alert.threshold_breach', { metric: 'humidity' })
      .event('alert.threshold_breach', { metric: 'temperature' })
      .within('5m')
      .groupBy('zoneId')
    )
    .then(emit('alert.condensation_risk', {
      zoneId: ref('trigger.events.0.zoneId'),
      severity: 'high',
      humidity: ref('trigger.events.0.value'),
      temperature: ref('trigger.events.1.value'),
    }))
    .also(log('warn', 'Riziko kondenzace: ${trigger.events.0.zoneId}'))
    .build()
);

// 2. Automaticke odstaveni po kaskade selhani
engine.registerRule(
  Rule.create('auto-shutdown-timer')
    .name('Auto-Shutdown Timer')
    .priority(150)
    .tags('iot', 'maintenance', 'critical')
    .when(onEvent('alert.failure_cascade'))
    .then(setTimer({
      name: 'auto-shutdown:${event.zoneId}',
      duration: '5m',
      onExpire: {
        topic: 'maintenance.shutdown_check',
        data: { zoneId: ref('event.zoneId') },
      },
    }))
    .also(log('warn', 'Casovac automatickeho odstaveni nastaven: ${event.zoneId} za 5m'))
    .build()
);

engine.registerRule(
  Rule.create('auto-shutdown-execute')
    .name('Auto-Shutdown Execution')
    .priority(150)
    .tags('iot', 'maintenance', 'critical')
    .when(onEvent('maintenance.shutdown_check'))
    .if(fact('zone:${event.zoneId}:status').eq('critical'))
    .then(emit('maintenance.emergency_shutdown', {
      zoneId: ref('event.zoneId'),
      reason: 'Zona stale kriticka po 5minutovem odkladnem obdobi',
    }))
    .also(setFact('zone:${event.zoneId}:status', 'shutdown'))
    .also(callService('notificationService', 'page', [
      'operations',
      'NOUZOVE ODSTAVENI: Zona ${event.zoneId} — stale kriticka po odkladnem obdobi',
    ]))
    .also(log('error', 'NOUZOVE ODSTAVENI: ${event.zoneId}'))
    .build()
);
```

Pravidlo rizika kondenzace detekuje nebezpecnou kombinaci: kdyz vlhkost i teplota prekroci sve prahy ve stejne zone behem 5 minut, muze se na zarizenich tvorit kondenzace. Automaticke odstaveni pouziva dvufazovy pristup: nastaveni casovace pri detekci kaskady, pak kontrola stavu zony pri expiraci casovace. Pokud se zona behem 5minutoveho odkladneho obdobi zotavila, zadna akce se neprovede. Pokud je stale kriticka, spusti se odstaveni.

</details>

## Shrnuti

- Ukladejte prahy zon jako **fakta** pro konfiguratelnost za behu — zadne zmeny pravidel nejsou potreba pro upravu limitu
- Pouzivejte **skupiny pravidel** pro jednotlive zony pro povoleni/zakazani monitoringu v konkretch oblastech behem udrzby
- Pouzivejte `absence()` pro **monitoring heartbeatu** — nejspolehlivejsi zpusob detekce offline senzoru
- Pouzivejte `aggregate()` pro **detekci trvalych anomalii** — zachycuje trendy, ktere jednotliva cteni minouji
- Pouzivejte `sequence()` pro **detekci kaskad** — usporadane vicestupnove selhani indikuji vazne problemy
- Pouzivejte `count()` pro **diagnostiku senzoru** — rychla anomalni cteni casto indikuji selhani hardware
- Planujte udrzbu s **trvanlivymi casovaci** — preziji restarty, vytvareji audit trail
- Pouzivejte **detekci anomalii pomoci baselin** pro adaptivni prahy, ktere se uci z historickych dat
- Vystavujte stav zon jako **fakta** dotazovatelna pres REST API pro dashboardy a externi systemy
- Streamujte alerty pres **SSE** pro real-time prohlizecove dashboardy bez pollingu
- Oddelujte zpracovani telemetrie → detekci vzoru → udrzbu → smerovani do odlisnych **prioritnich vrstev**
- Architektura se skaluje pridanim novych zon (fakta + skupina) bez zmeny existujicich pravidel

---

Timto konci prirucka Naucte se noex-rules. Prosli jste vsim od zakladnich eventu a faktu pres CEP vzory, persistenci, pozorovatelnost, API, webove rozhrani az po kompletni realne projekty. Vzory a architektury z techto tri projektu — vrstvena pravidla, event-driven pipeline, CEP pro temporalni detekci, fakta pro sdileny stav a integrace externich sluzeb — tvori zaklad pro jakykoli system zalozeny na pravidlech, ktery postavite.
