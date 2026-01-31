# IoT Monitoring Pipeline

This project builds a multi-zone industrial monitoring system. Sensors across multiple physical zones report temperature, pressure, humidity, and heartbeat data. The rule engine processes this telemetry in real-time, detects anomalies using CEP patterns and baselines, schedules maintenance with durable timers, and streams alerts to a live dashboard over SSE. The architecture is organized by zone, with rule groups enabling per-zone configuration.

## What You'll Learn

- How to design a multi-zone sensor monitoring architecture
- Threshold monitoring with per-zone configuration
- Heartbeat monitoring for device health (CEP absence)
- Rolling averages and anomaly detection with baselines
- Maintenance scheduling with durable timers
- Real-time SSE dashboard for live monitoring
- Multi-zone architecture with rule groups
- Complete server setup with REST API and SSE notifications

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    IoT Monitoring Pipeline                               │
│                                                                         │
│  Zones                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│  │ ZONE-A        │  │ ZONE-B        │  │ ZONE-C        │              │
│  │ (Production)  │  │ (Warehouse)   │  │ (Server Room) │              │
│  │ Sensors:      │  │ Sensors:      │  │ Sensors:      │              │
│  │ temp,pressure │  │ temp,humidity │  │ temp          │              │
│  │ vibration     │  │               │  │               │              │
│  └──────┬────────┘  └──────┬────────┘  └──────┬────────┘              │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Layer 1: Telemetry Processing (priority 300)                     │  │
│  │  ├─ threshold-temp        Temperature > zone limit               │  │
│  │  ├─ threshold-pressure    Pressure > zone limit                  │  │
│  │  └─ threshold-humidity    Humidity > zone limit                  │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Layer 2: Pattern Detection (priority 200)                        │  │
│  │  ├─ sensor-offline        No heartbeat in 2 min (CEP absence)   │  │
│  │  ├─ temp-spike            Avg temp > 80°C in 5 min (aggregate)  │  │
│  │  ├─ rapid-fluctuation     10+ anomaly readings in 1 min (count) │  │
│  │  └─ failure-cascade       temp→pressure→vibration (sequence)    │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Layer 3: Maintenance & Scheduling (priority 150)                 │  │
│  │  ├─ schedule-inspection   Set timer on threshold breach          │  │
│  │  ├─ inspection-due        Emit notification on timer expiry      │  │
│  │  └─ cooldown-monitor      Track zone cooldown periods            │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Layer 4: Alert Routing (priority 100)                            │  │
│  │  ├─ route-warning         Send warning to dashboard              │  │
│  │  ├─ route-critical        Page on-call, lock zone                │  │
│  │  └─ zone-status           Update zone health facts               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                            │                                            │
│                            ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ REST API + SSE Dashboard                                         │  │
│  │  GET /api/v1/facts (zone status)    GET /api/v1/stream/events   │  │
│  │  GET /api/v1/stats (engine health)  (live alert feed)           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Complete Implementation

### Part 1: Engine and Rules

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
      console.log(`[TICKET] Zone ${zoneId}: ${type} — ${description}`);
      return { ticketId: `TK-${Date.now()}` };
    },
  };

  const notificationService = {
    send: async (channel: string, message: string, severity: string) => {
      console.log(`[NOTIFY:${severity}] #${channel}: ${message}`);
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
  // ZONE CONFIGURATION
  // ================================================================

  // Define zone-specific thresholds as facts
  const zones = {
    'ZONE-A': {
      name: 'Production Floor', tempMax: 75, pressureMax: 150, humidityMax: 80,
    },
    'ZONE-B': {
      name: 'Warehouse', tempMax: 40, pressureMax: 120, humidityMax: 70,
    },
    'ZONE-C': {
      name: 'Server Room', tempMax: 28, pressureMax: 110, humidityMax: 50,
    },
  };

  for (const [zoneId, config] of Object.entries(zones)) {
    await engine.setFact(`zone:${zoneId}:name`, config.name);
    await engine.setFact(`zone:${zoneId}:tempMax`, config.tempMax);
    await engine.setFact(`zone:${zoneId}:pressureMax`, config.pressureMax);
    await engine.setFact(`zone:${zoneId}:humidityMax`, config.humidityMax);
    await engine.setFact(`zone:${zoneId}:status`, 'healthy');

    // Create a rule group per zone
    engine.createGroup({
      id: `zone-${zoneId}`,
      name: `${config.name} Rules`,
      description: `Rules specific to ${zoneId}`,
      enabled: true,
    });
  }

  // ================================================================
  // LAYER 1: TELEMETRY PROCESSING (priority 300)
  // ================================================================

  // 1. Temperature threshold
  engine.registerRule(
    Rule.create('threshold-temp')
      .name('Temperature Threshold')
      .description('Alert when temperature exceeds zone-specific maximum')
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
      .also(log('warn', 'Temp breach: ${event.sensorId} in ${event.zoneId} = ${event.value}°C'))
      .build()
  );

  // 2. Pressure threshold
  engine.registerRule(
    Rule.create('threshold-pressure')
      .name('Pressure Threshold')
      .description('Alert when pressure exceeds zone-specific maximum')
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
      .also(log('warn', 'Pressure breach: ${event.sensorId} in ${event.zoneId} = ${event.value} PSI'))
      .build()
  );

  // 3. Humidity threshold
  engine.registerRule(
    Rule.create('threshold-humidity')
      .name('Humidity Threshold')
      .description('Alert when humidity exceeds zone-specific maximum')
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
      .also(log('warn', 'Humidity breach: ${event.sensorId} in ${event.zoneId} = ${event.value}%'))
      .build()
  );

  // ================================================================
  // LAYER 2: PATTERN DETECTION (priority 200)
  // ================================================================

  // 4. Sensor offline detection (CEP absence)
  engine.registerRule(
    Rule.create('sensor-offline')
      .name('Sensor Offline Detection')
      .description('Detect when a sensor stops sending heartbeats')
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
      .also(log('error', 'Sensor offline: ${trigger.after.sensorId} in ${trigger.after.zoneId}'))
      .build()
  );

  // 5. Temperature spike: average > 80°C over 5 minutes
  engine.registerRule(
    Rule.create('temp-spike')
      .name('Temperature Spike Detection')
      .description('Detect sustained high temperature over a time window')
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
      .also(log('warn', 'Temp spike: ${trigger.groupKey} avg ${trigger.value}°C over 5m'))
      .build()
  );

  // 6. Rapid fluctuation: sensor malfunction indicator
  engine.registerRule(
    Rule.create('rapid-fluctuation')
      .name('Rapid Sensor Fluctuation')
      .description('Detect potential sensor malfunction from excessive anomalous readings')
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
      .also(log('error', 'Sensor malfunction: ${trigger.groupKey}, ${trigger.count} anomalies in 1m'))
      .build()
  );

  // 7. Failure cascade: temp → pressure → vibration alerts in sequence
  engine.registerRule(
    Rule.create('failure-cascade')
      .name('Multi-Sensor Failure Cascade')
      .description('Detect cascading failure across multiple sensor types')
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
      .also(log('error', 'CRITICAL: Failure cascade in ${trigger.events.0.zoneId}'))
      .build()
  );

  // ================================================================
  // LAYER 3: MAINTENANCE & SCHEDULING (priority 150)
  // ================================================================

  // 8. Schedule inspection on threshold breach
  engine.registerRule(
    Rule.create('schedule-inspection')
      .name('Schedule Maintenance Inspection')
      .description('Create a maintenance timer when a threshold is breached')
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
      .also(log('info', 'Inspection scheduled: ${event.zoneId} ${event.metric} in 4h'))
      .build()
  );

  // 9. Inspection due notification
  engine.registerRule(
    Rule.create('inspection-due')
      .name('Inspection Due Notification')
      .description('Notify maintenance team when inspection timer expires')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('maintenance.inspection_due'))
      .then(callService('maintenanceService', 'createTicket', [
        ref('event.zoneId'),
        'inspection',
        'Scheduled inspection for ${event.metric} in zone ${event.zoneId}. Trigger value: ${event.triggerValue}',
      ]))
      .also(callService('notificationService', 'send', [
        'maintenance',
        'Inspection due: ${event.zoneId} ${event.metric}',
        'info',
      ]))
      .also(deleteFact('maintenance:${event.zoneId}:${event.metric}:scheduled'))
      .also(log('info', 'Inspection due: ${event.zoneId} ${event.metric}'))
      .build()
  );

  // 10. Cooldown monitor: track when zone returns to normal
  engine.registerRule(
    Rule.create('cooldown-monitor')
      .name('Zone Cooldown Monitor')
      .description('Reset zone status when temperature returns to safe levels')
      .priority(150)
      .tags('iot', 'maintenance')
      .when(onEvent('sensor.temperature'))
      .if(event('value').lt(ref('fact.zone:${event.zoneId}:tempMax')))
      .and(fact('zone:${event.zoneId}:status').neq('healthy'))
      .then(setFact('zone:${event.zoneId}:status', 'healthy'))
      .also(emit('zone.recovered', {
        zoneId: ref('event.zoneId'),
      }))
      .also(log('info', 'Zone recovered: ${event.zoneId}'))
      .build()
  );

  // ================================================================
  // LAYER 4: ALERT ROUTING (priority 100)
  // ================================================================

  // 11. Route warning alerts to dashboard
  engine.registerRule(
    Rule.create('route-warning')
      .name('Route Warning Alerts')
      .description('Send warning-level alerts to dashboard channel')
      .priority(100)
      .tags('iot', 'routing')
      .when(onEvent('alert.*'))
      .if(event('severity').eq('warning'))
      .then(callService('notificationService', 'send', [
        'iot-dashboard',
        'WARNING: ${event.metric} breach in ${event.zoneId} — ${event.sensorId} = ${event.value}',
        'warning',
      ]))
      .build()
  );

  // 12. Route critical alerts: page on-call
  engine.registerRule(
    Rule.create('route-critical')
      .name('Route Critical Alerts')
      .description('Page on-call team for critical alerts')
      .priority(100)
      .tags('iot', 'routing')
      .when(onEvent('alert.failure_cascade'))
      .then(callService('notificationService', 'page', [
        'iot-oncall',
        'CRITICAL: Failure cascade in zone ${event.zoneId}',
      ]))
      .also(callService('maintenanceService', 'createTicket', [
        ref('event.zoneId'),
        'emergency',
        'Failure cascade detected — immediate inspection required',
      ]))
      .build()
  );

  // 13. Update zone status facts for dashboard queries
  engine.registerRule(
    Rule.create('zone-status-tracker')
      .name('Zone Status Tracker')
      .description('Keep zone status facts updated for API consumers')
      .priority(100)
      .tags('iot', 'status')
      .when(onEvent('alert.*'))
      .if(event('zoneId').exists())
      .then(setFact('zone:${event.zoneId}:lastAlert', ref('event.topic')))
      .also(setFact('zone:${event.zoneId}:lastAlertTime', '${Date.now()}'))
      .build()
  );

  // 14. Sensor online detection
  engine.registerRule(
    Rule.create('sensor-online')
      .name('Sensor Online Detection')
      .description('Mark sensor as online when heartbeat resumes')
      .priority(100)
      .tags('iot', 'health')
      .when(onEvent('sensor.heartbeat'))
      .if(fact('sensor:${event.sensorId}:status').eq('offline'))
      .then(setFact('sensor:${event.sensorId}:status', 'online'))
      .also(emit('alert.sensor_recovered', {
        sensorId: ref('event.sensorId'),
        zoneId: ref('event.zoneId'),
      }))
      .also(log('info', 'Sensor back online: ${event.sensorId}'))
      .build()
  );

  return engine;
}
```

### Part 2: Server with SSE Dashboard

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules/api';

async function main() {
  const engine = await createMonitoringEngine();

  // Start the API server with SSE
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

  // Register webhook for critical alerts
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
  // SIMULATE SENSOR DATA
  // ================================================================

  console.log('\n=== Simulation Started ===\n');

  // Healthy heartbeats
  for (const sensorId of ['S-A1', 'S-A2', 'S-B1', 'S-C1']) {
    await engine.emit('sensor.heartbeat', {
      sensorId,
      zoneId: sensorId.startsWith('S-A') ? 'ZONE-A' :
              sensorId.startsWith('S-B') ? 'ZONE-B' : 'ZONE-C',
    });
  }

  // Normal readings
  await engine.emit('sensor.temperature', {
    sensorId: 'S-A1', zoneId: 'ZONE-A', value: 65,
  });
  await engine.emit('sensor.pressure', {
    sensorId: 'S-A2', zoneId: 'ZONE-A', value: 120,
  });
  await engine.emit('sensor.temperature', {
    sensorId: 'S-C1', zoneId: 'ZONE-C', value: 22,
  });

  console.log('--- Normal readings processed ---');
  console.log('ZONE-A status:', engine.getFact('zone:ZONE-A:status'));
  console.log('ZONE-C status:', engine.getFact('zone:ZONE-C:status'));

  // Temperature spike in ZONE-A
  console.log('\n--- Simulating temperature spike in ZONE-A ---');
  for (let i = 0; i < 5; i++) {
    await engine.emit('sensor.temperature', {
      sensorId: 'S-A1', zoneId: 'ZONE-A', value: 82 + i,
    });
  }

  console.log('ZONE-A status:', engine.getFact('zone:ZONE-A:status'));

  // Server room overheating
  console.log('\n--- Simulating server room overheating ---');
  await engine.emit('sensor.temperature', {
    sensorId: 'S-C1', zoneId: 'ZONE-C', value: 35,
  });

  console.log('ZONE-C status:', engine.getFact('zone:ZONE-C:status'));

  // Query zone status via API
  console.log('\n--- Zone Status (via facts) ---');
  const allZoneFacts = engine.queryFacts('zone:*:status');
  for (const f of allZoneFacts) {
    console.log(`  ${f.key} = ${f.value}`);
  }

  // Keep server running for SSE clients
  console.log(`\nServer running at ${server.address}`);
  console.log('Press Ctrl+C to stop.');
}

main();
```

### Part 3: SSE Dashboard Client

A simple browser-based dashboard that connects to the SSE stream:

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
  <h2>Live Alerts</h2>
  <div id="alerts"></div>

  <script>
    const SERVER = 'http://localhost:7226';

    // Fetch zone status periodically
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
            <strong>${id}</strong> — ${z.name || 'Unknown'}
            | Status: <strong>${z.status || 'healthy'}</strong>
            | Last Alert: ${z.lastAlert || 'none'}
          </div>
        `).join('');
    }

    // SSE connection for live alerts
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

      // Refresh zone status on any alert
      updateZones();
    };

    events.onerror = () => {
      console.log('SSE connection lost, reconnecting...');
    };

    // Initial load
    updateZones();
    setInterval(updateZones, 10000);
  </script>
</body>
</html>
```

## Detailed Breakdown

### Zone Configuration

Instead of hardcoding thresholds in rules, zone limits are stored as **facts**:

```text
  zone:ZONE-A:tempMax = 75       zone:ZONE-B:tempMax = 40
  zone:ZONE-A:pressureMax = 150  zone:ZONE-B:humidityMax = 70
  zone:ZONE-C:tempMax = 28       ...
```

Rules use `ref('fact.zone:${event.zoneId}:tempMax')` to dynamically look up the zone-specific threshold. This means:

- Thresholds can be changed at runtime via `setFact()` or the REST API — no rule changes needed
- Different zones have different limits appropriate to their purpose (a server room is much more temperature-sensitive than a production floor)
- The UI can display and edit thresholds as plain facts

### CEP Patterns

| Pattern | Type | What It Detects | Time Window |
|---------|------|-----------------|-------------|
| Sensor offline | `absence()` | No heartbeat in 2 minutes | 2m |
| Temperature spike | `aggregate()` avg > 80°C | Sustained overheating | 5m |
| Rapid fluctuation | `count()` 10+ anomalies | Sensor malfunction | 1m |
| Failure cascade | `sequence()` temp → pressure | Multi-sensor failure | 10m |

The failure cascade pattern is particularly important: when temperature rises, pressure often follows, and then vibration increases. Detecting this sequence early allows preemptive shutdown before equipment damage.

### Maintenance Scheduling

The maintenance layer bridges monitoring and operations:

```text
  alert.threshold_breach
       │
       ▼
  ┌────────────────────────┐
  │ schedule-inspection    │
  │ Set timer: 4 hours     │
  │ Set fact: scheduled    │
  └───────────┬────────────┘
              │ (4 hours later)
              ▼
  ┌────────────────────────┐
  │ inspection-due         │
  │ Create ticket          │
  │ Notify maintenance     │
  │ Delete scheduled fact  │
  └────────────────────────┘
```

Timers survive engine restarts when timer persistence is configured. The `scheduled` fact prevents duplicate scheduling — rules can check `fact('maintenance:zoneId:metric:scheduled').exists()` before setting another timer.

### Baseline Anomaly Detection

The engine's baseline system learns normal ranges from historical data:

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

After the training period, the engine knows the normal temperature range per zone. Readings outside 2 standard deviations (the default sensitivity) are flagged as anomalies. This is more adaptive than fixed thresholds — a production floor that normally runs at 70°C won't generate false positives at 72°C, while a server room that normally runs at 22°C will correctly flag 25°C as unusual.

### SSE Dashboard Integration

The SSE endpoint provides a real-time feed with topic filtering:

```
GET /api/v1/stream/events?topics=alert.*,zone.*,maintenance.*
```

The dashboard client receives every alert, zone status change, and maintenance notification as a server-sent event. Combined with periodic fact polling for zone status, this provides a complete real-time view of the monitoring system.

## Exercise

Extend the system with two new capabilities:

1. **Humidity correlation**: If humidity exceeds 90% and temperature exceeds the zone threshold simultaneously (both events within a 5-minute window, same zone), emit an `alert.condensation_risk` event with severity `high`. Use a `sequence()` pattern.

2. **Auto-shutdown rule**: When a `alert.failure_cascade` event fires, set a timer for 5 minutes. If the zone status is still `critical` when the timer expires (check the fact), emit `maintenance.emergency_shutdown` and call `notificationService.page` for the operations team.

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, onEvent, onTimer, event, fact,
  emit, setFact, setTimer, callService, log, ref,
  sequence,
} from '@hamicek/noex-rules/dsl';

// 1. Humidity + temperature correlation
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
    .also(log('warn', 'Condensation risk: ${trigger.events.0.zoneId}'))
    .build()
);

// 2. Auto-shutdown after failure cascade
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
    .also(log('warn', 'Auto-shutdown timer set: ${event.zoneId} in 5m'))
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
      reason: 'Zone still critical after 5-minute grace period',
    }))
    .also(setFact('zone:${event.zoneId}:status', 'shutdown'))
    .also(callService('notificationService', 'page', [
      'operations',
      'EMERGENCY SHUTDOWN: Zone ${event.zoneId} — still critical after grace period',
    ]))
    .also(log('error', 'EMERGENCY SHUTDOWN: ${event.zoneId}'))
    .build()
);
```

The condensation risk rule detects a dangerous combination: when both humidity and temperature breach their thresholds in the same zone within 5 minutes, condensation can form on equipment. The auto-shutdown uses a two-phase approach: set a timer on cascade detection, then check the zone status when the timer expires. If the zone recovered during the 5-minute grace period, no action is taken. If it's still critical, the shutdown is triggered.

</details>

## Summary

- Store zone thresholds as **facts** for runtime configurability — no rule changes needed to adjust limits
- Use **rule groups** per zone to enable/disable monitoring for specific areas during maintenance windows
- Use `absence()` for **heartbeat monitoring** — the most reliable way to detect offline sensors
- Use `aggregate()` for **sustained anomaly detection** — catches trends that individual readings miss
- Use `sequence()` for **cascade detection** — ordered multi-sensor failures indicate serious problems
- Use `count()` for **sensor diagnostics** — rapid anomalous readings often indicate hardware failure
- Schedule maintenance with **durable timers** — survives restarts, creates audit trail
- Use **baseline anomaly detection** for adaptive thresholds that learn from historical data
- Expose zone status as **facts** queryable via REST API for dashboards and external systems
- Stream alerts via **SSE** for real-time browser dashboards without polling
- Separate telemetry processing → pattern detection → maintenance → routing into distinct **priority layers**
- The architecture scales by adding new zones (facts + group) without changing existing rules

---

This concludes the Learning noex-rules guide. You've covered everything from basic events and facts through CEP patterns, persistence, observability, APIs, the Web UI, and now complete real-world projects. The patterns and architectures from these three projects — layered rules, event-driven pipelines, CEP for temporal detection, facts for shared state, and external service integration — form the foundation for any rule-based system you build.
