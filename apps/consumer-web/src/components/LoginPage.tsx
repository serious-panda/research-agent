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
    <div className="min-h-screen bg-[--color-surface] flex flex-col px-8 py-10">
      {/* Wordmark */}
      <p className="font-[--font-serif] text-xs tracking-[0.35em] uppercase text-[--color-muted]">
        Research
      </p>

      {/* Centered form */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-full max-w-sm flex flex-col gap-10"
          style={{ animation: 'fadeUp 0.4s ease both' }}
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl text-[--color-ink] font-normal" style={{ fontFamily: 'var(--font-serif)' }}>
              Welcome back
            </h1>
            <p className="text-sm text-[--color-muted]">Sign in to continue your research</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-7">
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
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </form>

          <p className="text-sm text-[--color-muted] text-center">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={onShowSignup}
              className="bg-transparent border-none p-0 text-sm text-[--color-ink] underline underline-offset-2 cursor-pointer hover:text-[--color-accent] transition-colors duration-150"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
