'use client';

import { useEffect, useMemo, useState } from 'react';
import { Braces, FileCode2, LayoutGrid, List, Search } from 'lucide-react';
import { api, fetchAllFiles, FileDetail, RepoFile, Repository } from '@/lib/api';

type ExplorerMode = 'list' | 'grid';
type SymbolIndex = { items: { file_id: string }[]; total: number; page_size: number };
type GraphPayload = {
  nodes: { id: string; path: string; language: string; size: number }[];
  edges: { id: string; source: string; target: string; resolved: boolean }[];
};

export default function Explorer({ repository }: { repository: Repository | null }) {
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [symbolCounts, setSymbolCounts] = useState<Record<string, number>>({});
  const [dependencies, setDependencies] = useState<Record<string, { imports: number; dependents: number }>>({});
  const [symbolsAvailable, setSymbolsAvailable] = useState(false);
  const [dependenciesAvailable, setDependenciesAvailable] = useState(false);
  const [selected, setSelected] = useState<FileDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ExplorerMode>('list');

  useEffect(() => {
    if (!repository) {
      setFiles([]); setSelected(null); setSelectedId(''); setSymbolCounts({}); setDependencies({});
      setSymbolsAvailable(false); setDependenciesAvailable(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setSymbolsAvailable(false); setDependenciesAvailable(false);
    Promise.allSettled([
      fetchAllFiles(repository.id),
      (async () => {
        const first = await api<SymbolIndex>(`/repositories/${repository.id}/symbols?page=1&page_size=200`);
        const pages = Math.ceil(first.total / first.page_size);
        const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          api<SymbolIndex>(`/repositories/${repository.id}/symbols?page=${index + 2}&page_size=200`),
        ));
        return [first, ...rest].flatMap((page) => page.items);
      })(),
      api<GraphPayload>(`/repositories/${repository.id}/graph`),
    ]).then(([filesResult, symbolsResult, graphResult]) => {
      if (cancelled) return;
      if (filesResult.status === 'rejected') throw filesResult.reason;
      setFiles(filesResult.value);
      setSelected(null); setSelectedId('');
      if (symbolsResult.status === 'fulfilled') {
        const counts: Record<string, number> = {};
        symbolsResult.value.forEach(({ file_id }) => { counts[file_id] = (counts[file_id] || 0) + 1; });
        setSymbolCounts(counts);
        setSymbolsAvailable(true);
      } else setSymbolCounts({});
      if (graphResult.status === 'fulfilled') {
        const edges = graphResult.value.edges.filter((edge) => edge.resolved);
        const deps: Record<string, { imports: number; dependents: number }> = {};
        edges.forEach(({ source, target }) => {
          deps[source] = deps[source] || { imports: 0, dependents: 0 };
          deps[target] = deps[target] || { imports: 0, dependents: 0 };
          deps[source].imports += 1;
          deps[target].dependents += 1;
        });
        setDependencies(deps);
        setDependenciesAvailable(true);
      } else setDependencies({});
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load repository files.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repository?.id, repository?.status]);

  async function openFile(file: RepoFile) {
    if (!repository) return;
    setSelectedId(file.id);
    setSelected(null);
    setError('');
    try { setSelected(await api<FileDetail>(`/repositories/${repository.id}/files/${file.id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open file.'); }
  }

  const visible = useMemo(() => files.filter((file) => file.path.toLowerCase().includes(search.toLowerCase())), [files, search]);
  const selectedDependencies = selectedId && dependenciesAvailable ? dependencies[selectedId] || { imports: 0, dependents: 0 } : null;

  if (!repository) return <Empty title="Select a repository" text="Connect a public GitHub project on the Repositories page to explore its indexed source." />;

  return <div className={`workspace-grid explorer-layout ${mode === 'grid' ? 'explorer-grid-mode' : ''}`}>
    <section className="card explorer-browser">
      <div className="card-pad explorer-browser-head">
        <div className="card-title">Source files <span className="badge" style={{ marginLeft: 6 }}>{files.length}</span></div>
        <div className="card-note">{repository.github_full_name}</div>
        <div className="explorer-tools">
          <div className="explorer-search"><Search size={14} aria-hidden="true" /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter file paths" aria-label="Filter files" /></div>
          <div className="view-toggle" role="group" aria-label="File display mode">
            <button type="button" className={mode === 'list' ? 'is-active selection-ink' : ''} aria-pressed={mode === 'list'} onClick={() => setMode('list')} title="List view"><List size={14} /><span className="sr-only">List view</span></button>
            <button type="button" className={mode === 'grid' ? 'is-active selection-ink' : ''} aria-pressed={mode === 'grid'} onClick={() => setMode('grid')} title="Grid view"><LayoutGrid size={14} /><span className="sr-only">Grid view</span></button>
          </div>
        </div>
        {(!symbolsAvailable || !dependenciesAvailable) && !loading && <p className="card-note" role="status" style={{ marginTop: 8 }}>Some repository metadata is unavailable; unknown counts are shown as —.</p>}
      </div>
      <div className={`file-list ${mode === 'grid' ? 'file-list-grid' : ''}`}>
        {loading && <p className="card-note" style={{ padding: 12 }}>Loading indexed files and source relationships…</p>}
        {visible.map((file) => {
          const ext = file.path.split('.').pop()?.toUpperCase() || 'FILE';
          const deps = dependencies[file.id];
          const active = selectedId === file.id;
          return <button key={file.id} type="button" data-cursor="INSPECT" className={`file-item ${mode === 'grid' ? 'file-card' : ''} ${active ? 'active selection-ink' : ''}`} onClick={() => void openFile(file)} aria-pressed={active} title={file.path}>
            <span className="file-card-icon"><FileCode2 size={14} /></span>
            <span className="file-card-main"><span className="file-path">{file.path}</span><span className="file-card-meta">{file.language} <span>·</span> {ext}</span></span>
            <span className="file-card-details"><span><Braces size={10} /> {symbolsAvailable ? symbolCounts[file.id] || 0 : '—'}</span><span title="Resolved imports / dependents">↗ {dependenciesAvailable ? deps?.imports || 0 : '—'} <span className="file-card-separator">·</span> ↙ {dependenciesAvailable ? deps?.dependents || 0 : '—'}</span></span>
          </button>;
        })}
        {!loading && visible.length === 0 && <p className="card-note" style={{ padding: 12 }}>{files.length ? 'No files match that filter.' : 'No indexed files yet.'}</p>}
      </div>
    </section>
    <section className="card code-wrap">
      {error && <div className="error-box" role="status" style={{ margin: 12 }}>{error}</div>}
      {selected ? <>
        <div className="code-header"><span className="code-path" title={selected.path}>{selected.path}</span><span className="badge">{selected.language} · {selected.content.split('\n').length} lines</span></div>
        <pre className="code-view" aria-label={`Source code for ${selected.path}`}>{selected.content.split('\n').map((line, index) => <span className="code-line" key={index}><span className="line-no">{index + 1}</span>{line || ' '}</span>)}</pre>
        {selected.symbols.length > 0 && <div className="symbol-list">{selected.symbols.map((symbol) => <span className="symbol-chip" key={symbol.id} title={`${symbol.kind} · lines ${symbol.start_line}-${symbol.end_line}`}><Braces size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} />{symbol.name}<span style={{ color: '#737f96', marginLeft: 5 }}>L{symbol.start_line}</span></span>)}</div>}
        {selectedDependencies && <div className="explorer-dependency-note">{selectedDependencies.imports} resolved imports <span>·</span> {selectedDependencies.dependents} dependents</div>}
      </> : <Empty title={repository.status === 'processing' ? 'Repository analysis in progress' : 'Choose a source file'} text={repository.status === 'ready' ? 'Select a file to inspect real source, extracted symbols, and resolved import relationships.' : 'When ingestion completes, its real file inventory will appear here.'} />}
    </section>
  </div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><div className="empty-icon"><FileCode2 size={19} /></div><div className="empty-title">{title}</div><p className="empty-text">{text}</p></div>;
}
