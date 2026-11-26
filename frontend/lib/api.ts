export type Repository = {
  id: string; github_full_name: string; github_url: string; description: string | null;
  default_branch: string; stars: number; language: string | null; status: string;
  file_count: number; symbol_count: number; last_analyzed_at: string | null; created_at: string;
};
export type RepoFile = { id: string; path: string; language: string; size_bytes: number; sha?: string | null };
export type FileDetail = RepoFile & { content: string; symbols: { id: string; kind: string; name: string; signature: string | null; start_line: number; end_line: number }[] };
export type Meta = { ai_ready: boolean; chat_model: string | null; embedding_model: string | null; demo_mode: boolean; database_mode: string };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/backend${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('The analysis API is not reachable. Start the FastAPI service and check the configured port.', 0);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail?.message || payload?.error?.message || payload?.detail || `Request failed (${response.status})`;
    throw new ApiError(typeof detail === 'string' ? detail : 'The request could not be completed.', response.status);
  }
  return payload as T;
}

export async function fetchAllFiles(repositoryId: string): Promise<RepoFile[]> {
  const first = await api<{ items: RepoFile[]; total: number; page_size: number }>(`/repositories/${repositoryId}/files?page=1&page_size=100`);
  const pages = Math.ceil(first.total / first.page_size);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
    api<{ items: RepoFile[] }>(`/repositories/${repositoryId}/files?page=${index + 2}&page_size=100`),
  ));
  return [first.items, ...rest.map((page) => page.items)].flat();
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Not analyzed yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
