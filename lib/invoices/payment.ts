export type InvoicePaymentState = "paid" | "unpaid" | "overdue" | "not_applicable"

export type PaymentTrackedInvoice = {
  status: string
  payment?: { status?: string | null } | null
  normalized?: { dueDate?: string | null } | null
}

export function invoicePaymentState(
  invoice: PaymentTrackedInvoice,
  today = new Date().toISOString().slice(0, 10),
): InvoicePaymentState {
  if (invoice.status !== "verified") return "not_applicable"
  if (invoice.payment?.status === "paid") return "paid"
  const dueDate = invoice.normalized?.dueDate
  return dueDate && dueDate < today ? "overdue" : "unpaid"
}

export function isOutstanding(invoice: PaymentTrackedInvoice, today?: string) {
  const state = invoicePaymentState(invoice, today)
  return state === "unpaid" || state === "overdue"
}
