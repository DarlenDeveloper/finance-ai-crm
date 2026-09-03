import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { extractionSchema, responseJsonSchema } from "../schema.js"

const valid = {
  documentType: "invoice",
  language: "en",
  vendor: { name: "Acme", taxId: null, address: null, email: null, phone: null },
  issuer: { name: "Acme", taxId: null, address: null, email: null, phone: null },
  customer: { name: "Beta", taxId: null, address: null, email: null, phone: null },
  invoiceHandlerName: "Sales",
  invoiceNumber: "INV-1",
  invoiceDate: "2026-01-01",
  dueDate: null,
  purchaseOrderNumber: null,
  currency: "USD",
  subtotal: 10,
  taxAmount: 2,
  totalAmount: 12,
  amountsTaxInclusive: true,
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
  it("parses issuer, customer and handler fields", () => {
    const result = extractionSchema.parse(valid)
    assert.equal(result.issuer.name, "Acme")
    assert.equal(result.customer.name, "Beta")
    assert.equal(result.invoiceHandlerName, "Sales")
    assert.equal(result.amountsTaxInclusive, true)
  })
  it("rejects an invalid document type", () => {
    const result = extractionSchema.safeParse({ ...valid, documentType: "spreadsheet" })
    assert.equal(result.success, false)
  })
  it("rejects non-finite numbers", () => {
    const result = extractionSchema.safeParse({ ...valid, subtotal: Number.POSITIVE_INFINITY })
    assert.equal(result.success, false)
  })
  it("rejects a non-boolean amountsTaxInclusive", () => {
    const result = extractionSchema.safeParse({ ...valid, amountsTaxInclusive: "yes" })
    assert.equal(result.success, false)
  })
  it("rejects missing required keys", () => {
    const { invoiceNumber, ...missing } = valid
    void invoiceNumber
    const result = extractionSchema.safeParse(missing)
    assert.equal(result.success, false)
  })
  it("rejects missing customer block", () => {
    const { customer, ...missing } = valid
    void customer
    const result = extractionSchema.safeParse(missing)
    assert.equal(result.success, false)
  })
})

describe("responseJsonSchema (Gemini compatibility)", () => {
  it("requires the new party, handler and tax-inclusive fields", () => {
    const required = responseJsonSchema.required as readonly string[]
    for (const key of ["issuer", "customer", "invoiceHandlerName", "amountsTaxInclusive"]) {
      assert.ok(required.includes(key), `missing required key: ${key}`)
    }
  })
  it("contains no unsupported maxItems keyword anywhere", () => {
    assert.ok(!JSON.stringify(responseJsonSchema).includes("maxItems"))
  })
})
