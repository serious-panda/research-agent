import re
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from . import store

SPLITTER = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=64)


def extract_title(text: str) -> str:
    m = re.search(r"^#\s+(.+)", text, re.MULTILINE)
    return m.group(1).strip() if m else ""


def ingest_react_docs(repo_root: Path, version: str = "19") -> None:
    files = [p for p in repo_root.rglob("*") if p.suffix in {".md", ".mdx"}]
    if not files:
        print(f"No .md/.mdx files found under {repo_root}")
        return

    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = path.relative_to(repo_root)
        parts = rel.parts

        # section = top-level dir under src/content/, else the first path component
        if len(parts) > 2 and parts[:2] == ("src", "content"):
            section = parts[2]
        else:
            section = parts[0]

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
