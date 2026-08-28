"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon, type IconName } from "@/components/icon"

const primary: { label: string; icon: IconName; href: string }[] = [
  { label: "OVERVIEW", icon: "Category", href: "/" },
  { label: "INVOICES", icon: "DocumentText", href: "/invoices" },
  { label: "AI REVIEW", icon: "Scan", href: "/review" },
  { label: "ANALYTICS", icon: "Chart2", href: "/analytics" },
  { label: "FOLLOW-UPS", icon: "Send2", href: "/follow-ups" },
  { label: "VENDORS", icon: "Profile2User", href: "/vendors" },
  { label: "INTEGRATIONS", icon: "Data2", href: "/integrations" },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-64 shrink-0 flex-col overflow-y-auto rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5 md:flex">
      <div className="mb-6 px-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#5F5F5F]">Workspace</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#86efac] text-sm font-bold text-black">FC</div>
          <div>
            <p className="text-sm font-medium text-white">Finance Control</p>
            <p className="text-xs text-[#6F6F6F]">Main workspace</p>
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
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-[10px] font-bold">AM</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">Alice Mugisha</p>
            <p className="truncate text-[10px] text-[#666]">Finance admin</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
