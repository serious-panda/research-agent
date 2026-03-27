# Plan 04: MCP Server Service

> Source PRD: `docs/milestones/web-interface/prd-monorepo-web.md`

## Context

The MCP server currently lives in `src/mcp/server.py` and is started manually via `scripts/start_mcp.sh`. This phase moves it into `apps/mcp-server/` as a self-contained Poetry project with a Dockerfile. Two changes are made to the server itself: `REPORTS_DIR` and port become env-configurable (required for container deployment), and a `/health` HTTP endpoint is added (required for Docker healthchecks in Plan 05).

The server's three tools (`save_report`, `get_report`, `list_reports`) and its JSON-file storage model are unchanged.

## Architectural decisions

- **Service root**: `apps/mcp-server/`
- **Port env var**: `MCP_PORT` (default `8000`)
- **Reports directory env var**: `REPORTS_DIR` (default `./reports` in work mode, `/app/reports` in demo mode)
- **Health endpoint**: plain Starlette route at `GET /health` returning `{"status": "ok"}` — added to the existing SSE app, not a separate process
- **Separate container rationale**: the server holds in-memory report registry; keeping it separate from agent-api means agent-api restarts don't destroy session report state

## What to build

Create `apps/mcp-server/` with the server source, `pyproject.toml`, Dockerfile, and smoke test. Update the two configurable values (`REPORTS_DIR`, port) to read from environment. Add `/health` route.

### Directory result

```
apps/mcp-server/
├── pyproject.toml
├── poetry.lock
├── Dockerfile
├── src/
│   └── server.py          # moved from src/mcp/server.py; env-configured
└── scripts/
    └── smoke_test_mcp.py  # moved from scripts/smoke_test_mcp.py
```

### Changes to `server.py`

```python
import os

REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "./reports"))
REPORTS_DIR.mkdir(exist_ok=True)

# Port from env (FastMCP reads MCP_PORT via settings, or pass to uvicorn directly)
port = int(os.getenv("MCP_PORT", "8000"))
host = os.getenv("MCP_HOST", "0.0.0.0")
```

Add health route to the Starlette SSE app:

```python
from starlette.routing import Route
from starlette.responses import JSONResponse

async def health(request):
    return JSONResponse({"status": "ok"})

# Mount alongside the SSE app
sse_app.routes.append(Route("/health", health))
```

### `apps/mcp-server/pyproject.toml`

```toml
[tool.poetry]
name = "mcp-server"
version = "0.1.0"
description = "MCP report storage service"
authors = []
package-mode = false

[tool.poetry.dependencies]
python = "^3.12"
mcp = { version = "*", extras = ["cli"] }
uvicorn = { version = "*", extras = ["standard"] }
python-dotenv = "*"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

### `apps/mcp-server/Dockerfile`

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN pip install poetry==1.8.3 && poetry config virtualenvs.create false
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-interaction --no-root
COPY src ./src
CMD ["python", "-m", "src.server"]
```

### Running in work mode

```bash
cd apps/mcp-server
poetry run python -m src.server
# or with reload:
poetry run uvicorn src.server:sse_app --port 8000 --reload
```

### Root cleanup

- Delete `src/mcp/` from the repo root
- Delete `scripts/smoke_test_mcp.py` from root `scripts/`
- Delete `scripts/start_mcp.sh`

---

## Acceptance criteria

- [ ] `apps/mcp-server/` exists with `pyproject.toml`, `src/server.py`, `Dockerfile`, `scripts/smoke_test_mcp.py`
- [ ] `cd apps/mcp-server && poetry install` succeeds
- [ ] Server starts cleanly: `poetry run python -m src.server`
- [ ] `curl http://localhost:8000/health` returns `{"status": "ok"}`
- [ ] Smoke test passes: `poetry run python scripts/smoke_test_mcp.py` (save → list → get cycle)
- [ ] `REPORTS_DIR` env var is respected — setting it to a temp directory writes files there
- [ ] `MCP_PORT` env var changes the listen port
- [ ] `src/mcp/` deleted from repo root
- [ ] `scripts/smoke_test_mcp.py` and `scripts/start_mcp.sh` deleted from root `scripts/`
