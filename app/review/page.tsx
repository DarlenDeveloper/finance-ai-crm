"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { getDownloadURL, ref } from "firebase/storage"
import { AlertCircle, Check, ArrowLeft, ChevronRight, FileText, Inbox, LoaderCircle, RotateCw, Sparkles, UploadCloud, X } from "lucide-react"
import { FinancePageShell } from "@/components/finance-page-shell"
import { DocumentViewer } from "@/components/invoices/document-viewer"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb, firebaseFunctions, firebaseStorage } from "@/lib/firebase"
import { uploadInvoice } from "@/lib/invoices/upload"

type Money = { amount: number | null; currency: string | null }
type LiveInvoice = {
  id: string
  status: "uploading" | "uploaded" | "processing" | "needs_review" | "verified" | "rejected" | "failed"
  source?: { storagePath?: string; originalName?: string; contentType?: string; sizeBytes?: number }
  extracted?: { warnings?: string[]; fieldEvidence?: Array<{ field: string; text: string | null; page: number | null; certainty: string }>; lineItems?: Array<{ description: string | null; quantity: number | null; unitPrice: number | null; taxAmount: number | null; totalAmount: number | null }> }
  normalized?: { vendorId: string | null; vendorName: string | null; invoiceNumber: string | null; invoiceDate: string | null; dueDate: string | null; subtotal: Money; tax: Money; total: Money }
  ai?: { warnings?: string[]; errorCode?: string | null; errorMessage?: string | null; model?: string | null }
  duplicateCheck?: { status?: "not_checked" | "clear" | "possible_duplicate"; matchedInvoiceIds?: string[]; score?: number | null }
  updatedAt?: { toDate?: () => Date }
}

type FormState = { vendorName: string; invoiceNumber: string; invoiceDate: string; dueDate: string; subtotal: string; tax: string; total: string; currency: string }
const emptyForm: FormState = { vendorName: "", invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", tax: "", total: "", currency: "USD" }

export default function ReviewPage() {
  const { user } = useAuth()
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace()
  const [invoices, setInvoices] = useState<LiveInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [documentUrl, setDocumentUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [rejectionReason, setRejectionReason] = useState("unreadable")
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspaceId || !firebaseDb) { if (!workspaceLoading) setLoading(false); return }
    return onSnapshot(query(collection(firebaseDb, `workspaces/${workspaceId}/invoices`), orderBy("createdAt", "asc")), (snapshot) => {
      setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as LiveInvoice)))
      setLoading(false)
    }, (cause) => { console.error(cause); setError("Could not load the AI review queue."); setLoading(false) })
  }, [workspaceId, workspaceLoading])

  const queue = useMemo(() => invoices.filter((invoice) => invoice.status === "needs_review"), [invoices])
  const failedInvoices = useMemo(() => invoices.filter((invoice) => invoice.status === "failed"), [invoices])
  const processing = invoices.filter((invoice) => ["uploading", "uploaded", "processing"].includes(invoice.status)).length
  const failed = failedInvoices.length
  const current = queue[Math.min(index, Math.max(queue.length - 1, 0))]

  useEffect(() => {
    if (!current) { setForm(emptyForm); setDocumentUrl(""); return }
    const value = current.normalized
    setForm({
      vendorName: value?.vendorName || "", invoiceNumber: value?.invoiceNumber || "", invoiceDate: value?.invoiceDate || "", dueDate: value?.dueDate || "",
      subtotal: displayNumber(value?.subtotal?.amount), tax: displayNumber(value?.tax?.amount), total: displayNumber(value?.total?.amount), currency: value?.total?.currency || value?.subtotal?.currency || "USD",
    })
    setError(""); setNotice("")
  }, [current?.id])

  useEffect(() => {
    let active = true
    if (!current?.source?.storagePath || !firebaseStorage) { setDocumentUrl(""); return }
    getDownloadURL(ref(firebaseStorage, current.source.storagePath)).then((url) => { if (active) setDocumentUrl(url) }).catch(() => { if (active) setError("The source document could not be opened.") })
    return () => { active = false }
  }, [current?.id, current?.source?.storagePath])

  async function review(action: "approve" | "reject", target?: LiveInvoice) {
    const invoice = target ?? current
    if (!invoice || !workspaceId || !firebaseFunctions) return
    setSaving(true); setError("")
    try {
      const call = httpsCallable(firebaseFunctions, "reviewInvoice")
      await call({
        workspaceId, invoiceId: invoice.id, action,
        expectedUpdatedAt: invoice.updatedAt?.toDate?.()?.toISOString() ?? null,
        rejectionReason: action === "reject" ? rejectionReason : null,
        normalized: action === "approve" ? {
          vendorId: null, vendorName: nullable(form.vendorName), invoiceNumber: nullable(form.invoiceNumber), invoiceDate: nullable(form.invoiceDate), dueDate: nullable(form.dueDate),
          subtotal: money(form.subtotal, form.currency), tax: money(form.tax, form.currency), total: money(form.total, form.currency),
        } : undefined,
      })
      setNotice(action === "approve" ? "Invoice approved and added to the ledger." : "Invoice rejected with an audit record.")
      setIndex(0)
    } catch (cause) {
      console.error(cause)
      setError(errorMessage(cause))
    } finally { setSaving(false) }
  }

  async function retry(invoice: LiveInvoice) {
    if (!workspaceId || !firebaseFunctions) return
    setSaving(true); setError("")
    try {
      const call = httpsCallable(firebaseFunctions, "reviewInvoice")
      await call({ workspaceId, invoiceId: invoice.id, action: "retry", expectedUpdatedAt: invoice.updatedAt?.toDate?.()?.toISOString() ?? null })
      setNotice("Extraction retry started. Gemini is processing the invoice again.")
    } catch (cause) {
      console.error(cause)
      setError(errorMessage(cause))
    } finally { setSaving(false) }
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !workspaceId || !user) return
    setUploading(true); setError(""); setNotice("")
    try {
      const list = Array.from(files)
      for (let i = 0; i < list.length; i++) await uploadInvoice(list[i], workspaceId, user.uid, ({ percent }) => setUploadPercent(Math.round(((i + percent / 100) / list.length) * 100)))
      setNotice(`${list.length} document${list.length === 1 ? "" : "s"} uploaded. Gemini extraction is running.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed.") }
    finally { setUploading(false); setUploadPercent(0); if (fileRef.current) fileRef.current.value = "" }
  }

  if (loading || workspaceLoading) return <FinancePageShell title="AI Review" description="Confirm extracted fields before they enter your ledger."><div className="grid min-h-[480px] place-items-center rounded-2xl border border-white/[0.05] bg-[#0d0d0d]"><span className="flex items-center gap-2 text-xs text-[#777]"><LoaderCircle className="h-4 w-4 animate-spin text-[#86efac]"/>Loading review queue…</span></div></FinancePageShell>

  return <FinancePageShell title="AI Review" description="Upload an invoice, verify Gemini's extraction, then save it to your ledger." action={<div className="flex flex-wrap gap-2"><Badge text={`${queue.length} to review`} tone="amber"/><Badge text={`${processing} processing`} tone="blue"/>{failed > 0 && <Badge text={`${failed} failed`} tone="red"/>}<button disabled={uploading || !workspaceId} onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black disabled:opacity-50"><UploadCloud className="h-4 w-4"/>{uploading ? `Uploading ${uploadPercent}%` : "Upload invoice"}</button><input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => upload(event.target.files)}/></div>}>
    {(notice || error || workspaceError) && <div className={`rounded-xl border p-3 text-xs ${error || workspaceError ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-[#86efac]/20 bg-[#86efac]/10 text-[#b8f7cc]"}`}>{error || workspaceError || notice}</div>}
    {!current ? <EmptyQueue processing={processing} failed={failed} failedInvoices={failedInvoices} onRetry={retry} saving={saving}/> : <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0d0d0d] lg:grid-cols-2">
      <div className="border-b border-[#202020] bg-[#151515] p-5 lg:border-b-0 lg:border-r">
        <div className="mb-4"><p className="text-sm font-medium">{current.source?.originalName || "Invoice document"}</p><p className="mt-1 text-[10px] text-[#666]">{formatBytes(current.source?.sizeBytes)} · {current.source?.contentType || "Unknown type"}</p></div>
        <DocumentViewer url={documentUrl} contentType={current.source?.contentType} fileName={current.source?.originalName} />
      </div>
      <div className="flex flex-col p-5 md:p-6">
        <div className="flex items-center gap-3 border-b border-[#202020] pb-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><Sparkles className="h-4 w-4"/></span><div><p className="text-sm font-medium">Gemini extracted invoice fields</p><p className="text-[10px] text-[#666]">{current.ai?.model || "Gemini 3.1"} · verify before approval</p></div></div>
        <div className="flex-1 py-3"><Field label="Vendor" value={form.vendorName} onChange={(value) => change(setForm, "vendorName", value)}/><Field label="Invoice number" value={form.invoiceNumber} onChange={(value) => change(setForm, "invoiceNumber", value)}/><Field label="Invoice date" type="date" value={form.invoiceDate} onChange={(value) => change(setForm, "invoiceDate", value)}/><Field label="Due date" type="date" value={form.dueDate} onChange={(value) => change(setForm, "dueDate", value)}/><div className="grid grid-cols-[1fr_90px] gap-2"><Field label="Subtotal" type="number" value={form.subtotal} onChange={(value) => change(setForm, "subtotal", value)}/><Field label="Currency" value={form.currency} onChange={(value) => change(setForm, "currency", value.toUpperCase().slice(0, 3))}/></div><Field label="Tax" type="number" value={form.tax} onChange={(value) => change(setForm, "tax", value)}/><Field label="Total" type="number" value={form.total} onChange={(value) => change(setForm, "total", value)}/></div>
        {(current.extracted?.lineItems?.length ?? 0) > 0 ? <details className="mb-4 rounded-xl border border-[#202020] bg-[#121212]"><summary className="cursor-pointer px-3 py-2 text-[11px] text-[#888]">Line items ({current.extracted!.lineItems!.length})</summary><div className="max-h-48 overflow-auto border-t border-[#202020]"><table className="w-full text-[10px]"><thead><tr className="text-left text-[#555]"><th className="px-3 py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{current.extracted!.lineItems!.map((item, i) => <tr key={i} className="border-t border-[#191919]"><td className="px-3 py-1.5 text-[#bbb]">{item.description || "—"}</td><td className="py-1.5 text-right text-[#888]">{item.quantity ?? "—"}</td><td className="py-1.5 text-right text-[#888]">{item.unitPrice ?? "—"}</td><td className="px-3 py-1.5 text-right text-[#bbb]">{item.totalAmount ?? "—"}</td></tr>)}</tbody></table></div></details> : null}
        {current.duplicateCheck?.status === "possible_duplicate" && (current.duplicateCheck.matchedInvoiceIds?.length ?? 0) > 0 ? <div className="mb-4 rounded-xl border border-orange-400/20 bg-orange-400/[0.07] p-3"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300"/><div className="space-y-1"><p className="text-[11px] font-medium text-orange-200">Possible duplicate{current.duplicateCheck.score != null ? ` (${Math.round(current.duplicateCheck.score * 100)}% match)` : ""}</p><div className="flex flex-wrap gap-2">{current.duplicateCheck.matchedInvoiceIds!.slice(0, 5).map((id) => <Link key={id} href={`/review/invoice?id=${id}`} className="rounded-md border border-orange-400/25 px-2 py-0.5 text-[10px] text-orange-200 hover:bg-orange-400/10">{id.slice(0, 8)}…</Link>)}</div></div></div></div> : null}
        {(current.ai?.warnings?.length || current.extracted?.warnings?.length) ? <div className="mb-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-3"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><div className="space-y-1">{[...(current.ai?.warnings || []), ...(current.extracted?.warnings || [])].slice(0, 4).map((warning, i) => <p key={`${warning}-${i}`} className="text-[11px] leading-5 text-[#aaa]">{warning}</p>)}</div></div></div> : null}
        <div className="mb-3 flex items-center gap-2"><select value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="h-10 flex-1 rounded-xl border border-[#292929] bg-[#121212] px-3 text-[11px] text-[#888] outline-none"><option value="unreadable">Unreadable document</option><option value="not_an_invoice">Not an invoice</option><option value="duplicate">Duplicate</option><option value="fraud_suspected">Fraud suspected</option><option value="wrong_workspace">Wrong workspace</option><option value="other">Other</option></select><button disabled={saving} onClick={() => review("reject")} className="grid h-10 w-10 place-items-center rounded-xl border border-red-400/20 text-red-300 disabled:opacity-50" aria-label="Reject invoice"><X className="h-4 w-4"/></button></div>
        <button disabled={saving || !form.vendorName || !form.invoiceNumber || !form.total} onClick={() => review("approve")} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#86efac] text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}Approve invoice</button>
        <div className="mt-3 flex items-center justify-center gap-3 text-[#555]"><button disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ArrowLeft className="h-4 w-4"/></button><span className="text-[10px]">{index + 1} of {queue.length}</span><button disabled={index >= queue.length - 1} onClick={() => setIndex((value) => value + 1)}><ChevronRight className="h-4 w-4"/></button></div>
      </div>
    </div>}
  </FinancePageShell>
}

function EmptyQueue({ processing, failed, failedInvoices, onRetry, saving }: { processing: number; failed: number; failedInvoices: LiveInvoice[]; onRetry: (invoice: LiveInvoice) => void; saving: boolean }) {
  return <div className="space-y-4">
    <div className="grid min-h-[380px] place-items-center rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-8 text-center"><div>{processing ? <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[#86efac]"/> : failed ? <AlertCircle className="mx-auto h-10 w-10 text-red-300"/> : <Inbox className="mx-auto h-10 w-10 text-[#86efac]"/>}<h2 className="mt-4 text-xl font-medium">{processing ? "Gemini is processing your invoice" : failed ? "Some invoices need attention" : "Review queue complete"}</h2><p className="mt-2 text-sm text-[#666]">{processing ? "This page updates automatically when extraction finishes." : failed ? "Retry the failed extractions below or inspect them on the invoices page." : "Upload an invoice to start the live AI review flow."}</p><Link href="/invoices" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#86efac] px-4 py-3 text-xs font-semibold text-black"><FileText className="h-4 w-4"/>Go to invoices</Link></div></div>
    {failedInvoices.length > 0 && <div className="rounded-2xl border border-red-400/15 bg-[#0d0d0d] p-5"><p className="mb-3 flex items-center gap-2 text-xs font-medium text-red-200"><AlertCircle className="h-4 w-4"/>Failed extractions</p><ul className="space-y-2">{failedInvoices.map((invoice) => <li key={invoice.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#202020] bg-[#141414] px-4 py-3"><div className="min-w-0"><p className="truncate text-xs text-[#ddd]">{invoice.source?.originalName || invoice.id}</p><p className="mt-0.5 truncate text-[10px] text-red-300/80">{invoice.ai?.errorMessage || invoice.ai?.errorCode || "Extraction failed."}</p></div><button disabled={saving} onClick={() => onRetry(invoice)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#86efac]/30 px-3 py-2 text-[10px] font-semibold text-[#86efac] disabled:opacity-50"><RotateCw className="h-3.5 w-3.5"/>Retry</button></li>)}</ul></div>}
  </div>
}
function Badge({ text, tone }: { text: string; tone: "amber" | "blue" | "red" }) { const style = tone === "red" ? "border-red-400/20 bg-red-400/10 text-red-300" : tone === "blue" ? "border-sky-400/20 bg-sky-400/10 text-sky-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"; return <div className={`rounded-full border px-3 py-2 text-xs ${style}`}>{text}</div> }
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="grid grid-cols-[110px_1fr] items-center gap-3 border-b border-[#191919] py-3"><span className="text-[11px] text-[#666]">{label}</span><input type={type} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-transparent bg-[#141414] px-3 py-2 text-xs outline-none focus:border-[#86efac]/40"/></label> }
function change(setter: React.Dispatch<React.SetStateAction<FormState>>, key: keyof FormState, value: string) { setter((current) => ({ ...current, [key]: value })) }
function nullable(value: string) { return value.trim() || null }
function number(value: string) { const parsed = Number(value); return value.trim() && Number.isFinite(parsed) ? parsed : null }
function errorMessage(cause: unknown): string {
  const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code: unknown }).code) : ""
  if (code.includes("aborted")) return "This invoice changed since you opened it. Reload and try again."
  if (code.includes("failed-precondition")) return "This invoice is no longer in a state that allows this action. Reload the queue."
  if (code.includes("permission-denied")) return "You do not have permission to perform this action."
  if (code.includes("invalid-argument")) return "Some values are invalid. Check the dates, currency, and required fields."
  return "The action could not be completed. Reload the invoice and try again."
}
function money(value: string, currency: string): Money { return { amount: number(value), currency: currency.trim().length === 3 ? currency.trim().toUpperCase() : null } }
function displayNumber(value?: number | null) { return value == null ? "" : String(value) }
function formatBytes(value?: number) { if (!value) return "Unknown size"; return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
