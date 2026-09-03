"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { Icon, type IconName } from "@/components/icon"
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"
import { formatMoney } from "@/lib/demo-store"
import { invoicePaymentState, type InvoicePaymentState } from "@/lib/invoices/payment"

const mk = (name: IconName) => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className}/>
}
const Download = mk("DocumentDownload")
const Loader = mk("Refresh")
const Users = mk("Profile2User")

type SalesInvoice = {
  id: string
  status: string
  source?: { originalName?: string }
  normalized?: {
    vendorName?: string | null
    customerName?: string | null
    handlerContactId?: string | null
    handlerName?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    dueDate?: string | null
    total?: { amount?: number | null; currency?: string | null }
  }
  payment?: { status?: "paid" | "unpaid" | null }
}

type SalesRow = {
  key: string
  name: string
  invoices: SalesInvoice[]
  totalValue: number
  paidCount: number
  paidValue: number
  unpaidCount: number
  unpaidValue: number
  overdueCount: number
  overdueValue: number
}

const paymentLabels: Record<InvoicePaymentState, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
  not_applicable: "—",
}
const paymentTones: Record<InvoicePaymentState, string> = {
  paid: "border-[#86efac]/20 bg-[#86efac]/10 text-[#3f9d60]",
  unpaid: "border-sky-400/20 bg-sky-400/10 text-sky-600",
  overdue: "border-red-400/20 bg-red-400/10 text-red-600",
  not_applicable: "border-[#292929] text-[#777]",
}

function salespersonKey(invoice: SalesInvoice) {
  return invoice.normalized?.handlerContactId || (invoice.normalized?.handlerName ? `name:${invoice.normalized.handlerName.toLowerCase()}` : "unassigned")
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase()
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export default function SalesPerformancePage() {
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoices, setInvoices] = useState<SalesInvoice[]>([])
  const [selectedKey, setSelectedKey] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!workspaceId || !firebaseDb) {
      if (!workspaceLoading) setLoading(false)
      return
    }
    return onSnapshot(
      query(collection(firebaseDb, `workspaces/${workspaceId}/invoices`), orderBy("createdAt", "desc")),
      (snapshot) => {
        setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SalesInvoice)))
        setError("")
        setLoading(false)
      },
      () => {
        setError("Could not load sales performance.")
        setLoading(false)
      },
    )
  }, [workspaceId, workspaceLoading])

  const rows = useMemo(() => {
    const grouped = new Map<string, SalesRow>()
    for (const invoice of invoices) {
      if (invoice.status !== "verified") continue
      const key = salespersonKey(invoice)
      const row = grouped.get(key) || {
        key,
        name: invoice.normalized?.handlerName?.trim() || "Unassigned",
        invoices: [],
        totalValue: 0,
        paidCount: 0,
        paidValue: 0,
        unpaidCount: 0,
        unpaidValue: 0,
        overdueCount: 0,
        overdueValue: 0,
      }
      const amount = invoice.normalized?.total?.amount || 0
      const payment = invoicePaymentState(invoice)
      row.invoices.push(invoice)
      row.totalValue += amount
      if (payment === "paid") { row.paidCount++; row.paidValue += amount }
      else if (payment === "overdue") { row.overdueCount++; row.overdueValue += amount }
      else { row.unpaidCount++; row.unpaidValue += amount }
      grouped.set(key, row)
    }
    return Array.from(grouped.values()).sort((a, b) => b.totalValue - a.totalValue)
  }, [invoices])

  const activeRow = rows.find((row) => row.key === selectedKey) || rows[0] || null
  const totals = useMemo(() => rows.reduce((total, row) => ({
    invoices: total.invoices + row.invoices.length,
    paid: total.paid + row.paidCount,
    overdue: total.overdue + row.overdueCount,
    value: total.value + row.totalValue,
  }), { invoices: 0, paid: 0, overdue: 0, value: 0 }), [rows])

  function exportReport() {
    const report = [
      ["Sales person", "Customer", "Invoice", "Invoice date", "Due date", "Amount", "Payment"],
      ...rows.flatMap((row) => row.invoices.map((invoice) => [
        row.name,
        invoice.normalized?.customerName || invoice.normalized?.vendorName || "Unknown customer",
        invoice.normalized?.invoiceNumber || invoice.source?.originalName || invoice.id,
        invoice.normalized?.invoiceDate || "",
        invoice.normalized?.dueDate || "",
        invoice.normalized?.total?.amount || 0,
        paymentLabels[invoicePaymentState(invoice)],
      ])),
    ]
    const blob = new Blob([report.map((line) => line.map(csvCell).join(",")).join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "sales-performance.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return <FinancePageShell
    title="Sales Performance"
    description="A clean view of every sales person's paid, unpaid, and overdue invoices."
    action={<button onClick={exportReport} disabled={!rows.length} className="flex h-11 items-center gap-2 rounded-xl border border-[#292929] px-4 text-xs text-[#888] disabled:opacity-40"><Download className="h-4 w-4"/>Export</button>}
  >
    {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Sales people" value={`${rows.length}`} detail="Tagged on approved invoices"/>
      <StatCard label="Approved invoices" value={`${totals.invoices}`} detail={formatMoney(totals.value)}/>
      <StatCard label="Done / paid" value={`${totals.paid}`} detail="Payment confirmed" color="text-[#3f9d60]"/>
      <StatCard label="Overdue" value={`${totals.overdue}`} detail="Needs follow-up" color="text-red-500"/>
    </div>

    <section className="rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-4 md:p-5">
      <div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#86efac]/10 text-[#3f9d60]"><Users className="h-4 w-4"/></span><div><h2 className="text-sm font-semibold">Team overview</h2><p className="mt-0.5 text-[11px] text-[#666]">Select a sales person to view their invoices below.</p></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const active = activeRow?.key === row.key
          const collection = row.totalValue ? row.paidValue / row.totalValue * 100 : 0
          return <button key={row.key} type="button" onClick={() => setSelectedKey(row.key)} className={`rounded-2xl border p-4 text-left transition ${active ? "border-[#86efac]/50 bg-[#86efac]/[0.06]" : "border-[#242424] bg-[#111] hover:border-[#3a3a3a]"}`}>
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#86efac] text-xs font-bold text-black">{initials(row.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.name}</p><p className="mt-0.5 text-[10px] text-[#666]">{row.invoices.length} invoice{row.invoices.length === 1 ? "" : "s"} · {formatMoney(row.totalValue)}</p></div><span className="text-[11px] font-semibold text-[#3f9d60]">{collection.toFixed(0)}%</span></div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-[#252525] rounded-xl border border-[#242424] bg-[#0d0d0d] py-2.5">
              <div className="px-2 text-center"><p className="text-base font-semibold text-[#3f9d60]">{row.paidCount}</p><p className="text-[9px] uppercase tracking-wide text-[#666]">Paid</p></div>
              <div className="px-2 text-center"><p className="text-base font-semibold text-sky-500">{row.unpaidCount}</p><p className="text-[9px] uppercase tracking-wide text-[#666]">Unpaid</p></div>
              <div className="px-2 text-center"><p className="text-base font-semibold text-red-500">{row.overdueCount}</p><p className="text-[9px] uppercase tracking-wide text-[#666]">Overdue</p></div>
            </div>
          </button>
        })}
        {!loading && !rows.length ? <div className="rounded-2xl border border-dashed border-[#292929] p-8 text-center text-xs text-[#666] md:col-span-2 xl:col-span-3">No sales performance yet. Approve an invoice and tag its sales person during review.</div> : null}
        {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#292929] p-8 text-xs text-[#666] md:col-span-2 xl:col-span-3"><Loader className="h-4 w-4 animate-spin"/>Loading team performance…</div> : null}
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0d0d0d]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202020] p-5"><div><h2 className="text-sm font-semibold">{activeRow ? `${activeRow.name}'s invoices` : "Sales person invoices"}</h2><p className="mt-1 text-[11px] text-[#666]">Approved invoices and their current payment position.</p></div>{activeRow ? <div className="flex gap-2"><StatusPill label="Paid" count={activeRow.paidCount} tone="green"/><StatusPill label="Unpaid" count={activeRow.unpaidCount} tone="blue"/><StatusPill label="Overdue" count={activeRow.overdueCount} tone="red"/></div> : null}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px]">
        <thead><tr className="text-left text-[10px] uppercase tracking-widest text-[#555]"><th className="px-5 py-3">Customer</th><th>Invoice</th><th>Issued</th><th>Due</th><th className="text-right">Amount</th><th className="px-5 text-right">Payment</th></tr></thead>
        <tbody>{activeRow?.invoices.map((invoice) => {
          const payment = invoicePaymentState(invoice)
          return <tr key={invoice.id} className="border-t border-[#1b1b1b] text-xs"><td className="px-5 py-4 font-medium text-[#ccc]">{invoice.normalized?.customerName || invoice.normalized?.vendorName || "Unknown customer"}</td><td className="font-mono text-[#777]">{invoice.normalized?.invoiceNumber || invoice.source?.originalName || "—"}</td><td className="text-[#777]">{invoice.normalized?.invoiceDate || "—"}</td><td className="text-[#777]">{invoice.normalized?.dueDate || "—"}</td><td className="text-right font-medium">{formatMoney(invoice.normalized?.total?.amount || 0)}</td><td className="px-5 text-right"><span className={`rounded-full border px-2.5 py-1 text-[10px] ${paymentTones[payment]}`}>{paymentLabels[payment]}</span></td></tr>
        })}</tbody>
      </table>{!activeRow && !loading ? <div className="p-10 text-center text-xs text-[#666]">Select a sales person to inspect their invoices.</div> : null}</div>
    </section>
  </FinancePageShell>
}

function StatusPill({ label, count, tone }: { label: string; count: number; tone: "green" | "blue" | "red" }) {
  const style = tone === "green" ? "border-[#86efac]/20 bg-[#86efac]/10 text-[#3f9d60]" : tone === "blue" ? "border-sky-400/20 bg-sky-400/10 text-sky-600" : "border-red-400/20 bg-red-400/10 text-red-600"
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] ${style}`}>{label} {count}</span>
}
