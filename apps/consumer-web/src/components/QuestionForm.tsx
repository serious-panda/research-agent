import { useEffect, useRef, useState } from 'react'
import type { ResearchStatus } from '../types'
import { PrimaryButton } from './ui/PrimaryButton'
import { SecondaryButton } from './ui/SecondaryButton'

interface Props {
  status: ResearchStatus
  onSubmit: (question: string) => void
  onReset: () => void
}

export default function QuestionForm({ status, onSubmit, onReset }: Props) {
  const [question, setQuestion] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isRunning = status === 'running'

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
    if (!q || isRunning) return
    onSubmit(q)
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a research question… (Enter to submit, Shift+Enter for newline)"
        rows={3}
        disabled={isRunning}
        autoFocus
        className="w-full px-4 py-3 border border-slate-200 rounded-lg text-base font-[inherit] resize-y outline-none transition-colors duration-150 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <div className="flex gap-3">
        <PrimaryButton type="button" onClick={handleSubmit} disabled={isRunning || !question.trim()}>
          {isRunning ? 'Researching…' : 'Research'}
        </PrimaryButton>
        {(status === 'done' || status === 'error') && (
          <SecondaryButton type="button" onClick={onReset}>New question</SecondaryButton>
        )}
      </div>
    </div>
  )
}
