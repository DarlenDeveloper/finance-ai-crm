"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { doc, onSnapshot } from "firebase/firestore"
import { getDownloadURL, ref } from "firebase/storage"
import { Icon, type IconName } from "@/components/icon"
const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant} />
}
const ArrowLeft = mk("ArrowLeft2")
const LoaderCircle = mk("Refresh")
import { FinancePageShell } from "@/components/finance-page-shell"
import { DocumentViewer } from "@/components/invoices/document-viewer"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb, firebaseStorage } from "@/lib/firebase"

type Money = { amount: number | null; currency: string | null }
type Invoice = {
  status: string
  source?: { storagePath?: string; originalName?: string; contentType?: string; sizeBytes?: number }
  normalized?: {
    vendorName?: string | null
    issuerName?: string | null
    customerName?: string | null
    customerTaxId?: string | null
    customerEmail?: string | null
    customerPhone?: string | null
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
}

function customerName(n?: Invoice["normalized"]): string {
  return n?.customerName || n?.vendorName || ""
}

function InvoiceDetail() {
  const searchParams = useSearchParams()
  const invoiceId = searchParams.get("id") || ""
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [documentUrl, setDocumentUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!invoiceId) { setNotFound(true); setLoading(false); return }
    if (!workspaceId || !firebaseDb) { if (!workspaceLoading) setLoading(false); return }
    return onSnapshot(doc(firebaseDb, `workspaces/${workspaceId}/invoices/${invoiceId}`), (snapshot) => {
      if (!snapshot.exists()) { setNotFound(true); setLoading(false); return }
      setInvoice(snapshot.data() as Invoice)
      setLoading(false)
    }, () => { setNotFound(true); setLoading(false) })
  }, [workspaceId, workspaceLoading, invoiceId])

  useEffect(() => {
    let active = true
    if (!invoice?.source?.storagePath || !firebaseStorage) { setDocumentUrl(""); return }
    getDownloadURL(ref(firebaseStorage, invoice.source.storagePath)).then((url) => { if (active) setDocumentUrl(url) }).catch(() => {})
    return () => { active = false }
  }, [invoice?.source?.storagePath])

  if (loading || workspaceLoading) return <FinancePageShell title="Invoice" description="Loading invoice details."><div className="grid min-h-[400px] place-items-center rounded-2xl border border-white/[0.05] bg-[#0d0d0d]"><LoaderCircle className="h-5 w-5 animate-spin text-[#86efac]"/></div></FinancePageShell>

  if (notFound || !invoice) return <FinancePageShell title="Invoice" description="This invoice could not be found."><div className="rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-8 text-center text-sm text-[#666]"><p>This invoice does not exist or you do not have access to it.</p><Link href="/review" className="mt-4 inline-flex items-center gap-2 text-xs text-[#86efac]"><ArrowLeft className="h-4 w-4"/>Back to review queue</Link></div></FinancePageShell>

  const n = invoice.normalized
  return <FinancePageShell title={customerName(n) || invoice.source?.originalName || "Invoice"} description={`Status: ${invoice.status}`} action={<Link href="/review" className="flex h-10 items-center gap-2 rounded-xl border border-[#242424] px-4 text-xs text-[#888]"><ArrowLeft className="h-4 w-4"/>Back to queue</Link>}>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/[0.05] bg-[#151515] p-5"><p className="mb-4 text-sm font-medium">{invoice.source?.originalName || "Invoice document"}</p><DocumentViewer url={documentUrl} contentType={invoice.source?.contentType} fileName={invoice.source?.originalName}/></div>
      <div className="rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-5"><dl className="space-y-3 text-sm">
        <Row label="Customer" value={customerName(n)}/>{n?.issuerName ? <Row label="Issuer" value={n.issuerName}/> : null}<Row label="Customer contact" value={n?.customerEmail || n?.customerPhone}/><Row label="Sales person" value={n?.handlerName || n?.handlerEmail}/><Row label="Invoice number" value={n?.invoiceNumber}/><Row label="Invoice date" value={n?.invoiceDate}/><Row label="Due date" value={n?.dueDate}/><Row label="Subtotal" value={money(n?.subtotal)}/><Row label="Tax" value={money(n?.tax)}/><Row label={n?.amountsTaxInclusive ? "Total payable (tax inclusive)" : "Total payable"} value={money(n?.total)}/>
      </dl></div>
    </div>
  </FinancePageShell>
}

export default function InvoiceDetailPage() {
  return <Suspense fallback={<FinancePageShell title="Invoice" description="Loading."><div className="grid min-h-[400px] place-items-center rounded-2xl border border-white/[0.05] bg-[#0d0d0d]"><LoaderCircle className="h-5 w-5 animate-spin text-[#86efac]"/></div></FinancePageShell>}><InvoiceDetail /></Suspense>
}

function Row({ label, value }: { label: string; value?: string | null }) { return <div className="flex justify-between border-b border-[#191919] pb-2"><dt className="text-[11px] text-[#666]">{label}</dt><dd className="text-[#ddd]">{value || "—"}</dd></div> }
function money(value?: Money) { if (!value || value.amount == null) return "—"; return `${value.amount} ${value.currency || ""}`.trim() }
