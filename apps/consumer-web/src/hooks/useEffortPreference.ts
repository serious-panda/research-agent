import { useState, useCallback } from 'react'
import type { EffortLevel } from '../types'

const STORAGE_KEY = 'research_default_effort'

function loadPreference(): EffortLevel {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'low' || stored === 'medium' || stored === 'high') return stored
  return 'medium'
}

export function useEffortPreference() {
  const [effort, setEffortState] = useState<EffortLevel>(loadPreference)

  const setEffort = useCallback((level: EffortLevel) => {
    localStorage.setItem(STORAGE_KEY, level)
    setEffortState(level)
  }, [])

  return { effort, setEffort }
}
