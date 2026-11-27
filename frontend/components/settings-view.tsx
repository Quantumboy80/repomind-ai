'use client';

import { CheckCircle2, CircleAlert, Database, KeyRound, Shield, TerminalSquare } from 'lucide-react';
import { Meta } from '@/lib/api';

export type Appearance = 'obsidian-blue' | 'graphite-violet' | 'midnight-neutral';
const appearances: { id: Appearance; name: string; note: string; colors: string[] }[] = [
  { id: 'obsidian-blue', name: 'Obsidian Blue', note: 'Cool blue signal on a deep graphite field.', colors: ['#0b1018', '#8298ff', '#c8f36b'] },
  { id: 'graphite-violet', name: 'Graphite Violet', note: 'Quiet violet accents with warm neutral surfaces.', colors: ['#121018', '#b69be8', '#b9d5bf'] },
  { id: 'midnight-neutral', name: 'Midnight Neutral', note: 'Low-chroma surfaces with crisp silver contrast.', colors: ['#0d1012', '#b6c3cc', '#b8c6bf'] },
];

export default function SettingsView({ meta, appearance, onAppearanceChange }: { meta: Meta | null; appearance: Appearance; onAppearanceChange: (value: Appearance) => void }) {
  return <div style={{ display: 'grid', gap: 14 }}>
    <section className="card card-pad appearance-panel">
      <div className="card-head"><div><div className="card-title">Appearance</div><div className="card-note">Choose a stable workspace palette. Your preference is saved on this device.</div></div><span className="appearance-mark" aria-hidden="true">Aa</span></div>
      <fieldset className="appearance-options">
        <legend className="sr-only">Color theme</legend>
        {appearances.map((option) => <label key={option.id} className={`appearance-option ${appearance === option.id ? 'is-selected selection-ink' : ''}`}>
          <input type="radio" name="repomind-appearance" value={option.id} checked={appearance === option.id} onChange={() => onAppearanceChange(option.id)} />
          <span className="appearance-swatches" aria-hidden="true">{option.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>
          <span className="appearance-copy"><strong>{option.name}</strong><small>{option.note}</small></span>
          {appearance === option.id && <CheckCircle2 className="appearance-check" size={16} aria-hidden="true" />}
        </label>)}
      </fieldset>
    </section>
    <section className="card card-pad"><div className="card-head"><div><div className="card-title">Runtime configuration</div><div className="card-note">Status only. Secrets are never sent to the browser.</div></div><Shield size={16} color="var(--blue)" /></div><div className="setting-row"><div><div className="setting-name">AI provider</div><div className="setting-desc">OpenAI-compatible chat and embeddings; configured on the backend only.</div></div><span className={`badge ${meta?.ai_ready ? 'success' : ''}`}>{meta?.ai_ready ? 'Configured' : 'Demo retrieval mode'}</span></div><div className="setting-row"><div><div className="setting-name">Database</div><div className="setting-desc">PostgreSQL/pgvector is used by Docker Compose. Local preview may use SQLite when DATABASE_URL is omitted.</div></div><span className="badge">{meta?.database_mode || 'Loading'}</span></div><div className="setting-row"><div><div className="setting-name">Repository access</div><div className="setting-desc">Public GitHub API, read-only; optional token raises rate limits. No write permissions requested.</div></div><span className="badge success">Read-only</span></div><div className="setting-row"><div><div className="setting-name">Source execution</div><div className="setting-desc">Repository files are treated as untrusted data and are never executed.</div></div><span className="badge success">Disabled</span></div></section>
    <section className="card card-pad"><div className="card-head"><div><div className="card-title">Configure providers locally</div><div className="card-note">Copy .env.example to .env and add credentials only on the backend host.</div></div><KeyRound size={16} color="var(--violet)" /></div><pre className="code-view" style={{ border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', maxHeight: 'none' }}>{`LLM_BASE_URL=https://your-openai-compatible-endpoint/v1\nLLM_API_KEY=replace-with-your-secret\nLLM_CHAT_MODEL=your-chat-model\nLLM_EMBEDDING_MODEL=text-embedding-3-small\nEMBEDDING_DIMENSIONS=1536\nDATABASE_URL=postgresql+psycopg://repomind:repomind@db:5432/repomind`}</pre><div className="card-note" style={{ marginTop: 9 }}><CircleAlert size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} />No generated AI answer or vector is fabricated when credentials are absent.</div></section>
    <section className="card card-pad"><div className="card-title" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><TerminalSquare size={15} color="var(--blue)" />Runtime status</div><div className="setting-row"><div><div className="setting-name">Embedding model</div><div className="setting-desc">Used for pgvector storage and hybrid similarity retrieval.</div></div><span className="badge">{meta?.embedding_model || 'Not configured'}</span></div><div className="setting-row"><div><div className="setting-name">Chat model</div><div className="setting-desc">Used only to synthesize answers over retrieved code context.</div></div><span className="badge">{meta?.chat_model || 'Not configured'}</span></div></section>
  </div>;
}
