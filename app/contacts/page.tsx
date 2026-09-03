"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore"
import { Icon, type IconName } from "@/components/icon"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"

const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant} />
}
const Plus = mk("Add")
const Search = mk("SearchNormal1")
const Mail = mk("Sms")
const Phone = mk("MessageText1")
const Building = mk("Building")
const Edit = mk("Edit2")
const Trash = mk("Trash")
const X = mk("CloseCircle")
const LoaderCircle = mk("Refresh")

type ContactType = "customer" | "sales"

type Contact = {
  id: string
  workspaceId: string
  type: ContactType
  displayName: string
  companyName: string | null
  taxId: string | null
  email: string | null
  phone: string | null
  notes: string | null
  createdBy?: string
  createdAt?: { toDate?: () => Date }
  updatedAt?: { toDate?: () => Date }
}

type FormState = {
  type: ContactType
  displayName: string
  companyName: string
  taxId: string
  email: string
  phone: string
  notes: string
}

const emptyForm = (type: ContactType): FormState => ({
  type,
  displayName: "",
  companyName: "",
  taxId: "",
  email: "",
  phone: "",
  notes: "",
})

const tabs: { value: ContactType; label: string }[] = [
  { value: "customer", label: "Customers" },
  { value: "sales", label: "Sales team" },
]

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function ContactsPage() {
  const { user } = useAuth()
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ContactType>("customer")
  const [queryText, setQueryText] = useState("")
  const [message, setMessage] = useState("")
  const [role, setRole] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm("customer"))
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canWrite = role === "admin" || role === "reviewer"

  // Resolve the caller's workspace role so the UI matches Firestore rules.
  useEffect(() => {
    if (!workspaceId || !user || !firebaseDb) return
    let active = true
    getDoc(doc(firebaseDb, `workspaces/${workspaceId}/members/${user.uid}`))
      .then((snapshot) => {
        if (active) setRole(snapshot.exists() ? (snapshot.data().role as string) : null)
      })
      .catch(() => {
        if (active) setRole(null)
      })
    return () => {
      active = false
    }
  }, [workspaceId, user])

  // Live persisted list.
  useEffect(() => {
    if (!workspaceId || !firebaseDb) {
      if (!workspaceLoading) setLoading(false)
      return
    }
    return onSnapshot(
      query(collection(firebaseDb, `workspaces/${workspaceId}/contacts`), orderBy("displayName")),
      (snapshot) => {
        setContacts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Contact)))
        setLoading(false)
      },
      () => {
        setMessage("Could not load contacts.")
        setLoading(false)
      },
    )
  }, [workspaceId, workspaceLoading])

  const inTab = useMemo(() => contacts.filter((contact) => contact.type === activeTab), [contacts, activeTab])
  const visible = useMemo(() => {
    const needle = queryText.trim().toLowerCase()
    if (!needle) return inTab
    return inTab.filter((contact) =>
      `${contact.displayName} ${contact.companyName || ""} ${contact.email || ""} ${contact.phone || ""} ${contact.taxId || ""}`
        .toLowerCase()
        .includes(needle),
    )
  }, [inTab, queryText])

  const customerCount = contacts.filter((contact) => contact.type === "customer").length
  const salesCount = contacts.filter((contact) => contact.type === "sales").length
  const withCompany = inTab.filter((contact) => contact.companyName).length

  function openCreate() {
    setEditing(null)
    setForm(emptyForm(activeTab))
    setErrors({})
    setFormOpen(true)
  }

  function openEdit(contact: Contact) {
    setEditing(contact)
    setForm({
      type: contact.type,
      displayName: contact.displayName,
      companyName: contact.companyName || "",
      taxId: contact.taxId || "",
      email: contact.email || "",
      phone: contact.phone || "",
      notes: contact.notes || "",
    })
    setErrors({})
    setFormOpen(true)
  }

  function validate(state: FormState) {
    const next: Partial<Record<keyof FormState, string>> = {}
    if (!state.displayName.trim()) next.displayName = "Name is required."
    else if (state.displayName.trim().length > 200) next.displayName = "Name is too long."
    if (!state.email.trim()) next.email = "Email is required."
    else if (!emailPattern.test(state.email.trim())) next.email = "Enter a valid email."
    if (!state.phone.trim()) next.phone = "Phone is required."
    return next
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!workspaceId || !user || !firebaseDb) return
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const trim = (value: string) => value.trim()
    const orNull = (value: string) => (value.trim() ? value.trim() : null)
    const payload = {
      workspaceId,
      type: form.type,
      displayName: trim(form.displayName),
      companyName: orNull(form.companyName),
      taxId: form.type === "customer" ? orNull(form.taxId) : null,
      email: orNull(form.email),
      phone: orNull(form.phone),
      notes: orNull(form.notes),
    }

    setSaving(true)
    setMessage("")
    try {
      if (editing) {
        await updateDoc(doc(firebaseDb, `workspaces/${workspaceId}/contacts/${editing.id}`), {
          ...payload,
          createdBy: editing.createdBy || user.uid,
          updatedAt: serverTimestamp(),
        })
        setMessage(`${payload.displayName} was updated.`)
      } else {
        await addDoc(collection(firebaseDb, `workspaces/${workspaceId}/contacts`), {
          ...payload,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        setMessage(`${payload.displayName} was added.`)
      }
      setFormOpen(false)
      setEditing(null)
    } catch (cause) {
      setMessage(writeErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !workspaceId || !firebaseDb) return
    setDeletingId(deleteTarget.id)
    setMessage("")
    try {
      await deleteDoc(doc(firebaseDb, `workspaces/${workspaceId}/contacts/${deleteTarget.id}`))
      setMessage(`${deleteTarget.displayName} was deleted.`)
      setDeleteTarget(null)
    } catch (cause) {
      setMessage(writeErrorMessage(cause))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <FinancePageShell
      title="Contacts"
      description="Customer relationships and internal sales team, saved to your live workspace."
      action={
        canWrite ? (
          <button
            onClick={openCreate}
            disabled={!workspaceId}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
        ) : null
      }
    >
      {message && (
        <div className="flex items-center rounded-xl border border-[#86efac]/20 bg-[#86efac]/10 p-3 text-xs text-[#b8f7cc]">
          <span>{message}</span>
          <button className="ml-auto" onClick={() => setMessage("")} aria-label="Dismiss message">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customers" value={`${customerCount}`} detail="Saved customer relationships" />
        <StatCard label="Sales team" value={`${salesCount}`} detail="Internal sales contacts" color="text-[#86efac]" />
        <StatCard label="With company" value={`${withCompany}`} detail={`In ${activeTab === "customer" ? "customers" : "sales team"}`} />
        <StatCard label="Total contacts" value={`${contacts.length}`} detail="Across both directories" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0D0D0D]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1c1c1c] p-4">
          <div className="flex rounded-xl border border-[#242424] bg-[#111] p-1" role="tablist" aria-label="Contact directory">
            {tabs.map((tab) => {
              const active = activeTab === tab.value
              return (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.value)}
                  className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                    active ? "bg-[#1f1f1f] text-white" : "text-[#777] hover:text-[#ccc]"
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[#242424] bg-[#111] px-3">
            <Search className="h-4 w-4 text-[#555]" />
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              className="h-10 w-full bg-transparent text-xs outline-none placeholder:text-[#555]"
              placeholder="Search name, company, email, or phone"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#555]">
                <th className="px-5 py-3">Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                {canWrite && <th className="pr-5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((contact) => (
                <tr key={contact.id} className="border-t border-[#181818] text-sm hover:bg-[#111]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1a1a1a] text-[10px] font-bold text-[#aaa]">
                        {initials(contact.displayName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#ddd]">{contact.displayName}</p>
                        {contact.taxId && <p className="mt-1 text-[10px] text-[#555]">Tax ID {contact.taxId}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="text-xs text-[#999]">
                    {contact.companyName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5 text-[#555]" />
                        {contact.companyName}
                      </span>
                    ) : (
                      <span className="text-[#555]">—</span>
                    )}
                  </td>
                  <td className="text-xs text-[#999]">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-[#86efac]">
                        <Mail className="h-3.5 w-3.5 text-[#555]" />
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-[#555]">—</span>
                    )}
                  </td>
                  <td className="text-xs text-[#999]">
                    {contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-[#86efac]">
                        <Phone className="h-3.5 w-3.5 text-[#555]" />
                        {contact.phone}
                      </a>
                    ) : (
                      <span className="text-[#555]">—</span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="pr-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(contact)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-2.5 py-1.5 text-[10px] text-[#bbb] hover:bg-[#1b1b1b] hover:text-white"
                          aria-label={`Edit ${contact.displayName}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(contact)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[10px] text-red-300 hover:bg-red-400/10"
                          aria-label={`Delete ${contact.displayName}`}
                        >
                          <Trash className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !visible.length && (
            <div className="border-t border-[#181818] p-10 text-center text-xs text-[#666]">
              {queryText ? "No contacts match this search." : `No ${activeTab === "customer" ? "customers" : "sales team members"} yet.`}
            </div>
          )}
        </div>
        <div className="border-t border-[#1c1c1c] p-4 text-center text-xs text-[#666]">
          {loading ? "Loading contacts…" : `${visible.length} contact${visible.length === 1 ? "" : "s"}`}
        </div>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (saving) return
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="border-[#2a2a2a] bg-[#0d0d0d] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription className="text-[#999]">
              {editing ? "Update the saved details for this contact." : "Save a new customer or sales team contact to your workspace."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-widest text-[#777]">Directory</label>
              <div className="flex rounded-xl border border-[#242424] bg-[#111] p-1">
                {tabs.map((tab) => {
                  const active = form.type === tab.value
                  return (
                    <button
                      type="button"
                      key={tab.value}
                      onClick={() => setForm((prev) => ({ ...prev, type: tab.value, taxId: tab.value === "sales" ? "" : prev.taxId }))}
                      className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        active ? "bg-[#1f1f1f] text-white" : "text-[#777] hover:text-[#ccc]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <Field label="Full name" required error={errors.displayName}>
              <input
                value={form.displayName}
                onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40"
                placeholder="Jane Doe"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" required error={errors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40"
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Phone" required error={errors.phone}>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40"
                  placeholder="+256 700 000000"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company">
                <input
                  value={form.companyName}
                  onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40"
                  placeholder="Acme Inc."
                />
              </Field>
              {form.type === "customer" ? <Field label="Tax ID">
                <input
                  value={form.taxId}
                  onChange={(event) => setForm((prev) => ({ ...prev, taxId: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40"
                  placeholder="Optional"
                />
              </Field> : null}
            </div>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-[#242424] bg-[#111] px-3 py-2 text-sm outline-none focus:border-[#86efac]/40"
                placeholder="Optional context about this contact"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setFormOpen(false)
                  setEditing(null)
                }}
                className="inline-flex h-10 items-center rounded-lg border border-[#333] px-4 text-sm text-[#bbb] hover:bg-[#1b1b1b] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#86efac] px-4 text-sm font-semibold text-black disabled:opacity-50"
              >
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : editing ? "Save changes" : "Add contact"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent className="border-[#2a2a2a] bg-[#111] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#999]">
              This permanently removes {deleteTarget?.displayName || "this contact"} from your workspace. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId)} className="border-[#333] bg-transparent text-[#bbb] hover:bg-[#1b1b1b] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <button
              type="button"
              disabled={Boolean(deletingId)}
              onClick={confirmDelete}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deletingId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash className="h-4 w-4" />}
              {deletingId ? "Deleting…" : "Delete permanently"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FinancePageShell>
  )
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] uppercase tracking-widest text-[#777]">
        {label}
        {required && <span className="ml-1 text-red-300">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[10px] text-red-300">{error}</span>}
    </label>
  )
}

function writeErrorMessage(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : ""
  if (code.includes("permission-denied")) return "You do not have permission to change contacts."
  if (code.includes("unauthenticated")) return "Sign in again before saving contacts."
  if (code.includes("not-found")) return "This contact no longer exists."
  return "Could not save the contact. Try again."
}
