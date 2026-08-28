import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { changedFields, isoDate, normalize, normalizeCurrency, validate } from "../normalization.js"
import type { Extraction } from "../schema.js"

function baseExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    documentType: "invoice",
    language: "en",
    vendor: { name: "Acme Ltd", taxId: null, address: null, email: null, phone: null },
    invoiceNumber: "INV-100",
    invoiceDate: "2026-01-01",
    dueDate: "2026-01-31",
    purchaseOrderNumber: null,
    currency: "usd",
    subtotal: 100,
    taxAmount: 20,
    totalAmount: 120,
    paymentTerms: null,
    bankAccount: null,
    lineItems: [],
    warnings: [],
    fieldEvidence: [],
    ...overrides,
  }
}

describe("isoDate", () => {
  it("passes valid ISO dates", () => assert.equal(isoDate("2026-01-01"), "2026-01-01"))
  it("rejects malformed dates", () => assert.equal(isoDate("01/01/2026"), null))
  it("rejects null", () => assert.equal(isoDate(null), null))
})

describe("normalizeCurrency", () => {
  it("uppercases 3-letter codes", () => assert.equal(normalizeCurrency("usd"), "USD"))
  it("rejects non 3-letter values", () => assert.equal(normalizeCurrency("US"), null))
  it("rejects null", () => assert.equal(normalizeCurrency(null), null))
})

describe("normalize", () => {
  it("maps extraction into ledger fields", () => {
    const result = normalize(baseExtraction())
    assert.equal(result.vendorName, "Acme Ltd")
    assert.equal(result.invoiceNumber, "INV-100")
    assert.equal(result.total.amount, 120)
    assert.equal(result.total.currency, "USD")
  })
  it("nulls out malformed dates", () => {
    const result = normalize(baseExtraction({ invoiceDate: "not-a-date" }))
    assert.equal(result.invoiceDate, null)
  })
})

describe("validate", () => {
  it("returns no warnings for a clean invoice", () => {
    assert.deepEqual(validate(baseExtraction()), [])
  })
  it("warns when totals do not add up", () => {
    const warnings = validate(baseExtraction({ totalAmount: 200 }))
    assert.ok(warnings.some((w) => w.includes("Subtotal plus tax")))
  })
  it("warns when due date precedes invoice date", () => {
    const warnings = validate(baseExtraction({ invoiceDate: "2026-02-01", dueDate: "2026-01-01" }))
    assert.ok(warnings.some((w) => w.includes("earlier")))
  })
  it("warns on missing vendor and invoice number", () => {
    const warnings = validate(baseExtraction({ vendor: { name: null, taxId: null, address: null, email: null, phone: null }, invoiceNumber: null }))
    assert.ok(warnings.some((w) => w.includes("Vendor name")))
    assert.ok(warnings.some((w) => w.includes("Invoice number")))
  })
  it("warns on non-invoice document types", () => {
    const warnings = validate(baseExtraction({ documentType: "receipt" }))
    assert.ok(warnings.some((w) => w.includes("receipt")))
  })
})

describe("changedFields", () => {
  it("detects changed keys", () => {
    const before = { vendorName: "Acme", total: { amount: 100, currency: "USD" } }
    const after = { vendorName: "Acme Ltd", total: { amount: 100, currency: "USD" } }
    assert.deepEqual(changedFields(before, after), ["vendorName"])
  })
  it("returns all keys when before is empty", () => {
    assert.deepEqual(changedFields(undefined, { a: 1 }), ["a"])
  })
})
