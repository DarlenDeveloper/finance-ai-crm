"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, onSnapshot, orderBy, query } from "firebase/firestore"
import { Icon as SaxIcon, type IconName } from "@/components/icon"
const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <SaxIcon name={name} className={className} variant={variant} />
}
const MessageSquare = mk("Sms", "Bold")
const MessageCircle = mk("Whatsapp", "Bold")
const Send = mk("Send2", "Bold")
const Check = mk("TickCircle", "Bold")
const Clock3 = mk("Clock")
const Mail = mk("MessageText1", "Bold")
const Filter = mk("Filter")
import { FinancePageShell, StatCard } from "@/components/finance-page-shell"
import { useWorkspace } from "@/components/workspace-provider"
import { firebaseDb } from "@/lib/firebase"
import { formatMoney } from "@/lib/demo-store"

type Channel = "email" | "sms" | "whatsapp"
type Status = "uploading" | "uploaded" | "processing" | "needs_review" | "verified" | "rejected" | "failed"
type Money = { amount?: number | null; currency?: string | null }
type Invoice = {
  id: string
  status: Status
  source?: { originalName?: string }
  normalized?: { vendorName?: string | null; invoiceNumber?: string | null; dueDate?: string | null; total?: Money }
}

type FollowUp = {
  id: string
  vendor: string
  invoiceNumber: string
  channel: Channel
  reason: string
  message: string
  priority: "high" | "medium" | "low"
  amount?: number | null
}

const channelMeta: Record<Channel, { label: string; icon: typeof MessageSquare; tone: string }> = {
  email: { label: "Email", icon: Mail, tone: "text-sky-300 bg-sky-400/10 border-sky-400/20" },
  sms: { label: "SMS", icon: MessageSquare, tone: "text-amber-300 bg-amber-400/10 border-amber-400/20" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, tone: "text-[#86efac] bg-[#86efac]/10 border-[#86efac]/20" },
}

const priorityTone: Record<string, string> = {
  high: "text-red-300 bg-red-400/10",
  medium: "text-amber-300 bg-amber-400/10",
  low: "text-[#888] bg-white/[0.04]",
}

const today = () => new Date().toISOString().slice(0, 10)

// Derive follow-ups from real invoices: overdue -> payment reminder,
// needs_review -> acknowledgement, missing vendor/number -> data request.
function buildFollowUps(invoices: Invoice[]): FollowUp[] {
  const list: FollowUp[] = []
  for (const inv of invoices) {
    const vendor = inv.normalized?.vendorName || inv.source?.originalName || "Unknown vendor"
    const number = inv.normalized?.invoiceNumber || inv.id.slice(0, 8)
    const amount = inv.normalized?.total?.amount ?? null
    const due = inv.normalized?.dueDate
    const overdue = due && !["verified", "rejected"].includes(inv.status) && due < today()

    if (overdue) {
      list.push({
        id: `${inv.id}-reminder`, vendor, invoiceNumber: number, channel: "whatsapp", priority: "high", amount,
        reason: "Payment overdue",
        message: `Hi, invoice ${number}${amount != null ? ` for ${formatMoney(amount)}` : ""} is past its due date. Could you confirm the payment status?`,
      })
    } else if (inv.status === "needs_review") {
      list.push({
        id: `${inv.id}-ack`, vendor, invoiceNumber: number, channel: "email", priority: "low", amount,
        reason: "Invoice received",
        message: `Thanks for sending invoice ${number}. Our finance team is reviewing it and will confirm once approved.`,
      })
    }

    if (!inv.normalized?.vendorName || !inv.normalized?.invoiceNumber) {
      if (["needs_review", "verified"].includes(inv.status)) {
        list.push({
          id: `${inv.id}-data`, vendor, invoiceNumber: number, channel: "sms", priority: "medium", amount,
          reason: "Missing details",
          message: `While processing ${number}, some required details were missing. Please share an updated copy when convenient.`,
        })
      }
    }
  }
  return list
}

export default function FollowUps() {
  const { workspaceId, loading: workspaceLoading } = useWorkspace()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [sent, setSent] = useState<string[]>([])
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all")

  useEffect(() => {
    if (!workspaceId || !firebaseDb) { if (!workspaceLoading) setLoading(false); return }
    return onSnapshot(query(collection(firebaseDb, `workspaces/${workspaceId}/invoices`), orderBy("createdAt", "desc")), (snapshot) => {
      setInvoices(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Invoice)))
      setLoading(false)
    }, () => setLoading(false))
  }, [workspaceId, workspaceLoading])

  const followUps = useMemo(() => buildFollowUps(invoices), [invoices])
  const visible = useMemo(() => followUps.filter((f) => channelFilter === "all" || f.channel === channelFilter), [followUps, channelFilter])

  const counts = useMemo(() => ({
    email: followUps.filter((f) => f.channel === "email").length,
    sms: followUps.filter((f) => f.channel === "sms").length,
    whatsapp: followUps.filter((f) => f.channel === "whatsapp").length,
  }), [followUps])

  return <FinancePageShell title="Follow-ups" description="Multi-channel vendor outreach across email, SMS, and WhatsApp — drafted from your invoices.">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Ready to send" value={`${followUps.length - sent.length}`} detail="Across all channels" color="text-[#86efac]" />
      <StatCard label="Email" value={`${counts.email}`} detail="Acknowledgements & notices" />
      <StatCard label="SMS" value={`${counts.sms}`} detail="Data requests" />
      <StatCard label="WhatsApp" value={`${counts.whatsapp}`} detail="Payment reminders" />
    </div>

    <div className="overflow-hidden rounded-2xl border border-white/[0.04] bg-[#0d0d0d]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1c1c1c] p-4">
        <Filter className="h-4 w-4 text-[#666]" />
        {(["all", "email", "sms", "whatsapp"] as const).map((c) => (
          <button key={c} onClick={() => setChannelFilter(c)} className={`rounded-lg px-3 py-1.5 text-[11px] capitalize transition ${channelFilter === c ? "bg-[#86efac] text-black font-semibold" : "border border-[#292929] text-[#888] hover:text-white"}`}>
            {c === "all" ? "All channels" : channelMeta[c].label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[#666]">{visible.length} follow-up{visible.length === 1 ? "" : "s"}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-[#555]">
              <th className="px-5 py-3">Vendor / Invoice</th>
              <th className="py-3">Channel</th>
              <th className="py-3">Reason</th>
              <th className="py-3">Message</th>
              <th className="py-3">Priority</th>
              <th className="py-3 text-right pr-5">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => {
              const meta = channelMeta[f.channel]
              const Icon = meta.icon
              const isSent = sent.includes(f.id)
              return (
                <tr key={f.id} className="border-t border-[#181818] align-top text-sm hover:bg-[#111]">
                  <td className="px-5 py-4"><p className="font-medium text-[#ddd]">{f.vendor}</p><p className="mt-1 font-mono text-[10px] text-[#666]">{f.invoiceNumber}{f.amount != null ? ` · ${formatMoney(f.amount)}` : ""}</p></td>
                  <td className="py-4"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${meta.tone}`}><Icon className="h-4 w-4" />{meta.label}</span></td>
                  <td className="py-4 text-xs text-[#aaa]">{f.reason}</td>
                  <td className="py-4 max-w-[340px]"><p className="line-clamp-2 text-[11px] leading-5 text-[#888]">{f.message}</p></td>
                  <td className="py-4"><span className={`rounded-full px-2 py-1 text-[10px] capitalize ${priorityTone[f.priority]}`}>{f.priority}</span></td>
                  <td className="py-4 pr-5 text-right">
                    {isSent
                      ? <span className="inline-flex items-center gap-1.5 text-[11px] text-[#86efac]"><Check className="h-4 w-4" />Sent</span>
                      : <button onClick={() => setSent((s) => [...s, f.id])} className="inline-flex items-center gap-1.5 rounded-lg bg-[#86efac] px-3 py-2 text-[10px] font-semibold text-black hover:bg-[#a7f3c0]"><Send className="h-4 w-4" />Send</button>}
                  </td>
                </tr>
              )
            })}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-xs text-[#666]">{followUps.length === 0 ? "No follow-ups needed. Upload and process invoices to generate outreach." : "No follow-ups on this channel."}</td></tr>
            )}
            {loading && <tr><td colSpan={6} className="px-5 py-12 text-center text-xs text-[#666]"><Clock3 className="mx-auto mb-2 h-4 w-4 animate-pulse text-[#86efac]" />Loading follow-ups…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </FinancePageShell>
}
