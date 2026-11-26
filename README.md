# RepoMind AI

RepoMind is a working repository-intelligence MVP: it indexes public GitHub source without executing it, extracts Python/JavaScript/TypeScript symbols and imports with Tree-sitter, stores code metadata in PostgreSQL/pgvector, and exposes cited code retrieval, dependency visualization and heuristic impact analysis.

## Architecture

The frontend is Next.js/React/TypeScript with Tailwind and React Flow. A Python FastAPI service owns public GitHub access, parsing, retrieval, provider calls and SQLAlchemy persistence. LangGraph controls a bounded two-node workflow: hybrid code retrieval, followed by an evidence-only answer step that either uses the configured provider or reports explicit demo evidence. PostgreSQL plus pgvector is the intended durable database. `docker-compose.yml` starts the database, API and web app together. The Manus-managed database service is MySQL, so this project intentionally uses PostgreSQL in Compose rather than silently changing the requested stack.

## Quick start: PostgreSQL and pgvector

Requirements: Docker Engine with Compose, Node.js 22, pnpm 11 and Python 3.12.

```bash
cp .env.example .env
# Optional: edit .env to add LLM_BASE_URL, LLM_API_KEY, and model names.
docker compose up --build
```

Open `http://localhost:3000`. FastAPI's OpenAPI page is at `http://localhost:8000/docs`; health check: `http://localhost:8000/health`. The first API start enables the `vector` extension and creates tables; the Alembic initial migration is in `backend/alembic/versions/0001_initial_schema.py` and can be applied with `docker compose exec api alembic -c alembic.ini upgrade head`.

The Compose example uses local-development database credentials; change them before exposing the services beyond a trusted machine. Durable PostgreSQL data is stored in the `pgdata` volume. No Redis instance is included because MVP indexing is synchronous/background-task based and does not require a separate cache.

## Run without Docker

The frontend and API can run locally against SQLite for a low-friction UI/parse demo. This does **not** provide PostgreSQL/pgvector persistence. To use the production-intended database, start PostgreSQL with pgvector and set `DATABASE_URL` as in `.env.example`.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
pnpm install
DATABASE_URL=sqlite:///./repomind-preview.db bash scripts/dev.sh
```

The local preview fallback persists repository metadata in `repomind-preview.db`, but with no external AI credentials it does not generate answers or embeddings. Configure an OpenAI-compatible provider by setting `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_CHAT_MODEL`, `LLM_EMBEDDING_MODEL`, and `EMBEDDING_DIMENSIONS` in the backend environment. Keep secrets server-side; never set the API key in `NEXT_PUBLIC_*` variables. Embedding model output dimensions must match `EMBEDDING_DIMENSIONS` (default 1536).

Optional `GITHUB_TOKEN` is a read-only token for public GitHub API rate-limit headroom; no write access is required. RepoMind bounds a repository to 250 supported source files, 512 KB per file and 20 MB total by default. Values are adjustable through environment settings.

## Use the app

Paste a public GitHub URL such as `https://github.com/pallets/itsdangerous` in the Repositories view. This small public Python project is the suggested repeatable smoke-test repository. Status and ingestion errors appear in the UI. Use Code Explorer to inspect indexed files and symbols, AI Assistant to retrieve cited evidence, Dependency Graph to inspect real resolved imports, and Impact Analysis to trace import dependents.

Without provider credentials the app shows **Demo retrieval**: lexical retrieval may show real indexed code excerpts and citations, but the assistant explicitly says it did not create an AI-generated explanation. No fake embeddings or AI findings are returned. Configure a provider to enable real stored embeddings and grounded generated answers.

## API summary

See [API.md](API.md) and interactive FastAPI docs at `/docs`. REST endpoints use `/api`: `GET /health`, `GET /meta`, `POST/GET /repositories`, `GET /repositories/{id}/status`, `POST /repositories/{id}/ingest`, paginated `GET /repositories/{id}/files`, `GET /repositories/{id}/files/{file_id}`, `GET /repositories/{id}/symbols`, `GET /repositories/{id}/graph`, `POST /repositories/{id}/impact`, and repository-scoped conversation/message endpoints. Request validation, structured error envelopes and request logs are applied. A bounded in-memory limiter allows five repository registrations per minute, up to 30 other POSTs and 120 reads per minute per client. It resets on restart and is not distributed protection or a substitute for authentication on shared hosting.

## Tests and checks

```bash
PYTHONPATH=backend .venv/bin/python -m pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

The tests exercise URL validation, Tree-sitter Python/TypeScript extraction, chunk line ranges and API request/list/error behavior. GitHub network access is deliberately not required for the automated unit/integration suite. `.github/workflows/ci.yml` runs the core checks.

## Security boundaries

Only public GitHub repositories are accepted. URLs are canonicalized to `github.com`; requests use fixed trusted GitHub API/raw hosts; traversal paths, binary data, ignored generated/dependency directories, oversized files and oversized trees are rejected or skipped. Source is never imported or run. AI prompts delimit repository code as untrusted evidence, not instructions. Provider keys are environment-only and API errors do not expose secret values. The MVP has a local anonymous owner and is not a multi-tenant hosted service; add authentication/authorization before exposing private user data or a shared deployment.

## Known limitations

- GitHub unauthenticated request quotas may interrupt larger ingestions; a read-only token improves rate limits.
- The local SQLite preview and same-origin UI/API routes were exercised, but this sandbox has no Docker, Compose or `psql`; PostgreSQL/pgvector runtime and the Compose stack were therefore not executed here.
- Provider-backed embedding generation and AI answer mode are implemented but were not live-tested because no model provider credentials were configured. Demo mode returns lexical retrieval evidence and citations without inventing an AI explanation.
- Dynamic imports, alias paths, reflection, runtime wiring, external callers and generated code can prevent import resolution; dependency and impact output is heuristic.
- Static text retrieval fallback is lexical. Semantic vector retrieval and generated explanations require a compatible, correctly dimensioned provider.
- BackgroundTasks is suitable for this bounded MVP, not a durable distributed job queue; retries are explicit, and Redis/Celery are intentionally not included.
- User accounts, private repositories, GitHub writes, code execution, multi-tenant isolation and paid services are outside this MVP.
