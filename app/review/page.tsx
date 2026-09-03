"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore"
import { httpsCallable } from "firebase/functions"
import { getDownloadURL, ref } from "firebase/storage"
import { Icon, type IconName } from "@/components/icon"
const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant} />
}
const AlertCircle = mk("Warning2")
const Check = mk("TickCircle", "Bold")
const ArrowLeft = mk("ArrowLeft2")
const ChevronLeft = mk("ArrowLeft2")
const ChevronRight = mk("ArrowRight2")
const FileText = mk("DocumentText")
const Inbox = mk("Box")
const LoaderCircle = mk("Refresh")
const Plus = mk("Add")
const RotateCw = mk("RotateRight")
const Sparkles = mk("MagicStar", "Bold")
const UploadCloud = mk("ImportCurve")
const X = mk("CloseCircle")
import { FinancePageShell } from "@/components/finance-page-shell"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DocumentViewer } from "@/components/invoices/document-viewer"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb, firebaseFunctions, firebaseStorage } from "@/lib/firebase"
import { uploadInvoices } from "@/lib/invoices/upload"
import { dueDateOrDefault } from "@/lib/invoices/normalization"
import { contactsOfType, findContact, matchContact, snapshotOf, useContacts, type Contact } from "@/lib/contacts"

type Money = { amount: number | null; currency: string | null }
type NormalizedInvoice = {
  vendorId?: string | null
  vendorName?: string | null
  issuerName?: string | null
  customerId?: string | null
  customerName?: string | null
  customerTaxId?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  handlerContactId?: string | null
  handlerName?: string | null
  handlerEmail?: string | null
  handlerPhone?: string | null
  invoiceNumber?: string | null
  invoiceDate?: string | null
  dueDate?: string | null
  subtotal?: Money
  tax?: Money
  total?: Money
  amountsTaxInclusive?: boolean | null
}
type LiveInvoice = {
  id: string
  status: "uploading" | "uploaded" | "processing" | "needs_review" | "verified" | "rejected" | "failed"
  source?: { storagePath?: string; originalName?: string; contentType?: string; sizeBytes?: number }
  extracted?: { warnings?: string[]; fieldEvidence?: Array<{ field: string; text: string | null; page: number | null; certainty: string }>; lineItems?: Array<{ description: string | null; quantity: number | null; unitPrice: number | null; taxAmount: number | null; totalAmount: number | null }> }
  normalized?: NormalizedInvoice
  ai?: { warnings?: string[]; errorCode?: string | null; errorMessage?: string | null; model?: string | null }
  duplicateCheck?: { status?: "not_checked" | "clear" | "possible_duplicate"; matchedInvoiceIds?: string[]; score?: number | null }
  updatedAt?: { toDate?: () => Date }
}

/** Prefer the customer semantics, falling back to the legacy vendor name. */
function customerLabel(value?: NormalizedInvoice): string {
  return value?.customerName || value?.vendorName || ""
}

type FormState = { customerName: string; invoiceNumber: string; invoiceDate: string; dueDate: string; subtotal: string; tax: string; total: string; currency: string }
type QuickContactType = "customer" | "sales"
type QuickContactForm = { displayName: string; companyName: string; taxId: string; email: string; phone: string }
const emptyQuickContact: QuickContactForm = { displayName: "", companyName: "", taxId: "", email: "", phone: "" }
const emptyForm: FormState = { customerName: "", invoiceNumber: "", invoiceDate: "", dueDate: "", subtotal: "", tax: "", total: "", currency: "USD" }

export default function ReviewPage() {
  const { user } = useAuth()
  const { workspaceId, loading: workspaceLoading, error: workspaceError } = useWorkspace()
  const { contacts } = useContacts(workspaceId)
  const customerContacts = useMemo(() => contactsOfType(contacts, "customer"), [contacts])
  const salesContacts = useMemo(() => contactsOfType(contacts, "sales"), [contacts])
  const [invoices, setInvoices] = useState<LiveInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [customerContactId, setCustomerContactId] = useState<string>("")
  const [handlerContactId, setHandlerContactId] = useState<string>("")
  const [documentUrl, setDocumentUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [rejectionReason, setRejectionReason] = useState("unreadable")
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [quickContactType, setQuickContactType] = useState<QuickContactType | null>(null)
  const [quickContact, setQuickContact] = useState<QuickContactForm>(emptyQuickContact)
  const [quickContactError, setQuickContactError] = useState("")
  const [quickContactSaving, setQuickContactSaving] = useState(false)
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
    if (!current) { setForm(emptyForm); setDocumentUrl(""); setCustomerContactId(""); setHandlerContactId(""); return }
    const value = current.normalized
    setForm({
      customerName: customerLabel(value), invoiceNumber: value?.invoiceNumber || "", invoiceDate: value?.invoiceDate || "", dueDate: dueDateOrDefault(value?.invoiceDate || null, value?.dueDate || null) || "",
      subtotal: displayNumber(value?.subtotal?.amount), tax: displayNumber(value?.tax?.amount), total: displayNumber(value?.total?.amount), currency: value?.total?.currency || value?.subtotal?.currency || "USD",
    })
    setError(""); setNotice("")
  }, [current?.id])

  // Auto-match the extracted customer and handler to workspace contacts.
  // Runs once contacts have loaded (or the current invoice changes). Respects
  // an already denormalized selection stored on the invoice.
  useEffect(() => {
    if (!current) return
    const value = current.normalized
    const customerMatch =
      (value?.customerId && findContact(customerContacts, value.customerId) ? value.customerId : null) ??
      matchContact(customerContacts, { taxId: value?.customerTaxId, name: customerLabel(value), email: value?.customerEmail })
    const handlerMatch =
      (value?.handlerContactId && findContact(salesContacts, value.handlerContactId) ? value.handlerContactId : null) ??
      matchContact(salesContacts, { name: value?.handlerName, email: value?.handlerEmail })
    setCustomerContactId(customerMatch || "")
    setHandlerContactId(handlerMatch || "")
  }, [current?.id, customerContacts, salesContacts])

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
      const customerSnapshot = snapshotOf(findContact(customerContacts, customerContactId || null))
      const handlerSnapshot = snapshotOf(findContact(salesContacts, handlerContactId || null))
      await call({
        workspaceId, invoiceId: invoice.id, action,
        expectedUpdatedAt: invoice.updatedAt?.toDate?.()?.toISOString() ?? null,
        rejectionReason: action === "reject" ? rejectionReason : null,
        normalized: action === "approve" ? {
          // Legacy vendor fields continue to mirror the issuer/seller.
          vendorId: null, vendorName: invoice.normalized?.issuerName?.trim() || invoice.normalized?.vendorName?.trim() || null,
          issuerName: invoice.normalized?.issuerName?.trim() || invoice.normalized?.vendorName?.trim() || null,
          // Denormalized customer contact snapshot.
          customerId: customerSnapshot.id, customerName: nullable(form.customerName) ?? customerSnapshot.name,
          customerTaxId: customerSnapshot.taxId, customerEmail: customerSnapshot.email, customerPhone: customerSnapshot.phone,
          // Denormalized handler contact snapshot.
          handlerContactId: handlerSnapshot.id, handlerName: handlerSnapshot.name, handlerEmail: handlerSnapshot.email, handlerPhone: handlerSnapshot.phone,
          invoiceNumber: nullable(form.invoiceNumber), invoiceDate: nullable(form.invoiceDate), dueDate: nullable(form.dueDate),
          subtotal: money(form.subtotal, form.currency), tax: money(form.tax, form.currency), total: money(form.total, form.currency),
          amountsTaxInclusive: invoice.normalized?.amountsTaxInclusive ?? null,
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
      const result = await uploadInvoices(Array.from(files), workspaceId, user.uid, ({ percent }) => setUploadPercent(percent))
      if (result.failed) {
        const names = result.failures.slice(0, 3).map((failure) => failure.fileName).join(", ")
        const more = result.failed > 3 ? ` and ${result.failed - 3} more` : ""
        setError(`${result.succeeded} uploaded; ${result.failed} failed (${names}${more}). Successful documents are still being extracted.`)
      } else {
        setNotice(`${result.succeeded} document${result.succeeded === 1 ? "" : "s"} uploaded. Gemini extraction is running in parallel.`)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed.") }
    finally { setUploading(false); setUploadPercent(0); if (fileRef.current) fileRef.current.value = "" }
  }

  function openQuickContact(type: QuickContactType) {
    const normalized = current?.normalized
    const extractedCustomer = customerLabel(normalized)
    const extractedSalesPerson = normalized?.handlerName?.trim() || ""
    setQuickContactType(type)
    setQuickContactError("")
    setQuickContact(type === "customer" ? {
      displayName: extractedCustomer,
      companyName: extractedCustomer,
      taxId: normalized?.customerTaxId || "",
      email: normalized?.customerEmail || "",
      phone: normalized?.customerPhone || "",
    } : {
      displayName: extractedSalesPerson,
      companyName: normalized?.issuerName || "Mercury Computers Limited",
      taxId: "",
      email: normalized?.handlerEmail || "",
      phone: normalized?.handlerPhone || "",
    })
  }

  async function saveQuickContact(event: React.FormEvent) {
    event.preventDefault()
    if (!quickContactType || !workspaceId || !user || !firebaseDb) return
    const displayName = quickContact.displayName.trim()
    const companyName = quickContact.companyName.trim()
    const email = quickContact.email.trim()
    const phone = quickContact.phone.trim()
    if (!displayName) { setQuickContactError(quickContactType === "customer" ? "Customer or contact name is required." : "Sales person name is required."); return }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setQuickContactError("Enter a valid email address."); return }
    if (!phone) { setQuickContactError("Phone number is required for SMS reminders."); return }

    setQuickContactSaving(true)
    setQuickContactError("")
    try {
      const contactRef = await addDoc(collection(firebaseDb, `workspaces/${workspaceId}/contacts`), {
        workspaceId,
        type: quickContactType,
        displayName,
        companyName: companyName || null,
        taxId: quickContactType === "customer" ? quickContact.taxId.trim() || null : null,
        email,
        phone,
        notes: null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      if (quickContactType === "customer") {
        setCustomerContactId(contactRef.id)
        setForm((currentForm) => ({ ...currentForm, customerName: companyName || displayName }))
      } else {
        setHandlerContactId(contactRef.id)
      }
      setNotice(`${quickContactType === "customer" ? "Customer contact" : "Sales person"} added and selected.`)
      setQuickContactType(null)
      setQuickContact(emptyQuickContact)
    } catch (cause) {
      const code = typeof cause === "object" && cause && "code" in cause ? String((cause as { code: unknown }).code) : ""
      setQuickContactError(code.includes("permission-denied") ? "You do not have permission to add contacts." : "Could not add the contact. Try again.")
    } finally {
      setQuickContactSaving(false)
    }
  }

  if (loading || workspaceLoading) return <FinancePageShell title="AI Review" description="Confirm extracted fields before they enter your ledger."><div className="grid min-h-[480px] place-items-center rounded-2xl border border-white/[0.05] bg-[#0d0d0d]"><span className="flex items-center gap-2 text-xs text-[#777]"><LoaderCircle className="h-4 w-4 animate-spin text-[#86efac]"/>Loading review queue…</span></div></FinancePageShell>

  return <FinancePageShell title="AI Review" description="Upload an invoice, verify Gemini's extraction, then save it to your ledger." action={<div className="flex flex-wrap gap-2"><Badge text={`${queue.length} to review`} tone="amber"/><Badge text={`${processing} processing`} tone="blue"/>{failed > 0 && <Badge text={`${failed} failed`} tone="red"/>}<button disabled={uploading || !workspaceId} onClick={() => fileRef.current?.click()} className="flex h-10 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black disabled:opacity-50"><UploadCloud className="h-4 w-4"/>{uploading ? `Uploading ${uploadPercent}%` : "Upload up to 10"}</button><input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => upload(event.target.files)}/></div>}>
    {(notice || error || workspaceError) && <div className={`rounded-xl border p-3 text-xs ${error || workspaceError ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-[#86efac]/20 bg-[#86efac]/10 text-[#b8f7cc]"}`}>{error || workspaceError || notice}</div>}
    {!current ? <EmptyQueue processing={processing} failed={failed} failedInvoices={failedInvoices} onRetry={retry} saving={saving}/> : <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0d0d0d] lg:grid-cols-2">
      <div className="border-b border-[#202020] bg-[#151515] p-5 lg:border-b-0 lg:border-r">
        <div className="mb-4"><p className="text-sm font-medium">{current.source?.originalName || "Invoice document"}</p><p className="mt-1 text-[10px] text-[#666]">{formatBytes(current.source?.sizeBytes)} · {current.source?.contentType || "Unknown type"}</p></div>
        <DocumentViewer url={documentUrl} contentType={current.source?.contentType} fileName={current.source?.originalName} />
      </div>
      <div className="flex flex-col p-5 md:p-6">
        <div className="flex items-center gap-3 border-b border-[#202020] pb-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><Sparkles className="h-4 w-4"/></span><div><p className="text-sm font-medium">Gemini extracted invoice fields</p><p className="text-[10px] text-[#666]">{current.ai?.model || "Gemini 3.1"} · verify before approval</p></div></div>
        <div className="flex-1 py-3">
          <Field label="Customer" value={form.customerName} onChange={(value) => change(setForm, "customerName", value)}/>
          {current.normalized?.issuerName ? <div className="grid grid-cols-[110px_1fr] items-center gap-3 border-b border-[#191919] py-3"><span className="text-[11px] text-[#666]">Issuer</span><span className="px-3 text-xs text-[#999]">{current.normalized.issuerName}</span></div> : null}
          <ContactSelect label="Customer contact" value={customerContactId} contacts={customerContacts} onChange={(id) => {
            setCustomerContactId(id)
            const selected = findContact(customerContacts, id)
            if (selected) setForm((current) => ({ ...current, customerName: selected.companyName?.trim() || selected.displayName?.trim() || current.customerName }))
          }} emptyLabel="Select customer contact" onCreate={() => openQuickContact("customer")}/>
          <ContactSelect label="Sales person" value={handlerContactId} contacts={salesContacts} onChange={setHandlerContactId} emptyLabel="Select sales person" onCreate={() => openQuickContact("sales")}/>
          <Field label="Invoice number" value={form.invoiceNumber} onChange={(value) => change(setForm, "invoiceNumber", value)}/>
          <Field label="Invoice date" type="date" value={form.invoiceDate} onChange={(value) => setForm((current) => ({ ...current, invoiceDate: value, dueDate: current.dueDate || dueDateOrDefault(value || null, null) || "" }))}/>
          <Field label="Due date" type="date" value={form.dueDate} onChange={(value) => change(setForm, "dueDate", value)}/>
          <div className="grid grid-cols-[1fr_90px] gap-2"><Field label="Subtotal" type="number" value={form.subtotal} onChange={(value) => change(setForm, "subtotal", value)}/><Field label="Currency" value={form.currency} onChange={(value) => change(setForm, "currency", value.toUpperCase().slice(0, 3))}/></div>
          <Field label="Tax" type="number" value={form.tax} onChange={(value) => change(setForm, "tax", value)}/>
          <Field label="Total" type="number" value={form.total} onChange={(value) => change(setForm, "total", value)}/>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-[#202020] bg-[#121212] px-3 py-3">
            <div><p className="text-[11px] text-[#666]">Total payable{current.normalized?.amountsTaxInclusive ? " (tax inclusive)" : ""}</p>{current.normalized?.amountsTaxInclusive ? <p className="mt-0.5 text-[9px] text-[#555]">Tax already included in the total</p> : null}</div>
            <span className="text-sm font-semibold text-[#86efac]">{totalPayable(form)}</span>
          </div>
        </div>
        {(current.extracted?.lineItems?.length ?? 0) > 0 ? <details className="mb-4 rounded-xl border border-[#202020] bg-[#121212]"><summary className="cursor-pointer px-3 py-2 text-[11px] text-[#888]">Line items ({current.extracted!.lineItems!.length})</summary><div className="max-h-48 overflow-auto border-t border-[#202020]"><table className="w-full text-[10px]"><thead><tr className="text-left text-[#555]"><th className="px-3 py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{current.extracted!.lineItems!.map((item, i) => <tr key={i} className="border-t border-[#191919]"><td className="px-3 py-1.5 text-[#bbb]">{item.description || "—"}</td><td className="py-1.5 text-right text-[#888]">{item.quantity ?? "—"}</td><td className="py-1.5 text-right text-[#888]">{item.unitPrice ?? "—"}</td><td className="px-3 py-1.5 text-right text-[#bbb]">{item.totalAmount ?? "—"}</td></tr>)}</tbody></table></div></details> : null}
        {current.duplicateCheck?.status === "possible_duplicate" && (current.duplicateCheck.matchedInvoiceIds?.length ?? 0) > 0 ? <div className="mb-4 rounded-xl border border-orange-400/20 bg-orange-400/[0.07] p-3"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300"/><div className="space-y-1"><p className="text-[11px] font-medium text-orange-200">Possible duplicate{current.duplicateCheck.score != null ? ` (${Math.round(current.duplicateCheck.score * 100)}% match)` : ""}</p><div className="flex flex-wrap gap-2">{current.duplicateCheck.matchedInvoiceIds!.slice(0, 5).map((id) => <Link key={id} href={`/review/invoice?id=${id}`} className="rounded-md border border-orange-400/25 px-2 py-0.5 text-[10px] text-orange-200 hover:bg-orange-400/10">{id.slice(0, 8)}…</Link>)}</div></div></div></div> : null}
        {(current.ai?.warnings?.length || current.extracted?.warnings?.length) ? <div className="mb-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-3"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><div className="space-y-1">{[...(current.ai?.warnings || []), ...(current.extracted?.warnings || [])].slice(0, 4).map((warning, i) => <p key={`${warning}-${i}`} className="text-[11px] leading-5 text-[#aaa]">{warning}</p>)}</div></div></div> : null}
        <div className="mb-3 flex items-center gap-2"><select value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="h-10 flex-1 rounded-xl border border-[#292929] bg-[#121212] px-3 text-[11px] text-[#888] outline-none"><option value="unreadable">Unreadable document</option><option value="not_an_invoice">Not an invoice</option><option value="duplicate">Duplicate</option><option value="fraud_suspected">Fraud suspected</option><option value="wrong_workspace">Wrong workspace</option><option value="other">Other</option></select><button disabled={saving} onClick={() => review("reject")} className="grid h-10 w-10 place-items-center rounded-xl border border-red-400/20 text-red-300 disabled:opacity-50" aria-label="Reject invoice"><X className="h-4 w-4"/></button></div>
        {contacts.length === 0 ? <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-[#c9b487]">No contacts exist yet. <Link href="/contacts" className="font-medium text-[#86efac] underline underline-offset-2">Add contacts</Link> to tag a customer and sales person before approving.</div> : (!customerContactId || !handlerContactId) ? <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-[11px] text-[#c9b487]">Select a {!customerContactId ? "customer contact" : ""}{!customerContactId && !handlerContactId ? " and " : ""}{!handlerContactId ? "sales person" : ""} to approve. Missing someone? <Link href="/contacts" className="font-medium text-[#86efac] underline underline-offset-2">Manage contacts</Link>.</div> : null}
        <button disabled={saving || !form.customerName || !form.invoiceNumber || !form.total || !customerContactId || !handlerContactId} onClick={() => review("approve")} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#86efac] text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}Approve invoice</button>
        <div className="mt-3 flex items-center justify-center gap-3 text-[#555]"><button disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ArrowLeft className="h-4 w-4"/></button><span className="text-[10px]">{index + 1} of {queue.length}</span><button disabled={index >= queue.length - 1} onClick={() => setIndex((value) => value + 1)}><ChevronRight className="h-4 w-4"/></button></div>
      </div>
    </div>}

    <Dialog open={quickContactType !== null} onOpenChange={(open) => {
      if (!open && !quickContactSaving) {
        setQuickContactType(null)
        setQuickContactError("")
      }
    }}>
      <DialogContent className="border-[#2a2a2a] bg-[#0d0d0d] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{quickContactType === "customer" ? "Add customer contact" : "Add sales person"}</DialogTitle>
          <DialogDescription className="text-[#999]">
            Save and select this contact without leaving invoice review. Email and phone are kept for future reminders.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={saveQuickContact} className="space-y-4">
          {quickContactError ? <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{quickContactError}</div> : null}
          <label className="block"><span className="mb-2 block text-[11px] text-[#777]">{quickContactType === "customer" ? "Contact / display name" : "Full name"}</span><input autoFocus value={quickContact.displayName} onChange={(event) => setQuickContact((value) => ({ ...value, displayName: event.target.value }))} className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40" placeholder={quickContactType === "customer" ? "Customer or contact name" : "Sales person name"}/></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-[11px] text-[#777]">Company</span><input value={quickContact.companyName} onChange={(event) => setQuickContact((value) => ({ ...value, companyName: event.target.value }))} className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40" placeholder={quickContactType === "customer" ? "Customer company" : "Mercury Computers Limited"}/></label>
            {quickContactType === "customer" ? <label className="block"><span className="mb-2 block text-[11px] text-[#777]">Tax ID</span><input value={quickContact.taxId} onChange={(event) => setQuickContact((value) => ({ ...value, taxId: event.target.value }))} className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40" placeholder="Optional"/></label> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-[11px] text-[#777]">Email</span><input required type="email" value={quickContact.email} onChange={(event) => setQuickContact((value) => ({ ...value, email: event.target.value }))} className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40" placeholder="name@example.com"/></label>
            <label className="block"><span className="mb-2 block text-[11px] text-[#777]">Phone</span><input required value={quickContact.phone} onChange={(event) => setQuickContact((value) => ({ ...value, phone: event.target.value }))} className="h-10 w-full rounded-lg border border-[#242424] bg-[#111] px-3 text-sm outline-none focus:border-[#86efac]/40" placeholder="+256 700 000000"/></label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" disabled={quickContactSaving} onClick={() => setQuickContactType(null)} className="h-10 rounded-lg border border-[#333] px-4 text-sm text-[#bbb] hover:bg-[#1b1b1b] hover:text-white disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={quickContactSaving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#86efac] px-4 text-sm font-semibold text-black disabled:opacity-50">{quickContactSaving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}{quickContactSaving ? "Saving…" : "Add and select"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
function ContactSelect({ label, value, contacts, onChange, emptyLabel, onCreate }: { label: string; value: string; contacts: Contact[]; onChange: (value: string) => void; emptyLabel: string; onCreate: () => void }) {
  return <div className="grid grid-cols-[110px_1fr] items-center gap-3 border-b border-[#191919] py-3"><span className="text-[11px] text-[#666]">{label}</span><div className="flex min-w-0 gap-2"><select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-transparent bg-[#141414] px-3 py-2 text-xs outline-none focus:border-[#86efac]/40"><option value="">{emptyLabel}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName || contact.email || contact.id}</option>)}</select><button type="button" onClick={onCreate} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#333] px-2.5 py-2 text-[11px] font-medium text-[#bbb] transition-colors hover:border-[#86efac]/40 hover:bg-[#86efac]/10 hover:text-[#86efac]" aria-label={`Add ${label.toLowerCase()}`}><Plus className="h-3.5 w-3.5"/>Add</button></div></div>
}
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
function totalPayable(form: FormState): string {
  const total = number(form.total)
  if (total == null) return "—"
  const currency = form.currency.trim().length === 3 ? form.currency.trim().toUpperCase() : ""
  return `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`
}
function displayNumber(value?: number | null) { return value == null ? "" : String(value) }
function formatBytes(value?: number) { if (!value) return "Unknown size"; return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
