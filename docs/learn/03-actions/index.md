# Part 3: Actions

Actions are what happens when a rule fires. You've seen `log` and `emit_event` in earlier chapters — this section covers the full action system, from core data manipulation to timers, scheduling, and calling external services.

## Chapters

### [3.1 Core Actions](./01-core-actions.md)

The four fundamental actions that every rule engine needs:
- `emit_event`, `set_fact`, `delete_fact`, `log`
- String interpolation and reference resolution in action values
- Multiple actions per rule and execution order

### [3.2 Timers and Scheduling](./02-timers.md)

Schedule deferred work and detect inactivity:
- `set_timer` and `cancel_timer` actions
- Duration syntax and `onExpire` configuration
- Timer-triggered rules and repeating timers

### [3.3 Calling External Services](./03-external-services.md)

Integrate the rule engine with the outside world:
- `call_service` action and service registration
- Data requirements (lookups) with caching and error strategies
- Using lookup results in conditions and actions

## What You'll Learn

By the end of this section, you'll be able to:
- Use all seven action types to build reactive rule chains
- Schedule and cancel timers with flexible duration syntax
- Connect rules to external APIs and databases
- Use string interpolation and references to make actions dynamic

---

Start with: [Core Actions](./01-core-actions.md)
