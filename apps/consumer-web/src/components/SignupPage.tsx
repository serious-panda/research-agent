import { useState } from 'react'
import { InputField } from './ui/InputField'
import { PrimaryButton } from './ui/PrimaryButton'

interface Props {
  onSignup: (email: string, password: string, fullName?: string) => Promise<void>
  onShowLogin: () => void
}

export function SignupPage({ onSignup, onShowLogin }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSignup(email, password, fullName || undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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
              <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
              <p className="text-sm text-slate-500">Start researching in seconds</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <InputField
                label="Full name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                placeholder="Optional"
              />
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
                autoComplete="new-password"
                required
                error={error}
              />
              <PrimaryButton type="submit" disabled={loading} className="w-full mt-1">
                {loading ? 'Creating account…' : 'Create account'}
              </PrimaryButton>
            </form>

            <p className="text-sm text-slate-500 text-center">
              Already have an account?{' '}
              <button
                type="button"
                onClick={onShowLogin}
                className="text-blue-600 font-medium hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
