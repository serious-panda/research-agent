import { useCallback, useRef, useState } from 'react'
import { streamResearch } from '../api/research'
import type { ResearchStatus, SseEvent } from '../types'

interface UseResearchResult {
  status: ResearchStatus
  events: SseEvent[]
  answer: string | null
  sources: string[]
  threadId: string | null
  error: string | null
  submit: (question: string) => void
  reset: () => void
}

export function useResearch(): UseResearchResult {
  const [status, setStatus] = useState<ResearchStatus>('idle')
  const [events, setEvents] = useState<SseEvent[]>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const submit = useCallback(async (question: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setStatus('running')
    setEvents([])
    setAnswer(null)
    setSources([])
    setThreadId(null)
    setError(null)

    try {
      for await (const evt of streamResearch(question, ctrl.signal)) {
        if (ctrl.signal.aborted) break
        if (evt.event === 'node_start' || evt.event === 'node_done') {
          setEvents(prev => [...prev, evt])
        } else if (evt.event === 'done') {
          setAnswer(evt.answer)
          setSources(evt.sources)
          setThreadId(evt.thread_id)
          setStatus('done')
        } else if (evt.event === 'error') {
          setError(evt.message)
          setStatus('error')
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message ?? 'Unknown error')
        setStatus('error')
      }
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setEvents([])
    setAnswer(null)
    setSources([])
    setThreadId(null)
    setError(null)
  }, [])

  return { status, events, answer, sources, threadId, error, submit, reset }
}
