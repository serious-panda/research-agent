# Plan 07: Settings Page & Quota UI

> Source PRD: `docs/milestones/quota-and-effort/prd-quota-and-effort.md`

## Context

The final frontend plan wires everything together: a `useQuota` hook that fetches live usage data, two display components (`QuotaBar`, `QuotaExceededBanner`), a `SettingsPage` that shows usage bars and the default effort preference, and the final `App.tsx` changes that add view routing, the Settings button, and the quota exceeded banner above the research form.

---

## What to build

### 1. `apps/consumer-web/src/hooks/useQuota.ts` (new file)

```typescript
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
```

Called once on mount when `SettingsPage` renders. The `refresh` function lets the user manually reload — not auto-polled.

### 2. `apps/consumer-web/src/components/QuotaBar.tsx` (new file)

```tsx
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
```

- Under 90%: blue fill
- 90% and above: red fill — visual warning without a full banner

### 3. `apps/consumer-web/src/components/QuotaExceededBanner.tsx` (new file)

```tsx
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
```

### 4. `apps/consumer-web/src/components/SettingsPage.tsx` (new file)

```tsx
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
```

### 5. `apps/consumer-web/src/App.tsx`

Add `appView` state, Settings button, `QuotaExceededBanner`, and render `SettingsPage` when needed:

```tsx
// Add imports
import { useState } from 'react'
import { useEffortPreference } from './hooks/useEffortPreference'
import { EffortSelector } from './components/EffortSelector'   // already added in plan 06
import { QuotaExceededBanner } from './components/QuotaExceededBanner'
import { SettingsPage } from './components/SettingsPage'

// Inside App():
const [appView, setAppView] = useState<'research' | 'settings'>('research')
const { effort, setEffort } = useEffortPreference()             // plan 06

// Settings view — full-page replacement
if (appView === 'settings') {
  return (
    <SettingsPage
      onBack={() => setAppView('research')}
      effort={effort}
      onEffortChange={setEffort}
    />
  )
}

// Header — add Settings button alongside Sign out:
<button
  type="button"
  onClick={() => setAppView('settings')}
  className="text-sm text-slate-500 hover:text-slate-800 transition-colors duration-150"
>
  Settings
</button>

// Above QuestionForm — quota exceeded banner:
{quotaError && (
  <QuotaExceededBanner error={quotaError} onDismiss={reset} />
)}

// QuestionForm — add effort props (from plan 06):
<QuestionForm
  status={status}
  effort={effort}
  onEffortChange={setEffort}
  onSubmit={(q) => submit(q, effort)}
  onReset={reset}
  quotaExceeded={!!quotaError}
/>
```

---

## Verification

```bash
cd apps/consumer-web && npm run build   # TypeScript clean

# Browser:
# 1. Click Settings — SettingsPage renders with daily/hourly bars and today's grid
# 2. Click Refresh — bars reload
# 3. Change default effort in Settings → switch back to research → EffortSelector shows same value
# 4. Trigger 429 (DAILY_QUOTA_CREDITS=5 on server) → amber banner appears above form
# 5. Form textarea + Research button are disabled while banner is shown
# 6. Click ✕ on banner → banner clears, form re-enables
# 7. Bar turns red when used/limit ≥ 0.9
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/consumer-web/src/hooks/useQuota.ts` | Created |
| `apps/consumer-web/src/components/QuotaBar.tsx` | Created |
| `apps/consumer-web/src/components/QuotaExceededBanner.tsx` | Created |
| `apps/consumer-web/src/components/SettingsPage.tsx` | Created |
| `apps/consumer-web/src/App.tsx` | Add `appView` state, Settings button, `QuotaExceededBanner`, `SettingsPage` render |
