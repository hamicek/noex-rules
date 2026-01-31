# Part 4: The DSL

So far you've been writing rules as plain objects — specifying `trigger`, `conditions`, and `actions` with literal JSON-like structures. It works, but it's verbose and error-prone. noex-rules provides three domain-specific language approaches that make rule authoring safer, more expressive, and more convenient depending on your audience.

## Chapters

### [4.1 Fluent Builder API](./01-fluent-builder.md)

The primary way to write rules in TypeScript:
- `Rule.create()` with full method chaining
- Trigger helpers: `onEvent()`, `onFact()`, `onTimer()`
- Condition operators with type-safe expressions
- Action helpers: `emit()`, `setFact()`, `deleteFact()`, `setTimer()`, `cancelTimer()`, `callService()`, `log()`
- References with `ref()` and string interpolation

### [4.2 Tagged Template Literals](./02-tagged-templates.md)

A compact, line-oriented syntax for quick prototyping:
- The `rule` tagged template function
- WHEN / IF / AND / THEN keywords
- Inline data objects and automatic reference detection
- JavaScript interpolation for dynamic values

### [4.3 YAML Rules](./03-yaml-rules.md)

Configuration-driven rules for non-developer audiences:
- `loadRulesFromYAML()` and `loadRulesFromFile()`
- Supported YAML formats (single rule, array, `rules` key)
- Validation and error handling

### [4.4 Choosing the Right Approach](./04-choosing-approach.md)

A practical guide to picking the best DSL for your situation:
- Side-by-side comparison of all four approaches
- Decision tree for common scenarios
- Mixing approaches in the same engine
- Migration strategies

## What You'll Learn

By the end of this section, you'll be able to:
- Write type-safe rules with the fluent builder API
- Prototype rules quickly with tagged template literals
- Load rules from YAML files for config-driven systems
- Choose the right rule authoring approach for each use case

---

Start with: [Fluent Builder API](./01-fluent-builder.md)
