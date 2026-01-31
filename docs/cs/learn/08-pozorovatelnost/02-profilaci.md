# Profilování výkonu

Vědět, že pravidla fungují správně, je první krok. Druhý krok je vědět, jak rychle fungují. noex-rules obsahuje vestavěnou třídu **Profiler**, která agreguje realtime výkonnostní metriky z trace streamu — časy provádění jednotlivých pravidel, úspěšnost podmínek, úspěšnost akcí a identifikaci nejpomalejších a nejčastěji spouštěných pravidel.

## Co se naučíte

- Jak `Profiler` odvozuje metriky z `TraceCollector`
- Výkonnostní profily pro pravidla, podmínky a akce
- Hledání nejpomalejších a nejaktivnějších pravidel
- Identifikace nízkých úspěšností a vysokých měr selhání
- Použití REST API pro data profilování
- Resetování dat profilování pro cílené benchmarky

## Jak profilování funguje

Profiler se přihlásí k odběru streamu `TraceCollector` a agreguje metriky v reálném čase. Nepřidává zátěž k samotnému vyhodnocování pravidel — zpracovává pouze záznamy, které trace collector už zaznamenal.

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
                                      │ pravidel  │ │ podmínek │ │ akcí       │
                                      └───────────┘ └──────────┘ └────────────┘
```

Profilování je automaticky aktivní, když je povolen tracing — žádná další konfigurace není potřeba:

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// engine.profiler je k dispozici okamžitě
```

## Profily pravidel

Každé pravidlo dostane individuální profil s časovými a početními metrikami:

```typescript
const profile = engine.profiler.getRuleProfile('fraud-check');

if (profile) {
  console.log(`Pravidlo: ${profile.ruleName}`);
  console.log(`Počet spuštění: ${profile.triggerCount}`);
  console.log(`Počet provedení: ${profile.executionCount}`);
  console.log(`Počet přeskočení: ${profile.skipCount}`);
  console.log(`Úspěšnost: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`Celkový čas: ${profile.totalTimeMs.toFixed(2)}ms`);
  console.log(`Průměrný čas: ${profile.avgTimeMs.toFixed(2)}ms`);
  console.log(`Minimální čas: ${profile.minTimeMs.toFixed(2)}ms`);
  console.log(`Maximální čas: ${profile.maxTimeMs.toFixed(2)}ms`);
  console.log(`Čas vyhodnocení podmínek: ${profile.conditionEvalTimeMs.toFixed(2)}ms`);
  console.log(`Čas provádění akcí: ${profile.actionExecTimeMs.toFixed(2)}ms`);
}
```

### Struktura RuleProfile

```typescript
interface RuleProfile {
  ruleId: string;
  ruleName: string;
  triggerCount: number;          // Kolikrát bylo pravidlo spuštěno
  executionCount: number;        // Kolikrát podmínky prošly a akce se provedly
  skipCount: number;             // Kolikrát podmínky selhaly
  totalTimeMs: number;           // Celkový čas vyhodnocování
  avgTimeMs: number;             // Průměrný čas na spuštění
  minTimeMs: number;             // Nejrychlejší vyhodnocení
  maxTimeMs: number;             // Nejpomalejší vyhodnocení
  conditionEvalTimeMs: number;   // Čas strávený ve vyhodnocování podmínek
  actionExecTimeMs: number;      // Čas strávený v provádění akcí
  conditionProfiles: ConditionProfile[];
  actionProfiles: ActionProfile[];
  passRate: number;              // executionCount / triggerCount
  lastTriggeredAt: number;       // Časové razítko posledního spuštění
  lastExecutedAt: number | null; // Časové razítko posledního provedení
}
```

## Profily podmínek

Každá podmínka v rámci pravidla je profilována individuálně. To odhalí, které podmínky jsou náročné nebo mají nízkou úspěšnost:

```typescript
const profile = engine.profiler.getRuleProfile('fraud-check');

for (const cond of profile?.conditionProfiles ?? []) {
  console.log(`Podmínka #${cond.conditionIndex}:`);
  console.log(`  Vyhodnocení: ${cond.evaluationCount}`);
  console.log(`  Průměrný čas: ${cond.avgTimeMs.toFixed(3)}ms`);
  console.log(`  Úspěšnost: ${(cond.passRate * 100).toFixed(1)}%`);
}
```

### Struktura ConditionProfile

```typescript
interface ConditionProfile {
  conditionIndex: number;     // Pozice v poli podmínek pravidla
  evaluationCount: number;    // Kolikrát byla tato podmínka zkontrolována
  totalTimeMs: number;
  avgTimeMs: number;
  passCount: number;          // Kolikrát prošla
  failCount: number;          // Kolikrát selhala
  passRate: number;           // passCount / evaluationCount
}
```

Podmínka s velmi nízkou úspěšností, která je kontrolována jako první, může ušetřit čas vyhodnocování pro další podmínky. Podmínka s vysokým časem vyhodnocování by mohla benefitovat z optimalizace nebo přeřazení.

## Profily akcí

Každá akce v rámci pravidla je profilována pro čas provádění a úspěšnost:

```typescript
const profile = engine.profiler.getRuleProfile('send-notification');

for (const action of profile?.actionProfiles ?? []) {
  console.log(`Akce #${action.actionIndex} (${action.actionType}):`);
  console.log(`  Provedení: ${action.executionCount}`);
  console.log(`  Průměrný čas: ${action.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Min/Max: ${action.minTimeMs.toFixed(2)}ms / ${action.maxTimeMs.toFixed(2)}ms`);
  console.log(`  Úspěšnost: ${(action.successRate * 100).toFixed(1)}%`);
}
```

### Struktura ActionProfile

```typescript
interface ActionProfile {
  actionIndex: number;       // Pozice v poli akcí pravidla
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

## Hledání úzkých míst

Profiler poskytuje řazené dotazy pro běžné výkonnostní otázky:

### Nejpomalejší pravidla

```typescript
// Získat 5 nejpomalejších pravidel dle průměrného času vyhodnocení
const slowest = engine.profiler.getSlowestRules(5);

for (const profile of slowest) {
  console.log(`${profile.ruleName}: průměr ${profile.avgTimeMs.toFixed(2)}ms`);
}
```

### Nejaktivnější pravidla (nejčastěji spouštěná)

```typescript
// Získat 5 nejčastěji spouštěných pravidel
const hottest = engine.profiler.getHottestRules(5);

for (const profile of hottest) {
  console.log(`${profile.ruleName}: ${profile.triggerCount} spuštění`);
}
```

### Nejnižší úspěšnost

Pravidla s nízkou úspěšností jsou spouštěna často, ale zřídka se provedou. To může indikovat příliš široké triggery nebo příliš striktní podmínky:

```typescript
const lowPassRate = engine.profiler.getLowestPassRate(5);

for (const profile of lowPassRate) {
  console.log(`${profile.ruleName}: ${(profile.passRate * 100).toFixed(1)}% úspěšnost`);
}
```

### Nejvyšší míra selhání akcí

Pravidla, kde akce často selhávají, vyžadují pozornost — externí služby mohou být nedostupné, cesty k faktům mohou být špatné:

```typescript
const highFailure = engine.profiler.getHighestActionFailureRate(5);

for (const profile of highFailure) {
  console.log(`${profile.ruleName}: zkontrolujte míry selhání akcí`);
  for (const action of profile.actionProfiles) {
    if (action.failureCount > 0) {
      console.log(`  ${action.actionType}: ${(action.successRate * 100).toFixed(1)}% úspěšnost`);
    }
  }
}
```

## Shrnutí profilování

Získejte celkový přehled všech dat profilování:

```typescript
const summary = engine.profiler.getSummary();

console.log(`Profilovaných pravidel: ${summary.totalRulesProfiled}`);
console.log(`Celkem spuštění: ${summary.totalTriggers}`);
console.log(`Celkem provedení: ${summary.totalExecutions}`);
console.log(`Celkový čas: ${summary.totalTimeMs.toFixed(2)}ms`);
console.log(`Průměrný čas pravidla: ${summary.avgRuleTimeMs.toFixed(2)}ms`);

if (summary.slowestRule) {
  console.log(`Nejpomalejší: ${summary.slowestRule.ruleName} (${summary.slowestRule.avgTimeMs.toFixed(2)}ms)`);
}
if (summary.hottestRule) {
  console.log(`Nejaktivnější: ${summary.hottestRule.ruleName} (${summary.hottestRule.triggerCount} spuštění)`);
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

## Resetování dat profilování

Pro cílené benchmarky resetujte profilování a začněte znovu:

```typescript
// Vymazat všechny akumulované metriky
engine.profiler.reset();

// Nyní spusťte konkrétní zátěž
for (let i = 0; i < 1000; i++) {
  await engine.emit('order.created', { orderId: `ord-${i}`, total: 50 });
}

// Zkontrolujte data profilování pouze pro tuto zátěž
const summary = engine.profiler.getSummary();
console.log(`Průměrné zpracování: ${summary.avgRuleTimeMs.toFixed(3)}ms na spuštění`);
```

## Kompletní příklad: E-commerce výkonnostní dashboard

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
    .name('Kontrola slevy objednávky')
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
    .also(log('Zákazník ${event.customerId} povýšen na VIP'))
    .build()
);

engine.registerRule(
  Rule.create('inventory-alert')
    .name('Alert nízkého skladu')
    .priority(1)
    .when(onEvent('order.created'))
    .if(fact('product:${event.productId}:stock').lt(5))
    .then(emit('inventory.low', {
      productId: ref('event.productId'),
      stock: ref('fact.value'),
    }))
    .build()
);

// --- Simulace zátěže ---

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

// --- Výkonnostní dashboard ---

console.log('=== Výkonnostní dashboard ===\n');

const summary = engine.profiler.getSummary();
console.log(`Celkem spuštění: ${summary.totalTriggers}`);
console.log(`Celkový čas: ${summary.totalTimeMs.toFixed(2)}ms`);
console.log(`Průměr na spuštění: ${summary.avgRuleTimeMs.toFixed(3)}ms\n`);

console.log('--- Nejpomalejší pravidla ---');
for (const rule of engine.profiler.getSlowestRules(5)) {
  console.log(`  ${rule.ruleName}: ${rule.avgTimeMs.toFixed(3)}ms průměr`);
}

console.log('\n--- Nejaktivnější pravidla ---');
for (const rule of engine.profiler.getHottestRules(5)) {
  console.log(`  ${rule.ruleName}: ${rule.triggerCount} spuštění`);
}

console.log('\n--- Úspěšnosti ---');
for (const profile of engine.profiler.getRuleProfiles()) {
  console.log(`  ${profile.ruleName}: ${(profile.passRate * 100).toFixed(1)}%`);
}

console.log('\n--- Rozpis podmínek ---');
const discountProfile = engine.profiler.getRuleProfile('order-discount');
if (discountProfile) {
  for (const cond of discountProfile.conditionProfiles) {
    console.log(`  Podmínka #${cond.conditionIndex}: ${(cond.passRate * 100).toFixed(1)}% úspěšnost, ${cond.avgTimeMs.toFixed(3)}ms průměr`);
  }
}

await engine.stop();
```

## REST API endpointy

| Metoda | Cesta | Popis |
|--------|-------|-------|
| `GET` | `/debug/profile` | Získat všechny profily pravidel |
| `GET` | `/debug/profile/summary` | Získat shrnutí profilování |
| `GET` | `/debug/profile/slowest` | Získat nejpomalejší pravidla (query: `?limit=10`) |
| `GET` | `/debug/profile/hottest` | Získat nejaktivnější pravidla (query: `?limit=10`) |
| `GET` | `/debug/profile/:ruleId` | Získat profil konkrétního pravidla |
| `POST` | `/debug/profile/reset` | Resetovat všechna data profilování |

## Cvičení

Vybudujte analýzu profilování pro vícepravidlový notifikační systém:

1. Vytvořte engine s povoleným tracingem
2. Zaregistrujte čtyři pravidla:
   - `email-notification` spouštěné `order.shipped`, které se vždy provede (žádné podmínky)
   - `sms-notification` spouštěné `order.shipped`, které se spustí pouze když `event.priority` je `'high'`
   - `push-notification` spouštěné `order.shipped`, které se spustí pouze když fakt `customer:${event.customerId}:pushEnabled` je `true`
   - `analytics-tracker` spouštěné `order.shipped`, které se vždy provede
3. Simulujte 200 událostí, kde ~30 % má vysokou prioritu
4. Vytiskněte úspěšnost pro každé pravidlo a identifikujte, které pravidlo je spouštěno nejvíce, ale provádí se nejméně

<details>
<summary>Řešení</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// Pravidlo 1: Vždy se provede
engine.registerRule(
  Rule.create('email-notification')
    .name('Emailová notifikace')
    .when(onEvent('order.shipped'))
    .then(emit('notification.email', {
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
    }))
    .build()
);

// Pravidlo 2: Pouze pro objednávky s vysokou prioritou (~30 %)
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

// Pravidlo 3: Pouze když je push povolen (nastaveno pro ~50 % zákazníků)
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

// Pravidlo 4: Vždy se provede
engine.registerRule(
  Rule.create('analytics-tracker')
    .name('Analytický tracker')
    .when(onEvent('order.shipped'))
    .then(setFact('analytics:shipped:count', '${(parseInt(fact.value || "0") + 1)}'))
    .build()
);

// Nastavit push pro polovinu zákazníků
for (let i = 0; i < 50; i++) {
  engine.setFact(`customer:c-${i}:pushEnabled`, true);
}

// Simulace 200 objednávek
for (let i = 0; i < 200; i++) {
  await engine.emit('order.shipped', {
    orderId: `ord-${i}`,
    customerId: `c-${i % 100}`,
    priority: Math.random() < 0.3 ? 'high' : 'normal',
  });
}

// Analýza
console.log('=== Profilování notifikačního systému ===\n');

const profiles = engine.profiler.getRuleProfiles();
for (const profile of profiles) {
  console.log(`${profile.ruleName}:`);
  console.log(`  Spuštěno: ${profile.triggerCount}`);
  console.log(`  Provedeno: ${profile.executionCount}`);
  console.log(`  Přeskočeno: ${profile.skipCount}`);
  console.log(`  Úspěšnost: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`  Průměrný čas: ${profile.avgTimeMs.toFixed(3)}ms`);
  console.log();
}

// Identifikace: nejvíce spouštěné, ale nejméně prováděné
const lowestPass = engine.profiler.getLowestPassRate(1);
if (lowestPass.length) {
  console.log(`Nejnižší úspěšnost: ${lowestPass[0].ruleName} na ${(lowestPass[0].passRate * 100).toFixed(1)}%`);
  // sms-notification na ~30 % (pouze objednávky s vysokou prioritou)
}

await engine.stop();
```

SMS notifikační pravidlo má nejnižší úspěšnost (~30 %), protože pouze objednávky s vysokou prioritou ho spustí. Push notifikační pravidlo prochází v ~50 % případů (odpovídá zákazníkům s povoleným push). Email a analytika se vždy provedou na 100 %.

</details>

## Shrnutí

- **`Profiler`** se přihlásí k odběru `TraceCollector` a agreguje metriky výkonu pro jednotlivá pravidla v reálném čase
- Profilování je **automatické**, když je povolen tracing — žádná další konfigurace není potřeba
- **`RuleProfile`** zachycuje počet spuštění, provedení, přeskočení, časování (průměr/min/max) a rozpisy podmínek/akcí
- **`ConditionProfile`** odhaluje úspěšnosti a časy vyhodnocování pro jednotlivé podmínky
- **`ActionProfile`** sleduje časy provádění a míry úspěchu/selhání pro jednotlivé akce
- Použijte `getSlowestRules()` a `getHottestRules()` pro nalezení výkonnostních úzkých míst
- Použijte `getLowestPassRate()` pro identifikaci pravidel s příliš širokými triggery
- Použijte `getHighestActionFailureRate()` pro nalezení pravidel se selhávajícími externími voláními
- **`getSummary()`** poskytuje celkový přehled s nejpomalejším a nejaktivnějším pravidlem
- **Resetujte** data profilování pomocí `reset()` pro cílené benchmarkové běhy
- Všechna data profilování jsou dostupná přes **REST API endpointy** pod `/debug/profile`

---

Další: [Audit logging](./03-audit-log.md)
