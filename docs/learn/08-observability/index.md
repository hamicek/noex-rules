# Part 8: Observability

A rule engine that you can't see inside is a black box. When a rule doesn't fire, when actions take too long, or when you need a compliance trail of every change — you need observability. noex-rules provides four complementary layers: **debug tracing** for development-time inspection with breakpoints and snapshots, **profiling** for per-rule performance analysis, **audit logging** for always-on persistent compliance records, and **metrics** for Prometheus scraping and OpenTelemetry span export.

## Chapters

### [8.1 Debugging Rules](./01-debugging.md)

Development-time debugging with IDE-like capabilities:
- `TraceCollector` ring buffer with correlation-based lookups
- `DebugController` with breakpoints, pause/resume, and snapshots
- `HistoryService` for event context and causation chains
- Exporting traces as JSON or Mermaid diagrams

### [8.2 Profiling Performance](./02-profiling.md)

Per-rule performance analysis from the trace stream:
- `Profiler` with per-rule, per-condition, and per-action metrics
- Finding the slowest and hottest rules
- Pass rate and failure rate analysis
- REST API endpoints for profiling data

### [8.3 Audit Logging](./03-audit-logging.md)

Always-on, persistent compliance and production monitoring:
- `AuditLogService` with time-bucketed persistence
- 26 audit event types across 5 categories
- Flexible querying with pagination and filtering
- Real-time SSE streaming of audit entries

### [8.4 Metrics and Tracing](./04-metrics.md)

Production-grade observability with standard tooling:
- `MetricsCollector` with Prometheus text exposition format
- Counters, histograms, and gauges for engine activity
- `OpenTelemetryBridge` for distributed tracing
- Span hierarchy mapping from trace entries to OTel spans

## What You'll Learn

By the end of this section, you'll be able to:
- Enable tracing and set breakpoints to debug rule evaluation step by step
- Profile rules to find performance bottlenecks and low pass rates
- Configure persistent audit logging for compliance requirements
- Expose Prometheus metrics and integrate with OpenTelemetry
- Use the REST API and SSE streams for real-time observability dashboards

---

Start with: [Debugging Rules](./01-debugging.md)
