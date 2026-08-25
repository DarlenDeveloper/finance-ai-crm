"use client"

import { useRef, useState } from "react"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  MoreHorizontal,
  ScanLine,
  Send,
  Sparkles,
  TrendingUp,
  UploadCloud,
  WalletCards,
  X,
} from "lucide-react"
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { useDemoStore } from "@/lib/demo-store"
import Link from "next/link"

const spendData = [
  { month: "Mar", paid: 42, pending: 10 },
  { month: "Apr", paid: 55, pending: 13 },
  { month: "May", paid: 49, pending: 18 },
  { month: "Jun", paid: 68, pending: 12 },
  { month: "Jul", paid: 62, pending: 21 },
  { month: "Aug", paid: 76, pending: 17 },
]

const scanData = [12, 18, 15, 24, 22, 31, 28, 38, 34, 47, 43, 58].map((value, i) => ({ i, value }))

const invoices = [
  { vendor: "Kampala Office Supplies", initials: "KO", id: "INV-2026-1842", date: "08 Aug", amount: "$12,480.00", status: "Needs review", tone: "amber", confidence: "84%" },
  { vendor: "Africa Logistics Co.", initials: "AL", id: "ALC-009821", date: "07 Aug", amount: "$8,920.50", status: "Verified", tone: "green", confidence: "99%" },
  { vendor: "Nile Energy Systems", initials: "NE", id: "NES/4491/26", date: "06 Aug", amount: "$23,170.00", status: "Overdue", tone: "red", confidence: "97%" },
  { vendor: "Eastline Technologies", initials: "ET", id: "ET-88420", date: "05 Aug", amount: "$4,630.80", status: "Processing", tone: "blue", confidence: "—" },
]

const statusStyles: Record<string, string> = {
  amber: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  green: "bg-[#86efac]/10 text-[#86efac] border-[#86efac]/20",
  red: "bg-red-400/10 text-red-300 border-red-400/20",
  blue: "bg-sky-400/10 text-sky-300 border-sky-400/20",
}

export default function Dashboard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const { addFiles } = useDemoStore()

  function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setUploaded(false)
    window.setTimeout(() => {
      addFiles(files)
      setUploading(false)
      setUploaded(true)
    }, 1400)
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <Header />
      <div className="h-screen overflow-y-auto no-scrollbar">
        <main className="flex min-h-full gap-6 p-4 pt-24 md:p-6 md:pt-24">
          <Sidebar />
          <div className="mx-auto flex w-full max-w-[1500px] min-w-0 flex-1 flex-col gap-5 pb-8">
            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#666]"><span className="h-1.5 w-1.5 rounded-full bg-[#86efac]" />Monday, 10 August</p>
                <h1 className="text-3xl font-medium tracking-[-0.04em] md:text-4xl">Good morning, Alice.</h1>
                <p className="mt-2 text-sm text-[#777]">Here&apos;s what needs your finance team&apos;s attention today.</p>
              </div>
              <div className="flex gap-2">
                <button className="h-11 rounded-xl border border-[#262626] bg-[#101010] px-4 text-xs text-[#AAA] transition hover:text-white">Export report</button>
                <button onClick={() => fileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black transition hover:bg-[#a7f3c0]">
                  <UploadCloud className="h-4 w-4" /> Upload invoices
                </button>
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(event) => handleUpload(event.target.files)} />
              </div>
            </section>

            {(uploading || uploaded) && (
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${uploaded ? "border-[#86efac]/20 bg-[#86efac]/10 text-[#b8f7cc]" : "border-[#313131] bg-[#121212] text-[#AAA]"}`}>
                {uploaded ? <CheckCircle2 className="h-4 w-4" /> : <ScanLine className="h-4 w-4 animate-pulse text-[#86efac]" />}
                {uploaded ? "Upload received. Ledger AI is extracting invoice data." : "Uploading and preparing document for AI review…"}
                <button onClick={() => setUploaded(false)} className="ml-auto"><X className="h-4 w-4" /></button>
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={WalletCards} label="Invoices this month" value="248" detail="32 added this week" trend="+14.8%" />
              <Metric icon={ScanLine} label="Needs AI review" value="7" detail="3 high priority" accent="amber" />
              <Metric icon={Clock3} label="Awaiting payment" value="$84,290" detail="Across 19 invoices" />
              <Metric icon={TrendingUp} label="Overdue exposure" value="$31,640" detail="5 invoices overdue" accent="red" />
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
                <div className="mt-4 flex items-end gap-3"><span className="text-3xl font-medium tracking-tight">$364,820</span><span className="mb-1 rounded-full bg-[#86efac]/10 px-2 py-1 text-[10px] text-[#86efac]">+12.4%</span></div>
                <div className="mt-4 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={spendData} barGap={4}>
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#555", fontSize: 11 }} />
                      <Tooltip cursor={{ fill: "#151515" }} contentStyle={{ background: "#151515", border: "1px solid #292929", borderRadius: 10, fontSize: 12 }} />
                      <Bar dataKey="paid" fill="#86efac" radius={[5, 5, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="pending" fill="#292929" radius={[5, 5, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-[#86efac]/10 bg-[#0D0D0D] p-5 md:p-6">
                <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-[#86efac]/[0.06] blur-3xl" />
                <div className="flex items-center justify-between"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><Sparkles className="h-4 w-4" /></div><span className="rounded-full border border-[#86efac]/20 px-2 py-1 text-[9px] uppercase tracking-widest text-[#86efac]">AI insight</span></div>
                <h2 className="mt-5 text-xl font-medium tracking-tight">Three invoices may be duplicates.</h2>
                <p className="mt-2 text-sm leading-6 text-[#777]">Ledger AI matched invoice numbers, totals, and vendor details from this week&apos;s scans.</p>
                <div className="mt-5 rounded-xl border border-[#222] bg-[#111] p-4">
                  <div className="flex items-center justify-between"><span className="text-xs text-[#888]">Potential duplicate value</span><span className="text-sm font-medium">$9,480.00</span></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#262626]"><div className="h-full w-[92%] rounded-full bg-[#86efac]" /></div>
                  <p className="mt-2 text-[10px] text-[#555]">92% match confidence</p>
                </div>
                <Link href="/review" className="mt-5 flex items-center gap-2 text-xs font-medium text-[#86efac]">Review flagged invoices <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0D0D0D]">
              <div className="flex flex-col gap-3 border-b border-[#1C1C1C] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-base font-medium">Recent invoices</h2><p className="mt-1 text-xs text-[#666]">AI-extracted documents across your workspace</p></div>
                <div className="flex items-center gap-1 rounded-lg bg-[#151515] p-1 text-[11px]"><button className="rounded-md bg-[#252525] px-3 py-1.5 text-white">All</button><button className="px-3 py-1.5 text-[#666]">Review</button><button className="px-3 py-1.5 text-[#666]">Overdue</button></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead><tr className="text-[10px] uppercase tracking-[0.14em] text-[#555]"><th className="px-5 py-3 font-medium">Vendor</th><th className="px-5 py-3 font-medium">Invoice</th><th className="px-5 py-3 font-medium">Scan date</th><th className="px-5 py-3 text-right font-medium">Amount</th><th className="px-5 py-3 font-medium">AI status</th><th className="px-5 py-3 font-medium">Confidence</th><th className="w-10" /></tr></thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-t border-[#181818] text-sm transition hover:bg-[#111]">
                        <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1B1B1B] text-[10px] font-semibold text-[#AAA]">{invoice.initials}</span><span className="font-medium text-[#DDD]">{invoice.vendor}</span></div></td>
                        <td className="px-5 py-4 font-mono text-xs text-[#777]">{invoice.id}</td>
                        <td className="px-5 py-4 text-xs text-[#777]">{invoice.date}</td>
                        <td className="px-5 py-4 text-right font-medium">{invoice.amount}</td>
                        <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] ${statusStyles[invoice.tone]}`}>{invoice.status}</span></td>
                        <td className="px-5 py-4 text-xs text-[#777]">{invoice.confidence}</td>
                        <td className="pr-4"><button className="text-[#555] hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link href="/invoices" className="flex w-full items-center justify-center gap-2 border-t border-[#1C1C1C] py-3.5 text-xs text-[#777] transition hover:bg-[#111] hover:text-white">View all invoices <ChevronRight className="h-3.5 w-3.5" /></Link>
            </section>

            <section className="grid gap-5 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5 lg:col-span-2">
                <div className="flex items-center justify-between"><div><h2 className="text-base font-medium">AI processing</h2><p className="mt-1 text-xs text-[#666]">Document extraction activity</p></div><span className="flex items-center gap-2 text-[10px] text-[#86efac]"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#86efac]" />Systems operational</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Process icon={FileText} label="Uploaded" value="68" sub="documents" />
                  <Process icon={ScanLine} label="Extracted" value="61" sub="89.7% complete" />
                  <Process icon={FileCheck2} label="Verified" value="54" sub="7 need review" />
                </div>
                <div className="mt-5 h-14"><ResponsiveContainer width="100%" height="100%"><AreaChart data={scanData}><defs><linearGradient id="scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#86efac" stopOpacity={0.25}/><stop offset="1" stopColor="#86efac" stopOpacity={0}/></linearGradient></defs><Area dataKey="value" type="monotone" stroke="#86efac" strokeWidth={1.5} fill="url(#scan)" /></AreaChart></ResponsiveContainer></div>
              </div>
              <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5">
                <div className="flex items-center justify-between"><div><h2 className="text-base font-medium">Follow-ups</h2><p className="mt-1 text-xs text-[#666]">Ready to send</p></div><Send className="h-4 w-4 text-[#86efac]" /></div>
                <div className="mt-5 space-y-3">
                  <Followup label="Payment reminder" company="Nile Energy Systems" time="Due 4 days ago" />
                  <Followup label="Missing tax ID" company="Gulu Trade Partners" time="Detected today" />
                </div>
                <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#272727] bg-[#151515] py-2.5 text-xs text-[#AAA] hover:text-white">Review 4 drafts <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
            </section>

            <div className="flex items-center justify-end gap-2 pt-2 text-[11px] text-[#555]"><span className="h-2 w-2 rounded-full bg-[#86efac]" />Ledger AI is online</div>
          </div>
        </main>
      </div>
    </div>
  )
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
