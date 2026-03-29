# Plan 06: Effort Selector & QuestionForm

> Source PRD: `docs/milestones/quota-and-effort/prd-quota-and-effort.md`

## Context

Add the effort level preference hook, the `EffortSelector` UI component, and wire both into `QuestionForm`. The selected effort persists in `localStorage` and is shared between the research form and the settings page (both read from `useEffortPreference`). `App.tsx` owns the preference instance and passes it down as props.

---

## What to build

### 1. `apps/consumer-web/src/hooks/useEffortPreference.ts` (new file)

```typescript
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
```

`loadPreference` is called once on first render. Subsequent reads come from React state, so the hook is fast and doesn't re-read localStorage on every render.

### 2. `apps/consumer-web/src/components/EffortSelector.tsx` (new file)

```tsx
import type { EffortLevel } from '../types'

interface Option {
  value: EffortLevel
  label: string
  description: string
}

const OPTIONS: Option[] = [
  { value: 'low',    label: 'Low',    description: '1 search pass · ~10 credits' },
  { value: 'medium', label: 'Medium', description: '2 search passes · ~20 credits' },
  { value: 'high',   label: 'High',   description: '4 search passes · ~40 credits' },
]

interface Props {
  value: EffortLevel
  onChange: (level: EffortLevel) => void
  disabled?: boolean
}

export function EffortSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Research effort">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          title={opt.description}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md border
            transition-colors duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            ${value === opt.value
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
```

- Active button: filled blue (`bg-blue-600 text-white`)
- Inactive: white with slate border
- `title` attribute shows the description on hover — no extra markup needed

### 3. `apps/consumer-web/src/components/QuestionForm.tsx`

Add `effort` and `onEffortChange` props; embed `EffortSelector` in the actions row; disable everything when `quotaExceeded`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ResearchStatus, EffortLevel } from '../types'
import { PrimaryButton } from './ui/PrimaryButton'
import { SecondaryButton } from './ui/SecondaryButton'
import { EffortSelector } from './EffortSelector'

interface Props {
  status: ResearchStatus
  effort: EffortLevel
  onEffortChange: (level: EffortLevel) => void
  onSubmit: (question: string) => void
  onReset: () => void
  quotaExceeded?: boolean
}

export default function QuestionForm({
  status,
  effort,
  onEffortChange,
  onSubmit,
  onReset,
  quotaExceeded = false,
}: Props) {
  const [question, setQuestion] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isRunning = status === 'running'
  const isDisabled = isRunning || quotaExceeded

  useEffect(() => {
    if (status === 'idle') {
      setQuestion('')
      textareaRef.current?.focus()
    }
  }, [status])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSubmit = () => {
    const q = question.trim()
    if (!q || isDisabled) return
    onSubmit(q)
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a research question… (Enter to submit, Shift+Enter for newline)"
        rows={3}
        disabled={isDisabled}
        autoFocus
        className="w-full px-4 py-3 border border-slate-200 rounded-lg text-base font-[inherit] resize-y outline-none transition-colors duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <EffortSelector value={effort} onChange={onEffortChange} disabled={isDisabled} />
        <PrimaryButton
          type="button"
          onClick={handleSubmit}
          disabled={isDisabled || !question.trim()}
        >
          {isRunning ? 'Researching…' : 'Research'}
        </PrimaryButton>
        {(status === 'done' || status === 'error') && !quotaExceeded && (
          <SecondaryButton type="button" onClick={onReset}>
            New question
          </SecondaryButton>
        )}
      </div>
    </div>
  )
}
```

### 4. `apps/consumer-web/src/App.tsx`

Add `useEffortPreference` and pass props to `QuestionForm`. The effort preference is instantiated once here so it is shared between the form and the settings page (plan 07):

```tsx
// Add import
import { useEffortPreference } from './hooks/useEffortPreference'

// Inside App():
const { effort, setEffort } = useEffortPreference()

// Update submit handler
const handleSubmit = (question: string) => submit(question, effort)

// Update QuestionForm JSX
<QuestionForm
  status={status}
  effort={effort}
  onEffortChange={setEffort}
  onSubmit={handleSubmit}
  onReset={reset}
  quotaExceeded={!!quotaError}
/>
```

---

## Verification

```bash
cd apps/consumer-web && npm run build   # TypeScript clean

# Browser:
# 1. Open app — EffortSelector shows Low / Med / High; Medium is active by default
# 2. Click Low — button turns blue, Medium turns white
# 3. Reload page — Low is still active (localStorage persisted)
# 4. Submit a research — DevTools Network shows request body: { question, effort: "low" }
# 5. When research is running — all three buttons are disabled (opacity-50)
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/consumer-web/src/hooks/useEffortPreference.ts` | Created |
| `apps/consumer-web/src/components/EffortSelector.tsx` | Created |
| `apps/consumer-web/src/components/QuestionForm.tsx` | Add effort props + EffortSelector in actions row |
| `apps/consumer-web/src/App.tsx` | Add `useEffortPreference`; wire effort to QuestionForm |
