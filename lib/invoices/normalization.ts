import type { GeminiInvoiceExtraction, NormalizedInvoice } from "@/lib/invoices/extraction-schema"

export function normalizeExtraction(value: GeminiInvoiceExtraction): NormalizedInvoice {
  const currency = normalizeCurrency(value.currency)
  const issuerName = clean(value.issuer?.name) || clean(value.vendor?.name)
  const invoiceDate = normalizeDate(value.invoiceDate)
  const dueDate = value.documentType === "invoice" ? dueDateOrDefault(invoiceDate, value.dueDate) : normalizeDate(value.dueDate)
  return {
    vendorId: null,
    vendorName: issuerName,
    issuerName,
    customerId: null,
    customerName: clean(value.customer?.name),
    customerTaxId: clean(value.customer?.taxId),
    customerEmail: clean(value.customer?.email),
    customerPhone: clean(value.customer?.phone),
    handlerContactId: null,
    handlerName: clean(value.invoiceHandlerName),
    handlerEmail: null,
    handlerPhone: null,
    invoiceNumber: clean(value.invoiceNumber),
    invoiceDate,
    dueDate,
    amountsTaxInclusive: value.amountsTaxInclusive ?? null,
    subtotal: { amount: value.subtotal, currency },
    tax: { amount: value.taxAmount, currency },
    // The printed total IS the customer-payable amount; never recompute it as
    // subtotal + tax (which double-counts tax on tax-inclusive invoices).
    total: { amount: value.totalAmount, currency },
  }
}

export function dueDateOrDefault(invoiceDate: string | null, dueDate: string | null): string | null {
  const explicit = normalizeDate(dueDate)
  if (explicit) return explicit
  const invoice = normalizeDate(invoiceDate)
  if (!invoice) return null
  const [year, month, day] = invoice.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString().slice(0, 10)
}

function clean(value: string | null | undefined) { return value?.trim() || null }
function normalizeDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null }
function normalizeCurrency(value: string | null) { return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null }
