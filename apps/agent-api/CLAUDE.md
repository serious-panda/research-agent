# CLAUDE.md — apps/agent-api

FastAPI service that runs the LangGraph research agent and streams results to the browser over SSE.

## Layout

```
apps/agent-api/
├── main.py              # FastAPI app — 5 routes, CORS, SSE endpoint
├── pyproject.toml
└── src/
    ├── agent/
    │   ├── graph.py     # StateGraph definition; run_graph() and stream_graph()
    │   ├── nodes.py     # All graph nodes: classify, answer, plan, search, reflect, synthesize, save
    │   └── state.py     # ResearchState TypedDict
    └── tools.py         # web_search + kb_search @tools; async MCP client wrappers
```

`src/` is on `sys.path` at startup (set in `main.py`), so `agent.*` and `tools` are importable without a package prefix.

## Graph topology

```
START → [classify] ──conversational──► [answer] → END
              │
           research
              ▼
         [plan] → [search] → [reflect] ──sufficient──► [synthesize] → [save] → END
                      ▲____________insufficient + iteration < MAX_ITERATIONS
```

- `classify` sets `state["kind"]` — routes to `answer` or `plan`
- `search` calls `llm.bind_tools(SEARCH_TOOLS)` — LLM picks `web_search`, `kb_search`, or both
- `reflect` increments `state["iteration"]`; routing checks `MAX_ITERATIONS`
- `save` is `async def` — calls `await save_report()` over MCP

## Two graph execution modes

| Function | Checkpointer | Used by |
|---|---|---|
| `run_graph(question, thread_id)` | `PostgresSaver` (sync) | `scripts/run_cli.py` |
| `stream_graph(question, thread_id)` | `AsyncPostgresSaver` (async) | `POST /api/research` |

Do not swap these — the sync checkpointer blocks the event loop if used inside an async context.

## SSE event schema

Every `data:` line is a JSON object:

| `event` field | Other fields | When |
|---|---|---|
| `node_start` | `node`, `iteration` | Graph node begins |
| `node_done` | `node`, `iteration`, `payload` | Graph node completes |
| `done` | `answer`, `sources`, `thread_id` | Graph finished |
| `error` | `message` | Exception during streaming |

Node payloads: `classify→{kind}`, `plan→{queries}`, `search→{result_count, tools_called}`, `reflect→{sufficient, gap}`, `save→{report_id}`, others `{}`.

## HTTP routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `POST` | `/api/research` | SSE stream — body: `{question, thread_id?}` |
| `GET` | `/api/research/{thread_id}` | Fetch completed run from Postgres |
| `GET` | `/api/reports` | Proxy `list_reports` from MCP server |
| `GET` | `/api/reports/{id}` | Proxy `get_report` from MCP server |

## Dependencies

- `rag-pipeline` — path dep from `packages/rag`; imported as `from rag.store import search_documents` inside `kb_search`
- MCP server — called async via `langchain-mcp-adapters`; `MCP_SERVER_URL` env var
- Postgres — `POSTGRES_DSN` env var; checkpointer DDL is auto-applied on startup

## Dev commands

```bash
poetry install
poetry run uvicorn main:app --port 8001 --reload

# CLI (no HTTP server needed)
poetry run python scripts/run_cli.py "What is useMemo in React?"
```

## Key env vars

| Variable | Default |
|---|---|
| `OPENAI_API_KEY` | — (required) |
| `POSTGRES_DSN` | `postgresql://…@localhost:5432/research` |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` |
| `QDRANT_URL` | `http://localhost:6333` |
| `OPENAI_MODEL` | `gpt-4o` |
| `MAX_ITERATIONS` | `5` |

## Gotchas

- `tools.py` is in `src/` but is **not** declared as a package in `pyproject.toml` — it's importable only because `src/` is on `sys.path`
- `save` node is `async def` — LangGraph handles async nodes natively; do not wrap it in `asyncio.run()`
- `stream_graph` always starts fresh (no resume logic) — the CLI `run_graph` handles resume
