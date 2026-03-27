export type NodeName =
  | 'classify' | 'answer' | 'plan' | 'search'
  | 'reflect' | 'synthesize' | 'save'

export type SseEvent =
  | { event: 'node_start'; node: NodeName; iteration: number | null }
  | { event: 'node_done';  node: NodeName; iteration: number | null; payload: Record<string, unknown> }
  | { event: 'done';       answer: string; sources: string[]; thread_id: string }
  | { event: 'error';      message: string }

export type ResearchStatus = 'idle' | 'running' | 'done' | 'error'

export interface ProgressRow {
  key: string
  node: NodeName
  iteration: number
  done: boolean
  payload?: Record<string, unknown>
}
