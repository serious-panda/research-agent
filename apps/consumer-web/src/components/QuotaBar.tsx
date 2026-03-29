interface Props {
  label: string
  used: number
  limit: number
  resetsAt: string   // ISO 8601
}

function formatReset(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function QuotaBar({ label, used, limit, resetsAt }: Props) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const isCritical = pct >= 90

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">
          {used} / {limit} credits · resets {formatReset(resetsAt)}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isCritical ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
