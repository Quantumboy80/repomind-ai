'use client';
import { FormEvent, useState } from 'react';
import { ArrowRight, Github, LoaderCircle } from 'lucide-react';
import { api, Repository } from '@/lib/api';

export default function RepoConnect({ onAdded }: { onAdded: () => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const repo = await api<Repository>('/repositories', { method: 'POST', body: JSON.stringify({ github_url: url.trim() }) });
      setUrl(''); setMessage(`${repo.github_full_name} added. Ingestion is starting.`); await onAdded();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add repository.'); }
    finally { setBusy(false); }
  }
  return <div className="connect-box"><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11, color: '#bec7dc', fontSize: 12 }}><Github size={15} />Add a public GitHub repository</div><form onSubmit={submit} className="form-row"><input className="input" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/owner/repository" aria-label="Public GitHub repository URL" /><button className="btn primary" disabled={busy || url.trim().length < 12}>{busy ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}{busy ? 'Adding' : 'Analyze repo'}</button></form><div className="card-note" style={{ marginTop: 9 }}>Read-only public access · Python, JavaScript and TypeScript · Source code is never executed</div>{error && <div className="error-box">{error}</div>}{message && <div className="success-box" style={{ marginTop: 10 }}>{message}</div>}</div>;
}
