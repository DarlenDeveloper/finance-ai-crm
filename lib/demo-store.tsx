"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type InvoiceStatus = "Needs review" | "Verified" | "Overdue" | "Processing" | "Paid"
export type Invoice = {
  id: string
  vendor: string
  date: string
  amount: number
  status: InvoiceStatus
  source?: string
}

const seedInvoices: Invoice[] = [
  { vendor: "Kampala Office Supplies", id: "INV-2026-1842", date: "10 Aug 2026", amount: 12480, status: "Needs review" },
  { vendor: "Africa Logistics Co.", id: "ALC-009821", date: "09 Aug 2026", amount: 8920.5, status: "Verified" },
  { vendor: "Nile Energy Systems", id: "NES/4491/26", date: "06 Aug 2026", amount: 23170, status: "Overdue" },
  { vendor: "Eastline Technologies", id: "ET-88420", date: "05 Aug 2026", amount: 4630.8, status: "Processing" },
  { vendor: "Gulu Trade Partners", id: "GTP-10094", date: "02 Aug 2026", amount: 7340, status: "Verified" },
  { vendor: "Crestwood Facilities", id: "CF-22901", date: "29 Jul 2026", amount: 2180.5, status: "Paid" },
]

type DemoStore = {
  invoices: Invoice[]
  hydrated: boolean
  addFiles: (files: FileList | File[]) => number
  approveInvoice: (id: string, changes?: Partial<Invoice>) => void
  rejectInvoice: (id: string) => void
  resetDemo: () => void
}

const StoreContext = createContext<DemoStore | null>(null)
const STORAGE_KEY = "ledger-ai-demo-v1"

export function DemoStoreProvider({ children }: { children: React.ReactNode }) {
  const [invoices, setInvoices] = useState(seedInvoices)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) setInvoices(JSON.parse(saved))
    } catch { /* fall back to seeded demo data */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices))
  }, [hydrated, invoices])

  const value = useMemo<DemoStore>(() => ({
    invoices,
    hydrated,
    addFiles(files) {
      const list = Array.from(files)
      const now = new Date()
      const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      const added = list.map((file, index): Invoice => {
        const clean = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim()
        const label = clean || `Uploaded invoice ${index + 1}`
        return {
          id: `UP-${now.getTime().toString().slice(-6)}-${index + 1}`,
          vendor: label.replace(/\b\w/g, (letter) => letter.toUpperCase()),
          date,
          amount: 0,
          status: "Needs review",
          source: file.name,
        }
      })
      setInvoices((current) => [...added, ...current])
      return added.length
    },
    approveInvoice(id, changes) {
      setInvoices((current) => current.map((invoice) => invoice.id === id ? { ...invoice, ...changes, status: "Verified" } : invoice))
    },
    rejectInvoice(id) {
      setInvoices((current) => current.filter((invoice) => invoice.id !== id))
    },
    resetDemo() {
      setInvoices(seedInvoices)
    },
  }), [hydrated, invoices])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useDemoStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error("useDemoStore must be used inside DemoStoreProvider")
  return store
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}
