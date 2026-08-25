import { z } from "zod"

const nullableString = z.string().nullable()
const nullableNumber = z.number().finite().nullable()

export const extractionSchema = z.object({
  documentType: z.enum(["invoice", "credit_note", "receipt", "other"]),
  language: nullableString,
  vendor: z.object({ name: nullableString, taxId: nullableString, address: nullableString, email: nullableString, phone: nullableString }),
  invoiceNumber: nullableString,
  invoiceDate: nullableString,
  dueDate: nullableString,
  purchaseOrderNumber: nullableString,
  currency: nullableString,
  subtotal: nullableNumber,
  taxAmount: nullableNumber,
  totalAmount: nullableNumber,
  paymentTerms: nullableString,
  bankAccount: nullableString,
  lineItems: z.array(z.object({
    description: nullableString,
    quantity: nullableNumber,
    unitPrice: nullableNumber,
    taxAmount: nullableNumber,
    totalAmount: nullableNumber,
  })).max(500),
  warnings: z.array(z.string()).max(50),
  fieldEvidence: z.array(z.object({
    field: z.string(), text: nullableString, page: z.number().int().positive().nullable(), certainty: z.enum(["high", "medium", "low"]),
  })).max(100),
})

export type Extraction = z.infer<typeof extractionSchema>

const nullableStringJson = { anyOf: [{ type: "string" }, { type: "null" }] } as const
const nullableNumberJson = { anyOf: [{ type: "number" }, { type: "null" }] } as const

export const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "language", "vendor", "invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "currency", "subtotal", "taxAmount", "totalAmount", "paymentTerms", "bankAccount", "lineItems", "warnings", "fieldEvidence"],
  properties: {
    documentType: { type: "string", enum: ["invoice", "credit_note", "receipt", "other"] },
    language: nullableStringJson,
    vendor: { type: "object", additionalProperties: false, required: ["name", "taxId", "address", "email", "phone"], properties: { name: nullableStringJson, taxId: nullableStringJson, address: nullableStringJson, email: nullableStringJson, phone: nullableStringJson } },
    invoiceNumber: nullableStringJson,
    invoiceDate: nullableStringJson,
    dueDate: nullableStringJson,
    purchaseOrderNumber: nullableStringJson,
    currency: nullableStringJson,
    subtotal: nullableNumberJson,
    taxAmount: nullableNumberJson,
    totalAmount: nullableNumberJson,
    paymentTerms: nullableStringJson,
    bankAccount: nullableStringJson,
    lineItems: { type: "array", maxItems: 500, items: { type: "object", additionalProperties: false, required: ["description", "quantity", "unitPrice", "taxAmount", "totalAmount"], properties: { description: nullableStringJson, quantity: nullableNumberJson, unitPrice: nullableNumberJson, taxAmount: nullableNumberJson, totalAmount: nullableNumberJson } } },
    warnings: { type: "array", maxItems: 50, items: { type: "string" } },
    fieldEvidence: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["field", "text", "page", "certainty"], properties: { field: { type: "string" }, text: nullableStringJson, page: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] }, certainty: { type: "string", enum: ["high", "medium", "low"] } } } },
  },
} as const
