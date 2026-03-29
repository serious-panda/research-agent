import { useState } from 'react'
import { useResearch } from './hooks/useResearch'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './components/LoginPage'
import { SignupPage } from './components/SignupPage'
import QuestionForm from './components/QuestionForm'
import ProgressFeed from './components/ProgressFeed'
import AnswerCard from './components/AnswerCard'
import SourceList from './components/SourceList'

export default function App() {
  const { user, isLoading, login, logout, register } = useAuth()
  const { status, events, answer, sources, error, submit, reset } = useResearch()
  const [authView, setAuthView] = useState<'login' | 'signup'>('login')

  if (isLoading) return <div>Loading…</div>
  if (!user) {
    return authView === 'login'
      ? <LoginPage onLogin={login} onShowSignup={() => setAuthView('signup')} />
      : <SignupPage onSignup={register} onShowLogin={() => setAuthView('login')} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Research Agent</h1>
        <p>Ask a question — the agent searches the web and your knowledge base, then synthesises a cited answer.</p>
        <button className="secondary" onClick={logout}>Sign out</button>
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
