# Plan 09: Signup Page

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

The backend already exposes `POST /api/auth/register`. Add a signup form to the React SPA so new users can self-register without CLI access. The login and signup pages share the same unauthenticated slot in `App.tsx` and toggle between each other via a link.

---

## What to build

### 1. `src/api/auth.ts` — add `register()`

```typescript
export async function register(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Registration failed')
  }
  const data = await res.json()
  localStorage.setItem('auth_token', data.token.value)
}
```

### 2. `src/hooks/useAuth.ts` — expose `register`

```typescript
import { login as apiLogin, logout as apiLogout, register as apiRegister, getMe } from '../api/auth'

// Add inside useAuth():
async function register(email: string, password: string) {
  await apiRegister(email, password)
  const me = await getMe()
  setUser(me)
}

return { user, isLoading, login, logout, register }
```

### 3. `src/components/SignupPage.tsx` — new file

```tsx
import { useState } from 'react'

interface Props {
  onSignup: (email: string, password: string) => Promise<void>
  onShowLogin: () => void
}

export function SignupPage({ onSignup, onShowLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSignup(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <h1>Research Agent</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account?{' '}
        <button className="link" onClick={onShowLogin}>Sign in</button>
      </p>
    </div>
  )
}
```

### 4. `src/components/LoginPage.tsx` — add link to signup

Add a "Create account" link below the submit button:

```tsx
interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  onShowSignup: () => void
}

// Inside the returned JSX, after the </form>:
<p>
  No account?{' '}
  <button className="link" onClick={onShowSignup}>Create one</button>
</p>
```

### 5. `src/App.tsx` — add signup view toggle

```tsx
import { useState } from 'react'
import { SignupPage } from './components/SignupPage'

// Inside App(), alongside the auth gate:
const [authView, setAuthView] = useState<'login' | 'signup'>('login')

if (isLoading) return <div>Loading…</div>
if (!user) {
  return authView === 'login'
    ? <LoginPage onLogin={login} onShowSignup={() => setAuthView('signup')} />
    : <SignupPage onSignup={register} onShowLogin={() => setAuthView('login')} />
}
```

---

## Verification

```bash
# Work mode
cd apps/consumer-web && npm run dev

# Browser: localhost:5173 → LoginPage
# Click "Create one" → SignupPage
# Submit new email/password → auto-logged in, research UI appears
# Sign out → LoginPage
# Click "Create one", re-use same email → error message shown
# Click "Sign in" link → back to LoginPage
# Login with the created credentials → research UI appears
```

---

## Files modified

| File | Change |
|---|---|
| `apps/consumer-web/src/api/auth.ts` | Add `register()` |
| `apps/consumer-web/src/hooks/useAuth.ts` | Expose `register` |
| `apps/consumer-web/src/components/SignupPage.tsx` | Created |
| `apps/consumer-web/src/components/LoginPage.tsx` | Add `onShowSignup` prop + link |
| `apps/consumer-web/src/App.tsx` | `authView` state, render `SignupPage` when signup |
