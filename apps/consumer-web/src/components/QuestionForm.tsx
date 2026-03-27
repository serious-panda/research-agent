import { useEffect, useRef, useState } from 'react'
import type { ResearchStatus } from '../types'

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
    <div className="question-form">
      <textarea
        ref={textareaRef}
        value={question}
        onChange={e => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a research question… (Enter to submit, Shift+Enter for newline)"
        rows={3}
        disabled={isRunning}
        autoFocus
      />
      <div className="question-form-actions">
        <button onClick={handleSubmit} disabled={isRunning || !question.trim()}>
          {isRunning ? 'Researching…' : 'Research'}
        </button>
        {(status === 'done' || status === 'error') && (
          <button className="secondary" onClick={onReset}>
            New question
          </button>
        )}
      </div>
    </div>
  )
}
