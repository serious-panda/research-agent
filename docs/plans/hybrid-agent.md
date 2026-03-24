# Hybrid Agent — Agentic Retrieval

## Goal
Make the agent choose between KB search and web search (or both) at runtime. The LLM reads tool docstrings and the current query to decide which source to consult.

## Architecture

### Tool-based (agentic) approach
Rather than a static `kb_search` node that always fires, both search backends are exposed as LangChain `@tool` functions. The `search` node binds them to the LLM and lets it decide.

```
plan → search* → reflect → synthesize → save
         ↑__________↑ (loop until sufficient or MAX_ITERATIONS)

* search = LLM with [web_search, kb_search] tools
```

No change to graph topology. Only the `search` node's internals change.

### Why tool-based vs. static node
- **Static node** (`plan → kb_search → search`): always runs KB lookup regardless of query relevance; pollutes context with irrelevant KB results for general queries.
- **Agentic tool**: LLM decides based on query content. Query about "React hooks internals" → calls `kb_search`. Query about "today's AI news" → calls `web_search` only. Ambiguous query → calls both.

The LLM's routing logic comes entirely from docstrings — no hardcoded rules in Python.

## Changes

### `src/tools.py` — `@tool` decorators
```python
@tool
def web_search(query: str) -> list[dict]:
    """Search the web for current events, news, or general knowledge not in the knowledge base."""
    return _ddg_search(query, max_results=5)

@tool
def kb_search(query: str) -> list[dict]:
    """Search the local knowledge base of ingested documents.
    Use for domain-specific questions about topics covered in the knowledge base."""
    from src.rag.store import search_documents
    return search_documents(query, top_k=5)

SEARCH_TOOLS = [web_search, kb_search]
```

### `src/agent/state.py`
```python
class ResearchState(TypedDict):
    question: str
    queries: list[str]
    search_results: list[dict]   # web results
    kb_results: list[dict]       # KB results (empty if kb_search not called)
    reflections: list[str]
    iteration: int
    final_answer: str | None
```

### `src/agent/nodes.py` — upgraded `search` node
```python
def search(state: ResearchState) -> dict:
    query = state["queries"][0]
    remaining = state["queries"][1:]

    llm = _llm().bind_tools(SEARCH_TOOLS)
    response = llm.invoke([
        SystemMessage(
            "You are a research assistant. Use the available tools to find information. "
            "Use kb_search for domain-specific questions covered by the knowledge base. "
            "Use web_search for current events or general knowledge. Call both if the query spans both."
        ),
        HumanMessage(f"Research query: {query}")
    ])

    web_results, kb_results = [], []
    for tc in response.tool_calls:
        if tc["name"] == "web_search":
            web_results.extend(web_search.invoke(tc["args"]))
        elif tc["name"] == "kb_search":
            kb_results.extend(kb_search.invoke(tc["args"]))

    return {
        "queries": remaining,
        "search_results": state["search_results"] + web_results,
        "kb_results": state.get("kb_results", []) + kb_results,
    }
```

### `src/agent/nodes.py` — updated `synthesize` node
Prompt includes both result sets:
```
Web search results:
[1] Title — URL
    Snippet...
...

Knowledge base results:
[KB-1] source: path/to/doc.md
    Excerpt...
...

Write a thorough answer. Cite web results as [N] and knowledge base results as [KB-N].
If no knowledge base results are available, cite only web results.
```

### `src/agent/graph.py`
No topology change. Update import paths after restructure.
Initial state adds `"kb_results": []`.

## Behavior Examples

| Query | Expected tool calls | Citations |
|---|---|---|
| "What does our architecture doc say about MCP?" | `kb_search` | `[KB-1]`, `[KB-2]` |
| "Latest news on LLM benchmarks" | `web_search` | `[1]`, `[2]` |
| "How does React handle state, and what are recent updates?" | both | `[KB-1]`, `[1]`, `[2]` |
| "What is Docker?" (KB has no Docker docs) | `web_search` | `[1]` |

## Graceful degradation
- KB empty → `kb_search` returns `[]` → LLM sees no KB context → relies on web only
- Qdrant unreachable → `kb_search` catches exception, returns `[]` with a warning log
- LLM calls no tools → fallback: call `web_search(query)` directly in the node
