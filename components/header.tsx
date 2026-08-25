"use client"

import { Bell, LogOut, Search, Sparkles } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"

export function Header() {
  const { user, configured, logout } = useAuth()
  return (
    <header className="absolute inset-x-0 top-0 z-50 flex h-20 items-center justify-between border-b border-white/[0.04] bg-black/70 px-6 backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold tracking-[-0.05em] text-white">CRM</span>
        <div className="h-5 w-px bg-[#292929]" />
        <span className="rounded-md bg-[#142319] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#86efac]">Ledger AI</span>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/invoices" className="hidden h-10 items-center gap-2 rounded-xl border border-[#242424] bg-[#101010] px-3 text-xs text-[#777] transition hover:border-[#333] hover:text-white sm:flex">
          <Search className="h-4 w-4" />
          Search invoices
          <span className="ml-4 rounded border border-[#303030] px-1.5 py-0.5 text-[9px]">⌘ K</span>
        </Link>
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#242424] bg-[#101010] text-[#999] transition hover:text-white">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#86efac]" />
        </button>
        {configured && user && <button onClick={logout} title={`Sign out ${user.email || ""}`} className="grid h-10 w-10 place-items-center rounded-xl border border-[#242424] bg-[#101010] text-[#999] transition hover:text-white" aria-label="Sign out"><LogOut className="h-4 w-4"/></button>}
        <Link href="/review" className="hidden h-10 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black transition hover:bg-[#a7f3c0] md:flex">
          <Sparkles className="h-4 w-4" /> Ask Ledger AI
        </Link>
      </div>
    </header>
  )
}
