# research-agent

A local, CLI-driven research assistant. Give it a question — it plans searches, runs them via DuckDuckGo, reflects on gaps, loops until satisfied, then produces a cited answer and saves it as a report.

## How it works

```
question → [plan] → [search] → [reflect] → [search] → ... → [synthesize] → [save] → answer
```

- **plan** — LLM decomposes the question into 3–5 search queries
- **search** — executes the next query via DuckDuckGo
- **reflect** — LLM evaluates results, identifies gaps, decides whether to search more or synthesize
- **synthesize** — LLM writes a cited answer from all accumulated results
- **save** — persists the report via the MCP server

State is checkpointed to Postgres after every node, so interrupted sessions can be resumed.

## Prerequisites

- Python 3.12+
- [Poetry](https://python-poetry.org/)
- Docker (for Postgres)
- OpenAI API key

## Setup

```bash
git clone <repo>
cd research-agent
poetry install
cp .env.example .env   # add your OPENAI_API_KEY
```

`.env` variables:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `POSTGRES_DSN` | `postgresql://<user>:<pwd>@localhost:5432/mydb` | Checkpointer connection |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | MCP server endpoint |
| `MAX_ITERATIONS` | `5` | Max search loops before forced synthesis |
| `OPENAI_MODEL` | `gpt-4o` | Model used for all reasoning nodes |

## Running

Start the three components in order:

```bash
# 1. Postgres (ephemeral — all checkpoints lost on stop)
docker run --rm \
  -e POSTGRES_PASSWORD=<pwd> \
  -e POSTGRES_DB=mydb \
  -p 5432:5432 \
  postgres:16-alpine

# 2. MCP report server
poetry run python src/mcp_server.py

# 3. Agent
poetry run python src/main.py --thread "my-session" "What are recent advances in fusion energy?"
```

The final answer is printed to stdout. Status messages go to stderr.

## Session resumption

Each run is scoped to a `--thread` ID backed by the Postgres checkpointer. If a run is interrupted, re-running with the same `--thread` resumes from the last saved node.

```bash
# Start a session
poetry run python src/main.py --thread "fusion-q1" "What are recent advances in fusion energy?"

# Resume it (while Postgres is still running)
poetry run python src/main.py --thread "fusion-q1" "What are recent advances in fusion energy?"
```

Omit `--thread` to auto-generate an ID — it is printed to stderr so you can note it for later resumption.

## Project structure

```
src/
├── main.py          # CLI entry point
├── graph.py         # LangGraph StateGraph + run_graph()
├── nodes.py         # plan, search, reflect, synthesize, save nodes
├── state.py         # ResearchState TypedDict
├── tools.py         # DuckDuckGo wrapper + MCP client
└── mcp_server.py    # MCP server exposing save/get/list report tools
scripts/
└── smoke_test_mcp.py  # Smoke test for the MCP server
docs/
└── prd.md           # Product requirements
plans/               # Phased implementation plans
```

## Smoke test

With the MCP server running:

```bash
poetry run python scripts/smoke_test_mcp.py
```
