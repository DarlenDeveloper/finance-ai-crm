export type PaymentStatus = "unpaid" | "paid"

export type PaymentRecord<TTimestamp> = {
  status: PaymentStatus
  paidAt: TTimestamp | null
  markedPaidBy: string | null
  updatedAt: TTimestamp
  updatedBy: string
}

export type PaymentTransition<TTimestamp> = {
  changed: boolean
  previousStatus: PaymentStatus
  status: PaymentStatus
  payment: PaymentRecord<TTimestamp> | null
}

/** Legacy verified invoices without payment data are intentionally outstanding. */
export function currentPaymentStatus(value: unknown): PaymentStatus {
  return value === "paid" ? "paid" : "unpaid"
}

export function transitionPayment<TTimestamp>(
  invoiceStatus: unknown,
  currentStatus: unknown,
  targetStatus: PaymentStatus,
  timestamp: TTimestamp,
  actorId: string,
): PaymentTransition<TTimestamp> {
  if (invoiceStatus !== "verified") throw new Error("PAYMENT_REQUIRES_VERIFIED_INVOICE")

  const previousStatus = currentPaymentStatus(currentStatus)
  if (previousStatus === targetStatus) {
    return { changed: false, previousStatus, status: targetStatus, payment: null }
  }

  return {
    changed: true,
    previousStatus,
    status: targetStatus,
    payment: {
      status: targetStatus,
      paidAt: targetStatus === "paid" ? timestamp : null,
      markedPaidBy: targetStatus === "paid" ? actorId : null,
      updatedAt: timestamp,
      updatedBy: actorId,
    },
  }
}
