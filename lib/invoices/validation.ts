import type { GeminiInvoiceExtraction } from "@/lib/invoices/extraction-schema"

export type InvoiceWarning = { code: string; message: string; fields: string[] }

export function validateExtraction(value: GeminiInvoiceExtraction): InvoiceWarning[] {
  const warnings: InvoiceWarning[] = []
  if (!value.vendor.name) warnings.push({ code: "MISSING_VENDOR", message: "Vendor name is missing.", fields: ["vendor.name"] })
  if (!value.invoiceNumber) warnings.push({ code: "MISSING_INVOICE_NUMBER", message: "Invoice number is missing.", fields: ["invoiceNumber"] })
  if (value.documentType !== "invoice" && value.documentType !== "credit_note") {
    warnings.push({ code: "UNEXPECTED_DOCUMENT", message: `Document was classified as ${value.documentType}.`, fields: ["documentType"] })
  }
  if (value.invoiceDate && value.dueDate && value.dueDate < value.invoiceDate) {
    warnings.push({ code: "INVALID_DATE_ORDER", message: "Due date is earlier than invoice date.", fields: ["invoiceDate", "dueDate"] })
  }
  if (value.subtotal != null && value.taxAmount != null && value.totalAmount != null) {
    const tolerance = Math.max(0.02, Math.abs(value.totalAmount) * 0.001)
    if (Math.abs(value.subtotal + value.taxAmount - value.totalAmount) > tolerance) {
      warnings.push({ code: "TOTAL_MISMATCH", message: "Subtotal plus tax does not match the total.", fields: ["subtotal", "taxAmount", "totalAmount"] })
    }
  }
  return warnings
}
