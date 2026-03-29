import { useQuota } from '../hooks/useQuota'
import { QuotaBar } from './QuotaBar'
import { EffortSelector } from './EffortSelector'
import type { EffortLevel } from '../types'

interface Props {
  onBack: () => void
  effort: EffortLevel
  onEffortChange: (level: EffortLevel) => void
}

export function SettingsPage({ onBack, effort, onEffortChange }: Props) {
  const { quota, isLoading, error, refresh } = useQuota()

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors duration-150"
        >
          ← Back
        </button>
        <h1 className="text-sm font-semibold text-slate-800">Settings</h1>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10 flex flex-col gap-8">

        {/* Usage section */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Usage</h2>
            <button
              type="button"
              onClick={refresh}
              disabled={isLoading}
              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors duration-150"
            >
              {isLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {quota && (
            <>
              <div className="flex flex-col gap-4">
                <QuotaBar
                  label="Daily"
                  used={quota.daily.used}
                  limit={quota.daily.limit}
                  resetsAt={quota.daily.resets_at}
                />
                <QuotaBar
                  label="Hourly"
                  used={quota.hourly.used}
                  limit={quota.hourly.limit}
                  resetsAt={quota.hourly.resets_at}
                />
              </div>

              {/* Today's stats */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                {[
                  { label: 'Researches', value: quota.today.researches },
                  { label: 'Searches',   value: quota.today.searches   },
                  { label: 'Links read', value: quota.today.links       },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 text-center"
                  >
                    <p className="text-lg font-semibold text-slate-800">{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Preferences section */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-800">Preferences</h2>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-600">Default research effort</label>
            <EffortSelector value={effort} onChange={onEffortChange} />
            <p className="text-xs text-slate-400">
              Saved automatically · applies to new research sessions
            </p>
          </div>
        </section>

      </main>
    </div>
  )
}
