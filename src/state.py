from typing import TypedDict


class ResearchState(TypedDict):
    question: str
    queries: list[str]          # planned by [plan], consumed by [search]
    search_results: list[dict]  # accumulated across iterations
    reflections: list[str]      # gap notes from each [reflect] pass
    iteration: int              # guards against infinite loops
    final_answer: str | None
