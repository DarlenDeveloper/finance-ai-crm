import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { changedFields, dueDateOrDefault, isoDate, normalize, normalizeCurrency, validate } from "../normalization.js"
import type { Extraction } from "../schema.js"

const emptyParty = { name: null, taxId: null, address: null, email: null, phone: null }

function baseExtraction(overrides: Partial<Extraction> = {}): Extraction {
  return {
    documentType: "invoice",
    language: "en",
    vendor: { name: "Acme Ltd", taxId: null, address: null, email: null, phone: null },
    issuer: { name: "Acme Ltd", taxId: null, address: null, email: null, phone: null },
    customer: { name: "Beta Corp", taxId: null, address: null, email: null, phone: null },
    invoiceHandlerName: null,
    invoiceNumber: "INV-100",
    invoiceDate: "2026-01-01",
    dueDate: "2026-01-31",
    purchaseOrderNumber: null,
    currency: "usd",
    subtotal: 100,
    taxAmount: 20,
    totalAmount: 120,
    amountsTaxInclusive: false,
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

describe("dueDateOrDefault", () => {
  it("preserves an explicit due date", () => assert.equal(dueDateOrDefault("2026-07-03", "2026-07-20"), "2026-07-20"))
  it("defaults to 30 calendar days after invoice date", () => assert.equal(dueDateOrDefault("2026-07-03", null), "2026-08-02"))
  it("handles year rollover in UTC", () => assert.equal(dueDateOrDefault("2026-12-15", null), "2027-01-14"))
  it("returns null without a valid invoice or due date", () => assert.equal(dueDateOrDefault(null, null), null))
})

describe("normalizeCurrency", () => {
  it("uppercases 3-letter codes", () => assert.equal(normalizeCurrency("usd"), "USD"))
  it("rejects non 3-letter values", () => assert.equal(normalizeCurrency("US"), null))
  it("rejects null", () => assert.equal(normalizeCurrency(null), null))
})

describe("normalize", () => {
  it("maps extraction into ledger fields", () => {
    const result = normalize(baseExtraction())
    assert.equal(result.issuerName, "Acme Ltd")
    assert.equal(result.vendorName, "Acme Ltd")
    assert.equal(result.customerName, "Beta Corp")
    assert.equal(result.invoiceNumber, "INV-100")
    assert.equal(result.total.amount, 120)
    assert.equal(result.total.currency, "USD")
  })
  it("keeps vendorName backward-compatible with issuer", () => {
    const result = normalize(baseExtraction({ issuer: { ...emptyParty, name: "Mercury" }, vendor: emptyParty }))
    assert.equal(result.issuerName, "Mercury")
    assert.equal(result.vendorName, "Mercury")
  })
  it("falls back to legacy vendor when issuer is empty", () => {
    const result = normalize(baseExtraction({ issuer: emptyParty, vendor: { ...emptyParty, name: "Legacy Co" } }))
    assert.equal(result.issuerName, "Legacy Co")
    assert.equal(result.vendorName, "Legacy Co")
  })
  it("maps customer contact fields and null contact ids", () => {
    const result = normalize(baseExtraction({
      customer: { name: "PC BAY", taxId: "TX-9", address: null, email: "buy@pcbay.test", phone: "+1-555" },
    }))
    assert.equal(result.customerName, "PC BAY")
    assert.equal(result.customerTaxId, "TX-9")
    assert.equal(result.customerEmail, "buy@pcbay.test")
    assert.equal(result.customerPhone, "+1-555")
    assert.equal(result.customerId, null)
    assert.equal(result.handlerContactId, null)
  })
  it("maps invoiceHandlerName into handlerName", () => {
    const result = normalize(baseExtraction({ invoiceHandlerName: "Sales" }))
    assert.equal(result.handlerName, "Sales")
  })
  it("propagates amountsTaxInclusive", () => {
    assert.equal(normalize(baseExtraction({ amountsTaxInclusive: true })).amountsTaxInclusive, true)
    assert.equal(normalize(baseExtraction({ amountsTaxInclusive: null })).amountsTaxInclusive, null)
  })
  it("uses printed total as payable total without recomputing", () => {
    // Tax-inclusive: printed total is payable and must not be inflated.
    const result = normalize(baseExtraction({ amountsTaxInclusive: true, subtotal: 12966.41, taxAmount: 2333.95, totalAmount: 15300.36 }))
    assert.equal(result.total.amount, 15300.36)
  })
  it("defaults a missing due date to invoice date plus 30 days", () => {
    const result = normalize(baseExtraction({ invoiceDate: "2026-07-03", dueDate: null }))
    assert.equal(result.dueDate, "2026-08-02")
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
  it("returns no warnings for the 4658.pdf tax-inclusive scenario", () => {
    // Mercury issues to PC BAY, handler label "Sales", rates tax-inclusive.
    const warnings = validate(baseExtraction({
      issuer: { ...emptyParty, name: "Mercury" },
      vendor: { ...emptyParty, name: "Mercury" },
      customer: { ...emptyParty, name: "PC BAY" },
      invoiceHandlerName: "Sales",
      amountsTaxInclusive: true,
      subtotal: 12966.41,
      taxAmount: 2333.95,
      totalAmount: 15300.36,
    }))
    assert.deepEqual(warnings, [])
  })
  it("warns when totals do not add up", () => {
    const warnings = validate(baseExtraction({ totalAmount: 200 }))
    assert.ok(warnings.some((w) => w.includes("Subtotal plus tax")))
  })
  it("does not double-count tax on tax-inclusive totals", () => {
    // subtotal + tax === printed payable total; no mismatch warning expected.
    const warnings = validate(baseExtraction({ amountsTaxInclusive: true, subtotal: 12966.41, taxAmount: 2333.95, totalAmount: 15300.36 }))
    assert.ok(!warnings.some((w) => w.includes("Subtotal plus tax")))
  })
  it("warns when due date precedes invoice date", () => {
    const warnings = validate(baseExtraction({ invoiceDate: "2026-02-01", dueDate: "2026-01-01" }))
    assert.ok(warnings.some((w) => w.includes("earlier")))
  })
  it("warns on missing issuer and customer and invoice number", () => {
    const warnings = validate(baseExtraction({ vendor: emptyParty, issuer: emptyParty, customer: emptyParty, invoiceNumber: null }))
    assert.ok(warnings.some((w) => w.includes("Issuer")))
    assert.ok(warnings.some((w) => w.includes("Customer")))
    assert.ok(warnings.some((w) => w.includes("Invoice number")))
  })
  it("warns when issuer equals customer", () => {
    const warnings = validate(baseExtraction({
      issuer: { ...emptyParty, name: "Same Co" },
      vendor: { ...emptyParty, name: "Same Co" },
      customer: { ...emptyParty, name: "same co" },
    }))
    assert.ok(warnings.some((w) => w.includes("same party")))
  })
  it("warns when tax-inclusive line totals do not sum to the payable total", () => {
    const warnings = validate(baseExtraction({
      amountsTaxInclusive: true,
      subtotal: 100,
      taxAmount: 20,
      totalAmount: 120,
      lineItems: [
        { description: "a", quantity: 1, unitPrice: 50, taxAmount: null, totalAmount: 50 },
        { description: "b", quantity: 1, unitPrice: 50, taxAmount: null, totalAmount: 50 },
      ],
    }))
    assert.ok(warnings.some((w) => w.includes("line totals")))
  })
  it("passes when tax-inclusive line totals sum to the payable total", () => {
    const warnings = validate(baseExtraction({
      amountsTaxInclusive: true,
      subtotal: 100,
      taxAmount: 20,
      totalAmount: 120,
      lineItems: [
        { description: "a", quantity: 1, unitPrice: 60, taxAmount: null, totalAmount: 60 },
        { description: "b", quantity: 1, unitPrice: 60, taxAmount: null, totalAmount: 60 },
      ],
    }))
    assert.ok(!warnings.some((w) => w.includes("line totals")))
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
