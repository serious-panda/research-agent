# Research Agent — PRD

## Overview

A local, CLI-driven research assistant that accepts a natural language question, autonomously plans and executes a multi-step web search loop, reflects on gaps, and produces a cited answer. All state is network-backed and ephemeral — nothing survives a full process restart.

---

## Goals

- Demonstrate a production-shaped LangGraph agent with a real reasoning loop (not a single-shot LLM call)
- All inter-component communication over network, even on localhost
- Storage is session-scoped: alive while the stack is running, gone when it stops
- MCP server acts as a proper abstraction layer — the agent has no knowledge of the underlying filesystem

---

## Non-Goals

- No UI — CLI only
- No authentication or multi-user support
- No long-term persistence across sessions
- No streaming output to the terminal (final answer only)

---

## Architecture

### Components

| Component | Technology | Role |
|---|---|---|
| Agent runtime | LangGraph 1.1.x | Defines and executes the reasoning graph |
| LLM | OpenAI GPT-4o (via API key) | Powers all reasoning nodes |
| Search tool | DuckDuckGo (`duckduckgo-search`) | Free, no API key required |
| Graph checkpointer | LangGraph Postgres checkpointer | Persists graph state across node transitions |
| State database | PostgreSQL 16 (Docker, `--rm`) | Backing store for the checkpointer; dies on container stop |
| Report storage | MCP filesystem server (localhost) | Stores final reports; exposed to agent as an abstract tool |

### Communication

All inter-component calls go over localhost network:

- Agent → OpenAI: HTTPS (port 443)
- Agent → PostgreSQL: TCP (port 5432)
- Agent → MCP server: HTTP/SSE (port 8000), using `langchain-mcp-adapters`
- MCP server → filesystem: internal only, not exposed to agent

---

## The Reasoning Graph

The agent is a LangGraph `StateGraph` with the following nodes and edges:

```
START
  │
  ▼
[plan]        — LLM decomposes the question into a list of search queries
  │
  ▼
[search]      — executes the next pending query via DuckDuckGo tool
  │
  ▼
[reflect]     — LLM evaluates results: sufficient? gaps? next query?
  │
  ├── "need more" ──► [search]   (loop, up to N iterations)
  │
  └── "done" ──────► [synthesize]
                          │
                          ▼
                      [save]     — calls MCP tool to persist report
                          │
                          ▼
                        END
```

### Graph State

```python
class ResearchState(TypedDict):
    question:       str
    queries:        list[str]         # planned by [plan], consumed by [search]
    search_results: list[dict]        # accumulated across iterations
    reflections:    list[str]         # gap notes from each [reflect] pass
    iteration:      int               # guards against infinite loops
    final_answer:   str | None
```

### Conditional edge: reflect → search | synthesize

The `reflect` node outputs a structured decision:

```json
{
  "sufficient": false,
  "gap": "No information found on post-2023 developments",
  "next_query": "fusion energy breakthroughs 2024"
}
```

The graph routes to `synthesize` when `sufficient: true` or `iteration >= MAX_ITERATIONS`.

---

## MCP Server

The MCP server runs as a standalone Python process and exposes three tools to the agent:

| Tool | Description |
|---|---|
| `save_report(title, content, sources)` | Persists a research report |
| `get_report(report_id)` | Retrieves a saved report by ID |
| `list_reports()` | Lists all reports saved in this session |

The agent never sees file paths, directory names, or any filesystem detail. The MCP server translates these tool calls into local file writes internally.

Transport: HTTP/SSE on `localhost:8000`, via `langchain-mcp-adapters` (`MultiServerMCPClient`).

---

## Session & Persistence Model

### Within a session

LangGraph uses a `thread_id` to scope checkpoints. Passing the same `thread_id` to a new run resumes from the last saved state — the agent picks up exactly where it left off.

```bash
# First run — starts fresh
python main.py --thread "fusion-q1" "What are recent advances in fusion energy?"

# Same thread — resumes from last checkpoint
python main.py --thread "fusion-q1"
```

### Across sessions

When the Docker container stops, the PostgreSQL database is destroyed (`--rm` flag). All checkpoints are gone. The next run with any `thread_id` starts fresh.

MCP report files on the local filesystem do persist across restarts (they are written by the MCP server process, not the database), but this is incidental — the project treats them as ephemeral by convention.

---

## Startup Sequence

```bash
# 1. Start Postgres (ephemeral — data gone on stop)
docker run --rm \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=research \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Start MCP server
python mcp_server.py
# → listening on localhost:8000

# 3. Run the agent
OPENAI_API_KEY=sk-... python main.py --thread "my-session" "Your question here"
```

---

## Project Structure

```
research_agent/
├── main.py             # CLI entry point; constructs graph, injects thread_id
├── graph.py            # StateGraph definition, nodes, edges, checkpointer setup
├── nodes.py            # plan(), search(), reflect(), synthesize(), save()
├── tools.py            # DuckDuckGo wrapper; MCP client calls
├── mcp_server.py       # MCP server: save/get/list reports (hides filesystem)
├── .env                # OPENAI_API_KEY, POSTGRES_DSN
└── requirements.txt
```

---

## Dependencies

```
langgraph==1.1.3
langgraph-checkpoint-postgres==3.0.5
langchain-mcp-adapters==0.2.2
langchain-openai
duckduckgo-search
psycopg[binary]
python-dotenv
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. OpenAI key. |
| `POSTGRES_DSN` | `postgresql://postgres:secret@localhost:5432/research` | Checkpointer connection string |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | MCP server SSE endpoint |
| `MAX_ITERATIONS` | `5` | Maximum reflect→search loops before forced synthesis |
| `OPENAI_MODEL` | `gpt-4o` | Model used for all reasoning nodes |