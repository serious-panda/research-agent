# Plan 03: Agent API HTTP Layer

> Source PRD: `docs/prd-monorepo-web.md`

## Context

The agent runs in `apps/agent-api/` and produces answers via CLI (Plan 02). This phase adds the FastAPI HTTP layer: a `POST /api/research` endpoint that streams SSE events as the LangGraph graph runs, plus supporting read endpoints and a health check. This is the core API contract the consumer UI will consume in Plan 06.

## Architectural decisions

- **Framework**: FastAPI + uvicorn
- **SSE transport**: `StreamingResponse` with `media_type="text/event-stream"`; each event is `data: <json>\n\n`
- **Graph execution**: `graph.astream_events(..., version="v2")` — LangGraph's async event stream; filtered by `metadata["langgraph_node"]` for node-level events
- **Checkpointer**: `AsyncPostgresSaver` (async variant) replaces `PostgresSaver` in `stream_graph()`; sync `PostgresSaver` is kept in `run_graph()` for the CLI
- **CORS**: allow all origins in development (tightened in production)
- **Endpoints**:
  - `POST /api/research` → SSE stream
  - `GET /api/research/{thread_id}` → completed run lookup
  - `GET /api/reports` → proxy `list_reports` from MCP server
  - `GET /api/reports/{id}` → proxy `get_report` from MCP server
  - `GET /health` → liveness probe

## What to build

Add `main.py` to `apps/agent-api/` as the FastAPI application. Add `stream_graph()` async generator to `graph.py`. Wire the SSE endpoint to emit node-level events as the graph progresses. Smoke-test with `curl`.

### `stream_graph()` in `graph.py`

An async generator that opens an `AsyncPostgresSaver`, builds the compiled graph, and iterates `astream_events`. Yields structured dicts that the SSE endpoint serialises.

```python
async def stream_graph(question: str, thread_id: str) -> AsyncIterator[dict]:
    config = {"configurable": {"thread_id": thread_id}}
    async with AsyncPostgresSaver.from_conn_string(POSTGRES_DSN) as checkpointer:
        await checkpointer.setup()
        graph = _build_compiled_graph(checkpointer)
        initial = { ... }  # same as run_graph()

        current_node = None
        async for event in graph.astream_events(initial, config=config, version="v2"):
            kind = event["event"]
            node = event.get("metadata", {}).get("langgraph_node")
            if not node:
                continue

            if kind == "on_chain_start" and node != current_node:
                current_node = node
                yield {"event": "node_start", "node": node, "iteration": ...}

            elif kind == "on_chain_end" and node == current_node:
                yield {"event": "node_done", "node": node, "iteration": ..., "payload": _node_payload(node, event["data"])}

        final = await graph.aget_state(config)
        yield {
            "event": "done",
            "answer": final.values.get("final_answer", ""),
            "sources": [...],
            "thread_id": thread_id,
        }
```

### SSE event shapes (from PRD)

| Event | Fields |
|---|---|
| `node_start` | `event`, `node`, `iteration` |
| `node_done` | `event`, `node`, `iteration`, `payload` |
| `done` | `event`, `answer`, `sources`, `thread_id` |
| `error` | `event`, `message` |

Node payloads:

| Node | Payload |
|---|---|
| `classify` | `{ kind }` |
| `plan` | `{ queries }` |
| `search` | `{ result_count, tools_called }` |
| `reflect` | `{ sufficient, gap }` |
| `save` | `{ report_id }` |
| `answer`, `synthesize` | `{}` |

### `apps/agent-api/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json, uuid

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/research")
async def research(body: ResearchRequest):
    thread_id = body.thread_id or str(uuid.uuid4())
    async def generate():
        try:
            async for event in stream_graph(body.question, thread_id):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/api/research/{thread_id}")
async def get_research(thread_id: str):
    # retrieve from Postgres checkpointer
    ...

@app.get("/api/reports")
async def list_reports_route():
    return await list_reports()

@app.get("/api/reports/{report_id}")
async def get_report_route(report_id: str):
    return await get_report(report_id)
```

### `pyproject.toml` additions

```toml
fastapi = "^0.111"
uvicorn = { version = "*", extras = ["standard"] }
```

### Running in work mode

```bash
cd apps/agent-api
poetry run uvicorn main:app --port 8001 --reload
```

---

## Acceptance criteria

- [ ] `apps/agent-api/main.py` exists with all 5 routes
- [ ] `stream_graph()` added to `graph.py` as async generator using `astream_events`
- [ ] `AsyncPostgresSaver` used in `stream_graph()`; sync `PostgresSaver` retained in `run_graph()`
- [ ] `GET /health` returns `{"status": "ok"}`
- [ ] `curl -N -X POST http://localhost:8001/api/research -H "Content-Type: application/json" -d '{"question":"What is useMemo?"}'` streams `data:` lines to the terminal
- [ ] Final `data:` line contains `"event":"done"` with a non-empty `answer` field
- [ ] Conversational input (`"question":"How are you?"`) streams `classify` → `answer` → `done` with no search events
- [ ] `GET /api/reports` proxies to MCP server successfully (MCP server must be running)
- [ ] `GET /health` returns 200 (used by Docker healthcheck in Plan 05)
