# Plan: Reasoning Graph

> Source PRD: docs/prd.md — The Reasoning Graph section

## Architectural decisions

- **Framework**: LangGraph 1.1.x `StateGraph`
- **LLM**: OpenAI GPT-4o via `langchain-openai` (model configurable via `OPENAI_MODEL`)
- **Checkpointer**: LangGraph Postgres checkpointer (`langgraph-checkpoint-postgres`) on `localhost:5432`
- **Search tool**: DuckDuckGo via `duckduckgo-search` (no API key)
- **State model**: `ResearchState` — `question`, `queries`, `search_results`, `reflections`, `iteration`, `final_answer`
- **Loop guard**: `MAX_ITERATIONS` (default 5) — forces `synthesize` when reached
- **Graph topology**: `START → plan → search → reflect → (search | synthesize) → save → END`

---

## Phase 1: Graph skeleton with plan and search nodes

**User stories**: Agent accepts a question, decomposes it into queries, and executes the first web search

### What to build

Define `ResearchState` and the `StateGraph`. Implement the `plan` node (LLM decomposes the question into a list of search queries) and the `search` node (executes the next pending query via DuckDuckGo and appends results to state). Wire `START → plan → search`. The graph should be runnable end-to-end for this slice, even without reflect/synthesize.

### Acceptance criteria

- [ ] `ResearchState` TypedDict defined with all fields
- [ ] `plan` node populates `queries` from an LLM call
- [ ] `search` node executes one query and appends to `search_results`; decrements pending queries
- [ ] Graph runs from `START` through `search` without error on a sample question
- [ ] Postgres checkpointer connected; state persisted after each node

---

## Phase 2: Reflect node and search loop

**User stories**: Agent evaluates search results, identifies gaps, and issues follow-up queries until it judges the research sufficient

### What to build

Implement the `reflect` node. It calls the LLM with accumulated results and returns a structured decision: `{ sufficient, gap, next_query }`. Add the conditional edge: route back to `search` if `sufficient: false` and `iteration < MAX_ITERATIONS`, otherwise continue to `synthesize`. Increment `iteration` on each reflect pass and append gap notes to `reflections`.

### Acceptance criteria

- [ ] `reflect` node produces a structured decision (not free text)
- [ ] Conditional edge routes to `search` when `sufficient: false` and iteration limit not reached
- [ ] Conditional edge routes to `synthesize` when `sufficient: true` OR `iteration >= MAX_ITERATIONS`
- [ ] `iteration` increments correctly across loop passes
- [ ] Loop terminates deterministically within `MAX_ITERATIONS` even if LLM never signals sufficient

---

## Phase 3: Synthesize and save nodes

**User stories**: Agent produces a final cited answer and persists it via the MCP server

### What to build

Implement the `synthesize` node (LLM produces `final_answer` from all `search_results` and `reflections`, with source citations). Implement the `save` node (calls the MCP `save_report` tool with title, content, and sources). Wire `synthesize → save → END`.

### Acceptance criteria

- [ ] `synthesize` node populates `final_answer` in state
- [ ] `final_answer` includes citations derived from `search_results`
- [ ] `save` node calls the MCP `save_report` tool; receives and stores a `report_id`
- [ ] Full graph runs end-to-end: question in → report saved → `final_answer` in state

---

## Phase 4: Full graph integration with checkpointer resumption

**User stories**: Agent can resume an interrupted research session using the same thread ID

### What to build

Validate that the Postgres checkpointer correctly snapshots state after every node. Run the full graph with a `thread_id`, interrupt it mid-loop, then resume with the same `thread_id` and confirm the agent picks up from the last checkpoint without re-running completed nodes.

### Acceptance criteria

- [ ] State is checkpointed to Postgres after each node transition
- [ ] Resuming with the same `thread_id` continues from the last saved node
- [ ] A new `thread_id` always starts from `plan` regardless of existing checkpoints
- [ ] Stopping and restarting the Postgres container clears all checkpoints (ephemeral behavior confirmed)
