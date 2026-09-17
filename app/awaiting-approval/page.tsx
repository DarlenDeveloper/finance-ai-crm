"use client"

import { Icon } from "@/components/icon"
import { MercuryLogo } from "@/components/mercury-logo"
import { useAuth } from "@/components/auth-provider"
import { useWorkspace } from "@/components/workspace-provider"

export default function AwaitingApprovalPage() {
  const { user, logout } = useAuth()
  const { status } = useWorkspace()
  const disabled = status === "disabled"

  return <main className="grid min-h-screen place-items-center bg-black px-5 text-white">
    <section className="w-full max-w-lg rounded-3xl border border-white/[0.06] bg-[#0d0d0d] p-8 text-center shadow-2xl sm:p-10">
      <div className="mx-auto inline-flex rounded-xl bg-white p-2.5"><MercuryLogo className="h-10 w-[204px]" priority /></div>
      <span className={`mx-auto mt-8 grid h-14 w-14 place-items-center rounded-2xl ${disabled ? "bg-red-400/10 text-red-300" : "bg-amber-400/10 text-amber-300"}`}>
        <Icon name={disabled ? "Lock1" : "Clock"} size={24} variant="Bold" />
      </span>
      <h1 className="mt-6 text-2xl font-medium tracking-[-.03em]">{disabled ? "Account access disabled" : "Your account is awaiting approval"}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#777]">{disabled ? "Your access to the Mercury CRM has been suspended. Contact the super admin if you believe this is a mistake." : "The super admin will select your role, assign the pages you can use, and approve your account. This screen will update automatically once access is granted."}</p>
      <div className="mt-7 rounded-xl border border-[#242424] bg-[#111] p-4 text-left">
        <p className="text-[10px] uppercase tracking-[.18em] text-[#555]">Signed in as</p>
        <p className="mt-2 truncate text-sm text-[#ddd]">{user?.email || "Authenticated user"}</p>
        <p className={`mt-2 text-[10px] font-medium uppercase tracking-wider ${disabled ? "text-red-300" : "text-amber-300"}`}>{disabled ? "Disabled" : "Pending approval"}</p>
      </div>
      <button onClick={() => void logout()} className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl border border-[#292929] px-5 text-xs text-[#999] transition hover:border-[#3a3a3a] hover:text-white"><Icon name="Logout" size={16}/>Sign out</button>
    </section>
  </main>
}
