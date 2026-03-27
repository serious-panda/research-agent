# Plan 05: Docker Compose — Demo Mode

> Source PRD: `docs//milestones/web-interface/prd-monorepo-web.md`

## Context

After Plans 01–04, all services exist as standalone apps. This phase wires them together with a root `docker-compose.yml` so the entire stack starts with one command. It also rewrites `.env.example` to work for both demo and work mode, and writes Dockerfiles for `agent-api` and `packages/rag` (the `mcp-server` Dockerfile was written in Plan 04). Consumer web and backoffice are not yet built — they are added in Plans 06 and 07; their service entries are stubbed here so the compose file is complete.

## Architectural decisions

- **Compose file location**: repo root (not `infra/`) — eliminates `../` path hacks in volume mounts
- **Inter-service URLs**: `POSTGRES_DSN`, `QDRANT_URL`, `MCP_SERVER_URL` are set inline in compose using Docker hostnames — not from `.env` — so the same `.env` works for both modes
- **Health checks**: every service has a `healthcheck`; application services use `depends_on: condition: service_healthy`
- **Volume mounts**: `./qdrant_storage` → Qdrant storage; `./reports` → MCP server reports (both gitignored, persisted across restarts)
- **Build contexts**: `agent-api` uses repo root as context (needs `packages/rag`); `mcp-server`, `consumer-web`, `backoffice` use their own app directory

## Port map

| Port | Service |
|---|---|
| 5432 | postgres |
| 6333 | qdrant |
| 8000 | mcp-server |
| 8001 | agent-api |
| 3000 | consumer-web (Plan 06) |
| 3001 | backoffice (Plan 07) |

## What to build

### `docker-compose.yml` (repo root)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: ["./qdrant_storage:/qdrant/storage:z"]
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:6333/healthz || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 10

  mcp-server:
    build: { context: apps/mcp-server }
    ports: ["8000:8000"]
    volumes: ["./reports:/app/reports"]
    environment:
      REPORTS_DIR: /app/reports
      MCP_PORT: "8000"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8000/health || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 10

  agent-api:
    build:
      context: .
      dockerfile: apps/agent-api/Dockerfile
    ports: ["8001:8001"]
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o}
      POSTGRES_DSN: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      QDRANT_URL: http://qdrant:6333
      MCP_SERVER_URL: http://mcp-server:8000/sse
      MAX_ITERATIONS: ${MAX_ITERATIONS:-5}
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
    depends_on:
      postgres:   { condition: service_healthy }
      qdrant:     { condition: service_healthy }
      mcp-server: { condition: service_healthy }
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8001/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  consumer-web:
    build: { context: apps/consumer-web }
    ports: ["3000:80"]
    depends_on:
      agent-api: { condition: service_healthy }
    profiles: ["web"]   # excluded from `docker compose up` until Plan 06

  backoffice:
    build: { context: apps/backoffice }
    ports: ["3001:80"]
    profiles: ["web"]   # excluded from `docker compose up` until Plan 07
```

`consumer-web` and `backoffice` use the `web` profile so they are excluded from the default `docker compose up` until they exist. Include them with `docker compose --profile web up`.

### `apps/agent-api/Dockerfile`

Build context is the repo root so `packages/rag` is accessible.

```dockerfile
FROM python:3.12-slim
WORKDIR /app

RUN pip install poetry==1.8.3 && poetry config virtualenvs.create false

# Install packages/rag first (infrequent changes → good cache layer)
COPY packages/rag /packages/rag
RUN pip install /packages/rag

# Install agent-api deps
COPY apps/agent-api/pyproject.toml apps/agent-api/poetry.lock ./
RUN poetry install --no-interaction --no-root

# Copy source
COPY apps/agent-api/src ./src
COPY apps/agent-api/main.py .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### `.env.example` (repo root, replaces `infra/.env.example`)

```bash
# Required
OPENAI_API_KEY=

# Postgres credentials (used by docker-compose.yml and work-mode POSTGRES_DSN)
POSTGRES_USER=research
POSTGRES_PASSWORD=
POSTGRES_DB=research

# Work mode — services connect to localhost (Docker maps these ports)
POSTGRES_DSN=postgresql://research:${POSTGRES_PASSWORD}@localhost:5432/research
QDRANT_URL=http://localhost:6333
MCP_SERVER_URL=http://localhost:8000/sse

# Optional
OPENAI_MODEL=gpt-4o
MAX_ITERATIONS=5
LOG_LEVEL=INFO
```

### Cleanup

- Delete `infra/docker-compose.yml`
- Delete `infra/.env.example`
- Delete `infra/` directory
- Delete `scripts/start_docker.sh`
- Delete `scripts/run_agent.sh`

---

## Acceptance criteria

- [ ] `docker-compose.yml` exists at repo root
- [ ] `cp .env.example .env` (fill in `OPENAI_API_KEY` and `POSTGRES_PASSWORD`) → `docker compose up --build` starts all 4 services (postgres, qdrant, mcp-server, agent-api)
- [ ] `docker compose ps` shows all 4 services as `healthy`
- [ ] `curl http://localhost:8001/health` returns `{"status": "ok"}`
- [ ] `curl -N -X POST http://localhost:8001/api/research -H "Content-Type: application/json" -d '{"question":"What is useMemo?"}'` streams SSE events and ends with `"event":"done"`
- [ ] `curl http://localhost:8000/health` returns `{"status": "ok"}`
- [ ] `infra/` directory deleted
- [ ] `scripts/start_docker.sh` and `scripts/run_agent.sh` deleted
- [ ] Work mode still functional: `docker compose up postgres qdrant` + services started locally connects without error
