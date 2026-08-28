import type { Firestore } from "firebase-admin/firestore"

export type DuplicateCheck = {
  status: "not_checked" | "clear" | "possible_duplicate"
  matchedInvoiceIds: string[]
  score: number | null
}

type NormalizedLike = {
  vendorName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  total: { amount: number | null; currency: string | null }
}

function normalizeVendor(value: string | null): string | null {
  if (!value) return null
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim() || null
}

/**
 * Deterministic duplicate detection. Runs a set of increasingly loose checks and
 * returns the highest-confidence match found. Never auto-rejects — callers surface
 * candidates to a reviewer.
 *
 * Signals (highest to lowest):
 *   1.0  exact source SHA-256 match
 *   0.9  same normalized vendor + invoice number
 *   0.75 same normalized vendor + total amount + invoice date
 */
export async function findDuplicates(
  db: Firestore,
  workspaceId: string,
  invoiceId: string,
  sha256: string | null,
  normalized: NormalizedLike,
): Promise<DuplicateCheck> {
  const invoicesRef = db.collection(`workspaces/${workspaceId}/invoices`)
  const matches = new Map<string, number>()

  const record = (id: string, score: number) => {
    if (id === invoiceId) return
    matches.set(id, Math.max(matches.get(id) ?? 0, score))
  }

  // 1. Exact source SHA-256 match.
  if (sha256) {
    const snap = await invoicesRef.where("source.sha256", "==", sha256).get()
    snap.forEach((doc) => record(doc.id, 1.0))
  }

  // 2. Same normalized vendor + invoice number.
  const vendorKey = normalizeVendor(normalized.vendorName)
  if (vendorKey && normalized.invoiceNumber) {
    const snap = await invoicesRef.where("normalized.invoiceNumber", "==", normalized.invoiceNumber).get()
    snap.forEach((doc) => {
      const other = doc.data()?.normalized
      if (normalizeVendor(other?.vendorName ?? null) === vendorKey) record(doc.id, 0.9)
    })
  }

  // 3. Same normalized vendor + total amount + invoice date.
  if (vendorKey && normalized.total.amount != null && normalized.invoiceDate) {
    const snap = await invoicesRef.where("normalized.invoiceDate", "==", normalized.invoiceDate).get()
    snap.forEach((doc) => {
      const other = doc.data()?.normalized
      if (
        normalizeVendor(other?.vendorName ?? null) === vendorKey &&
        other?.total?.amount === normalized.total.amount
      ) {
        record(doc.id, 0.75)
      }
    })
  }

  if (matches.size === 0) {
    return { status: "clear", matchedInvoiceIds: [], score: null }
  }

  const sorted = [...matches.entries()].sort((a, b) => b[1] - a[1])
  return {
    status: "possible_duplicate",
    matchedInvoiceIds: sorted.map(([id]) => id),
    score: sorted[0][1],
  }
}
