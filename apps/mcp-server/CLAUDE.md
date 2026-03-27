# CLAUDE.md — apps/mcp-server

Standalone MCP (Model Context Protocol) server that persists research reports as JSON files and exposes them as tools over SSE.

## Layout

```
apps/mcp-server/
├── src/
│   └── server.py          # All server logic — FastMCP tools + Starlette SSE app
├── scripts/
│   └── smoke_test_mcp.py  # End-to-end test (save → list → get)
└── pyproject.toml
```

## What it does

Exposes three MCP tools over HTTP/SSE at `/sse`:

| Tool | Args | Returns |
|---|---|---|
| `save_report` | `title`, `content`, `sources` | `{report_id}` |
| `get_report` | `report_id` | full report dict |
| `list_reports` | — | `[{report_id, title}, …]` |

Also exposes `GET /health → {"status": "ok"}` on the same Starlette app (required for Docker healthcheck).

## Storage model

- **In-memory registry**: `_registry: dict[str, dict]` maps `report_id → {title, path}`. Survives agent-api restarts but is lost if the mcp-server process restarts.
- **On-disk files**: each report is written to `REPORTS_DIR/{report_id}.json`. The Docker volume mount at `./reports:/app/reports` makes these survive container restarts.

`REPORTS_DIR` defaults to `./reports` (work mode) or `/app/reports` (set via env in Docker).

## Starlette app structure

```python
sse_app = mcp.sse_app()               # FastMCP's built-in SSE Starlette app
sse_app.routes.append(Route("/health", health))  # health added manually
uvicorn.run(sse_app, host=host, port=port)
```

Do not split `/health` into a separate process — it must share the Starlette app so a single port handles both.

## Dev commands

```bash
poetry install
poetry run python -m src.server

# Smoke test (server must be running)
poetry run python scripts/smoke_test_mcp.py
```

## Env vars

| Variable | Default | Description |
|---|---|---|
| `REPORTS_DIR` | `./reports` | Directory for JSON report files |
| `MCP_PORT` | `8000` | Listen port |
| `MCP_HOST` | `0.0.0.0` | Listen host |

## Gotchas

- The in-memory `_registry` is lost on process restart — `list_reports` and `get_report` will return nothing for reports saved in a previous session, even if the JSON files still exist on disk. The disk files are the source of truth for durability, but there is no reconciliation on startup.
- agent-api connects to this server via `langchain-mcp-adapters`; do not change the tool names (`save_report`, `get_report`, `list_reports`) without updating `apps/agent-api/src/tools.py`.
