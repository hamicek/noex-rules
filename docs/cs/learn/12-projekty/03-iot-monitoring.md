# IoT monitoring pipeline

Tento projekt buduje vícezónový průmyslový monitorovací systém. Senzory rozmístěné přes více fyzických zón hlásí teplotu, tlak, vlhkost a heartbeat data. Pravidlový engine zpracovává tuto telemetrii v reálném čase, detekuje anomálie pomocí CEP vzorů a baselinů, plánuje údržbu s trvanlivými časovači a streamuje alerty na živý dashboard přes SSE. Architektura je organizována podle zón, se skupinami pravidel umožňujícími konfiguraci pro jednotlivé zóny.

## Co se naučíte

- Jak navrhnout vícezónovou architekturu monitoringu senzorů
- Monitoring prahových hodnot s konfigurací pro jednotlivé zóny
- Monitoring heartbeatu pro zdraví zařízení (CEP absence)
- Klouzavé průměry a detekce anomálií s baselinami
- Plánování údržby s trvanlivými časovači
- Real-time SSE dashboard pro živý monitoring
- Vícezónová architektura se skupinami pravidel
- Kompletní nastavení serveru s REST API a SSE notifikacemi

## Přehled architektury

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    IoT monitoring pipeline                               │
│                                                                         │
│  Zóny                                                                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│  │ ZONE-A        │  │ ZONE-B        │  │ ZONE-C        │              │
│  │ (Výroba)      │  │ (Sklad)       │  │ (Serverovna)  │              │
│  │ Senzory:      │  │ Senzory:      │  │ Senzory:      │              │
│  │ tepl,tlak     │  │ tepl,vlhkost │  │ teplota       │              │
│  │ vibrace       │  │               │  │               │              │
│  └──────┬────────┘  └──────┬────────┘  └──────┬────────┘              │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Vrstva 1: Zpracování telemetrie (priorita 300)                   │  │
│  │  ├─ threshold-temp        Teplota > limit zóny                   │  │
│  │  ├─ threshold-pressure    Tlak > limit zóny                      │  │
│  │  └─ threshold-humidity    Vlhkost > limit zóny                   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Vrstva 2: Detekce vzorů (priorita 200)                           │  │
│  │  ├─ sensor-offline        Žádný heartbeat 2 min (CEP absence)   │  │
│  │  ├─ temp-spike            Průměr tepl > 80°C za 5 min (aggregate)│  │
│  │  ├─ rapid-fluctuation     10+ anomálních čtení za 1 min (count) │  │
│  │  └─ failure-cascade       tepl→tlak→vibrace (sequence)          │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Vrstva 3: Údržba a plánování (priorita 150)                     │  │
│  │  ├─ schedule-inspection   Nastavení časovače při překročení      │  │
│  │  ├─ inspection-due        Emitování notifikace při expiraci      │  │
│  │  └─ cooldown-monitor      Sledování období ochlazení zóny        │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Vrstva 4: Směrování alertů (priorita 100)                       │  │
│  │  ├─ route-warning         Odeslání varování na dashboard         │  │
│  │  ├─ route-critical        Přivolání pohotovosti, zamčení zóny    │  │
│  │  └─ zone-status           Aktualizace faktů zdraví zóny          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                            │                                            │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ REST API + SSE Dashboard                                         │  │
│  │  GET /api/v1/facts (stav zón)       GET /api/v1/stream/events   │  │
│  │  GET /api/v1/stats (zdraví enginu)  (živý feed alertů)          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Kompletní implementace

### Část 1: Engine a pravidla

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
      console.log(`[TIKET] Zóna ${zoneId}: ${type} — ${description}`);
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
  // KONFIGURACE ZÓN
  // ================================================================

  // Definice prahových hodnot pro jednotlivé zóny jako faktů
  const zones = {
    'ZONE-A': {
      name: 'Výrobní hala', tempMax: 75, pressureMax: 150, humidityMax: 80,
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

    // Vytvoření skupiny pravidel pro každou zónu
    engine.createGroup({
      id: `zone-${zoneId}`,
      name: `Pravidla ${config.name}`,
      description: `Pravidla specifická pro ${zoneId}`,
      enabled: true,
    });
  }

  // ================================================================
  // VRSTVA 1: ZPRACOVÁNÍ TELEMETRIE (priorita 300)
  // ================================================================

  // 1. Práh teploty
  engine.registerRule(
    Rule.create('threshold-temp')
      .name('Temperature Threshold')
      .description('Alert při překročení zónově specifického maxima teploty')
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
      .also(log('warn', 'Překročení teploty: ${event.sensorId} v ${event.zoneId} = ${event.value}°C'))
      .build()
  );

  // 2. Práh tlaku
  engine.registerRule(
    Rule.create('threshold-pressure')
      .name('Pressure Threshold')
      .description('Alert při překročení zónově specifického maxima tlaku')
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
      .also(log('warn', 'Překročení tlaku: ${event.sensorId} v ${event.zoneId} = ${event.value} PSI'))
      .build()
  );

  // 3. Práh vlhkosti
  engine.registerRule(
    Rule.create('threshold-humidity')
      .name('Humidity Threshold')
      .description('Alert při překročení zónově specifického maxima vlhkosti')
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
      .also(log('warn', 'Překročení vlhkosti: ${event.sensorId} v ${event.zoneId} = ${event.value}%'))
      .build()
  );

  // ================================================================
  // VRSTVA 2: DETEKCE VZORŮ (priorita 200)
  // ================================================================

  // 4. Detekce offline senzoru (CEP absence)
  engine.registerRule(
    Rule.create('sensor-offline')
      .name('Sensor Offline Detection')
      .description('Detekce zastavení odesílání heartbeatu senzorem')
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

  // 5. Teplotní špička: průměr > 80°C za 5 minut
  engine.registerRule(
    Rule.create('temp-spike')
      .name('Temperature Spike Detection')
      .description('Detekce trvale vysoké teploty v časovém okně')
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
      .also(log('warn', 'Teplotní špička: ${trigger.groupKey} průměr ${trigger.value}°C za 5m'))
      .build()
  );

  // 6. Rychlé výkyvy: indikátor poruchy senzoru
  engine.registerRule(
    Rule.create('rapid-fluctuation')
      .name('Rapid Sensor Fluctuation')
      .description('Detekce potenciální poruchy senzoru z nadměrných anomálních čtení')
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
      .also(log('error', 'Porucha senzoru: ${trigger.groupKey}, ${trigger.count} anomálií za 1m'))
      .build()
  );

  // 7. Kaskáda selhání: alerty teploty → tlaku → vibrací v sekvenci
  engine.registerRule(
    Rule.create('failure-cascade')
      .name('Multi-Sensor Failure Cascade')
      .description('Detekce kaskádového selhání přes více typů senzorů')
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
      .also(log('error', 'KRITICKÉ: Kaskáda selhání v ${trigger.events.0.zoneId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 3: ÚDRŽBA A PLÁNOVÁNÍ (priorita 150)
  // ================================================================

  // 8. Naplánování inspekce při překročení prahu
  engine.registerRule(
    Rule.create('schedule-inspection')
      .name('Schedule Maintenance Inspection')
      .description('Vytvoření časovače údržby při překročení prahové hodnoty')
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
      .also(log('info', 'Inspekce naplánována: ${event.zoneId} ${event.metric} za 4h'))
      .build()
  );

  // 9. Notifikace o nutné inspekci
  engine.registerRule(
    Rule.create('inspection-due')
      .name('Inspection Due Notification')
      .description('Upozornění týmu údržby při expiraci časovače inspekce')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('maintenance.inspection_due'))
      .then(callService('maintenanceService', 'createTicket', [
        ref('event.zoneId'),
        'inspection',
        'Plánovaná inspekce pro ${event.metric} v zóně ${event.zoneId}. Spouštěcí hodnota: ${event.triggerValue}',
      ]))
      .also(callService('notificationService', 'send', [
        'maintenance',
        'Inspekce nutná: ${event.zoneId} ${event.metric}',
        'info',
      ]))
      .also(deleteFact('maintenance:${event.zoneId}:${event.metric}:scheduled'))
      .also(log('info', 'Inspekce nutná: ${event.zoneId} ${event.metric}'))
      .build()
  );

  // 10. Monitor ochlazení: sledování návratu zóny do normálu
  engine.registerRule(
    Rule.create('cooldown-monitor')
      .name('Zone Cooldown Monitor')
      .description('Reset stavu zóny při návratu teploty na bezpečnou úroveň')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('sensor.temperature'))
      .if(event('value').lt(ref('fact.zone:${event.zoneId}:tempMax')))
      .and(fact('zone:${event.zoneId}:status').neq('healthy'))
      .then(setFact('zone:${event.zoneId}:status', 'healthy'))
      .also(emit('zone.recovered', {
        zoneId: ref('event.zoneId'),
      }))
      .also(log('info', 'Zóna obnovena: ${event.zoneId}'))
      .build()
  );

  // ================================================================
  // VRSTVA 4: SMĚROVÁNÍ ALERTŮ (priorita 100)
  // ================================================================

  // 11. Směrování varovných alertů na dashboard
  engine.registerRule(
    Rule.create('route-warning')
      .name('Route Warning Alerts')
      .description('Odeslání alertů úrovně varování na dashboard kanál')
      .priority(100)
      .tags('iot', 'routing')
      .when(onEvent('alert.*'))
      .if(event('severity').eq('warning'))
      .then(callService('notificationService', 'send', [
        'iot-dashboard',
        'VAROVÁNÍ: překročení ${event.metric} v ${event.zoneId} — ${event.sensorId} = ${event.value}',
        'warning',
      ]))
      .build()
  );

  // 12. Směrování kritických alertů: přivolání pohotovosti
  engine.registerRule(
    Rule.create('route-critical')
      .name('Route Critical Alerts')
      .description('Přivolání pohotovostního týmu pro kritické alerty')
      .priority(100)
      .tags('iot', 'routing')
      .when(onEvent('alert.failure_cascade'))
      .then(callService('notificationService', 'page', [
        'iot-oncall',
        'KRITICKÉ: Kaskáda selhání v zóně ${event.zoneId}',
      ]))
      .also(callService('maintenanceService', 'createTicket', [
        ref('event.zoneId'),
        'emergency',
        'Detekována kaskáda selhání — nutná okamžitá inspekce',
      ]))
      .build()
  );

  // 13. Aktualizace faktů stavu zóny pro dotazy dashboardu
  engine.registerRule(
    Rule.create('zone-status-tracker')
      .name('Zone Status Tracker')
      .description('Udržování faktů stavu zóny aktuálních pro konzumenty API')
      .priority(100)
      .tags('iot', 'status')
      .when(onEvent('alert.*'))
      .if(event('zoneId').exists())
      .then(setFact('zone:${event.zoneId}:lastAlert', ref('event.topic')))
      .also(setFact('zone:${event.zoneId}:lastAlertTime', '${Date.now()}'))
      .build()
  );

  // 14. Detekce návratu senzoru online
  engine.registerRule(
    Rule.create('sensor-online')
      .name('Sensor Online Detection')
      .description('Označení senzoru jako online při obnovení heartbeatu')
      .priority(100)
      .tags('iot', 'health')
      .when(onEvent('sensor.heartbeat'))
      .if(fact('sensor:${event.sensorId}:status').eq('offline'))
      .then(setFact('sensor:${event.sensorId}:status', 'online'))
      .also(emit('alert.sensor_recovered', {
        sensorId: ref('event.sensorId'),
        zoneId: ref('event.zoneId'),
      }))
      .also(log('info', 'Senzor zpět online: ${event.sensorId}'))
      .build()
  );

  return engine;
}
```

### Část 2: Server s SSE dashboardem

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules/api';

async function main() {
  const engine = await createMonitoringEngine();

  // Spuštění API serveru s SSE
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

  // Registrace webhooku pro kritické alerty
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
  // SIMULACE SENZOROVÝCH DAT
  // ================================================================

  console.log('\n=== Simulace spuštěna ===\n');

  // Zdravé heartbeaty
  for (const sensorId of ['S-A1', 'S-A2', 'S-B1', 'S-C1']) {
    await engine.emit('sensor.heartbeat', {
      sensorId,
      zoneId: sensorId.startsWith('S-A') ? 'ZONE-A' :
              sensorId.startsWith('S-B') ? 'ZONE-B' : 'ZONE-C',
    });
  }

  // Normální čtení
  await engine.emit('sensor.temperature', {
    sensorId: 'S-A1', zoneId: 'ZONE-A', value: 65,
  });
  await engine.emit('sensor.pressure', {
    sensorId: 'S-A2', zoneId: 'ZONE-A', value: 120,
  });
  await engine.emit('sensor.temperature', {
    sensorId: 'S-C1', zoneId: 'ZONE-C', value: 22,
  });

  console.log('--- Normální čtení zpracována ---');
  console.log('Stav ZONE-A:', engine.getFact('zone:ZONE-A:status'));
  console.log('Stav ZONE-C:', engine.getFact('zone:ZONE-C:status'));

  // Teplotní špička v ZONE-A
  console.log('\n--- Simulace teplotní špičky v ZONE-A ---');
  for (let i = 0; i < 5; i++) {
    await engine.emit('sensor.temperature', {
      sensorId: 'S-A1', zoneId: 'ZONE-A', value: 82 + i,
    });
  }

  console.log('Stav ZONE-A:', engine.getFact('zone:ZONE-A:status'));

  // Přehřívání serverovny
  console.log('\n--- Simulace přehřívání serverovny ---');
  await engine.emit('sensor.temperature', {
    sensorId: 'S-C1', zoneId: 'ZONE-C', value: 35,
  });

  console.log('Stav ZONE-C:', engine.getFact('zone:ZONE-C:status'));

  // Dotaz na stav zón přes API
  console.log('\n--- Stav zón (přes fakta) ---');
  const allZoneFacts = engine.queryFacts('zone:*:status');
  for (const f of allZoneFacts) {
    console.log(`  ${f.key} = ${f.value}`);
  }

  // Server běží pro SSE klienty
  console.log(`\nServer běží na ${server.address}`);
  console.log('Stiskněte Ctrl+C pro zastavení.');
}

main();
```

### Část 3: Klient SSE dashboardu

Jednoduchý dashboard založený na prohlížeči, který se připojuje k SSE streamu:

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
  <h2>Živé alerty</h2>
  <div id="alerts"></div>

  <script>
    const SERVER = 'http://localhost:7226';

    // Periodické načítání stavu zón
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
            <strong>${id}</strong> — ${z.name || 'Neznámá'}
            | Stav: <strong>${z.status || 'healthy'}</strong>
            | Poslední alert: ${z.lastAlert || 'žádný'}
          </div>
        `).join('');
    }

    // SSE připojení pro živé alerty
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

      // Obnovení stavu zón při každém alertu
      updateZones();
    };

    events.onerror = () => {
      console.log('SSE připojení ztraceno, probíhá znovupřipojení...');
    };

    // Počáteční načtení
    updateZones();
    setInterval(updateZones, 10000);
  </script>
</body>
</html>
```

## Detailní rozbor

### Konfigurace zón

Místo hardcodovaných prahových hodnot v pravidlech jsou limity zón uloženy jako **fakta**:

```text
  zone:ZONE-A:tempMax = 75       zone:ZONE-B:tempMax = 40
  zone:ZONE-A:pressureMax = 150  zone:ZONE-B:humidityMax = 70
  zone:ZONE-C:tempMax = 28       ...
```

Pravidla používají `ref('fact.zone:${event.zoneId}:tempMax')` pro dynamické vyhledání zónově specifického prahu. To znamená:

- Prahy lze měnit za běhu přes `setFact()` nebo REST API — žádné změny pravidel nejsou potřeba
- Různé zóny mají různé limity odpovídající jejich účelu (serverovna je mnohem citlivější na teplotu než výrobní hala)
- UI může zobrazovat a upravovat prahy jako obyčejné fakta

### CEP vzory

| Vzor | Typ | Co detekuje | Časové okno |
|------|-----|-------------|-------------|
| Senzor offline | `absence()` | Žádný heartbeat za 2 minuty | 2m |
| Teplotní špička | `aggregate()` průměr > 80°C | Trvalé přehřívání | 5m |
| Rychlé výkyvy | `count()` 10+ anomálií | Porucha senzoru | 1m |
| Kaskáda selhání | `sequence()` teplota → tlak | Vícesenzorové selhání | 10m |

Vzor kaskády selhání je obzvláště důležitý: když teplota stoupne, tlak často následuje a pak se zvýší vibrace. Včasná detekce této sekvence umožňuje preventivní odstavení před poškozením zařízení.

### Plánování údržby

Vrstva údržby přemosťuje monitoring a provoz:

```text
  alert.threshold_breach
       │
       ▼
  ┌────────────────────────┐
  │ schedule-inspection    │
  │ Nastavení časovače: 4h │
  │ Nastavení faktu: sched.│
  └───────────┬────────────┘
              │ (za 4 hodiny)
              ▼
  ┌────────────────────────┐
  │ inspection-due         │
  │ Vytvoření tiketu       │
  │ Upozornění údržby      │
  │ Smazání faktu sched.   │
  └────────────────────────┘
```

Časovače přežijí restarty enginu, pokud je nakonfigurována persistence časovačů. Fakt `scheduled` brání duplicitnímu plánování — pravidla mohou kontrolovat `fact('maintenance:zoneId:metric:scheduled').exists()` před nastavením dalšího časovače.

### Detekce anomálií pomocí baselinů

Baseline systém enginu se učí normální rozsahy z historických dat:

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

Po trénovacím období engine zná normální teplotní rozsah pro každou zónu. Čtení mimo 2 standardní odchylky (výchozí citlivost) jsou označena jako anomálie. Toto je adaptivnější než fixní prahy — výrobní hala, která normálně běží na 70°C, negeneruje falešné poplachy při 72°C, zatímco serverovna, která normálně běží na 22°C, správně označí 25°C jako neobvyklou.

### Integrace SSE dashboardu

SSE endpoint poskytuje real-time feed s filtrováním topiků:

```
GET /api/v1/stream/events?topics=alert.*,zone.*,maintenance.*
```

Klient dashboardu přijímá každý alert, změnu stavu zóny a notifikaci údržby jako server-sent event. V kombinaci s periodickým dotazováním faktů pro stav zón to poskytuje kompletní real-time pohled na monitorovací systém.

## Cvičení

Rozšiřte systém o dvě nové schopnosti:

1. **Korelace vlhkosti**: Pokud vlhkost přesáhne 90% a teplota přesáhne práh zóny současně (oba eventy v 5minutovém okně, stejná zóna), emitujte event `alert.condensation_risk` se závažností `high`. Použijte vzor `sequence()`.

2. **Automatické odstavení**: Když se spustí event `alert.failure_cascade`, nastavte časovač na 5 minut. Pokud je stav zóny stále `critical` při expiraci časovače (kontrola faktu), emitujte `maintenance.emergency_shutdown` a zavolejte `notificationService.page` pro provozní tým.

<details>
<summary>Řešení</summary>

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

// 2. Automatické odstavení po kaskádě selhání
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
    .also(log('warn', 'Časovač automatického odstavení nastaven: ${event.zoneId} za 5m'))
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
      reason: 'Zóna stále kritická po 5minutovém odkladném období',
    }))
    .also(setFact('zone:${event.zoneId}:status', 'shutdown'))
    .also(callService('notificationService', 'page', [
      'operations',
      'NOUZOVÉ ODSTAVENÍ: Zóna ${event.zoneId} — stále kritická po odkladném období',
    ]))
    .also(log('error', 'NOUZOVÉ ODSTAVENÍ: ${event.zoneId}'))
    .build()
);
```

Pravidlo rizika kondenzace detekuje nebezpečnou kombinaci: když vlhkost i teplota překročí své prahy ve stejné zóně během 5 minut, může se na zařízeních tvořit kondenzace. Automatické odstavení používá dvoufázový přístup: nastavení časovače při detekci kaskády, pak kontrola stavu zóny při expiraci časovače. Pokud se zóna během 5minutového odkladného období zotavila, žádná akce se neprovede. Pokud je stále kritická, spustí se odstavení.

</details>

## Shrnutí

- Ukládejte prahy zón jako **fakta** pro konfigurovatelnost za běhu — žádné změny pravidel nejsou potřeba pro úpravu limitů
- Používejte **skupiny pravidel** pro jednotlivé zóny pro povolení/zakázání monitoringu v konkrétních oblastech během údržby
- Používejte `absence()` pro **monitoring heartbeatu** — nejspolehlivější způsob detekce offline senzorů
- Používejte `aggregate()` pro **detekci trvalých anomálií** — zachycuje trendy, které jednotlivá čtení minou
- Používejte `sequence()` pro **detekci kaskád** — uspořádané vícestupňové selhání indikuje vážné problémy
- Používejte `count()` pro **diagnostiku senzorů** — rychlá anomální čtení často indikují selhání hardware
- Plánujte údržbu s **trvanlivými časovači** — přežijí restarty, vytvářejí audit trail
- Používejte **detekci anomálií pomocí baselinů** pro adaptivní prahy, které se učí z historických dat
- Vystavujte stav zón jako **fakta** dotazovatelná přes REST API pro dashboardy a externí systémy
- Streamujte alerty přes **SSE** pro real-time prohlížečové dashboardy bez pollingu
- Oddělujte zpracování telemetrie → detekci vzorů → údržbu → směrování do odlišných **prioritních vrstev**
- Architektura se škáluje přidáním nových zón (fakta + skupina) bez změny existujících pravidel

---

Tímto končí příručka Naučte se noex-rules. Prošli jste vším od základních eventů a faktů přes CEP vzory, persistenci, pozorovatelnost, API, webové rozhraní až po kompletní reálné projekty. Vzory a architektury z těchto tří projektů — vrstvená pravidla, event-driven pipeline, CEP pro temporální detekci, fakta pro sdílený stav a integrace externích služeb — tvoří základ pro jakýkoli systém založený na pravidlech, který postavíte.
