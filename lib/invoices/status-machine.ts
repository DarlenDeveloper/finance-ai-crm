export const invoiceStatuses = [
  "uploading", "uploaded", "processing", "needs_review", "verified", "rejected", "failed",
] as const

export type InvoiceStatus = typeof invoiceStatuses[number]

const transitions: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  uploading: ["uploaded", "failed"],
  uploaded: ["processing", "rejected"],
  processing: ["needs_review", "failed"],
  needs_review: ["verified", "rejected", "processing"],
  verified: [],
  rejected: [],
  failed: ["processing", "rejected"],
}

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus) {
  return transitions[from].includes(to)
}
