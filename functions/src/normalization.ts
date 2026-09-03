import type { Extraction } from "./schema.js"

export type Money = { amount: number | null; currency: string | null }
export type Normalized = {
  // Backward-compatible vendor identity mirrors the issuer/seller.
  vendorId: string | null
  vendorName: string | null
  // Issuer/seller (the party that raised the invoice — "us").
  issuerName: string | null
  // Customer/buyer (the party being billed).
  customerId: string | null
  customerName: string | null
  customerTaxId: string | null
  customerEmail: string | null
  customerPhone: string | null
  // Handler (salesperson/role on the issuer side that handled the invoice).
  handlerContactId: string | null
  handlerName: string | null
  handlerEmail: string | null
  handlerPhone: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  dueDate: string | null
  // True when line/total amounts already include tax; `total` is the printed
  // customer-payable amount and must not be recomputed as subtotal + tax.
  amountsTaxInclusive: boolean | null
  subtotal: Money
  tax: Money
  // Unambiguously the customer-payable grand total.
  total: Money
}

export function isoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export function dueDateOrDefault(invoiceDate: string | null, dueDate: string | null): string | null {
  const explicit = isoDate(dueDate)
  if (explicit) return explicit
  const invoice = isoDate(invoiceDate)
  if (!invoice) return null
  const [year, month, day] = invoice.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString().slice(0, 10)
}

export function normalizeCurrency(value: string | null): string | null {
  return value && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null
}

/** Deterministic normalization of a raw Gemini extraction into ledger fields. */
export function normalize(value: Extraction): Normalized {
  const currency = normalizeCurrency(value.currency)
  // Issuer/seller identity, falling back to the legacy `vendor` block when the
  // model only populated the compatibility field.
  const issuerName = clean(value.issuer?.name) || clean(value.vendor?.name)
  const invoiceDate = isoDate(value.invoiceDate)
  const dueDate = value.documentType === "invoice" ? dueDateOrDefault(invoiceDate, value.dueDate) : isoDate(value.dueDate)
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
    // The printed total IS the customer-payable amount. It is never recomputed
    // as subtotal + tax, which would double-count tax on tax-inclusive invoices.
    total: { amount: value.totalAmount, currency },
  }
}

function moneyTolerance(reference: number): number {
  return Math.max(0.02, Math.abs(reference) * 0.001)
}

/** Deterministic anomaly/quality checks. Returns human-readable warnings. */
export function validate(value: Extraction): string[] {
  const warnings: string[] = []
  if (!clean(value.issuer?.name) && !clean(value.vendor?.name)) warnings.push("Issuer (seller) name is missing.")
  if (!clean(value.customer?.name)) warnings.push("Customer name is missing.")
  if (!value.invoiceNumber) warnings.push("Invoice number is missing.")
  if (!["invoice", "credit_note"].includes(value.documentType)) warnings.push(`Document was classified as ${value.documentType}.`)
  if (value.invoiceDate && value.dueDate && value.dueDate < value.invoiceDate) warnings.push("Due date is earlier than invoice date.")

  // Guard against the issuer being mislabelled as the customer.
  const issuerName = clean(value.issuer?.name) || clean(value.vendor?.name)
  const customerName = clean(value.customer?.name)
  if (issuerName && customerName && issuerName.toLowerCase() === customerName.toLowerCase()) {
    warnings.push("Issuer and customer appear to be the same party; verify the buyer.")
  }

  // subtotal + tax must equal the printed payable total, regardless of whether
  // the amounts are tax-inclusive. For tax-inclusive invoices the subtotal is
  // the net contained within the total, so the identity still holds and the
  // total must never be recomputed as subtotal + tax + tax.
  if (value.subtotal != null && value.taxAmount != null && value.totalAmount != null) {
    const tolerance = moneyTolerance(value.totalAmount)
    if (Math.abs(value.subtotal + value.taxAmount - value.totalAmount) > tolerance) {
      warnings.push("Subtotal plus tax does not match the total.")
    }
  }

  // Deterministic tax-inclusive line-total check: when amounts are tax-inclusive
  // and line totals are present, their sum should equal the printed payable
  // total (they already include tax), not the net subtotal.
  if (value.amountsTaxInclusive === true) {
    const lineTotals = value.lineItems.map((item) => item.totalAmount).filter((n): n is number => n != null)
    if (lineTotals.length > 0 && lineTotals.length === value.lineItems.length && value.totalAmount != null) {
      const sum = lineTotals.reduce((acc, n) => acc + n, 0)
      const tolerance = moneyTolerance(value.totalAmount)
      if (Math.abs(sum - value.totalAmount) > tolerance) {
        warnings.push("Tax-inclusive line totals do not sum to the payable total.")
      }
    }
  }

  return warnings
}

/** Fields the reviewer changed relative to the AI's normalized output. */
export function changedFields(before: Record<string, unknown> | undefined, after: Record<string, unknown>): string[] {
  const source = before || {}
  return Object.keys(after).filter((key) => JSON.stringify(source[key]) !== JSON.stringify(after[key]))
}
