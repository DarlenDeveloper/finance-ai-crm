"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"
import { useAuth } from "@/components/auth-provider"
import { firebaseDb } from "@/lib/firebase"
import {
  ORGANIZATION_NAME,
  ORGANIZATION_WORKSPACE_ID,
  PAGE_IDS,
  SUPER_ADMIN_UID,
  canAccessPage as memberCanAccessPage,
  canManageAccess,
  canOperate,
  isAdmin,
  isMemberStatus,
  isSuperAdmin,
  isWorkspaceRole,
  validPageAccess,
  type MemberStatus,
  type PageId,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/rbac"

export type { MemberStatus, PageId, WorkspaceRole }

type WorkspaceValue = {
  workspaceId: string | null
  workspaceName: string
  member: WorkspaceMember | null
  role: WorkspaceRole | null
  status: MemberStatus | null
  pageAccess: PageId[]
  loading: boolean
  error: string | null
  isSuperAdmin: boolean
  isAdmin: boolean
  canManageAccess: boolean
  canOperate: boolean
  canAccessPage: (pageId: PageId) => boolean
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

function memberFromData(uid: string, data: Record<string, unknown>): WorkspaceMember {
  return {
    uid,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    role: isWorkspaceRole(data.role) ? data.role : null,
    status: isMemberStatus(data.status) ? data.status : "pending",
    pageAccess: validPageAccess(data.pageAccess),
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, configured } = useAuth()
  const [member, setMember] = useState<WorkspaceMember | null>(null)
  const [loading, setLoading] = useState(Boolean(user))
  const [error, setError] = useState<string | null>(null)
  const workspaceId = user ? ORGANIZATION_WORKSPACE_ID : null

  useEffect(() => {
    if (!configured || !user || !firebaseDb) {
      setMember(null)
      setLoading(false)
      return
    }

    let active = true
    let unsubscribe: (() => void) | undefined

    async function ensureMembership() {
      setLoading(true)
      setError(null)
      const workspaceRef = doc(firebaseDb!, `workspaces/${ORGANIZATION_WORKSPACE_ID}`)
      const memberRef = doc(firebaseDb!, `workspaces/${ORGANIZATION_WORKSPACE_ID}/members/${user!.uid}`)

      try {
        const snapshot = await getDoc(memberRef)
        if (!snapshot.exists()) {
          if (user!.uid === SUPER_ADMIN_UID) {
            await setDoc(workspaceRef, {
              name: ORGANIZATION_NAME,
              defaultCurrency: "USD",
              timezone: "Africa/Kampala",
              createdAt: serverTimestamp(),
              createdBy: SUPER_ADMIN_UID,
            }, { merge: true })
            await setDoc(memberRef, {
              uid: SUPER_ADMIN_UID,
              email: user!.email || "",
              displayName: user!.displayName || "",
              role: "super_admin",
              status: "active",
              pageAccess: [...PAGE_IDS],
              requestedAt: serverTimestamp(),
              joinedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: SUPER_ADMIN_UID,
            })
          } else {
            await setDoc(memberRef, {
              uid: user!.uid,
              email: user!.email || "",
              displayName: user!.displayName || "",
              role: null,
              status: "pending",
              pageAccess: [],
              requestedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              updatedBy: user!.uid,
            })
          }
        } else if (user!.uid === SUPER_ADMIN_UID && (snapshot.data().role !== "super_admin" || snapshot.data().status !== "active")) {
          await setDoc(memberRef, {
            uid: SUPER_ADMIN_UID,
            email: user!.email || "",
            displayName: user!.displayName || "",
            role: "super_admin",
            status: "active",
            pageAccess: [...PAGE_IDS],
            joinedAt: snapshot.data().joinedAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: SUPER_ADMIN_UID,
          }, { merge: true })
        }

        unsubscribe = onSnapshot(memberRef, (nextSnapshot) => {
          if (!active) return
          setMember(nextSnapshot.exists() ? memberFromData(nextSnapshot.id, nextSnapshot.data()) : null)
          setLoading(false)
          setError(null)
        }, (cause) => {
          console.error("Membership subscription failed", cause)
          if (active) {
            setError("Could not load your organisation access. Please try signing in again.")
            setLoading(false)
          }
        })
      } catch (cause) {
        console.error("Membership setup failed", cause)
        if (active) {
          setMember(null)
          setError("Could not request access to the Mercury organisation.")
          setLoading(false)
        }
      }
    }

    void ensureMembership()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [configured, user])

  const value = useMemo<WorkspaceValue>(() => ({
    workspaceId,
    workspaceName: ORGANIZATION_NAME,
    member,
    role: member?.role ?? null,
    status: member?.status ?? null,
    pageAccess: member?.pageAccess ?? [],
    loading,
    error,
    isSuperAdmin: isSuperAdmin(member),
    isAdmin: isAdmin(member),
    canManageAccess: canManageAccess(member),
    canOperate: canOperate(member),
    canAccessPage: (pageId) => memberCanAccessPage(member, pageId),
  }), [workspaceId, member, loading, error])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider")
  return value
}
