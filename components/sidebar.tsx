"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon, type IconName } from "@/components/icon"
import { MercuryLogo } from "@/components/mercury-logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"
import { PAGE_DEFINITIONS, displayRole, firstAccessiblePage, type PageId } from "@/lib/rbac"

const pageIcons: Record<PageId, IconName> = {
  overview: "Category",
  invoices: "DocumentText",
  review: "Scan",
  analytics: "Chart2",
  "sales-performance": "Profile2User",
  "follow-ups": "Send2",
  contacts: "MessageText1",
  integrations: "Data2",
  settings: "Setting2",
  "access-management": "ShieldTick",
  "system-logs": "DocumentText",
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
  const { workspaceName, member, canAccessPage } = useWorkspace()
  const displayName = user?.displayName?.trim() || nameFromEmail(user?.email)
  const email = user?.email || "No email address"
  const roleLabel = displayRole(member?.role ?? null)
  const homeHref = firstAccessiblePage(member)?.href || "/"
  const primary = PAGE_DEFINITIONS.filter((page) => page.navigation === "primary" && page.href && canAccessPage(page.id))
  const secondary = PAGE_DEFINITIONS.filter((page) => page.navigation === "secondary" && page.href && canAccessPage(page.id))

  return (
    <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-64 shrink-0 flex-col overflow-y-auto rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5 md:flex">
      <div className="mb-6 px-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#5F5F5F]">Organisation</p>
        <Link href={homeHref} className="mt-3 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white p-1 shadow-sm"><MercuryLogo variant="mark" className="h-8 w-8" /></div>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-white" title={workspaceName}>{workspaceName}</p><p className="truncate text-xs text-[#6F6F6F]">{roleLabel}</p></div>
        </Link>
      </div>

      <nav className="flex flex-col gap-1.5">
        {primary.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)
          return <Link key={item.id} href={item.href!} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-[#1A1A1A] text-white" : "text-[#777] hover:bg-[#141414] hover:text-[#DDD]"}`}>
            <Icon name={pageIcons[item.id]} size={18} variant={active ? "Bold" : "Linear"} className={active ? "text-[#86efac]" : ""} />
            <span className="text-xs font-medium uppercase tracking-[0.08em]">{item.label}</span>
          </Link>
        })}
      </nav>

      <div className="mt-auto border-t border-[#202020] pt-4">
        {secondary.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return <Link key={item.id} href={item.href!} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 transition ${active ? "bg-[#1A1A1A] text-white" : "text-[#777] hover:bg-[#141414] hover:text-white"}`}>
            <Icon name={pageIcons[item.id]} size={18} variant={active ? "Bold" : "Linear"} className={active ? "text-[#86efac]" : ""}/>
            <span className="text-xs font-medium uppercase tracking-[0.08em]">{item.label}</span>
          </Link>
        })}
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#121212] p-3">
          <Avatar className="h-9 w-9">{user?.photoURL ? <AvatarImage src={user.photoURL} alt={displayName} referrerPolicy="no-referrer"/> : null}<AvatarFallback className="bg-gradient-to-br from-orange-400 to-pink-500 text-[10px] font-bold text-white">{initials(displayName)}</AvatarFallback></Avatar>
          <div className="min-w-0"><p className="truncate text-xs font-medium text-white" title={displayName}>{displayName}</p><p className="truncate text-[10px] text-[#777]" title={email}>{email}</p><p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-[#86efac]/70">{roleLabel}</p></div>
        </div>
      </div>
    </aside>
  )
}
