# Plan: MCP Report Server

> Source PRD: docs/prd.md — MCP Server section

## Architectural decisions

- **Transport**: HTTP/SSE on `localhost:8000`; client uses `langchain-mcp-adapters` (`MultiServerMCPClient`)
- **Endpoint**: `http://localhost:8000/sse`
- **Tools exposed**: `save_report(title, content, sources)`, `get_report(report_id)`, `list_reports()`
- **Storage**: Local filesystem (internal to server process — agent never sees paths)
- **Scope**: Session-scoped by convention; files persist on disk but treated as ephemeral

---

## Phase 1: Minimal MCP server with save and list

**User stories**: Agent can persist a final report; agent can list reports saved in the current session

### What to build

A standalone Python process that starts an MCP server over HTTP/SSE on `localhost:8000`. Implement `save_report` (writes a file, returns a report ID) and `list_reports` (returns all report IDs and titles in the current session). The server generates report IDs internally; the agent never interacts with file paths.

### Acceptance criteria

- [ ] Server starts and listens on `localhost:8000/sse`
- [ ] `save_report(title, content, sources)` persists a report and returns a `report_id`
- [ ] `list_reports()` returns all reports saved since the server started
- [ ] Agent-facing tool signatures contain no filesystem details
- [ ] Server can be started with `python src/mcp_server.py`

---

## Phase 2: Report retrieval

**User stories**: Agent (or operator) can retrieve a previously saved report by ID within the same session

### What to build

Add `get_report(report_id)` to the MCP server. It looks up the report by ID and returns its full content and sources. Returns a clear error if the ID does not exist.

### Acceptance criteria

- [x] `get_report(report_id)` returns `title`, `content`, and `sources` for a valid ID
- [x] Returns a structured error (not an exception) for unknown IDs
- [x] Round-trip verified: save a report, retrieve it by the returned ID, content matches

---

## Phase 3: Robustness and transport validation

**User stories**: Agent reliably connects to the MCP server; failures are surfaced clearly

### What to build

Validate the HTTP/SSE transport end-to-end using `langchain-mcp-adapters`. Add startup logging so the operator can confirm the server is ready. Handle malformed tool inputs gracefully (missing fields, wrong types) without crashing the server process.

### Acceptance criteria

- [ ] Server logs a ready message (URL + available tools) on startup
- [ ] `MultiServerMCPClient` can connect and enumerate tools without errors
- [ ] Malformed inputs return structured error responses; server process stays alive
- [ ] All three tools callable from a live MCP client in a smoke test
