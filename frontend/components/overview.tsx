'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { Activity, ArrowUpRight, Braces, Clock3, Code2, Database, FolderGit2, RefreshCw, Sparkles } from 'lucide-react';
import { Repository, RepoFile, fmtDate } from '@/lib/api';
import RepoConnect from '@/components/repo-connect';

export default function Overview({ repositories, active, files, languages, onSelect, onAdded, onRefresh }: { repositories: Repository[]; active: Repository | null; files: RepoFile[]; languages: [string, number][]; onSelect: (id: string) => void; onAdded: () => Promise<void>; onRefresh: () => Promise<void> }) {
  const totalFiles = repositories.reduce((sum, row) => sum + row.file_count, 0);
  const totalSymbols = repositories.reduce((sum, row) => sum + row.symbol_count, 0);
  const languageTotal = languages.reduce((sum, [, count]) => sum + count, 0) || 1;
  const metricCards = [
    { label: 'Connected repositories', value: repositories.length, note: 'Public GitHub projects', icon: FolderGit2 },
    { label: 'Files analyzed', value: totalFiles, note: active ? `${active.file_count} in active repository` : 'No indexed files yet', icon: Code2 },
    { label: 'Languages detected', value: languages.length, note: languages.map(([name]) => name).join(', ') || 'Waiting for analysis', icon: Braces },
    { label: 'Symbols indexed', value: totalSymbols, note: 'Functions, methods and classes', icon: Database },
  ];
  const sortedLanguages = useMemo(() => languages.slice(0, 5), [languages]);
  return <>
    <div className="metrics">{metricCards.map(({ label, value, note, icon: Icon }) => <section className="card metric" key={label}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={15} /></span></div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-foot">{note}</div></section>)}</div>
    <div className="grid-main">
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <section className="card card-pad"><div className="card-head"><div><div className="card-title">Connect a repository</div><div className="card-note">Start with a public GitHub URL. Ingestion progress appears in the repository list.</div></div><span className="badge">Read-only</span></div><RepoConnect onAdded={onAdded} /></section>
        <section className="card card-pad"><div className="card-head"><div><div className="card-title">Connected repositories</div><div className="card-note">{repositories.length} indexed project{repositories.length === 1 ? '' : 's'}</div></div><Link className="btn ghost" href="/repositories">View all <ArrowUpRight size={13} /></Link></div>{repositories.length ? repositories.slice(0, 5).map((repo) => <button key={repo.id} className="repo-row" onClick={() => onSelect(repo.id)} style={{ width: '100%', textAlign: 'left', color: 'inherit', borderTop: 0, borderLeft: 0, borderRight: 0, background: 'transparent' }}><span className="repo-icon"><FolderGit2 size={16} /></span><span style={{ minWidth: 0 }}><span className="repo-name">{repo.github_full_name}</span><span className="repo-meta" style={{ display: 'block' }}>{repo.file_count} files · {repo.symbol_count} symbols · {repo.language || 'Language pending'}</span></span><span className={`badge ${repo.status === 'ready' ? 'success' : repo.status === 'error' ? 'error' : 'processing'}`}>{repo.status}</span></button>) : <div className="empty"><div className="empty-icon"><FolderGit2 size={19} /></div><div className="empty-title">Your repository workspace is empty</div><p className="empty-text">Connect a public repository above. RepoMind will index real files and show progress here.</p></div>}</section>
      </div>
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <section className="card card-pad"><div className="card-head"><div><div className="card-title">Language distribution</div><div className="card-note">Detected in the active repository</div></div><Braces size={15} color="#899aff" /></div>{sortedLanguages.length ? <div className="lang-bars">{sortedLanguages.map(([name, count]) => <div className="lang-line" key={name}><span>{name}</span><span className="bar"><i style={{ width: `${Math.max(6, count / languageTotal * 100)}%` }} /></span><span style={{ textAlign: 'right' }}>{count}</span></div>)}</div> : <div className="card-note">No language data yet. Connect a repository to begin.</div>}</section>
        <section className="card card-pad"><div className="card-head"><div><div className="card-title">Analysis status</div><div className="card-note">Latest activity for the active repository</div></div><button className="btn ghost" onClick={() => void onRefresh()} aria-label="Refresh analysis status"><RefreshCw size={13} /></button></div>{active ? <div className="activity"><div className="activity-row"><span className="activity-mark" style={{ background: active.status === 'error' ? 'var(--red)' : active.status === 'ready' ? 'var(--green)' : 'var(--blue)' }} /><span><strong style={{ color: '#d8deed', fontWeight: 550 }}>{active.status === 'ready' ? 'Analysis complete' : active.status === 'error' ? 'Analysis needs attention' : 'Repository analysis queued'}</strong><span className="activity-time"><Clock3 size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} />{fmtDate(active.last_analyzed_at)}</span>{active.status === 'error' && <span className="activity-time">Check the repository URL, GitHub availability, or API status.</span>}</span></div><div className="activity-row"><span className="activity-mark" /><span>Current index: {files.length} visible files<span className="activity-time">Parsed code is stored with exact source line ranges.</span></span></div></div> : <div className="empty" style={{ padding: '16px' }}><Activity size={17} /><p className="card-note">No analysis activity yet.</p></div>}</section>
        <section className="card card-pad"><div className="card-head"><div><div className="card-title">Grounded answers</div><div className="card-note">AI is only enabled when a provider is configured.</div></div><Sparkles size={15} color="#b6a0ff" /></div><p className="card-note" style={{ lineHeight: 1.7 }}>Without provider credentials, RepoMind labels demo mode and returns retrieved source evidence only. It does not invent code explanations.</p><Link className="btn" href="/settings">Provider settings <ArrowUpRight size={13} /></Link></section>
      </div>
    </div>
  </>;
}
