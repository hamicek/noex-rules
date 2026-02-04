# ActionExecutor

Executes rule actions with support for dynamic references, string interpolation, and tracing callbacks.

## Import

```typescript
import {
  ActionExecutor,
  ExecutionContext,
  ExecutionOptions
} from '@hamicek/noex-rules';
```

## Constructor

```typescript
new ActionExecutor(
  factStore: FactStore,
  timerManager: TimerManager,
  emitEvent: EventEmitter,
  services?: Map<string, unknown>,
  conditionEvaluator?: ConditionEvaluator
)
```

Creates a new ActionExecutor instance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| factStore | `FactStore` | yes | Fact store for set_fact/delete_fact actions |
| timerManager | `TimerManager` | yes | Timer manager for set_timer/cancel_timer actions |
| emitEvent | `EventEmitter` | yes | Function to emit events |
| services | `Map<string, unknown>` | no | Registered services for call_service actions |
| conditionEvaluator | `ConditionEvaluator` | no | Required for conditional actions |

**Example:**

```typescript
const executor = new ActionExecutor(
  factStore,
  timerManager,
  (topic, event) => engine.emit(topic, event),
  new Map([['emailService', emailService]]),
  conditionEvaluator
);
```

---

## Methods

### execute()

```typescript
async execute(
  actions: RuleAction[],
  context: ExecutionContext,
  options?: ExecutionOptions
): Promise<ActionResult[]>
```

Executes all actions in sequence with optional tracing.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| actions | `RuleAction[]` | yes | Array of actions to execute |
| context | `ExecutionContext` | yes | Runtime context with trigger data, facts, variables |
| options | `ExecutionOptions` | no | Tracing callback options |

**Returns:** `Promise<ActionResult[]>` — Results for each action (success/failure)

**Example:**

```typescript
const actions: RuleAction[] = [
  { type: 'set_fact', key: 'order:${event.orderId}:status', value: 'confirmed' },
  { type: 'emit_event', topic: 'order.confirmed', data: { orderId: { ref: 'event.orderId' } } }
];

const context: ExecutionContext = {
  trigger: { type: 'event', data: { orderId: 'ORD-123', amount: 150 } },
  facts: factStore,
  variables: new Map(),
  correlationId: 'corr-abc'
};

const results = await executor.execute(actions, context);

for (const result of results) {
  if (result.success) {
    console.log(`Action ${result.action.type} succeeded`);
  } else {
    console.error(`Action ${result.action.type} failed: ${result.error}`);
  }
}
```

---

## Types

### ExecutionContext

```typescript
interface ExecutionContext {
  trigger: {
    type: string;
    data: Record<string, unknown>;
  };
  facts: FactStore;
  variables: Map<string, unknown>;
  matchedEvents?: Array<{ data: Record<string, unknown> }>;
  lookups?: Map<string, unknown>;
  correlationId?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| trigger | `object` | Trigger information with type and data payload |
| facts | `FactStore` | Fact store instance for reference resolution |
| variables | `Map` | Runtime variables |
| matchedEvents | `Array` | Matched events from temporal patterns |
| lookups | `Map` | Pre-resolved external lookup results |
| correlationId | `string` | Correlation ID propagated to emitted events and timers |

### ExecutionOptions

```typescript
interface ExecutionOptions {
  onActionStarted?: ActionStartedCallback;
  onActionCompleted?: ActionCompletedCallback;
  onActionFailed?: ActionFailedCallback;
}
```

| Field | Type | Description |
|-------|------|-------------|
| onActionStarted | `function` | Called when an action starts execution |
| onActionCompleted | `function` | Called when an action completes successfully |
| onActionFailed | `function` | Called when an action fails |

### EventEmitter

```typescript
type EventEmitter = (topic: string, event: Event) => void | Promise<void>;
```

Function type for emitting events. Can be synchronous or asynchronous.

### ActionResult

```typescript
interface ActionResult {
  action: RuleAction;
  success: boolean;
  result?: unknown;
  error?: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| action | `RuleAction` | The action that was executed |
| success | `boolean` | Whether execution succeeded |
| result | `unknown` | Return value from the action (if successful) |
| error | `string` | Error message (if failed) |

### ConditionalActionResult

```typescript
interface ConditionalActionResult {
  conditionMet: boolean;
  branchExecuted: 'then' | 'else' | 'none';
  results: ActionResult[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| conditionMet | `boolean` | Whether conditional action's conditions passed |
| branchExecuted | `string` | Which branch was executed |
| results | `ActionResult[]` | Results from executed branch actions |

---

## Action Types

### set_fact

Sets a fact value in the fact store.

```typescript
{ type: 'set_fact', key: string, value: unknown | { ref: string } }
```

| Field | Type | Description |
|-------|------|-------------|
| key | `string` | Fact key (supports interpolation) |
| value | `unknown` | Value to set (supports references) |

**Example:**

```typescript
{ type: 'set_fact', key: 'order:${event.orderId}:status', value: 'confirmed' }
{ type: 'set_fact', key: 'user:balance', value: { ref: 'event.newBalance' } }
```

### delete_fact

Deletes a fact from the fact store.

```typescript
{ type: 'delete_fact', key: string }
```

| Field | Type | Description |
|-------|------|-------------|
| key | `string` | Fact key to delete (supports interpolation) |

**Example:**

```typescript
{ type: 'delete_fact', key: 'session:${event.sessionId}' }
```

### emit_event

Emits a new event with generated ID, timestamp, and correlation ID from context.

```typescript
{ type: 'emit_event', topic: string, data: Record<string, unknown | { ref: string }> }
```

| Field | Type | Description |
|-------|------|-------------|
| topic | `string` | Event topic (supports interpolation) |
| data | `object` | Event payload (values support references) |

**Example:**

```typescript
{
  type: 'emit_event',
  topic: 'order.${event.status}',
  data: {
    orderId: { ref: 'event.orderId' },
    total: { ref: 'event.amount' },
    processedAt: Date.now()
  }
}
```

### set_timer

Sets a timer that emits an event on expiration.

```typescript
{ type: 'set_timer', timer: TimerConfig }
```

**TimerConfig:**

```typescript
interface TimerConfig {
  name: string;
  duration: string | number;
  onExpire: {
    topic: string;
    data: Record<string, unknown | { ref: string }>;
  };
  repeat?: {
    interval: string | number;
    maxCount?: number;
  };
}
```

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Timer name for cancellation (supports interpolation) |
| duration | `string \| number` | Duration (`"15m"`, `"24h"`) or milliseconds |
| onExpire.topic | `string` | Event topic on expiration |
| onExpire.data | `object` | Event payload on expiration |
| repeat.interval | `string \| number` | Repeat interval |
| repeat.maxCount | `number` | Maximum repeat count |

**Example:**

```typescript
{
  type: 'set_timer',
  timer: {
    name: 'payment-timeout:${event.orderId}',
    duration: '15m',
    onExpire: {
      topic: 'payment.timeout',
      data: { orderId: { ref: 'event.orderId' } }
    }
  }
}
```

### cancel_timer

Cancels an existing timer by name.

```typescript
{ type: 'cancel_timer', name: string }
```

| Field | Type | Description |
|-------|------|-------------|
| name | `string` | Timer name to cancel (supports interpolation) |

**Example:**

```typescript
{ type: 'cancel_timer', name: 'payment-timeout:${event.orderId}' }
```

### call_service

Calls a method on a registered service.

```typescript
{ type: 'call_service', service: string, method: string, args: unknown[] }
```

| Field | Type | Description |
|-------|------|-------------|
| service | `string` | Registered service name |
| method | `string` | Method name to call |
| args | `unknown[]` | Method arguments (support references) |

**Example:**

```typescript
{
  type: 'call_service',
  service: 'emailService',
  method: 'send',
  args: [{ ref: 'event.email' }, 'Order Confirmed', { ref: 'event.orderId' }]
}
```

Throws error if service or method not found.

### log

Logs a message to console.

```typescript
{ type: 'log', level: 'debug' | 'info' | 'warn' | 'error', message: string }
```

| Field | Type | Description |
|-------|------|-------------|
| level | `string` | Log level |
| message | `string` | Message to log (supports interpolation) |

**Example:**

```typescript
{ type: 'log', level: 'info', message: 'Order ${event.orderId} processed with amount ${event.amount}' }
```

### conditional

Executes actions conditionally based on runtime conditions.

```typescript
{
  type: 'conditional',
  conditions: RuleCondition[],
  then: RuleAction[],
  else?: RuleAction[]
}
```

| Field | Type | Description |
|-------|------|-------------|
| conditions | `RuleCondition[]` | Conditions to evaluate (AND logic) |
| then | `RuleAction[]` | Actions to execute if conditions pass |
| else | `RuleAction[]` | Actions to execute if conditions fail (optional) |

Requires `ConditionEvaluator` to be provided in constructor.

**Example:**

```typescript
{
  type: 'conditional',
  conditions: [
    { source: { type: 'event', field: 'amount' }, operator: 'gte', value: 1000 }
  ],
  then: [
    { type: 'emit_event', topic: 'order.high-value', data: { orderId: { ref: 'event.orderId' } } }
  ],
  else: [
    { type: 'emit_event', topic: 'order.standard', data: { orderId: { ref: 'event.orderId' } } }
  ]
}
```

---

## References and Interpolation

### String Interpolation

String fields (keys, topics, messages) support `${...}` interpolation:

```typescript
'order:${event.orderId}:status'    // → 'order:ORD-123:status'
'User ${event.name} logged in'     // → 'User John logged in'
```

### Object References

Value fields support `{ ref: string }` for dynamic resolution:

```typescript
{ ref: 'event.orderId' }           // → value from trigger data
{ ref: 'fact.user:balance' }       // → value from fact store
{ ref: 'var.threshold' }           // → value from variables
{ ref: 'lookup.profile.tier' }     // → value from lookup result
{ ref: 'matched.0.amount' }        // → value from first matched event
```

### Reference Sources

| Prefix | Description |
|--------|-------------|
| `event.` / `trigger.` | Trigger data payload |
| `fact.` | Fact store value |
| `var.` | Context variable |
| `lookup.` | Pre-resolved lookup result |
| `matched.N.` | Nth matched event data (temporal patterns) |

---

## Tracing

Use execution options to trace action execution.

### Callback Types

```typescript
type ActionStartedCallback = (info: ActionStartedInfo) => void;
type ActionCompletedCallback = (info: ActionCompletedInfo) => void;
type ActionFailedCallback = (info: ActionFailedInfo) => void;
```

### ActionStartedInfo

```typescript
interface ActionStartedInfo {
  actionIndex: number;
  actionType: string;
  input: Record<string, unknown>;
}
```

### ActionCompletedInfo

```typescript
interface ActionCompletedInfo {
  actionIndex: number;
  actionType: string;
  output: unknown;
  durationMs: number;
}
```

### ActionFailedInfo

```typescript
interface ActionFailedInfo {
  actionIndex: number;
  actionType: string;
  error: string;
  durationMs: number;
}
```

**Example:**

```typescript
const results = await executor.execute(actions, context, {
  onActionStarted: (info) => {
    console.log(`[${info.actionIndex}] Starting ${info.actionType}`);
  },
  onActionCompleted: (info) => {
    console.log(`[${info.actionIndex}] Completed ${info.actionType} in ${info.durationMs}ms`);
  },
  onActionFailed: (info) => {
    console.error(`[${info.actionIndex}] Failed ${info.actionType}: ${info.error}`);
  }
});
```

---

## Behavior Notes

### Sequential Execution

Actions execute sequentially in array order. Each action completes before the next starts.

### Error Handling

Failed actions do not stop execution. All actions are attempted, and results indicate success/failure for each:

```typescript
const results = await executor.execute(actions, context);

const failed = results.filter(r => !r.success);
if (failed.length > 0) {
  console.error('Some actions failed:', failed.map(r => r.error));
}
```

### Correlation Propagation

`correlationId` from context is automatically propagated to:
- Emitted events (`event.correlationId`)
- Timers (for tracing)

### Service Not Found

`call_service` throws error if service or method not registered:

```typescript
// Error: Service not found: unknownService
// Error: Method not found: emailService.unknownMethod
```

---

## See Also

- [ConditionEvaluator](./07-condition-evaluator.md) — Evaluating conditions
- [DSL Actions](./12-dsl-actions.md) — Fluent action builders
- [TimerManager](./04-timer-manager.md) — Timer management
- [Rule Actions](../learn/03-rules-deep-dive/03-actions.md) — Tutorial
