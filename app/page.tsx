"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import Link from "next/link"
import { Icon, type IconName } from "@/components/icon"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"

// Iconsax-backed wrappers preserving the existing JSX API (className/size).
const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant} />
}
const ArrowRight = mk("ArrowRight")
const Check = mk("TickCircle", "Bold")
const CheckCircle2 = mk("TickCircle", "Bold")
const ChevronRight = mk("ArrowRight2")
const Clock3 = mk("Clock")
const FileCheck2 = mk("DocumentText")
const FileText = mk("DocumentText")
const Inbox = mk("Box")
const ScanLine = mk("Scan")
const Send = mk("Send2", "Bold")
const Sparkles = mk("MagicStar", "Bold")
const TrendingUp = mk("ArrowUp")
const UploadCloud = mk("ImportCurve")
const WalletCards = mk("Wallet")
const X = mk("CloseCircle")
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"
import { formatMoney } from "@/lib/demo-store"
import { uploadInvoice } from "@/lib/invoices/upload"

type Status = "uploading" | "uploaded" | "processing" | "needs_review" | "verified" | "rejected" | "failed"
type Money = { amount?: number | null; currency?: string | null }
type DashInvoice = {
  id: string
  status: Status
  source?: { originalName?: string }
  normalized?: { vendorName?: string | null; invoiceNumber?: string | null; invoiceDate?: string | null; dueDate?: string | null; total?: Money }
  duplicateCheck?: { status?: string; matchedInvoiceIds?: string[]; score?: number | null }
  createdAt?: { toDate?: () => Date }
}

const statusMeta: Record<string, { label: string; tone: string }> = {
  needs_review: { label: "Needs review", tone: "amber" },
  verified: { label: "Verified", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  failed: { label: "Failed", tone: "red" },
  processing: { label: "Processing", tone: "blue" },
  uploaded: { label: "Queued", tone: "blue" },
  uploading: { label: "Uploading", tone: "blue" },
}

const statusStyles: Record<string, string> = {
  amber: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  green: "bg-[#86efac]/10 text-[#86efac] border-[#86efac]/20",
  red: "bg-red-400/10 text-red-300 border-red-400/20",
  blue: "bg-sky-400/10 text-sky-300 border-sky-400/20",
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function isOverdue(invoice: DashInvoice): boolean {
  const due = invoice.normalized?.dueDate
  if (!due) return false
  // Overdue = still open (not verified/rejected) and past the due date.
  if (["rejected", "verified"].includes(invoice.status)) return false
  return due < new Date().toISOString().slice(0, 10)
}

export default function Dashboard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoices, setInvoices] = useState<DashInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!workspaceId || !firebaseDb) { if (!workspaceLoading) setLoading(false); return }
    return onSnapshot(query(collection(firebaseDb, `workspaces/${workspaceId}/invoices`), orderBy("createdAt", "desc")), (snapshot) => {
      setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as DashInvoice)))
      setLoading(false)
    }, () => { setError("Could not load dashboard data."); setLoading(false) })
  }, [workspaceId, workspaceLoading])

  const metrics = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonth = invoices.filter((i) => { const d = i.createdAt?.toDate?.(); return d ? d >= monthStart : false })
    const needsReview = invoices.filter((i) => i.status === "needs_review")
    const awaiting = invoices.filter((i) => ["needs_review", "verified"].includes(i.status) && !isOverdue(i))
    const awaitingValue = awaiting.reduce((sum, i) => sum + (i.normalized?.total?.amount || 0), 0)
    const overdue = invoices.filter(isOverdue)
    const overdueValue = overdue.reduce((sum, i) => sum + (i.normalized?.total?.amount || 0), 0)
    return { thisMonthCount: thisMonth.length, needsReviewCount: needsReview.length, awaitingValue, awaitingCount: awaiting.length, overdueValue, overdueCount: overdue.length }
  }, [invoices])

  const spendData = useMemo(() => {
    const now = new Date()
    const buckets: { month: string; paid: number; pending: number }[] = []
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      buckets.push({ month: MONTHS[d.getMonth()], paid: 0, pending: 0 })
    }
    const base = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    for (const invoice of invoices) {
      const created = invoice.createdAt?.toDate?.()
      if (!created || created < base) continue
      const idx = (created.getFullYear() - base.getFullYear()) * 12 + (created.getMonth() - base.getMonth())
      if (idx < 0 || idx > 5) continue
      const amount = invoice.normalized?.total?.amount || 0
      if (invoice.status === "verified") buckets[idx].paid += amount
      else if (["needs_review", "processing", "uploaded"].includes(invoice.status)) buckets[idx].pending += amount
    }
    return buckets
  }, [invoices])

  const totalFlow = useMemo(() => spendData.reduce((sum, b) => sum + b.paid + b.pending, 0), [spendData])

  const duplicates = useMemo(() => {
    const flagged = invoices.filter((i) => i.duplicateCheck?.status === "possible_duplicate")
    const value = flagged.reduce((sum, i) => sum + (i.normalized?.total?.amount || 0), 0)
    const topScore = flagged.reduce((max, i) => Math.max(max, i.duplicateCheck?.score || 0), 0)
    return { count: flagged.length, value, topScore }
  }, [invoices])

  const processing = useMemo(() => {
    const uploaded = invoices.length
    const extracted = invoices.filter((i) => ["needs_review", "verified", "rejected"].includes(i.status)).length
    const verified = invoices.filter((i) => i.status === "verified").length
    const needsReview = invoices.filter((i) => i.status === "needs_review").length
    return { uploaded, extracted, verified, needsReview, pct: uploaded ? Math.round((extracted / uploaded) * 1000) / 10 : 0 }
  }, [invoices])

  const recent = useMemo(() => invoices.slice(0, 6), [invoices])
  const scanData = useMemo(() => spendData.map((b, i) => ({ i, value: b.paid + b.pending })), [spendData])

  async function handleUpload(files: FileList | null) {
    if (!files?.length || !workspaceId || !user) return
    setUploading(true); setUploaded(false); setError("")
    try {
      for (const file of Array.from(files)) await uploadInvoice(file, workspaceId, user.uid)
      setUploaded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const greeting = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <Header />
      <div className="h-screen overflow-y-auto no-scrollbar">
        <main className="flex min-h-full gap-6 p-4 pt-24 md:p-6 md:pt-24">
          <Sidebar />
          <div className="mx-auto flex w-full max-w-[1500px] min-w-0 flex-1 flex-col gap-5 pb-8">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#666]"><span className="h-1.5 w-1.5 rounded-full bg-[#86efac]" />{greeting}</p>
                <h1 className="text-3xl font-medium tracking-[-0.04em] md:text-4xl">Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}.</h1>
                <p className="mt-2 text-sm text-[#777]">Here&apos;s what needs your finance team&apos;s attention today.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} disabled={uploading || !workspaceId} className="flex h-11 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black transition hover:bg-[#a7f3c0] disabled:opacity-50">
                  <UploadCloud className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload invoices"}
                </button>
                <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => handleUpload(event.target.files)} />
              </div>
            </section>

            {(uploading || uploaded || error) && (
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-400/10 text-red-200" : uploaded ? "border-[#86efac]/20 bg-[#86efac]/10 text-[#b8f7cc]" : "border-[#313131] bg-[#121212] text-[#AAA]"}`}>
                {error ? <X className="h-4 w-4" /> : uploaded ? <CheckCircle2 className="h-4 w-4" /> : <ScanLine className="h-4 w-4 animate-pulse text-[#86efac]" />}
                {error || (uploaded ? "Upload received. Ledger AI is extracting invoice data." : "Uploading and preparing document for AI review…")}
                <button onClick={() => { setUploaded(false); setError("") }} className="ml-auto"><X className="h-4 w-4" /></button>
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={WalletCards} label="Invoices this month" value={`${metrics.thisMonthCount}`} detail={`${invoices.length} total in workspace`} />
              <Metric icon={ScanLine} label="Needs AI review" value={`${metrics.needsReviewCount}`} detail={metrics.needsReviewCount ? "Awaiting your approval" : "Queue is clear"} accent="amber" />
              <Metric icon={Clock3} label="Awaiting payment" value={formatMoney(metrics.awaitingValue)} detail={`Across ${metrics.awaitingCount} invoice${metrics.awaitingCount === 1 ? "" : "s"}`} />
              <Metric icon={TrendingUp} label="Overdue exposure" value={formatMoney(metrics.overdueValue)} detail={`${metrics.overdueCount} invoice${metrics.overdueCount === 1 ? "" : "s"} overdue`} accent="red" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
              <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5 md:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-medium">Invoice flow</h2>
                    <p className="mt-1 text-xs text-[#666]">Paid and outstanding volume over 6 months</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-[#777]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#86efac]" />Paid</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#333]" />Outstanding</span></div>
                </div>
                <div className="mt-4 flex items-end gap-3"><span className="text-3xl font-medium tracking-tight">{formatMoney(totalFlow)}</span></div>
                <div className="mt-4 h-[220px]">
                  {totalFlow === 0 ? <EmptyChart /> : <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spendData} barGap={4}>
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#555", fontSize: 11 }} />
                      <Tooltip cursor={{ fill: "#151515" }} contentStyle={{ background: "#151515", border: "1px solid #292929", borderRadius: 10, fontSize: 12 }} formatter={(value: number) => formatMoney(value)} />
                      <Bar dataKey="paid" fill="#86efac" radius={[5, 5, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="pending" fill="#292929" radius={[5, 5, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-[#86efac]/10 bg-[#0D0D0D] p-5 md:p-6">
                <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-[#86efac]/[0.06] blur-3xl" />
                <div className="flex items-center justify-between"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><Sparkles className="h-4 w-4" /></div><span className="rounded-full border border-[#86efac]/20 px-2 py-1 text-[9px] uppercase tracking-widest text-[#86efac]">AI insight</span></div>
                <h2 className="mt-5 text-xl font-medium tracking-tight">{duplicates.count > 0 ? `${duplicates.count} invoice${duplicates.count === 1 ? "" : "s"} may be duplicate${duplicates.count === 1 ? "" : "s"}.` : "No duplicate invoices detected."}</h2>
                <p className="mt-2 text-sm leading-6 text-[#777]">{duplicates.count > 0 ? "Ledger AI matched invoice numbers, totals, and vendor details across your scans." : "Ledger AI checks every extracted invoice against your workspace history."}</p>
                {duplicates.count > 0 && <div className="mt-5 rounded-xl border border-[#222] bg-[#111] p-4">
                  <div className="flex items-center justify-between"><span className="text-xs text-[#888]">Potential duplicate value</span><span className="text-sm font-medium">{formatMoney(duplicates.value)}</span></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#262626]"><div className="h-full rounded-full bg-[#86efac]" style={{ width: `${Math.round(duplicates.topScore * 100)}%` }} /></div>
                  <p className="mt-2 text-[10px] text-[#555]">{Math.round(duplicates.topScore * 100)}% top match confidence</p>
                </div>}
                <Link href="/review" className="mt-5 flex items-center gap-2 text-xs font-medium text-[#86efac]">Review flagged invoices <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0D0D0D]">
              <div className="flex flex-col gap-3 border-b border-[#1C1C1C] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-base font-medium">Recent invoices</h2><p className="mt-1 text-xs text-[#666]">AI-extracted documents across your workspace</p></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead><tr className="text-[10px] uppercase tracking-[0.14em] text-[#555]"><th className="px-5 py-3 font-medium">Vendor</th><th className="px-5 py-3 font-medium">Invoice</th><th className="px-5 py-3 font-medium">ScanLine date</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 font-medium">AI status</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {recent.map((invoice) => {
                      const meta = statusMeta[invoice.status] || { label: invoice.status, tone: "blue" }
                      const vendor = invoice.normalized?.vendorName || invoice.source?.originalName || "Awaiting extraction"
                      const initials = vendor.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "IN"
                      const scanned = invoice.createdAt?.toDate?.()
                      return (
                        <tr key={invoice.id} className="border-t border-[#181818] text-sm transition hover:bg-[#111]">
                          <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1B1B1B] text-[10px] font-semibold text-[#AAA]">{initials}</span><span className="font-medium text-[#DDD]">{vendor}</span></div></td>
                          <td className="px-5 py-4 font-mono text-xs text-[#777]">{invoice.normalized?.invoiceNumber || "—"}</td>
                          <td className="px-5 py-4 text-xs text-[#777]">{scanned ? scanned.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}</td>
                          <td className="px-5 py-4 text-right font-medium">{invoice.normalized?.total?.amount == null ? "—" : formatMoney(invoice.normalized.total.amount)}</td>
                          <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] ${statusStyles[meta.tone]}`}>{meta.label}</span></td>
                          <td className="pr-4">{invoice.status === "needs_review" ? <Link href="/review" className="text-[10px] text-[#86efac]">Review</Link> : <Link href={`/review/invoice?id=${invoice.id}`} className="text-[#555] hover:text-white"><ChevronRight className="h-4 w-4" /></Link>}</td>
                        </tr>
                      )
                    })}
                    {!loading && recent.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-xs text-[#666]">No invoices yet. Upload one to get started.</td></tr>}
                  </tbody>
                </table>
              </div>
              <Link href="/invoices" className="flex w-full items-center justify-center gap-2 border-t border-[#1C1C1C] py-3.5 text-xs text-[#777] transition hover:bg-[#111] hover:text-white">View all invoices <ChevronRight className="h-3.5 w-3.5" /></Link>
            </section>

            <section className="grid gap-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5 lg:col-span-2">
                <div className="flex items-center justify-between"><div><h2 className="text-base font-medium">AI processing</h2><p className="mt-1 text-xs text-[#666]">Document extraction activity</p></div><span className="flex items-center gap-2 text-[10px] text-[#86efac]"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#86efac]" />Systems operational</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Process icon={FileText} label="Uploaded" value={`${processing.uploaded}`} sub="documents" />
                  <Process icon={ScanLine} label="Extracted" value={`${processing.extracted}`} sub={`${processing.pct}% complete`} />
                  <Process icon={FileCheck2} label="Verified" value={`${processing.verified}`} sub={`${processing.needsReview} need review`} />
                </div>
                <div className="mt-5 h-14"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scanData}><defs><linearGradient id="scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#86efac" stopOpacity={0.25}/><stop offset="1" stopColor="#86efac" stopOpacity={0}/></linearGradient></defs><Area dataKey="value" type="monotone" stroke="#86efac" strokeWidth={1.5} fill="url(#scan)" /></AreaChart></ResponsiveContainer></div>
              </div>
              <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5">
                <div className="flex items-center justify-between"><div><h2 className="text-base font-medium">Follow-ups</h2><p className="mt-1 text-xs text-[#666]">Vendor outreach</p></div><Send className="h-4 w-4 text-[#86efac]" /></div>
                <div className="mt-5 space-y-3">
                  <Followup label="Payment reminders" company="Ready when invoices go overdue" time={`${metrics.overdueCount} overdue`} />
                  <Followup label="Review reminders" company="Invoices awaiting approval" time={`${metrics.needsReviewCount} pending`} />
                </div>
                <Link href="/follow-ups" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#272727] bg-[#151515] py-2.5 text-xs text-[#AAA] hover:text-white">Open follow-ups <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </section>

            <div className="flex items-center justify-end gap-2 pt-2 text-[11px] text-[#555]"><span className="h-2 w-2 rounded-full bg-[#86efac]" />Ledger AI is online</div>
          </div>
        </main>
      </div>
    </div>
  )
}

function EmptyChart() {
  return <div className="grid h-full place-items-center rounded-xl border border-dashed border-[#222] text-center"><div><Inbox className="mx-auto h-8 w-8 text-[#333]" /><p className="mt-2 text-xs text-[#555]">No invoice volume yet</p></div></div>
}

function Metric({ icon: Icon, label, value, detail, trend, accent }: { icon: React.ElementType; label: string; value: string; detail: string; trend?: string; accent?: "amber" | "red" }) {
  const color = accent === "red" ? "text-red-300" : accent === "amber" ? "text-amber-300" : "text-[#86efac]"
  return <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5"><div className="flex items-center justify-between"><span className="text-xs text-[#777]">{label}</span><Icon className={`h-4 w-4 ${color}`} /></div><div className="mt-4 flex items-end justify-between gap-2"><span className="text-2xl font-medium tracking-tight">{value}</span>{trend && <span className="mb-0.5 rounded-full bg-[#86efac]/10 px-2 py-1 text-[9px] text-[#86efac]">{trend}</span>}</div><p className={`mt-2 text-[11px] ${accent ? color : "text-[#555]"}`}>{detail}</p></div>
}

function Process({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return <div className="rounded-xl border border-[#1F1F1F] bg-[#111] p-4"><div className="flex items-center gap-2 text-xs text-[#777]"><Icon className="h-3.5 w-3.5" />{label}</div><div className="mt-3 flex items-baseline gap-2"><span className="text-2xl font-medium">{value}</span><span className="text-[10px] text-[#555]">{sub}</span></div></div>
}

function Followup({ label, company, time }: { label: string; company: string; time: string }) {
  return <div className="flex items-start gap-3 rounded-xl bg-[#121212] p-3"><span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-[#86efac]/10 text-[#86efac]"><Check className="h-3 w-3" /></span><div><p className="text-xs font-medium text-[#DDD]">{label}</p><p className="mt-1 text-[10px] text-[#666]">{company} · {time}</p></div></div>
}
