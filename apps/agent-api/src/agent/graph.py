import os
import sys
from collections.abc import AsyncIterator
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from agent.nodes import answer, classify, plan, reflect, save, search, synthesize
from agent.state import ResearchState

POSTGRES_DSN = os.getenv("POSTGRES_DSN")
MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "5"))
AGENT_SCHEMA = os.getenv("AGENT_SCHEMA", "agent")


def _dsn_with_schema(dsn: str, schema: str) -> str:
    """Return a copy of the DSN with search_path set to the given schema."""
    parsed = urlparse(dsn)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params["options"] = [f"-csearch_path={schema},public"]
    return urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in params.items()})))


AGENT_POSTGRES_DSN = _dsn_with_schema(POSTGRES_DSN, AGENT_SCHEMA) if POSTGRES_DSN else None


def _route_reflect(state: ResearchState) -> str:
    """Route to search if more queries remain, otherwise to synthesize."""
    if state["queries"] and state["iteration"] < MAX_ITERATIONS:
        return "search"
    return "synthesize"


def _route_classify(state: ResearchState) -> str:
    return "plan" if state["kind"] == "research" else "answer"


def _build_compiled_graph(checkpointer):
    builder = StateGraph(ResearchState)

    builder.add_node("classify", classify)
    builder.add_node("answer", answer)
    builder.add_node("plan", plan)
    builder.add_node("search", search)
    builder.add_node("reflect", reflect)
    builder.add_node("synthesize", synthesize)
    builder.add_node("save", save)

    builder.add_edge(START, "classify")
    builder.add_conditional_edges(
        "classify", _route_classify, {"plan": "plan", "answer": "answer"}
    )
    builder.add_edge("answer", END)
    builder.add_edge("plan", "search")
    builder.add_edge("search", "reflect")
    builder.add_conditional_edges(
        "reflect", _route_reflect, {"search": "search", "synthesize": "synthesize"}
    )
    builder.add_edge("synthesize", "save")
    builder.add_edge("save", END)

    return builder.compile(checkpointer=checkpointer)


def run_graph(question: str, thread_id: str) -> str:
    """Invoke the graph for a given question and thread ID.

    - New thread_id: starts from the plan node with a fresh state.
    - Existing thread_id with pending nodes: resumes from the last checkpoint.
    - Existing thread_id that already completed: starts fresh with the new question.

    The Postgres connection is held open for the duration of the run and
    closed automatically when done.
    """
    config = {"configurable": {"thread_id": thread_id}}

    with PostgresSaver.from_conn_string(AGENT_POSTGRES_DSN) as checkpointer:
        checkpointer.setup()  # idempotent DDL — safe to call on every startup
        graph = _build_compiled_graph(checkpointer)

        existing = graph.get_state(config)
        if existing.next:
            # Interrupted mid-run — resume from last checkpoint
            print(f"Resuming session '{thread_id}' at node(s): {existing.next}", file=sys.stderr)
            result = graph.invoke(None, config=config)
        else:
            # New thread or completed thread — start fresh
            initial: ResearchState = {
                "question": question,
                "kind": "research",  # overwritten by [classify]
                "queries": [],
                "search_results": [],
                "kb_results": [],
                "reflections": [],
                "iteration": 0,
                "final_answer": None,
            }
            print(f"Starting new session '{thread_id}'", file=sys.stderr)
            result = graph.invoke(initial, config=config)

    return result["final_answer"]


def _node_payload(node: str, data: dict) -> dict:
    raw = data.get("output", {}) or {}
    # Inner LangChain chains (e.g. structured output) emit on_chain_end with the same
    # langgraph_node tag but output is a Pydantic model, not the node's return dict.
    if hasattr(raw, "model_dump"):
        output = raw.model_dump()
    elif isinstance(raw, dict):
        output = raw
    else:
        return {}
    if node == "classify":
        return {"kind": output.get("kind", "")}
    if node == "plan":
        return {"queries": output.get("queries", [])}
    if node == "search":
        sr = output.get("search_results", [])
        kb = output.get("kb_results", [])
        tools = []
        if sr:
            tools.append("web_search")
        if kb:
            tools.append("kb_search")
        return {"result_count": len(sr) + len(kb), "tools_called": tools}
    if node == "reflect":
        queries = output.get("queries", [])
        reflections = output.get("reflections", [])
        return {"sufficient": len(queries) == 0, "gap": reflections[-1] if reflections else ""}
    if node == "save":
        return {"report_id": output.get("report_id", "")}
    return {}


async def stream_graph(question: str, thread_id: str) -> AsyncIterator[dict]:
    """Async generator that streams node-level events as the graph runs."""
    config = {"configurable": {"thread_id": thread_id}}
    initial: ResearchState = {
        "question": question,
        "kind": "research",
        "queries": [],
        "search_results": [],
        "kb_results": [],
        "reflections": [],
        "iteration": 0,
        "final_answer": None,
    }

    async with AsyncPostgresSaver.from_conn_string(AGENT_POSTGRES_DSN) as checkpointer:
        await checkpointer.setup()
        graph = _build_compiled_graph(checkpointer)

        current_node = None
        iteration = 0

        async for event in graph.astream_events(initial, config=config, version="v2"):
            kind = event["event"]
            node = event.get("metadata", {}).get("langgraph_node")
            if not node:
                continue

            if kind == "on_chain_start" and node != current_node:
                current_node = node
                yield {"event": "node_start", "node": node, "iteration": iteration}

            elif kind == "on_chain_end" and node == current_node and event.get("name") == node:
                payload = _node_payload(node, event["data"])
                yield {"event": "node_done", "node": node, "iteration": iteration, "payload": payload}
                if node == "reflect":
                    iteration += 1

        final = await graph.aget_state(config)
        values = final.values
        sources = [r["href"] for r in values.get("search_results", []) if r.get("href")]
        yield {
            "event": "done",
            "answer": values.get("final_answer", ""),
            "sources": sources,
            "thread_id": thread_id,
        }
