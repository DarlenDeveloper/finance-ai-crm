import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"

export function FinancePageShell({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full bg-black text-white">
      <Header />
      <div className="h-screen overflow-y-auto no-scrollbar">
        <main className="flex min-h-full gap-6 p-4 pt-24 md:p-6 md:pt-24">
          <Sidebar />
          <div className="mx-auto flex w-full max-w-[1500px] min-w-0 flex-1 flex-col gap-5 pb-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#666]">Finance workspace</p><h1 className="text-3xl font-medium tracking-[-0.04em] md:text-4xl">{title}</h1><p className="mt-2 text-sm text-[#777]">{description}</p></div>
              {action}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function StatCard({ label, value, detail, color = "text-white" }: { label: string; value: string; detail: string; color?: string }) {
  return <div className="rounded-2xl border border-white/[0.04] bg-[#0D0D0D] p-5"><p className="text-xs text-[#777]">{label}</p><p className={`mt-4 text-2xl font-medium tracking-tight ${color}`}>{value}</p><p className="mt-2 text-[11px] text-[#555]">{detail}</p></div>
}
