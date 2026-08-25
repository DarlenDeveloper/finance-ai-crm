import type { GeminiInvoiceExtraction, NormalizedInvoice } from "@/lib/invoices/extraction-schema"

export function normalizeExtraction(value: GeminiInvoiceExtraction): NormalizedInvoice {
  const currency = normalizeCurrency(value.currency)
  return {
    vendorId: null,
    vendorName: clean(value.vendor.name),
    invoiceNumber: clean(value.invoiceNumber),
    invoiceDate: normalizeDate(value.invoiceDate),
    dueDate: normalizeDate(value.dueDate),
    subtotal: { amount: value.subtotal, currency },
    tax: { amount: value.taxAmount, currency },
    total: { amount: value.totalAmount, currency },
  }
}

function clean(value: string | null) { return value?.trim() || null }
function normalizeDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null }
function normalizeCurrency(value: string | null) { return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null }
