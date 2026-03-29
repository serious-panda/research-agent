export type NodeName =
  | 'classify' | 'answer' | 'plan' | 'search'
  | 'reflect' | 'synthesize' | 'save'

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

export type SseEvent =
  | { event: 'node_start'; node: NodeName; iteration: number | null }
  | { event: 'node_done';  node: NodeName; iteration: number | null; payload: Record<string, unknown> }
  | { event: 'done';       answer: string; sources: string[]; thread_id: string; usage: UsageInfo }
  | { event: 'error';      message: string }

export type ResearchStatus = 'idle' | 'running' | 'done' | 'error'

export interface ProgressRow {
  key: string
  node: NodeName
  iteration: number
  done: boolean
  payload?: Record<string, unknown>
}
