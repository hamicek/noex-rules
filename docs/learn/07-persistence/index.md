# Part 7: Persistence and Reliability

A rule engine that loses its rules on every restart is useless in production. The same goes for timers that vanish when the process crashes. noex-rules provides three persistence mechanisms: **rule persistence** for saving and restoring rules and groups across restarts, **durable timers** that survive process crashes, and **hot reload** for updating rules from external sources without stopping the engine.

## Chapters

### [7.1 Persisting Rules and Facts](./01-state-persistence.md)

Saving and restoring rules across engine restarts:
- `PersistenceConfig` and the `StorageAdapter` interface
- Automatic debounced persistence on every rule change
- Restore cycle at startup, final persist on shutdown
- Schema versioning for safe migrations

### [7.2 Durable Timers](./02-timer-persistence.md)

Making timers survive process restarts:
- `TimerPersistenceConfig` and durable mode vs fallback mode
- How timer metadata is persisted and restored
- Recurring timers with fire count tracking
- When durability matters and when it doesn't

### [7.3 Hot Reload](./03-hot-reload.md)

Updating rules from external sources without engine restart:
- `HotReloadConfig` with file and storage sources
- Polling-based change detection with SHA-256 hashing
- Atomic reload: all changes apply or none
- Validation before apply to prevent broken rules

## What You'll Learn

By the end of this section, you'll be able to:
- Configure rule persistence so rules survive engine restarts
- Understand the automatic save/restore lifecycle
- Set up durable timers that persist across process crashes
- Configure hot reload to update rules from YAML files or external storage
- Choose the right persistence strategy for your deployment

---

Start with: [Persisting Rules and Facts](./01-state-persistence.md)
