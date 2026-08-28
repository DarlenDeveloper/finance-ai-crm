import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { extractionSchema } from "../schema.js"

const valid = {
  documentType: "invoice",
  language: "en",
  vendor: { name: "Acme", taxId: null, address: null, email: null, phone: null },
  invoiceNumber: "INV-1",
  invoiceDate: "2026-01-01",
  dueDate: null,
  purchaseOrderNumber: null,
  currency: "USD",
  subtotal: 10,
  taxAmount: 2,
  totalAmount: 12,
  paymentTerms: null,
  bankAccount: null,
  lineItems: [],
  warnings: [],
  fieldEvidence: [],
}

describe("extractionSchema", () => {
  it("parses a valid extraction", () => {
    const result = extractionSchema.safeParse(valid)
    assert.equal(result.success, true)
  })
  it("rejects an invalid document type", () => {
    const result = extractionSchema.safeParse({ ...valid, documentType: "spreadsheet" })
    assert.equal(result.success, false)
  })
  it("rejects non-finite numbers", () => {
    const result = extractionSchema.safeParse({ ...valid, subtotal: Number.POSITIVE_INFINITY })
    assert.equal(result.success, false)
  })
  it("rejects missing required keys", () => {
    const { invoiceNumber, ...missing } = valid
    void invoiceNumber
    const result = extractionSchema.safeParse(missing)
    assert.equal(result.success, false)
  })
})
