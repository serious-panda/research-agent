# RAG Pipeline

## Goal
Ingest local documents into a Qdrant vector store so the agent can retrieve relevant context from them.

## Stack
- **Embeddings**: `fastembed` + `BAAI/bge-small-en-v1.5` (local, 384 dims, no API key)
- **Vector DB**: Qdrant (Docker, port 6333); data in `qdrant_storage/` (persisted across restarts)
- **Chunking**: `RecursiveCharacterTextSplitter(chunk_size=512, overlap=64)`
- **Document types**: `.md`, `.txt`, `.pdf`

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
- Singleton to avoid re-loading the model on every call
- 384-dim output matches the existing `qdrant_storage/` collection

### `src/rag/store.py`
- `upsert_documents(chunks: list[dict])` — each chunk: `{text, source}`
  - Creates collection `research_docs` (384 dims, cosine) if missing
  - Embeds with `get_embeddings()`, upserts to Qdrant
- `search_documents(query: str, top_k=5) → list[dict]`
  - Embeds query locally, runs vector search
  - Returns `[{text, source, score}]`
- Reads env: `QDRANT_URL` (default `http://localhost:6333`), `QDRANT_COLLECTION` (default `research_docs`)

### `src/rag/ingest.py`
```python
def ingest(paths: list[Path]) -> None:
    for path in paths:
        docs = load(path)           # plain read for .md/.txt, PyPDFLoader for .pdf
        chunks = split(docs)        # RecursiveCharacterTextSplitter
        store.upsert_documents(chunks)
        print(f"Ingested {path}: {len(chunks)} chunks")
```

### `scripts/ingest_docs.py`
CLI entry point:
```bash
poetry run python scripts/ingest_docs.py docs/
poetry run python scripts/ingest_docs.py paper.pdf notes.md
```

## Dependencies Added
```toml
fastembed = "^0.3"
qdrant-client = "^1.9"
langchain-community = "^0.3"    # PyPDFLoader
pypdf = "^4.0"                  # PDF backend
langchain-text-splitters = "^0.3"
```

## Running
```bash
# Start Qdrant (via docker-compose)
docker compose -f infra/docker-compose.yml up -d qdrant

# Ingest
poetry run python scripts/ingest_docs.py path/to/docs/
```

## Notes
- Collection dimension is 384 (BAAI/bge-small-en-v1.5) — matches existing `qdrant_storage/`
- If upgrading from a different model, delete `qdrant_storage/` and re-ingest
- Qdrant data persists across container restarts via `qdrant_storage/` volume mount
