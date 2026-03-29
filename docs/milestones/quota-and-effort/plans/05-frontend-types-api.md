# Plan 05: Frontend Types & API Layer

> Source PRD: `docs/milestones/quota-and-effort/prd-quota-and-effort.md`

## Context

Before building UI components, the shared type definitions, API functions, and the `useResearch` hook need to be updated. This plan extends these foundational pieces so the effort parameter flows from the form through to the network call, and quota errors are handled distinctly from SSE-level errors.

---

## What to build

### 1. `apps/consumer-web/src/types.ts`

Add new types and extend the existing `SseEvent` union:

```typescript
// --- new types ---

export type EffortLevel = 'low' | 'medium' | 'high'

export interface UsageInfo {
  searches: number
  links: number
  credits: number
}

export interface QuotaExceededError {
  error: 'quota_exceeded'
  period: 'daily' | 'hourly'
  used: number
  limit: number
  resets_at: string   // ISO 8601
}

export interface QuotaStatus {
  daily:  { used: number; limit: number; resets_at: string }
  hourly: { used: number; limit: number; resets_at: string }
  today:  { researches: number; searches: number; links: number }
}

// --- existing SseEvent — extend done event with usage ---

export type SseEvent =
  | { event: 'node_start'; node: NodeName; iteration: number | null }
  | { event: 'node_done';  node: NodeName; iteration: number | null; payload: Record<string, unknown> }
  | { event: 'done';       answer: string; sources: string[]; thread_id: string; usage: UsageInfo }
  | { event: 'error';      message: string }

// ResearchStatus, NodeName, ProgressRow — unchanged
```

### 2. `apps/consumer-web/src/api/research.ts`

**`streamResearch`** — add `effort` parameter:

```typescript
import type { SseEvent, EffortLevel, QuotaExceededError } from '../types'
import { getAuthHeaders } from './auth'

export async function* streamResearch(
  question: string,
  effort: EffortLevel,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ question, effort }),
    signal,
  })

  if (response.status === 429) {
    const data: QuotaExceededError = await response.json()
    // Throw a typed error so useResearch can distinguish quota failures
    throw Object.assign(new Error('quota_exceeded'), { quotaError: data })
  }

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (!response.body) throw new Error('No response body')

  // SSE parsing — unchanged from existing implementation
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop()!
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data: ')) continue
      try {
        yield JSON.parse(line.slice(6)) as SseEvent
      } catch {}
    }
  }
}
```

**`getUsage`** — new function:

```typescript
import type { QuotaStatus } from '../types'

export async function getUsage(): Promise<QuotaStatus> {
  const res = await fetch('/api/usage', {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`GET /api/usage failed: ${res.status}`)
  return res.json()
}
```

### 3. `apps/consumer-web/src/hooks/useResearch.ts`

Add `effort: EffortLevel` to the `submit` signature and expose `usage` and `quotaError` from state:

```typescript
import { useState, useCallback, useRef } from 'react'
import { streamResearch } from '../api/research'
import type { ResearchStatus, SseEvent, EffortLevel, UsageInfo, QuotaExceededError } from '../types'

interface UseResearchResult {
  status: ResearchStatus
  events: SseEvent[]
  answer: string | null
  sources: string[]
  threadId: string | null
  error: string | null
  usage: UsageInfo | null
  quotaError: QuotaExceededError | null
  submit: (question: string, effort: EffortLevel) => void
  reset: () => void
}

export function useResearch(): UseResearchResult {
  const [status, setStatus]       = useState<ResearchStatus>('idle')
  const [events, setEvents]       = useState<SseEvent[]>([])
  const [answer, setAnswer]       = useState<string | null>(null)
  const [sources, setSources]     = useState<string[]>([])
  const [threadId, setThreadId]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [usage, setUsage]         = useState<UsageInfo | null>(null)
  const [quotaError, setQuotaError] = useState<QuotaExceededError | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const submit = useCallback((question: string, effort: EffortLevel) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setStatus('running')
    setEvents([])
    setAnswer(null)
    setSources([])
    setThreadId(null)
    setError(null)
    setUsage(null)
    setQuotaError(null)

    ;(async () => {
      try {
        for await (const evt of streamResearch(question, effort, ctrl.signal)) {
          if (ctrl.signal.aborted) break

          if (evt.event === 'node_start' || evt.event === 'node_done') {
            setEvents((prev) => [...prev, evt])
          } else if (evt.event === 'done') {
            setAnswer(evt.answer)
            setSources(evt.sources)
            setThreadId(evt.thread_id)
            setUsage(evt.usage)
            setStatus('done')
          } else if (evt.event === 'error') {
            setError(evt.message)
            setStatus('error')
          }
        }
      } catch (err: unknown) {
        const e = err as { name?: string; quotaError?: QuotaExceededError; message?: string }
        if (e.name === 'AbortError') return
        if (e.quotaError) {
          setQuotaError(e.quotaError)
          setStatus('error')
        } else {
          setError(e.message ?? 'Unknown error')
          setStatus('error')
        }
      }
    })()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setEvents([])
    setAnswer(null)
    setSources([])
    setThreadId(null)
    setError(null)
    setUsage(null)
    setQuotaError(null)
  }, [])

  return { status, events, answer, sources, threadId, error, usage, quotaError, submit, reset }
}
```

---

## Verification

```bash
cd apps/consumer-web && npm run build
# → clean TypeScript compile, no errors

# Dev check: open browser, open DevTools Network tab
# Submit a research — verify request body contains { question, effort }
# Inspect done SSE event — verify usage object is present
```

---

## Files modified

| File | Change |
|---|---|
| `apps/consumer-web/src/types.ts` | Add `EffortLevel`, `UsageInfo`, `QuotaExceededError`, `QuotaStatus`; extend `done` event |
| `apps/consumer-web/src/api/research.ts` | Add `effort` param; handle 429; add `getUsage()` |
| `apps/consumer-web/src/hooks/useResearch.ts` | Add `effort` to `submit`; expose `usage`, `quotaError` |
