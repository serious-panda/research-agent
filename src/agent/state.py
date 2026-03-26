from typing import TypedDict


class ResearchState(TypedDict):
    question: str
    kind: str                   # "research" | "conversational" — set by [classify]
    queries: list[str]          # planned by [plan], consumed by [search]
    search_results: list[dict]  # web results, accumulated across iterations
    kb_results: list[dict]      # KB results (empty if kb_search never called)
    reflections: list[str]      # gap notes from each [reflect] pass
    iteration: int              # guards against infinite loops
    final_answer: str | None
