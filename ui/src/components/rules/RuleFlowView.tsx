import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { clsx } from 'clsx';
import type { Rule } from '../../types';
import { ruleToFlow, type FlowNodeData } from '../../lib/rule-to-flow';
import { FLOW_NODE_COLORS } from '../../lib/constants';

interface RuleFlowViewProps {
  rule: Rule;
}

const nodeTypeIcons: Record<string, string> = {
  trigger: '\u25B6',
  condition: '\u25C6',
  action: '\u25A0',
};

function FlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const colors = FLOW_NODE_COLORS[data.colorKey] ?? FLOW_NODE_COLORS.condition;
  const icon = nodeTypeIcons[data.nodeType] ?? '';

  return (
    <div
      className={clsx(
        'rounded-lg border-2 px-4 py-3 shadow-sm min-w-[200px]',
        colors.bg,
        colors.border,
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <span className={clsx('text-xs', colors.text)}>{icon}</span>
        <span className={clsx('text-sm font-semibold', colors.text)}>
          {data.label}
        </span>
      </div>
      {data.sublabel && (
        <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400 max-w-[180px]">
          {data.sublabel}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { flowNode: FlowNode };

export function RuleFlowView({ rule }: RuleFlowViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => ruleToFlow(rule),
    [rule],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden" style={{ height: 500 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable={false}
        defaultEdgeOptions={{
          style: { strokeWidth: 2, stroke: '#94a3b8' },
          animated: true,
        }}
      >
        <Background gap={16} size={1} className="!bg-slate-50 dark:!bg-slate-950" />
        <Controls
          showInteractive={false}
          className="!bg-white !border-slate-200 !shadow-sm dark:!bg-slate-900 dark:!border-slate-700 [&>button]:!bg-white [&>button]:!border-slate-200 dark:[&>button]:!bg-slate-900 dark:[&>button]:!border-slate-700 [&>button]:!text-slate-600 dark:[&>button]:!text-slate-400"
        />
        <MiniMap
          nodeStrokeWidth={3}
          className="!bg-white !border-slate-200 dark:!bg-slate-900 dark:!border-slate-700"
        />
      </ReactFlow>
    </div>
  );
}
