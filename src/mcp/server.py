import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.applications import Starlette

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
log = logging.getLogger(__name__)

REPORTS_DIR = Path("reports")
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


def main() -> None:
    host = mcp.settings.host
    port = mcp.settings.port

    @asynccontextmanager
    async def lifespan(_: Starlette):
        log.info("MCP server ready at http://%s:%s/sse", host, port)
        log.info("Available tools: %s", ", ".join(TOOLS))
        yield

    sse_app = mcp.sse_app()
    sse_app.router.lifespan_context = lifespan

    uvicorn.run(sse_app, host=host, port=port)


if __name__ == "__main__":
    main()
