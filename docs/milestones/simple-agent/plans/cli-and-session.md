# Plan: CLI & Session Management

> Source PRD: docs/prd.md — Session & Persistence Model, Startup Sequence, Configuration sections

## Architectural decisions

- **Entry point**: `python main.py --thread <thread_id> "<question>"`
- **Config**: `.env` file loaded via `python-dotenv`; env vars: `OPENAI_API_KEY`, `POSTGRES_DSN`, `MCP_SERVER_URL`, `MAX_ITERATIONS`, `OPENAI_MODEL`
- **Session scoping**: LangGraph `thread_id` passed as checkpointer config; same ID resumes, new ID starts fresh
- **MCP client**: `langchain-mcp-adapters` `MultiServerMCPClient` connecting to `MCP_SERVER_URL`
- **Search wrapper**: DuckDuckGo via `duckduckgo-search`, wrapped as a LangChain tool
- **Output**: Final answer printed to stdout only; no streaming

---

## Phase 1: CLI entry point with question and thread ID

**User stories**: User runs the agent from the terminal with a natural language question and a thread ID; final answer is printed to stdout

### What to build

Implement `main.py`. Parse `--thread` and the positional question argument. Load `.env` config. Construct the graph (imported from `graph.py`), inject the `thread_id` as checkpointer config, invoke the graph, and print `final_answer` to stdout when complete.

### Acceptance criteria

- [ ] `python main.py --thread "my-session" "Some question"` runs without error
- [ ] `OPENAI_API_KEY` missing → clear error message, non-zero exit
- [ ] `final_answer` is printed to stdout on success
- [ ] No intermediate node output or streaming — only the final answer

---

## Phase 2: DuckDuckGo and MCP tool wrappers

**User stories**: Agent can execute web searches and call MCP report tools through a clean tool interface

### What to build

Implement `tools.py`. Wrap `duckduckgo-search` as a callable that the `search` node can invoke with a query string and receive a list of result dicts. Implement the MCP client setup using `MultiServerMCPClient` connecting to `MCP_SERVER_URL`; expose `save_report`, `get_report`, and `list_reports` as callables for the graph nodes.

### Acceptance criteria

- [ ] DuckDuckGo wrapper returns a list of result dicts for a given query string
- [ ] MCP client connects to `MCP_SERVER_URL` and enumerates available tools on startup
- [ ] `save_report`, `get_report`, `list_reports` callable from graph nodes via the wrapper
- [ ] MCP server unavailable → connection error surfaced clearly, not silently swallowed

---

## Phase 3: Session resumption

**User stories**: User can resume a previous research session by passing the same thread ID; a new thread ID always starts fresh

### What to build

Validate session resumption end-to-end. Running `main.py` with an existing `thread_id` (while Postgres is still running) resumes from the last checkpoint. Running with a new `thread_id` starts from `plan`. Add a startup message indicating whether the session is new or resumed.

### Acceptance criteria

- [ ] Same `thread_id` + running Postgres → resumes from last checkpoint
- [ ] New `thread_id` → starts from `plan` node regardless of other existing threads
- [ ] Startup message indicates "resuming" or "starting new session"
- [ ] `--thread` omitted → auto-generates a unique thread ID (does not crash)

---

## Phase 4: Full startup sequence validation

**User stories**: Operator can bring up the full stack and run the agent following the documented startup steps

### What to build

Validate the complete three-step startup sequence (Postgres via Docker, MCP server, then agent). Document any ordering constraints. Add preflight checks to `main.py`: verify Postgres reachability and MCP server reachability before invoking the graph, with actionable error messages if either is unreachable.

### Acceptance criteria

- [ ] Following the startup sequence in the PRD produces a working agent run end-to-end
- [ ] Postgres unreachable → clear error with connection string shown, non-zero exit
- [ ] MCP server unreachable → clear error with URL shown, non-zero exit
- [ ] `requirements.txt` installs all dependencies without conflicts (`pip install -r requirements.txt`)
