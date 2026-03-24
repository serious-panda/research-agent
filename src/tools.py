import asyncio
import json
import os

from ddgs import DDGS
from httpx import ConnectError, ConnectTimeout
from langchain_mcp_adapters.client import MultiServerMCPClient

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/sse")


# ---------------------------------------------------------------------------
# Web search
# ---------------------------------------------------------------------------

def search_web(query: str, max_results: int = 5) -> list[dict]:
    """Execute a DuckDuckGo text search and return result dicts."""
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))


# ---------------------------------------------------------------------------
# MCP report tools
# ---------------------------------------------------------------------------

async def _mcp_tools() -> dict:
    """Connect to the MCP server and return a name→tool mapping.

    Raises RuntimeError with a clear message if the server is unreachable.
    """
    try:
        client = MultiServerMCPClient(
            {"research": {"url": MCP_SERVER_URL, "transport": "sse"}}
        )
        return {t.name: t for t in await client.get_tools()}
    except BaseException as exc:
        # anyio wraps transport errors in ExceptionGroup; unwrap one level
        cause = exc.exceptions[0] if isinstance(exc, ExceptionGroup) else exc
        if isinstance(cause, (ConnectError, ConnectTimeout, OSError)):
            raise RuntimeError(
                f"MCP server unreachable at {MCP_SERVER_URL}. "
                "Start it with: poetry run python -m src.mcp.server"
            ) from cause
        raise


async def _call(tool_name: str, **kwargs):
    tools = await _mcp_tools()
    if tool_name not in tools:
        raise RuntimeError(f"MCP tool '{tool_name}' not found on server {MCP_SERVER_URL}")
    raw = await tools[tool_name].ainvoke(kwargs)
    # langchain-mcp-adapters returns content blocks: [{"type": "text", "text": "<json>"}]
    # List-returning tools produce one block per item; scalar tools produce one block.
    if isinstance(raw, list) and raw and isinstance(raw[0], dict) and "text" in raw[0]:
        parsed = [json.loads(block["text"]) for block in raw if "text" in block]
        return parsed if len(parsed) > 1 else parsed[0]
    return raw


def save_report(title: str, content: str, sources: list[str]) -> dict:
    """Persist a research report via the MCP server."""
    return asyncio.run(_call("save_report", title=title, content=content, sources=sources))


def get_report(report_id: str) -> dict:
    """Retrieve a saved report by ID via the MCP server."""
    return asyncio.run(_call("get_report", report_id=report_id))


def list_reports() -> list[dict]:
    """List all reports saved in the current MCP server session."""
    result = asyncio.run(_call("list_reports"))
    # _call unwraps single-item lists to a plain dict; re-wrap for consistent return type
    if isinstance(result, dict):
        return [result]
    return result or []
