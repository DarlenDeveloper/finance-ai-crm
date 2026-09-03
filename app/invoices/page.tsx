"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
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
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb, firebaseFunctions } from "@/lib/firebase"
import { formatMoney } from "@/lib/demo-store"
import { uploadInvoices } from "@/lib/invoices/upload"
import { invoicePaymentState, type InvoicePaymentState } from "@/lib/invoices/payment"

const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant} />
}
const Download = mk("DocumentDownload")
const Check = mk("TickCircle", "Bold")
const Filter = mk("Filter")
const LoaderCircle = mk("Refresh")
const Search = mk("SearchNormal1")
const Trash = mk("Trash")
const UploadCloud = mk("ImportCurve")
const X = mk("CloseCircle")

type Status = "uploading" | "uploaded" | "processing" | "needs_review" | "verified" | "rejected" | "failed" | "deleting"
type Invoice = {
  id: string
  status: Status
  source?: { originalName?: string }
  normalized?: {
    vendorName?: string | null
    customerName?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    dueDate?: string | null
    handlerContactId?: string | null
    handlerName?: string | null
    total?: { amount?: number | null; currency?: string | null }
    amountsTaxInclusive?: boolean | null
  }
  payment?: { status?: "paid" | "unpaid" | null; paidAt?: { toDate?: () => Date } | null }
  createdAt?: { toDate?: () => Date }
  ai?: { errorMessage?: string | null }
}

/** Customer semantics with a fallback to the legacy vendor name. */
function customerName(invoice: Invoice): string {
  return invoice.normalized?.customerName || invoice.normalized?.vendorName || ""
}

function salesPersonKey(invoice: Invoice) {
  return invoice.normalized?.handlerContactId || (invoice.normalized?.handlerName ? `name:${invoice.normalized.handlerName.toLowerCase()}` : "unassigned")
}

const paymentLabels: Record<InvoicePaymentState, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
  not_applicable: "—",
}
const paymentTones: Record<InvoicePaymentState, string> = {
  paid: "border-[#86efac]/20 bg-[#86efac]/10 text-[#86efac]",
  unpaid: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  overdue: "border-red-400/20 bg-red-400/10 text-red-300",
  not_applicable: "border-transparent text-[#555]",
}

const deletableStatuses = new Set<Status>(["needs_review", "verified", "rejected", "failed"])

const labels: Record<Status, string> = {
  uploading: "Uploading",
  uploaded: "Queued",
  processing: "Processing",
  needs_review: "Needs review",
  verified: "Verified",
  rejected: "Rejected",
  failed: "Failed",
  deleting: "Deleting",
}
const tones: Record<Status, string> = {
  uploading: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  uploaded: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  processing: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  needs_review: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  verified: "border-[#86efac]/20 bg-[#86efac]/10 text-[#86efac]",
  rejected: "border-red-400/20 bg-red-400/10 text-red-300",
  failed: "border-red-400/20 bg-red-400/10 text-red-300",
  deleting: "border-red-400/20 bg-red-400/10 text-red-300",
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [queryText, setQueryText] = useState("")
  const [status, setStatus] = useState<Status | "all">("all")
  const [salesPerson, setSalesPerson] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState<InvoicePaymentState | "all">("all")
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [uploading, setUploading] = useState(false)
  const [percent, setPercent] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspaceId || !firebaseDb) {
      if (!workspaceLoading) setLoading(false)
      return
    }
    return onSnapshot(
      query(collection(firebaseDb, `workspaces/${workspaceId}/invoices`), orderBy("createdAt", "desc")),
      (snapshot) => {
        setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Invoice)))
        setLoading(false)
      },
      () => {
        setMessage("Could not load invoices.")
        setLoading(false)
      },
    )
  }, [workspaceId, workspaceLoading])

  const salesPeople = useMemo(() => {
    const people = new Map<string, string>()
    for (const invoice of invoices) {
      const name = invoice.normalized?.handlerName?.trim()
      if (name) people.set(salesPersonKey(invoice), name)
    }
    return Array.from(people, ([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [invoices])
  const visible = useMemo(() => invoices.filter((invoice) => {
    const haystack = `${customerName(invoice)} ${invoice.normalized?.invoiceNumber || ""} ${invoice.normalized?.handlerName || ""} ${invoice.source?.originalName || ""}`.toLowerCase()
    const matchesSalesPerson = salesPerson === "all" || salesPersonKey(invoice) === salesPerson
    const matchesPayment = paymentFilter === "all" || invoicePaymentState(invoice) === paymentFilter
    return haystack.includes(queryText.toLowerCase()) && (status === "all" || invoice.status === status) && matchesSalesPerson && matchesPayment
  }), [invoices, paymentFilter, queryText, salesPerson, status])
  const verified = invoices.filter((invoice) => invoice.status === "verified")
  const paid = verified.filter((invoice) => invoicePaymentState(invoice) === "paid")
  const outstanding = verified.filter((invoice) => invoicePaymentState(invoice) !== "paid")
  const overdue = verified.filter((invoice) => invoicePaymentState(invoice) === "overdue")
  const paidValue = paid.reduce((sum, invoice) => sum + (invoice.normalized?.total?.amount || 0), 0)
  const outstandingValue = outstanding.reduce((sum, invoice) => sum + (invoice.normalized?.total?.amount || 0), 0)
  const overdueValue = overdue.reduce((sum, invoice) => sum + (invoice.normalized?.total?.amount || 0), 0)
  const pending = invoices.filter((invoice) => ["uploading", "uploaded", "processing", "needs_review"].includes(invoice.status))

  async function upload(files: FileList | null) {
    if (!files?.length || !workspaceId || !user) return
    setUploading(true)
    setMessage("")
    try {
      const result = await uploadInvoices(Array.from(files), workspaceId, user.uid, ({ percent: batchPercent }) => setPercent(batchPercent))
      if (result.failed) {
        const names = result.failures.slice(0, 3).map((failure) => failure.fileName).join(", ")
        const more = result.failed > 3 ? ` and ${result.failed - 3} more` : ""
        setMessage(`${result.succeeded} invoice${result.succeeded === 1 ? "" : "s"} uploaded; ${result.failed} failed (${names}${more}). Successful invoices are processing independently.`)
      } else {
        setMessage(`${result.succeeded} invoice${result.succeeded === 1 ? "" : "s"} uploaded. Gemini processing started in parallel.`)
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Upload failed.")
    } finally {
      setUploading(false)
      setPercent(0)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function deleteInvoice() {
    if (!deleteTarget || !workspaceId || !firebaseFunctions) return
    setDeletingId(deleteTarget.id)
    setMessage("")
    try {
      const call = httpsCallable(firebaseFunctions, "deleteInvoice")
      await call({ workspaceId, invoiceId: deleteTarget.id })
      setMessage(`${deleteTarget.source?.originalName || "Invoice"} was deleted.`)
      setDeleteTarget(null)
    } catch (cause) {
      console.error(cause)
      setMessage(deleteErrorMessage(cause))
    } finally {
      setDeletingId(null)
    }
  }

  async function updatePayment(invoice: Invoice, status: "paid" | "unpaid") {
    if (!workspaceId || !firebaseFunctions) return
    setPaymentUpdatingId(invoice.id)
    setMessage("")
    try {
      const call = httpsCallable(firebaseFunctions, "setInvoicePaymentStatus")
      await call({ workspaceId, invoiceId: invoice.id, status })
      setMessage(`${invoice.normalized?.invoiceNumber || "Invoice"} marked ${status}.`)
    } catch (cause) {
      console.error(cause)
      setMessage(paymentErrorMessage(cause))
    } finally {
      setPaymentUpdatingId(null)
    }
  }

  function exportCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = [
      "Customer,Sales person,Invoice number,Invoice date,Due date,Amount,Currency,Review status,Payment status",
      ...visible.map((invoice) => [
        customerName(invoice),
        invoice.normalized?.handlerName || "Unassigned",
        invoice.normalized?.invoiceNumber || "",
        invoice.normalized?.invoiceDate || "",
        invoice.normalized?.dueDate || "",
        String(invoice.normalized?.total?.amount ?? ""),
        invoice.normalized?.total?.currency || "",
        labels[invoice.status],
        paymentLabels[invoicePaymentState(invoice)],
      ].map(escape).join(",")),
    ].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "ledger-ai-invoices.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return <FinancePageShell
    title="Invoices"
    description="Approved invoices and documents currently moving through review."
    action={<>
      <button disabled={uploading || !workspaceId} onClick={() => fileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black disabled:opacity-50">
        <UploadCloud className="h-4 w-4"/>{uploading ? `Uploading ${percent}%` : "Upload up to 10 invoices"}
      </button>
      <input ref={fileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => upload(event.target.files)}/>
    </>}
  >
    {message && <div className="flex items-center rounded-xl border border-[#86efac]/20 bg-[#86efac]/10 p-3 text-xs text-[#b8f7cc]">
      <span>{message}</span><button className="ml-auto" onClick={() => setMessage("")}><X className="h-4 w-4"/></button>
    </div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Approved invoices" value={`${verified.length}`} detail={`${pending.length} still in review pipeline`}/>
      <StatCard label="Paid value" value={formatMoney(paidValue)} detail={`${paid.length} paid invoice${paid.length === 1 ? "" : "s"}`} color="text-[#86efac]"/>
      <StatCard label="Outstanding value" value={formatMoney(outstandingValue)} detail={`${outstanding.length} unpaid invoice${outstanding.length === 1 ? "" : "s"}`} color="text-sky-300"/>
      <StatCard label="Overdue exposure" value={formatMoney(overdueValue)} detail={`${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`} color="text-red-300"/>
    </div>
    <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0D0D0D]">
      <div className="flex flex-wrap gap-3 border-b border-[#1c1c1c] p-4">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#242424] bg-[#111] px-3">
          <Search className="h-4 w-4 text-[#555]"/><input value={queryText} onChange={(event) => setQueryText(event.target.value)} className="h-10 w-full bg-transparent text-xs outline-none" placeholder="Search customer, invoice number, or filename"/>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-[#242424] px-3 text-xs text-[#888]">
          <Filter className="h-4 w-4"/><select value={status} onChange={(event) => setStatus(event.target.value as Status | "all")} className="h-10 bg-transparent outline-none">
            <option className="bg-[#111]" value="all">All statuses</option>
            {Object.entries(labels).map(([value, label]) => <option className="bg-[#111]" value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[#242424] px-3 text-xs text-[#888]">
          <select value={salesPerson} onChange={(event) => setSalesPerson(event.target.value)} className="h-10 max-w-[180px] bg-transparent outline-none">
            <option className="bg-[#111]" value="all">All sales people</option>
            <option className="bg-[#111]" value="unassigned">Unassigned</option>
            {salesPeople.map((person) => <option className="bg-[#111]" value={person.key} key={person.key}>{person.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-[#242424] px-3 text-xs text-[#888]">
          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as InvoicePaymentState | "all")} className="h-10 bg-transparent outline-none">
            <option className="bg-[#111]" value="all">All payments</option>
            <option className="bg-[#111]" value="paid">Paid</option>
            <option className="bg-[#111]" value="unpaid">Unpaid</option>
            <option className="bg-[#111]" value="overdue">Overdue</option>
          </select>
        </label>
        <button onClick={exportCsv} className="flex items-center gap-2 rounded-xl border border-[#242424] px-4 text-xs text-[#888]"><Download className="h-4 w-4"/>Export</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px]">
          <thead><tr className="text-left text-[10px] uppercase tracking-widest text-[#555]"><th className="px-5 py-3">Customer / document</th><th>Invoice number</th><th>Sales person</th><th>Dates</th><th className="text-right">Amount</th><th className="pl-6">Review</th><th>Payment</th><th className="pr-5 text-right">Actions</th></tr></thead>
          <tbody>{visible.map((invoice) => {
            const paymentState = invoicePaymentState(invoice)
            const targetPaymentStatus = paymentState === "paid" ? "unpaid" : "paid"
            return <tr key={invoice.id} className="border-t border-[#181818] text-sm hover:bg-[#111]">
              <td className="px-5 py-4 font-medium text-[#ddd]">{customerName(invoice) || invoice.source?.originalName || "Awaiting extraction"}{invoice.ai?.errorMessage && <span className="mt-1 block text-[9px] font-normal text-red-300">{invoice.ai.errorMessage}</span>}</td>
              <td className="font-mono text-xs text-[#777]">{invoice.normalized?.invoiceNumber || "—"}</td>
              <td className="text-xs text-[#aaa]">{invoice.normalized?.handlerName || "Unassigned"}</td>
              <td className="text-xs text-[#777]"><span className="block">Issued {invoice.normalized?.invoiceDate || "—"}</span><span className="mt-1 block text-[10px] text-[#555]">Due {invoice.normalized?.dueDate || "—"}</span></td>
              <td className="text-right font-medium">{invoice.normalized?.total?.amount == null ? "—" : formatMoney(invoice.normalized.total.amount)}</td>
              <td className="pl-6"><span className={`rounded-full border px-2.5 py-1 text-[10px] ${tones[invoice.status]}`}>{labels[invoice.status]}</span></td>
              <td><span className={`rounded-full border px-2.5 py-1 text-[10px] ${paymentTones[paymentState]}`}>{paymentLabels[paymentState]}</span></td>
              <td className="pr-5 text-right"><div className="flex items-center justify-end gap-2">
                {invoice.status === "needs_review" ? <Link href="/review" className="text-[10px] text-[#86efac]">Review</Link> : null}
                {invoice.status === "verified" ? <button type="button" disabled={paymentUpdatingId === invoice.id} onClick={() => updatePayment(invoice, targetPaymentStatus)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] disabled:opacity-50 ${paymentState === "paid" ? "border-[#333] text-[#888] hover:bg-[#1a1a1a]" : "border-[#86efac]/30 text-[#86efac] hover:bg-[#86efac]/10"}`}>{paymentUpdatingId === invoice.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin"/> : <Check className="h-3.5 w-3.5"/>}{paymentState === "paid" ? "Mark unpaid" : "Mark paid"}</button> : null}
                {deletableStatuses.has(invoice.status) ? <button type="button" onClick={() => setDeleteTarget(invoice)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-2.5 py-1.5 text-[10px] text-red-300 hover:bg-red-400/10" aria-label={`Delete ${invoice.source?.originalName || "invoice"}`}><Trash className="h-3.5 w-3.5"/>Delete</button> : null}
              </div></td>
            </tr>
          })}</tbody>
        </table>
        {!loading && !visible.length && <div className="border-t border-[#181818] p-10 text-center text-xs text-[#666]">No invoices match this view.</div>}
      </div>
      <div className="border-t border-[#1c1c1c] p-4 text-center text-xs text-[#666]">{loading ? "Loading invoices…" : `${visible.length} invoice${visible.length === 1 ? "" : "s"}`}</div>
    </div>

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletingId) setDeleteTarget(null) }}>
      <AlertDialogContent className="border-[#2a2a2a] bg-[#111] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete invoice permanently?</AlertDialogTitle>
          <AlertDialogDescription className="text-[#999]">
            This permanently removes {deleteTarget?.source?.originalName || "the invoice"}, its source file, extracted data, contact tags, and processing history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(deletingId)} className="border-[#333] bg-transparent text-[#bbb] hover:bg-[#1b1b1b] hover:text-white">Cancel</AlertDialogCancel>
          <button type="button" disabled={Boolean(deletingId)} onClick={deleteInvoice} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
            {deletingId ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Trash className="h-4 w-4"/>}{deletingId ? "Deleting…" : "Delete permanently"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </FinancePageShell>
}

function deleteErrorMessage(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : ""
  if (code.includes("permission-denied")) return "You do not have permission to delete this invoice."
  if (code.includes("failed-precondition")) return "Invoices cannot be deleted while uploading, queued, or processing."
  if (code.includes("not-found")) return "This invoice has already been deleted."
  if (code.includes("unauthenticated")) return "Sign in again before deleting this invoice."
  return "Could not delete the invoice. Try again."
}

function paymentErrorMessage(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : ""
  if (code.includes("permission-denied")) return "You do not have permission to update invoice payments."
  if (code.includes("failed-precondition")) return "Only approved invoices can be marked paid or unpaid."
  if (code.includes("not-found")) return "This invoice no longer exists."
  if (code.includes("unauthenticated")) return "Sign in again before updating the payment."
  return "Could not update the payment status. Try again."
}