# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A local, CLI-driven research assistant that accepts a natural language question, classifies it, and either responds directly (conversational) or autonomously plans and executes a multi-step hybrid search loop (web + local knowledge base), reflects on gaps, and produces a cited answer.

## Stack

| Component | Technology |
|---|---|
| Agent runtime | LangGraph 1.1.x `StateGraph` |
| LLM | OpenAI GPT-4o (`langchain-openai`) |
| Web search | DuckDuckGo (`ddgs`) |
| KB search | Qdrant vector store via `qdrant-client` |
| Embeddings | `fastembed` + `BAAI/bge-small-en-v1.5` (local, 384 dims) |
| Checkpointer | LangGraph Postgres checkpointer (`langgraph-checkpoint-postgres`) |
| State database | PostgreSQL 16 (Docker, ephemeral) |
| Report storage | MCP filesystem server (`mcp[cli]`, HTTP/SSE on `localhost:8000`) |
| Dependency manager | Poetry |

## Structure

```
main.py              # CLI entry point (--thread, question); configures logging
src/
├── agent/
│   ├── graph.py     # StateGraph definition, nodes, edges, run_graph()
│   ├── nodes.py     # classify, answer, plan, search, reflect, synthesize, save
│   └── state.py     # ResearchState TypedDict
├── mcp/
│   └── server.py    # Standalone MCP server (save/get/list reports)
├── rag/
│   ├── embeddings.py  # fastembed singleton loader
│   ├── ingest.py      # ingest_react_docs() — walk repo, chunk, upsert with metadata
│   └── store.py       # upsert_documents(), search_documents() against Qdrant
└── tools.py           # web_search + kb_search @tools, SEARCH_TOOLS list, MCP client
scripts/
├── ingest_docs.py     # CLI: ingest docs into Qdrant (--source, --version, repo_root)
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

## Graph topology

```
START → [classify] ──conversational──→ [answer] → END
              │
           research
              ↓
         [plan] → [search] → [reflect] ──sufficient──→ [synthesize] → [save] → END
                      ↑____________insufficient + iterations < MAX_ITERATIONS
```

- `classify` routes on `state["kind"]`: `"research"` → `plan`, `"conversational"` → `answer`
- `search` calls `llm.bind_tools(SEARCH_TOOLS)` — LLM decides which of `web_search`/`kb_search` to call
- `synthesize` renders separate web and KB result blocks; cites as `[N]` and `[KB-N]`

## Running the stack

```bash
# 1. Start Postgres + Qdrant
./scripts/start_docker.sh

# 2. Start MCP server (in a separate terminal)
./scripts/start_mcp.sh

# 3. Run the agent
./scripts/run_agent.sh --thread "my-session" "Your question here"
```

## Ingesting docs

```bash
poetry run python scripts/ingest_docs.py --source react_docs --version 19 ~/path/to/react.dev
```

Walks the repo for `.md`/`.mdx` files. Each chunk stored with metadata: `source_type`, `version`, `path`, `title`, `section`, `chunk_index`. Collection name: `docs` (generic — other doc sets can be added with a different `source_type`).

## Configuration

All config via `.env` or environment variables:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `POSTGRES_DSN` | `postgresql://<user>:<pwd>@localhost:5432/mydb` | Checkpointer connection |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | MCP server SSE endpoint |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant endpoint |
| `QDRANT_COLLECTION` | `docs` | Vector store collection name |
| `MAX_ITERATIONS` | `5` | Max reflect→search loops before forced synthesis |
| `OPENAI_MODEL` | `gpt-4o` | Model for all reasoning nodes |
| `LOG_LEVEL` | `INFO` | Logging level; set to `DEBUG` for third-party lib traces |

## Session resumption

Passing the same `--thread` ID while Postgres is still running resumes from the last checkpoint. Omitting `--thread` auto-generates a UUID and prints it to stderr so it can be reused.

## Smoke test

```bash
# With MCP server running:
poetry run python scripts/smoke_test_mcp.py
```
