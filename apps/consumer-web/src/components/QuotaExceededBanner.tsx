import type { QuotaExceededError } from '../types'

interface Props {
  error: QuotaExceededError
  onDismiss: () => void
}

function formatReset(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function QuotaExceededBanner({ error, onDismiss }: Props) {
  const period = error.period === 'daily' ? 'Daily' : 'Hourly'

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
      <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-amber-800">
          {period} research limit reached
        </p>
        <p className="text-amber-700 mt-0.5">
          {error.used} / {error.limit} credits used. Resets {formatReset(error.resets_at)}.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors duration-150"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
