import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { findDuplicates } from "../duplicates.js"

type Doc = { id: string; data: Record<string, unknown> }

// Minimal Firestore fake supporting collection().where(path, "==", value).get().
function fakeDb(docs: Doc[]) {
  function getNested(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj)
  }
  return {
    collection() {
      return {
        where(path: string, _op: string, value: unknown) {
          const filtered = docs.filter((d) => getNested(d.data, path) === value)
          return {
            async get() {
              return {
                forEach(cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) {
                  filtered.forEach((d) => cb({ id: d.id, data: () => d.data }))
                },
              }
            },
          }
        },
      }
    },
  } as never
}

const normalized = {
  vendorName: "Acme Ltd",
  invoiceNumber: "INV-100",
  invoiceDate: "2026-01-01",
  total: { amount: 120, currency: "USD" },
}

describe("findDuplicates", () => {
  it("returns clear when nothing matches", async () => {
    const result = await findDuplicates(fakeDb([]), "ws", "self", "hashA", normalized)
    assert.equal(result.status, "clear")
    assert.equal(result.score, null)
  })

  it("scores an exact SHA-256 match at 1.0", async () => {
    const db = fakeDb([{ id: "other", data: { source: { sha256: "hashA" }, normalized: {} } }])
    const result = await findDuplicates(db, "ws", "self", "hashA", normalized)
    assert.equal(result.status, "possible_duplicate")
    assert.equal(result.score, 1.0)
    assert.deepEqual(result.matchedInvoiceIds, ["other"])
  })

  it("scores vendor + invoice number match at 0.9", async () => {
    const db = fakeDb([{ id: "other", data: { normalized: { vendorName: "ACME  ltd", invoiceNumber: "INV-100" } } }])
    const result = await findDuplicates(db, "ws", "self", null, normalized)
    assert.equal(result.score, 0.9)
  })

  it("scores vendor + total + date match at 0.75", async () => {
    const db = fakeDb([{ id: "other", data: { normalized: { vendorName: "Acme Ltd", invoiceDate: "2026-01-01", total: { amount: 120 } } } }])
    const result = await findDuplicates(db, "ws", "self", null, normalized)
    assert.equal(result.score, 0.75)
  })

  it("never matches the invoice against itself", async () => {
    const db = fakeDb([{ id: "self", data: { source: { sha256: "hashA" } } }])
    const result = await findDuplicates(db, "ws", "self", "hashA", normalized)
    assert.equal(result.status, "clear")
  })
})
