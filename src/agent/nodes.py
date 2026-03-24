import os

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from src.agent.state import ResearchState
from src.tools import save_report, search_web


def _llm() -> ChatOpenAI:
    return ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o"))


class _QueryPlan(BaseModel):
    queries: list[str]


def plan(state: ResearchState) -> dict:
    """Decompose the research question into a list of search queries."""
    result: _QueryPlan = _llm().with_structured_output(_QueryPlan).invoke([
        {
            "role": "system",
            "content": (
                "You are a research planner. Given a question, produce a list of "
                "focused web search queries that together will answer it thoroughly. "
                "Return 3-5 queries."
            ),
        },
        {"role": "user", "content": state["question"]},
    ])
    return {"queries": result.queries}


def search(state: ResearchState) -> dict:
    """Execute the next pending query and append results to state."""
    query, *remaining = state["queries"]
    results = search_web(query)
    return {
        "queries": remaining,
        "search_results": state["search_results"] + results,
    }


class _ReflectDecision(BaseModel):
    sufficient: bool
    gap: str
    next_query: str


def reflect(state: ResearchState) -> dict:
    """Evaluate accumulated results; decide whether to search more or synthesize."""
    results_summary = "\n\n".join(
        f"Query: {r.get('title', '')}\nSnippet: {r.get('body', '')}"
        for r in state["search_results"]
    )
    decision: _ReflectDecision = _llm().with_structured_output(_ReflectDecision).invoke([
        {
            "role": "system",
            "content": (
                "You are a research evaluator. Given a question and search results so far, "
                "decide if the information is sufficient to write a complete answer. "
                "If not, identify the gap and suggest the single best follow-up query."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {state['question']}\n\n"
                f"Search results so far:\n{results_summary}"
            ),
        },
    ])
    return {
        "iteration": state["iteration"] + 1,
        "reflections": state["reflections"] + [decision.gap],
        "queries": [decision.next_query] if not decision.sufficient else [],
    }


def synthesize(state: ResearchState) -> dict:
    """Produce a final cited answer from all accumulated search results."""
    results_text = "\n\n".join(
        f"[{i + 1}] {r.get('title', '')}\nURL: {r.get('href', '')}\n{r.get('body', '')}"
        for i, r in enumerate(state["search_results"])
    )
    response = _llm().invoke([
        {
            "role": "system",
            "content": (
                "You are a research writer. Using only the provided search results, "
                "write a thorough answer to the question. "
                "Cite sources inline using [N] notation matching the result numbers."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {state['question']}\n\n"
                f"Search results:\n{results_text}"
            ),
        },
    ])
    return {"final_answer": response.content}


def save(state: ResearchState) -> dict:
    """Persist the final report via the MCP server."""
    sources = [
        r["href"] for r in state["search_results"] if r.get("href")
    ]
    result = save_report(
        title=state["question"],
        content=state["final_answer"],
        sources=sources,
    )
    print(f"Report saved: {result.get('report_id')}")
    return {}
