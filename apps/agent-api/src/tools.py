import logging
import os

import httpx
from ddgs import DDGS
from langchain_core.tools import tool

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/sse")
# REST base — strip the /sse suffix used by the MCP protocol endpoint
_MCP_BASE = MCP_SERVER_URL.removesuffix("/sse")

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Web search
# ---------------------------------------------------------------------------

def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))


@tool
def web_search(query: str) -> list[dict]:
    """Search the web for current events, news, or general knowledge not in the knowledge base."""
    return _ddg_search(query, max_results=5)


def _kb_search(query: str, top_k: int = 5) -> list[dict]:
    try:
        from rag.store import search_documents
        return search_documents(query, top_k=top_k)
    except Exception as exc:
        logger.warning("kb_search failed: %s", exc)
        return []


@tool
def kb_search(query: str) -> list[dict]:
    """Search the local knowledge base of ingested documents.
    Use for domain-specific questions about topics covered in the knowledge base
    (e.g. React docs, internal architecture docs)."""
    return _kb_search(query, top_k=5)


SEARCH_TOOLS = [web_search, kb_search]


# ---------------------------------------------------------------------------
# MCP report tools — plain HTTP calls to mcp-server REST endpoints
# ---------------------------------------------------------------------------

async def _call(method: str, path: str, body: dict | None = None):
    url = f"{_MCP_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                resp = await client.get(url)
            else:
                resp = await client.post(url, json=body)
            resp.raise_for_status()
            return resp.json()
    except (httpx.ConnectError, httpx.ConnectTimeout, OSError) as exc:
        raise RuntimeError(
            f"MCP server unreachable at {_MCP_BASE}. "
            "Start it with: poetry run python -m src.server"
        ) from exc


async def save_report(title: str, content: str, sources: list[str]) -> dict:
    return await _call("POST", "/api/reports", {"title": title, "content": content, "sources": sources})


async def get_report(report_id: str) -> dict:
    return await _call("GET", f"/api/reports/{report_id}")


async def list_reports() -> list[dict]:
    result = await _call("GET", "/api/reports")
    if isinstance(result, dict):
        return [result]
    return result or []
