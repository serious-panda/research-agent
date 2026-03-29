# Plan 08: Cleanup

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

With `apps/server` handling all browser-facing traffic, agent-api is now internal only. Remove the wide-open CORS middleware from agent-api and remove its host port binding from docker-compose. This tightens the security posture and makes the internal-only intent explicit.

---

## What to build

### 1. Remove CORS from agent-api (`apps/agent-api/main.py`)

Remove the `CORSMiddleware` block:

```python
# Remove these lines:
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

The browser never sends requests directly to agent-api, so CORS headers are meaningless. Removing them also prevents any accidental direct browser access from working.

### 2. Remove agent-api host port (`docker-compose.yml`)

```yaml
agent-api:
  # Remove:
  # ports:
  #   - "8001:8001"
```

agent-api remains reachable inside the Docker network as `agent-api:8001` but is not accessible from the host machine. This prevents direct API access bypassing auth.

---

## Verification

```bash
docker compose up --build

# agent-api port should NOT be accessible from host
curl localhost:8001/health  # should fail / connection refused

# Everything still works through the server → agent-api path
curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"secret123"}' | jq '.token.value'

# Full research flow still works
# Browser: localhost:3000 → login → research → SSE streams
```

---

## Files modified

| File | Change |
|---|---|
| `apps/agent-api/main.py` | Remove `CORSMiddleware` import and `add_middleware` call |
| `docker-compose.yml` | Remove `ports:` from `agent-api` service |
