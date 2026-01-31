# Part 11: Web UI

The previous chapters covered REST, GraphQL, SSE, and CLI interfaces — all powerful, but text-driven. noex-rules also ships with a full-featured **React-based Web UI** that gives you a visual dashboard for managing the entire rule engine. It connects to the server over GraphQL and SSE, providing real-time monitoring, rule editing with form-based and visual flow editors, fact browsing, event testing, timer management, audit log viewing, and version history — all from the browser.

## Chapters

### [11.1 Getting Started with the Web UI](./01-getting-started-ui.md)

Launch the UI and explore the dashboard:
- Installing and registering the UI Fastify plugin with `registerUI()`
- Dashboard overview: engine health, statistics cards, navigation sidebar
- Managing rules, facts, events, timers, groups, and audit logs through the browser
- Real-time event streaming with pattern filtering, pause/resume, and test emission
- Settings: server connection, theme (light/dark), display preferences, notifications
- Keyboard shortcuts for power-user navigation

### [11.2 Visual Rule Builder](./02-visual-rule-builder.md)

Create and edit rules visually:
- Rule detail tabs: Form editor, YAML editor, Flow diagram, Version history
- The RuleForm: metadata, trigger selector, condition builder, action builder with Zod validation
- Flow visualization: how `ruleToFlow()` converts trigger, conditions, and actions into a React Flow graph
- Editing rules through the YAML editor with syntax highlighting
- Version history timeline with diffs and rollback
- Complete walkthrough: creating a multi-condition rule through the UI

## What You'll Learn

By the end of this section, you'll be able to:
- Install and serve the Web UI alongside the rule engine server
- Monitor engine health, statistics, and real-time events from the dashboard
- Create, edit, enable, disable, and delete rules through form-based and YAML editors
- Visualize rule logic as interactive flow diagrams with trigger, condition, and action nodes
- Manage facts, timers, groups, and audit logs through dedicated browser pages
- Emit test events directly from the UI and watch them flow through rules in real-time
- Navigate the entire UI using keyboard shortcuts

---

Start with: [Getting Started with the Web UI](./01-getting-started-ui.md)
