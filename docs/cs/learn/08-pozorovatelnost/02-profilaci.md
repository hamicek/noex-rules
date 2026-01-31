# Profilovani vykonu

Vedet, ze pravidla funguji spravne, je prvni krok. Druhy krok je vedet, jak rychle funguji. noex-rules obsahuje vestavenou tridu **Profiler**, ktera agreguje realtime vykonnostni metriky z trace streamu — casy provadeni jednotlivych pravidel, uspesnost podminek, uspesnost akci a identifikaci nejpomalejsich a nejcasteji spoustenych pravidel.

## Co se naucite

- Jak `Profiler` odvozuje metriky z `TraceCollector`
- Vykonnostni profily pro pravidla, podminky a akce
- Hledani nejpomalejsich a nejaktivnejsich pravidel
- Identifikace nizkych uspesnosti a vysokych mir selhani
- Pouziti REST API pro data profilovani
- Resetovani dat profilovani pro cilene benchmarky

## Jak profilovani funguje

Profiler se prihlasi k odberu streamu `TraceCollector` a agreguje metriky v realnem case. Nepridava zatez k samotnemu vyhodnocovani pravidel — zpracovava pouze zaznamy, ktere trace collector uz zaznamenal.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│   Profiler   │
  │               │     │  (ring buffer)  │     │  (agregace)  │
  └──────────────┘     └─────────────────┘     └──────┬───────┘
                                                       │
                                            ┌──────────┼──────────┐
                                            │          │          │
                                      ┌─────▼─────┐ ┌─▼────────┐ ┌▼───────────┐
                                      │ Profily   │ │ Profily  │ │ Profily    │
                                      │ pravidel  │ │ podminek │ │ akci       │
                                      └───────────┘ └──────────┘ └────────────┘
```

Profilovani je automaticky aktivni, kdyz je povolen tracing — zadna dalsi konfigurace neni potreba:

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// engine.profiler je k dispozici okamzite
```

## Profily pravidel

Kazde pravidlo dostane individualni profil s casovymi a pocetnimi metrikami:

```typescript
const profile = engine.profiler.getRuleProfile('fraud-check');

if (profile) {
  console.log(`Pravidlo: ${profile.ruleName}`);
  console.log(`Pocet spusteni: ${profile.triggerCount}`);
  console.log(`Pocet provedeni: ${profile.executionCount}`);
  console.log(`Pocet preskoceni: ${profile.skipCount}`);
  console.log(`Uspesnost: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`Celkovy cas: ${profile.totalTimeMs.toFixed(2)}ms`);
  console.log(`Prumerny cas: ${profile.avgTimeMs.toFixed(2)}ms`);
  console.log(`Minimalni cas: ${profile.minTimeMs.toFixed(2)}ms`);
  console.log(`Maximalni cas: ${profile.maxTimeMs.toFixed(2)}ms`);
  console.log(`Cas vyhodnoceni podminek: ${profile.conditionEvalTimeMs.toFixed(2)}ms`);
  console.log(`Cas provadeni akci: ${profile.actionExecTimeMs.toFixed(2)}ms`);
}
```

### Struktura RuleProfile

```typescript
interface RuleProfile {
  ruleId: string;
  ruleName: string;
  triggerCount: number;          // Kolikrat bylo pravidlo spusteno
  executionCount: number;        // Kolikrat podminky prosly a akce se provedly
  skipCount: number;             // Kolikrat podminky selhaly
  totalTimeMs: number;           // Celkovy cas vyhodnocovani
  avgTimeMs: number;             // Prumerny cas na spusteni
  minTimeMs: number;             // Nejrychlejsi vyhodnoceni
  maxTimeMs: number;             // Nejpomalejsi vyhodnoceni
  conditionEvalTimeMs: number;   // Cas straveny ve vyhodnocovani podminek
  actionExecTimeMs: number;      // Cas straveny v provadeni akci
  conditionProfiles: ConditionProfile[];
  actionProfiles: ActionProfile[];
  passRate: number;              // executionCount / triggerCount
  lastTriggeredAt: number;       // Casove razitko posledniho spusteni
  lastExecutedAt: number | null; // Casove razitko posledniho provedeni
}
```

## Profily podminek

Kazda podminka v ramci pravidla je profilovana individualne. To odhali, ktere podminky jsou narocne nebo maji nizkou uspesnost:

```typescript
const profile = engine.profiler.getRuleProfile('fraud-check');

for (const cond of profile?.conditionProfiles ?? []) {
  console.log(`Podminka #${cond.conditionIndex}:`);
  console.log(`  Vyhodnoceni: ${cond.evaluationCount}`);
  console.log(`  Prumerny cas: ${cond.avgTimeMs.toFixed(3)}ms`);
  console.log(`  Uspesnost: ${(cond.passRate * 100).toFixed(1)}%`);
}
```

### Struktura ConditionProfile

```typescript
interface ConditionProfile {
  conditionIndex: number;     // Pozice v poli podminek pravidla
  evaluationCount: number;    // Kolikrat byla tato podminka zkontrolovana
  totalTimeMs: number;
  avgTimeMs: number;
  passCount: number;          // Kolikrat prosla
  failCount: number;          // Kolikrat selhala
  passRate: number;           // passCount / evaluationCount
}
```

Podminka s velmi nizkou uspesnosti, ktera je kontrolovana jako prvni, muze usetrit cas vyhodnocovani pro dalsi podminky. Podminka s vysokym casem vyhodnocovani by mohla benefitovat z optimalizace nebo prerazeni.

## Profily akci

Kazda akce v ramci pravidla je profilovana pro cas provadeni a uspesnost:

```typescript
const profile = engine.profiler.getRuleProfile('send-notification');

for (const action of profile?.actionProfiles ?? []) {
  console.log(`Akce #${action.actionIndex} (${action.actionType}):`);
  console.log(`  Provedeni: ${action.executionCount}`);
  console.log(`  Prumerny cas: ${action.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Min/Max: ${action.minTimeMs.toFixed(2)}ms / ${action.maxTimeMs.toFixed(2)}ms`);
  console.log(`  Uspesnost: ${(action.successRate * 100).toFixed(1)}%`);
}
```

### Struktura ActionProfile

```typescript
interface ActionProfile {
  actionIndex: number;       // Pozice v poli akci pravidla
  actionType: string;        // 'emit_event', 'set_fact', 'call_service' atd.
  executionCount: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  successCount: number;
  failureCount: number;
  successRate: number;       // successCount / executionCount
}
```

## Hledani uzskych mist

Profiler poskytuje razene dotazy pro bezne vykonnostni otazky:

### Nejpomalejsi pravidla

```typescript
// Ziskat 5 nejpomalejsich pravidel dle prumerneho casu vyhodnoceni
const slowest = engine.profiler.getSlowestRules(5);

for (const profile of slowest) {
  console.log(`${profile.ruleName}: prumer ${profile.avgTimeMs.toFixed(2)}ms`);
}
```

### Nejaktivnejsi pravidla (nejcasteji spoustena)

```typescript
// Ziskat 5 nejcasteji spoustenych pravidel
const hottest = engine.profiler.getHottestRules(5);

for (const profile of hottest) {
  console.log(`${profile.ruleName}: ${profile.triggerCount} spusteni`);
}
```

### Nejnizsi uspesnost

Pravidla s nizkou uspesnosti jsou spoustena casto, ale zridka se provedou. To muze indikovat prilis siroke triggery nebo prilis strikni podminky:

```typescript
const lowPassRate = engine.profiler.getLowestPassRate(5);

for (const profile of lowPassRate) {
  console.log(`${profile.ruleName}: ${(profile.passRate * 100).toFixed(1)}% uspesnost`);
}
```

### Nejvyssi mira selhani akci

Pravidla, kde akce casto selhavaji, vyzaduji pozornost — externi sluzby mohou byt nedostupne, cesty k faktum mohou byt spatne:

```typescript
const highFailure = engine.profiler.getHighestActionFailureRate(5);

for (const profile of highFailure) {
  console.log(`${profile.ruleName}: zkontrolujte miry selhani akci`);
  for (const action of profile.actionProfiles) {
    if (action.failureCount > 0) {
      console.log(`  ${action.actionType}: ${(action.successRate * 100).toFixed(1)}% uspesnost`);
    }
  }
}
```

## Shrnuti profilovani

Ziskejte celkovy prehled vsech dat profilovani:

```typescript
const summary = engine.profiler.getSummary();

console.log(`Profilovanych pravidel: ${summary.totalRulesProfiled}`);
console.log(`Celkem spusteni: ${summary.totalTriggers}`);
console.log(`Celkem provedeni: ${summary.totalExecutions}`);
console.log(`Celkovy cas: ${summary.totalTimeMs.toFixed(2)}ms`);
console.log(`Prumerny cas pravidla: ${summary.avgRuleTimeMs.toFixed(2)}ms`);

if (summary.slowestRule) {
  console.log(`Nejpomalejsi: ${summary.slowestRule.ruleName} (${summary.slowestRule.avgTimeMs.toFixed(2)}ms)`);
}
if (summary.hottestRule) {
  console.log(`Nejaktivnejsi: ${summary.hottestRule.ruleName} (${summary.hottestRule.triggerCount} spusteni)`);
}
```

### Struktura ProfilingSummary

```typescript
interface ProfilingSummary {
  totalRulesProfiled: number;
  totalTriggers: number;
  totalExecutions: number;
  totalTimeMs: number;
  avgRuleTimeMs: number;
  slowestRule: { ruleId: string; ruleName: string; avgTimeMs: number } | null;
  hottestRule: { ruleId: string; ruleName: string; triggerCount: number } | null;
  profilingStartedAt: number;
  lastActivityAt: number | null;
}
```

## Resetovani dat profilovani

Pro cilene benchmarky resetujte profilovani a zacnete znovu:

```typescript
// Vymazat vsechny akumulovane metriky
engine.profiler.reset();

// Nyni spustte konkretni zatez
for (let i = 0; i < 1000; i++) {
  await engine.emit('order.created', { orderId: `ord-${i}`, total: 50 });
}

// Zkontrolujte data profilovani pouze pro tuto zatez
const summary = engine.profiler.getSummary();
console.log(`Prumerne zpracovani: ${summary.avgRuleTimeMs.toFixed(3)}ms na spusteni`);
```

## Kompletni priklad: E-commerce vykonnostni dashboard

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// --- Registrace e-commerce pravidel ---

engine.registerRule(
  Rule.create('order-discount')
    .name('Kontrola slevy objednavky')
    .priority(10)
    .when(onEvent('order.created'))
    .if(event('total').gte(100))
    .then(emit('discount.applied', {
      orderId: ref('event.orderId'),
      discount: 0.1,
    }))
    .build()
);

engine.registerRule(
  Rule.create('vip-upgrade')
    .name('Kontrola upgradu na VIP')
    .priority(5)
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:totalSpent').gte(1000))
    .then(setFact('customer:${event.customerId}:tier', 'vip'))
    .also(log('Zakaznik ${event.customerId} povysen na VIP'))
    .build()
);

engine.registerRule(
  Rule.create('inventory-alert')
    .name('Alert nizkeho skladu')
    .priority(1)
    .when(onEvent('order.created'))
    .if(fact('product:${event.productId}:stock').lt(5))
    .then(emit('inventory.low', {
      productId: ref('event.productId'),
      stock: ref('fact.value'),
    }))
    .build()
);

// --- Simulace zateze ---

engine.setFact('customer:c-1:totalSpent', 500);
engine.setFact('product:p-1:stock', 3);

for (let i = 0; i < 100; i++) {
  await engine.emit('order.created', {
    orderId: `ord-${i}`,
    customerId: 'c-1',
    productId: 'p-1',
    total: 50 + Math.random() * 100,  // 50-150
  });
}

// --- Vykonnostni dashboard ---

console.log('=== Vykonnostni dashboard ===\n');

const summary = engine.profiler.getSummary();
console.log(`Celkem spusteni: ${summary.totalTriggers}`);
console.log(`Celkovy cas: ${summary.totalTimeMs.toFixed(2)}ms`);
console.log(`Prumer na spusteni: ${summary.avgRuleTimeMs.toFixed(3)}ms\n`);

console.log('--- Nejpomalejsi pravidla ---');
for (const rule of engine.profiler.getSlowestRules(5)) {
  console.log(`  ${rule.ruleName}: ${rule.avgTimeMs.toFixed(3)}ms prumer`);
}

console.log('\n--- Nejaktivnejsi pravidla ---');
for (const rule of engine.profiler.getHottestRules(5)) {
  console.log(`  ${rule.ruleName}: ${rule.triggerCount} spusteni`);
}

console.log('\n--- Uspesnosti ---');
for (const profile of engine.profiler.getRuleProfiles()) {
  console.log(`  ${profile.ruleName}: ${(profile.passRate * 100).toFixed(1)}%`);
}

console.log('\n--- Rozpis podminek ---');
const discountProfile = engine.profiler.getRuleProfile('order-discount');
if (discountProfile) {
  for (const cond of discountProfile.conditionProfiles) {
    console.log(`  Podminka #${cond.conditionIndex}: ${(cond.passRate * 100).toFixed(1)}% uspesnost, ${cond.avgTimeMs.toFixed(3)}ms prumer`);
  }
}

await engine.stop();
```

## REST API endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/profile` | Ziskat vsechny profily pravidel |
| `GET` | `/debug/profile/summary` | Ziskat shrnuti profilovani |
| `GET` | `/debug/profile/slowest` | Ziskat nejpomalejsi pravidla (query: `?limit=10`) |
| `GET` | `/debug/profile/hottest` | Ziskat nejaktivnejsi pravidla (query: `?limit=10`) |
| `GET` | `/debug/profile/:ruleId` | Ziskat profil konkretniho pravidla |
| `POST` | `/debug/profile/reset` | Resetovat vsechna data profilovani |

## Cviceni

Vybudujte analyzu profilovani pro vicepravidlovy notifikacni system:

1. Vytvorte engine s povolenym tracingem
2. Zaregistrujte ctyri pravidla:
   - `email-notification` spoustene `order.shipped`, ktere se vzdy provede (zadne podminky)
   - `sms-notification` spoustene `order.shipped`, ktere se spusti pouze kdyz `event.priority` je `'high'`
   - `push-notification` spoustene `order.shipped`, ktere se spusti pouze kdyz fakt `customer:${event.customerId}:pushEnabled` je `true`
   - `analytics-tracker` spoustene `order.shipped`, ktere se vzdy provede
3. Simulujte 200 udalosti, kde ~30 % ma vysokou prioritu
4. Vytisknete uspesnost pro kazde pravidlo a identifikujte, ktere pravidlo je spousteno nejvice, ale provadi se nejmene

<details>
<summary>Reseni</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// Pravidlo 1: Vzdy se provede
engine.registerRule(
  Rule.create('email-notification')
    .name('Emailova notifikace')
    .when(onEvent('order.shipped'))
    .then(emit('notification.email', {
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
    }))
    .build()
);

// Pravidlo 2: Pouze pro objednavky s vysokou prioritou (~30 %)
engine.registerRule(
  Rule.create('sms-notification')
    .name('SMS notifikace')
    .when(onEvent('order.shipped'))
    .if(event('priority').eq('high'))
    .then(emit('notification.sms', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Pravidlo 3: Pouze kdyz je push povolen (nastaveno pro ~50 % zakazniku)
engine.registerRule(
  Rule.create('push-notification')
    .name('Push notifikace')
    .when(onEvent('order.shipped'))
    .if(fact('customer:${event.customerId}:pushEnabled').eq(true))
    .then(emit('notification.push', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Pravidlo 4: Vzdy se provede
engine.registerRule(
  Rule.create('analytics-tracker')
    .name('Analyticky tracker')
    .when(onEvent('order.shipped'))
    .then(setFact('analytics:shipped:count', '${(parseInt(fact.value || "0") + 1)}'))
    .build()
);

// Nastavit push pro polovinu zakazniku
for (let i = 0; i < 50; i++) {
  engine.setFact(`customer:c-${i}:pushEnabled`, true);
}

// Simulace 200 objednavek
for (let i = 0; i < 200; i++) {
  await engine.emit('order.shipped', {
    orderId: `ord-${i}`,
    customerId: `c-${i % 100}`,
    priority: Math.random() < 0.3 ? 'high' : 'normal',
  });
}

// Analyza
console.log('=== Profilovani notifikacniho systemu ===\n');

const profiles = engine.profiler.getRuleProfiles();
for (const profile of profiles) {
  console.log(`${profile.ruleName}:`);
  console.log(`  Spusteno: ${profile.triggerCount}`);
  console.log(`  Provedeno: ${profile.executionCount}`);
  console.log(`  Preskoceno: ${profile.skipCount}`);
  console.log(`  Uspesnost: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`  Prumerny cas: ${profile.avgTimeMs.toFixed(3)}ms`);
  console.log();
}

// Identifikace: nejvice spoustene, ale nejmene provadene
const lowestPass = engine.profiler.getLowestPassRate(1);
if (lowestPass.length) {
  console.log(`Nejnizsi uspesnost: ${lowestPass[0].ruleName} na ${(lowestPass[0].passRate * 100).toFixed(1)}%`);
  // sms-notification na ~30 % (pouze objednavky s vysokou prioritou)
}

await engine.stop();
```

SMS notifikacni pravidlo ma nejnizsi uspesnost (~30 %), protoze pouze objednavky s vysokou prioritou ho spusti. Push notifikacni pravidlo prochazi v ~50 % pripadu (odpovida zakaznikum s povolenym push). Email a analytika se vzdy provedou na 100 %.

</details>

## Shrnuti

- **`Profiler`** se prihlasi k odberu `TraceCollector` a agreguje metriky vykonu pro jednotliva pravidla v realnem case
- Profilovani je **automaticke**, kdyz je povolen tracing — zadna dalsi konfigurace neni potreba
- **`RuleProfile`** zachycuje pocet spusteni, provedeni, preskoceni, casovani (prumer/min/max) a rozpisy podminek/akci
- **`ConditionProfile`** odhaluje uspesnosti a casy vyhodnocovani pro jednotlive podminky
- **`ActionProfile`** sleduje casy provadeni a miry uspechu/selhani pro jednotlive akce
- Pouzijte `getSlowestRules()` a `getHottestRules()` pro nalezeni vykonnostnich uzkych mist
- Pouzijte `getLowestPassRate()` pro identifikaci pravidel s prilis sirokymi triggery
- Pouzijte `getHighestActionFailureRate()` pro nalezeni pravidel se selhavajicimi externimi volanimi
- **`getSummary()`** poskytuje celkovy prehled s nejpomalejsim a nejaktivnejsim pravidlem
- **Resetujte** data profilovani pomoci `reset()` pro cilene benchmarkove behy
- Vsechna data profilovani jsou dostupna pres **REST API endpointy** pod `/debug/profile`

---

Dalsi: [Audit logging](./03-audit-log.md)
