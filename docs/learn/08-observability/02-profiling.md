# Profiling Performance

Knowing that rules work correctly is step one. Step two is knowing how fast they work. noex-rules includes a built-in **Profiler** that aggregates real-time performance metrics from the trace stream — per-rule execution times, condition pass rates, action success rates, and identification of the slowest and most frequently triggered rules.

## What You'll Learn

- How the `Profiler` derives metrics from `TraceCollector`
- Per-rule, per-condition, and per-action performance profiles
- Finding the slowest and hottest rules
- Identifying low pass rates and high failure rates
- Using the REST API for profiling data
- Resetting profiling data for focused benchmarks

## How Profiling Works

The profiler subscribes to the `TraceCollector` stream and aggregates metrics in real-time. It doesn't add overhead to rule evaluation itself — it only processes entries that the trace collector already records.

```text
  ┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
  │  RuleEngine   │────▶│  TraceCollector  │────▶│   Profiler   │
  │               │     │  (ring buffer)  │     │  (aggregates)│
  └──────────────┘     └─────────────────┘     └──────┬───────┘
                                                       │
                                            ┌──────────┼──────────┐
                                            │          │          │
                                      ┌─────▼─────┐ ┌─▼────────┐ ┌▼───────────┐
                                      │ Per-rule  │ │Per-cond. │ │ Per-action │
                                      │ profiles  │ │ profiles │ │ profiles   │
                                      └───────────┘ └──────────┘ └────────────┘
```

Profiling is automatically active when tracing is enabled — no additional configuration needed:

```typescript
const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// engine.profiler is available immediately
```

## Per-Rule Profiles

Each rule gets an individual profile with timing and count metrics:

```typescript
const profile = engine.profiler.getRuleProfile('fraud-check');

if (profile) {
  console.log(`Rule: ${profile.ruleName}`);
  console.log(`Trigger count: ${profile.triggerCount}`);
  console.log(`Execution count: ${profile.executionCount}`);
  console.log(`Skip count: ${profile.skipCount}`);
  console.log(`Pass rate: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`Total time: ${profile.totalTimeMs.toFixed(2)}ms`);
  console.log(`Avg time: ${profile.avgTimeMs.toFixed(2)}ms`);
  console.log(`Min time: ${profile.minTimeMs.toFixed(2)}ms`);
  console.log(`Max time: ${profile.maxTimeMs.toFixed(2)}ms`);
  console.log(`Condition eval time: ${profile.conditionEvalTimeMs.toFixed(2)}ms`);
  console.log(`Action exec time: ${profile.actionExecTimeMs.toFixed(2)}ms`);
}
```

### RuleProfile Structure

```typescript
interface RuleProfile {
  ruleId: string;
  ruleName: string;
  triggerCount: number;          // Times the rule was triggered
  executionCount: number;        // Times conditions passed and actions ran
  skipCount: number;             // Times conditions failed
  totalTimeMs: number;           // Total evaluation time
  avgTimeMs: number;             // Average per-trigger time
  minTimeMs: number;             // Fastest evaluation
  maxTimeMs: number;             // Slowest evaluation
  conditionEvalTimeMs: number;   // Time spent in condition evaluation
  actionExecTimeMs: number;      // Time spent in action execution
  conditionProfiles: ConditionProfile[];
  actionProfiles: ActionProfile[];
  passRate: number;              // executionCount / triggerCount
  lastTriggeredAt: number;       // Timestamp of last trigger
  lastExecutedAt: number | null; // Timestamp of last execution
}
```

## Per-Condition Profiles

Each condition within a rule is profiled individually. This reveals which conditions are expensive or have low pass rates:

```typescript
const profile = engine.profiler.getRuleProfile('fraud-check');

for (const cond of profile?.conditionProfiles ?? []) {
  console.log(`Condition #${cond.conditionIndex}:`);
  console.log(`  Evaluations: ${cond.evaluationCount}`);
  console.log(`  Avg time: ${cond.avgTimeMs.toFixed(3)}ms`);
  console.log(`  Pass rate: ${(cond.passRate * 100).toFixed(1)}%`);
}
```

### ConditionProfile Structure

```typescript
interface ConditionProfile {
  conditionIndex: number;     // Position within the rule's conditions array
  evaluationCount: number;    // How many times this condition was checked
  totalTimeMs: number;
  avgTimeMs: number;
  passCount: number;          // How many times it passed
  failCount: number;          // How many times it failed
  passRate: number;           // passCount / evaluationCount
}
```

A condition with a very low pass rate that's checked first can save evaluation time for other conditions. A condition with high evaluation time might benefit from optimization or reordering.

## Per-Action Profiles

Each action within a rule is profiled for execution time and success rate:

```typescript
const profile = engine.profiler.getRuleProfile('send-notification');

for (const action of profile?.actionProfiles ?? []) {
  console.log(`Action #${action.actionIndex} (${action.actionType}):`);
  console.log(`  Executions: ${action.executionCount}`);
  console.log(`  Avg time: ${action.avgTimeMs.toFixed(2)}ms`);
  console.log(`  Min/Max: ${action.minTimeMs.toFixed(2)}ms / ${action.maxTimeMs.toFixed(2)}ms`);
  console.log(`  Success rate: ${(action.successRate * 100).toFixed(1)}%`);
}
```

### ActionProfile Structure

```typescript
interface ActionProfile {
  actionIndex: number;       // Position within the rule's actions array
  actionType: string;        // 'emit_event', 'set_fact', 'call_service', etc.
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

## Finding Bottlenecks

The profiler provides ranked queries for common performance questions:

### Slowest Rules

```typescript
// Get the 5 slowest rules by average evaluation time
const slowest = engine.profiler.getSlowestRules(5);

for (const profile of slowest) {
  console.log(`${profile.ruleName}: avg ${profile.avgTimeMs.toFixed(2)}ms`);
}
```

### Hottest Rules (Most Triggered)

```typescript
// Get the 5 most frequently triggered rules
const hottest = engine.profiler.getHottestRules(5);

for (const profile of hottest) {
  console.log(`${profile.ruleName}: ${profile.triggerCount} triggers`);
}
```

### Lowest Pass Rates

Rules with low pass rates are triggered often but rarely execute. This might indicate overly broad triggers or overly strict conditions:

```typescript
const lowPassRate = engine.profiler.getLowestPassRate(5);

for (const profile of lowPassRate) {
  console.log(`${profile.ruleName}: ${(profile.passRate * 100).toFixed(1)}% pass rate`);
}
```

### Highest Action Failure Rates

Rules where actions frequently fail need attention — external services might be down, fact paths might be wrong:

```typescript
const highFailure = engine.profiler.getHighestActionFailureRate(5);

for (const profile of highFailure) {
  console.log(`${profile.ruleName}: check action failure rates`);
  for (const action of profile.actionProfiles) {
    if (action.failureCount > 0) {
      console.log(`  ${action.actionType}: ${(action.successRate * 100).toFixed(1)}% success`);
    }
  }
}
```

## Profiling Summary

Get a high-level overview of all profiling data:

```typescript
const summary = engine.profiler.getSummary();

console.log(`Rules profiled: ${summary.totalRulesProfiled}`);
console.log(`Total triggers: ${summary.totalTriggers}`);
console.log(`Total executions: ${summary.totalExecutions}`);
console.log(`Total time: ${summary.totalTimeMs.toFixed(2)}ms`);
console.log(`Avg rule time: ${summary.avgRuleTimeMs.toFixed(2)}ms`);

if (summary.slowestRule) {
  console.log(`Slowest: ${summary.slowestRule.ruleName} (${summary.slowestRule.avgTimeMs.toFixed(2)}ms)`);
}
if (summary.hottestRule) {
  console.log(`Hottest: ${summary.hottestRule.ruleName} (${summary.hottestRule.triggerCount} triggers)`);
}
```

### ProfilingSummary Structure

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

## Resetting Profiling Data

For focused benchmarks, reset profiling to start fresh:

```typescript
// Clear all accumulated metrics
engine.profiler.reset();

// Now run a specific workload
for (let i = 0; i < 1000; i++) {
  await engine.emit('order.created', { orderId: `ord-${i}`, total: 50 });
}

// Check profiling data for only this workload
const summary = engine.profiler.getSummary();
console.log(`Avg processing: ${summary.avgRuleTimeMs.toFixed(3)}ms per trigger`);
```

## Complete Example: E-Commerce Performance Dashboard

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// --- Register e-commerce rules ---

engine.registerRule(
  Rule.create('order-discount')
    .name('Order Discount Check')
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
    .name('VIP Upgrade Check')
    .priority(5)
    .when(onEvent('order.created'))
    .if(fact('customer:${event.customerId}:totalSpent').gte(1000))
    .then(setFact('customer:${event.customerId}:tier', 'vip'))
    .also(log('Customer ${event.customerId} upgraded to VIP'))
    .build()
);

engine.registerRule(
  Rule.create('inventory-alert')
    .name('Low Inventory Alert')
    .priority(1)
    .when(onEvent('order.created'))
    .if(fact('product:${event.productId}:stock').lt(5))
    .then(emit('inventory.low', {
      productId: ref('event.productId'),
      stock: ref('fact.value'),
    }))
    .build()
);

// --- Simulate workload ---

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

// --- Performance dashboard ---

console.log('=== Performance Dashboard ===\n');

const summary = engine.profiler.getSummary();
console.log(`Total triggers: ${summary.totalTriggers}`);
console.log(`Total time: ${summary.totalTimeMs.toFixed(2)}ms`);
console.log(`Avg per trigger: ${summary.avgRuleTimeMs.toFixed(3)}ms\n`);

console.log('--- Slowest Rules ---');
for (const rule of engine.profiler.getSlowestRules(5)) {
  console.log(`  ${rule.ruleName}: ${rule.avgTimeMs.toFixed(3)}ms avg`);
}

console.log('\n--- Hottest Rules ---');
for (const rule of engine.profiler.getHottestRules(5)) {
  console.log(`  ${rule.ruleName}: ${rule.triggerCount} triggers`);
}

console.log('\n--- Pass Rates ---');
for (const profile of engine.profiler.getRuleProfiles()) {
  console.log(`  ${profile.ruleName}: ${(profile.passRate * 100).toFixed(1)}%`);
}

console.log('\n--- Per-Condition Breakdown ---');
const discountProfile = engine.profiler.getRuleProfile('order-discount');
if (discountProfile) {
  for (const cond of discountProfile.conditionProfiles) {
    console.log(`  Condition #${cond.conditionIndex}: ${(cond.passRate * 100).toFixed(1)}% pass rate, ${cond.avgTimeMs.toFixed(3)}ms avg`);
  }
}

await engine.stop();
```

## REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/debug/profile` | Get all rule profiles |
| `GET` | `/debug/profile/summary` | Get profiling summary |
| `GET` | `/debug/profile/slowest` | Get slowest rules (query: `?limit=10`) |
| `GET` | `/debug/profile/hottest` | Get most triggered rules (query: `?limit=10`) |
| `GET` | `/debug/profile/:ruleId` | Get profile for a specific rule |
| `POST` | `/debug/profile/reset` | Reset all profiling data |

## Exercise

Build a profiling analysis for a multi-rule notification system:

1. Create an engine with tracing enabled
2. Register four rules:
   - `email-notification` triggered by `order.shipped` that always executes (no conditions)
   - `sms-notification` triggered by `order.shipped` that only fires when `event.priority` equals `'high'`
   - `push-notification` triggered by `order.shipped` that only fires when `fact customer:${event.customerId}:pushEnabled` equals `true`
   - `analytics-tracker` triggered by `order.shipped` that always executes
3. Simulate 200 events where ~30% have high priority
4. Print the pass rate for each rule and identify which rule is triggered most but executes least

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine, Rule } from '@hamicek/noex-rules';
import {
  onEvent, emit, setFact, log, ref, event, fact,
} from '@hamicek/noex-rules/dsl';

const engine = await RuleEngine.start({
  tracing: { enabled: true },
});

// Rule 1: Always fires
engine.registerRule(
  Rule.create('email-notification')
    .name('Email Notification')
    .when(onEvent('order.shipped'))
    .then(emit('notification.email', {
      orderId: ref('event.orderId'),
      customerId: ref('event.customerId'),
    }))
    .build()
);

// Rule 2: Only for high-priority orders (~30%)
engine.registerRule(
  Rule.create('sms-notification')
    .name('SMS Notification')
    .when(onEvent('order.shipped'))
    .if(event('priority').eq('high'))
    .then(emit('notification.sms', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Rule 3: Only when push is enabled (set for ~50% of customers)
engine.registerRule(
  Rule.create('push-notification')
    .name('Push Notification')
    .when(onEvent('order.shipped'))
    .if(fact('customer:${event.customerId}:pushEnabled').eq(true))
    .then(emit('notification.push', {
      orderId: ref('event.orderId'),
    }))
    .build()
);

// Rule 4: Always fires
engine.registerRule(
  Rule.create('analytics-tracker')
    .name('Analytics Tracker')
    .when(onEvent('order.shipped'))
    .then(setFact('analytics:shipped:count', '${(parseInt(fact.value || "0") + 1)}'))
    .build()
);

// Set push enabled for half the customers
for (let i = 0; i < 50; i++) {
  engine.setFact(`customer:c-${i}:pushEnabled`, true);
}

// Simulate 200 orders
for (let i = 0; i < 200; i++) {
  await engine.emit('order.shipped', {
    orderId: `ord-${i}`,
    customerId: `c-${i % 100}`,
    priority: Math.random() < 0.3 ? 'high' : 'normal',
  });
}

// Analyze
console.log('=== Notification System Profiling ===\n');

const profiles = engine.profiler.getRuleProfiles();
for (const profile of profiles) {
  console.log(`${profile.ruleName}:`);
  console.log(`  Triggered: ${profile.triggerCount}`);
  console.log(`  Executed: ${profile.executionCount}`);
  console.log(`  Skipped: ${profile.skipCount}`);
  console.log(`  Pass rate: ${(profile.passRate * 100).toFixed(1)}%`);
  console.log(`  Avg time: ${profile.avgTimeMs.toFixed(3)}ms`);
  console.log();
}

// Identify: most triggered but least executed
const lowestPass = engine.profiler.getLowestPassRate(1);
if (lowestPass.length) {
  console.log(`Lowest pass rate: ${lowestPass[0].ruleName} at ${(lowestPass[0].passRate * 100).toFixed(1)}%`);
  // sms-notification at ~30% (only high-priority orders)
}

await engine.stop();
```

The SMS notification rule has the lowest pass rate (~30%) because only high-priority orders trigger it. The push notification rule passes ~50% of the time (matching customers with push enabled). Email and analytics always execute at 100%.

</details>

## Summary

- The **`Profiler`** subscribes to `TraceCollector` and aggregates per-rule performance metrics in real-time
- Profiling is **automatic** when tracing is enabled — no extra configuration needed
- **`RuleProfile`** captures trigger count, execution count, skip count, timing (avg/min/max), and condition/action breakdowns
- **`ConditionProfile`** reveals per-condition pass rates and evaluation times
- **`ActionProfile`** tracks per-action execution times and success/failure rates
- Use `getSlowestRules()` and `getHottestRules()` to find performance bottlenecks
- Use `getLowestPassRate()` to identify rules with overly broad triggers
- Use `getHighestActionFailureRate()` to find rules with failing external calls
- **`getSummary()`** provides a high-level overview with the slowest and hottest rules
- **Reset** profiling data with `reset()` for focused benchmark runs
- All profiling data is available through **REST API endpoints** under `/debug/profile`

---

Next: [Audit Logging](./03-audit-logging.md)
