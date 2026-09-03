import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { currentPaymentStatus, transitionPayment } from "../payment.js"

describe("invoice payment transitions", () => {
  it("treats legacy invoices without payment data as unpaid", () => {
    assert.equal(currentPaymentStatus(undefined), "unpaid")
    assert.equal(currentPaymentStatus("unexpected"), "unpaid")
    assert.equal(currentPaymentStatus("paid"), "paid")
  })

  it("marks a verified invoice paid with audit fields", () => {
    const result = transitionPayment("verified", undefined, "paid", "now", "user-1")
    assert.equal(result.changed, true)
    assert.equal(result.previousStatus, "unpaid")
    assert.deepEqual(result.payment, {
      status: "paid",
      paidAt: "now",
      markedPaidBy: "user-1",
      updatedAt: "now",
      updatedBy: "user-1",
    })
  })

  it("reopens a paid invoice as unpaid while clearing paid attribution", () => {
    const result = transitionPayment("verified", "paid", "unpaid", "later", "user-2")
    assert.deepEqual(result.payment, {
      status: "unpaid",
      paidAt: null,
      markedPaidBy: null,
      updatedAt: "later",
      updatedBy: "user-2",
    })
  })

  it("is idempotent when the requested status is already set", () => {
    const result = transitionPayment("verified", "paid", "paid", "now", "user-1")
    assert.equal(result.changed, false)
    assert.equal(result.payment, null)
  })

  it("rejects payment changes for unverified invoices", () => {
    assert.throws(
      () => transitionPayment("needs_review", "unpaid", "paid", "now", "user-1"),
      /PAYMENT_REQUIRES_VERIFIED_INVOICE/,
    )
  })
})
