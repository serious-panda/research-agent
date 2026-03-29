import type { EffortLevel } from '../types'

interface Option {
  value: EffortLevel
  label: string
  tooltip: string
  dotClass: string
}

const OPTIONS: Option[] = [
  {
    value: 'low',
    label: 'Low',
    tooltip: '1 search pass · ~10 credits',
    dotClass: 'bg-green-500',
  },
  {
    value: 'medium',
    label: 'Medium',
    tooltip: '2 search passes · ~20 credits',
    dotClass: 'bg-amber-400',
  },
  {
    value: 'high',
    label: 'High',
    tooltip: '4 search passes · ~40 credits',
    dotClass: 'bg-red-500',
  },
]

interface Props {
  value: EffortLevel
  onChange: (level: EffortLevel) => void
  disabled?: boolean
}

export function EffortSelector({ value, onChange, disabled }: Props) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 divide-x divide-slate-200 overflow-hidden shadow-xs"
      role="group"
      aria-label="Research effort"
    >
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <div key={opt.value} className="relative group/btn flex-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              aria-pressed={isActive}
              className={[
                'w-full flex items-center justify-center gap-2 px-3.5 py-2 text-sm',
                'transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'bg-white text-slate-500 font-medium hover:bg-slate-50 hover:text-slate-700',
              ].join(' ')}
            >
              {/* Dot indicator */}
              <span
                className={[
                  'inline-block w-2 h-2 rounded-full shrink-0 transition-opacity duration-150',
                  opt.dotClass,
                  isActive ? 'opacity-100' : 'opacity-35',
                ].join(' ')}
                aria-hidden="true"
              />
              {opt.label}
            </button>

            {/* Tooltip */}
            <div
              role="tooltip"
              className={[
                'pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
                'opacity-0 group-hover/btn:opacity-100',
                'translate-y-1 group-hover/btn:translate-y-0',
                'transition-all duration-150',
              ].join(' ')}
            >
              <div className="bg-slate-900 text-white text-xs font-medium rounded-md px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                {opt.tooltip}
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
