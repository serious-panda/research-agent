import type { SseEvent, EffortLevel, QuotaExceededError, QuotaStatus } from '../types'
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

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
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
        } catch {
          // skip malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function getUsage(): Promise<QuotaStatus> {
  const res = await fetch('/api/usage', {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error(`GET /api/usage failed: ${res.status}`)
  return res.json()
}
