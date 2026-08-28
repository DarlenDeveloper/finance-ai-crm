"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { Icon } from "@/components/icon"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isLight = resolvedTheme === "light"
  return (
    <button
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className="grid h-10 w-10 place-items-center rounded-xl border border-[#242424] bg-[#101010] text-[#999] transition hover:text-white"
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
    >
      {mounted && isLight ? <Icon name="Moon" size={16} variant="Bold" /> : <Icon name="Sun1" size={16} variant="Bold" />}
    </button>
  )
}

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
          <Icon name="SearchNormal1" size={16} />
          Search invoices
          <span className="ml-4 rounded border border-[#303030] px-1.5 py-0.5 text-[9px]">⌘ K</span>
        </Link>
        <ThemeToggle />
        <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#242424] bg-[#101010] text-[#999] transition hover:text-white">
          <Icon name="Notification" size={16} />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#86efac]" />
        </button>
        {configured && user && <button onClick={logout} title={`Sign out ${user.email || ""}`} className="grid h-10 w-10 place-items-center rounded-xl border border-[#242424] bg-[#101010] text-[#999] transition hover:text-white" aria-label="Sign out"><Icon name="Logout" size={16} /></button>}
        <Link href="/review" className="hidden h-10 items-center gap-2 rounded-xl bg-[#86efac] px-4 text-xs font-semibold text-black transition hover:bg-[#a7f3c0] md:flex">
          <Icon name="MagicStar" size={16} variant="Bold" /> Ask Ledger AI
        </Link>
      </div>
    </header>
  )
}
