# Plan 04: Usage Endpoint

> Source PRD: `docs/milestones/quota-and-effort/prd-quota-and-effort.md`

## Context

The settings page needs a single endpoint to fetch the authenticated user's current quota status and today's usage statistics. This plan adds a `GET /api/usage` route backed by the `quota_service.getQuotaStatus()` function built in plan 02.

---

## What to build

### 1. `apps/server/app/modules/research/controllers/usage_controller.ts` (new file)

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { getQuotaStatus } from '#research/services/quota_service'

export default class UsageController {
  async show({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const status = await getQuotaStatus(user.id)
    return response.json(status)
  }
}
```

### 2. `apps/server/start/routes.ts`

Add the usage route inside the existing authenticated group (alongside the research routes):

```typescript
// Add import at top
const UsageController = () => import(
  '#research/controllers/usage_controller'
)

// Inside the authenticated router group:
router.get('/api/usage', [UsageController, 'show']).use(middleware.auth())
```

---

## Response shape

```json
{
  "daily": {
    "used": 120,
    "limit": 200,
    "resets_at": "2025-03-30T00:00:00.000Z"
  },
  "hourly": {
    "used": 15,
    "limit": 50,
    "resets_at": "2025-03-29T15:00:00.000Z"
  },
  "today": {
    "researches": 6,
    "searches": 47,
    "links": 235
  }
}
```

---

## Verification

```bash
cd apps/server && node ace serve --watch

# With a valid token and at least one completed research_usage row in the DB:
curl http://localhost:3333/api/usage \
  -H "Authorization: Bearer <token>"
# → JSON matching the shape above

# Without token:
curl http://localhost:3333/api/usage
# → 401 Unauthorized

# Fresh user with no usage rows:
# → daily.used=0, hourly.used=0, today.researches=0, searches=0, links=0
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/server/app/modules/research/controllers/usage_controller.ts` | Created |
| `apps/server/start/routes.ts` | Add `GET /api/usage` route |
