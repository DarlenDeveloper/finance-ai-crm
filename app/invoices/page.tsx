"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { Download, Filter, Search, UploadCloud, X } from "lucide-react"
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"
import { formatMoney } from "@/lib/demo-store"
import { uploadInvoice } from "@/lib/invoices/upload"

type Status = "uploading" | "uploaded" | "processing" | "needs_review" | "verified" | "rejected" | "failed"
type Invoice = { id: string; status: Status; source?: { originalName?: string }; normalized?: { vendorName?: string | null; invoiceNumber?: string | null; invoiceDate?: string | null; total?: { amount?: number | null; currency?: string | null } }; createdAt?: { toDate?: () => Date }; ai?: { errorMessage?: string | null } }
const labels: Record<Status, string> = { uploading: "Uploading", uploaded: "Queued", processing: "Processing", needs_review: "Needs review", verified: "Verified", rejected: "Rejected", failed: "Failed" }
const tones: Record<Status, string> = { uploading: "border-sky-400/20 bg-sky-400/10 text-sky-300", uploaded: "border-sky-400/20 bg-sky-400/10 text-sky-300", processing: "border-sky-400/20 bg-sky-400/10 text-sky-300", needs_review: "border-amber-400/20 bg-amber-400/10 text-amber-300", verified: "border-[#86efac]/20 bg-[#86efac]/10 text-[#86efac]", rejected: "border-red-400/20 bg-red-400/10 text-red-300", failed: "border-red-400/20 bg-red-400/10 text-red-300" }

export default function InvoicesPage() {
  const { user } = useAuth()
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [queryText, setQueryText] = useState("")
  const [status, setStatus] = useState<Status | "all">("all")
  const [message, setMessage] = useState("")
  const [uploading, setUploading] = useState(false)
  const [percent, setPercent] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!workspaceId || !firebaseDb) { if (!workspaceLoading) setLoading(false); return }
    return onSnapshot(query(collection(firebaseDb, `workspaces/${workspaceId}/invoices`), orderBy("createdAt", "desc")), (snapshot) => {
      setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Invoice)))
      setLoading(false)
    }, () => { setMessage("Could not load invoices."); setLoading(false) })
  }, [workspaceId, workspaceLoading])

  const visible = useMemo(() => invoices.filter((invoice) => {
    const haystack = `${invoice.normalized?.vendorName || ""} ${invoice.normalized?.invoiceNumber || ""} ${invoice.source?.originalName || ""}`.toLowerCase()
    return haystack.includes(queryText.toLowerCase()) && (status === "all" || invoice.status === status)
  }), [invoices, queryText, status])
  const verified = invoices.filter((invoice) => invoice.status === "verified")
  const verifiedValue = verified.reduce((sum, invoice) => sum + (invoice.normalized?.total?.amount || 0), 0)
  const pending = invoices.filter((invoice) => ["uploading", "uploaded", "processing", "needs_review"].includes(invoice.status))

  async function upload(files: FileList | null) {
    if (!files?.length || !workspaceId || !user) return
    setUploading(true); setMessage("")
    try {
      const list = Array.from(files)
      for (let i = 0; i < list.length; i++) await uploadInvoice(list[i], workspaceId, user.uid, ({ percent: filePercent }) => setPercent(Math.round(((i + filePercent / 100) / list.length) * 100)))
      setMessage(`${list.length} invoice${list.length === 1 ? "" : "s"} uploaded. Gemini processing started.`)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Upload failed.") }
    finally { setUploading(false); setPercent(0); if (fileRef.current) fileRef.current.value = "" }
  }

  function exportCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = ["Vendor,Invoice number,Date,Amount,Currency,Status", ...visible.map((invoice) => [invoice.normalized?.vendorName || "", invoice.normalized?.invoiceNumber || "", invoice.normalized?.invoiceDate || "", String(invoice.normalized?.total?.amount ?? ""), invoice.normalized?.total?.currency || "", labels[invoice.status]].map(escape).join(","))].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "ledger-ai-invoices.csv"; link.click(); URL.revokeObjectURL(url)
  }

  return <FinancePageShell title="Invoices" description="Approved invoices and documents currently moving through review." action={<><button disabled={uploading || !workspaceId} onClick={() => fileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black disabled:opacity-50"><UploadCloud className="h-4 w-4"/>{uploading ? `Uploading ${percent}%` : "Upload invoice"}</button><input ref={fileRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(event) => upload(event.target.files)}/></>}>
    {message && <div className="flex items-center rounded-xl border border-[#86efac]/20 bg-[#86efac]/10 p-3 text-xs text-[#b8f7cc]"><span>{message}</span><button className="ml-auto" onClick={() => setMessage("")}><X className="h-4 w-4"/></button></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Approved invoices" value={`${verified.length}`} detail="Saved to the live ledger"/><StatCard label="Approved value" value={formatMoney(verifiedValue)} detail="Across verified invoices"/><StatCard label="In review pipeline" value={`${pending.length}`} detail="Upload, AI, and review" color="text-amber-300"/><StatCard label="Failed" value={`${invoices.filter((item) => item.status === "failed").length}`} detail="Available for inspection" color="text-red-300"/></div>
    <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0D0D0D]">
      <div className="flex flex-wrap gap-3 border-b border-[#1c1c1c] p-4"><div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-[#242424] bg-[#111] px-3"><Search className="h-4 w-4 text-[#555]"/><input value={queryText} onChange={(event) => setQueryText(event.target.value)} className="h-10 w-full bg-transparent text-xs outline-none" placeholder="Search vendor, invoice number, or filename"/></div><label className="flex items-center gap-2 rounded-xl border border-[#242424] px-3 text-xs text-[#888]"><Filter className="h-4 w-4"/><select value={status} onChange={(event) => setStatus(event.target.value as Status | "all")} className="h-10 bg-transparent outline-none"><option className="bg-[#111]" value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option className="bg-[#111]" value={value} key={value}>{label}</option>)}</select></label><button onClick={exportCsv} className="flex items-center gap-2 rounded-xl border border-[#242424] px-4 text-xs text-[#888]"><Download className="h-4 w-4"/>Export</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[780px]"><thead><tr className="text-left text-[10px] uppercase tracking-widest text-[#555]"><th className="px-5 py-3">Vendor / document</th><th>Invoice number</th><th>Date</th><th className="text-right">Amount</th><th className="pl-8">Status</th><th/></tr></thead><tbody>{visible.map((invoice) => <tr key={invoice.id} className="border-t border-[#181818] text-sm hover:bg-[#111]"><td className="px-5 py-4 font-medium text-[#ddd]">{invoice.normalized?.vendorName || invoice.source?.originalName || "Awaiting extraction"}{invoice.ai?.errorMessage && <span className="mt-1 block text-[9px] font-normal text-red-300">{invoice.ai.errorMessage}</span>}</td><td className="font-mono text-xs text-[#777]">{invoice.normalized?.invoiceNumber || "—"}</td><td className="text-xs text-[#777]">{invoice.normalized?.invoiceDate || "—"}</td><td className="text-right font-medium">{invoice.normalized?.total?.amount == null ? "—" : formatMoney(invoice.normalized.total.amount)}</td><td className="pl-8"><span className={`rounded-full border px-2.5 py-1 text-[10px] ${tones[invoice.status]}`}>{labels[invoice.status]}</span></td><td>{invoice.status === "needs_review" ? <Link href="/review" className="text-[10px] text-[#86efac]">Review</Link> : null}</td></tr>)}</tbody></table>{!loading && !visible.length && <div className="border-t border-[#181818] p-10 text-center text-xs text-[#666]">No invoices match this view.</div>}</div>
      <div className="border-t border-[#1c1c1c] p-4 text-center text-xs text-[#666]">{loading ? "Loading invoices…" : `${visible.length} invoice${visible.length === 1 ? "" : "s"}`}</div>
    </div>
  </FinancePageShell>
}
