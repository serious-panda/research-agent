# Plan 01: RAG Package Extraction

> Source PRD: `docs/milestones/web-interface/prd-monorepo-web.md`

## Context

`src/rag/` currently lives inside the monolithic source tree and is imported as `from src.rag.xxx`. Extracting it into `packages/rag` as a proper installable Python package establishes the shared library pattern the rest of the monorepo depends on. Nothing else changes in this phase — no service moves, no API work.

## Architectural decisions

- **Package name**: `rag-pipeline` (PyPI-safe, descriptive)
- **Import root**: `rag` (e.g. `from rag.store import search_documents`)
- **Install mode**: `package-mode = true` with `packages = [{ include = "rag" }]`
- **Path dependency** in consumers: `rag-pipeline = { path = "../../packages/rag", develop = true }`
- **Dockerfile strategy**: `pip install /packages/rag` directly — bypasses Poetry's relative path resolution inside containers

---

## What to build

Create `packages/rag/` as a standalone Poetry project. Move the three source files from `src/rag/` verbatim — no logic changes. Move `scripts/ingest_docs.py` into `packages/rag/scripts/` and update its import. Verify the package installs and imports cleanly in isolation.

The existing `src/rag/` directory and `src/rag/__init__.py` are deleted once the package is verified.

### Directory result

```
packages/
└── rag/
    ├── pyproject.toml
    ├── rag/
    │   ├── __init__.py
    │   ├── embeddings.py      # moved verbatim from src/rag/embeddings.py
    │   ├── store.py           # moved verbatim from src/rag/store.py
    │   └── ingest.py          # moved verbatim from src/rag/ingest.py
    └── scripts/
        └── ingest_docs.py     # moved from scripts/ingest_docs.py; import updated
```

### `packages/rag/pyproject.toml`

```toml
[tool.poetry]
name = "rag-pipeline"
version = "0.1.0"
description = "Shared RAG library: embeddings, Qdrant store, document ingestion"
authors = []
packages = [{ include = "rag" }]

[tool.poetry.dependencies]
python = "^3.12"
fastembed = ">=0.4,<1"
qdrant-client = "^1.9"
langchain-text-splitters = "^0.3"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

### Import change in `scripts/ingest_docs.py`

```python
# before
from src.rag.ingest import ingest_react_docs
# after
from rag.ingest import ingest_react_docs
```

### Root `src/rag/` removal

Delete `src/rag/` entirely. The root `src/tools.py` and `src/agent/nodes.py` still reference `from src.rag.xxx` — those are updated in Plan 02 when the agent moves.

---

## Acceptance criteria

- [ ] `packages/rag/` exists with `pyproject.toml`, `rag/` package, and `scripts/`
- [ ] `cd packages/rag && poetry install --no-root` succeeds with no errors
- [ ] `poetry run python -c "from rag.store import search_documents, upsert_documents; from rag.embeddings import get_embeddings; from rag.ingest import ingest_react_docs; print('OK')"` prints `OK`
- [ ] `src/rag/` directory is deleted from the repo
- [ ] `scripts/ingest_docs.py` is deleted from root `scripts/` (moved to `packages/rag/scripts/`)
- [ ] No other files in `src/` are modified in this phase
