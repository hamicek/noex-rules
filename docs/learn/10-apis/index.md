# Part 10: APIs and Integration

So far you've interacted with the rule engine exclusively through TypeScript code — calling `engine.emit()`, `engine.setFact()`, and `engine.query()` directly. In production, however, the engine needs to be accessible to other services, dashboards, and operators. noex-rules ships with a full-featured HTTP server that exposes **REST endpoints**, **Server-Sent Events** for real-time streaming, **webhooks** for push-based delivery, a **GraphQL API** for flexible querying, and a **CLI** for operations and CI/CD workflows.

## Chapters

### [10.1 REST API](./01-rest-api.md)

Start the HTTP server and interact with the engine over REST:
- `RuleEngineServer.start()` configuration and lifecycle
- Complete endpoint reference: rules, facts, events, timers, groups, health
- Swagger/OpenAPI documentation and CORS configuration
- Practical curl examples for every resource

### [10.2 Real-time Notifications](./02-realtime.md)

Push events to clients as they happen:
- Server-Sent Events (SSE) with topic filtering via wildcard patterns
- Webhooks with HMAC-SHA256 signatures and exponential backoff retry
- Building a real-time dashboard with the `EventSource` browser API
- Choosing between SSE and webhooks for different use cases

### [10.3 GraphQL API](./03-graphql.md)

Query the engine with a flexible, typed API:
- Full schema overview: queries, mutations, subscriptions
- Fetching nested data in a single request (rules with groups, versions, audit entries)
- Real-time subscriptions over WebSocket
- GraphiQL IDE for exploration and debugging

### [10.4 Command Line Interface](./04-cli.md)

Operate the engine from the terminal:
- All CLI commands: server, rule, audit, validate, test, import, export, stats, init
- Output formats: pretty, JSON, table
- CI/CD integration patterns for rule validation and deployment

## What You'll Learn

By the end of this section, you'll be able to:
- Start and configure the HTTP server with REST, GraphQL, SSE, and Swagger
- Manage rules, facts, events, timers, and groups through REST endpoints
- Stream real-time events to browsers via SSE and to external services via webhooks
- Verify webhook authenticity using HMAC-SHA256 signatures
- Query and mutate the engine through GraphQL with nested field resolution
- Subscribe to live engine events over WebSocket
- Operate the engine from the command line for development and CI/CD

---

Start with: [REST API](./01-rest-api.md)
