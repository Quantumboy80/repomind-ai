# RepoMind REST API

Base path: `/api`. FastAPI interactive schema: `/docs`.

## Health and configuration

- `GET /health` — API liveness.
- `GET /meta` — AI provider readiness, model names when configured, demo-mode flag and database mode. No secrets are returned.

## Repositories and files

- `POST /repositories` — JSON `{ "github_url": "https://github.com/owner/repo" }`; creates or re-queues an analysis job and returns repository metadata.
- `GET /repositories` — repository list, newest activity first.
- `GET /repositories/{repository_id}` — repository metadata.
- `GET /repositories/{repository_id}/status` — current status, progress, stage and safe error text.
- `POST /repositories/{repository_id}/ingest` — retry indexing.
- `GET /repositories/{repository_id}/files?page=1&page_size=50&q=...` — paginated indexed paths.
- `GET /repositories/{repository_id}/files/{file_id}` — indexed source and extracted symbol line ranges.
- `GET /repositories/{repository_id}/symbols?page=1&page_size=100&q=...` — extracted functions, methods and classes.

Registration accepts only public GitHub `owner/repository` URLs, not GitHub subpaths. File ingestion skips unsupported formats, binary content, generated/dependency directories, files over `MAX_FILE_BYTES`, repositories beyond `MAX_REPO_FILES`, and total source beyond `MAX_TOTAL_BYTES`.

## Intelligence endpoints

- `GET /repositories/{repository_id}/graph` — file nodes and extracted import edges. Only resolved edges are returned in the rendered graph.
- `POST /repositories/{repository_id}/impact` — JSON `{ "file_id": "..." }`; returns direct and transitive statically resolved importers plus dependency paths and explicit heuristic limitations.
- `GET /repositories/{repository_id}/conversations` — history list.
- `POST /repositories/{repository_id}/conversations` — JSON `{ "title": "..." }`; creates a conversation.
- `GET /conversations/{conversation_id}/messages` — persisted user/assistant messages and citations.
- `POST /conversations/{conversation_id}/messages` — JSON `{ "question": "..." }`; retrieves indexed code first, then calls the configured chat provider. The response contains exact source path/line references and retrieved evidence. Without a provider, it explicitly reports demo retrieval instead of manufacturing a generated answer.

## Errors

Invalid URLs, missing repositories/files/conversations, GitHub quota/network errors and validation errors return a non-2xx status with FastAPI detail information. Application exceptions are logged server-side; generic unexpected errors use a safe `internal_error` envelope. Do not treat static import analysis as a guarantee of runtime behavior.
