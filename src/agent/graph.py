import os
import sys

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.postgres import PostgresSaver

from src.agent.nodes import answer, classify, plan, reflect, save, search, synthesize
from src.agent.state import ResearchState

POSTGRES_DSN = os.getenv("POSTGRES_DSN")
MAX_ITERATIONS = int(os.getenv("MAX_ITERATIONS", "5"))


def _route_reflect(state: ResearchState) -> str:
    """Route to search if more queries remain, otherwise to synthesize."""
    if state["queries"] and state["iteration"] < MAX_ITERATIONS:
        return "search"
    return "synthesize"


def _route_classify(state: ResearchState) -> str:
    return "plan" if state["kind"] == "research" else "answer"


def _build_compiled_graph(checkpointer: PostgresSaver):
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

    with PostgresSaver.from_conn_string(POSTGRES_DSN) as checkpointer:
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
