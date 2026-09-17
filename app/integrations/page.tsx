"use client"

import { useEffect, useMemo, useState } from "react"
import { Icon, type IconName } from "@/components/icon"
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"

const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant}/>
}
const Check = mk("TickCircle", "Bold")
const CheckCircle = mk("TickCircle", "Bold")
const ExternalLink = mk("ExportSquare")
const Mail = mk("MessageText1", "Bold")
const Plug = mk("Data2")
const Refresh = mk("Refresh")
const Search = mk("SearchNormal1")
const Shield = mk("ShieldTick", "Bold")
const Sms = mk("Sms", "Bold")
const X = mk("CloseCircle")

type GmailStatus = {
  configured: boolean
  connected: boolean
  account: { email: string | null; name: string | null; picture: string | null; connectedAt: string | null } | null
}

type CatalogIntegration = {
  id: string
  name: string
  short: string
  category: string
  description: string
  color: string
  textColor: string
  features: string[]
}

const catalog: CatalogIntegration[] = [
  { id: "kacybers", name: "Kacybers SMS", short: "K", category: "SMS", description: "Send approved payment reminders to customer phone numbers and track delivery status.", color: "bg-amber-400", textColor: "text-black", features: ["SMS reminders", "Delivery tracking"] },
  { id: "zoho", name: "Zoho Books", short: "Z", category: "Accounting", description: "Push verified invoices, customers, tax codes, and payment status into Zoho Books.", color: "bg-gradient-to-br from-[#ef4444] via-[#facc15] to-[#3b82f6]", textColor: "text-white", features: ["Two-way sync", "Customer matching"] },
  { id: "quickbooks", name: "QuickBooks", short: "qb", category: "Accounting", description: "Create bills from approved scans and reconcile payments with QuickBooks Online.", color: "bg-[#2CA01C]", textColor: "text-white", features: ["Create bills", "Payment reconciliation"] },
]

function apiMessage(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: { message?: unknown } }).error
    if (typeof error?.message === "string") return error.message
  }
  return fallback
}

export default function IntegrationsPage() {
  const { user } = useAuth()
  const { workspaceId, role } = useWorkspace()
  const [gmail, setGmail] = useState<GmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<"connect" | "disconnect" | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [queryText, setQueryText] = useState("")
  const canManage = role === "super_admin" || role === "admin"

  async function authorizationHeaders() {
    if (!user) throw new Error("Sign in again to manage integrations.")
    return { authorization: `Bearer ${await user.getIdToken()}` }
  }

  async function loadStatus() {
    if (!workspaceId || !user) return
    setLoading(true)
    try {
      const response = await fetch(`/api/integrations/gmail/status?workspaceId=${encodeURIComponent(workspaceId)}`, { headers: await authorizationHeaders(), cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(apiMessage(body, "Could not load Gmail status."))
      setGmail(body as GmailStatus)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Gmail status.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadStatus() }, [workspaceId, user])
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("gmail")
    if (result === "connected") setMessage("Gmail connected securely. Approved reminder emails can use this sender.")
    if (result === "denied") setError("Google connection was cancelled before permission was granted.")
    if (result === "error") setError("Gmail could not be connected. Check the OAuth configuration and try again.")
    if (result) window.history.replaceState({}, "", window.location.pathname)
  }, [])

  async function connectGmail() {
    if (!workspaceId) return
    setWorking("connect"); setMessage(""); setError("")
    try {
      const response = await fetch("/api/integrations/gmail/start", {
        method: "POST",
        headers: { ...(await authorizationHeaders()), "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      const body = await response.json()
      if (!response.ok || typeof body.authorizationUrl !== "string") throw new Error(apiMessage(body, "Could not start Gmail connection."))
      window.location.assign(body.authorizationUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Gmail connection.")
      setWorking(null)
    }
  }

  async function disconnectGmail() {
    if (!workspaceId || !window.confirm("Disconnect Gmail? Reminder emails will remain paused until another sender is connected.")) return
    setWorking("disconnect"); setMessage(""); setError("")
    try {
      const response = await fetch("/api/integrations/gmail/disconnect", {
        method: "POST",
        headers: { ...(await authorizationHeaders()), "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiMessage(body, "Could not disconnect Gmail."))
      setGmail((current) => current ? { ...current, connected: false, account: null } : current)
      setMessage(body.revoked ? "Gmail disconnected and Google access revoked." : "Gmail disconnected. You can also revoke access from your Google Account security settings.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect Gmail.")
    } finally {
      setWorking(null)
    }
  }

  const visibleCatalog = useMemo(() => catalog.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(queryText.toLowerCase())), [queryText])
  const connectedCount = gmail?.connected ? 1 : 0

  return <FinancePageShell title="Integrations" description="Connect secure delivery providers for approved customer reminders." action={<a href="https://support.google.com/accounts/answer/3466521" target="_blank" rel="noreferrer" className="flex h-11 items-center gap-2 rounded-xl border border-[#292929] px-4 text-xs text-[#888]">Manage Google access<ExternalLink className="h-3.5 w-3.5"/></a>}>
    {(message || error) ? <div className={`flex items-center rounded-xl border p-3 text-xs ${error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-[#86efac]/20 bg-[#86efac]/10 text-[#b8f7cc]"}`}><span>{error || message}</span><button onClick={() => { setMessage(""); setError("") }} className="ml-auto"><X className="h-4 w-4"/></button></div> : null}

    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Connected providers" value={`${connectedCount}`} detail="Available to reminder agents" color="text-[#86efac]"/>
      <StatCard label="Email delivery" value={gmail?.connected ? "Ready" : "Not connected"} detail={gmail?.account?.email || "Connect a Gmail sender"}/>
      <StatCard label="SMS delivery" value="Not connected" detail="Kacybers setup is next" color="text-amber-300"/>
    </div>

    <section className="overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0d0d0d]">
      <div className="flex flex-col gap-4 border-b border-[#202020] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-medium">Reminder delivery</h2><p className="mt-1 text-xs text-[#666]">Only approved follow-ups can use connected providers.</p></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#86efac]/20 bg-[#86efac]/10 px-3 py-1.5 text-[10px] text-[#86efac]"><Shield className="h-3.5 w-3.5"/>Scoped credentials</span></div>
      <div className="p-5 md:p-6">
        <div className="flex flex-col gap-5 rounded-2xl border border-[#242424] bg-[#111] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-xl font-bold text-[#EA4335]">M</span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Gmail</h3>{gmail?.connected ? <span className="inline-flex items-center gap-1 rounded-full bg-[#86efac]/10 px-2 py-1 text-[9px] text-[#86efac]"><CheckCircle className="h-3 w-3"/>Connected</span> : null}</div><p className="mt-2 max-w-xl text-xs leading-5 text-[#777]">Send approved invoice reminders using the connected Google account. CRM requests send-only access and cannot read the inbox.</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-[#1a1a1a] px-2.5 py-1.5 text-[9px] text-[#777]">Send email</span><span className="rounded-full bg-[#1a1a1a] px-2.5 py-1.5 text-[9px] text-[#777]">No inbox reading</span><span className="rounded-full bg-[#1a1a1a] px-2.5 py-1.5 text-[9px] text-[#777]">Admin controlled</span></div></div></div>
          <div className="min-w-[240px] lg:text-right">{loading ? <span className="inline-flex items-center gap-2 text-xs text-[#777]"><Refresh className="h-4 w-4 animate-spin"/>Checking connection…</span> : gmail?.connected ? <div><p className="text-xs font-medium">{gmail.account?.name || gmail.account?.email}</p><p className="mt-1 text-[10px] text-[#666]">{gmail.account?.email}</p><div className="mt-3 flex gap-2 lg:justify-end"><button disabled={!canManage || Boolean(working)} onClick={connectGmail} className="rounded-lg border border-[#333] px-3 py-2 text-[10px] text-[#aaa] disabled:opacity-40">Reconnect</button><button disabled={!canManage || Boolean(working)} onClick={disconnectGmail} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-2 text-[10px] text-red-300 disabled:opacity-40">{working === "disconnect" ? <Refresh className="h-3.5 w-3.5 animate-spin"/> : <X className="h-3.5 w-3.5"/>}Disconnect</button></div></div> : <div><button disabled={!canManage || !gmail?.configured || Boolean(working)} onClick={connectGmail} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black disabled:opacity-40">{working === "connect" ? <Refresh className="h-4 w-4 animate-spin"/> : <Mail className="h-4 w-4"/>}{working === "connect" ? "Opening Google…" : "Connect Gmail"}</button><p className="mt-2 text-[9px] text-[#666]">{!canManage ? "Only a workspace admin can connect Gmail." : !gmail?.configured ? "Server OAuth secrets are not configured yet." : "You will be redirected to Google."}</p></div>}</div>
        </div>
      </div>
    </section>

    <section className="rounded-2xl border border-white/[0.05] bg-[#0d0d0d]">
      <div className="flex flex-col gap-4 border-b border-[#202020] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-medium">Available next</h2><p className="mt-1 text-xs text-[#666]">Additional providers remain disabled until their secure backend is configured.</p></div><div className="flex h-10 items-center gap-2 rounded-xl border border-[#252525] bg-[#111] px-3 sm:w-64"><Search className="h-4 w-4 text-[#555]"/><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search integrations" className="w-full bg-transparent text-xs outline-none"/></div></div>
      <div className="grid gap-px bg-[#202020] md:grid-cols-2">{visibleCatalog.map((item) => <article key={item.id} className="bg-[#0d0d0d] p-5 md:p-6"><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl font-bold ${item.color} ${item.textColor}`}>{item.short}</span><div><h3 className="text-sm font-medium">{item.name}</h3><p className="mt-1 text-[9px] uppercase tracking-widest text-[#555]">{item.category}</p></div></div><p className="mt-4 min-h-10 text-xs leading-5 text-[#777]">{item.description}</p><div className="mt-3 flex flex-wrap gap-2">{item.features.map((feature) => <span key={feature} className="inline-flex items-center gap-1 rounded-full bg-[#171717] px-2.5 py-1.5 text-[9px] text-[#777]"><Check className="h-3 w-3 text-[#86efac]"/>{feature}</span>)}</div><button disabled className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#292929] text-xs text-[#666] opacity-60"><Plug className="h-4 w-4"/>Coming soon</button></article>)}</div>
    </section>

    <div className="flex items-start gap-4 rounded-2xl border border-white/[0.05] bg-[#0d0d0d] p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><Sms className="h-4 w-4"/></span><div><h3 className="text-sm font-medium">Next: Kacybers SMS</h3><p className="mt-2 text-xs leading-5 text-[#666]">Once you provide the Kacybers API documentation, we can add secure SMS credentials, sender ID configuration, delivery receipts, and the same approval controls used for Gmail.</p></div></div>
  </FinancePageShell>
}
