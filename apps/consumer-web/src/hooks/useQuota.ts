import { useState, useEffect, useCallback } from 'react'
import { getUsage } from '../api/research'
import type { QuotaStatus } from '../types'

interface UseQuotaResult {
  quota: QuotaStatus | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useQuota(): UseQuotaResult {
  const [quota, setQuota]       = useState<QuotaStatus | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getUsage()
      setQuota(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { quota, isLoading, error, refresh: load }
}
