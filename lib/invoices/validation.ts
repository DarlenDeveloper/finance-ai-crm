import type { GeminiInvoiceExtraction } from "@/lib/invoices/extraction-schema"

export type InvoiceWarning = { code: string; message: string; fields: string[] }

function clean(value: string | null | undefined) { return value?.trim() || null }
function moneyTolerance(reference: number) { return Math.max(0.02, Math.abs(reference) * 0.001) }

export function validateExtraction(value: GeminiInvoiceExtraction): InvoiceWarning[] {
  const warnings: InvoiceWarning[] = []
  const issuerName = clean(value.issuer?.name) || clean(value.vendor?.name)
  const customerName = clean(value.customer?.name)

  if (!issuerName) warnings.push({ code: "MISSING_ISSUER", message: "Issuer (seller) name is missing.", fields: ["issuer.name"] })
  if (!customerName) warnings.push({ code: "MISSING_CUSTOMER", message: "Customer name is missing.", fields: ["customer.name"] })
  if (!value.invoiceNumber) warnings.push({ code: "MISSING_INVOICE_NUMBER", message: "Invoice number is missing.", fields: ["invoiceNumber"] })
  if (value.documentType !== "invoice" && value.documentType !== "credit_note") {
    warnings.push({ code: "UNEXPECTED_DOCUMENT", message: `Document was classified as ${value.documentType}.`, fields: ["documentType"] })
  }
  if (value.invoiceDate && value.dueDate && value.dueDate < value.invoiceDate) {
    warnings.push({ code: "INVALID_DATE_ORDER", message: "Due date is earlier than invoice date.", fields: ["invoiceDate", "dueDate"] })
  }
  if (issuerName && customerName && issuerName.toLowerCase() === customerName.toLowerCase()) {
    warnings.push({ code: "PARTY_CONFLICT", message: "Issuer and customer appear to be the same party; verify the buyer.", fields: ["issuer.name", "customer.name"] })
  }
  if (value.subtotal != null && value.taxAmount != null && value.totalAmount != null) {
    const tolerance = moneyTolerance(value.totalAmount)
    if (Math.abs(value.subtotal + value.taxAmount - value.totalAmount) > tolerance) {
      warnings.push({ code: "TOTAL_MISMATCH", message: "Subtotal plus tax does not match the total.", fields: ["subtotal", "taxAmount", "totalAmount"] })
    }
  }
  if (value.amountsTaxInclusive === true) {
    const lineTotals = value.lineItems.map((item) => item.totalAmount).filter((n): n is number => n != null)
    if (lineTotals.length > 0 && lineTotals.length === value.lineItems.length && value.totalAmount != null) {
      const sum = lineTotals.reduce((acc, n) => acc + n, 0)
      if (Math.abs(sum - value.totalAmount) > moneyTolerance(value.totalAmount)) {
        warnings.push({ code: "INCLUSIVE_LINE_MISMATCH", message: "Tax-inclusive line totals do not sum to the payable total.", fields: ["lineItems", "totalAmount"] })
      }
    }
  }
  return warnings
}
