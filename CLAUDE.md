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
main.py              # CLI entry point (--thread, question)
src/
├── agent/
│   ├── graph.py     # StateGraph definition, nodes, edges, run_graph()
│   ├── nodes.py     # plan(), search(), reflect(), synthesize(), save()
│   └── state.py     # ResearchState TypedDict
├── mcp/
│   └── server.py    # Standalone MCP server (save/get/list reports)
├── rag/             # RAG pipeline (embeddings, vector store, ingestion)
└── tools.py         # DuckDuckGo wrapper + MCP client calls
scripts/
└── smoke_test_mcp.py  # End-to-end smoke test for the MCP server
infra/
├── docker-compose.yml  # Postgres + Qdrant
└── .env.example        # Config template
docs/plans/
├── agent-graph.md
├── cli-and-session.md
├── mcp-server.md
├── restructure.md
├── rag-pipeline.md
└── hybrid-agent.md
```

## Running the stack

```bash
# 1. Start Postgres + Qdrant
./scripts/start_docker.sh

# 2. Start MCP server (in a separate terminal)
./scripts/start_mcp.sh

# 3. Run the agent
./scripts/run_agent.sh --thread "my-session" "Your question here"
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
