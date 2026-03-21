# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A local, CLI-driven research assistant that accepts a natural language question, autonomously plans and executes a multi-step web search loop, reflects on gaps, and produces a cited answer.

## Stack

| Component | Technology |
|---|---|
| Agent runtime | LangGraph 1.1.x `StateGraph` |
| LLM | OpenAI GPT-4o (`langchain-openai`) |
| Web search | DuckDuckGo (`ddgs`) |
| Checkpointer | LangGraph Postgres checkpointer (`langgraph-checkpoint-postgres`) |
| State database | PostgreSQL 16 (Docker, `--rm` — ephemeral) |
| Report storage | MCP filesystem server (`mcp[cli]`, HTTP/SSE on `localhost:8000`) |
| Dependency manager | Poetry |

## Structure

```
src/
├── main.py          # CLI entry point (--thread, question)
├── graph.py         # StateGraph definition, nodes, edges, run_graph()
├── nodes.py         # plan(), search(), reflect(), synthesize(), save()
├── state.py         # ResearchState TypedDict
├── tools.py         # DuckDuckGo wrapper + MCP client calls
└── mcp_server.py    # Standalone MCP server (save/get/list reports)
scripts/
└── smoke_test_mcp.py  # End-to-end smoke test for the MCP server
plans/
├── agent-graph.md
├── cli-and-session.md
└── mcp-server.md
```

## Running the stack

```bash
# 1. Start Postgres (ephemeral — data gone on stop)
docker run --rm \
  -e POSTGRES_PASSWORD=<pwd> \
  -e POSTGRES_DB=mydb \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Start MCP server
poetry run python src/mcp_server.py

# 3. Run the agent
OPENAI_API_KEY=sk-... poetry run python src/main.py --thread "my-session" "Your question here"
```

## Configuration

All config via `.env` or environment variables:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `POSTGRES_DSN` | `postgresql://<user>:<pwd>@localhost:5432/mydb` | Checkpointer connection |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | MCP server SSE endpoint |
| `MAX_ITERATIONS` | `5` | Max reflect→search loops before forced synthesis |
| `OPENAI_MODEL` | `gpt-4o` | Model for all reasoning nodes |

## Session resumption

Passing the same `--thread` ID while Postgres is still running resumes from the last checkpoint. Omitting `--thread` auto-generates a UUID and prints it to stderr so it can be reused.

## Smoke test

```bash
# With MCP server running:
poetry run python scripts/smoke_test_mcp.py
```
