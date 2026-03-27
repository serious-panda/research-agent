# Plan 06: Consumer Web UI

> Source PRD: `docs/milestones/web-interface/prd-monorepo-web.md`

## Context

The agent API streams SSE events (Plan 03). This phase builds the React consumer UI that consumes that stream: a question input, a live progress feed showing each graph node as it runs, and a rendered Markdown answer with cited sources. The app works in both demo mode (served by nginx, proxied through `/api/`) and work mode (Vite dev server with proxy).

## Architectural decisions

- **Framework**: Vite 5 + React 18 + TypeScript
- **Dependencies**: `react-markdown` only (Markdown rendering); no component library
- **API access**: always same-origin — no hardcoded API URLs or CORS. In work mode, `vite.config.ts` proxies `/api/` to `localhost:8001`. In demo mode, `nginx.conf` proxies `/api/` to `agent-api:8001`
- **SSE client**: `fetch` + `ReadableStream` (not `EventSource` — which is GET-only). Manual SSE line parsing: split on `\n\n`, strip `data: ` prefix, `JSON.parse`
- **State ownership**: single `useResearch` hook owns all state and the stream reader; components are purely presentational
- **UI states**: `idle` → `running` → `done` | `error`

## What to build

### Directory structure

```
apps/consumer-web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── nginx.conf
├── Dockerfile
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts
    ├── api/
    │   └── research.ts
    ├── hooks/
    │   └── useResearch.ts
    └── components/
        ├── QuestionForm.tsx
        ├── ProgressFeed.tsx
        ├── AnswerCard.tsx
        └── SourceList.tsx
```

### `src/types.ts`

```typescript
export type NodeName =
  | "classify" | "answer" | "plan" | "search"
  | "reflect" | "synthesize" | "save";

export type SseEvent =
  | { event: "node_start"; node: NodeName; iteration: number | null }
  | { event: "node_done";  node: NodeName; iteration: number | null; payload: Record<string, unknown> }
  | { event: "done";       answer: string; sources: string[]; thread_id: string }
  | { event: "error";      message: string };

export type ResearchStatus = "idle" | "running" | "done" | "error";
```

### `src/hooks/useResearch.ts` — interface

```typescript
interface UseResearchResult {
  status: ResearchStatus;
  events: SseEvent[];        // accumulated node_start / node_done events for ProgressFeed
  answer: string | null;
  sources: string[];
  threadId: string | null;
  error: string | null;
  submit: (question: string) => void;
  reset: () => void;
}
```

Internals:
- `submit()` calls `POST /api/research` via `fetch`; reads response as `ReadableStream<Uint8Array>`
- Decodes with `TextDecoder`; splits on `\n\n`; parses `data: ` lines
- `node_start` / `node_done` → appended to `events`
- `done` → sets `answer`, `sources`, `threadId`; status → `"done"`
- `error` → sets `error`; status → `"error"`
- Stores `AbortController`; `reset()` aborts the stream and clears all state

### `src/components/ProgressFeed.tsx`

Renders a vertical list of node rows. Each row:
- Spinner while `node_start` received but no matching `node_done`
- Checkmark once `node_done` received
- Human-readable label:

| Node | Label |
|---|---|
| `classify` | Classifying |
| `plan` | Planning queries |
| `search` | Searching (pass N) |
| `reflect` | Evaluating results |
| `synthesize` | Writing answer |
| `save` | Saving report |
| `answer` | Answering directly |

- `reflect` row: show `payload.gap` text when `payload.sufficient === false`
- `search` row: show tool badges (`web`, `kb`, or both) from `payload.tools_called`

### `src/components/QuestionForm.tsx`

- `<textarea>` — Enter submits, Shift+Enter inserts newline
- "Research" button — disabled while `status === "running"`
- Clears on `reset()`

### `src/components/AnswerCard.tsx`

- Renders `answer` as Markdown via `react-markdown`
- Only mounted when `status === "done"`

### `src/components/SourceList.tsx`

- Numbered `<ol>` of `sources` URLs
- Numbers match `[N]` inline citations in the answer

### `vite.config.ts` (work mode proxy)

```typescript
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8001",
    },
  },
});
```

### `nginx.conf` (demo mode)

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location /api/ {
    proxy_pass http://agent-api:8001/api/;
    proxy_http_version 1.1;
    proxy_set_header Connection "";          # required for SSE keep-alive
    proxy_buffering off;                     # required for SSE — disables response buffering
    proxy_cache off;
    chunked_transfer_encoding on;
  }

  location / {
    try_files $uri $uri/ /index.html;        # SPA fallback
  }
}
```

`proxy_buffering off` is critical — without it nginx buffers the SSE stream and the UI receives nothing until the connection closes.

### `Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### `package.json` (key deps)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "react-markdown": "^9"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4"
  }
}
```

### Remove `web` profile from compose

In `docker-compose.yml`, remove `profiles: ["web"]` from the `consumer-web` service entry so it starts with the default `docker compose up`.

---

## Acceptance criteria

- [ ] `apps/consumer-web/` exists with all files above
- [ ] `cd apps/consumer-web && npm install && npm run build` succeeds with no errors
- [ ] Work mode: `npm run dev` starts Vite dev server on `:5173`; submitting a question streams progress and renders an answer
- [ ] Progress feed shows each node row (classify, plan, search×N, reflect×N, synthesize, save) with spinner → checkmark transitions
- [ ] `reflect` rows with `sufficient: false` show the gap text
- [ ] `search` rows show which tools were called
- [ ] Answer renders as formatted Markdown with citation markers
- [ ] Source list is numbered and matches citations
- [ ] "New question" button resets to idle state
- [ ] Error state shows message + "Try again" button
- [ ] Demo mode: `docker compose up --build` includes consumer-web; `open http://localhost:3000` loads the UI and a research question returns an answer
- [ ] Conversational question (e.g. "how are you?") returns a direct answer with no search nodes in the feed
