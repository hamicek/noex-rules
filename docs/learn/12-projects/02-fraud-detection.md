# Fraud Detection System

This project builds a multi-layer fraud detection pipeline. Instead of a monolithic fraud check at a single point, you'll build a system where independent detectors run in parallel, each feeding risk signals into a scoring engine that decides when to escalate. The architecture separates **detection** from **scoring** from **response**, making it straightforward to add new detection patterns without touching existing logic.

## What You'll Learn

- How to design a layered detection → scoring → response architecture
- Login anomaly detection with brute force protection (CEP count)
- Transaction velocity monitoring (CEP aggregate)
- Impossible travel detection (CEP sequence)
- Device fingerprint anomaly detection
- Risk scoring engine that accumulates signals
- Graduated alert escalation with external service integration
- Using data requirements for IP geolocation lookups

## Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                    Fraud Detection Pipeline                             │
│                                                                        │
│  Layer 1: Detectors (parallel, independent)          Priority: 300     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Brute Force  │ │ Transaction  │ │ Impossible   │ │ New Device   │ │
│  │ count()      │ │ Velocity     │ │ Travel       │ │ Login        │ │
│  │ 5 failures   │ │ aggregate()  │ │ sequence()   │ │ onEvent()    │ │
│  │ in 5 min     │ │ $10K in 1h   │ │ 2 logins     │ │ + fact check │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ │
│         │                │                │                │          │
│         └────────────────┼────────────────┼────────────────┘          │
│                          ▼                ▼                            │
│  Layer 2: Risk Scoring                               Priority: 200    │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ Each detector emits risk.signal with { userId, category, score } │  │
│  │                                                                  │  │
│  │ score-accumulator: sets fact risk:userId:category = score        │  │
│  │ score-aggregate:   aggregate() risk.signal.score sum > 70 → alert│  │
│  └────────────────────────────────┬───────────────────────────────┘   │
│                                   │                                    │
│  Layer 3: Response                │                       Priority: 100│
│  ┌────────────────────────────────▼───────────────────────────────┐   │
│  │ risk < 50:  log only                                           │   │
│  │ risk 50-80: flag account, notify security team                 │   │
│  │ risk > 80:  lock account, page on-call, block transactions     │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Complete Implementation

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, event, fact,
  emit, setFact, callService, log, ref,
  sequence, count, aggregate,
} from '@hamicek/noex-rules/dsl';

async function main() {
  // External services
  const geoService = {
    locate: async (ip: string) => {
      // In production: MaxMind, ip-api, etc.
      const locations: Record<string, { lat: number; lon: number; country: string }> = {
        '192.168.1.1': { lat: 50.08, lon: 14.43, country: 'CZ' },
        '10.0.0.1': { lat: 40.71, lon: -74.01, country: 'US' },
        '172.16.0.1': { lat: 35.68, lon: 139.69, country: 'JP' },
      };
      return locations[ip] ?? { lat: 0, lon: 0, country: 'UNKNOWN' };
    },
    distance: async (lat1: number, lon1: number, lat2: number, lon2: number) => {
      // Haversine distance in km
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
      console.log(`[LOCK] Account ${userId} locked: ${reason}`);
    },
    flag: async (userId: string, reason: string) => {
      console.log(`[FLAG] Account ${userId} flagged: ${reason}`);
    },
  };

  const engine = await RuleEngine.start({
    name: 'fraud-detection',
    services: { geoService, alertService, accountService },
  });

  // ================================================================
  // LAYER 1: DETECTORS (priority 300)
  // ================================================================

  // 1. Brute force detection: 5+ failed logins in 5 minutes
  engine.registerRule(
    Rule.create('detect-brute-force')
      .name('Brute Force Detector')
      .description('Detect repeated login failures indicating credential stuffing')
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
      .also(log('warn', 'Brute force detected: ${trigger.groupKey}, ${trigger.count} attempts'))
      .build()
  );

  // 2. Transaction velocity: total transfers > $10,000 in 1 hour
  engine.registerRule(
    Rule.create('detect-tx-velocity')
      .name('Transaction Velocity Detector')
      .description('Detect high-value transaction bursts')
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
      .also(log('warn', 'Transaction velocity alert: ${trigger.groupKey}, total $${trigger.value}'))
      .build()
  );

  // 3. Impossible travel: logins from distant locations within 1 hour
  engine.registerRule(
    Rule.create('detect-impossible-travel')
      .name('Impossible Travel Detector')
      .description('Detect logins from geographically impossible locations')
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

  // 3b. Process travel check with geo lookup
  engine.registerRule(
    Rule.create('process-travel-check')
      .name('Process Travel Distance')
      .description('Calculate distance between login locations and score if impossible')
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
      .also(log('warn', 'Impossible travel: ${event.userId} from ${event.country1} to ${event.country2}'))
      .build()
  );

  // 4. New device login detection
  engine.registerRule(
    Rule.create('detect-new-device')
      .name('New Device Login Detector')
      .description('Detect login from previously unseen device')
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
      .also(log('info', 'New device login: ${event.userId} from ${event.deviceId}'))
      .build()
  );

  // 5. Rapid account changes after login
  engine.registerRule(
    Rule.create('detect-account-takeover')
      .name('Account Takeover Pattern')
      .description('Detect login followed by sensitive changes within 10 minutes')
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
      .also(log('error', 'Account takeover pattern: ${trigger.events.0.userId}'))
      .build()
  );

  // ================================================================
  // LAYER 2: RISK SCORING (priority 200)
  // ================================================================

  // 6. Accumulate risk signals as facts
  engine.registerRule(
    Rule.create('score-accumulator')
      .name('Risk Score Accumulator')
      .description('Store each risk signal as a fact for audit trail')
      .priority(200)
      .tags('fraud', 'scoring')
      .when(onEvent('risk.signal'))
      .then(setFact('risk:${event.userId}:${event.category}', ref('event.score')))
      .also(setFact('risk:${event.userId}:lastSignal', ref('event.category')))
      .also(log('info', 'Risk signal: ${event.userId} +${event.score} (${event.category})'))
      .build()
  );

  // 7. Aggregate risk score over time window
  engine.registerRule(
    Rule.create('score-threshold-medium')
      .name('Medium Risk Threshold')
      .description('Trigger medium alert when risk score exceeds 50 in 1 hour')
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

  // 8. High risk threshold
  engine.registerRule(
    Rule.create('score-threshold-high')
      .name('High Risk Threshold')
      .description('Trigger critical alert when risk score exceeds 80 in 1 hour')
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
  // LAYER 3: RESPONSE (priority 100)
  // ================================================================

  // 9. Medium severity response: flag account
  engine.registerRule(
    Rule.create('response-medium')
      .name('Medium Risk Response')
      .description('Flag account and notify security team on medium risk')
      .priority(100)
      .tags('fraud', 'response')
      .when(onEvent('fraud.alert'))
      .if(event('severity').eq('medium'))
      .then(setFact('user:${event.userId}:riskLevel', 'medium'))
      .also(callService('accountService', 'flag', [
        ref('event.userId'),
        'Risk score ${event.totalRisk}',
      ]))
      .also(callService('alertService', 'notify', [
        'fraud-alerts',
        'Medium risk: user ${event.userId}, score ${event.totalRisk}',
        'medium',
      ]))
      .also(log('warn', 'MEDIUM RISK: ${event.userId}, score ${event.totalRisk}'))
      .build()
  );

  // 10. Critical severity response: lock account
  engine.registerRule(
    Rule.create('response-critical')
      .name('Critical Risk Response')
      .description('Lock account and page on-call on critical risk')
      .priority(100)
      .tags('fraud', 'response')
      .when(onEvent('fraud.alert'))
      .if(event('severity').eq('critical'))
      .then(setFact('user:${event.userId}:riskLevel', 'critical'))
      .also(setFact('user:${event.userId}:locked', true))
      .also(callService('accountService', 'lock', [
        ref('event.userId'),
        'Critical risk score ${event.totalRisk}',
      ]))
      .also(callService('alertService', 'page', [
        'security-oncall',
        'CRITICAL: user ${event.userId}, risk score ${event.totalRisk}',
      ]))
      .also(log('error', 'CRITICAL RISK: ${event.userId}, score ${event.totalRisk}'))
      .build()
  );

  // 11. Audit trail for all fraud alerts
  engine.registerRule(
    Rule.create('fraud-audit')
      .name('Fraud Alert Audit Log')
      .description('Record all fraud alerts for compliance')
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
  // SIMULATION
  // ================================================================

  console.log('=== Fraud Detection System Started ===\n');

  // Subscribe to fraud events
  engine.subscribe('risk.*', (event) => {
    console.log(`[RISK] ${event.topic}:`, event.data);
  });

  engine.subscribe('fraud.*', (event) => {
    console.log(`[FRAUD] ${event.topic}:`, event.data);
  });

  // Scenario 1: Brute force attack
  console.log('--- Scenario 1: Brute Force Attack ---');
  for (let i = 0; i < 6; i++) {
    await engine.emit('auth.login_failed', {
      userId: 'U-200',
      ip: '10.0.0.1',
      reason: 'invalid_password',
    });
  }

  // Scenario 2: New device + email change (account takeover)
  console.log('\n--- Scenario 2: Account Takeover Pattern ---');
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

  // Check accumulated risk
  console.log('\n=== Risk Assessment ===');
  console.log('Brute force score:', engine.getFact('risk:U-200:brute_force'));
  console.log('New device score:', engine.getFact('risk:U-200:new_device'));
  console.log('Takeover score:', engine.getFact('risk:U-200:account_takeover'));
  console.log('Risk level:', engine.getFact('user:U-200:riskLevel'));
  console.log('Locked:', engine.getFact('user:U-200:locked'));

  await engine.stop();
  console.log('\nEngine stopped.');
}

main();
```

## Detailed Breakdown

### Detection Layer

Each detector runs independently and produces standardized `risk.signal` events:

```typescript
emit('risk.signal', {
  userId: '...',
  category: 'brute_force',   // Unique category per detector
  score: 30,                  // Risk weight
  details: { ... },           // Detector-specific context
})
```

This contract means detectors don't know about each other. Adding a new detector is a single rule that emits `risk.signal` — no changes to scoring or response rules.

| Detector | CEP Pattern | Score | What It Catches |
|----------|-------------|-------|-----------------|
| Brute force | `count()` 5 in 5m | 30 | Credential stuffing, password guessing |
| TX velocity | `aggregate()` sum > $10K/1h | 40 | Money laundering, stolen card rapid use |
| Impossible travel | `sequence()` 2 logins/1h | 50 | Compromised credentials used from remote location |
| New device | `onEvent()` + fact check | 15 | First login from unknown device |
| Account takeover | `sequence()` login + email change/10m | 60 | Attacker changing recovery email after compromise |

### Scoring Layer

The scoring layer uses two mechanisms:

1. **Fact accumulation**: Each signal is stored as `risk:userId:category = score`. This provides a queryable snapshot of active risk factors per user.

2. **Temporal aggregation**: The `aggregate()` pattern sums risk signal scores per user over a 1-hour window. Two threshold rules fire at different levels:

```text
  risk.signal events (per user, 1 hour window)
       │
       ├──── sum >= 50  ──→ fraud.alert { severity: 'medium' }
       └──── sum >= 80  ──→ fraud.alert { severity: 'critical' }
```

Both thresholds can fire for the same user — a medium alert fires first, and if more signals arrive pushing the total above 80, a critical alert follows.

### Response Layer

Responses are graduated based on severity:

| Severity | Actions |
|----------|---------|
| Medium (50-80) | Flag account, notify `#fraud-alerts` channel |
| Critical (> 80) | Lock account, page on-call team, set locked fact |

The response rules call external services (`accountService.lock`, `alertService.page`) to integrate with real infrastructure. The fact `user:ID:locked` can be checked by other systems (API gateway, login service) to block access.

### Data Flow Example

Here's how signals accumulate for a single user during an attack:

```text
  Time   Event                    Detector              Score  Total
  ─────  ─────────────────────    ──────────────────    ─────  ─────
  0:00   5x login_failed          brute_force           +30     30
  0:02   login from new device    new_device            +15     45
  0:03   email changed            account_takeover      +60    105
                                                                 │
                                  medium threshold (50) ◄────────┤ fires
                                  critical threshold (80) ◄──────┘ fires
                                                                  │
                                  response-medium ◄───────────────┤
                                  response-critical ◄─────────────┘
```

## Exercise

Extend the system with two new detectors:

1. **Multiple failed transactions**: If a user has 3+ failed transactions (`transaction.failed`) in 30 minutes, emit a risk signal with score 35 and category `tx_failures`.

2. **Late night activity**: If a login event arrives between 2:00 AM and 5:00 AM (user's local time), emit a risk signal with score 20 and category `unusual_hours`. Use a regular event-triggered rule with a condition checking the `hour` field from the event data.

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// 1. Multiple failed transactions (CEP count)
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
    .also(log('warn', 'TX failures: ${trigger.groupKey}, ${trigger.count} in 30m'))
    .build()
);

// 2. Late night activity (event-triggered with condition)
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
    .also(log('info', 'Unusual hours login: ${event.userId} at ${event.hour}:00'))
    .build()
);
```

Both detectors follow the same pattern: detect an anomaly, emit a `risk.signal` with a standardized structure. The existing scoring and response rules handle them automatically — no changes needed downstream.

</details>

## Summary

- Separate fraud detection into **three layers**: detection (what happened), scoring (how bad is it), response (what to do)
- Each detector is an **independent rule** that emits a standardized `risk.signal` event
- Use `count()` for frequency-based anomalies (brute force, failed transactions)
- Use `aggregate()` for volume-based anomalies (transaction velocity)
- Use `sequence()` for behavioral patterns (impossible travel, account takeover)
- The scoring layer uses **temporal aggregation** to sum risk scores per user over a time window
- **Graduated responses** (medium vs critical) allow proportional reaction
- External services (`accountService`, `alertService`) integrate with real infrastructure
- Facts (`risk:userId:category`, `user:userId:locked`) provide **audit trail** and **access control** state
- Adding a new detector requires **one new rule** — scoring and response rules are unchanged
- The `risk.signal` event topic is the contract that decouples detection from response

---

Next: [IoT Monitoring Pipeline](./03-iot-monitoring.md)
