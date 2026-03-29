# Plan 03: Research Controller Update

> Source PRD: `docs/milestones/quota-and-effort/prd-quota-and-effort.md`

## Context

The research controller currently does a simple passthrough — it returns the upstream `fetch()` response directly to AdonisJS, which pipes it to the client. This plan replaces that with a **TransformStream interceptor** that:

1. Validates the `effort` param and checks the user's quota (→ 429 if exceeded)
2. Pre-reserves credits in the DB before the stream starts
3. Passes all SSE bytes to the client **unchanged**
4. In-band parses the `done` event to extract actual usage and update the DB record (fire-and-forget)
5. Marks the record as `failed` if the agent returns an error event

---

## What to build

### `apps/server/app/modules/research/controllers/research_controller.ts`

Full replacement of the existing file:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import {
  checkQuota,
  reserveCredits,
  updateUsage,
  markFailed,
} from '#research/services/quota_service'

const EFFORT_COST: Record<string, number> = {
  low:    10,
  medium: 20,
  high:   40,
}

export default class ResearchController {
  async stream({ request, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const body = request.body() as {
      question: string
      effort?: string
      thread_id?: string
    }
    const effort = body.effort ?? 'high'
    const estimatedCost = EFFORT_COST[effort] ?? EFFORT_COST.high

    // 1. Pre-check quota
    const check = await checkQuota(user.id, estimatedCost)
    if (!check.allowed) {
      return response.status(429).json({
        error: 'quota_exceeded',
        period: check.exceeded,
        used: check.used,
        limit: check.limit,
        resets_at: check.resets_at,
      })
    }

    // 2. Pre-reserve credits
    const threadId = body.thread_id ?? crypto.randomUUID()
    const usageId = await reserveCredits(user.id, effort, estimatedCost, threadId)

    // 3. Forward to agent-api
    let upstream: Response
    try {
      upstream = await fetch(`${env.get('AGENT_API_URL')}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: body.question, effort, thread_id: threadId }),
      })
    } catch (err) {
      await markFailed(usageId)
      throw err
    }

    if (!upstream.ok || !upstream.body) {
      await markFailed(usageId)
      return response.status(upstream.status).send(await upstream.text())
    }

    // 4. TransformStream: pass bytes unchanged, intercept done/error events
    let sseBuffer = ''
    const decoder = new TextDecoder()

    const interceptor = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // Always enqueue first — don't block the stream
        controller.enqueue(chunk)

        // Accumulate and parse SSE events
        sseBuffer += decoder.decode(chunk, { stream: true })
        const parts = sseBuffer.split('\n\n')
        sseBuffer = parts.pop()!   // keep incomplete trailing fragment

        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(trimmed.slice(6))
            if (evt.event === 'done' && evt.usage) {
              // Fire-and-forget: do not await inside transform()
              updateUsage(usageId, evt.usage.credits, evt.usage.searches, evt.usage.links)
                .catch((e) => console.error('[research] updateUsage failed:', e))
            } else if (evt.event === 'error') {
              markFailed(usageId)
                .catch((e) => console.error('[research] markFailed failed:', e))
            }
          } catch {
            // Malformed JSON — ignore
          }
        }
      },

      flush() {
        // Handle any remaining buffer at stream end (e.g. stream closed mid-event)
        const trimmed = sseBuffer.trim()
        if (!trimmed.startsWith('data: ')) return
        try {
          const evt = JSON.parse(trimmed.slice(6))
          if (evt.event === 'done' && evt.usage) {
            updateUsage(usageId, evt.usage.credits, evt.usage.searches, evt.usage.links)
              .catch((e) => console.error('[research] flush updateUsage failed:', e))
          }
        } catch {}
      },
    })

    upstream.body.pipeTo(interceptor.writable)

    // 5. Return as SSE response — AdonisJS accepts a Web API Response
    return new Response(interceptor.readable, {
      headers: {
        'Content-Type':     'text/event-stream',
        'Cache-Control':    'no-cache',
        'X-Accel-Buffering': 'no',    // prevents nginx buffering SSE
      },
    })
  }

  async show({ params, response }: HttpContext) {
    const upstream = await fetch(
      `${env.get('AGENT_API_URL')}/api/research/${params.id}`
    )
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }
}
```

#### Key design decisions

- `controller.enqueue(chunk)` is called **before** any buffer parsing so the client never waits on DB operations.
- `updateUsage` and `markFailed` are fire-and-forget inside the `transform` callback. The `TransformStream` spec does not support async `transform` functions — awaiting would stall the stream.
- A single `TextDecoder` instance is created per request (in the outer closure) for efficiency.
- The `flush` hook catches the rare case where the stream ends without a trailing `\n\n`.
- The existing `show` method is unchanged.

---

## Verification

```bash
# Prerequisites: postgres running, agent-api running on :8001, migration applied (plan 02)
cd apps/server && node ace serve --watch

# Happy path
curl -N -X POST http://localhost:3333/api/research \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is TypeScript?","effort":"low"}'
# → SSE stream flows; check research_usage row: status should flip to 'completed'

# Quota exceeded — set DAILY_QUOTA_CREDITS=5 in .env, then:
curl -X POST http://localhost:3333/api/research \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"question":"test","effort":"medium"}'
# → HTTP 429
# → {"error":"quota_exceeded","period":"daily","used":0,"limit":5,"resets_at":"..."}

# Failed agent — stop agent-api, then POST research
# → research_usage row: status='failed'; no credits consumed
```

---

## Files modified

| File | Action |
|---|---|
| `apps/server/app/modules/research/controllers/research_controller.ts` | Full rewrite |
