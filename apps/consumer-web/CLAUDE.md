# CLAUDE.md — apps/consumer-web

Vite 5 + React 18 + TypeScript single-page app. Lets users ask research questions and shows live agent progress as the LangGraph graph runs.

## Layout

```
apps/consumer-web/
├── src/
│   ├── types.ts              # SseEvent, ResearchStatus, ProgressRow
│   ├── App.tsx               # Root — composes all components
│   ├── api/
│   │   └── research.ts       # streamResearch() async generator — SSE client
│   ├── hooks/
│   │   └── useResearch.ts    # All state: status, events, answer, sources, error
│   └── components/
│       ├── QuestionForm.tsx  # textarea + submit; Enter=submit, Shift+Enter=newline
│       ├── ProgressFeed.tsx  # Live node rows with spinner→checkmark transitions
│       ├── AnswerCard.tsx    # react-markdown renderer
│       └── SourceList.tsx    # Numbered <ol> of source URLs
├── vite.config.ts            # Dev proxy /api → :8001; vendor + markdown chunks
├── nginx.conf                # Demo mode: proxy /api → agent-api:8001 with buffering off
└── Dockerfile                # Multi-stage: node build → nginx serve
```

## Data flow

```
QuestionForm.onSubmit
  └─► useResearch.submit()
        └─► streamResearch()          // fetch POST /api/research
              └─► ReadableStream      // manual \n\n SSE parsing
                    ├─ node_start/node_done → events[] → ProgressFeed
                    ├─ done           → answer, sources → AnswerCard + SourceList
                    └─ error          → error message
```

## SSE client

Uses `fetch` + `ReadableStream`, **not** `EventSource` (which is GET-only). Manual parsing:

```
buffer += decoded chunk
split on "\n\n"
for each part: strip "data: " prefix → JSON.parse → dispatch
```

`AbortController` is stored in a ref; `reset()` aborts the in-flight stream.

## State ownership

`useResearch` owns everything — `status`, `events`, `answer`, `sources`, `threadId`, `error`. All components are purely presentational (props in, JSX out). Do not add local state to components for data that belongs to the research lifecycle.

## ProgressFeed

Builds `ProgressRow[]` from the flat `events[]` array. Each row is keyed by `${node}-${iteration}` to handle repeated nodes (search/reflect loops). A row is `done=false` until its matching `node_done` event arrives.

Special rendering:
- `search` rows: show `web` / `kb` badges from `payload.tools_called`
- `reflect` rows: show gap text when `payload.sufficient === false`

## API access

All requests go to `/api/` — never hardcode `localhost:8001`. In dev mode Vite proxies `/api` to `http://localhost:8001`. In production nginx proxies it to `agent-api:8001` with `proxy_buffering off` (critical for SSE).

## Dev commands

```bash
npm install
npm run dev      # http://localhost:5173 (Vite HMR)
npm run build    # tsc -b && vite build
```

## Gotchas

- `proxy_buffering off` in `nginx.conf` is non-negotiable — without it nginx buffers the entire SSE stream and the UI receives nothing until the connection closes
- `EventSource` cannot POST — the SSE stream is initiated with `fetch` and a JSON body
- `react-markdown` is in its own manual chunk (`markdown`) to keep the vendor chunk lean
