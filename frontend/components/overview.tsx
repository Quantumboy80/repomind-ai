'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Braces, Clock3, Code2, Database, FolderGit2, GitBranch, GitFork, Network, RefreshCw, Sparkles } from 'lucide-react';
import { api, Repository, RepoFile, fmtDate } from '@/lib/api';
import RepoConnect from '@/components/repo-connect';

type GraphPayload = {
  nodes: { id: string; path: string; language: string; size: number }[];
  edges: { id: string; source: string; target: string; import: string; line: number; resolved: boolean }[];
};
type MapNode = GraphPayload['nodes'][number] & { x: number; y: number };

export default function Overview({ repositories, active, files, languages, onSelect, onAdded, onRefresh }: { repositories: Repository[]; active: Repository | null; files: RepoFile[]; languages: [string, number][]; onSelect: (id: string) => void; onAdded: () => Promise<void>; onRefresh: () => Promise<void> }) {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [graphError, setGraphError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  useEffect(() => {
    let cancelled = false;
    setGraph(null); setSelectedNodeId(''); setGraphError('');
    if (!active || active.status !== 'ready') return () => { cancelled = true; };
    api<GraphPayload>(`/repositories/${active.id}/graph`).then((payload) => { if (!cancelled) setGraph(payload); }).catch((error) => { if (!cancelled) setGraphError(error instanceof Error ? error.message : 'Could not load the source map.'); });
    return () => { cancelled = true; };
  }, [active?.id, active?.status]);

  const mapNodes: MapNode[] = useMemo(() => {
    const sourceNodes = graph?.nodes || [];
    const resolvedEdges = (graph?.edges || []).filter((edge) => edge.resolved);
    const degree = new Map(sourceNodes.map((node) => [node.id, 0]));
    resolvedEdges.forEach((edge) => {
      if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    });
    const nodesById = new Map(sourceNodes.map((node) => [node.id, node]));
    const remaining = new Set(sourceNodes.map((node) => node.id));
    const selected: typeof sourceNodes = [];
    while (selected.length < 9 && remaining.size) {
      const selectedIds = new Set(selected.map((node) => node.id));
      const candidates = [...remaining].map((id) => {
        const node = nodesById.get(id)!;
        const linksToSelection = resolvedEdges.filter((edge) =>
          edge.source === id && selectedIds.has(edge.target) || edge.target === id && selectedIds.has(edge.source),
        ).length;
        return { node, linksToSelection, degree: degree.get(id) || 0 };
      });
      const connectedCandidates = selected.length ? candidates.filter((candidate) => candidate.linksToSelection > 0) : candidates;
      const next = connectedCandidates.sort((a, b) => b.linksToSelection - a.linksToSelection || b.degree - a.degree || a.node.path.localeCompare(b.node.path))[0];
      if (!next) break;
      selected.push(next.node);
      remaining.delete(next.node.id);
    }
    const visibleNodes = resolvedEdges.length ? selected : sourceNodes.slice(0, 9);
    return visibleNodes.map((node, index) => ({
      ...node, x: 66 + (index % 3) * 242, y: 58 + Math.floor(index / 3) * 90,
    }));
  }, [graph]);
  const visibleIds = useMemo(() => new Set(mapNodes.map((node) => node.id)), [mapNodes]);
  const mapEdges = useMemo(() => (graph?.edges || []).filter((edge) => edge.resolved && visibleIds.has(edge.source) && visibleIds.has(edge.target)).slice(0, 18), [graph, visibleIds]);
  const selectedNode = mapNodes.find((node) => node.id === selectedNodeId) || null;
  const totalFiles = repositories.reduce((sum, row) => sum + row.file_count, 0);
  const totalSymbols = repositories.reduce((sum, row) => sum + row.symbol_count, 0);
  const languageTotal = languages.reduce((sum, [, count]) => sum + count, 0) || 1;
  const sortedLanguages = useMemo(() => languages.slice(0, 4), [languages]);
  const [activeConcept, setActiveConcept] = useState('REPOSITORY');
  const resolvedImportCount = graph?.edges.filter((edge) => edge.resolved).length || 0;
  const concepts = [
    { word: 'FUNCTION', value: active ? `${active.symbol_count} SYMBOLS` : 'SOURCE', href: '/explorer', cursor: 'INSPECT' },
    { word: 'CLASS', value: 'STATIC PARSE', href: '/explorer', cursor: 'INSPECT' },
    { word: 'MODULE', value: active ? `${files.length} FILES` : 'FILE', href: '/explorer', cursor: 'EXPLORE' },
    { word: 'IMPORT', value: active ? `${resolvedImportCount} RESOLVED` : 'RELATION', href: '/graph', cursor: 'TRACE' },
    { word: 'DEPENDENCY', value: 'SOURCE EDGE', href: '/graph', cursor: 'TRACE' },
    { word: 'REPOSITORY', value: active?.github_full_name || 'CONNECT SOURCE', href: '/repositories', cursor: 'EXPLORE' },
    { word: 'SYMBOL', value: active ? `${active.symbol_count} INDEXED` : 'FUNCTION / CLASS', href: '/explorer', cursor: 'INSPECT' },
    { word: 'EXECUTION', value: 'NEVER RUN', href: '/settings', cursor: 'EXPLORE' },
    { word: 'ANALYSIS', value: active?.status?.toUpperCase() || 'AWAITING SOURCE', href: '/assistant', cursor: 'ASK AI' },
    { word: 'TRACE', value: active ? `${files.length} PATHS` : 'CHANGE PATH', href: '/impact', cursor: 'TRACE' },
  ];
  const activeConceptIndex = Math.max(0, concepts.findIndex((item) => item.word === activeConcept));

  return <div className="overview-experience">
    <section className="hero-layout">
      <div className="hero-copy">
        <div className="hero-eyebrow"><span className="pulse-point" /> Repository intelligence / {active?.status === 'ready' ? 'index live' : active?.status || 'ready to connect'}</div>
        <h1 className="hero-headline">Your codebase.<br /><span>Understood.</span></h1>
        <p className="hero-description">An engineering workspace that maps, explains and traces the systems behind your software—grounded in the files you actually ship.</p>
        <div className="hero-actions">
          {active ? <><Link data-cursor="EXPLORE" className="btn primary text-roll" href="/explorer">Explore source <ArrowRight size={14} /></Link><Link data-cursor="ASK AI" className="btn hero-secondary text-roll" href="/assistant">Ask the codebase <Sparkles size={14} /></Link></> : <Link data-cursor="EXPLORE" className="btn primary text-roll" href="/repositories">Explore a repository <ArrowRight size={14} /></Link>}
          <a className="hero-text-link" href="#method">See how it works <ArrowDownRight size={13} /></a>
        </div>
        {active ? <div className="active-repo-line"><span className="mono-label">ACTIVE REPOSITORY</span><span className="active-repo-name"><FolderGit2 size={14} />{active.github_full_name}</span><span className="active-repo-detail">{active.default_branch} branch <span>·</span> {active.language || 'languages detected'}</span></div> : <div className="hero-connect"><div className="mono-label">START WITH A PUBLIC REPOSITORY</div><RepoConnect onAdded={onAdded} /></div>}
      </div>

      <section className="live-map" aria-label="Live repository dependency map">
        <div className="map-topline"><span><span className="map-live-dot" />{active?.status === 'ready' ? 'LIVE SOURCE MAP' : 'REPOSITORY MAP'}</span><span className="mono-label">{active ? active.github_full_name : 'AWAITING SOURCE'}</span></div>
        {mapNodes.length ? <div className="map-canvas">
          <svg className="map-wires" viewBox="0 0 630 260" preserveAspectRatio="none" aria-label={`${mapEdges.length} resolved relationships shown`}>
            <defs><marker id="arrowhead" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#607dff" /></marker></defs>
            {mapEdges.map((edge) => {
              const source = mapNodes.find((node) => node.id === edge.source);
              const target = mapNodes.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              const sx = source.x, sy = source.y, tx = target.x, ty = target.y;
              return <path key={edge.id} className="wire-line" d={`M ${sx} ${sy} C ${(sx + tx) / 2} ${sy}, ${(sx + tx) / 2} ${ty}, ${tx} ${ty}`} markerEnd="url(#arrowhead)" />;
            })}
          </svg>
          {mapNodes.map((node, index) => <button key={node.id} data-cursor="TRACE" className={`map-node ${selectedNodeId === node.id ? 'selected' : ''}`} style={{ left: `${node.x / 6.3}%`, top: `${node.y / 2.6}%`, animationDelay: `${index * 65}ms` }} onClick={() => setSelectedNodeId(node.id)} aria-label={`Inspect ${node.path}`} title={`${node.path} · ${node.language}`}>
            <span className="map-node-orbit"><span className="map-node-core" /></span><span className="map-node-name">{node.path.split('/').pop()}</span><span className="map-node-path">{node.path.split('/').slice(0, -1).join('/') || '/'}</span>
          </button>)}
          <div className="map-annotation annotation-a">IMPORT EDGE <span>{mapEdges.length.toString().padStart(2, '0')}</span></div>
          <div className="map-annotation annotation-b">TREE-SITTER / {active?.language || 'SOURCE'}</div>
        </div> : <div className="map-empty"><div className="empty-map-glyph"><Network size={24} strokeWidth={1.2} /></div><div className="map-empty-title">{active?.status === 'ready' ? 'No resolved relationships yet' : 'Structure forms from source'}</div><p>{graphError || (active?.status === 'ready' ? 'This index contains no confirmed local import edges.' : 'Connect a repository to see its actual files and imports unfold here.')}</p></div>}
        <div className="map-footer"><div className="map-counts"><span><i className="count-square" />{graph?.nodes.length || 0} FILES MAPPED</span><span><i className="count-wire" />{graph?.edges.filter((edge) => edge.resolved).length || 0} RESOLVED IMPORTS</span></div>{selectedNode ? <span className="map-selection" title={selectedNode.path}>SELECTED / {selectedNode.path.split('/').pop()}</span> : <span className="map-selection">CLICK A NODE TO INSPECT</span>}</div>
      </section>
    </section>

    <section className="signal-strip" aria-label="Repository index totals">
      <div className="signal-caption"><span className="mono-label">THE INDEX</span><span className="signal-caption-text">Live metrics from connected source</span></div>
      <div className="signal-stat"><span className="signal-number">{totalFiles.toLocaleString()}</span><span className="signal-label">FILES INDEXED</span></div>
      <div className="signal-stat"><span className="signal-number">{totalSymbols.toLocaleString()}</span><span className="signal-label">FUNCTIONS & CLASSES</span></div>
      <div className="signal-stat"><span className="signal-number">{repositories.length.toString().padStart(2, '0')}</span><span className="signal-label">CONNECTED REPOS</span></div>
      <div className="signal-last"><Activity size={13} /><span>{active ? active.status === 'ready' ? `Last indexed ${fmtDate(active.last_analyzed_at)}` : `Analysis ${active.status}` : 'No analysis activity yet'}</span><button className="icon-refresh" onClick={() => void onRefresh()} aria-label="Refresh repository status" title="Refresh"><RefreshCw size={13} /></button></div>
    </section>

    <section className="concept-field" aria-label={`Engineering vocabulary${active ? ` for ${active.github_full_name}` : ''}`}>
      <div className="concept-heading"><span className="mono-label">THE WORKING VOCABULARY</span><span className="concept-context">{active?.github_full_name || 'A codebase, read from source'}</span></div>
      <div className="concept-grid">{concepts.map((concept, index) => <Link key={concept.word} href={concept.href} data-cursor={concept.cursor} className={`concept-tile text-roll ${activeConcept === concept.word ? 'is-selected selection-ink' : ''} ${Math.abs(activeConceptIndex - index) === 1 ? 'is-neighbor' : ''}`} onMouseEnter={() => setActiveConcept(concept.word)} onFocus={() => setActiveConcept(concept.word)}>
        <span className="concept-index">{String(index + 1).padStart(2, '0')}</span><strong>{concept.word}</strong><small>{concept.value}</small>
      </Link>)}</div>
    </section>

    <section className="overview-lower" id="method">
      <div className="language-column">
        <div className="section-overline"><span className="mono-label">01 — LANGUAGE PROFILE</span><span className="section-live">{active ? active.github_full_name : 'WAITING FOR REPOSITORY'}</span></div>
        <h2 className="section-title">Built from<br /><em>what is there.</em></h2>
        {sortedLanguages.length ? <div className="language-ledger">{sortedLanguages.map(([name, count], index) => <div className="language-row" key={name}><span className="language-index">0{index + 1}</span><span className="language-name">{name}</span><span className="language-bar"><i style={{ width: `${Math.max(5, count / languageTotal * 100)}%` }} /></span><span className="language-count">{count}</span></div>)}</div> : <div className="language-empty">Connect a public GitHub repository. Supported source languages appear here after ingestion.</div>}
        {active && <div className="analysis-note"><Clock3 size={13} /><span>{active.status === 'ready' ? `${files.length} indexed paths in the active workspace.` : `Current index state: ${active.status}.`}</span></div>}
      </div>
      <div className="journey-column">
        <div className="section-overline"><span className="mono-label">02 — FROM SOURCE TO SIGNAL</span><span className="section-live">FOUR WAYS IN</span></div>
        <h2 className="section-title">Follow the<br /><em>engineering thread.</em></h2>
        <div className="journey-list">
          <Link href="/repositories" className="journey-row"><span className="journey-step">01</span><span className="journey-icon"><FolderGit2 size={16} /></span><span className="journey-copy"><strong>Connect</strong><small>Index a public codebase</small></span><ArrowUpRight size={15} className="journey-arrow" /></Link>
          <Link href="/graph" className="journey-row"><span className="journey-step">02</span><span className="journey-icon"><GitBranch size={16} /></span><span className="journey-copy"><strong>Map</strong><small>Follow imports through the system</small></span><ArrowUpRight size={15} className="journey-arrow" /></Link>
          <Link href="/assistant" className="journey-row"><span className="journey-step">03</span><span className="journey-icon"><Braces size={16} /></span><span className="journey-copy"><strong>Ask</strong><small>Get answers with source evidence</small></span><ArrowUpRight size={15} className="journey-arrow" /></Link>
          <Link href="/impact" className="journey-row"><span className="journey-step">04</span><span className="journey-icon"><GitFork size={16} /></span><span className="journey-copy"><strong>Trace</strong><small>See which files a change can reach</small></span><ArrowUpRight size={15} className="journey-arrow" /></Link>
        </div>
      </div>
    </section>

    {repositories.length > 1 && <section className="repository-index"><div className="section-overline"><span className="mono-label">03 — YOUR REPOSITORIES</span><Link href="/repositories">Manage all <ArrowRight size={13} /></Link></div><div className="repository-index-list">{repositories.map((repo) => <button key={repo.id} onClick={() => onSelect(repo.id)} className={`repository-index-row ${active?.id === repo.id ? 'is-active' : ''}`}><span className="repo-index-glyph"><GitBranch size={15} /></span><span className="repo-index-name">{repo.github_full_name}</span><span className="repo-index-meta">{repo.file_count} files / {repo.symbol_count} symbols</span><span className={`badge ${repo.status === 'ready' ? 'success' : repo.status === 'error' ? 'error' : 'processing'}`}>{repo.status}</span><ArrowUpRight size={14} /></button>)}</div></section>}
  </div>;
}
