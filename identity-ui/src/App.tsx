import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Login } from '@/pages/Login'
import { Registration } from '@/pages/Registration'
import { Recovery } from '@/pages/Recovery'
import { Verification } from '@/pages/Verification'
import { Consent } from '@/pages/Consent'
import { Logout } from '@/pages/Logout'
import { Error } from '@/pages/Error'

export function App() {
  const initialize = useAuthStore((s) => s.initialize)
  const loading = useAuthStore((s) => s.loading)

  useEffect(() => { initialize() }, [initialize])

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/registration" element={<Registration />} />
        <Route path="/auth/recovery" element={<Recovery />} />
        <Route path="/auth/verification" element={<Verification />} />
        <Route path="/auth/consent" element={<Consent />} />
        <Route path="/auth/logout" element={<Logout />} />
        <Route path="/auth/error" element={<Error />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
