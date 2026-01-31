# Getting Started with the Web UI

The noex-rules Web UI is a React-based dashboard that connects to a running rule engine server and provides a graphical interface for everything you've been doing through code, REST, and CLI. It communicates via GraphQL for data queries and mutations, and via Server-Sent Events for real-time streaming. This chapter covers installation, server integration, and a walkthrough of every page in the UI.

## What You'll Learn

- How to install and register the UI plugin with Fastify
- The dashboard layout: sidebar navigation, engine health, statistics cards
- How each page works: rules, groups, facts, events, timers, audit, settings
- Real-time event streaming with pattern filtering, pause/resume, and test emission
- Theme switching (light/dark) and display preferences
- Keyboard shortcuts for navigating the entire UI without a mouse

## Installing the Web UI

The Web UI is distributed as a separate package:

```bash
npm install @hamicek/noex-rules-ui @fastify/static
```

`@fastify/static` is a peer dependency required for serving the built frontend assets.

## Registering the UI Plugin

The UI integrates with the same Fastify server that runs the REST and GraphQL APIs. Register it after starting the server:

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

// Register the UI plugin — serves the React app at /ui
await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Engine API: ${server.address}/api/v1`);
console.log(`GraphQL:    ${server.address}/graphql`);
console.log(`Web UI:     ${server.address}/ui`);
```

### UIPluginOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `basePath` | `string` | `'/ui'` | URL prefix where the UI is served |

The plugin registers `@fastify/static` to serve the pre-built React bundle, and sets up an SPA fallback so that all routes under `basePath` return `index.html` — letting the client-side router handle navigation.

## Architecture

```
Browser (React App)
    |
    |--- GraphQL (/graphql) ---> Fastify Server ---> RuleEngine
    |--- SSE (/stream/events) -> Fastify Server ---> RuleEngine
    |--- REST (/api/v1/*)  ----> Fastify Server ---> RuleEngine
    |
    |--- Static assets (/ui) --> @fastify/static
```

The UI uses `graphql-request` for API calls, TanStack React Query for client-side caching and synchronization, and the browser `EventSource` API for SSE. The server URL is configurable from the Settings page and persisted in `localStorage`.

## Dashboard

When you open the UI (e.g. `http://localhost:7226/ui`), you land on the **Dashboard** page, which shows:

### Engine Health

A status card displaying:
- Engine name (`noex-rules`)
- Health status: `ok`, `degraded`, or `error` with a color indicator
- Server version
- Uptime

The health endpoint is polled every 5 seconds.

### Statistics Cards

Six metric cards showing real-time engine counters:

| Metric | Description |
|--------|-------------|
| Rules | Total registered rules |
| Facts | Total facts in the store |
| Active Timers | Currently running timers |
| Events Processed | Cumulative events emitted |
| Rules Executed | Cumulative rule executions |
| Avg Latency | Average rule processing time (ms) |

Statistics are polled every 5 seconds.

## Sidebar Navigation

The sidebar provides access to all pages, with keyboard shortcuts shown alongside each item:

| Page | Shortcut | Description |
|------|----------|-------------|
| Dashboard | `g d` | Engine health and statistics overview |
| Rules | `g r` | Rule list with search, filter, create, enable/disable |
| Groups | `g g` | Rule group management (create, enable/disable, view rules) |
| Facts | `g f` | Fact browser with key/value display and editing |
| Events | `g e` | Real-time event stream with filtering and test emission |
| Timers | `g t` | Active timer list with creation and cancellation |
| Audit Log | `g a` | Audit entry browser with category/type/source filters |
| Settings | `g s` | Server URL, theme, display, notifications |

Additional shortcuts:
- `b` — Toggle sidebar collapsed/expanded
- `?` — Show keyboard shortcuts dialog

The sidebar is collapsible on desktop and slides out as an overlay on mobile.

## Rules Page

The Rules page (`/rules`) lists all registered rules in a sortable, searchable table:

- **Search** — Filter by ID, name, tags, or group
- **Status indicators** — Enabled/disabled badge, priority, version, group assignment
- **Actions** — Enable, disable, delete from the list view
- **Create** — `g n` shortcut or the "New Rule" button navigates to the rule creation form

Clicking a rule opens the **Rule Detail** page (`/rules/:ruleId`) with four tabs: Form, YAML, Flow, and History (covered in the next chapter).

## Groups Page

The Groups page (`/groups`) manages rule groups:

- Create groups with name and description
- Enable/disable groups (toggling a group affects all its rules)
- View rules assigned to each group
- Delete groups

## Facts Page

The Facts page (`/facts`) provides a browser for the fact store:

- Lists all facts with key, value, timestamp, source, and version
- Inline editing — click a fact value to modify it
- Create new facts with a key/value form
- Delete facts
- Search by key pattern

## Events Page

The Events page (`/events`) combines a real-time SSE stream with a test emitter:

### Event Stream

```
+------------------------------------------------------------------+
| Filter events...  | Patterns: [*           ] | ● Live | 42 events |
+------------------------------------------------------------------+
|   | Topic              | Source    | Correlation | Timestamp      |
|---|--------------------|-----------|-------------|----------------|
| ▶ | order.created      | api       | txn-abc     | 14:32:01.234   |
| ▶ | alert.high-value   | rule:...  | txn-abc     | 14:32:01.256   |
| ▶ | payment.completed  | api       | txn-abc     | 14:33:15.012   |
+------------------------------------------------------------------+
```

- **Pattern filtering** — Comma-separated patterns (e.g. `order.*, payment.*`). The UI opens an SSE connection to `/stream/events?patterns=...`
- **Pause/Resume** — Pause the stream to inspect events; buffered events merge back on resume
- **Clear** — Reset the event list
- **Expand** — Click a row to reveal full event data (ID, causation ID, JSON payload)
- **Search** — Client-side filter across topic, source, correlation ID, and data

### Test Event Emission

The "Emit Event" button opens an inline form:

```
+------------------------------------------------------------------+
| Emit Test Event                                                   |
| Topic: [order.created        ] Data (JSON): [{"orderId":"o-1"}]  |
| [Emit] [Cancel]                                                   |
+------------------------------------------------------------------+
```

Events emitted through this form go through `POST /api/v1/events` and trigger rules like any other event — you can watch the rule reactions in real-time in the stream above.

## Timers Page

The Timers page (`/timers`) shows all active timers:

- Name, expiration time, `onExpire` topic and data, repeat configuration
- Create new timers with name, duration, and `onExpire` settings
- Cancel individual timers
- Timers are polled every 10 seconds

## Audit Log Page

The Audit page (`/audit`) provides a filterable view of all audit entries:

- **Category filter** — `rule_management`, `rule_execution`, `fact_change`, `event_emitted`, `system`
- **Type filter** — `rule_registered`, `rule_executed`, `fact_updated`, etc.
- **Source filter** — Filter by originating component
- **Time range** — Entries sorted by timestamp, newest first
- **Detail expansion** — Click an entry to see the full JSON details, duration, and correlation ID

Audit data is polled every 15 seconds.

## Settings Page

The Settings page (`/settings`) controls UI preferences persisted in `localStorage`:

### Server Connection

Configure the API endpoint URL. The UI shows the connection status (`connected`, `connecting`, `disconnected`) with a colored indicator. A link to the Swagger API docs appears when connected.

The server URL defaults to the current origin (`window.location.origin`) or the `VITE_SERVER_URL` environment variable during development.

### Theme

Toggle between Light and Dark mode. The UI respects `prefers-color-scheme` by default and stores the override in `localStorage` under the key `noex-rules-theme`.

### Display Preferences

- **Default rule detail view** — Choose which tab opens first: Form, YAML, or Flow
- **Items per page** — 10, 25, 50, or 100 items in list views

### Notifications

Toggle toast notifications for rule engine events (rule triggers, fact changes, errors).

### Reset

The "Reset to defaults" button restores all settings to their initial values.

## Development Mode

For UI development, the frontend runs on a separate Vite dev server with hot module replacement:

```bash
cd ui
npm install
npm run dev
```

This starts the Vite dev server on port 7227 with proxy rules that forward API calls to the backend:

```typescript
// vite.config.ts
server: {
  port: 7227,
  proxy: {
    '/graphql': { target: 'http://localhost:7226', ws: true },
    '/api': 'http://localhost:7226',
    '/stream': 'http://localhost:7226',
  },
},
```

The `ws: true` option on the GraphQL proxy enables WebSocket forwarding for GraphQL subscriptions.

## Complete Example: Monitored Rule Engine

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';
import {
  onEvent, onFact, emit, setFact, deleteFact, setTimer, log,
  event, fact,
} from '@hamicek/noex-rules/dsl';

// Start the server with all integrations
const server = await RuleEngineServer.start({
  server: {
    port: 7226,
    swagger: true,
    graphql: true,
  },
  sseConfig: { heartbeatInterval: 15_000 },
  metricsConfig: { enabled: true },
});

const engine = server.getEngine();

// Register rules
engine.registerRule(
  Rule.create('track-order')
    .name('Track Order')
    .when(onEvent('order.created'))
    .then(setFact('order:${event.orderId}:status', 'pending'))
    .also(log('info', 'Order ${event.orderId} created'))
    .build()
);

engine.registerRule(
  Rule.create('high-value-alert')
    .name('High Value Order')
    .priority(10)
    .tags(['alerts', 'orders'])
    .when(onEvent('order.created'))
    .if(event('total').gte(500))
    .then(emit('alert.high-value', {
      orderId: '${event.orderId}',
      total: '${event.total}',
    }))
    .build()
);

engine.registerRule(
  Rule.create('payment-timeout')
    .name('Payment Timeout')
    .when(onEvent('order.created'))
    .then(setTimer({
      name: 'payment-deadline-${event.orderId}',
      duration: '30m',
      onExpire: {
        topic: 'order.payment-expired',
        data: { orderId: '${event.orderId}' },
      },
    }))
    .build()
);

engine.registerRule(
  Rule.create('cancel-expired')
    .name('Cancel Expired Order')
    .when(onEvent('order.payment-expired'))
    .then(setFact('order:${event.orderId}:status', 'cancelled'))
    .also(emit('notification.order-cancelled', {
      orderId: '${event.orderId}',
    }))
    .build()
);

// Register the Web UI
await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Rule engine:  ${server.address}/api/v1`);
console.log(`Swagger docs: ${server.address}/documentation`);
console.log(`GraphQL:      ${server.address}/graphql`);
console.log(`Web UI:       ${server.address}/ui`);
```

Open `http://localhost:7226/ui` in your browser. Navigate to the Events page, emit an `order.created` event with `{ "orderId": "o-1", "total": 750 }`, and watch the Dashboard statistics update, the Event stream show the emitted and derived events, and the Facts page reflect the new `order:o-1:status` fact.

## Exercise

1. Start a rule engine server on port 7226 with the Web UI registered at `/ui`
2. Register a rule that sets `sensor:{sensorId}:status` to `"warning"` when a `sensor.reading` event has `temperature > 60`
3. Open the Web UI Dashboard and verify the engine shows status `ok` with 1 rule
4. Navigate to the Events page and emit `{ "topic": "sensor.reading", "data": { "sensorId": "s-1", "temperature": 72 } }` using the test emitter
5. Navigate to the Facts page and confirm `sensor:s-1:status` is `"warning"`
6. Navigate to the Rules page, find your rule, and disable it through the UI
7. Emit another sensor reading event and verify no new fact is created

<details>
<summary>Solution</summary>

```typescript
import { RuleEngineServer } from '@hamicek/noex-rules';
import { Rule } from '@hamicek/noex-rules';
import { registerUI } from '@hamicek/noex-rules-ui/fastify';
import { onEvent, setFact, event } from '@hamicek/noex-rules/dsl';

const server = await RuleEngineServer.start({
  server: { port: 7226 },
});

const engine = server.getEngine();

engine.registerRule(
  Rule.create('temp-warning')
    .name('Temperature Warning')
    .when(onEvent('sensor.reading'))
    .if(event('temperature').gt(60))
    .then(setFact('sensor:${event.sensorId}:status', 'warning'))
    .build()
);

await registerUI(server.fastify, { basePath: '/ui' });

console.log(`Web UI: ${server.address}/ui`);
```

Steps in the browser:

1. Open `http://localhost:7226/ui` — Dashboard shows status `ok`, 1 rule
2. Press `g e` to navigate to Events
3. Click "Emit Event", set topic to `sensor.reading`, data to `{"sensorId": "s-1", "temperature": 72}`, click Emit
4. Press `g f` to navigate to Facts — `sensor:s-1:status` shows `"warning"`
5. Press `g r` to navigate to Rules — click the disable button on "Temperature Warning"
6. Press `g e`, emit another event with `temperature: 80`
7. Press `g f` — no new fact created (rule is disabled)

</details>

## Summary

- Install `@hamicek/noex-rules-ui` and `@fastify/static`, then call `registerUI(fastify, { basePath })` to serve the Web UI
- The UI communicates via GraphQL for data operations and SSE for real-time event streaming
- The Dashboard shows engine health (polled every 5s) and six statistics cards (rules, facts, timers, events, executions, latency)
- The sidebar provides navigation to all pages: Dashboard, Rules, Groups, Facts, Events, Timers, Audit Log, Settings
- The Events page combines a real-time SSE stream (with pattern filtering and pause/resume) with a test event emitter
- The Facts page supports browsing, inline editing, creation, and deletion of facts
- Settings persist in `localStorage`: server URL, theme (light/dark/system), default rule view, page size, notifications
- Keyboard shortcuts use a Vim-style `g` prefix for navigation (`g d` Dashboard, `g r` Rules, `g n` New Rule, etc.)
- For development, the Vite dev server on port 7227 proxies GraphQL (with WebSocket), REST, and SSE to the backend on port 7226

---

Next: [Visual Rule Builder](./02-visual-rule-builder.md)
