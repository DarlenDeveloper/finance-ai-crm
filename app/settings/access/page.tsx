"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore"
import { FinancePageShell } from "@/components/finance-page-shell"
import { Icon } from "@/components/icon"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"
import {
  ASSIGNABLE_PAGES,
  DEFAULT_PAGE_ACCESS,
  SUPER_ADMIN_UID,
  assignableRolesFor,
  canManageMember,
  displayRole,
  isMemberStatus,
  isWorkspaceRole,
  validPageAccess,
  type AssignableRole,
  type PageId,
  type WorkspaceMember,
} from "@/lib/rbac"

type ManagedMember = WorkspaceMember & { requestedAt?: { toMillis?: () => number } }
type Draft = { role: AssignableRole | null; pageAccess: PageId[] }

function memberFromSnapshot(id: string, data: Record<string, unknown>): ManagedMember {
  return {
    uid: id,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    role: isWorkspaceRole(data.role) ? data.role : null,
    status: isMemberStatus(data.status) ? data.status : "pending",
    pageAccess: validPageAccess(data.pageAccess),
    requestedAt: data.requestedAt as ManagedMember["requestedAt"],
  }
}

function displayName(member: ManagedMember) {
  return member.displayName.trim() || member.email.split("@")[0] || "Unnamed user"
}

export default function AccessManagementPage() {
  const { workspaceId, member: currentMember, canManageAccess } = useWorkspace()
  const assignableRoles = useMemo(() => assignableRolesFor(currentMember), [currentMember])
  const [members, setMembers] = useState<ManagedMember[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!workspaceId || !firebaseDb || !canManageAccess) return
    return onSnapshot(collection(firebaseDb, `workspaces/${workspaceId}/members`), (snapshot) => {
      const next = snapshot.docs.map((item) => memberFromSnapshot(item.id, item.data())).sort((a, b) => {
        const statusOrder = { pending: 0, active: 1, disabled: 2 }
        return statusOrder[a.status] - statusOrder[b.status] || displayName(a).localeCompare(displayName(b))
      })
      setMembers(next)
      setDrafts((existing) => {
        const result = { ...existing }
        for (const item of next) {
          if (item.uid === SUPER_ADMIN_UID) continue
          if (!result[item.uid]) result[item.uid] = {
            role: item.role === "admin" || item.role === "developer" || item.role === "user" ? item.role : null,
            pageAccess: item.pageAccess,
          }
        }
        return result
      })
      setLoading(false)
    }, () => {
      setError("Could not load organisation members.")
      setLoading(false)
    })
  }, [canManageAccess, workspaceId])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? members.filter((item) => `${displayName(item)} ${item.email} ${item.status} ${item.role || ""}`.toLowerCase().includes(term)) : members
  }, [members, query])
  const pendingCount = members.filter((item) => item.status === "pending").length
  const activeCount = members.filter((item) => item.status === "active").length
  const developerCount = members.filter((item) => item.status === "active" && item.role === "developer").length

  function chooseRole(uid: string, role: AssignableRole) {
    setDrafts((current) => ({ ...current, [uid]: { role, pageAccess: current[uid]?.role ? current[uid].pageAccess : [...DEFAULT_PAGE_ACCESS[role]] } }))
  }

  function togglePage(uid: string, pageId: PageId) {
    setDrafts((current) => {
      const draft = current[uid] || { role: null, pageAccess: [] }
      const pageAccess = draft.pageAccess.includes(pageId) ? draft.pageAccess.filter((item) => item !== pageId) : [...draft.pageAccess, pageId]
      return { ...current, [uid]: { ...draft, pageAccess } }
    })
  }

  async function save(member: ManagedMember, status: "active" | "disabled") {
    if (!firebaseDb || !workspaceId || !currentMember) return
    if (!canManageMember(currentMember, member)) { setError("You do not have permission to manage this account."); return }
    const draft = drafts[member.uid]
    if (!draft?.role) { setError("Select a role before approving this user."); return }
    if (!assignableRoles.includes(draft.role)) { setError("You are not allowed to assign that role."); return }
    if (status === "active" && !draft.pageAccess.length) { setError("Assign at least one page before activating this user."); return }
    setWorking(member.uid); setError(""); setMessage("")
    try {
      const approvalFields = member.status === "pending" && status === "active" ? { approvedAt: serverTimestamp(), approvedBy: currentMember.uid, joinedAt: serverTimestamp() } : {}
      await updateDoc(doc(firebaseDb, `workspaces/${workspaceId}/members/${member.uid}`), {
        role: draft.role,
        status,
        pageAccess: draft.pageAccess,
        ...approvalFields,
        updatedAt: serverTimestamp(),
        updatedBy: currentMember.uid,
      })
      setMessage(status === "disabled" ? `${displayName(member)} has been disabled.` : member.status === "pending" ? `${displayName(member)} has been approved.` : `${displayName(member)} access has been updated.`)
    } catch (cause) {
      console.error("Membership update failed", cause)
      setError("The membership update was rejected. Check the selected role and pages, then try again.")
    } finally { setWorking(null) }
  }

  return <FinancePageShell title="Access Management" description="Approve accounts and control roles and page access for this organisation.">
    {(message || error) && <div role={error ? "alert" : "status"} className={`rounded-xl border p-3 text-xs ${error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-[#86efac]/20 bg-[#86efac]/10 text-[#b8f7cc]"}`}>{error || message}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Pending approval" value={String(pendingCount)} tone="text-amber-300" />
      <Stat label="Active accounts" value={String(activeCount)} tone="text-[#86efac]" />
      <Stat label="Developers" value={String(developerCount)} tone="text-sky-300" />
    </div>

    <section className="overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0d0d0d]">
      <div className="flex flex-col gap-4 border-b border-[#202020] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-base font-medium">Organisation users</h2><p className="mt-1 text-xs text-[#666]">New accounts remain blocked until you assign a role, select pages, and approve them.</p></div>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-[#252525] bg-[#111] px-3 sm:w-72"><Icon name="SearchNormal1" size={16} className="text-[#555]"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" className="w-full bg-transparent text-xs outline-none"/></label>
      </div>

      <div className="divide-y divide-[#202020]">
        {loading ? <p className="p-8 text-center text-xs text-[#666]">Loading members…</p> : visible.length === 0 ? <p className="p-8 text-center text-xs text-[#666]">No matching users.</p> : visible.map((item) => {
          const isSuperAdminRow = item.uid === SUPER_ADMIN_UID
          const manageable = canManageMember(currentMember, item)
          const readOnly = !manageable
          const draft = drafts[item.uid]
          return <article key={item.uid} className="p-5 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-medium">{displayName(item)}</h3><Status status={item.status}/>{isSuperAdminRow && <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[9px] text-violet-300">Protected account</span>}{!isSuperAdminRow && item.role === "admin" && <span className="rounded-full bg-sky-400/10 px-2 py-1 text-[9px] text-sky-300">Admin</span>}</div><p className="mt-1 truncate text-xs text-[#777]">{item.email || item.uid}</p><p className="mt-2 text-[10px] text-[#555]">UID: {item.uid}</p></div>
              {readOnly ? <div className="rounded-xl border border-violet-400/15 bg-violet-400/[.05] px-4 py-3 text-xs text-violet-200">{isSuperAdminRow ? "Permanent super admin · Full page access" : "Managed by the super admin"}</div> : <div className="flex min-w-0 flex-1 flex-col gap-5 xl:max-w-4xl">
                <div><label className="mb-2 block text-[10px] uppercase tracking-[.15em] text-[#666]">Role</label><select value={draft?.role || ""} onChange={(event) => chooseRole(item.uid, event.target.value as AssignableRole)} className="h-11 w-full rounded-xl border border-[#292929] bg-[#111] px-3 text-xs text-white outline-none sm:max-w-xs"><option value="" disabled>Select a role</option>{assignableRoles.map((role) => <option key={role} value={role}>{displayRole(role)}</option>)}</select></div>
                <div><p className="mb-2 text-[10px] uppercase tracking-[.15em] text-[#666]">Page access</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ASSIGNABLE_PAGES.map((page) => <label key={page.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${draft?.pageAccess.includes(page.id) ? "border-[#86efac]/25 bg-[#86efac]/[.06]" : "border-[#252525] bg-[#111]"}`}><input type="checkbox" checked={Boolean(draft?.pageAccess.includes(page.id))} onChange={() => togglePage(item.uid, page.id)} className="mt-0.5 h-4 w-4 accent-[#86efac]"/><span><span className="block text-xs text-[#ddd]">{page.label}</span><span className="mt-1 block text-[9px] leading-4 text-[#666]">{page.description}</span></span></label>)}</div></div>
                <div className="flex flex-wrap justify-end gap-2">{item.status === "active" && <button disabled={working === item.uid} onClick={() => void save(item, "disabled")} className="h-10 rounded-xl border border-red-400/20 px-4 text-xs text-red-300 disabled:opacity-50">Disable</button>}<button disabled={working === item.uid} onClick={() => void save(item, "active")} className="h-10 rounded-xl bg-[#86efac] px-5 text-xs font-semibold text-black disabled:opacity-50">{working === item.uid ? "Saving…" : item.status === "pending" ? "Approve user" : item.status === "disabled" ? "Reactivate user" : "Save access"}</button></div>
              </div>}
            </div>
          </article>
        })}
      </div>
    </section>

    <div className="flex items-start gap-4 rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-400/10 text-violet-300"><Icon name="DocumentText" size={17}/></span><div><h3 className="text-sm font-medium">System Logs</h3><p className="mt-2 text-xs leading-5 text-[#666]">Reserved for the super admin. The logging screen and retention controls will be added later.</p></div><span className="ml-auto rounded-full bg-[#171717] px-3 py-1.5 text-[9px] uppercase tracking-wider text-[#666]">Coming later</span></div>
  </FinancePageShell>
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="rounded-2xl border border-white/[0.04] bg-[#0d0d0d] p-5"><p className="text-xs text-[#777]">{label}</p><p className={`mt-3 text-2xl font-medium ${tone}`}>{value}</p></div> }
function Status({ status }: { status: ManagedMember["status"] }) { const style = status === "active" ? "bg-[#86efac]/10 text-[#86efac]" : status === "pending" ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"; return <span className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-wider ${style}`}>{status}</span> }
