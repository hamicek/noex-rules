# Part 6: Rule Organization

A handful of rules is easy to manage. But as your system grows to dozens or hundreds of rules, you need structure: a way to enable and disable related rules together, control which rules evaluate first, and track how rules change over time. noex-rules provides three organizational primitives — **groups**, **tags**, and **priority** — plus a built-in **versioning system** that records every change for auditing and rollback.

## Chapters

### [6.1 Rule Groups and Tags](./01-groups-and-tags.md)

Organizing rules into logical units with shared lifecycle:
- Rule groups as a master enable/disable switch
- The `isRuleActive()` semantics: `rule.enabled AND group.enabled`
- Tags for cross-cutting categorization and filtering
- Use cases: feature flags, A/B testing, environment-specific rules

### [6.2 Priority and Execution Order](./02-priority-and-ordering.md)

Controlling which rules evaluate first and how the engine processes triggers:
- Priority: higher number = evaluated sooner
- Rule chaining: actions that trigger other rules
- Avoiding infinite loops with `maxConcurrency` and `debounceMs`
- Designing rule evaluation order for predictable behavior

### [6.3 Rule Versioning](./03-versioning.md)

Tracking rule changes with full history, diffs, and rollback:
- `VersioningConfig` setup with storage adapter
- Automatic version recording on every rule change
- Querying version history with filtering and pagination
- Field-level diffs between any two versions
- Rolling back to a previous version

## What You'll Learn

By the end of this section, you'll be able to:
- Group related rules and control their lifecycle with a single switch
- Use tags for flexible categorization across groups
- Set priorities to control rule evaluation order
- Configure engine concurrency and debounce for safe rule chaining
- Enable versioning to track every rule change
- Query version history, compare versions, and rollback when needed

---

Start with: [Rule Groups and Tags](./01-groups-and-tags.md)
