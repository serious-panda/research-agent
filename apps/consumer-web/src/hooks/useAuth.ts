import { useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, register as apiRegister, getMe } from '../api/auth'

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

  async function register(email: string, password: string, fullName?: string) {
    await apiRegister(email, password, fullName)
    const me = await getMe()
    setUser(me)
  }

  return { user, isLoading, login, logout, register }
}
