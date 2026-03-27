# RAG Pipeline

## Goal
Ingest the React docs repo (local copy, `.md`/`.mdx` files only) into a Qdrant vector store so the agent can retrieve relevant context during research.

## Source
- **Input**: local clone of the React docs repo (path passed via CLI)
- **File types**: `.md`, `.mdx` only — all others skipped
- **Collection name**: `docs` — generic enough to hold docs from multiple sources later

## Stack
- **Embeddings**: `fastembed` + `BAAI/bge-small-en-v1.5` (local, 384 dims, no API key)
- **Vector DB**: Qdrant (Docker, port 6333); data in `qdrant_storage/` (persisted across restarts)
- **Chunking**: `RecursiveCharacterTextSplitter(chunk_size=512, overlap=64)`

## Metadata per Chunk
Each chunk stored in Qdrant carries the following payload fields:

| Field | Example | Notes |
|---|---|---|
| `source_type` | `"react_docs"` | Identifies the doc set; use this to filter searches |
| `version` | `"19"` | React docs version (extracted from repo path or hardcoded at ingest time) |
| `path` | `"src/content/reference/react/useState.md"` | Relative path from repo root |
| `title` | `"useState"` | First H1 found in the file; empty string if none |
| `section` | `"reference"` | Top-level directory under `src/content/` (e.g. `learn`, `reference`, `blog`) |
| `chunk_index` | `0` | Position of the chunk within the file (0-based) |

## New Files

### `src/rag/embeddings.py`
```python
from fastembed import TextEmbedding

_model: TextEmbedding | None = None

def get_embeddings() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
    return _model
```
Singleton — avoids reloading the model on every call.

### `src/rag/store.py`
- `upsert_documents(chunks: list[dict]) -> None`
  - Creates collection `docs` (384 dims, cosine distance) if it doesn't exist
  - Embeds `chunk["text"]` with `get_embeddings()`
  - Stores all other chunk fields as Qdrant payload
- `search_documents(query: str, top_k: int = 5, filter: dict | None = None) -> list[dict]`
  - Embeds query, runs vector search
  - Supports optional Qdrant payload filter (e.g. `{"source_type": "react_docs"}`)
  - Returns `[{text, score, source_type, version, path, title, section, chunk_index}]`
- Env vars: `QDRANT_URL` (default `http://localhost:6333`), `QDRANT_COLLECTION` (default `docs`)

### `src/rag/ingest.py`
```python
import re
from pathlib import Path
from langchain_text_splitters import RecursiveCharacterTextSplitter

SPLITTER = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=64)

def extract_title(text: str) -> str:
    """Return first H1 heading, or empty string."""
    m = re.search(r'^#\s+(.+)', text, re.MULTILINE)
    return m.group(1).strip() if m else ""

def ingest_react_docs(repo_root: Path, version: str = "19") -> None:
    files = [p for p in repo_root.rglob("*") if p.suffix in {".md", ".mdx"}]
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = path.relative_to(repo_root)
        parts = rel.parts
        # section = top-level dir under src/content/, else "root"
        section = parts[2] if len(parts) > 2 and parts[:2] == ("src", "content") else parts[0]
        title = extract_title(text)
        raw_chunks = SPLITTER.split_text(text)
        chunks = [
            {
                "text": chunk,
                "source_type": "react_docs",
                "version": version,
                "path": str(rel),
                "title": title,
                "section": section,
                "chunk_index": i,
            }
            for i, chunk in enumerate(raw_chunks)
        ]
        store.upsert_documents(chunks)
        print(f"Ingested {rel}: {len(chunks)} chunks")
```

### `scripts/ingest_docs.py`
CLI entry point:
```bash
# Ingest React docs from a local clone
poetry run python scripts/ingest_docs.py --source react_docs --version 19 /path/to/react.dev
```
Arguments:
- positional: path to the repo root
- `--source`: doc set identifier (`react_docs` for now)
- `--version`: version string embedded in metadata (default `"19"`)

## Dependencies Added
```toml
fastembed = "^0.3"
qdrant-client = "^1.9"
langchain-text-splitters = "^0.3"
```
(`langchain-community` and `pypdf` removed — not needed for md/mdx-only ingestion.)

## Running
```bash
# Start Qdrant
docker compose -f infra/docker-compose.yml up -d qdrant

# Ingest React docs
poetry run python scripts/ingest_docs.py --source react_docs --version 19 ~/repos/react.dev
```

## Filtering in Search
To scope retrieval to React docs only:
```python
results = search_documents(query, filter={"source_type": "react_docs"})
# or narrow further:
results = search_documents(query, filter={"source_type": "react_docs", "section": "reference"})
```

## Notes
- Collection name is `docs` — new doc sets (e.g. Next.js, MDN) can be added later with a different `source_type` without touching the collection
- If switching embedding models, delete `qdrant_storage/` and re-ingest (dimension mismatch will hard-fail)
- Qdrant data persists via `qdrant_storage/` volume mount in `infra/docker-compose.yml`
