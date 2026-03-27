import type { NodeName, ProgressRow, SseEvent } from '../types'

const NODE_LABELS: Record<NodeName, string> = {
  classify:   'Classifying',
  answer:     'Answering directly',
  plan:       'Planning queries',
  search:     'Searching',
  reflect:    'Evaluating results',
  synthesize: 'Writing answer',
  save:       'Saving report',
}

function buildRows(events: SseEvent[]): ProgressRow[] {
  const rowMap = new Map<string, ProgressRow>()
  const order: string[] = []

  for (const evt of events) {
    if (evt.event !== 'node_start' && evt.event !== 'node_done') continue
    const key = `${evt.node}-${evt.iteration ?? 0}`

    if (evt.event === 'node_start' && !rowMap.has(key)) {
      rowMap.set(key, { key, node: evt.node, iteration: evt.iteration ?? 0, done: false })
      order.push(key)
    } else if (evt.event === 'node_done') {
      const row = rowMap.get(key)
      if (row) {
        row.done = true
        row.payload = evt.payload
      }
    }
  }

  return order.map(k => rowMap.get(k)!)
}

function rowLabel(row: ProgressRow): string {
  const base = NODE_LABELS[row.node] ?? row.node
  if (row.node === 'search') return `${base} (pass ${row.iteration + 1})`
  return base
}

interface Props {
  events: SseEvent[]
}

export default function ProgressFeed({ events }: Props) {
  const rows = buildRows(events)
  if (rows.length === 0) return null

  return (
    <div className="progress-feed">
      {rows.map(row => (
        <div key={row.key} className={`progress-row ${row.done ? 'done' : 'running'}`}>
          <span className="progress-icon">
            {row.done ? '✓' : <span className="spinner" />}
          </span>
          <div className="progress-content">
            <span className="progress-label">{rowLabel(row)}</span>
            {row.node === 'search' && row.done && Array.isArray(row.payload?.tools_called) && (
              <span className="progress-badges">
                {(row.payload.tools_called as string[]).map(t => (
                  <span key={t} className="badge">{t === 'web_search' ? 'web' : 'kb'}</span>
                ))}
              </span>
            )}
            {row.node === 'reflect' && row.done && row.payload?.sufficient === false && (
              <span className="progress-gap">{String(row.payload.gap ?? '')}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
