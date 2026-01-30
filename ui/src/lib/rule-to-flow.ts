import type { Node, Edge } from '@xyflow/react';
import type { Rule, RuleCondition, RuleAction } from '../types';
import {
  TRIGGER_TYPE_LABELS,
  CONDITION_SOURCE_TYPE_LABELS,
  CONDITION_OPERATOR_LABELS,
  ACTION_TYPE_LABELS,
} from './constants';

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
  nodeType: 'trigger' | 'condition' | 'action';
  colorKey: string;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 70;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 24;

function triggerLabel(rule: Rule): { label: string; sublabel: string } {
  const t = rule.trigger;
  const typeLabel = TRIGGER_TYPE_LABELS[t.type] ?? t.type;
  const detail = t.pattern ?? t.topic ?? t.name ?? '';
  return { label: `${typeLabel} Trigger`, sublabel: detail };
}

function conditionLabel(c: RuleCondition): { label: string; sublabel: string } {
  const srcType = CONDITION_SOURCE_TYPE_LABELS[c.source.type] ?? c.source.type;
  const srcKey = c.source.pattern ?? c.source.field ?? c.source.key ?? c.source.name ?? '';
  const op = CONDITION_OPERATOR_LABELS[c.operator] ?? c.operator;
  const val = c.value !== undefined ? ` ${JSON.stringify(c.value)}` : '';
  return {
    label: `${srcType}: ${srcKey}`,
    sublabel: `${op}${val}`,
  };
}

function actionLabel(a: RuleAction): { label: string; sublabel: string } {
  const typeLabel = ACTION_TYPE_LABELS[a.type] ?? a.type;
  let detail = '';
  switch (a.type) {
    case 'set_fact':
    case 'delete_fact':
      detail = a.key ?? '';
      break;
    case 'emit_event':
      detail = a.topic ?? '';
      break;
    case 'set_timer':
    case 'cancel_timer':
      detail = a.name ?? '';
      break;
    case 'call_service':
      detail = a.service ? `${a.service}.${a.method ?? ''}` : '';
      break;
    case 'log':
      detail = a.message ? a.message.slice(0, 40) : (a.level ?? '');
      break;
    case 'conditional':
      detail = `${a.thenActions?.length ?? 0} then / ${a.elseActions?.length ?? 0} else`;
      break;
  }
  return { label: typeLabel, sublabel: detail };
}

export function ruleToFlow(rule: Rule): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];

  const conditions = rule.conditions ?? [];
  const actions = rule.actions ?? [];

  // Column X positions
  let col = 0;
  const triggerX = col * (NODE_WIDTH + HORIZONTAL_GAP);
  col++;
  const conditionX = conditions.length > 0 ? col * (NODE_WIDTH + HORIZONTAL_GAP) : -1;
  if (conditions.length > 0) col++;
  const actionX = actions.length > 0 ? col * (NODE_WIDTH + HORIZONTAL_GAP) : -1;

  // Compute vertical centering — tallest column determines the overall height
  const maxRows = Math.max(1, conditions.length, actions.length);
  const totalHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * VERTICAL_GAP;

  function columnY(count: number, index: number): number {
    const columnHeight = count * NODE_HEIGHT + (count - 1) * VERTICAL_GAP;
    const offsetY = (totalHeight - columnHeight) / 2;
    return offsetY + index * (NODE_HEIGHT + VERTICAL_GAP);
  }

  // Trigger node
  const { label: tLabel, sublabel: tSub } = triggerLabel(rule);
  const triggerNodeId = 'trigger';
  nodes.push({
    id: triggerNodeId,
    type: 'flowNode',
    position: { x: triggerX, y: columnY(1, 0) },
    data: {
      label: tLabel,
      sublabel: tSub,
      nodeType: 'trigger',
      colorKey: rule.trigger.type,
    },
  });

  // Condition nodes
  const conditionIds: string[] = [];
  conditions.forEach((c, i) => {
    const id = `condition-${i}`;
    conditionIds.push(id);
    const { label, sublabel } = conditionLabel(c);
    nodes.push({
      id,
      type: 'flowNode',
      position: { x: conditionX, y: columnY(conditions.length, i) },
      data: { label, sublabel, nodeType: 'condition', colorKey: 'condition' },
    });
    edges.push({
      id: `e-trigger-${id}`,
      source: triggerNodeId,
      target: id,
      type: 'smoothstep',
    });
  });

  // Action nodes
  actions.forEach((a, i) => {
    const id = `action-${i}`;
    const { label, sublabel } = actionLabel(a);
    nodes.push({
      id,
      type: 'flowNode',
      position: { x: actionX >= 0 ? actionX : triggerX + NODE_WIDTH + HORIZONTAL_GAP, y: columnY(actions.length, i) },
      data: { label, sublabel, nodeType: 'action', colorKey: a.type },
    });

    if (conditionIds.length > 0) {
      // Connect from last condition to action
      conditionIds.forEach((cId) => {
        edges.push({
          id: `e-${cId}-${id}`,
          source: cId,
          target: id,
          type: 'smoothstep',
        });
      });
    } else {
      // No conditions — connect trigger directly to action
      edges.push({
        id: `e-trigger-${id}`,
        source: triggerNodeId,
        target: id,
        type: 'smoothstep',
      });
    }
  });

  // If no conditions and no actions, just the trigger node alone
  // If only conditions but no actions, connect trigger → conditions (already done)

  return { nodes, edges };
}
