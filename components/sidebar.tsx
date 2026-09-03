"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon, type IconName } from "@/components/icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace, type WorkspaceRole } from "@/components/workspace-provider"

const primary: { label: string; icon: IconName; href: string }[] = [
  { label: "OVERVIEW", icon: "Category", href: "/" },
  { label: "INVOICES", icon: "DocumentText", href: "/invoices" },
  { label: "AI REVIEW", icon: "Scan", href: "/review" },
  { label: "ANALYTICS", icon: "Chart2", href: "/analytics" },
  { label: "SALES PERFORMANCE", icon: "Profile2User", href: "/sales-performance" },
  { label: "FOLLOW-UPS", icon: "Send2", href: "/follow-ups" },
  { label: "CONTACTS", icon: "MessageText1", href: "/contacts" },
  { label: "INTEGRATIONS", icon: "Data2", href: "/integrations" },
]

const roleLabels: Record<WorkspaceRole, string> = {
  admin: "Workspace admin",
  reviewer: "Invoice reviewer",
  viewer: "Workspace viewer",
}

function nameFromEmail(email?: string | null) {
  const local = email?.split("@")[0]?.trim()
  if (!local) return "Signed-in user"
  return local.split(/[._-]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ")
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase()
}

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { workspaceName, role } = useWorkspace()
  const displayName = user?.displayName?.trim() || nameFromEmail(user?.email)
  const email = user?.email || "No email address"
  const roleLabel = role ? roleLabels[role] : "Workspace member"
  const currentWorkspaceName = workspaceName || "Finance workspace"
  return (
    <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-64 shrink-0 flex-col overflow-y-auto rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5 md:flex">
      <div className="mb-6 px-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#5F5F5F]">Workspace</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#86efac] text-sm font-bold text-black">{initials(currentWorkspaceName)}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white" title={currentWorkspaceName}>{currentWorkspaceName}</p>
            <p className="truncate text-xs text-[#6F6F6F]">{roleLabel}</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5">
        {primary.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                active ? "bg-[#1A1A1A] text-white" : "text-[#777] hover:bg-[#141414] hover:text-[#DDD]"
              }`}
            >
              <Icon name={item.icon} size={18} variant={active ? "Bold" : "Linear"} className={active ? "text-[#86efac]" : ""} />
              <span className="text-xs font-medium tracking-[0.08em]">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-[#202020] pt-4">
        <Link href="/settings" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[#777] transition hover:bg-[#141414] hover:text-white">
          <Icon name="Lifebuoy" size={18} />
          <span className="text-xs font-medium tracking-[0.08em]">HELP CENTER</span>
        </Link>
        <Link href="/settings" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[#777] transition hover:bg-[#141414] hover:text-white">
          <Icon name="Setting2" size={18} />
          <span className="text-xs font-medium tracking-[0.08em]">SETTINGS</span>
        </Link>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#121212] p-3">
          <Avatar className="h-9 w-9">
            {user?.photoURL ? <AvatarImage src={user.photoURL} alt={displayName} referrerPolicy="no-referrer"/> : null}
            <AvatarFallback className="bg-gradient-to-br from-orange-400 to-pink-500 text-[10px] font-bold text-white">{initials(displayName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white" title={displayName}>{displayName}</p>
            <p className="truncate text-[10px] text-[#777]" title={email}>{email}</p>
            <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-[#86efac]/70">{roleLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
