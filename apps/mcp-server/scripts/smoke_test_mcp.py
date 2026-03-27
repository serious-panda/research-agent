"""Smoke test for the MCP report server.

Requires the MCP server to be running:
    poetry run python -m src.server

Run with:
    cd apps/mcp-server
    poetry run python scripts/smoke_test_mcp.py
"""

import asyncio
import json
import os
import sys

from langchain_mcp_adapters.client import MultiServerMCPClient

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/sse")


async def _tools() -> dict:
    client = MultiServerMCPClient(
        {"research": {"url": MCP_SERVER_URL, "transport": "sse"}}
    )
    return {t.name: t for t in await client.get_tools()}


async def _call(tool_name: str, **kwargs):
    tools = await _tools()
    if tool_name not in tools:
        raise RuntimeError(f"Tool '{tool_name}' not found")
    raw = await tools[tool_name].ainvoke(kwargs)
    if isinstance(raw, list) and raw and isinstance(raw[0], dict) and "text" in raw[0]:
        parsed = [json.loads(block["text"]) for block in raw if "text" in block]
        return parsed if len(parsed) > 1 else parsed[0]
    return raw


def check(label: str, condition: bool) -> None:
    status = "OK" if condition else "FAIL"
    print(f"  [{status}] {label}")
    if not condition:
        sys.exit(1)


async def main() -> None:
    print("Smoke test: MCP report server")
    print()

    print("1. save_report")
    result = await _call(
        "save_report",
        title="Test Report",
        content="This is a test.",
        sources=["https://example.com"],
    )
    check("returns report_id", "report_id" in result)
    report_id = result["report_id"]
    print(f"     report_id = {report_id}")

    print("2. list_reports")
    reports = await _call("list_reports")
    if isinstance(reports, dict):
        reports = [reports]
    check("returns a list", isinstance(reports, list))
    check("saved report appears in list", any(r["report_id"] == report_id for r in reports))

    print("3. get_report — valid ID")
    report = await _call("get_report", report_id=report_id)
    check("returns title", report.get("title") == "Test Report")
    check("returns content", report.get("content") == "This is a test.")
    check("returns sources", report.get("sources") == ["https://example.com"])

    print("4. get_report — unknown ID")
    missing = await _call("get_report", report_id="does-not-exist")
    check("returns structured error", "error" in missing)

    print()
    print("All checks passed.")


if __name__ == "__main__":
    asyncio.run(main())
