'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, Braces, ChevronRight, Code2, GitBranch, GitFork, Home, Library, Settings2, SquareTerminal } from 'lucide-react';
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

export default function AppShell() {
  const pathname = usePathname();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [activeId, setActiveId] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(true);
  const activeRepo = useMemo(() => repos.find((repo) => repo.id === activeId) || null, [repos, activeId]);
  const activeNav = navigation.find((item) => item.href === pathname) || navigation[0];

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
    if (!activeRepo) { setFiles([]); return; }
    let cancelled = false;
    fetchAllFiles(activeRepo.id).then((nextFiles) => { if (!cancelled) setFiles(nextFiles); }).catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [activeRepo?.id, activeRepo?.status]);
  function chooseRepo(id: string) { setActiveId(id); window.localStorage.setItem('repomind-active-repo', id); }
  async function onRepositoryAdded() { await refresh(); }

  const titles: Record<string, { title: string; sub: string }> = {
    '/': { title: 'Repository overview', sub: 'A clear view of what has been indexed and what needs attention.' },
    '/repositories': { title: 'Repositories', sub: 'Connect public GitHub repositories and monitor their analysis status.' },
    '/explorer': { title: 'Code Explorer', sub: 'Browse indexed files, source symbols and their precise line ranges.' },
    '/assistant': { title: 'AI Assistant', sub: 'Ask repository-specific questions grounded in retrieved source evidence.' },
    '/graph': { title: 'Dependency Graph', sub: 'Explore actual imports extracted from the repository source.' },
    '/impact': { title: 'Impact Analysis', sub: 'Trace statically resolved dependents before changing a file.' },
    '/settings': { title: 'Settings', sub: 'Inspect provider and runtime configuration without exposing secrets.' },
  };
  const current = titles[pathname] || titles['/'];
  const counts = useMemo(() => {
    const langs = new Map<string, number>();
    files.forEach((file) => langs.set(file.language, (langs.get(file.language) || 0) + 1));
    return Array.from(langs.entries()).sort((a, b) => b[1] - a[1]);
  }, [files]);

  return <div className="shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brandmark"><GitBranch size={20} strokeWidth={1.8} /></span><span><span className="brandname">RepoMind</span><span className="brand-sub">Repository intelligence</span></span></Link>
      <div><div className="nav-label">Workspace</div><nav className="nav-list">{navigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${pathname === href ? 'active' : ''}`}><Icon size={16} /><span>{label}</span>{pathname === href && <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: .55 }} />}</Link>)}</nav></div>
      <div className="sidebar-bottom"><div className="repo-mini"><div className="repo-mini-label">Active repository</div>{activeRepo ? <><div className="repo-mini-name"><span className="dot" style={{ background: activeRepo.status === 'ready' ? 'var(--green)' : activeRepo.status === 'error' ? 'var(--red)' : 'var(--blue)' }} />{activeRepo.github_full_name}</div><div className="repo-meta" style={{ marginTop: 8 }}>{activeRepo.file_count} files · {activeRepo.symbol_count} symbols</div></> : <div className="repo-meta">Connect a repository to begin.</div>}</div><div className="sidebar-foot">Grounded in code, not guesswork.</div></div>
    </aside>
    <div className="main">
      <header className="topbar"><div className="crumb"><span>Workspace</span><ChevronRight size={13} /><strong>{activeNav.label}</strong></div><div className="top-actions"><span className="status-pill"><span className="dot" style={{ background: apiError ? 'var(--red)' : 'var(--green)' }} />{apiError ? 'API offline' : meta?.demo_mode ? 'Demo mode' : 'AI enabled'}</span>{activeRepo && <span className="status-pill"><SquareTerminal size={13} />{activeRepo.github_full_name}</span>}</div></header>
      <main className="page"><div className="page-heading"><div><div className="eyebrow">RepoMind / {activeNav.label}</div><h1>{current.title}</h1><p className="subtitle">{current.sub}</p></div>{activeRepo && <span className={`badge ${activeRepo.status === 'ready' ? 'success' : activeRepo.status === 'error' ? 'error' : 'processing'}`}>{activeRepo.status === 'processing' ? 'Analysis running' : activeRepo.status}</span>}</div>
        {apiError && <div className="error-box">{apiError} The UI remains available, but repository operations require the FastAPI service.</div>}
        {loading ? <div className="card empty"><div className="empty-icon"><Activity size={19} /></div><div className="empty-title">Connecting to RepoMind</div><p className="empty-text">Loading repository index and analysis status…</p></div> : pathname === '/' ? <Overview repositories={repos} active={activeRepo} files={files} languages={counts} onSelect={chooseRepo} onAdded={onRepositoryAdded} onRefresh={refresh} /> : pathname === '/repositories' ? <Repositories repositories={repos} activeId={activeId} onSelect={chooseRepo} onAdded={onRepositoryAdded} onRefresh={refresh} /> : pathname === '/explorer' ? <Explorer repository={activeRepo} /> : pathname === '/assistant' ? <Assistant repository={activeRepo} meta={meta} /> : pathname === '/graph' ? <GraphView repository={activeRepo} /> : pathname === '/impact' ? <Impact repository={activeRepo} /> : <SettingsView meta={meta} />}
      </main>
    </div>
    <nav className="mobile-nav">{navigation.map(({ href, short, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''}><Icon size={16} /><span>{short}</span></Link>)}</nav>
  </div>;
}
