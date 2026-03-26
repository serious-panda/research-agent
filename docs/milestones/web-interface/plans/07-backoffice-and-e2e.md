# Plan 07: Backoffice Stub + Work Mode Validation

> Source PRD: `docs/prd-monorepo-web.md`

## Context

This is the final phase. It adds the backoffice placeholder app (completing the monorepo layout), removes the `web` profile gate from `docker-compose.yml` so both UIs start by default, and validates end-to-end operation in both demo mode and work mode. Work mode is also documented in the root `README.md`.

## Architectural decisions

- **Backoffice stack**: Vite + React + TypeScript — identical to consumer-web to keep the pattern consistent
- **Port**: `3001`
- **Content**: single "Coming soon" page — no routes, no API calls
- **Purpose**: confirms the Docker build pipeline, nginx config, and compose wiring work for a second frontend service before real backoffice features are built

## What to build

### `apps/backoffice/` structure

```
apps/backoffice/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts     # port 3001 in dev mode
├── nginx.conf         # static SPA serve only — no API proxy
├── Dockerfile         # identical pattern to consumer-web
└── src/
    ├── main.tsx
    └── App.tsx        # "Coming soon" placeholder
```

### `src/App.tsx`

```tsx
export default function App() {
  return (
    <main style={{ fontFamily: "sans-serif", textAlign: "center", paddingTop: "6rem" }}>
      <h1>Backoffice</h1>
      <p>Coming soon.</p>
    </main>
  );
}
```

### `nginx.conf`

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

No API proxy needed — backoffice has no backend calls in this phase.

### `vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3001 },
});
```

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

### `docker-compose.yml` update

Remove `profiles: ["web"]` from the `backoffice` service entry (was added as a stub in Plan 05). Both `consumer-web` and `backoffice` now start with the default `docker compose up`.

### Work mode documentation

Update root `README.md` with the work mode startup sequence:

```markdown
## Work mode (fast iteration)

```bash
# 1. Start databases only
docker compose up postgres qdrant

# 2. MCP server (terminal 2)
cd apps/mcp-server
poetry run python -m src.server

# 3. Agent API with hot reload (terminal 3)
cd apps/agent-api
poetry run uvicorn main:app --port 8001 --reload

# 4. Consumer web with HMR (terminal 4)
cd apps/consumer-web
npm run dev   # http://localhost:5173
```

All services use localhost. Edit any Python or React file and changes apply immediately without rebuilds.
```

### Root cleanup

By this phase the following old files/directories should all be gone (verify):
- `src/` (fully deleted across Plans 01–02)
- `main.py` (deleted in Plan 02)
- `infra/` (deleted in Plan 05)
- `scripts/` — only `scripts/` entries remaining should be none; delete directory if empty

---

## Acceptance criteria

### Backoffice
- [ ] `apps/backoffice/` exists with all files above
- [ ] `cd apps/backoffice && npm install && npm run build` succeeds
- [ ] Work mode: `npm run dev` serves "Coming soon" page at `:3001`

### Demo mode (full stack)
- [ ] `docker compose up --build` starts all 6 services (postgres, qdrant, mcp-server, agent-api, consumer-web, backoffice)
- [ ] `docker compose ps` shows all 6 as `healthy` (or `running` for services without healthcheck)
- [ ] `open http://localhost:3000` — consumer UI loads; research question streams progress and returns cited answer
- [ ] `open http://localhost:3001` — backoffice loads and shows "Coming soon"
- [ ] Qdrant data persists after `docker compose restart qdrant` (volume mount working)
- [ ] Reports persist after `docker compose restart mcp-server` (volume mount working)

### Work mode (hybrid)
- [ ] `docker compose up postgres qdrant` starts only databases
- [ ] `cd apps/mcp-server && poetry run python -m src.server` starts MCP server on `:8000`
- [ ] `cd apps/agent-api && poetry run uvicorn main:app --port 8001 --reload` starts agent API on `:8001`
- [ ] `cd apps/consumer-web && npm run dev` starts Vite dev server on `:5173`
- [ ] Editing `apps/agent-api/src/agent/nodes.py` — uvicorn hot-reloads without manual restart
- [ ] Editing `apps/consumer-web/src/components/ProgressFeed.tsx` — browser updates via HMR without page reload
- [ ] End-to-end: browser at `:5173` → research question → SSE progress → cited answer

### Monorepo cleanliness
- [ ] Root `src/` directory does not exist
- [ ] Root `main.py` does not exist
- [ ] Root `infra/` directory does not exist
- [ ] `poetry run python -c "import src"` from repo root fails (old module is gone)
