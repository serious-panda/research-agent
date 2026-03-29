# Plan 03: Research Proxy Module

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

Add the research proxy: `POST /api/research` (SSE stream) and `GET /api/research/:id` (JSON). Both require authentication. The SSE route is the critical one — AdonisJS v6 supports returning a native `Response` from a controller, which Node.js streams back to the client without buffering.

---

## What to build

### 1. Research controller

File: `app/research/controllers/research_controller.ts`

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'

export default class ResearchController {
  /**
   * SSE proxy — streams agent-api response directly to the browser.
   * AdonisJS v6 natively pipes a native Response without buffering.
   */
  async stream({ request, auth }: HttpContext) {
    await auth.authenticate()

    const body = request.body()
    const upstream = await fetch(`${env.get('AGENT_API_URL')}/api/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    return upstream   // AdonisJS streams the native Response back to client
  }

  /**
   * Fetch a completed research run by thread_id.
   */
  async show({ params, auth, response }: HttpContext) {
    await auth.authenticate()

    const upstream = await fetch(
      `${env.get('AGENT_API_URL')}/api/research/${params.id}`
    )
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }
}
```

### 2. Routes (`start/routes.ts`)

Add inside the protected group (alongside auth routes that use `middleware.auth()`):

```typescript
import ResearchController from '#research/controllers/research_controller'

// Inside the protected group:
router.post('/research',    [ResearchController, 'stream'])
router.get('/research/:id', [ResearchController, 'show'])
```

Or alternatively, apply auth middleware per-route:

```typescript
router.group(() => {
  router.post('/research',    [ResearchController, 'stream'])
  router.get('/research/:id', [ResearchController, 'show'])
}).use(middleware.auth()).prefix('/api')
```

### 3. No additional config needed

`AGENT_API_URL` is already registered in `start/env.ts` (task 01). The native `fetch()` is available in Node 22.

---

## SSE flow through the stack

```
Browser
  ↓ fetch POST /api/research  (Authorization: Bearer oat_...)
nginx  (proxy_buffering off)
  ↓ proxy_pass to server:3333
AdonisJS ResearchController.stream()
  ↓ fetch POST agent-api:8001/api/research
  ← native Response (text/event-stream)
  ← returned to AdonisJS runtime → piped to client
nginx
  ← chunked SSE events
Browser ReadableStream parser
```

No intermediate buffering at any layer. The existing `proxy_buffering off` in nginx.conf stays (updated in task 06 to point at server:3333).

---

## Verification

```bash
# Start stack (postgres + qdrant + mcp-server + agent-api must be running)
node ace serve --watch &

# Get a token first (from task 02)
TOKEN=$(curl -s -X POST localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"secret123"}' | jq -r '.token.value')

# Stream a research question — should see SSE events
curl -N -X POST localhost:3333/api/research \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question":"What is LangGraph?"}'
# → data: {"event":"node_start","node":"classify",...}
# → data: {"event":"node_done",...}
# → ...
# → data: {"event":"done","answer":"...","sources":[...]}

# Without token → 401
curl -X POST localhost:3333/api/research \
  -H 'Content-Type: application/json' \
  -d '{"question":"test"}'
```

---

## Files created/modified

| File | Action |
|---|---|
| `app/research/controllers/research_controller.ts` | Created |
| `start/routes.ts` | Modified — research routes added |
