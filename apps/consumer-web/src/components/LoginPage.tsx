import { useState } from 'react'
import { InputField } from './ui/InputField'
import { PrimaryButton } from './ui/PrimaryButton'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  onShowSignup: () => void
}

export function LoginPage({ onLogin, onShowSignup }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col px-8 py-10">
      <p className="text-xs font-semibold tracking-[0.3em] uppercase text-slate-400">
        Research
      </p>

      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-full max-w-sm"
          style={{ animation: 'fadeUp 0.4s ease both' }}
        >
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col gap-8">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
              <p className="text-sm text-slate-500">Sign in to continue your research</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <InputField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <InputField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                error={error}
              />
              <PrimaryButton type="submit" disabled={loading} className="w-full mt-1">
                {loading ? 'Signing in…' : 'Sign in'}
              </PrimaryButton>
            </form>

            <p className="text-sm text-slate-500 text-center">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onShowSignup}
                className="text-blue-600 font-medium hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
