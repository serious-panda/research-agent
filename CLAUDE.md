# CLAUDE.md — Repo Root

This file covers repo-wide conventions. Each app and package has its own `CLAUDE.md` with service-specific detail.

## What this repo is

A monorepo for a web-based AI research assistant. A user types a question; the agent classifies it, plans searches, runs web and knowledge-base queries in a loop, reflects on gaps, synthesises a cited answer, and streams live progress back to the browser over SSE.

## Monorepo layout

```
apps/
├── agent-api/       Python — FastAPI + LangGraph agent, SSE streaming (port 8001)
├── mcp-server/      Python — MCP report storage service (port 8000)
├── consumer-web/    TypeScript — Vite + React consumer UI (port 3000 / dev :5173)
└── backoffice/      TypeScript — Vite + React admin stub (port 3001)
packages/
└── rag/             Python — shared embeddings + Qdrant store + doc ingestion
docker-compose.yml   Full-stack wiring (postgres :5432, qdrant :6333, + all apps)
.env.example         Single env file for both demo and work mode
```

## Service integration map

```
browser
  │  POST /api/research  (SSE stream)
  │  GET  /api/reports
  ▼
consumer-web (nginx) ──proxy /api/──► agent-api :8001
                                          │
                          ┌───────────────┼──────────────────┐
                          ▼               ▼                  ▼
                     postgres:5432   qdrant:6333       mcp-server:8000
                    (checkpoints)   (KB vectors)       (report storage)
                                         ▲
                                    packages/rag
                                  (shared library)
```

- **agent-api** is the only service that talks to postgres, qdrant, and mcp-server
- **consumer-web** talks only to agent-api (same-origin, proxied)
- **packages/rag** is a path dependency of agent-api — never imported by other apps directly
- **mcp-server** is stateful per-session (in-memory registry + disk files); agent-api restarts do not destroy reports

## Environment

One `.env` file at the repo root works for both modes:

- **Demo mode** (`docker compose up`) — compose injects Docker hostnames for inter-service URLs; `.env` values for `POSTGRES_DSN`/`QDRANT_URL`/`MCP_SERVER_URL` are ignored by compose
- **Work mode** — services run on localhost; `.env` values for those vars are used directly

Required: `OPENAI_API_KEY`, `POSTGRES_PASSWORD`

## Running the stack

```bash
# Demo (all services in Docker)
docker compose up --build

# Work mode (hot-reload, see each service's CLAUDE.md for per-service commands)
docker compose up postgres qdrant
```

## Key cross-cutting conventions

- **Python services**: Poetry, Python 3.12, `pyproject.toml` per service
- **Frontend apps**: npm, Node 20, `package.json` per app, Vite 5 + React 18 + TypeScript
- **No shared TypeScript packages** — consumer-web and backoffice are independent
- **`packages/rag` is the only shared Python library** — added as `{ path = "../../packages/rag", develop = true }` in agent-api's `pyproject.toml`
- **SSE event format** is the contract between agent-api and consumer-web — see `apps/agent-api/CLAUDE.md` for the schema

## What not to do

- Do not add cross-app Python imports — each app is self-contained except for `packages/rag`
- Do not hardcode URLs in frontend source — all API calls go to `/api/` (same-origin proxy)
- Do not run `git add -A` — `qdrant_storage/`, `reports/`, `.venv/`, `node_modules/` are gitignored but present on disk
