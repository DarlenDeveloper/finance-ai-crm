"use client"

import { useState } from "react"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react"
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"

type Integration = {
  id: string
  name: string
  short: string
  category: string
  description: string
  color: string
  textColor?: string
  connected?: boolean
  account?: string
  sync?: string
  features: string[]
}

const integrations: Integration[] = [
  {
    id: "gmail",
    name: "Gmail",
    short: "M",
    category: "Email",
    description: "Automatically find invoice attachments and send approved vendor follow-ups.",
    color: "bg-white",
    textColor: "text-[#EA4335]",
    connected: true,
    account: "invoices@financecontrol.com",
    sync: "Synced 4 min ago",
    features: ["Import attachments", "Send follow-ups"],
  },
  {
    id: "zoho",
    name: "Zoho Books",
    short: "Z",
    category: "Accounting",
    description: "Push verified invoices, vendors, tax codes, and payment status into Zoho Books.",
    color: "bg-gradient-to-br from-[#ef4444] via-[#facc15] to-[#3b82f6]",
    textColor: "text-white",
    features: ["Two-way sync", "Vendor matching"],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    short: "qb",
    category: "Accounting",
    description: "Create bills from approved scans and reconcile payments with QuickBooks Online.",
    color: "bg-[#2CA01C]",
    textColor: "text-white",
    features: ["Create bills", "Payment reconciliation"],
  },
  {
    id: "microsoft",
    name: "Microsoft 365",
    short: "M",
    category: "Productivity",
    description: "Collect invoices from Outlook and store source documents securely in OneDrive.",
    color: "bg-[#F25022]",
    textColor: "text-white",
    features: ["Outlook inbox", "OneDrive archive"],
  },
]

export default function IntegrationsPage() {
  const [connected, setConnected] = useState<string[]>(["gmail"])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  function connect(id: string) {
    setConnecting(id)
    window.setTimeout(() => {
      setConnected((current) => [...current, id])
      setConnecting(null)
    }, 900)
  }

  function disconnect(id: string) {
    setConnected((current) => current.filter((item) => item !== id))
  }

  const visible = integrations.filter((item) =>
    `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <FinancePageShell
      title="Integrations"
      description="Connect the tools your finance team already uses."
      action={
        <button className="flex h-11 items-center gap-2 rounded-xl border border-[#292929] bg-[#101010] px-4 text-xs text-[#aaa] hover:text-white">
          Integration docs <ExternalLink className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Connected apps" value={`${connected.length}`} detail="Across this workspace" color="text-[#86efac]" />
        <StatCard label="Documents imported" value="186" detail="During the last 30 days" />
        <StatCard label="Records synced" value="241" detail="99.2% successful" />
        <StatCard label="Hours saved" value="31.5" detail="Estimated this month" color="text-[#86efac]" />
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[#86efac]/10 bg-[#0D0D0D] p-5 md:p-6">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#86efac]/[0.05] blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><Sparkles className="h-5 w-5" /></span>
            <div>
              <div className="flex items-center gap-2"><h2 className="text-base font-medium">Automate invoice intake</h2><span className="rounded-full bg-[#86efac]/10 px-2 py-1 text-[9px] uppercase tracking-widest text-[#86efac]">Recommended</span></div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-[#777]">Connect an inbox and CRM will detect invoice attachments, extract the data, check for duplicates, then prepare verified records for your accounting platform.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[10px] text-[#777]"><Mail className="h-4 w-4" /><ArrowRight className="h-3.5 w-3.5" /><Sparkles className="h-4 w-4 text-[#86efac]" /><ArrowRight className="h-3.5 w-3.5" /><CheckCircle2 className="h-4 w-4" /></div>
        </div>
      </div>

      <section className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D]">
        <div className="flex flex-col gap-4 border-b border-[#1C1C1C] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-base font-medium">Available integrations</h2><p className="mt-1 text-xs text-[#666]">Connect once, then choose exactly what CRM can access.</p></div>
          <div className="flex h-10 items-center gap-2 rounded-xl border border-[#252525] bg-[#111] px-3 sm:w-64"><Search className="h-4 w-4 text-[#555]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search integrations" className="w-full bg-transparent text-xs outline-none placeholder:text-[#555]" /></div>
        </div>

        <div className="grid gap-px bg-[#1C1C1C] md:grid-cols-2">
          {visible.map((item) => {
            const isConnected = connected.includes(item.id)
            const isConnecting = connecting === item.id
            return (
              <div key={item.id} className="bg-[#0D0D0D] p-5 transition hover:bg-[#101010] md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-11 w-11 place-items-center rounded-xl text-base font-bold shadow-lg ${item.color} ${item.textColor}`}>{item.short}</span>
                    <div><div className="flex items-center gap-2"><h3 className="text-sm font-medium text-[#E5E5E5]">{item.name}</h3>{isConnected && <CheckCircle2 className="h-3.5 w-3.5 text-[#86efac]" />}</div><p className="mt-1 text-[10px] uppercase tracking-widest text-[#555]">{item.category}</p></div>
                  </div>
                  {isConnected ? <button className="rounded-lg border border-[#292929] p-2 text-[#666] hover:text-white"><MoreHorizontal className="h-4 w-4" /></button> : null}
                </div>

                <p className="mt-5 min-h-10 text-xs leading-5 text-[#777]">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">{item.features.map((feature) => <span key={feature} className="flex items-center gap-1.5 rounded-full bg-[#171717] px-2.5 py-1.5 text-[9px] text-[#777]"><Check className="h-3 w-3 text-[#86efac]" />{feature}</span>)}</div>

                {isConnected ? (
                  <div className="mt-5 rounded-xl border border-[#86efac]/10 bg-[#86efac]/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-medium text-[#CFCFCF]">{item.account || `Finance Control · ${item.name}`}</p><p className="mt-1 flex items-center gap-1.5 text-[9px] text-[#666]"><RefreshCw className="h-3 w-3" />{item.sync || "Initial sync ready"}</p></div><button onClick={() => disconnect(item.id)} className="flex items-center gap-1.5 text-[9px] text-[#666] hover:text-red-300"><Unplug className="h-3 w-3" />Disconnect</button></div>
                  </div>
                ) : (
                  <button onClick={() => connect(item.id)} disabled={isConnecting} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#2A2A2A] bg-[#151515] text-xs font-medium text-[#CCC] transition hover:border-[#86efac]/30 hover:text-white disabled:opacity-60">
                    {isConnecting ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Connecting…</> : <><Plug className="h-3.5 w-3.5" />Connect {item.name}</>}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex items-start gap-4 rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><ShieldCheck className="h-4 w-4" /></span><div><h3 className="text-sm font-medium">Your data stays controlled</h3><p className="mt-2 text-xs leading-5 text-[#666]">Connections use scoped permissions. CRM only accesses the folders, inboxes, and accounting records you approve.</p><button className="mt-3 text-[10px] text-[#86efac]">Review data permissions →</button></div></div>
        <div className="flex items-start gap-4 rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#171717] text-[#999]"><Plug className="h-4 w-4" /></span><div><h3 className="text-sm font-medium">Need another integration?</h3><p className="mt-2 text-xs leading-5 text-[#666]">Tell us which finance tool your team relies on and we&apos;ll add it to the integration roadmap.</p><button className="mt-3 text-[10px] text-[#AAA]">Request an integration →</button></div></div>
      </div>
    </FinancePageShell>
  )
}
