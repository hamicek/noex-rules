# Calling External Services

Rules don't live in isolation. They need to send emails, query databases, call APIs, and check external systems. noex-rules handles this through two mechanisms: the `call_service` action for fire-and-forget service calls, and data requirements (lookups) for fetching data that conditions and actions need. This chapter covers both.

## What You'll Learn

- How to register external services with the engine
- How to call services from rules using `call_service`
- How data requirements (lookups) work for pre-fetching data
- How lookup caching reduces redundant calls
- How error strategies control rule behavior when services fail
- How to use lookup results in conditions and actions

## Registering Services

Services are plain JavaScript objects registered in the engine configuration. Each service exposes methods that rules can call:

```typescript
const emailService = {
  send: async (to: string, subject: string, body: string) => {
    // Send email via SMTP, API, etc.
    console.log(`Email to ${to}: ${subject}`);
    return { sent: true, messageId: 'msg-123' };
  },
};

const inventoryService = {
  checkStock: async (productId: string) => {
    // Query inventory database
    return { productId, available: 42 };
  },
  reserve: async (productId: string, quantity: number) => {
    // Reserve items
    return { reserved: true };
  },
};

const engine = await RuleEngine.start({
  name: 'my-app',
  services: {
    emailService,
    inventoryService,
  },
});
```

Services can be any object with async methods. The engine doesn't impose any interface — it simply looks up the service by name and calls the specified method.

## call_service Action

The `call_service` action invokes a method on a registered service. Arguments are resolved for references before the call.

```typescript
{
  type: 'call_service',
  service: 'emailService',
  method: 'send',
  args: [
    { ref: 'event.customerEmail' },
    'Order Confirmation',
    'Your order ${event.orderId} has been confirmed.',
  ],
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `service` | `string` | Name of the registered service. |
| `method` | `string` | Method name to call on the service. |
| `args` | `unknown[]` | Arguments passed to the method. Each supports `{ ref: 'path' }`. |

### How It Works

1. Engine looks up the service by name in the registered services map
2. Engine looks up the method on the service object
3. Each argument is resolved — `{ ref: 'event.email' }` becomes the actual email string
4. The method is called with resolved arguments: `await service.method(...resolvedArgs)`
5. The return value is captured in `ActionResult.result`

### Example: Send Notification After Order

```typescript
engine.registerRule({
  id: 'order-notification',
  name: 'Order Confirmation Email',
  priority: 50,
  enabled: true,
  tags: ['orders', 'notifications'],
  trigger: { type: 'event', topic: 'order.confirmed' },
  conditions: [],
  actions: [
    {
      type: 'call_service',
      service: 'emailService',
      method: 'send',
      args: [
        { ref: 'event.customerEmail' },
        'Order Confirmed',
        'Your order has been confirmed. Thank you!',
      ],
    },
    {
      type: 'log',
      level: 'info',
      message: 'Confirmation email sent to ${event.customerEmail}',
    },
  ],
});
```

### Service Call Failures

If the service method throws an error, the action result records the failure:

```typescript
// ActionResult for a failed call
{
  action: { type: 'call_service', ... },
  success: false,
  error: 'Connection refused',
}
```

The remaining actions in the rule still execute. The engine does not retry automatically — implement retry logic in your service if needed.

## Data Requirements (Lookups)

Sometimes you need external data *before* evaluating conditions. For example, you might need a customer's credit score from an API before deciding whether to approve a loan. Data requirements solve this by pre-fetching data and making it available to conditions and actions.

### How Lookups Differ from call_service

| Aspect | `call_service` | Lookups |
|--------|---------------|---------|
| Timing | Runs during action execution (after conditions) | Runs before condition evaluation |
| Purpose | Side effects (send email, update DB) | Fetch data for decisions |
| Results | Available in `ActionResult` only | Available in conditions and actions via `lookup.name` |
| Caching | No built-in cache | Built-in TTL cache |
| Error handling | Action fails, others continue | `skip` (skip rule) or `fail` (throw error) |

### Defining Lookups on a Rule

Lookups are defined in the rule's `lookups` array:

```typescript
engine.registerRule({
  id: 'credit-check',
  name: 'Credit Score Check',
  priority: 100,
  enabled: true,
  tags: ['lending'],
  trigger: { type: 'event', topic: 'loan.requested' },
  lookups: [
    {
      name: 'creditScore',
      service: 'creditService',
      method: 'getScore',
      args: [{ ref: 'event.customerId' }],
      cache: { ttl: '5m' },
      onError: 'skip',
    },
  ],
  conditions: [
    {
      source: { type: 'lookup', name: 'creditScore', field: 'score' },
      operator: 'gte',
      value: 700,
    },
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'loan.approved',
      data: {
        customerId: { ref: 'event.customerId' },
        score: { ref: 'lookup.creditScore.score' },
      },
    },
  ],
});
```

### DataRequirement Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier. Used in conditions as `lookup.name` and in actions as `{ ref: 'lookup.name' }`. |
| `service` | `string` | Registered service name. |
| `method` | `string` | Method to call on the service. |
| `args` | `unknown[]` | Arguments. Support `{ ref: 'path' }` references. |
| `cache` | `{ ttl: string \| number }` | Optional. Cache the result for a duration. |
| `onError` | `'skip' \| 'fail'` | Error strategy. Default: `'skip'`. |

### Lookup Execution Flow

```text
  Rule triggered
      │
      ▼
  ┌───────────────────────────────┐
  │  Resolve lookups (parallel)   │
  │                               │
  │  creditScore ──► creditSvc    │
  │  userProfile ──► userSvc      │
  │                               │
  │  Check cache → hit? return    │
  │                  miss? call   │
  │  Cache result if TTL set      │
  └───────────────┬───────────────┘
                  │
          all succeeded?
          ┌───────┴───────┐
          │               │
         YES          error with
          │           onError='skip'
          ▼               ▼
  Evaluate conditions   Skip rule
  (can use lookup.*)    (no actions run)
```

### Lookup Cache

When `cache.ttl` is set, the result is cached using a composite key built from the service name, method name, and serialized arguments:

```typescript
lookups: [
  {
    name: 'userProfile',
    service: 'userService',
    method: 'getProfile',
    args: [{ ref: 'event.userId' }],
    cache: { ttl: '5m' },  // Cache for 5 minutes
    onError: 'skip',
  },
]
```

If the same service + method + arguments combination is requested within the TTL window, the cached result is returned without calling the service again. This is especially useful when multiple rules need the same external data.

The cache key is deterministic: objects have their keys sorted, so `{a: 1, b: 2}` and `{b: 2, a: 1}` produce the same key.

### Error Strategies

| Strategy | Behavior | Use When |
|----------|----------|----------|
| `'skip'` (default) | Rule is skipped entirely. No conditions evaluated, no actions run. Error is logged. | The rule requires the data — running without it makes no sense. |
| `'fail'` | Throws `DataResolutionError`. Halts rule processing for this trigger. | The data is critical and failure should be noticed immediately. |

```typescript
// Skip: rule won't fire if credit service is down
{ onError: 'skip' }

// Fail: throw an error if credit service is down
{ onError: 'fail' }
```

### Using Lookup Results

**In conditions** — use the `lookup` source type:

```typescript
conditions: [
  {
    source: { type: 'lookup', name: 'creditScore', field: 'score' },
    operator: 'gte',
    value: 700,
  },
  {
    source: { type: 'lookup', name: 'userProfile', field: 'isVerified' },
    operator: 'eq',
    value: true,
  },
]
```

**In actions** — use `{ ref: 'lookup.name.field' }`:

```typescript
actions: [
  {
    type: 'set_fact',
    key: 'customer:${event.customerId}:creditScore',
    value: { ref: 'lookup.creditScore.score' },
  },
  {
    type: 'log',
    level: 'info',
    message: 'Credit score for ${event.customerId}: ${lookup.creditScore.score}',
  },
]
```

## Complete Working Example

An email notification service that checks user preferences before sending, with caching to avoid repeated preference lookups:

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

// Simulated external services
const userService = {
  getPreferences: async (userId: string) => {
    console.log(`[userService] Fetching preferences for ${userId}`);
    // Simulate DB lookup
    const prefs: Record<string, { emailEnabled: boolean; email: string }> = {
      'U-100': { emailEnabled: true, email: 'alice@example.com' },
      'U-200': { emailEnabled: false, email: 'bob@example.com' },
      'U-300': { emailEnabled: true, email: 'carol@example.com' },
    };
    return prefs[userId] ?? { emailEnabled: false, email: '' };
  },
};

const emailService = {
  send: async (to: string, subject: string, body: string) => {
    console.log(`[emailService] Sending to ${to}: "${subject}"`);
    return { sent: true };
  },
};

async function main() {
  const engine = await RuleEngine.start({
    name: 'notifications',
    services: { userService, emailService },
  });

  // Rule 1: Send order confirmation email (checks preferences first)
  engine.registerRule({
    id: 'order-email',
    name: 'Order Confirmation Email',
    priority: 100,
    enabled: true,
    tags: ['notifications', 'orders'],
    trigger: { type: 'event', topic: 'order.confirmed' },
    lookups: [
      {
        name: 'prefs',
        service: 'userService',
        method: 'getPreferences',
        args: [{ ref: 'event.userId' }],
        cache: { ttl: '10m' },
        onError: 'skip',
      },
    ],
    conditions: [
      {
        source: { type: 'lookup', name: 'prefs', field: 'emailEnabled' },
        operator: 'eq',
        value: true,
      },
    ],
    actions: [
      {
        type: 'call_service',
        service: 'emailService',
        method: 'send',
        args: [
          { ref: 'lookup.prefs.email' },
          'Order Confirmed',
          'Your order has been confirmed!',
        ],
      },
      {
        type: 'log',
        level: 'info',
        message: 'Order email sent to ${lookup.prefs.email}',
      },
    ],
  });

  // Rule 2: Send shipping notification (also checks preferences)
  engine.registerRule({
    id: 'shipping-email',
    name: 'Shipping Notification Email',
    priority: 100,
    enabled: true,
    tags: ['notifications', 'shipping'],
    trigger: { type: 'event', topic: 'order.shipped' },
    lookups: [
      {
        name: 'prefs',
        service: 'userService',
        method: 'getPreferences',
        args: [{ ref: 'event.userId' }],
        cache: { ttl: '10m' },
        onError: 'skip',
      },
    ],
    conditions: [
      {
        source: { type: 'lookup', name: 'prefs', field: 'emailEnabled' },
        operator: 'eq',
        value: true,
      },
    ],
    actions: [
      {
        type: 'call_service',
        service: 'emailService',
        method: 'send',
        args: [
          { ref: 'lookup.prefs.email' },
          'Order Shipped',
          'Your order is on its way!',
        ],
      },
      {
        type: 'log',
        level: 'info',
        message: 'Shipping email sent to ${lookup.prefs.email}',
      },
    ],
  });

  // Test: User U-100 (email enabled)
  console.log('=== User U-100 (email enabled) ===');
  await engine.emit('order.confirmed', { userId: 'U-100', orderId: 'ORD-001' });
  // [userService] Fetching preferences for U-100  ← actual service call
  // [emailService] Sending to alice@example.com: "Order Confirmed"

  await engine.emit('order.shipped', { userId: 'U-100', orderId: 'ORD-001' });
  // No "Fetching preferences" log — result was cached from the first call
  // [emailService] Sending to alice@example.com: "Order Shipped"

  // Test: User U-200 (email disabled)
  console.log('\n=== User U-200 (email disabled) ===');
  await engine.emit('order.confirmed', { userId: 'U-200', orderId: 'ORD-002' });
  // [userService] Fetching preferences for U-200
  // No email sent — emailEnabled is false, condition fails

  await engine.stop();
}

main();
```

### What Happens

1. When `order.confirmed` fires for U-100, the engine resolves the `prefs` lookup by calling `userService.getPreferences('U-100')`
2. The result is cached with a 10-minute TTL
3. The condition checks `prefs.emailEnabled` — it's `true`, so the rule fires
4. The `call_service` action calls `emailService.send` with the email from the lookup result
5. When `order.shipped` fires for the same user, the `prefs` lookup hits the cache — no service call
6. For U-200, the lookup succeeds but `emailEnabled` is `false`, so the condition fails and no email is sent

## Exercise

Build a fraud check system that uses an external risk scoring service:

1. Register a `riskService` with a method `assessRisk(userId: string, amount: number)` that returns `{ score: number, factors: string[] }`. Simulate it by returning `{ score: 85, factors: ['new_account', 'high_amount'] }` for any input.
2. Create a rule triggered by `transaction.initiated` that:
   - Has a lookup named `risk` calling `riskService.assessRisk` with `event.userId` and `event.amount`, cached for `2m`, with `onError: 'skip'`
   - Condition: `risk.score` is greater than 70
   - Actions: emit `transaction.flagged` with the userId, amount, risk score, and factors. Also set fact `user:${userId}:riskScore` to the score.
3. Create a second rule triggered by `transaction.flagged` that logs a warning with the risk details.

<details>
<summary>Solution</summary>

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

const riskService = {
  assessRisk: async (userId: string, amount: number) => {
    console.log(`[riskService] Assessing risk for ${userId}, amount: ${amount}`);
    return { score: 85, factors: ['new_account', 'high_amount'] };
  },
};

async function main() {
  const engine = await RuleEngine.start({
    name: 'fraud-check',
    services: { riskService },
  });

  // Rule 1: Check risk score for transactions
  engine.registerRule({
    id: 'risk-check',
    name: 'Transaction Risk Check',
    priority: 200,
    enabled: true,
    tags: ['fraud', 'risk'],
    trigger: { type: 'event', topic: 'transaction.initiated' },
    lookups: [
      {
        name: 'risk',
        service: 'riskService',
        method: 'assessRisk',
        args: [{ ref: 'event.userId' }, { ref: 'event.amount' }],
        cache: { ttl: '2m' },
        onError: 'skip',
      },
    ],
    conditions: [
      {
        source: { type: 'lookup', name: 'risk', field: 'score' },
        operator: 'gt',
        value: 70,
      },
    ],
    actions: [
      {
        type: 'emit_event',
        topic: 'transaction.flagged',
        data: {
          userId: { ref: 'event.userId' },
          amount: { ref: 'event.amount' },
          riskScore: { ref: 'lookup.risk.score' },
          factors: { ref: 'lookup.risk.factors' },
        },
      },
      {
        type: 'set_fact',
        key: 'user:${event.userId}:riskScore',
        value: { ref: 'lookup.risk.score' },
      },
    ],
  });

  // Rule 2: Log flagged transactions
  engine.registerRule({
    id: 'flag-logger',
    name: 'Flagged Transaction Logger',
    priority: 100,
    enabled: true,
    tags: ['fraud', 'audit'],
    trigger: { type: 'event', topic: 'transaction.flagged' },
    conditions: [],
    actions: [
      {
        type: 'log',
        level: 'warn',
        message: 'FLAGGED: User ${event.userId}, amount ${event.amount}, risk score ${event.riskScore}',
      },
    ],
  });

  // Test
  engine.subscribe('transaction.*', (event) => {
    console.log(`[${event.topic}]`, event.data);
  });

  await engine.emit('transaction.initiated', {
    userId: 'U-100',
    amount: 5000,
  });

  console.log('Risk score fact:', engine.getFact('user:U-100:riskScore'));
  // 85

  await engine.stop();
}

main();
```

Rule 1 fetches the risk score via a lookup, checks if it exceeds 70, and flags the transaction. The score is cached for 2 minutes, so rapid repeated transactions for the same user and amount skip the service call. Rule 2 logs a warning for every flagged transaction.

</details>

## Summary

- Register services as plain objects with async methods in `RuleEngineConfig.services`
- `call_service` invokes a service method during action execution — use it for side effects (emails, writes, API calls)
- Arguments support `{ ref: 'path' }` for dynamic values resolved at execution time
- Data requirements (lookups) pre-fetch data before conditions — use them when conditions or actions need external data
- Lookup results are available as `{ type: 'lookup', name, field }` in conditions and `{ ref: 'lookup.name.field' }` in actions
- Cache lookups with `cache: { ttl: '5m' }` to avoid redundant calls across rules
- Error strategy `'skip'` (default) skips the rule silently; `'fail'` throws and halts processing
- Cache keys are deterministic: same service + method + arguments always produce the same key
- Service failures in `call_service` don't stop other actions — implement retries in your service layer if needed

---

Next: [Fluent Builder API](../04-dsl/01-fluent-builder.md)
