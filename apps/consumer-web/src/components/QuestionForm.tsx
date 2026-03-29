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
