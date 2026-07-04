import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { api } from '../lib/api';

interface GraphNode {
  id: string;
  label: string;
  type: string;
}

interface GraphPayload {
  nodes: GraphNode[];
  edges: Array<{ id: string; source: string; target: string; dashed?: boolean }>;
  decisionGraph?: { nodes: GraphNode[]; edges: Array<{ id: string; source: string; target: string; dashed?: boolean }> };
}

const TYPE_COLORS: Record<string, string> = {
  start: '#166534',
  end: '#1e3a8a',
  fabric: '#854d0e',
  print: '#7c2d12',
  factory: '#312e81',
  process: '#155e75',
  alternative: '#3f3f46',
};

function layoutGraph(nodes: GraphNode[], edges: GraphPayload['edges']) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 60 });
  nodes.forEach((n) => g.setNode(n.id, { width: 160, height: 56 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      data: { label: n.label },
      position: { x: pos.x - 80, y: pos.y - 28 },
      style: {
        background: TYPE_COLORS[n.type] || '#27272a',
        color: '#fff',
        border: '1px solid #52525b',
        borderRadius: 8,
        padding: 8,
        fontSize: 10,
        maxWidth: 160,
        whiteSpace: 'pre-wrap' as const,
      },
    } as Node;
  });
}

export default function RouteGraph({ scenarioId }: { scenarioId: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api<GraphPayload>(`/scenarios/${scenarioId}/graph`)
      .then((g: GraphPayload) => {
        const src = g.decisionGraph?.nodes?.length ? g.decisionGraph : { nodes: g.nodes, edges: g.edges };
        setNodes(layoutGraph(src.nodes, src.edges));
        setEdges(
          src.edges.map((e) => ({
            ...e,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: e.dashed ? '#a1a1aa' : '#71717a', strokeDasharray: e.dashed ? '4 4' : undefined },
          })) as Edge[]
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'خطأ'));
  }, [scenarioId, setNodes, setEdges]);

  const onInit = useCallback(() => {}, []);

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!nodes.length) return <p className="text-xs text-zinc-500">جاري تحميل المخطط...</p>;

  return (
    <div className="h-80 rounded-xl border border-zinc-800 bg-zinc-950" dir="ltr">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onInit={onInit} fitView>
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
