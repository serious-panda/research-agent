# Plan 02: Agent API Service Migration

> Source PRD: `docs/prd-monorepo-web.md`

## Context

All agent code currently lives in `src/agent/`, `src/tools.py`, and `main.py` as a single flat Python project. This phase moves everything into `apps/agent-api/` as its own Poetry project, fixes all import paths to use the `rag` package from Plan 01, and converts the synchronous MCP client calls to async (required before FastAPI can be added in Plan 03). A dev CLI script replaces `main.py` for local invocation during development. The agent must produce a full answer via CLI after this phase — no HTTP layer yet.

## Architectural decisions

- **Service root**: `apps/agent-api/`
- **Python package layout**: source lives in `apps/agent-api/src/`; `main.py` at service root is the FastAPI entry point (Plan 03); CLI lives at `apps/agent-api/scripts/run_cli.py`
- **RAG dependency**: `rag-pipeline = { path = "../../packages/rag", develop = true }` in `pyproject.toml`
- **Async MCP pattern**: `_call()` becomes a plain coroutine; all three wrappers (`save_report`, `get_report`, `list_reports`) become `async def`; the `save` node in `nodes.py` becomes `async def save()`; LangGraph handles async nodes natively
- **Import root**: `from src.agent.xxx` and `from src.rag.xxx` become `from agent.xxx` and `from rag.xxx` — the `src/` directory is on `sys.path` via the `packages` declaration in `pyproject.toml`
- **Postgres checkpointer**: `AsyncPostgresSaver` will be used in Plan 03; for now `PostgresSaver` (sync) is retained to keep the CLI working

## What to build

Create `apps/agent-api/` as a new Poetry project. Move the agent source files, update all imports, and make MCP calls async. Verify the CLI still produces a full research answer.

### Directory result

```
apps/agent-api/
├── pyproject.toml
├── poetry.lock
├── Dockerfile                   # stub — fully written in Plan 05
└── src/
    ├── agent/
    │   ├── __init__.py
    │   ├── graph.py             # run_graph() retained; stream_graph() added in Plan 03
    │   ├── nodes.py             # save() made async; imports updated
    │   └── state.py             # unchanged
    └── tools.py                 # MCP calls made async; rag import updated
scripts/
    └── run_cli.py               # replaces root main.py
```

### `apps/agent-api/pyproject.toml`

```toml
[tool.poetry]
name = "agent-api"
version = "0.1.0"
description = "Research agent API service"
authors = []
packages = [{ include = "agent", from = "src" }]

[tool.poetry.dependencies]
python = "^3.12"
rag-pipeline = { path = "../../packages/rag", develop = true }
langgraph = "1.1.3"
langgraph-checkpoint-postgres = "3.0.5"
langchain-mcp-adapters = "0.2.2"
langchain-openai = "*"
ddgs = "*"
psycopg = { version = "*", extras = ["binary"] }
python-dotenv = "*"
mcp = { version = "*", extras = ["cli"] }

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

### Import changes

| Old import | New import |
|---|---|
| `from src.rag.store import search_documents` | `from rag.store import search_documents` |
| `from src.agent.state import ResearchState` | `from agent.state import ResearchState` |
| `from src.agent.nodes import ...` | `from agent.nodes import ...` |
| `from src.tools import ...` | `from tools import ...` |

### Async MCP conversion (`src/tools.py`)

`_call()` loses `asyncio.run()` — it becomes a plain `async def`. The three public wrappers become:

```python
async def save_report(title: str, content: str, sources: list[str]) -> dict:
    return await _call("save_report", title=title, content=content, sources=sources)

async def get_report(report_id: str) -> dict:
    return await _call("get_report", report_id=report_id)

async def list_reports() -> list[dict]:
    result = await _call("list_reports")
    if isinstance(result, dict):
        return [result]
    return result or []
```

### Async `save` node (`src/agent/nodes.py`)

```python
async def save(state: ResearchState) -> dict:
    logger.info("[save] saving report title=%r", state["question"])
    sources = [r["href"] for r in state["search_results"] if r.get("href")]
    result = await save_report(
        title=state["question"],
        content=state["final_answer"],
        sources=sources,
    )
    logger.info("[save] report_id=%s", result.get("report_id"))
    print(f"Report saved: {result.get('report_id')}")
    return {}
```

### Dev CLI (`scripts/run_cli.py`)

Mirrors root `main.py` exactly — same argparse, same `run_graph()` call, same thread ID logic. Run from the `apps/agent-api/` directory:

```bash
cd apps/agent-api
poetry run python scripts/run_cli.py "What is useMemo in React?"
```

### Root `src/` and `main.py` removal

Once verified: delete `src/agent/`, `src/mcp/`, `src/tools.py`, `src/__init__.py`, and `main.py` from the repo root. `src/rag/` was already deleted in Plan 01.

---

## Acceptance criteria

- [ ] `apps/agent-api/` exists with `pyproject.toml`, `src/agent/`, `src/tools.py`, `scripts/run_cli.py`
- [ ] `cd apps/agent-api && poetry install` succeeds (resolves `rag-pipeline` path dep)
- [ ] `poetry run python -c "from agent.graph import run_graph; from tools import SEARCH_TOOLS; print('OK')"` prints `OK`
- [ ] `poetry run python scripts/run_cli.py "What is useMemo in React?"` produces a full cited answer (MCP server must be running)
- [ ] All `asyncio.run()` calls removed from `tools.py`
- [ ] `async def save()` in `nodes.py` with `await save_report()`
- [ ] Root `src/` directory deleted
- [ ] Root `main.py` deleted
- [ ] `scripts/smoke_test_mcp.py` deleted from root `scripts/` (moves to `apps/mcp-server/` in Plan 04)
