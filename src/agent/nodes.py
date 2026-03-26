import logging
import os

from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from langchain_core.messages import HumanMessage, SystemMessage

from src.agent.state import ResearchState
from src.tools import SEARCH_TOOLS, save_report, web_search, kb_search

logger = logging.getLogger(__name__)


def _llm() -> ChatOpenAI:
    return ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o"))


class _Classification(BaseModel):
    kind: str  # "research" or "conversational"


def classify(state: ResearchState) -> dict:
    """Classify the question as research or conversational to avoid unnecessary search."""
    logger.info("[classify] question=%r", state["question"])
    result: _Classification = _llm().with_structured_output(_Classification).invoke([
        {
            "role": "system",
            "content": (
                "Classify the user's input as one of two kinds:\n"
                "- 'research': a factual question, topic investigation, or anything requiring "
                "web search or document lookup to answer well.\n"
                "- 'conversational': small talk, greetings, expressions of feeling, simple "
                "chitchat, or anything that needs no external information to answer.\n"
                "Reply with only the JSON field 'kind'."
            ),
        },
        {"role": "user", "content": state["question"]},
    ])
    logger.info("[classify] kind=%s", result.kind)
    return {"kind": result.kind}


def answer(state: ResearchState) -> dict:
    """Respond directly to conversational input without any search."""
    logger.info("[answer] responding to conversational input")
    response = _llm().invoke([
        {"role": "system", "content": "You are a friendly, concise assistant."},
        {"role": "user", "content": state["question"]},
    ])
    return {"final_answer": response.content}


class _QueryPlan(BaseModel):
    queries: list[str]


def plan(state: ResearchState) -> dict:
    """Decompose the research question into a list of search queries."""
    logger.info("[plan] question=%r", state["question"])
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
    logger.info("[plan] queries=%r", result.queries)
    return {"queries": result.queries}


def search(state: ResearchState) -> dict:
    """Execute the next pending query; LLM picks web_search, kb_search, or both."""
    query, *remaining = state["queries"]
    logger.info("[search] iteration=%d query=%r", state["iteration"], query)

    llm = _llm().bind_tools(SEARCH_TOOLS)
    response = llm.invoke([
        SystemMessage(
            "You are a research assistant. Use the available tools to find information. "
            "Use kb_search for domain-specific questions covered by the knowledge base. "
            "Use web_search for current events or general knowledge. "
            "Call both if the query spans both."
        ),
        HumanMessage(f"Research query: {query}"),
    ])

    web_results, new_kb_results = [], []
    for tc in response.tool_calls:
        logger.info("[search] tool_call=%s args=%r", tc["name"], tc["args"])
        if tc["name"] == "web_search":
            web_results.extend(web_search.invoke(tc["args"]))
        elif tc["name"] == "kb_search":
            new_kb_results.extend(kb_search.invoke(tc["args"]))

    # Fallback: if LLM called no tools, run web search directly
    if not response.tool_calls:
        logger.warning("[search] no tool calls from LLM, falling back to web_search")
        web_results = web_search.invoke({"query": query})

    logger.info(
        "[search] web_results=%d kb_results=%d remaining_queries=%d",
        len(web_results), len(new_kb_results), len(remaining),
    )
    return {
        "queries": remaining,
        "search_results": state["search_results"] + web_results,
        "kb_results": state.get("kb_results", []) + new_kb_results,
    }


class _ReflectDecision(BaseModel):
    sufficient: bool
    gap: str
    next_query: str


def reflect(state: ResearchState) -> dict:
    """Evaluate accumulated results; decide whether to search more or synthesize."""
    logger.info(
        "[reflect] iteration=%d web_results=%d kb_results=%d",
        state["iteration"],
        len(state["search_results"]),
        len(state.get("kb_results", [])),
    )
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
    if decision.sufficient:
        logger.info("[reflect] sufficient=True → synthesize")
    else:
        logger.info("[reflect] sufficient=False gap=%r next_query=%r", decision.gap, decision.next_query)
    return {
        "iteration": state["iteration"] + 1,
        "reflections": state["reflections"] + [decision.gap],
        "queries": [decision.next_query] if not decision.sufficient else [],
    }


def synthesize(state: ResearchState) -> dict:
    """Produce a final cited answer from all accumulated web and KB results."""
    logger.info(
        "[synthesize] web_results=%d kb_results=%d",
        len(state["search_results"]),
        len(state.get("kb_results", [])),
    )
    web_text = "\n\n".join(
        f"[{i + 1}] {r.get('title', '')}\nURL: {r.get('href', '')}\n{r.get('body', '')}"
        for i, r in enumerate(state["search_results"])
    )
    kb_results = state.get("kb_results", [])
    kb_text = "\n\n".join(
        f"[KB-{i + 1}] source: {r.get('path', '')}\ntitle: {r.get('title', '')}\n{r.get('text', '')}"
        for i, r in enumerate(kb_results)
    )

    context = f"Web search results:\n{web_text}" if web_text else ""
    if kb_text:
        context += f"\n\nKnowledge base results:\n{kb_text}"

    cite_instruction = (
        "Cite web results as [N] and knowledge base results as [KB-N]. "
        "If no knowledge base results are available, cite only web results."
    )

    response = _llm().invoke([
        {
            "role": "system",
            "content": (
                "You are a research writer. Using only the provided search results, "
                f"write a thorough answer to the question. {cite_instruction}"
            ),
        },
        {
            "role": "user",
            "content": f"Question: {state['question']}\n\n{context}",
        },
    ])
    logger.info("[synthesize] answer_chars=%d", len(response.content))
    return {"final_answer": response.content}


def save(state: ResearchState) -> dict:
    """Persist the final report via the MCP server."""
    logger.info("[save] saving report title=%r", state["question"])
    sources = [
        r["href"] for r in state["search_results"] if r.get("href")
    ]
    result = save_report(
        title=state["question"],
        content=state["final_answer"],
        sources=sources,
    )
    logger.info("[save] report_id=%s", result.get("report_id"))
    print(f"Report saved: {result.get('report_id')}")
    return {}
