"use client"

import { FormEvent, useState } from "react"
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth"
import { Icon, type IconName } from "@/components/icon"
const mk = (name: IconName, variant?: "Linear" | "Bold") => function I({ className }: { className?: string }) {
  return <Icon name={name} className={className} variant={variant} />
}
const ArrowRight = mk("ArrowRight")
const LockKeyhole = mk("Lock1", "Bold")
const Sparkles = mk("MagicStar", "Bold")
import { firebaseAuth } from "@/lib/firebase"
import { useAuth } from "@/components/auth-provider"

function friendlyError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  if (code.includes("invalid-credential")) return "That email or password is incorrect."
  if (code.includes("email-already-in-use")) return "An account already exists for this email."
  if (code.includes("weak-password")) return "Use a password with at least six characters."
  if (code.includes("invalid-email")) return "Enter a valid email address."
  return "Authentication failed. Please try again."
}

export default function LoginPage() {
  const { configured } = useAuth()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!firebaseAuth) return
    setBusy(true); setError("")
    try {
      if (mode === "signin") await signInWithEmailAndPassword(firebaseAuth, email, password)
      else await createUserWithEmailAndPassword(firebaseAuth, email, password)
    } catch (authError) { setError(friendlyError(authError)) }
    finally { setBusy(false) }
  }

  return <main className="grid min-h-screen bg-black px-5 text-white lg:grid-cols-2">
    <section className="hidden border-r border-white/[0.05] p-12 lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><b className="text-xl tracking-[-.05em]">CRM</b><span className="rounded-md bg-[#142319] px-2 py-1 text-[10px] uppercase tracking-[.18em] text-[#86efac]">Ledger AI</span></div><div className="max-w-lg"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#86efac]/10 text-[#86efac]"><Sparkles className="h-5 w-5"/></span><h1 className="mt-7 text-5xl font-medium leading-tight tracking-[-.05em]">From invoice scan to clean ledger.</h1><p className="mt-5 text-sm leading-6 text-[#777]">A working finance operations demo with authenticated workspace access.</p></div><p className="text-[10px] uppercase tracking-[.2em] text-[#444]">Finance Control · Kampala</p></section>
    <section className="grid place-items-center py-12"><div className="w-full max-w-sm"><div className="mb-8 lg:hidden"><b className="text-xl">CRM</b></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#86efac]/10 text-[#86efac]"><LockKeyhole className="h-4 w-4"/></span><h2 className="mt-6 text-3xl font-medium tracking-[-.04em]">{mode === "signin" ? "Welcome back" : "Create your account"}</h2><p className="mt-2 text-sm text-[#666]">{mode === "signin" ? "Sign in to your finance workspace." : "Start with a secure finance workspace."}</p>
      {!configured ? <div className="mt-7 rounded-xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-xs leading-5 text-amber-200">Firebase isn&apos;t configured yet. Copy <code>.env.example</code> to <code>.env.local</code>, add your Firebase web app values, then restart the dev server.</div> : <form onSubmit={submit} className="mt-7 space-y-4"><label className="block"><span className="mb-2 block text-[11px] text-[#777]">Email address</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border border-[#292929] bg-[#111] px-4 text-sm outline-none focus:border-[#86efac]/50" placeholder="alice@company.com"/></label><label className="block"><span className="mb-2 block text-[11px] text-[#777]">Password</span><input required minLength={6} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-[#292929] bg-[#111] px-4 text-sm outline-none focus:border-[#86efac]/50" placeholder="At least 6 characters"/></label>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}<button disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#86efac] text-xs font-semibold text-black disabled:opacity-60">{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight className="h-4 w-4"/></button></form>}
      {configured && <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError("") }} className="mt-5 text-xs text-[#777] hover:text-white">{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>}
    </div></section>
  </main>
}
