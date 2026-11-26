'use client';
import { useCallback, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Node, Edge, useEdgesState, useNodesState } from '@xyflow/react';
import { api, Repository } from '@/lib/api';
import { Network, RefreshCw } from 'lucide-react';

type GraphPayload = {
  nodes: { id: string; path: string; language: string; size: number }[];
  edges: { id: string; source: string; target: string; import: string; line: number; resolved: boolean }[];
};
type RepoNode = Node<{ label: React.ReactNode; path: string; language: string; size: number }>;
type SelectedNode = { id: string; path: string; language: string; size: number };

export default function GraphView({ repository }: { repository: Repository | null }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RepoNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [unresolved, setUnresolved] = useState(0);

  const load = useCallback(async () => {
    if (!repository) { setNodes([]); setEdges([]); return; }
    setLoading(true);
    try {
      const graph = await api<GraphPayload>(`/repositories/${repository.id}/graph`);
      setUnresolved(graph.edges.filter((edge) => !edge.resolved).length);
      const graphNodes: RepoNode[] = graph.nodes.map((node, index) => ({
        id: node.id,
        position: { x: (index % 5) * 220, y: Math.floor(index / 5) * 125 },
        data: {
          path: node.path,
          language: node.language,
          size: node.size,
          label: <div><div className="rf-node-title">{node.path}</div><div className="rf-node-meta">{node.language} · {Math.max(1, Math.round(node.size / 1024))} KB</div></div>,
        },
        style: { border: '1px solid #303950', background: '#151a25', borderRadius: 8, padding: 0, color: '#dbe0ed', width: 175, overflow: 'hidden' },
      }));
      const graphEdges: Edge[] = graph.edges.filter((edge) => edge.resolved).map((edge) => ({
        id: edge.id, source: edge.source, target: edge.target, label: edge.import,
        style: { stroke: '#687ef2', strokeWidth: 1.25 },
        labelStyle: { fill: '#929bb0', fontSize: 8 }, labelBgStyle: { fill: '#0e1119' }, labelBgPadding: [4, 2], labelBgBorderRadius: 3,
      }));
      setNodes(graphNodes); setEdges(graphEdges); setSelected(null); setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load dependency graph.');
    } finally { setLoading(false); }
  }, [repository?.id, repository?.status, setEdges, setNodes]);
  useEffect(() => { void load(); }, [load]);

  const onNodeClick = useCallback((_: unknown, node: RepoNode) => {
    setSelected({ id: node.id, path: node.data.path, language: node.data.language, size: node.data.size });
  }, []);

  if (!repository) return <div className="card empty"><div className="empty-icon"><Network size={19} /></div><div className="empty-title">No dependency graph yet</div><p className="empty-text">Connect and ingest a repository to build a graph from actual imports.</p></div>;

  return <div className="card card-pad">
    <div className="card-head"><div><div className="card-title">{repository.github_full_name}</div><div className="card-note">{nodes.length} source files · {edges.length} resolved imports · {unresolved} unresolved imports</div></div><div className="graph-toolbar"><span>Drag to arrange · scroll to zoom</span><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={13} />{loading ? 'Loading' : 'Refresh'}</button></div></div>
    {error && <div className="error-box">{error}</div>}
    {nodes.length ? <div className="rf-canvas"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.18 }} proOptions={{ hideAttribution: true }}><Background color="#293043" gap={22} size={1} /><Controls /><MiniMap nodeColor="#667be5" maskColor="#090b10bb" /></ReactFlow></div> : <div className="empty"><div className="empty-icon"><Network size={19} /></div><div className="empty-title">{repository.status === 'ready' ? 'No imports were resolved' : 'Waiting for source ingestion'}</div><p className="empty-text">This view renders only relationships extracted from repository source; no demo edges are fabricated.</p></div>}
    {selected && <div className="success-box" style={{ marginTop: 12 }}><strong>{selected.path}</strong> · {selected.language} · {selected.size.toLocaleString()} bytes. Open Code Explorer to inspect source and symbols.</div>}
    <div className="card-note" style={{ marginTop: 10 }}>Unresolved imports remain visible in the count but are not drawn as confirmed file relationships.</div>
  </div>;
}
