import json
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

# Make src/ importable for agent.* and tools
sys.path.insert(0, str(Path(__file__).parent / "src"))

from dotenv import load_dotenv
load_dotenv()

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.graph import stream_graph, AGENT_POSTGRES_DSN, AGENT_SCHEMA, POSTGRES_DSN
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from tools import get_report, list_reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with await psycopg.AsyncConnection.connect(POSTGRES_DSN) as conn:
        await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {AGENT_SCHEMA}")
    yield


app = FastAPI(title="Research Agent API", lifespan=lifespan)


class ResearchRequest(BaseModel):
    question: str
    thread_id: str | None = None
    effort: str = "high"   # "low" | "medium" | "high"


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/research")
async def research(body: ResearchRequest) -> StreamingResponse:
    thread_id = body.thread_id or str(uuid.uuid4())

    async def generate():
        try:
            async for event in stream_graph(body.question, thread_id, effort=body.effort):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'event': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/research/{thread_id}")
async def get_research(thread_id: str) -> dict:
    config = {"configurable": {"thread_id": thread_id}}
    async with AsyncPostgresSaver.from_conn_string(AGENT_POSTGRES_DSN) as checkpointer:
        await checkpointer.setup()
        from agent.graph import _build_compiled_graph
        graph = _build_compiled_graph(checkpointer)
        state = await graph.aget_state(config)

    if not state.values:
        raise HTTPException(status_code=404, detail="Thread not found")

    values = state.values
    return {
        "thread_id": thread_id,
        "question": values.get("question", ""),
        "answer": values.get("final_answer"),
        "iteration": values.get("iteration", 0),
    }


@app.get("/api/reports")
async def list_reports_route() -> list:
    return await list_reports()


@app.get("/api/reports/{report_id}")
async def get_report_route(report_id: str) -> dict:
    return await get_report(report_id)
