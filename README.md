# @hamicek/noex-rules

A powerful Rule Engine with Complex Event Processing (CEP) capabilities built on the [noex](https://github.com/hamicek/noex) framework.

## Features

- **Forward Chaining** - Automatic rule evaluation on fact/event changes
- **Multiple Trigger Types** - Fact changes, events, timer expiration, and temporal patterns
- **Complex Conditions** - Rich operators including equality, comparison, membership, regex matching
- **Powerful Actions** - Set facts, emit events, manage timers, call external services
- **Pattern Matching** - Wildcard support for fact keys and event topics
- **String Interpolation** - Dynamic values using `${expression}` syntax
- **Reference Resolution** - Access trigger data, facts, and context variables
- **Event Correlation** - Track related events via correlation IDs
- **CEP Patterns** - Sequence, absence, count, and aggregate temporal patterns
- **Priority-based Execution** - Higher priority rules execute first
- **Fault Tolerant** - Individual rule failures don't affect other rules

## Installation

```bash
npm install @hamicek/noex-rules
```

## Quick Start

```typescript
import { RuleEngine } from '@hamicek/noex-rules';

// Create and start the engine
const engine = await RuleEngine.start({
  name: 'my-engine',
  maxConcurrency: 10
});

// Register a rule
engine.registerRule({
  id: 'order-notification',
  name: 'Send Order Notification',
  priority: 100,
  enabled: true,
  tags: ['orders'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [
    {
      source: { type: 'event', field: 'amount' },
      operator: 'gte',
      value: 100
    }
  ],
  actions: [
    {
      type: 'emit_event',
      topic: 'notification.send',
      data: {
        orderId: { ref: 'event.orderId' },
        message: 'Large order received!'
      }
    }
  ]
});

// Emit an event - triggers rule evaluation
await engine.emit('order.created', {
  orderId: 'ORD-123',
  amount: 250
});

// Subscribe to events
engine.subscribe('notification.*', (event, topic) => {
  console.log(`Received ${topic}:`, event.data);
});

// Clean up
await engine.stop();
```

## API Reference

### RuleEngine

#### Creation

```typescript
const engine = await RuleEngine.start(config?: RuleEngineConfig);
```

**RuleEngineConfig:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `'rule-engine'` | Engine instance name |
| `maxConcurrency` | `number` | `10` | Max parallel rule evaluations |
| `debounceMs` | `number` | `0` | Debounce delay for fact changes |
| `services` | `Record<string, unknown>` | `{}` | External services for `call_service` action |

#### Rule Management

```typescript
// Register a rule
const rule = engine.registerRule(ruleInput);

// Unregister a rule
const success = engine.unregisterRule(ruleId);

// Enable/disable rules
engine.enableRule(ruleId);
engine.disableRule(ruleId);

// Get rules
const rule = engine.getRule(ruleId);
const allRules = engine.getRules();
```

#### Fact Management

```typescript
// Set a fact (triggers rule evaluation)
const fact = await engine.setFact('customer:123:tier', 'gold');

// Get fact value
const tier = engine.getFact('customer:123:tier');

// Get full fact with metadata
const factFull = engine.getFactFull('customer:123:tier');

// Delete a fact
engine.deleteFact('customer:123:tier');

// Query facts with pattern matching
const customerFacts = engine.queryFacts('customer:123:*');
```

#### Event Emission

```typescript
// Emit an event
const event = await engine.emit('order.created', { orderId: '123' });

// Emit with correlation
const event = await engine.emitCorrelated(
  'order.shipped',
  { orderId: '123' },
  'correlation-id',
  'causation-id'
);
```

#### Timer Management

```typescript
// Set a timer
const timer = await engine.setTimer({
  name: 'payment-timeout:order-123',
  duration: '15m',  // Supports: ms, s, m, h, d, w, y
  onExpire: {
    topic: 'order.payment_timeout',
    data: { orderId: '123' }
  }
});

// Cancel a timer
await engine.cancelTimer('payment-timeout:order-123');

// Get timer
const timer = engine.getTimer('payment-timeout:order-123');
```

#### Event Subscription

```typescript
// Subscribe to specific topic
const unsubscribe = engine.subscribe('order.created', (event, topic) => {
  console.log(event);
});

// Subscribe with wildcard
engine.subscribe('order.*', (event, topic) => { /* ... */ });
engine.subscribe('*', (event, topic) => { /* ... */ });

// Unsubscribe
unsubscribe();
```

#### Statistics & Lifecycle

```typescript
// Get engine statistics
const stats = engine.getStats();
// { rulesCount, factsCount, timersCount, eventsProcessed, rulesExecuted, avgProcessingTimeMs }

// Check if running
engine.isRunning;

// Stop the engine
await engine.stop();
```

### Rule Structure

```typescript
interface Rule {
  id: string;
  name: string;
  description?: string;
  priority: number;      // Higher = evaluated first
  enabled: boolean;
  tags: string[];
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
}
```

### Triggers

```typescript
// Fact change trigger - supports wildcards
{ type: 'fact', pattern: 'customer:*:totalSpent' }

// Event trigger
{ type: 'event', topic: 'order.created' }

// Timer expiration trigger
{ type: 'timer', name: 'payment-timeout:*' }

// Temporal pattern trigger (CEP)
{ type: 'temporal', pattern: { /* TemporalPattern */ } }
```

### Conditions

```typescript
interface RuleCondition {
  source:
    | { type: 'fact'; pattern: string }    // Fact value
    | { type: 'event'; field: string }     // Event field
    | { type: 'context'; key: string };    // Context variable

  operator:
    | 'eq' | 'neq'                         // Equality
    | 'gt' | 'gte' | 'lt' | 'lte'         // Comparison
    | 'in' | 'not_in'                     // Membership
    | 'contains' | 'not_contains'         // String/array contains
    | 'matches'                            // Regex
    | 'exists' | 'not_exists';            // Existence

  value: unknown | { ref: string };        // Literal or reference
}
```

### Actions

```typescript
// Set a fact
{ type: 'set_fact', key: 'order:${event.orderId}:status', value: 'confirmed' }

// Delete a fact
{ type: 'delete_fact', key: 'temp:${event.id}' }

// Emit an event
{
  type: 'emit_event',
  topic: 'order.confirmed',
  data: {
    orderId: { ref: 'event.orderId' },
    timestamp: { ref: 'event.timestamp' }
  }
}

// Set a timer
{
  type: 'set_timer',
  timer: {
    name: 'reminder:${event.userId}',
    duration: '24h',
    onExpire: {
      topic: 'user.reminder',
      data: { userId: { ref: 'event.userId' } }
    }
  }
}

// Cancel a timer
{ type: 'cancel_timer', name: 'reminder:${event.userId}' }

// Call external service
{
  type: 'call_service',
  service: 'emailService',
  method: 'send',
  args: [{ ref: 'event.email' }, 'Welcome!']
}

// Log
{ type: 'log', level: 'info', message: 'Order ${event.orderId} processed' }
```

### References

Use `{ ref: 'path' }` to reference dynamic values:

- `event.fieldName` - Field from triggering event
- `trigger.data.fieldName` - Same as event
- `fact.key.path` - Value from a fact
- `matched.0.data.field` - For temporal patterns, access matched events

### String Interpolation

Use `${expression}` in strings:

```typescript
{
  type: 'set_fact',
  key: 'order:${event.orderId}:status',  // Dynamic key
  value: 'processed'
}
```

## Temporal Patterns (CEP)

### Sequence Pattern

Detect events occurring in a specific order within a time window:

```typescript
{
  type: 'sequence',
  events: [
    { topic: 'auth.login_failed', as: 'attempt1' },
    { topic: 'auth.login_failed', as: 'attempt2' },
    { topic: 'auth.login_failed', as: 'attempt3' }
  ],
  within: '5m',
  groupBy: 'data.userId',
  strict: false  // Allow other events between
}
```

### Absence Pattern

Detect when an expected event does NOT occur:

```typescript
{
  type: 'absence',
  after: { topic: 'order.created' },
  expected: { topic: 'payment.received' },
  within: '15m',
  groupBy: 'data.orderId'
}
```

### Count Pattern

Detect event frequency thresholds:

```typescript
{
  type: 'count',
  event: { topic: 'error.*', filter: { severity: 'critical' } },
  threshold: 10,
  comparison: 'gte',
  window: '1m',
  sliding: true
}
```

### Aggregate Pattern

Detect aggregate value thresholds:

```typescript
{
  type: 'aggregate',
  event: { topic: 'transaction.completed' },
  field: 'data.amount',
  function: 'sum',  // sum, avg, min, max, count
  threshold: 10000,
  comparison: 'gte',
  window: '1h',
  groupBy: 'data.accountId'
}
```

## Examples

### Payment Timeout Flow

```typescript
// Start payment timeout when order is created
engine.registerRule({
  id: 'start-payment-timeout',
  name: 'Start Payment Timeout',
  priority: 100,
  enabled: true,
  tags: ['order', 'payment'],
  trigger: { type: 'event', topic: 'order.created' },
  conditions: [],
  actions: [
    {
      type: 'set_timer',
      timer: {
        name: 'payment-timeout:${event.orderId}',
        duration: '15m',
        onExpire: {
          topic: 'order.payment_timeout',
          data: { orderId: { ref: 'event.orderId' } }
        }
      }
    }
  ]
});

// Cancel timeout when payment received
engine.registerRule({
  id: 'payment-received',
  name: 'Payment Received',
  priority: 100,
  enabled: true,
  tags: ['order', 'payment'],
  trigger: { type: 'event', topic: 'payment.confirmed' },
  conditions: [],
  actions: [
    { type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' },
    { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'paid' }
  ]
});

// Cancel order on timeout
engine.registerRule({
  id: 'cancel-unpaid-order',
  name: 'Cancel Unpaid Order',
  priority: 100,
  enabled: true,
  tags: ['order', 'payment'],
  trigger: { type: 'event', topic: 'order.payment_timeout' },
  conditions: [
    {
      source: { type: 'fact', pattern: 'order:${event.orderId}:status' },
      operator: 'neq',
      value: 'paid'
    }
  ],
  actions: [
    { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'cancelled' },
    {
      type: 'emit_event',
      topic: 'order.cancelled',
      data: { orderId: { ref: 'event.orderId' }, reason: 'payment_timeout' }
    }
  ]
});
```

### VIP Customer Upgrade

```typescript
engine.registerRule({
  id: 'vip-upgrade',
  name: 'VIP Upgrade',
  priority: 100,
  enabled: true,
  tags: ['customer', 'loyalty'],
  trigger: { type: 'fact', pattern: 'customer:*:totalSpent' },
  conditions: [
    {
      source: { type: 'fact', pattern: 'customer:*:totalSpent' },
      operator: 'gte',
      value: 10000
    },
    {
      source: { type: 'fact', pattern: 'customer:*:tier' },
      operator: 'neq',
      value: 'vip'
    }
  ],
  actions: [
    { type: 'set_fact', key: 'customer:${trigger.data.fact.key.split(":")[1]}:tier', value: 'vip' },
    {
      type: 'emit_event',
      topic: 'customer.upgraded',
      data: { tier: 'vip' }
    }
  ]
});
```

## Architecture

```
RuleEngine
├── FactStore          - In-memory fact storage with pattern matching
├── EventStore         - Event storage with correlation and time-based queries
├── TimerManager       - Timer scheduling and expiration
├── RuleManager        - Rule storage and indexing
├── ConditionEvaluator - Condition evaluation
├── ActionExecutor     - Action execution with interpolation
└── TemporalProcessor  - CEP pattern processing
```

## Requirements

- Node.js >= 20.0.0
- TypeScript >= 5.7.0 (for development)

## License

MIT
