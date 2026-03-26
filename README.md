# research-agent

A local, CLI-driven research assistant. Give it a question — it classifies it, plans searches, runs them via DuckDuckGo and/or a local knowledge base, reflects on gaps, loops until satisfied, then produces a cited answer and saves it as a report.

## How it works

```
question → [classify] ──conversational──→ [answer] → response
                 │
              research
                 ↓
           [plan] → [search] → [reflect] → [search] → ... → [synthesize] → [save] → answer
```

- **classify** — LLM decides if the input is a research question or conversational (small talk, greetings). Conversational input is answered directly without any search.
- **plan** — LLM decomposes the question into 3–5 search queries
- **search** — LLM picks `web_search`, `kb_search`, or both based on the query; falls back to web search if no tool is called
- **reflect** — LLM evaluates results, identifies gaps, decides whether to search more or synthesize
- **synthesize** — LLM writes a cited answer; web results cited as `[N]`, KB results as `[KB-N]`
- **save** — persists the report via the MCP server

State is checkpointed to Postgres after every node, so interrupted sessions can be resumed.

## Knowledge base (RAG)

The agent can search a local vector store (Qdrant) in addition to the web. Currently the React docs are supported as a KB source.

```bash
# Start Qdrant
docker compose -f infra/docker-compose.yml up -d qdrant

# Ingest React docs from a local clone of react.dev
poetry run python scripts/ingest_docs.py --source react_docs --version 19 ~/path/to/react.dev
```

Once ingested, the agent automatically queries the KB for domain-specific questions (e.g. "how does useMemo work?") and the web for everything else.

## Prerequisites

- Python 3.12
- [Poetry](https://python-poetry.org/)
- Docker (for Postgres + Qdrant)
- OpenAI API key

## Setup

```bash
git clone <repo>
cd research-agent
poetry install
cp infra/.env.example .env   # add your OPENAI_API_KEY
```

`.env` variables:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `POSTGRES_DSN` | `postgresql://<user>:<pwd>@localhost:5432/mydb` | Checkpointer connection |
| `MCP_SERVER_URL` | `http://localhost:8000/sse` | MCP server endpoint |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector store endpoint |
| `QDRANT_COLLECTION` | `docs` | Collection name |
| `MAX_ITERATIONS` | `5` | Max search loops before forced synthesis |
| `OPENAI_MODEL` | `gpt-4o` | Model used for all reasoning nodes |
| `LOG_LEVEL` | `INFO` | Logging verbosity (`DEBUG` for full traces) |

## Running

```bash
# 1. Start Postgres + Qdrant
./scripts/start_docker.sh

# 2. Start MCP report server
./scripts/start_mcp.sh

# 3. Run the agent
./scripts/run_agent.sh --thread "my-session" "What are recent advances in fusion energy?"
```

The final answer is printed to stdout. Status and trace logs go to stderr.

## Session resumption

Each run is scoped to a `--thread` ID backed by the Postgres checkpointer. If a run is interrupted, re-running with the same `--thread` resumes from the last saved node.

```bash
# Start a session
./scripts/run_agent.sh --thread "fusion-q1" "What are recent advances in fusion energy?"

# Resume it (while Postgres is still running)
./scripts/run_agent.sh --thread "fusion-q1" "What are recent advances in fusion energy?"
```

Omit `--thread` to auto-generate an ID — it is printed to stderr so you can note it for later resumption.

## Project structure

```
main.py              # CLI entry point (--thread, question)
src/
├── agent/
│   ├── graph.py     # StateGraph definition, nodes, edges, run_graph()
│   ├── nodes.py     # classify, answer, plan, search, reflect, synthesize, save
│   └── state.py     # ResearchState TypedDict
├── mcp/
│   └── server.py    # MCP server exposing save/get/list report tools
├── rag/
│   ├── embeddings.py  # fastembed singleton (BAAI/bge-small-en-v1.5)
│   ├── ingest.py      # ingest_react_docs() — chunk + embed + upsert
│   └── store.py       # upsert_documents(), search_documents()
└── tools.py           # web_search + kb_search @tools, MCP client calls
scripts/
├── ingest_docs.py     # CLI: ingest docs into Qdrant
└── smoke_test_mcp.py  # End-to-end smoke test for the MCP server
infra/
├── docker-compose.yml # Postgres + Qdrant
└── .env.example       # Config template
```

## Smoke test

With the MCP server running:

```bash
poetry run python scripts/smoke_test_mcp.py
```
