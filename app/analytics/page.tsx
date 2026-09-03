"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Icon, type IconName } from "@/components/icon"
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"
import { formatMoney } from "@/lib/demo-store"
import { invoicePaymentState } from "@/lib/invoices/payment"

const mk = (name: IconName) => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className}/>
}
const Arrow = mk("ArrowRight")
const Loader = mk("Refresh")
const Users = mk("Profile2User")

type AnalyticsInvoice = {
  id: string
  status: string
  normalized?: {
    vendorName?: string | null
    customerName?: string | null
    dueDate?: string | null
    total?: { amount?: number | null; currency?: string | null }
  }
  payment?: { status?: "paid" | "unpaid" | null }
}

export default function Analytics() {
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoices, setInvoices] = useState<AnalyticsInvoice[]>([])
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
        setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as AnalyticsInvoice)))
        setError("")
        setLoading(false)
      },
      () => {
        setError("Could not load payment analytics.")
        setLoading(false)
      },
    )
  }, [workspaceId, workspaceLoading])

  const approved = useMemo(() => invoices.filter((invoice) => invoice.status === "verified"), [invoices])
  const summary = useMemo(() => {
    let paidCount = 0
    let unpaidCount = 0
    let overdueCount = 0
    let paidValue = 0
    let unpaidValue = 0
    let overdueValue = 0
    for (const invoice of approved) {
      const amount = invoice.normalized?.total?.amount || 0
      const state = invoicePaymentState(invoice)
      if (state === "paid") { paidCount++; paidValue += amount }
      else if (state === "overdue") { overdueCount++; overdueValue += amount }
      else { unpaidCount++; unpaidValue += amount }
    }
    const totalValue = paidValue + unpaidValue + overdueValue
    return {
      paidCount, unpaidCount, overdueCount, paidValue, unpaidValue, overdueValue, totalValue,
      outstandingCount: unpaidCount + overdueCount,
      outstandingValue: unpaidValue + overdueValue,
      collectionRate: totalValue ? paidValue / totalValue * 100 : 0,
    }
  }, [approved])

  const paymentMix = useMemo(() => [
    { name: "Paid", value: summary.paidValue, count: summary.paidCount, fill: "#86efac" },
    { name: "Unpaid", value: summary.unpaidValue, count: summary.unpaidCount, fill: "#63b3ed" },
    { name: "Overdue", value: summary.overdueValue, count: summary.overdueCount, fill: "#f87171" },
  ], [summary])

  const topCustomers = useMemo(() => {
    const totals = new Map<string, number>()
    for (const invoice of approved) {
      const customer = invoice.normalized?.customerName || invoice.normalized?.vendorName || "Unknown customer"
      totals.set(customer, (totals.get(customer) || 0) + (invoice.normalized?.total?.amount || 0))
    }
    return Array.from(totals, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [approved])

  return <FinancePageShell
    title="Analytics"
    description="A clean workspace-wide view of collections and outstanding invoices."
    action={<Link href="/sales-performance" className="flex h-11 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black"><Users className="h-4 w-4"/>Sales performance<Arrow className="h-3.5 w-3.5"/></Link>}
  >
    {error ? <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</div> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Approved value" value={formatMoney(summary.totalValue)} detail={`${approved.length} approved invoice${approved.length === 1 ? "" : "s"}`}/>
      <StatCard label="Collected" value={formatMoney(summary.paidValue)} detail={`${summary.paidCount} paid · ${summary.collectionRate.toFixed(1)}% collected`} color="text-[#3f9d60]"/>
      <StatCard label="Outstanding" value={formatMoney(summary.outstandingValue)} detail={`${summary.outstandingCount} unpaid invoice${summary.outstandingCount === 1 ? "" : "s"}`} color="text-sky-600"/>
      <StatCard label="Overdue" value={formatMoney(summary.overdueValue)} detail={`${summary.overdueCount} past due`} color="text-red-600"/>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-5">
        <div><h2 className="text-sm font-semibold">Payment position</h2><p className="mt-1 text-[11px] text-[#666]">Paid, unpaid, and overdue approved value.</p></div>
        <div className="mt-5 h-72">{approved.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={paymentMix}><CartesianGrid vertical={false} stroke="#202020"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#666", fontSize: 11 }}/><YAxis axisLine={false} tickLine={false} tick={{ fill: "#555", fontSize: 10 }}/><Tooltip contentStyle={{ background: "#151515", border: "1px solid #292929", borderRadius: 10, fontSize: 12 }} formatter={(value: number) => formatMoney(value)}/><Bar dataKey="value" name="Value" radius={[6, 6, 0, 0]}>{paymentMix.map((item) => <Cell key={item.name} fill={item.fill}/>)}</Bar></BarChart></ResponsiveContainer> : <EmptyState loading={loading}/>}</div>
        <div className="mt-3 grid grid-cols-3 gap-2">{paymentMix.map((item) => <div key={item.name} className="rounded-xl border border-[#242424] bg-[#111] p-3"><p className="text-[10px] text-[#666]">{item.name}</p><p className="mt-1 text-sm font-semibold">{item.count}</p></div>)}</div>
      </section>

      <section className="rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-5">
        <div><h2 className="text-sm font-semibold">Top customers</h2><p className="mt-1 text-[11px] text-[#666]">Approved customer-payable totals.</p></div>
        <div className="mt-5 h-72">{topCustomers.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={topCustomers} layout="vertical"><XAxis type="number" hide/><YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: "#777", fontSize: 10 }} width={120}/><Tooltip contentStyle={{ background: "#151515", border: "1px solid #292929", borderRadius: 10, fontSize: 12 }} formatter={(value: number) => formatMoney(value)}/><Bar dataKey="value" name="Invoiced" fill="#86efac" radius={[0, 5, 5, 0]} barSize={17}/></BarChart></ResponsiveContainer> : <EmptyState loading={loading}/>}</div>
      </section>
    </div>
  </FinancePageShell>
}

function EmptyState({ loading }: { loading: boolean }) {
  return <div className="grid h-full place-items-center rounded-xl border border-dashed border-[#292929] text-xs text-[#666]">{loading ? <span className="flex items-center gap-2"><Loader className="h-4 w-4 animate-spin"/>Loading analytics…</span> : "No approved invoice data yet."}</div>
}
