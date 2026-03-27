import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
log = logging.getLogger(__name__)

REPORTS_DIR = Path(os.getenv("REPORTS_DIR", "./reports"))
REPORTS_DIR.mkdir(exist_ok=True)

# In-memory registry for this session: report_id -> {title, path}
_registry: dict[str, dict] = {}

TOOLS = ["save_report", "get_report", "list_reports"]

mcp = FastMCP("research-agent")


@mcp.tool()
def save_report(title: str, content: str, sources: list[str]) -> dict:
    """Persist a research report and return its ID."""
    try:
        report_id = str(uuid.uuid4())
        report = {
            "id": report_id,
            "title": title,
            "content": content,
            "sources": sources,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        path = REPORTS_DIR / f"{report_id}.json"
        path.write_text(json.dumps(report, indent=2))
        _registry[report_id] = {"title": title, "path": str(path)}
        return {"report_id": report_id}
    except Exception as exc:
        log.exception("save_report failed")
        return {"error": str(exc)}


@mcp.tool()
def get_report(report_id: str) -> dict:
    """Retrieve a saved report by ID."""
    try:
        if report_id not in _registry:
            return {"error": f"Report '{report_id}' not found"}
        path = Path(_registry[report_id]["path"])
        return json.loads(path.read_text())
    except Exception as exc:
        log.exception("get_report failed")
        return {"error": str(exc)}


@mcp.tool()
def list_reports() -> list[dict]:
    """List all reports saved in this session."""
    return [{"report_id": rid, "title": meta["title"]} for rid, meta in _registry.items()]


async def health(request):
    return JSONResponse({"status": "ok"})


# ---------------------------------------------------------------------------
# REST API — simple HTTP alternative to MCP-over-SSE for agent-api calls
# ---------------------------------------------------------------------------

async def api_reports(request: Request):
    if request.method == "POST":
        body = await request.json()
        result = save_report(body["title"], body["content"], body.get("sources", []))
        return JSONResponse(result)
    return JSONResponse(list_reports())


async def api_report_detail(request: Request):
    result = get_report(request.path_params["report_id"])
    return JSONResponse(result)


def main() -> None:
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_PORT", "8000"))

    @asynccontextmanager
    async def lifespan(_: Starlette):
        log.info("MCP server ready at http://%s:%s/sse", host, port)
        log.info("Available tools: %s", ", ".join(TOOLS))
        yield

    sse_app = mcp.sse_app()
    sse_app.router.lifespan_context = lifespan
    sse_app.routes.append(Route("/health", health))
    sse_app.routes.append(Route("/api/reports", api_reports, methods=["GET", "POST"]))
    sse_app.routes.append(Route("/api/reports/{report_id}", api_report_detail, methods=["GET"]))

    uvicorn.run(sse_app, host=host, port=port)


if __name__ == "__main__":
    main()
