# Part 1: Introduction

This section explains why a rule engine exists and introduces the core concepts you'll use throughout the framework.

## Chapters

### [1.1 Why a Rule Engine?](./01-why-rules.md)

Learn about the problems with hardcoded business logic and how a rule engine provides a structured alternative:
- if/else chains that grow into unmaintainable tangles
- Business rules scattered across the codebase
- Tight coupling between logic and application code

### [1.2 Key Concepts](./02-key-concepts.md)

Get an overview of the fundamental building blocks:
- **Rules** - Trigger-condition-action triplets
- **Facts** - Persistent state the engine reasons about
- **Events** - One-time signals that trigger evaluation
- **Timers** - Scheduled future actions
- **Forward Chaining** - Data-driven rule evaluation
- **CEP** - Detecting temporal patterns across events

## What You'll Learn

By the end of this section, you'll understand:
- Why extracting business rules from application code matters
- How the trigger-condition-action model works
- What each component of the engine does
- How facts, events, and timers drive rule evaluation

---

Start with: [Why a Rule Engine?](./01-why-rules.md)
