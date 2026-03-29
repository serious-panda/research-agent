import { useState } from 'react'
import { useResearch } from './hooks/useResearch'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './components/LoginPage'
import { SignupPage } from './components/SignupPage'
import { SecondaryButton } from './components/ui/SecondaryButton'
import QuestionForm from './components/QuestionForm'
import ProgressFeed from './components/ProgressFeed'
import AnswerCard from './components/AnswerCard'
import SourceList from './components/SourceList'

export default function App() {
  const { user, isLoading, login, logout, register } = useAuth()
  const { status, events, answer, sources, error, submit, reset } = useResearch()
  const [authView, setAuthView] = useState<'login' | 'signup'>('login')

  if (isLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!user) {
    return authView === 'login'
      ? <LoginPage onLogin={login} onShowSignup={() => setAuthView('signup')} />
      : <SignupPage onSignup={register} onShowLogin={() => setAuthView('login')} />
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <header className="mb-8 pb-6 border-b border-slate-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-bold mb-1.5 text-slate-900">Research Agent</h1>
            <p className="text-slate-500 text-[0.95rem]">
              Ask a question — the agent searches the web and your knowledge base, then synthesises a cited answer.
            </p>
          </div>
          <SecondaryButton type="button" onClick={logout} className="shrink-0">
            Sign out
          </SecondaryButton>
        </div>
      </header>

      <main className="flex flex-col gap-6">
        <QuestionForm status={status} onSubmit={submit} onReset={reset} />

        {status !== 'idle' && <ProgressFeed events={events} />}

        {status === 'error' && (
          <div className="px-5 py-4 border border-red-200 rounded-lg bg-red-50 text-red-800 text-sm flex items-center flex-wrap gap-3">
            <strong>Error:</strong> {error}
            <button
              type="button"
              onClick={reset}
              className="py-1 px-3 text-xs font-semibold bg-white text-red-700 border border-red-200 rounded-md cursor-pointer hover:bg-red-50 transition-colors duration-150"
            >
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
