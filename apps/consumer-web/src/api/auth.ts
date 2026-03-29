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
  const { data } = await res.json()
  localStorage.setItem(TOKEN_KEY, data.token.value)
}

export async function logout(): Promise<void> {
  const headers = getAuthHeaders()
  await fetch('/api/auth/logout', { method: 'DELETE', headers }).catch(() => {})
  localStorage.removeItem(TOKEN_KEY)
}

export async function register(email: string, password: string, fullName?: string): Promise<void> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(fullName ? { fullName } : {}) }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Registration failed')
  }
  const { data } = await res.json()
  localStorage.setItem(TOKEN_KEY, data.token.value)
}

export async function getMe(): Promise<{ id: number; email: string } | null> {
  const token = getToken()
  if (!token) return null
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
  const { data } = await res.json()
  return data
}
