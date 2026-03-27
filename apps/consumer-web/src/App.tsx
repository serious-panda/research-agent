import { useResearch } from './hooks/useResearch'
import QuestionForm from './components/QuestionForm'
import ProgressFeed from './components/ProgressFeed'
import AnswerCard from './components/AnswerCard'
import SourceList from './components/SourceList'

export default function App() {
  const { status, events, answer, sources, error, submit, reset } = useResearch()

  return (
    <div className="app">
      <header className="app-header">
        <h1>Research Agent</h1>
        <p>Ask a question — the agent searches the web and your knowledge base, then synthesises a cited answer.</p>
      </header>

      <main className="app-main">
        <QuestionForm status={status} onSubmit={submit} onReset={reset} />

        {status !== 'idle' && <ProgressFeed events={events} />}

        {status === 'error' && (
          <div className="error-card">
            <strong>Error:</strong> {error}
            <button className="secondary" onClick={reset} style={{ marginLeft: '1rem' }}>
              Try again
            </button>
          </div>
        )}

        {status === 'done' && answer && <AnswerCard answer={answer} />}
        {status === 'done' && <SourceList sources={sources} />}
      </main>
    </div>
  )
}
