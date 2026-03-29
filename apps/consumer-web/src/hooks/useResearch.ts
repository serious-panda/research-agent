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
  const [status, setStatus]           = useState<ResearchStatus>('idle')
  const [events, setEvents]           = useState<SseEvent[]>([])
  const [answer, setAnswer]           = useState<string | null>(null)
  const [sources, setSources]         = useState<string[]>([])
  const [threadId, setThreadId]       = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [usage, setUsage]             = useState<UsageInfo | null>(null)
  const [quotaError, setQuotaError]   = useState<QuotaExceededError | null>(null)
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
