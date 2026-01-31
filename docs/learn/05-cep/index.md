# Part 5: Complex Event Processing

Individual events tell you what happened at a single point in time. But real business logic often depends on **patterns across multiple events** — did a payment follow an order? Did three failed logins happen within five minutes? Has total revenue exceeded a threshold in the last hour? Complex Event Processing (CEP) gives you the vocabulary to express these temporal relationships as declarative rules.

## Chapters

### [5.1 What is CEP?](./01-what-is-cep.md)

The motivation behind temporal pattern matching:
- Why individual events aren't enough for real-world logic
- The four CEP pattern types: sequence, absence, count, aggregate
- How CEP fits into the rule engine architecture
- Real-world analogies from fraud detection, e-commerce, and IoT

### [5.2 Sequence and Absence](./02-sequence-and-absence.md)

Detecting ordered events and missing events within time windows:
- `sequence()`: ordered event matching with `within`, `groupBy`, `strict`
- `absence()`: detecting expected events that never arrived
- Named events with `as` for referencing matched data in actions
- Complete payment flow and timeout detection examples

### [5.3 Count and Aggregate](./03-count-and-aggregate.md)

Frequency thresholds and numeric aggregation over time:
- `count()`: event frequency with sliding vs tumbling windows
- `aggregate()`: sum, avg, min, max over numeric fields
- Comparison operators: `gte`, `lte`, `eq`
- Complete brute-force detection and revenue spike examples

### [5.4 CEP Patterns in Practice](./04-cep-patterns.md)

Combining patterns for real-world systems:
- Multi-stage detection pipelines
- Combining CEP with regular event/fact rules
- IoT monitoring pipeline example
- Performance considerations and debugging strategies

## What You'll Learn

By the end of this section, you'll be able to:
- Recognize when a business requirement needs temporal pattern matching
- Use sequence patterns to detect ordered event flows
- Use absence patterns to detect timeouts and missing steps
- Use count patterns for frequency-based alerting
- Use aggregate patterns for threshold-based monitoring
- Combine multiple CEP patterns into multi-stage detection pipelines

---

Start with: [What is CEP?](./01-what-is-cep.md)
