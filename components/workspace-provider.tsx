"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { doc, serverTimestamp, writeBatch } from "firebase/firestore"
import { useAuth } from "@/components/auth-provider"
import { firebaseDb } from "@/lib/firebase"

type WorkspaceValue = { workspaceId: string | null; loading: boolean; error: string | null }
const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, configured } = useAuth()
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState<string | null>(null)
  const workspaceId = user ? `ws_${user.uid}` : null

  useEffect(() => {
    if (!configured || !user || !firebaseDb || !workspaceId) { setLoading(false); return }
    let active = true
    async function ensureWorkspace() {
      setLoading(true); setError(null)
      try {
        const memberRef = doc(firebaseDb!, `workspaces/${workspaceId}/members/${user!.uid}`)
        const batch = writeBatch(firebaseDb!)
        batch.set(doc(firebaseDb!, `workspaces/${workspaceId}`), {
            name: "Finance Control",
            defaultCurrency: "USD",
            timezone: "Africa/Kampala",
            createdAt: serverTimestamp(),
            createdBy: user!.uid,
        }, { merge: true })
        batch.set(memberRef, { role: "admin", email: user!.email || "", joinedAt: serverTimestamp() }, { merge: true })
        await batch.commit()
      } catch (cause) {
        console.error("Workspace setup failed", cause)
        if (active) setError("Could not prepare your finance workspace.")
      } finally { if (active) setLoading(false) }
    }
    ensureWorkspace()
    return () => { active = false }
  }, [configured, user, workspaceId])

  const value = useMemo(() => ({ workspaceId, loading, error }), [workspaceId, loading, error])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return value
}
