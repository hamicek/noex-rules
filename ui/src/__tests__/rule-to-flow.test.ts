import { describe, it, expect } from 'vitest';
import { ruleToFlow, type FlowNodeData } from '../lib/rule-to-flow';
import type { Rule, RuleCondition, RuleAction } from '../types';
import type { Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    name: 'Test Rule',
    priority: 100,
    enabled: true,
    version: 1,
    tags: [],
    trigger: { type: 'fact', pattern: 'customer:*:tier' },
    conditions: [],
    actions: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function cond(
  sourceType: RuleCondition['source']['type'] = 'fact',
  operator: RuleCondition['operator'] = 'eq',
  value?: unknown,
  sourceKey?: string,
): RuleCondition {
  return {
    source: { type: sourceType, pattern: sourceKey ?? 'key' },
    operator,
    value,
  };
}

function action(type: RuleAction['type'], extra: Partial<RuleAction> = {}): RuleAction {
  return { type, ...extra } as RuleAction;
}

function nodeById(nodes: Node<FlowNodeData>[], id: string) {
  return nodes.find((n) => n.id === id);
}

// ---------------------------------------------------------------------------
// ruleToFlow — structure tests
// ---------------------------------------------------------------------------

describe('ruleToFlow', () => {
  describe('trigger-only rule (no conditions, no actions)', () => {
    it('produces exactly one trigger node and zero edges', () => {
      const rule = makeRule();
      const { nodes, edges } = ruleToFlow(rule);

      expect(nodes).toHaveLength(1);
      expect(edges).toHaveLength(0);
      expect(nodes[0].id).toBe('trigger');
      expect(nodes[0].data.nodeType).toBe('trigger');
    });
  });

  describe('trigger + actions (no conditions)', () => {
    it('connects trigger directly to each action', () => {
      const rule = makeRule({
        actions: [
          action('set_fact', { key: 'x' }),
          action('emit_event', { topic: 'order.placed' }),
        ],
      });
      const { nodes, edges } = ruleToFlow(rule);

      expect(nodes).toHaveLength(3); // trigger + 2 actions
      expect(edges).toHaveLength(2); // trigger→action-0, trigger→action-1

      for (const e of edges) {
        expect(e.source).toBe('trigger');
        expect(e.type).toBe('smoothstep');
      }
      expect(edges[0].target).toBe('action-0');
      expect(edges[1].target).toBe('action-1');
    });
  });

  describe('trigger + conditions (no actions)', () => {
    it('connects trigger to each condition', () => {
      const rule = makeRule({
        conditions: [cond('fact', 'eq', 'gold'), cond('event', 'exists')],
      });
      const { nodes, edges } = ruleToFlow(rule);

      expect(nodes).toHaveLength(3); // trigger + 2 conditions
      expect(edges).toHaveLength(2); // trigger→condition-0, trigger→condition-1

      for (const e of edges) {
        expect(e.source).toBe('trigger');
      }
    });
  });

  describe('trigger + conditions + actions (full pipeline)', () => {
    it('connects trigger→conditions and conditions→actions', () => {
      const rule = makeRule({
        conditions: [cond('fact', 'eq', 'gold')],
        actions: [action('set_fact', { key: 'status' })],
      });
      const { nodes, edges } = ruleToFlow(rule);

      expect(nodes).toHaveLength(3);
      // trigger→condition-0, condition-0→action-0
      expect(edges).toHaveLength(2);
      expect(edges[0]).toMatchObject({ source: 'trigger', target: 'condition-0' });
      expect(edges[1]).toMatchObject({ source: 'condition-0', target: 'action-0' });
    });

    it('creates cross-product edges with multiple conditions and actions', () => {
      const rule = makeRule({
        conditions: [cond('fact', 'eq', 'a'), cond('event', 'gt', 10)],
        actions: [
          action('set_fact', { key: 'x' }),
          action('emit_event', { topic: 't' }),
          action('log', { message: 'done' }),
        ],
      });
      const { nodes, edges } = ruleToFlow(rule);

      // 1 trigger + 2 conditions + 3 actions = 6 nodes
      expect(nodes).toHaveLength(6);

      // 2 edges trigger→conditions + 2×3 edges conditions→actions = 8 edges
      expect(edges).toHaveLength(8);

      // Trigger→condition edges
      const triggerEdges = edges.filter((e) => e.source === 'trigger');
      expect(triggerEdges).toHaveLength(2);
      expect(triggerEdges.map((e) => e.target).sort()).toEqual(['condition-0', 'condition-1']);

      // Each condition connects to all 3 actions
      const cond0Edges = edges.filter((e) => e.source === 'condition-0');
      expect(cond0Edges).toHaveLength(3);
      expect(cond0Edges.map((e) => e.target).sort()).toEqual(['action-0', 'action-1', 'action-2']);

      const cond1Edges = edges.filter((e) => e.source === 'condition-1');
      expect(cond1Edges).toHaveLength(3);
      expect(cond1Edges.map((e) => e.target).sort()).toEqual(['action-0', 'action-1', 'action-2']);
    });
  });

  describe('edge IDs are deterministic and unique', () => {
    it('generates unique IDs for every edge', () => {
      const rule = makeRule({
        conditions: [cond(), cond()],
        actions: [action('log'), action('set_fact')],
      });
      const { edges } = ruleToFlow(rule);
      const ids = edges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Node metadata
  // ---------------------------------------------------------------------------

  describe('node types and colorKeys', () => {
    it('sets correct nodeType for each column', () => {
      const rule = makeRule({
        conditions: [cond()],
        actions: [action('emit_event')],
      });
      const { nodes } = ruleToFlow(rule);

      expect(nodeById(nodes, 'trigger')!.data.nodeType).toBe('trigger');
      expect(nodeById(nodes, 'condition-0')!.data.nodeType).toBe('condition');
      expect(nodeById(nodes, 'action-0')!.data.nodeType).toBe('action');
    });

    it('uses trigger type as colorKey for trigger node', () => {
      for (const type of ['fact', 'event', 'timer', 'temporal'] as const) {
        const rule = makeRule({ trigger: { type } });
        const { nodes } = ruleToFlow(rule);
        expect(nodes[0].data.colorKey).toBe(type);
      }
    });

    it('uses "condition" as colorKey for condition nodes', () => {
      const rule = makeRule({ conditions: [cond()] });
      const { nodes } = ruleToFlow(rule);
      expect(nodeById(nodes, 'condition-0')!.data.colorKey).toBe('condition');
    });

    it('uses action type as colorKey for action nodes', () => {
      const rule = makeRule({
        actions: [action('set_fact'), action('emit_event'), action('log')],
      });
      const { nodes } = ruleToFlow(rule);
      expect(nodeById(nodes, 'action-0')!.data.colorKey).toBe('set_fact');
      expect(nodeById(nodes, 'action-1')!.data.colorKey).toBe('emit_event');
      expect(nodeById(nodes, 'action-2')!.data.colorKey).toBe('log');
    });

    it('all nodes use flowNode type', () => {
      const rule = makeRule({
        conditions: [cond()],
        actions: [action('log')],
      });
      const { nodes } = ruleToFlow(rule);
      for (const node of nodes) {
        expect(node.type).toBe('flowNode');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Trigger labels
  // ---------------------------------------------------------------------------

  describe('trigger labels', () => {
    it('generates "Fact Trigger" with pattern sublabel', () => {
      const rule = makeRule({ trigger: { type: 'fact', pattern: 'user:*' } });
      const { nodes } = ruleToFlow(rule);
      expect(nodes[0].data.label).toBe('Fact Trigger');
      expect(nodes[0].data.sublabel).toBe('user:*');
    });

    it('generates "Event Trigger" with topic sublabel', () => {
      const rule = makeRule({ trigger: { type: 'event', topic: 'order.placed' } });
      const { nodes } = ruleToFlow(rule);
      expect(nodes[0].data.label).toBe('Event Trigger');
      expect(nodes[0].data.sublabel).toBe('order.placed');
    });

    it('generates "Timer Trigger" with name sublabel', () => {
      const rule = makeRule({ trigger: { type: 'timer', name: 'expire-check' } });
      const { nodes } = ruleToFlow(rule);
      expect(nodes[0].data.label).toBe('Timer Trigger');
      expect(nodes[0].data.sublabel).toBe('expire-check');
    });

    it('generates "Temporal Trigger" with empty sublabel when no detail', () => {
      const rule = makeRule({ trigger: { type: 'temporal' } });
      const { nodes } = ruleToFlow(rule);
      expect(nodes[0].data.label).toBe('Temporal Trigger');
      expect(nodes[0].data.sublabel).toBe('');
    });

    it('falls back to raw type for unknown trigger type', () => {
      const rule = makeRule({ trigger: { type: 'custom' as any } });
      const { nodes } = ruleToFlow(rule);
      expect(nodes[0].data.label).toBe('custom Trigger');
    });
  });

  // ---------------------------------------------------------------------------
  // Condition labels
  // ---------------------------------------------------------------------------

  describe('condition labels', () => {
    it('shows source type and key as label', () => {
      const rule = makeRule({
        conditions: [
          { source: { type: 'fact', pattern: 'customer:tier' }, operator: 'eq', value: 'gold' },
        ],
      });
      const { nodes } = ruleToFlow(rule);
      const node = nodeById(nodes, 'condition-0')!;
      expect(node.data.label).toBe('Fact: customer:tier');
    });

    it('shows operator and value as sublabel', () => {
      const rule = makeRule({
        conditions: [
          { source: { type: 'fact', pattern: 'amount' }, operator: 'gt', value: 100 },
        ],
      });
      const { nodes } = ruleToFlow(rule);
      const node = nodeById(nodes, 'condition-0')!;
      expect(node.data.sublabel).toBe('> 100');
    });

    it('omits value in sublabel when undefined (unary operators)', () => {
      const rule = makeRule({
        conditions: [
          { source: { type: 'fact', pattern: 'flag' }, operator: 'exists' },
        ],
      });
      const { nodes } = ruleToFlow(rule);
      const node = nodeById(nodes, 'condition-0')!;
      expect(node.data.sublabel).toBe('exists');
    });

    it('resolves source key from field/key/name fallbacks', () => {
      // field
      const r1 = makeRule({
        conditions: [{ source: { type: 'event', field: 'data.amount' }, operator: 'gt', value: 0 }],
      });
      expect(nodeById(ruleToFlow(r1).nodes, 'condition-0')!.data.label).toBe('Event: data.amount');

      // key
      const r2 = makeRule({
        conditions: [{ source: { type: 'context', key: 'userId' }, operator: 'eq', value: '42' }],
      });
      expect(nodeById(ruleToFlow(r2).nodes, 'condition-0')!.data.label).toBe('Context: userId');

      // name
      const r3 = makeRule({
        conditions: [{ source: { type: 'lookup', name: 'crm' }, operator: 'neq', value: null }],
      });
      expect(nodeById(ruleToFlow(r3).nodes, 'condition-0')!.data.label).toBe('Lookup: crm');
    });

    it('handles string value in sublabel with JSON.stringify', () => {
      const rule = makeRule({
        conditions: [
          { source: { type: 'fact', pattern: 'tier' }, operator: 'eq', value: 'gold' },
        ],
      });
      const { nodes } = ruleToFlow(rule);
      expect(nodeById(nodes, 'condition-0')!.data.sublabel).toBe('= "gold"');
    });
  });

  // ---------------------------------------------------------------------------
  // Action labels
  // ---------------------------------------------------------------------------

  describe('action labels', () => {
    it('set_fact shows key as sublabel', () => {
      const rule = makeRule({ actions: [action('set_fact', { key: 'status' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Set Fact');
      expect(node.data.sublabel).toBe('status');
    });

    it('delete_fact shows key as sublabel', () => {
      const rule = makeRule({ actions: [action('delete_fact', { key: 'temp' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Delete Fact');
      expect(node.data.sublabel).toBe('temp');
    });

    it('emit_event shows topic as sublabel', () => {
      const rule = makeRule({ actions: [action('emit_event', { topic: 'order.placed' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Emit Event');
      expect(node.data.sublabel).toBe('order.placed');
    });

    it('set_timer shows name as sublabel', () => {
      const rule = makeRule({ actions: [action('set_timer', { name: 'timeout-5m' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Set Timer');
      expect(node.data.sublabel).toBe('timeout-5m');
    });

    it('cancel_timer shows name as sublabel', () => {
      const rule = makeRule({ actions: [action('cancel_timer', { name: 'timeout-5m' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Cancel Timer');
      expect(node.data.sublabel).toBe('timeout-5m');
    });

    it('call_service shows service.method as sublabel', () => {
      const rule = makeRule({
        actions: [action('call_service', { service: 'email', method: 'send' })],
      });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Call Service');
      expect(node.data.sublabel).toBe('email.send');
    });

    it('log shows truncated message as sublabel', () => {
      const longMsg = 'A'.repeat(80);
      const rule = makeRule({ actions: [action('log', { message: longMsg })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Log');
      expect(node.data.sublabel).toBe(longMsg.slice(0, 40));
    });

    it('log falls back to level when message is absent', () => {
      const rule = makeRule({ actions: [action('log', { level: 'warn' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.sublabel).toBe('warn');
    });

    it('conditional shows then/else counts', () => {
      const rule = makeRule({
        actions: [
          action('conditional', {
            thenActions: [action('log'), action('set_fact')],
            elseActions: [action('emit_event')],
          }),
        ],
      });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.label).toBe('Conditional');
      expect(node.data.sublabel).toBe('2 then / 1 else');
    });

    it('conditional defaults to 0 when branches are undefined', () => {
      const rule = makeRule({ actions: [action('conditional')] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.sublabel).toBe('0 then / 0 else');
    });
  });

  // ---------------------------------------------------------------------------
  // Layout & positioning
  // ---------------------------------------------------------------------------

  describe('node positioning', () => {
    const NODE_WIDTH = 220;
    const HORIZONTAL_GAP = 80;
    const NODE_HEIGHT = 70;
    const VERTICAL_GAP = 24;
    const COL_STEP = NODE_WIDTH + HORIZONTAL_GAP; // 300

    it('places trigger at column 0, vertically centered', () => {
      const rule = makeRule({
        conditions: [cond()],
        actions: [action('log'), action('set_fact')],
      });
      const { nodes } = ruleToFlow(rule);
      const trigger = nodeById(nodes, 'trigger')!;
      expect(trigger.position.x).toBe(0);
    });

    it('places conditions in column 1 when present', () => {
      const rule = makeRule({
        conditions: [cond(), cond()],
        actions: [action('log')],
      });
      const { nodes } = ruleToFlow(rule);
      expect(nodeById(nodes, 'condition-0')!.position.x).toBe(COL_STEP);
      expect(nodeById(nodes, 'condition-1')!.position.x).toBe(COL_STEP);
    });

    it('places actions in column 2 when conditions are present', () => {
      const rule = makeRule({
        conditions: [cond()],
        actions: [action('log')],
      });
      const { nodes } = ruleToFlow(rule);
      expect(nodeById(nodes, 'action-0')!.position.x).toBe(2 * COL_STEP);
    });

    it('places actions in column 1 when no conditions', () => {
      const rule = makeRule({
        actions: [action('log')],
      });
      const { nodes } = ruleToFlow(rule);
      expect(nodeById(nodes, 'action-0')!.position.x).toBe(COL_STEP);
    });

    it('vertically centers columns relative to the tallest column', () => {
      const rule = makeRule({
        conditions: [cond()],
        actions: [action('log'), action('set_fact'), action('emit_event')],
      });
      const { nodes } = ruleToFlow(rule);

      // maxRows = 3 (actions column)
      const totalHeight = 3 * NODE_HEIGHT + 2 * VERTICAL_GAP; // 258

      // Trigger column has 1 item → centered
      const trigger = nodeById(nodes, 'trigger')!;
      const triggerExpectedY = (totalHeight - NODE_HEIGHT) / 2;
      expect(trigger.position.y).toBe(triggerExpectedY);

      // Actions column has 3 items → starts at top (offset 0)
      const act0 = nodeById(nodes, 'action-0')!;
      expect(act0.position.y).toBe(0);
      const act1 = nodeById(nodes, 'action-1')!;
      expect(act1.position.y).toBe(NODE_HEIGHT + VERTICAL_GAP);
      const act2 = nodeById(nodes, 'action-2')!;
      expect(act2.position.y).toBe(2 * (NODE_HEIGHT + VERTICAL_GAP));
    });

    it('positions single-item columns at midpoint', () => {
      const rule = makeRule({
        conditions: [cond(), cond(), cond()],
        actions: [action('log')],
      });
      const { nodes } = ruleToFlow(rule);

      const totalHeight = 3 * NODE_HEIGHT + 2 * VERTICAL_GAP;
      const singleOffset = (totalHeight - NODE_HEIGHT) / 2;

      // trigger = 1 item
      expect(nodeById(nodes, 'trigger')!.position.y).toBe(singleOffset);
      // action = 1 item
      expect(nodeById(nodes, 'action-0')!.position.y).toBe(singleOffset);
      // conditions = 3 items, start at y=0
      expect(nodeById(nodes, 'condition-0')!.position.y).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles rule with empty conditions and actions arrays', () => {
      const rule = makeRule({ conditions: [], actions: [] });
      const { nodes, edges } = ruleToFlow(rule);
      expect(nodes).toHaveLength(1);
      expect(edges).toHaveLength(0);
    });

    it('handles action without optional fields', () => {
      const rule = makeRule({ actions: [{ type: 'set_fact' } as RuleAction] });
      const { nodes } = ruleToFlow(rule);
      const node = nodeById(nodes, 'action-0')!;
      expect(node.data.label).toBe('Set Fact');
      expect(node.data.sublabel).toBe('');
    });

    it('handles condition with no source key fields', () => {
      const rule = makeRule({
        conditions: [{ source: { type: 'fact' }, operator: 'exists' } as RuleCondition],
      });
      const { nodes } = ruleToFlow(rule);
      const node = nodeById(nodes, 'condition-0')!;
      expect(node.data.label).toBe('Fact: ');
    });

    it('handles call_service without method', () => {
      const rule = makeRule({
        actions: [action('call_service', { service: 'notify' })],
      });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      expect(node.data.sublabel).toBe('notify.');
    });

    it('handles log with empty message', () => {
      const rule = makeRule({ actions: [action('log', { message: '' })] });
      const node = nodeById(ruleToFlow(rule).nodes, 'action-0')!;
      // empty string is falsy → falls back to level ?? ''
      expect(node.data.sublabel).toBe('');
    });
  });
});
