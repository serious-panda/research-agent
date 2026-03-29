# Plan 04: Reports Proxy Module

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

Add the reports proxy: `GET /api/reports` (list) and `GET /api/reports/:id` (detail). Both are non-streaming JSON endpoints. These forward to agent-api, which in turn proxies to mcp-server — the AdonisJS server does not talk to mcp-server directly.

---

## What to build

### 1. Reports controller

File: `app/reports/controllers/reports_controller.ts`

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'

export default class ReportsController {
  async index({ auth, response }: HttpContext) {
    await auth.authenticate()

    const upstream = await fetch(`${env.get('AGENT_API_URL')}/api/reports`)
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }

  async show({ params, auth, response }: HttpContext) {
    await auth.authenticate()

    const upstream = await fetch(
      `${env.get('AGENT_API_URL')}/api/reports/${params.id}`
    )
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }
}
```

### 2. Routes (`start/routes.ts`)

Add to the protected group:

```typescript
import ReportsController from '#reports/controllers/reports_controller'

router.get('/reports',    [ReportsController, 'index'])
router.get('/reports/:id', [ReportsController, 'show'])
```

---

## Verification

```bash
TOKEN=$(curl -s -X POST localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"secret123"}' | jq -r '.token.value')

curl localhost:3333/api/reports -H "Authorization: Bearer $TOKEN"
# → [] (or list of reports if any saved)

# Without token → 401
curl localhost:3333/api/reports
```

---

## Files created/modified

| File | Action |
|---|---|
| `app/reports/controllers/reports_controller.ts` | Created |
| `start/routes.ts` | Modified — reports routes added |
