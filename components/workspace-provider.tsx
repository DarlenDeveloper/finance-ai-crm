"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore"
import { useAuth } from "@/components/auth-provider"
import { firebaseDb } from "@/lib/firebase"

export type WorkspaceRole = "admin" | "reviewer" | "viewer"
type WorkspaceValue = {
  workspaceId: string | null
  workspaceName: string | null
  role: WorkspaceRole | null
  loading: boolean
  error: string | null
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, configured } = useAuth()
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)
  const [role, setRole] = useState<WorkspaceRole | null>(null)
  const workspaceId = user ? `ws_${user.uid}` : null

  useEffect(() => {
    if (!configured || !user || !firebaseDb || !workspaceId) {
      setWorkspaceName(null)
      setRole(null)
      setLoading(false)
      return
    }
    let active = true
    async function ensureWorkspace() {
      setLoading(true); setError(null)
      try {
        const workspaceRef = doc(firebaseDb!, `workspaces/${workspaceId}`)
        const memberRef = doc(firebaseDb!, `workspaces/${workspaceId}/members/${user!.uid}`)
        const batch = writeBatch(firebaseDb!)
        batch.set(workspaceRef, {
            name: "Finance Control",
            defaultCurrency: "USD",
            timezone: "Africa/Kampala",
            createdAt: serverTimestamp(),
            createdBy: user!.uid,
        }, { merge: true })
        batch.set(memberRef, { role: "admin", email: user!.email || "", joinedAt: serverTimestamp() }, { merge: true })
        await batch.commit()
        const [workspaceSnapshot, memberSnapshot] = await Promise.all([getDoc(workspaceRef), getDoc(memberRef)])
        if (active) {
          const savedName = workspaceSnapshot.data()?.name
          const savedRole = memberSnapshot.data()?.role
          setWorkspaceName(typeof savedName === "string" && savedName.trim() ? savedName.trim() : null)
          setRole(savedRole === "admin" || savedRole === "reviewer" || savedRole === "viewer" ? savedRole : null)
        }
      } catch (cause) {
        console.error("Workspace setup failed", cause)
        if (active) {
          setWorkspaceName(null)
          setRole(null)
          setError("Could not prepare your finance workspace.")
        }
      } finally { if (active) setLoading(false) }
    }
    ensureWorkspace()
    return () => { active = false }
  }, [configured, user, workspaceId])

  const value = useMemo(() => ({ workspaceId, workspaceName, role, loading, error }), [workspaceId, workspaceName, role, loading, error])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return value
}
