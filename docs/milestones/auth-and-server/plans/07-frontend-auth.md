# Plan 07: Frontend Auth

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

Add a login gate to the React SPA. Users see a `LoginPage` until they authenticate; after login the existing research UI appears unchanged. An opaque token from AdonisJS is stored in `localStorage` and attached to all API requests.

---

## What to build

### 1. `src/api/auth.ts` — auth API calls

```typescript
const TOKEN_KEY = 'auth_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Login failed')
  }
  const data = await res.json()
  localStorage.setItem(TOKEN_KEY, data.token.value)
}

export async function logout(): Promise<void> {
  const headers = getAuthHeaders()
  await fetch('/api/auth/logout', { method: 'DELETE', headers }).catch(() => {})
  localStorage.removeItem(TOKEN_KEY)
}

export async function getMe(): Promise<{ id: number; email: string } | null> {
  const token = getToken()
  if (!token) return null
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY)  // token invalid/expired
    return null
  }
  return res.json()
}
```

### 2. `src/hooks/useAuth.ts`

```typescript
import { useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, getMe } from '../api/auth'

interface User {
  id: number
  email: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string) {
    await apiLogin(email, password)
    const me = await getMe()
    setUser(me)
  }

  async function logout() {
    await apiLogout()
    setUser(null)
  }

  return { user, isLoading, login, logout }
}
```

### 3. `src/components/LoginPage.tsx`

```tsx
import { useState } from 'react'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
}

export function LoginPage({ onLogin }: Props) {
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
    } catch (err: any) {
      setError(err.message ?? 'Login failed')
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
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
```

### 4. `src/App.tsx` — add auth gate

Minimal changes: import `useAuth` and `LoginPage`, gate the existing UI, add a logout button to the header.

```tsx
// Add at top of existing App.tsx
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './components/LoginPage'

// Inside App():
const { user, isLoading, login, logout } = useAuth()

if (isLoading) return <div>Loading…</div>
if (!user) return <LoginPage onLogin={login} />

// Existing JSX returned as-is, with a logout button added to the header
```

### 5. `src/api/research.ts` — add auth header

In the existing `streamResearch` fetch call, add the auth header:

```typescript
import { getAuthHeaders } from './auth'

// In the fetch call:
const response = await fetch('/api/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  body: JSON.stringify({ question }),
  signal,
})
```

Same change for any other fetch calls in this file (e.g., fetching a completed thread).

### 6. `vite.config.ts` — update dev proxy

Change the proxy target from `agent-api:8001` to `server:3333`:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:3333',
  },
},
```

---

## Verification

```bash
# Work mode (AdonisJS running on :3333, Vite on :5173)
cd apps/consumer-web && npm run dev

# Browser: localhost:5173 → shows LoginPage
# Login with registered user → shows research UI
# Type a question → SSE progress streams
# Logout button → returns to LoginPage

# Refresh with valid token in localStorage → stays logged in (getMe succeeds)
# Delete token from DevTools localStorage → refresh → LoginPage
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/consumer-web/src/api/auth.ts` | Created |
| `apps/consumer-web/src/hooks/useAuth.ts` | Created |
| `apps/consumer-web/src/components/LoginPage.tsx` | Created |
| `apps/consumer-web/src/App.tsx` | Modified — auth gate + logout button |
| `apps/consumer-web/src/api/research.ts` | Modified — add `getAuthHeaders()` |
| `apps/consumer-web/vite.config.ts` | Modified — proxy target → `:3333` |
