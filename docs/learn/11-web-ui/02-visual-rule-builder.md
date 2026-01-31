# Visual Rule Builder

The previous chapter introduced the Web UI's pages and navigation. This chapter focuses on the core workflow: creating and editing rules visually. The Rule Detail page offers four complementary views — a structured **Form editor**, a **YAML editor**, a **Flow diagram**, and a **Version History** timeline — each suited to different tasks. The form-based editor with its trigger selector, condition builder, and action builder is the primary tool for assembling rules without writing JSON or YAML by hand.

## What You'll Learn

- The four rule detail tabs: Form, YAML, Flow, History
- How the RuleForm works: metadata, trigger selector, condition builder, action builder
- Zod-based validation and the form-to-API data transformation
- How `ruleToFlow()` converts a rule into a React Flow graph with color-coded nodes
- Editing rules through the YAML editor
- Version history with diffs, timeline, and rollback
- A complete walkthrough of creating a multi-condition rule through the UI

## Rule Detail Tabs

When you click a rule on the Rules page or navigate to `/rules/:ruleId`, the Rule Detail page opens with four tabs:

```
+-------+-------+-------+---------+
| Form  | YAML  | Flow  | History |
+-------+-------+-------+---------+
```

| Tab | Purpose | Use When |
|-----|---------|----------|
| **Form** | Structured editor with typed fields, dropdowns, dynamic arrays | Creating rules, editing individual fields, learning the rule model |
| **YAML** | Text-based YAML editor | Bulk editing, copy-paste, exporting rule definitions |
| **Flow** | Interactive flow diagram (read-only) | Visualizing rule logic, presentations, understanding complex rules |
| **History** | Version timeline with diffs | Auditing changes, comparing versions, rollback |

The default tab is configurable in Settings (Form, YAML, or Flow).

## The Rule Form

The Form tab is the primary editor for rules. It's organized into four sections: Metadata, Trigger, Conditions, and Actions.

### Metadata Section

```
+---------------------------------------------------+
| METADATA                                          |
| +------------------+  +------------------------+  |
| | ID               |  | Name                   |  |
| | [order-alert   ] |  | [High Value Alert    ] |  |
| +------------------+  +------------------------+  |
|                                                   |
| Description                                       |
| [Alert when order total exceeds threshold       ] |
|                                                   |
| +----------+ +---------+ +--------+              |
| | Priority | | Group   | | ☑ Enabled |           |
| | [10    ] | | [Sales] | |        |              |
| +----------+ +---------+ +--------+              |
|                                                   |
| Tags                                              |
| [orders] [alerts] [_______________]               |
+---------------------------------------------------+
```

Fields:
- **ID** — Unique identifier (required, immutable after creation)
- **Name** — Human-readable name (required)
- **Description** — Optional description
- **Priority** — Integer, higher values evaluate first
- **Group** — Dropdown populated from existing rule groups via GraphQL
- **Enabled** — Checkbox toggle
- **Tags** — Chip input: type a tag and press Enter or comma to add, click X to remove

### Trigger Selector

The trigger section switches its input field based on the selected trigger type:

| Trigger Type | Input Field | Placeholder |
|-------------|-------------|-------------|
| `fact` | Pattern | `customer:*:tier` |
| `event` | Topic | `order.created` |
| `timer` | Name | `payment-deadline-*` |
| `temporal` | Pattern | (for CEP temporal triggers) |

### Condition Builder

Conditions are a dynamic array — add as many as needed, remove any individually:

```
+---------------------------------------------------+
| CONDITIONS                                        |
|                                                   |
| +---------+  +--------+  +----+  +-------+  +--+ |
| | Source  |  | Field  |  | Op |  | Value |  |✕ | |
| | [event] |  | [total]|  |[>=]|  | [1000]|  |  | |
| +---------+  +--------+  +----+  +-------+  +--+ |
|                                                   |
| +---------+  +--------+  +------+  +-----+  +--+ |
| | Source  |  | Key    |  | Op   |  |Value|  |✕ | |
| | [fact ] |  |[c:*:t] |  |[eq]  |  |"vip"|  |  | |
| +---------+  +--------+  +------+  +-----+  +--+ |
|                                                   |
| [+ Add Condition]                                 |
+---------------------------------------------------+
```

Each condition row has:

- **Source type** — `event`, `fact`, `context`, `lookup`, `baseline`
- **Source key** — The specific field varies by source type:
  - `event` → `field` (e.g. `total`, `customerId`)
  - `fact` → `pattern` (e.g. `customer:*:tier`)
  - `context` → `key`
  - `lookup` → `name`
  - `baseline` → `metric`
- **Operator** — All standard operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `not_contains`, `matches`, `exists`, `not_exists`
- **Value** — Raw text input, parsed as JSON when possible (numbers, booleans, arrays, objects). Unary operators (`exists`, `not_exists`) hide the value field.

### Action Builder

Actions follow the same dynamic array pattern, with fields that change based on the action type:

| Action Type | Fields |
|-------------|--------|
| `set_fact` | Key, Value (JSON) |
| `delete_fact` | Key |
| `emit_event` | Topic, Data (JSON) |
| `set_timer` | Timer config (JSON) |
| `cancel_timer` | Timer name |
| `call_service` | Service, Method, Args (JSON) |
| `log` | Level (`debug`/`info`/`warn`/`error`), Message |
| `conditional` | Then actions count, else actions count |

At least one action is required — the form validation enforces this.

### Validation

The form uses Zod schemas with React Hook Form for field-level validation:

```typescript
const ruleFormSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priority: z.number().int(),
  enabled: z.boolean(),
  tags: z.string().optional(),
  group: z.string().optional(),
  trigger: triggerSchema,
  conditions: z.array(conditionFormSchema),
  actions: z.array(actionFormSchema).min(1, 'At least one action is required'),
});
```

Validation errors appear inline below each field. The submit button is disabled until the form is dirty (has changes) and all validations pass.

### Form Data Transformation

The form uses an intermediate representation (`RuleFormData`) that keeps JSON values as raw strings for editing convenience. On submit, `formDataToInput()` transforms this to the API input format:

1. Tags string is split by commas into an array
2. Trigger fields are filtered to only include type-relevant fields (`pattern` for fact, `topic` for event, `name` for timer)
3. Condition values are parsed from JSON strings
4. Unary operators strip the value field entirely
5. Action fields are parsed from JSON strings based on action type

## Flow Visualization

The Flow tab renders the rule as an interactive graph using React Flow. The `ruleToFlow()` function converts a rule into nodes and edges:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ ▶ Event      │     │ ◆ Event:     │     │ ■ Emit Event │
│   Trigger    │────▶│   total      │────▶│   alert.high │
│              │     │   >= 1000    │     │              │
│ order.created│     │              │  ┌─▶│              │
└──────────────┘     └──────────────┘  │  └──────────────┘
                     ┌──────────────┐  │  ┌──────────────┐
                     │ ◆ Fact:      │  │  │ ■ Set Fact   │
                     │   c:*:tier   │──┘  │   order:*:   │
                     │   = "vip"    │────▶│   flagged    │
                     └──────────────┘     └──────────────┘
```

### Node Types and Colors

| Node Type | Icon | Color | Description |
|-----------|------|-------|-------------|
| Trigger | ▶ | Blue (`bg-blue-50`, `border-blue-300`) | The rule's trigger (event, fact, timer, temporal) |
| Condition | ◆ | Amber (`bg-amber-50`, `border-amber-300`) | Each condition as source + operator + value |
| Action | ■ | Emerald (`bg-emerald-50`, `border-emerald-300`) | Each action with type and key detail |

### Layout Algorithm

The graph is laid out in three columns:

1. **Trigger** (left) — Always a single node, vertically centered
2. **Conditions** (center) — Stacked vertically, connected from the trigger
3. **Actions** (right) — Stacked vertically, connected from all conditions (or directly from trigger if no conditions)

Layout parameters:
- Node width: 220px
- Node height: 70px
- Horizontal gap: 80px
- Vertical gap: 24px

The tallest column determines overall height, and shorter columns are vertically centered.

### Interaction

- **Drag** nodes to rearrange (positions don't persist — the layout resets on reload)
- **Zoom** with mouse wheel or the Controls panel (+/- buttons)
- **Pan** by dragging the background
- **MiniMap** in the bottom-right corner for orientation in complex rules
- Nodes are **not connectable** — the flow view is read-only. To edit the rule structure, switch to the Form or YAML tab.

### Edge Style

Edges use the `smoothstep` type with animated dashes (stroke width 2, color `#94a3b8`), giving a clear visual flow from left to right.

## YAML Editor

The YAML tab provides a text-based editor for the rule:

```yaml
id: high-value-alert
name: High Value Order Alert
priority: 10
enabled: true
tags:
  - orders
  - alerts
trigger:
  type: event
  topic: order.created
conditions:
  - source:
      type: event
      field: total
    operator: gte
    value: 1000
actions:
  - type: emit_event
    topic: alert.high-value
    data:
      orderId: "${event.orderId}"
      total: "${event.total}"
```

The YAML editor supports:
- Syntax-aware editing
- Submit/cancel buttons (same as the Form tab)
- On submit, the YAML is parsed and sent to the same `updateRule` mutation

The YAML view is useful for copy-pasting rule definitions, bulk editing, and comparing with file-based rule sources.

## Version History

The History tab shows a timeline of all changes to the rule:

```
v3 ─── updated ─── 2025-01-15 14:32
v2 ─── enabled ─── 2025-01-15 10:15
v1 ─── registered ─── 2025-01-14 09:00
```

Each version entry includes:
- **Version number**
- **Change type**: `registered`, `updated`, `enabled`, `disabled`, `unregistered`, `rolled_back`
- **Timestamp**
- **Description** (if provided)

### Diffs

Select two versions to see a diff of the rule snapshots, highlighting what changed between versions.

### Rollback

Click "Rollback" on any previous version to restore the rule to that state. This creates a new version entry with `changeType: 'rolled_back'` and records which version was restored.

## Creating a Rule: Complete Walkthrough

This walkthrough creates a rule through the Form editor that alerts when a high-value order is placed by a VIP customer.

### Step 1: Navigate to Rule Creation

Press `g n` or click "New Rule" on the Rules page. The creation form opens with empty defaults.

### Step 2: Fill in Metadata

- **ID**: `vip-high-value`
- **Name**: `VIP High Value Order`
- **Description**: `Alert when a VIP customer places a high-value order`
- **Priority**: `20`
- **Enabled**: checked
- **Tags**: type `orders` Enter, `vip` Enter, `alerts` Enter

### Step 3: Configure the Trigger

Select trigger type **Event** and set the topic to `order.created`.

### Step 4: Add Conditions

Click "+ Add Condition" twice to create two condition rows:

**Condition 1** — Check order total:
- Source: `event`
- Field: `total`
- Operator: `>=`
- Value: `1000`

**Condition 2** — Check customer tier:
- Source: `fact`
- Pattern: `customer:${event.customerId}:tier`
- Operator: `eq`
- Value: `"vip"`

### Step 5: Add Actions

**Action 1** — Emit alert event:
- Type: `emit_event`
- Topic: `alert.vip-high-value`
- Data: `{"orderId": "${event.orderId}", "customerId": "${event.customerId}", "total": "${event.total}"}`

**Action 2** — Log the alert:
- Type: `log`
- Level: `info`
- Message: `VIP high-value order: ${event.orderId} ($${event.total})`

### Step 6: Submit

Click "Create Rule". The form validates all fields, transforms the data, and sends a `createRule` mutation via GraphQL. On success, you're redirected to the Rule Detail page.

### Step 7: Verify the Flow

Switch to the Flow tab to see the visual representation:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ ▶ Event      │     │ ◆ Event:     │     │ ■ Emit Event │
│   Trigger    │────▶│   total      │────▶│   alert.vip- │
│              │     │   >= 1000    │  ┌─▶│   high-value │
│ order.created│     └──────────────┘  │  └──────────────┘
└──────────────┘     ┌──────────────┐  │  ┌──────────────┐
       │             │ ◆ Fact:      │  │  │ ■ Log        │
       └────────────▶│   customer:  │──┘  │   VIP high-  │
                     │   = "vip"    │────▶│   value...   │
                     └──────────────┘     └──────────────┘
```

### Step 8: Test

Press `g e` to navigate to the Events page. Set up the prerequisites:

First, ensure a VIP fact exists. Navigate to Facts (`g f`) and create:
- Key: `customer:c-42:tier`
- Value: `"vip"`

Then navigate to Events (`g e`) and emit:
- Topic: `sensor.reading` — wait, we need `order.created`
- Topic: `order.created`
- Data: `{"orderId": "o-99", "customerId": "c-42", "total": 1500}`

Watch the event stream — you should see `order.created` followed by `alert.vip-high-value` as the rule fires.

## Exercise

1. Open the Web UI and create a rule called "Low Stock Alert" with these specifications:
   - Trigger: event `inventory.updated`
   - Condition 1: event field `quantity` less than 10
   - Condition 2: fact `product:${event.productId}:tracked` equals `true`
   - Action 1: emit event `alert.low-stock` with `{ "productId": "${event.productId}", "quantity": "${event.quantity}" }`
   - Action 2: set fact `product:${event.productId}:lowStock` to `true`
   - Tags: `inventory`, `alerts`
   - Priority: 15
2. Switch to the Flow tab and verify the graph shows 1 trigger, 2 conditions, and 2 actions
3. Set the fact `product:p-1:tracked` to `true` on the Facts page
4. Emit an `inventory.updated` event with `{ "productId": "p-1", "quantity": 5 }` from the Events page
5. Verify `product:p-1:lowStock` is `true` on the Facts page
6. View the Version History tab — confirm version 1 with change type `registered`
7. Edit the rule: change the quantity threshold from 10 to 20 in the Form tab
8. Check the History tab again — confirm version 2 with change type `updated`

<details>
<summary>Solution</summary>

Create the rule through the Form tab:

**Metadata:**
- ID: `low-stock-alert`
- Name: `Low Stock Alert`
- Priority: 15
- Enabled: checked
- Tags: `inventory`, `alerts`

**Trigger:**
- Type: Event
- Topic: `inventory.updated`

**Conditions:**
- Condition 1: Source `event`, field `quantity`, operator `<`, value `10`
- Condition 2: Source `fact`, pattern `product:${event.productId}:tracked`, operator `eq`, value `true`

**Actions:**
- Action 1: Type `emit_event`, topic `alert.low-stock`, data `{"productId": "${event.productId}", "quantity": "${event.quantity}"}`
- Action 2: Type `set_fact`, key `product:${event.productId}:lowStock`, value `true`

Click "Create Rule".

**Flow tab** shows:
```
[Event Trigger: inventory.updated]
  → [Event: quantity < 10]     → [Emit Event: alert.low-stock]
  → [Fact: product:*:tracked = true] → [Set Fact: product:*:lowStock]
```

**Facts page** (`g f`): Create `product:p-1:tracked` with value `true`

**Events page** (`g e`): Emit topic `inventory.updated`, data `{"productId": "p-1", "quantity": 5}`

**Facts page**: `product:p-1:lowStock` is now `true`

**History tab**: Shows v1 `registered`

**Form tab**: Change condition 1 value from `10` to `20`, click "Save Changes"

**History tab**: Now shows v2 `updated` and v1 `registered`

</details>

## Summary

- The Rule Detail page has four tabs: **Form** (structured editor), **YAML** (text editor), **Flow** (visual diagram), **History** (version timeline)
- The Form editor organizes rule creation into Metadata, Trigger, Conditions, and Actions with Zod validation
- The Trigger Selector dynamically switches input fields (pattern/topic/name) based on trigger type
- The Condition Builder supports all source types (`event`, `fact`, `context`, `lookup`, `baseline`) and operators, with automatic value field hiding for unary operators
- The Action Builder adapts its fields to each action type (`set_fact`, `emit_event`, `set_timer`, `call_service`, `log`, etc.)
- `formDataToInput()` transforms intermediate form data (raw JSON strings) to the API input format, parsing values and filtering type-irrelevant fields
- The Flow view uses `ruleToFlow()` to create a three-column React Flow graph: Trigger → Conditions → Actions with color-coded, draggable nodes
- Edges use animated `smoothstep` connections with MiniMap and zoom Controls
- The YAML editor provides a text-based alternative for bulk editing and export
- Version History shows a timeline of changes with diffs and rollback capability
- Rollback creates a new version entry with `changeType: 'rolled_back'` rather than rewriting history

---

Next: [E-Commerce Rules System](../12-projects/01-ecommerce.md)
