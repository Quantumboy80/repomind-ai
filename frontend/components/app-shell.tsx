'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, Bot, Braces, ChevronDown, Code2, GitBranch, GitFork, Home, Library, Search, Settings2, SquareTerminal, X } from 'lucide-react';
import { api, fetchAllFiles, Meta, Repository, RepoFile } from '@/lib/api';
import Overview from '@/components/overview';
import Repositories from '@/components/repositories';
import Explorer from '@/components/explorer';
import Assistant from '@/components/assistant';
import GraphView from '@/components/graph-view';
import Impact from '@/components/impact';
import SettingsView from '@/components/settings-view';

const navigation = [
  { label: 'Overview', short: 'Home', href: '/', icon: Home },
  { label: 'Repositories', short: 'Repos', href: '/repositories', icon: Library },
  { label: 'Code Explorer', short: 'Code', href: '/explorer', icon: Code2 },
  { label: 'AI Assistant', short: 'Ask', href: '/assistant', icon: Bot },
  { label: 'Dependency Graph', short: 'Graph', href: '/graph', icon: GitBranch },
  { label: 'Impact Analysis', short: 'Impact', href: '/impact', icon: GitFork },
  { label: 'Settings', short: 'Settings', href: '/settings', icon: Settings2 },
];
const titles: Record<string, { title: string; sub: string }> = {
  '/repositories': { title: 'Repositories', sub: 'Connect public GitHub projects and follow each analysis from source to index.' },
  '/explorer': { title: 'Code, in context.', sub: 'Browse indexed source, line-accurate symbols, and the files that give them meaning.' },
  '/assistant': { title: 'Ask the repository.', sub: 'Every answer begins with retrieved code and carries its source references.' },
  '/graph': { title: 'See the connections.', sub: 'A map of imports actually extracted from this repository—not an illustrative mock.' },
  '/impact': { title: 'Trace the change.', sub: 'Follow resolved dependents before a source file moves or changes.' },
  '/settings': { title: 'Runtime & trust.', sub: 'Inspect service configuration and security boundaries. Secrets stay server-side.' },
};

export default function AppShell() {
  const pathname = usePathname();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activeId, setActiveId] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const paletteDialogRef = useRef<HTMLElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const activeRepo = useMemo(() => repos.find((repo) => repo.id === activeId) || null, [repos, activeId]);
  const activeNav = navigation.find((item) => item.href === pathname) || navigation[0];
  const isOverview = pathname === '/';

  async function refresh() {
    try {
      const [nextRepos, nextMeta] = await Promise.all([api<Repository[]>('/repositories'), api<Meta>('/meta')]);
      setRepos(nextRepos); setMeta(nextMeta); setApiError('');
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('repomind-active-repo') : null;
      const nextActive = nextRepos.some((repo) => repo.id === activeId) ? activeId : (nextRepos.find((repo) => repo.id === saved)?.id || nextRepos[0]?.id || '');
      setActiveId(nextActive);
      if (nextActive) window.localStorage.setItem('repomind-active-repo', nextActive);
    } catch (error) { setApiError(error instanceof Error ? error.message : 'Could not load the repository service.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 7000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    function onKeyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen((open) => !open); setPaletteQuery(''); }
      if (event.key === 'Escape') setPaletteOpen(false);
    }
    window.addEventListener('keydown', onKeyboard);
    return () => window.removeEventListener('keydown', onKeyboard);
  }, []);
  useEffect(() => {
    if (!paletteOpen) return;
    paletteInputRef.current?.focus();
    function trapTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !paletteDialogRef.current) return;
      const focusable = Array.from(paletteDialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const outside = !paletteDialogRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', trapTab);
    return () => {
      window.removeEventListener('keydown', trapTab);
      window.requestAnimationFrame(() => paletteTriggerRef.current?.focus());
    };
  }, [paletteOpen]);
  useEffect(() => {
    if (!activeRepo) { setFiles([]); return; }
    let cancelled = false;
    fetchAllFiles(activeRepo.id).then((nextFiles) => { if (!cancelled) setFiles(nextFiles); }).catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [activeRepo?.id, activeRepo?.status]);
  function chooseRepo(id: string) { setActiveId(id); window.localStorage.setItem('repomind-active-repo', id); }
  async function onRepositoryAdded() { await refresh(); }
  const counts = useMemo(() => {
    const langs = new Map<string, number>();
    files.forEach((file) => langs.set(file.language, (langs.get(file.language) || 0) + 1));
    return Array.from(langs.entries()).sort((a, b) => b[1] - a[1]);
  }, [files]);
  const query = paletteQuery.trim().toLowerCase();
  const matchingRoutes = navigation.filter((item) => `${item.label} ${item.short}`.toLowerCase().includes(query));
  const matchingRepos = repos.filter((repo) => repo.github_full_name.toLowerCase().includes(query));

  return <div className="shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="RepoMind overview">
        <span className="brandmark"><GitBranch size={19} strokeWidth={1.8} /></span>
        <span className="brand-lockup"><span className="brandname">repo<span>mind</span></span><span className="brand-sub">CODEBASE INTELLIGENCE</span></span>
      </Link>
      <nav className="workspace-nav" aria-label="Workspace navigation">
        {navigation.map(({ label, short, href, icon: Icon }) => <Link key={href} href={href} title={label} className={`nav-link ${pathname === href ? 'active' : ''}`}><Icon size={14} /><span>{short}</span></Link>)}
      </nav>
      <div className="top-actions">
        <button ref={paletteTriggerRef} className="palette-trigger" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); }} aria-label="Open command palette"><Search size={13} /><kbd>CTRL K</kbd></button>
        <label className="repo-picker"><SquareTerminal size={13} /><select aria-label="Active repository" value={activeId} onChange={(event) => chooseRepo(event.target.value)} disabled={!repos.length}><option value="">No repository</option>{repos.map((repo) => <option value={repo.id} key={repo.id}>{repo.github_full_name}</option>)}</select><ChevronDown size={12} /></label>
        <span className={`status-pill ${apiError ? 'offline' : ''}`} title={apiError || (meta?.demo_mode ? 'Retrieved source only; no generated answer without a provider.' : 'Provider configured')}><span className="status-light" />{apiError ? 'Offline' : meta?.demo_mode ? 'Demo' : 'AI live'}</span>
      </div>
    </header>
    {paletteOpen && <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}><section ref={paletteDialogRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}><div className="palette-search"><Search size={16} /><input ref={paletteInputRef} value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Go to a workspace or repository…" aria-label="Search commands" /><button onClick={() => setPaletteOpen(false)} aria-label="Close command palette"><X size={15} /></button></div><div className="palette-results"><div className="palette-group">WORKSPACE</div>{matchingRoutes.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className="palette-option" onClick={() => setPaletteOpen(false)}><Icon size={15} /><span>{label}</span><ArrowRight size={13} /></Link>)}{matchingRepos.length > 0 && <><div className="palette-group">REPOSITORIES</div>{matchingRepos.map((repo) => <button key={repo.id} className="palette-option" onClick={() => { chooseRepo(repo.id); setPaletteOpen(false); }}><GitBranch size={15} /><span>{repo.github_full_name}</span><small>{repo.status}</small></button>)}</>}{matchingRoutes.length === 0 && matchingRepos.length === 0 && <p className="palette-empty">No workspace or repository matches “{paletteQuery}”.</p>}</div><div className="palette-hint"><span>Navigate the workspace</span><span><kbd>ESC</kbd> close</span></div></section></div>}
    <main className="main">
      <div className="page">
        {!isOverview && <div className="page-heading"><div><div className="eyebrow">{String(navigation.findIndex((item) => item.href === pathname) + 1).padStart(2, '0')} / {activeNav.label}</div><h1>{titles[pathname]?.title || activeNav.label}</h1><p className="subtitle">{titles[pathname]?.sub}</p></div>{activeRepo && <span className={`badge ${activeRepo.status === 'ready' ? 'success' : activeRepo.status === 'error' ? 'error' : 'processing'}`}>{activeRepo.status === 'processing' ? 'Analysis running' : activeRepo.status}</span>}</div>}
        {apiError && <div className="error-box" role="status">{apiError} Repository operations need the FastAPI service.</div>}
        {loading ? <div className="card empty"><div className="empty-icon"><Activity size={19} /></div><div className="empty-title">Opening your workspace</div><p className="empty-text">Loading live repository index and analysis status…</p></div> : isOverview ? <Overview repositories={repos} active={activeRepo} files={files} languages={counts} onSelect={chooseRepo} onAdded={onRepositoryAdded} onRefresh={refresh} /> : pathname === '/repositories' ? <Repositories repositories={repos} activeId={activeId} onSelect={chooseRepo} onAdded={onRepositoryAdded} onRefresh={refresh} /> : pathname === '/explorer' ? <Explorer repository={activeRepo} /> : pathname === '/assistant' ? <Assistant repository={activeRepo} meta={meta} /> : pathname === '/graph' ? <GraphView repository={activeRepo} /> : pathname === '/impact' ? <Impact repository={activeRepo} /> : <SettingsView meta={meta} />}
      </div>
    </main>
    <footer className="app-footer"><span>RepoMind <span className="footer-mark">/</span> Repository intelligence</span><span>{activeRepo?.github_full_name || 'Connect a repository to begin'} <span className="footer-mark">·</span> {activeRepo?.status || 'local workspace'}</span></footer>
  </div>;
}
