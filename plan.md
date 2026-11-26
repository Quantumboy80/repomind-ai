# RepoMind AI — Implementation Plan

## Architecture and approach

RepoMind is a full-stack repository analysis workspace. The web client is Next.js, React, TypeScript and Tailwind CSS, with reusable shadcn-style primitives and React Flow. A separate Python FastAPI service owns GitHub ingestion, parsing, retrieval, AI-provider calls, impact analysis and persistence. PostgreSQL with pgvector is the canonical database. Docker Compose supplies PostgreSQL, API and web services for a reproducible local run; no repository code is executed. The managed Webdev database is MySQL, so it is deliberately not used as a substitute for the specified PostgreSQL/pgvector store.

Public repositories are fetched read-only using GitHub's public API. Ingestion applies file-count/size/path bounds and ignores binaries, generated folders and dependency trees. Tree-sitter extracts supported Python, JavaScript and TypeScript symbols and imports. Chunks and source metadata are persisted, then embedded through an environment-configured OpenAI-compatible provider. Retrieval combines PostgreSQL full-text matching and pgvector similarity. When an AI provider is not configured, the interface identifies demo mode and can show retrieved source evidence, but it does not invent a generated answer.

## Data model

UUID primary keys and UTC timestamps are used throughout. `users` is a minimal ownership-ready identity table (anonymous local/demo owner supported); `repositories` stores canonical GitHub identity, branch, ingest state and summary counters; `repository_files` stores path, language, size, hash and source text once per repository; `code_symbols` stores functions/classes with line ranges and signatures; `code_chunks` stores bounded source passages and line ranges; `embeddings` stores one vector per chunk with model metadata; `dependencies` stores import relationships, resolved target file when known, import text and evidence line; `analysis_jobs` records ingestion lifecycle/errors; `conversations` and `messages` store questions, grounded answers and source citations. Foreign keys cascade only from repository-owned records; unique/index constraints cover GitHub identity, file path, symbol lookup, job status, conversation ordering, full-text search and vector distance.

## API structure

Versioned REST endpoints: `POST /api/repositories` registers and queues ingestion; `POST /api/repositories/{id}/ingest` retries; `GET /api/repositories/{id}` and `/status` report metadata/job progress; paginated `GET /api/repositories/{id}/files` lists paths and `GET /files/{file_id}` returns bounded content; `GET /symbols` filters extracted functions/classes; `GET /graph` returns actual file/import nodes and edges; `POST /impact` returns direct/indirect dependents, paths and explicitly heuristic reasoning; `POST /conversations/{id}/messages` performs hybrid retrieval and provider-grounded Q&A; `GET /conversations` and `/messages` return history. Routes, services, schemas and database access are separated; validation and structured error envelopes apply consistently.

## Project structure

- `frontend/app/`: Next.js routes, workspace shell and page composition.
- `frontend/components/`: sidebar, dashboard, file explorer/code viewer, assistant, graph, impact panel and reusable UI primitives.
- `frontend/lib/`: typed API client and shared view models.
- `backend/app/api/`: FastAPI route definitions and request/response schemas.
- `backend/app/core/`: settings, logging and safe error handling.
- `backend/app/db/`: SQLAlchemy models, session and persistence.
- `backend/app/services/`: GitHub client, bounded ingestion, Tree-sitter parser, chunker, embeddings, hybrid retrieval, provider abstraction, graph and impact analysis.
- `backend/alembic/`: PostgreSQL/pgvector migrations.
- `backend/tests/`: deterministic parser, chunking, graph, API and provider tests.
- Root `docker-compose.yml`, `.env.example`, `README.md`, `API.md`, `docs/architecture.mmd`, `plan.md` and `TODO.md` document operation and constraints.

## Milestones

1. P0: initialize app shell, configuration, database models/migration, Compose and API/client foundations.
2. P1: safely register public repositories, ingest bounded files, parse symbols/imports, persist files/chunks/dependencies, expose status and explorer APIs.
3. P2: create real provider-backed embeddings, hybrid retrieval and repository-grounded answers with verifiable citations; make missing-provider demo behavior explicit.
4. P3: render extracted dependency graph and direct/indirect impact paths with heuristic labels.
5. P4: add focused tests, error/security handling, README, API docs, architecture diagram and verify the documented local workflow.

## Design direction

A refined dark developer-tool workspace: graphite surfaces and high-contrast text keep code readable; restrained blue with a violet secondary accent identifies actions and analysis states; an editorial information hierarchy favors repository evidence over decoration. The layout uses a persistent narrow navigation rail, a repository/status header and a flexible work area with resizable-feeling panels. Motifs are compact file/symbol chips and subtle graph-line accents. Motion is limited to brief state transitions and loading feedback. Typography uses a clean sans-serif for interface copy and a system monospace stack for code. Brand essence: *repository understanding grounded in the code itself*; precise, calm, capable. The RepoMind mark is a small branching-node glyph paired with a purpose-built wordmark treatment.

## Critical risks and constraints

- GitHub unauthenticated API quotas, deleted/renamed repositories and unusually large trees; handle 404/403/rate-limit responses and cap file count, bytes and request concurrency.
- Tree-sitter language grammar/API changes; pin dependencies and cover common Python/JS/TS declarations with fixtures.
- LLM and embedding calls require a user-configured provider key/model; never expose secrets to browser code and never fabricate AI results when absent.
- Platform-managed SQL is MySQL, not PostgreSQL/pgvector; use the requested PostgreSQL in Docker Compose and disclose if Docker/PostgreSQL cannot run in the preview environment.
- Static import resolution and impact analysis are incomplete for dynamic imports/reflection; label heuristic results and preserve evidence paths.
- Repository contents are untrusted prompt data: delimit retrieved content as quoted code, ignore embedded instructions, limit context, validate paths and never execute source.
