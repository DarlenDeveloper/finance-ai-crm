"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useWorkspace } from "@/components/workspace-provider"
import { firstAccessiblePage, pageForPathname } from "@/lib/rbac"

const PUBLIC_PATHS = new Set(["/login", "/awaiting-approval"])

function LoadingAccess() {
  return <div className="grid min-h-screen place-items-center bg-black text-xs text-[#777]">Checking organisation access…</div>
}

function NoPageAccess() {
  return <main className="grid min-h-screen place-items-center bg-black px-5 text-white"><div className="max-w-md rounded-2xl border border-white/[0.06] bg-[#0d0d0d] p-8 text-center"><h1 className="text-xl font-medium">No pages assigned</h1><p className="mt-3 text-sm leading-6 text-[#777]">Your account is active, but no CRM pages have been assigned yet. Ask the super admin to update your access.</p></div></main>
}

export function RbacGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { member, loading, error, canAccessPage } = useWorkspace()
  const publicPath = PUBLIC_PATHS.has(pathname)
  const firstPage = firstAccessiblePage(member)
  const requiredPage = pageForPathname(pathname)
  const awaiting = !loading && member && member.status !== "active"
  const activeWithoutPages = !loading && member?.status === "active" && !firstPage
  const unauthorized = !loading && member?.status === "active" && requiredPage && !canAccessPage(requiredPage)

  useEffect(() => {
    if (loading || error || pathname === "/login") return
    if (!member || member.status !== "active") {
      if (pathname !== "/awaiting-approval") router.replace("/awaiting-approval")
      return
    }
    if (pathname === "/awaiting-approval" || unauthorized) {
      if (firstPage?.href) router.replace(firstPage.href)
    }
  }, [error, firstPage?.href, loading, member, pathname, router, unauthorized])

  if (pathname === "/login") return children
  if (loading) return <LoadingAccess />
  if (error) return <main className="grid min-h-screen place-items-center bg-black px-5 text-white"><div className="max-w-md rounded-2xl border border-red-400/20 bg-red-400/[.06] p-8 text-center"><h1 className="text-xl font-medium">Access check failed</h1><p className="mt-3 text-sm leading-6 text-red-200/70">{error}</p></div></main>
  if (awaiting) return publicPath ? children : <LoadingAccess />
  if (!member) return <LoadingAccess />
  if (activeWithoutPages) return <NoPageAccess />
  if (pathname === "/awaiting-approval" || unauthorized) return <LoadingAccess />
  return children
}
