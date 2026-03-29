# PRD: Quota-Aware Effort-Controlled Research

## Overview

Add two closely related capabilities to the research agent:

1. **Effort levels** — users select Low, Medium, or High effort per research session. The choice controls how many search queries are planned, how many result documents are fetched per query, and how many reflect-and-retry iterations the agent is allowed to perform. This makes the system's resource consumption predictable and user-adjustable.

2. **Credit-based quota** — each result document fetched costs 1 credit. Users have a daily and hourly credit pool (global defaults, configurable via env vars). The server enforces the limit before forwarding to the agent; actual usage is recorded after the run completes. Users can see their current quota status and today's usage breakdown on a dedicated Settings page.

---

## Goals

1. Users can choose research depth (Low / Medium / High) before submitting a question
2. The agent honours effort-derived limits: initial query count, results per search call, max reflect iterations
3. The server enforces daily and hourly credit limits before research starts (HTTP 429 with clear body)
4. Actual credit usage is recorded asynchronously after each research session completes
5. A Settings page shows live daily/hourly quota bars and today's usage statistics
6. Quota-exceeded errors are surfaced distinctly from SSE-level errors in the UI

---

## Non-Goals

- Per-user quota overrides (limits are global, set by env vars)
- Billing, payment, or plan tiers
- Admin UI for managing user limits
- Token-bucket or sliding-window rate limiting (calendar-day / calendar-hour windows are sufficient)
- Caching or deduplicating identical research questions

---

## Architecture

```
Browser
  ├── EffortSelector (Low/Med/High) → stored in localStorage
  └── POST /api/research { question, effort }
        ↓
  apps/server  (AdonisJS)
    ├── checkQuota(userId, estimatedCost) → 429 if exceeded
    ├── reserveCredits() → research_usage row (status=pending)
    ├── fetch agent-api POST { question, effort, thread_id }
    ├── TransformStream intercept done event → updateUsage()
    └── pipe SSE bytes to browser unchanged
        ↓
  apps/agent-api  (FastAPI + LangGraph)
    ├── EFFORT_CONFIG[effort] → initial ResearchState fields
    ├── plan node: max_initial_queries queries
    ├── search node: results_per_query docs per call, tracks searches_done + links_evaluated
    ├── reflect node: stops at max_iterations
    └── done event: { ..., usage: { searches, links, credits } }

  GET /api/usage → quota_service.getQuotaStatus() → QuotaStatus JSON
  SettingsPage → useQuota() → renders bars + stats
```

---

## Credit Model

| Effort | max_initial_queries | max_iterations | results_per_query | estimated_credits |
|--------|--------------------|-----------------|--------------------|-------------------|
| low    | 2                  | 1               | 3                  | 10                |
| medium | 3                  | 2               | 5                  | 20                |
| high   | 5                  | 4               | 8                  | 40                |

**1 credit = 1 result document fetched** (web or KB).

`actual_credits = links_evaluated` (total across all search node executions).

Quota checks use `estimated_credits` for in-flight rows (`status='pending'`) and `actual_credits` for completed rows (`status='completed'`). Failed rows (`status='failed'`) are excluded from usage sums, so a failed run does not consume quota.

Default limits (overridable via env):
- `DAILY_QUOTA_CREDITS=200`
- `HOURLY_QUOTA_CREDITS=50`

---

## New Database Table

```
research_usage
──────────────
id                 serial PK
user_id            FK → users.id  CASCADE DELETE
effort             varchar(10)    low | medium | high
estimated_credits  integer        set at request start
actual_credits     integer NULL   updated from done event
searches_done      integer NULL   updated from done event
links_evaluated    integer NULL   updated from done event
status             varchar(20)    pending | completed | failed
thread_id          varchar(100) NULL
created_at         timestamp
updated_at         timestamp

INDEX (user_id, created_at)   -- fast quota window queries
```

---

## API Changes

### `POST /api/research` (modified)

Request body now accepts `effort`:
```json
{ "question": "...", "effort": "medium", "thread_id": null }
```

Response: unchanged SSE stream, or HTTP 429 before stream starts:
```json
{
  "error": "quota_exceeded",
  "period": "daily",
  "used": 195,
  "limit": 200,
  "resets_at": "2025-03-30T00:00:00.000Z"
}
```

### `GET /api/usage` (new, auth required)

```json
{
  "daily":  { "used": 120, "limit": 200, "resets_at": "2025-03-30T00:00:00.000Z" },
  "hourly": { "used": 15,  "limit": 50,  "resets_at": "2025-03-29T15:00:00.000Z" },
  "today":  { "researches": 6, "searches": 47, "links": 235 }
}
```

### Agent `done` SSE event (modified)

```json
{
  "event": "done",
  "answer": "...",
  "sources": ["https://..."],
  "thread_id": "abc-123",
  "usage": { "searches": 3, "links": 15, "credits": 15 }
}
```

---

## UI Changes

### Research page header
Adds a **Settings** button alongside the existing Sign out button.

### QuestionForm
Adds an **EffortSelector** (Low / Med / High toggle buttons) in the actions row below the textarea. The selector is disabled while a research is running or when quota is exceeded. Default effort is read from localStorage (`research_default_effort`, default `"medium"`).

### Quota exceeded state
When the server returns 429, an **amber banner** appears above the form:
> *"Daily research limit reached. You've used 200 of 200 credits. Your quota resets at 12:00 AM."*

The research form is disabled. A Dismiss button clears the banner and re-enables the form.

### Settings page
A full-page view (state-based, no router change) with two sections:

**Usage**
- Daily quota bar (turns red at ≥ 90%)
- Hourly quota bar
- 3-stat grid: Researches today / Searches today / Links evaluated

**Preferences**
- Default effort selector (Low / Med / High) — writes to localStorage

---

## Implementation Plans

| Plan | Title | Services |
|------|-------|----------|
| [01](plans/01-agent-effort-params.md) | Agent effort parameters | agent-api |
| [02](plans/02-server-quota-db.md) | Server quota DB + service | server |
| [03](plans/03-server-research-controller.md) | Research controller update | server |
| [04](plans/04-server-usage-endpoint.md) | Usage endpoint | server |
| [05](plans/05-frontend-types-api.md) | Frontend types & API layer | consumer-web |
| [06](plans/06-frontend-effort-selector.md) | Effort selector & QuestionForm | consumer-web |
| [07](plans/07-frontend-settings-page.md) | Settings page & quota UI | consumer-web |

Plans 01–04 can be worked in parallel (agent and server are independent). Plans 05–07 are sequential and depend on 03 and 04 being deployed.
