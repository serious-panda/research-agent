import os
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams, Filter, FieldCondition, MatchValue

from .embeddings import get_embeddings

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION = os.getenv("QDRANT_COLLECTION", "docs")
DIMS = 384


def _client() -> QdrantClient:
    return QdrantClient(url=QDRANT_URL)


def _ensure_collection(client: QdrantClient) -> None:
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION not in existing:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=DIMS, distance=Distance.COSINE),
        )


def upsert_documents(chunks: list[dict]) -> None:
    if not chunks:
        return
    client = _client()
    _ensure_collection(client)
    model = get_embeddings()
    texts = [c["text"] for c in chunks]
    vectors = list(model.embed(texts))
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vectors[i].tolist(),
            payload={k: v for k, v in chunk.items() if k != "text"} | {"text": chunk["text"]},
        )
        for i, chunk in enumerate(chunks)
    ]
    client.upsert(collection_name=COLLECTION, points=points)


def search_documents(
    query: str,
    top_k: int = 5,
    filter: dict | None = None,
) -> list[dict]:
    client = _client()
    model = get_embeddings()
    vector = next(model.embed([query])).tolist()

    qdrant_filter = None
    if filter:
        qdrant_filter = Filter(
            must=[
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filter.items()
            ]
        )

    result = client.query_points(
        collection_name=COLLECTION,
        query=vector,
        limit=top_k,
        query_filter=qdrant_filter,
        with_payload=True,
    )
    return [
        {
            "text": hit.payload.get("text", ""),
            "score": hit.score,
            "source_type": hit.payload.get("source_type", ""),
            "version": hit.payload.get("version", ""),
            "path": hit.payload.get("path", ""),
            "title": hit.payload.get("title", ""),
            "section": hit.payload.get("section", ""),
            "chunk_index": hit.payload.get("chunk_index", 0),
        }
        for hit in result.points
    ]
