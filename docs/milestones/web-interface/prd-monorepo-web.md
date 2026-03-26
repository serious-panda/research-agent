# PRD: Monorepo Web Application

## Overview

Convert the CLI research agent into a monorepo web application. A React consumer UI submits questions to a FastAPI agent service which streams real-time progress via SSE as the LangGraph pipeline runs. The architecture mirrors real-world service decomposition: each component is a separately deployable unit with its own codebase, dependencies, and container.

The structure is a scaffold for production work — get the boundaries right now so each component can evolve independently.

---

## Goals

1. A browser UI where a user types a question and receives a streamed, cited answer
2. A production-mirroring service architecture (separate containers per concern)
3. Two local run modes: full-Docker demo and hybrid work mode for fast iteration
4. Clean monorepo layout that supports adding more apps without restructuring

---

## Non-Goals

- Authentication / authorisation (no login required)
- Production deployment (this is local-only for now)
- Backoffice functionality (structure placeholder only)
- Mobile responsiveness (desktop-first is fine)

---

## Run Modes

### Demo Mode

```bash
cp .env.example .env  # fill in OPENAI_API_KEY and POSTGRES_PASSWORD
docker compose up --build
open http://localhost:3000
```

Everything runs in containers. One command. No local Python or Node installs required beyond Docker. Used for demos, onboarding, and CI validation.

### Work Mode

```bash
# Terminal 1 — databases only
docker compose up postgres qdrant

# Terminal 2 — MCP server
cd apps/mcp-server && poetry run uvicorn src.server:app --port 8000 --reload

# Terminal 3 — agent API
cd apps/agent-api && poetry run uvicorn main:app --port 8001 --reload

# Terminal 4 — consumer web (hot reload)
cd apps/consumer-web && npm run dev   # Vite dev server on :5173
```

Services connect to `localhost` for databases. Hot reload on every file save. Direct debugger attach. No image rebuilds between code changes. Used for all active development.

The `.env` file works for both modes without modification. In work mode, `POSTGRES_DSN` points to `localhost:5432` (where the Docker-mapped port lands).

---

## Repository Layout

```
research-agent/                          # monorepo root
├── .env.example                         # single env template for all services
├── .env                                 # gitignored
├── .gitignore
├── docker-compose.yml                   # all 6 services + databases
├── README.md
├── CLAUDE.md
├── qdrant_storage/                      # gitignored; Qdrant persistent volume
├── reports/                             # gitignored; mcp-server JSON files
│
├── apps/
│   ├── consumer-web/                    # React consumer UI
│   ├── backoffice/                      # stub — future admin UI
│   ├── agent-api/                       # FastAPI service wrapping LangGraph
│   └── mcp-server/                      # FastMCP report storage service
│
├── packages/
│   └── rag/                             # shared Python RAG library
│
└── docs/
    ├── prd.md                           # original PRD
    ├── prd-monorepo-web.md              # this document
    └── plans/                           # implementation plans
```

---

## Services

### `apps/agent-api` — Agent API

**Role**: Core computation service. Accepts research questions, runs the LangGraph pipeline, streams progress and results back to the caller.

**Technology**: Python 3.12, FastAPI, uvicorn, LangGraph 1.1.x, OpenAI GPT-4o

**Port**: `8001`

**External dependencies**:
- PostgreSQL — LangGraph checkpoint persistence
- Qdrant — RAG vector search (via `packages/rag`)
- MCP server — report storage (HTTP/SSE)
- OpenAI API — all LLM calls
- DuckDuckGo — web search

**Internal structure**:
```
apps/agent-api/
├── main.py                  # FastAPI app, routes, CORS, SSE streaming
├── pyproject.toml           # depends on rag-pipeline as path dep
├── Dockerfile               # build context = repo root (needs packages/rag)
└── src/
    ├── agent/
    │   ├── graph.py         # run_graph() + stream_graph() async generator
    │   ├── nodes.py         # all agent nodes (classify, plan, search, reflect, synthesize, save)
    │   └── state.py         # ResearchState TypedDict
    └── tools.py             # web_search + kb_search @tools, async MCP client
```

**Environment variables** (all required unless defaulted):

| Variable | Default | Source in work mode |
|---|---|---|
| `OPENAI_API_KEY` | — | `.env` |
| `OPENAI_MODEL` | `gpt-4o` | `.env` |
| `POSTGRES_DSN` | — | `.env` (localhost in work mode) |
| `QDRANT_URL` | `http://localhost:6333` | `.env` (localhost in work mode) |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | `.env` (localhost in work mode) |
| `MAX_ITERATIONS` | `5` | `.env` |
| `LOG_LEVEL` | `INFO` | `.env` |

In demo mode, `docker-compose.yml` overrides `QDRANT_URL` and `MCP_SERVER_URL` to use Docker service hostnames.

---

### `apps/mcp-server` — Report Storage Service

**Role**: Persists research reports as JSON files. Exposes them via the Model Context Protocol (MCP) over HTTP/SSE. The agent-api calls this after synthesising an answer.

**Technology**: Python 3.12, FastMCP, Starlette, uvicorn

**Port**: `8000`

**External dependencies**: filesystem only (volume-mounted `reports/` directory)

**Internal structure**:
```
apps/mcp-server/
├── src/server.py            # FastMCP app: save_report, get_report, list_reports
├── pyproject.toml
├── Dockerfile
└── scripts/
    └── smoke_test_mcp.py    # integration test: save → list → get cycle
```

**Environment variables**:

| Variable | Default | Description |
|---|---|---|
| `MCP_HOST` | `0.0.0.0` | Bind host |
| `MCP_PORT` | `8000` | Bind port |
| `REPORTS_DIR` | `./reports` | Directory for JSON report files |

In work mode `REPORTS_DIR` defaults to `./reports` relative to the project root. In demo mode the compose file bind-mounts `./reports` into the container at `/app/reports`.

**Note on separation**: The MCP server is a separate container (not embedded in agent-api) because:
1. It holds in-memory report state — restarting agent-api for a code change must not lose it
2. `asyncio.run()` (the current MCP client pattern) cannot be used inside FastAPI's event loop; keeping them separate forces correct async boundaries
3. Matches real-world architecture where storage is a separate service

---

### `apps/consumer-web` — Consumer UI

**Role**: Browser application. User types a question, sees real-time progress as the agent runs, reads the final cited answer.

**Technology**: Vite 5, React 18, TypeScript, react-markdown (one dep for Markdown rendering)

**Port**: `3000` (nginx in demo mode), `5173` (Vite dev server in work mode)

**Internal structure**:
```
apps/consumer-web/
├── index.html
├── vite.config.ts           # dev proxy: /api/ → localhost:8001
├── package.json
├── nginx.conf               # proxy /api/ → agent-api:8001 (demo mode)
├── Dockerfile               # 2-stage: node build → nginx serve
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts             # SseEvent union type, NodeDonePayload
    ├── api/
    │   └── research.ts      # postResearch(question, threadId?) — fetch SSE
    ├── hooks/
    │   └── useResearch.ts   # all state + SSE connection lifecycle
    └── components/
        ├── QuestionForm.tsx
        ├── ProgressFeed.tsx
        ├── AnswerCard.tsx
        └── SourceList.tsx
```

**API proxy**:
- In work mode: `vite.config.ts` proxies `/api/*` to `http://localhost:8001` so no CORS issues
- In demo mode: `nginx.conf` proxies `/api/*` to `http://agent-api:8001`

In both modes the browser always calls the same origin. No `CORS` or hardcoded API URLs in the frontend build.

---

### `apps/backoffice` — Backoffice UI (stub)

**Role**: Placeholder for future admin interface (report browsing, ingestion management, usage stats).

**Technology**: Vite + React + TypeScript (same stack as consumer-web)

**Port**: `3001`

**Contents**: single `App.tsx` rendering a "Coming soon" message. Full Dockerfile so the build pipeline is exercised. No functionality.

---

### `packages/rag` — Shared RAG Library

**Role**: Reusable Python package for embedding, vector storage, and document ingestion. Used by `agent-api` at query time (kb_search) and by the ingest CLI at setup time.

**Technology**: Python 3.12, fastembed, qdrant-client, langchain-text-splitters

**Not a service** — it is a library installed as a local Poetry path dependency.

**Internal structure**:
```
packages/rag/
├── pyproject.toml           # name = "rag-pipeline", package-mode = true
├── rag/
│   ├── __init__.py
│   ├── embeddings.py        # get_embeddings() singleton via @lru_cache
│   ├── store.py             # upsert_documents(), search_documents()
│   └── ingest.py            # ingest_react_docs()
└── scripts/
    └── ingest_docs.py       # CLI: --source react_docs --version 19 <repo_root>
```

**In `agent-api/pyproject.toml`**:
```toml
rag-pipeline = { path = "../../packages/rag", develop = true }
```

**In the `agent-api` Dockerfile**: `pip install /packages/rag` runs before `poetry install` to avoid the relative path dep issue in containers.

---

## API Contract (`agent-api`)

### `POST /api/research`

Submit a research question. Returns a streaming SSE response.

**Request**:
```json
{
  "question": "What are the tradeoffs of React Server Components?",
  "thread_id": "optional-uuid-to-resume-a-session"
}
```

**Response**: `Content-Type: text/event-stream`

The HTTP connection stays open for the duration of the run. The client reads events as they arrive using `fetch` + `ReadableStream` (not `EventSource`, which is GET-only).

Each line is formatted as `data: <json>\n\n`.

**SSE event types**:

```typescript
// Node started executing (emitted before the LLM call)
{ event: "node_start", node: NodeName, iteration: number | null }

// Node finished executing
{ event: "node_done",  node: NodeName, iteration: number | null, payload: NodePayload }

// Final result — always the last event on success
{ event: "done",  answer: string, sources: string[], thread_id: string }

// Unrecoverable error
{ event: "error", message: string }
```

**`NodeName`** union: `"classify" | "answer" | "plan" | "search" | "reflect" | "synthesize" | "save"`

**`NodePayload`** per node:

| Node | Payload fields |
|---|---|
| `classify` | `{ kind: "research" \| "conversational" }` |
| `answer` | `{}` |
| `plan` | `{ queries: string[] }` |
| `search` | `{ result_count: number, tools_called: string[] }` |
| `reflect` | `{ sufficient: boolean, gap: string }` |
| `synthesize` | `{}` |
| `save` | `{ report_id: string }` |

**Full research example** (events in order):
```
data: {"event":"node_start","node":"classify","iteration":null}
data: {"event":"node_done","node":"classify","iteration":null,"payload":{"kind":"research"}}
data: {"event":"node_start","node":"plan","iteration":null}
data: {"event":"node_done","node":"plan","iteration":null,"payload":{"queries":["React Server Components tradeoffs","RSC vs client components performance","RSC streaming and suspense"]}}
data: {"event":"node_start","node":"search","iteration":1}
data: {"event":"node_done","node":"search","iteration":1,"payload":{"result_count":5,"tools_called":["web_search","kb_search"]}}
data: {"event":"node_start","node":"reflect","iteration":1}
data: {"event":"node_done","node":"reflect","iteration":1,"payload":{"sufficient":false,"gap":"Need more detail on bundle size impact"}}
data: {"event":"node_start","node":"search","iteration":2}
data: {"event":"node_done","node":"search","iteration":2,"payload":{"result_count":5,"tools_called":["web_search"]}}
data: {"event":"node_start","node":"reflect","iteration":2}
data: {"event":"node_done","node":"reflect","iteration":2,"payload":{"sufficient":true,"gap":""}}
data: {"event":"node_start","node":"synthesize","iteration":null}
data: {"event":"node_done","node":"synthesize","iteration":null,"payload":{}}
data: {"event":"node_start","node":"save","iteration":null}
data: {"event":"node_done","node":"save","iteration":null,"payload":{"report_id":"a3f1..."}}
data: {"event":"done","answer":"React Server Components offer...","sources":["https://..."],"thread_id":"b2e4..."}
```

**Conversational example**:
```
data: {"event":"node_done","node":"classify","iteration":null,"payload":{"kind":"conversational"}}
data: {"event":"node_done","node":"answer","iteration":null,"payload":{}}
data: {"event":"done","answer":"I'm doing well, thanks for asking!","sources":[],"thread_id":"c9f2..."}
```

---

### `GET /api/research/{thread_id}`

Retrieve a completed run. Useful for sharing a link or reloading a previous result.

**Response** (200):
```json
{
  "thread_id": "b2e4...",
  "question": "...",
  "answer": "...",
  "sources": ["https://..."],
  "status": "completed"
}
```

Returns `404` if thread_id is unknown, `202` if still running.

---

### `GET /api/reports` and `GET /api/reports/{id}`

Thin proxies to the MCP server's `list_reports` and `get_report` tools. Allow the consumer UI (and future backoffice) to list and read saved reports without direct MCP server access.

---

### `GET /health`

Returns `200 OK` with `{"status": "ok"}`. Used by Docker healthchecks and load balancers.

---

## Consumer UI — UX Flow

### States

```
idle      → user sees question input, nothing else
running   → input disabled, ProgressFeed shows live node events
done      → ProgressFeed complete, AnswerCard + SourceList visible, "New question" button
error     → error message + "Try again" button
```

### Component behaviour

**`QuestionForm`**
- `<textarea>` with submit on Enter (Shift+Enter for newline)
- "Research" button
- Disabled while `status === "running"`

**`ProgressFeed`**
- Appears as soon as the first SSE event arrives
- Each node gets a row: icon (spinner → checkmark) + human-readable label + elapsed time
- Human labels: `classify → "Classifying"`, `plan → "Planning queries"`, `search → "Searching (pass N)"`, `reflect → "Evaluating"`, `synthesize → "Writing answer"`, `save → "Saving report"`
- `reflect` row shows the gap text when `sufficient === false`
- `search` row shows which tools were called (`web + kb`, `web only`, `kb only`)

**`AnswerCard`**
- Renders `answer` as Markdown via `react-markdown`
- Displayed only after `event === "done"`

**`SourceList`**
- Numbered list of unique URLs from `sources`
- Numbers correspond to `[N]` citations in the answer

**`useResearch` hook** — internal contract:
```typescript
interface UseResearchResult {
  status: "idle" | "running" | "done" | "error";
  events: SseEvent[];      // accumulated for ProgressFeed
  answer: string | null;
  sources: string[];
  threadId: string | null;
  error: string | null;
  submit: (question: string) => void;
  reset: () => void;
}
```

The hook uses `fetch` with the response body read as a `ReadableStream`. It manually parses SSE lines (`data: ` prefix, `\n\n` delimiter). On unmount or `reset()` it aborts the reader.

---

## Docker Compose

All 6 services with health checks. Application services depend on databases being healthy before starting.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      retries: 10

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: ["./qdrant_storage:/qdrant/storage:z"]
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:6333/healthz || exit 1"]
      interval: 5s
      retries: 10

  mcp-server:
    build: { context: apps/mcp-server }
    ports: ["8000:8000"]
    volumes: ["./reports:/app/reports"]
    environment:
      REPORTS_DIR: /app/reports
      MCP_PORT: 8000
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8000/health || exit 1"]
      interval: 5s
      retries: 10

  agent-api:
    build: { context: ., dockerfile: apps/agent-api/Dockerfile }
    ports: ["8001:8001"]
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o}
      POSTGRES_DSN: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      QDRANT_URL: http://qdrant:6333
      MCP_SERVER_URL: http://mcp-server:8000/sse
      MAX_ITERATIONS: ${MAX_ITERATIONS:-5}
    depends_on:
      postgres:   { condition: service_healthy }
      qdrant:     { condition: service_healthy }
      mcp-server: { condition: service_healthy }
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8001/health || exit 1"]
      interval: 10s
      retries: 5

  consumer-web:
    build: { context: apps/consumer-web }
    ports: ["3000:80"]
    depends_on:
      agent-api: { condition: service_healthy }

  backoffice:
    build: { context: apps/backoffice }
    ports: ["3001:80"]
```

**Key design decisions**:
- `POSTGRES_DSN`, `QDRANT_URL`, `MCP_SERVER_URL` are constructed inside compose using Docker service hostnames — not in `.env`. This prevents the common mistake of committing localhost URLs that break inside Docker.
- `./reports` is bind-mounted so reports survive `mcp-server` restarts.
- `agent-api` Dockerfile uses the repo root as build context so it can `COPY packages/rag`.

---

## `.env.example` (root)

```bash
# Required
OPENAI_API_KEY=

# Postgres
POSTGRES_USER=research
POSTGRES_PASSWORD=
POSTGRES_DB=research

# Work mode — services connect to these directly (Docker maps these ports to localhost)
POSTGRES_DSN=postgresql://research:${POSTGRES_PASSWORD}@localhost:5432/research
QDRANT_URL=http://localhost:6333
MCP_SERVER_URL=http://localhost:8000/sse

# Optional
OPENAI_MODEL=gpt-4o
MAX_ITERATIONS=5
LOG_LEVEL=INFO
```

In work mode all variables are used as-is. In demo mode, `docker-compose.yml` overrides `POSTGRES_DSN`, `QDRANT_URL`, and `MCP_SERVER_URL` inline so the same `.env` works for both modes without editing.

---

## Migration Map (Current → New)

| Current path | New path | Change |
|---|---|---|
| `src/agent/graph.py` | `apps/agent-api/src/agent/graph.py` | Add `stream_graph()` async generator using `astream_events` |
| `src/agent/nodes.py` | `apps/agent-api/src/agent/nodes.py` | `save` node becomes `async def`; `from src.rag` → `from rag` |
| `src/agent/state.py` | `apps/agent-api/src/agent/state.py` | Unchanged |
| `src/tools.py` | `apps/agent-api/src/tools.py` | MCP calls made async; `from src.rag` → `from rag` |
| `src/mcp/server.py` | `apps/mcp-server/src/server.py` | `REPORTS_DIR` + port from env; add `/health` endpoint |
| `src/rag/embeddings.py` | `packages/rag/rag/embeddings.py` | Unchanged |
| `src/rag/store.py` | `packages/rag/rag/store.py` | Unchanged |
| `src/rag/ingest.py` | `packages/rag/rag/ingest.py` | Unchanged |
| `scripts/ingest_docs.py` | `packages/rag/scripts/ingest_docs.py` | Updated import |
| `scripts/smoke_test_mcp.py` | `apps/mcp-server/scripts/smoke_test_mcp.py` | Unchanged |
| `infra/docker-compose.yml` | `docker-compose.yml` (root) | Full rewrite |
| `infra/.env.example` | `.env.example` (root) | Expanded |
| `main.py` | `apps/agent-api/scripts/run_cli.py` | Dev-only CLI |

---

## Implementation Sequence

1. `packages/rag` — move files, add `pyproject.toml` (`package-mode = true`), verify `poetry install`
2. `apps/agent-api` — move agent + tools, fix imports, make MCP calls async, verify `run_graph()` via dev CLI
3. `apps/agent-api/main.py` — FastAPI app, `stream_graph()`, SSE endpoint; smoke-test with `curl`
4. `apps/mcp-server` — move + env-configure + `/health`; verify smoke test passes
5. `docker-compose.yml` — all 6 services + health checks; `docker compose up --build` all healthy
6. `apps/consumer-web` — Vite scaffold, `useResearch` hook, all components, nginx proxy
7. `apps/backoffice` — stub only
8. End-to-end: browser → question → live progress feed → cited answer

---

## Key Technical Risks

| Risk | Mitigation |
|---|---|
| `asyncio.run()` inside FastAPI event loop raises `RuntimeError` | Make all MCP client calls `async def` + `await`; LangGraph supports async nodes natively |
| `astream_events` API differs between LangGraph versions | Project is pinned to LangGraph 1.1.3; test `stream_graph()` in isolation before wiring to FastAPI |
| `packages/rag` path dep breaks inside Docker container | Dockerfile does `pip install /packages/rag` directly, bypassing Poetry's relative path resolution |
| SSE connection dropped mid-run on client reload | `thread_id` is returned in the `done` event; `GET /api/research/{id}` allows result recovery after reconnect |
| Qdrant `_collection_ready` flag stale across work-mode restarts | Flag is module-level; each `uvicorn --reload` restart resets it cleanly |
