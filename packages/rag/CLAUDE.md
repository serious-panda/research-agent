# CLAUDE.md — packages/rag

Standalone Python library for embeddings, Qdrant vector store operations, and document ingestion. Shared across the monorepo as a path dependency.

## Layout

```
packages/rag/
├── rag/
│   ├── __init__.py
│   ├── embeddings.py   # get_embeddings() — fastembed singleton (BAAI/bge-small-en-v1.5, 384 dims)
│   ├── store.py        # upsert_documents(), search_documents() — Qdrant client
│   └── ingest.py       # ingest_react_docs() — walk .md/.mdx, chunk, upsert with metadata
└── scripts/
    └── ingest_docs.py  # CLI entry point for ingestion
```

## Public API

```python
from rag.embeddings import get_embeddings     # returns TextEmbedding singleton
from rag.store import upsert_documents, search_documents
from rag.ingest import ingest_react_docs
```

### `search_documents(query, top_k=5, filter=None) → list[dict]`

Each result dict: `{text, score, source_type, version, path, title, section, chunk_index}`

`filter` is a flat `{key: value}` dict applied as Qdrant `FieldCondition` must-match filters. Example: `{"source_type": "react_docs", "version": "19"}`.

### `upsert_documents(chunks: list[dict])`

Each chunk must have a `"text"` key; all other keys become Qdrant payload. Embeddings are computed in batch via fastembed.

### `ingest_react_docs(repo_root: Path, version="19")`

Walks `repo_root` for `.md`/`.mdx` files, chunks with `RecursiveCharacterTextSplitter(512, 64)`, upserts with metadata: `source_type="react_docs"`, `version`, `path`, `title`, `section`, `chunk_index`.

## Qdrant details

- Collection: `docs` (env `QDRANT_COLLECTION`)
- Vector size: 384 dims, cosine distance
- Endpoint: env `QDRANT_URL` (default `http://localhost:6333`)
- Collection is created automatically on first upsert if it doesn't exist

## Used as a dependency

`agent-api` declares it as:
```toml
rag-pipeline = { path = "../../packages/rag", develop = true }
```

Imported inside `apps/agent-api/src/tools.py`:
```python
from rag.store import search_documents
```

In the agent-api Docker build, `packages/rag` is installed via `pip install /packages/rag` (bypasses Poetry's path resolution inside containers).

## Dev commands

```bash
poetry install --no-root   # install deps only (no package entry point)

# Ingest React docs
poetry run python scripts/ingest_docs.py --source react_docs --version 19 ~/path/to/react.dev

# Verify imports
poetry run python -c "from rag.store import search_documents, upsert_documents; from rag.embeddings import get_embeddings; from rag.ingest import ingest_react_docs; print('OK')"
```

## Gotchas

- `get_embeddings()` downloads the model on first call (~45 MB). It is cached in-process as a module-level singleton — do not instantiate `TextEmbedding` directly elsewhere.
- fastembed runs locally (no API key needed). It is CPU-only by default; the first embed call may be slow.
- The Qdrant collection is **not** namespaced by source — all doc sets share the `docs` collection. Use `source_type` and `version` metadata fields to distinguish them in `filter` arguments.
