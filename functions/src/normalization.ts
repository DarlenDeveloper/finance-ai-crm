import type { Extraction } from "./schema.js"

export type Money = { amount: number | null; currency: string | null }
export type Normalized = {
  vendorId: string | null
  vendorName: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  subtotal: Money
  tax: Money
  total: Money
}

export function isoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function normalizeCurrency(value: string | null): string | null {
  return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null
}

/** Deterministic normalization of a raw Gemini extraction into ledger fields. */
export function normalize(value: Extraction): Normalized {
  const currency = normalizeCurrency(value.currency)
  return {
    vendorId: null,
    vendorName: value.vendor.name?.trim() || null,
    invoiceNumber: value.invoiceNumber?.trim() || null,
    invoiceDate: isoDate(value.invoiceDate),
    dueDate: isoDate(value.dueDate),
    subtotal: { amount: value.subtotal, currency },
    tax: { amount: value.taxAmount, currency },
    total: { amount: value.totalAmount, currency },
  }
}

/** Deterministic anomaly/quality checks. Returns human-readable warnings. */
export function validate(value: Extraction): string[] {
  const warnings: string[] = []
  if (!value.vendor.name) warnings.push("Vendor name is missing.")
  if (!value.invoiceNumber) warnings.push("Invoice number is missing.")
  if (!["invoice", "credit_note"].includes(value.documentType)) warnings.push(`Document was classified as ${value.documentType}.`)
  if (value.invoiceDate && value.dueDate && value.dueDate < value.invoiceDate) warnings.push("Due date is earlier than invoice date.")
  if (value.subtotal != null && value.taxAmount != null && value.totalAmount != null) {
    const tolerance = Math.max(0.02, Math.abs(value.totalAmount) * 0.001)
    if (Math.abs(value.subtotal + value.taxAmount - value.totalAmount) > tolerance) warnings.push("Subtotal plus tax does not match the total.")
  }
  return warnings
}

/** Fields the reviewer changed relative to the AI's normalized output. */
export function changedFields(before: Record<string, unknown> | undefined, after: Record<string, unknown>): string[] {
  const source = before || {}
  return Object.keys(after).filter((key) => JSON.stringify(source[key]) !== JSON.stringify(after[key]))
}
