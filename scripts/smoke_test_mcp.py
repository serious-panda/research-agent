"""Smoke test for the MCP report server.

Requires the MCP server to be running:
    poetry run python src/mcp_server.py

Run with:
    poetry run python scripts/smoke_test_mcp.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.tools import get_report, list_reports, save_report


def check(label: str, condition: bool) -> None:
    status = "OK" if condition else "FAIL"
    print(f"  [{status}] {label}")
    if not condition:
        sys.exit(1)


def main() -> None:
    print("Smoke test: MCP report server")
    print()

    print("1. save_report")
    result = save_report(
        title="Test Report",
        content="This is a test.",
        sources=["https://example.com"],
    )
    check("returns report_id", "report_id" in result)
    report_id = result["report_id"]
    print(f"     report_id = {report_id}")

    print("2. list_reports")
    reports = list_reports()
    check("returns a list", isinstance(reports, list))
    check("saved report appears in list", any(r["report_id"] == report_id for r in reports))

    print("3. get_report — valid ID")
    report = get_report(report_id)
    check("returns title", report.get("title") == "Test Report")
    check("returns content", report.get("content") == "This is a test.")
    check("returns sources", report.get("sources") == ["https://example.com"])

    print("4. get_report — unknown ID")
    missing = get_report("does-not-exist")
    check("returns structured error", "error" in missing)

    print()
    print("All checks passed.")


if __name__ == "__main__":
    main()
