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
              Create your account
            </h1>
            <p className="text-sm text-[--color-muted]">Start researching in seconds</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-7">
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
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </PrimaryButton>
          </form>

          <p className="text-sm text-[--color-muted] text-center">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onShowLogin}
              className="bg-transparent border-none p-0 text-sm text-[--color-ink] underline underline-offset-2 cursor-pointer hover:text-[--color-accent] transition-colors duration-150"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
