# Project Restructure

## Goal
Split the flat `src/` folder into meaningful sub-packages and add infra scripts to source control.

## Current State
```
src/
├── main.py
├── graph.py
├── nodes.py
├── state.py
├── tools.py
└── mcp_server.py
```

## Target State
```
src/
├── agent/
│   ├── __init__.py
│   ├── graph.py        # moved from src/graph.py
│   ├── nodes.py        # moved from src/nodes.py
│   └── state.py        # moved from src/state.py
├── mcp/
│   ├── __init__.py
│   └── server.py       # moved from src/mcp_server.py
├── rag/
│   ├── __init__.py
│   ├── embeddings.py   # new
│   ├── store.py        # new
│   └── ingest.py       # new
└── tools.py            # stays at src/ level (shared by agent + rag)
infra/
├── docker-compose.yml  # new
└── .env.example        # new
```

## Steps

1. Create package dirs with `__init__.py`:
   - `src/agent/__init__.py`
   - `src/mcp/__init__.py`
   - `src/rag/__init__.py`

2. Move files:
   - `src/graph.py` → `src/agent/graph.py`
   - `src/nodes.py` → `src/agent/nodes.py`
   - `src/state.py` → `src/agent/state.py`
   - `src/mcp_server.py` → `src/mcp/server.py`

3. Update imports in every file:
   | File | Old import | New import |
   |---|---|---|
   | `main.py` | `from src.graph import run_graph` | `from src.agent.graph import run_graph` |
   | `src/agent/graph.py` | `from src.nodes import ...` | `from src.agent.nodes import ...` |
   | `src/agent/graph.py` | `from src.state import ...` | `from src.agent.state import ...` |
   | `src/agent/nodes.py` | `from src.state import ...` | `from src.agent.state import ...` |
   | `src/agent/nodes.py` | `from src.tools import ...` | `from src.tools import ...` (unchanged) |
   | `scripts/smoke_test_mcp.py` | `from src.tools import ...` | unchanged |

4. Update CLAUDE.md:
   - `poetry run python src/mcp_server.py` → `poetry run python -m src.mcp.server`
   - Update structure diagram

5. Create `infra/` directory with `docker-compose.yml` and `.env.example`

## Verification
```bash
# Agent still works
poetry run python main.py "test question"

# MCP server starts
poetry run python -m src.mcp.server

# Smoke test passes
poetry run python scripts/smoke_test_mcp.py
```

## Notes
- `src/tools.py` stays at the `src/` root (not under `agent/`) because `src/rag/store.py` also imports from it
- No pyproject.toml changes needed for this phase
- git mv preserves file history: `git mv src/graph.py src/agent/graph.py`
