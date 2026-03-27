# research-agent

A web-based AI research assistant. Ask a question — the agent classifies it, plans web and knowledge-base searches, reflects on gaps, loops until satisfied, then streams a cited answer live to the browser.

## How it works

```
browser → POST /api/research (SSE stream)
               │
         agent-api (FastAPI + LangGraph)
               │
    ┌──────────┼──────────────┐
    ▼          ▼              ▼
postgres    qdrant        mcp-server
(sessions) (KB vectors) (report files)
               ▲
          packages/rag
```

### Agent graph

```
[classify] ──conversational──► [answer] ──────────────────────► END
    │
  research
    ▼
[plan] ──► [search] ──► [reflect] ──sufficient──► [synthesize] ──► [save] ──► END
               ▲____________insufficient + iterations < MAX
```

Each graph node emits an SSE event (`node_start` / `node_done`) that the browser renders as a live progress row. The final `done` event carries the answer and source URLs.

## Services

| Service | Stack | Port | Role |
|---|---|---|---|
| `agent-api` | FastAPI + LangGraph | 8001 | Runs the agent, streams SSE, proxies reports |
| `mcp-server` | FastMCP + Starlette | 8000 | Persists research reports (JSON files) |
| `consumer-web` | Vite + React | 3000 | User-facing research UI |
| `backoffice` | Vite + React | 3001 | Admin UI (stub) |
| `postgres` | PostgreSQL 16 | 5432 | LangGraph checkpoint storage |
| `qdrant` | Qdrant | 6333 | Vector store for knowledge base |

## Quick start (demo mode)

```bash
git clone <repo> && cd research-agent
cp .env.example .env          # fill in OPENAI_API_KEY and POSTGRES_PASSWORD
docker compose up --build
open http://localhost:3000
```

## Work mode (hot-reload)

Run each service natively so file edits apply immediately.

```bash
# Terminal 1 — databases
docker compose up postgres qdrant

# Terminal 2 — MCP server
cd apps/mcp-server && poetry install
poetry run python -m src.server

# Terminal 3 — agent API (uvicorn --reload)
cd apps/agent-api && poetry install
poetry run uvicorn main:app --port 8001 --reload

# Terminal 4 — consumer web (Vite HMR)
cd apps/consumer-web && npm install
npm run dev   # http://localhost:5173
```

## Knowledge base

Ingest documentation into Qdrant so the agent can search it alongside the web:

```bash
cd packages/rag && poetry install
poetry run python scripts/ingest_docs.py --source react_docs --version 19 ~/path/to/react.dev
```

Once ingested, the agent automatically queries the KB for domain-specific questions (e.g. React APIs) and the web for everything else. Citations appear as `[KB-N]` in answers.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | **Required** |
| `POSTGRES_PASSWORD` | — | **Required** |
| `POSTGRES_USER` | `research` | Postgres user |
| `POSTGRES_DB` | `research` | Postgres database |
| `POSTGRES_DSN` | `postgresql://research:…@localhost:5432/research` | Work mode connection |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | MCP server SSE endpoint |
| `OPENAI_MODEL` | `gpt-4o` | LLM model |
| `MAX_ITERATIONS` | `5` | Max search→reflect loops |
| `LOG_LEVEL` | `INFO` | `DEBUG` for full LangGraph traces |

## MCP smoke test

```bash
cd apps/mcp-server
poetry run python scripts/smoke_test_mcp.py
```
