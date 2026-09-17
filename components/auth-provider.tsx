"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signOut, type User } from "firebase/auth"
import { usePathname, useRouter } from "next/navigation"
import { firebaseAuth, isFirebaseConfigured } from "@/lib/firebase"

type AuthValue = { user: User | null; loading: boolean; configured: boolean; logout: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!firebaseAuth) { setLoading(false); return }

    let settled = false
    const timeout = window.setTimeout(() => {
      if (settled) return
      console.error("Firebase authentication state timed out during initialization.")
      setLoading(false)
    }, 8000)

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      settled = true
      window.clearTimeout(timeout)
      setUser(nextUser)
      setLoading(false)
    }, (error) => {
      settled = true
      window.clearTimeout(timeout)
      console.error("Firebase authentication state failed", error)
      setUser(null)
      setLoading(false)
    })

    return () => {
      settled = true
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!isFirebaseConfigured && pathname !== "/login") { router.replace("/login"); return }
    if (!user && pathname !== "/login") router.replace("/login")
    if (user && pathname === "/login") router.replace("/")
  }, [loading, pathname, router, user])

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    configured: isFirebaseConfigured,
    logout: async () => { if (firebaseAuth) await signOut(firebaseAuth) },
  }), [loading, user])

  if (loading || ((!isFirebaseConfigured || !user) && pathname !== "/login")) {
    return <div className="grid min-h-screen place-items-center bg-black text-xs text-[#777]">Loading Mercury invoice workspace…</div>
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth must be used inside AuthProvider")
  return value
}
