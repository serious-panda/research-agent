# Plan 05: Docker Integration

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

Containerize `apps/server` and wire it into docker-compose. Migrations run automatically on container startup before the server process begins. agent-api loses its host port binding (internal-only).

---

## What to build

### 1. `apps/server/Dockerfile`

Standard AdonisJS v6 multi-stage build:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node ace build

# Stage 2: Production runtime
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build .
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3333
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]
```

Notes:
- `node ace build` compiles TypeScript to `build/`
- `node ace migration:run --force` runs pending migrations on startup; safe to re-run (idempotent)
- The `build/` directory contains a compiled `ace` binary — no TypeScript runtime needed in production

### 2. `docker-compose.yml` changes

Add `server` service:

```yaml
server:
  build:
    context: apps/server
  environment:
    APP_KEY: ${APP_KEY}
    DB_HOST: postgres
    DB_PORT: 5432
    DB_USER: ${POSTGRES_USER:-research}
    DB_PASSWORD: ${POSTGRES_PASSWORD}
    DB_DATABASE: ${POSTGRES_DB:-research}
    AGENT_API_URL: http://agent-api:8001
    NODE_ENV: production
    LOG_LEVEL: ${LOG_LEVEL:-info}
  depends_on:
    postgres:
      condition: service_healthy
    agent-api:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "node", "-e",
           "fetch('http://localhost:3333/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
    interval: 5s
    timeout: 5s
    retries: 10
    start_period: 15s
```

Remove host port from `agent-api`:

```yaml
agent-api:
  # Remove or comment out:
  # ports:
  #   - "8001:8001"
```

Update `consumer-web` depends_on:

```yaml
consumer-web:
  depends_on:
    server:
      condition: service_healthy
    # remove: agent-api
```

### 3. `.env.example` additions

```env
# AdonisJS server
APP_KEY=<generate: cd apps/server && node ace generate:key>
```

---

## Verification

```bash
# From repo root
docker compose up --build server

# Check health
curl localhost:3333/health   # only if port is temporarily bound for testing
# OR check via docker
docker compose exec server node -e "fetch('http://localhost:3333/health').then(r=>r.json()).then(console.log)"

# Full stack
docker compose up --build
# server logs should show: "Migrations completed" then "HTTP server started on 0.0.0.0:3333"
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/server/Dockerfile` | Created |
| `docker-compose.yml` | Modified — add server, remove agent-api port |
| `.env.example` | Modified — add APP_KEY |
