import { z } from "zod"

const nullableString = z.string().nullable()
const nullableNumber = z.number().finite().nullable()

const partySchema = z.object({
  name: nullableString,
  taxId: nullableString,
  address: nullableString,
  email: nullableString,
  phone: nullableString,
})

export const extractionSchema = z.object({
  documentType: z.enum(["invoice", "credit_note", "receipt", "other"]),
  language: nullableString,
  // The issuer/seller is the party that raised the invoice ("us" for
  // outgoing invoices). The customer/buyer is the party being billed.
  // These are modelled separately so the issuer is never confused with the
  // customer. `vendor` is retained for backward compatibility and mirrors the
  // issuer/seller.
  vendor: partySchema,
  issuer: partySchema,
  customer: partySchema,
  // Free-text label of the person/role that handled the invoice on the
  // issuer's side (e.g. a salesperson name or a role like "Sales").
  invoiceHandlerName: nullableString,
  invoiceNumber: nullableString,
  invoiceDate: nullableString,
  dueDate: nullableString,
  purchaseOrderNumber: nullableString,
  currency: nullableString,
  subtotal: nullableNumber,
  taxAmount: nullableNumber,
  totalAmount: nullableNumber,
  // True when the printed unit prices / line totals already include tax and
  // the printed grand total is the customer-payable amount. When true the
  // total must NOT be recomputed as subtotal + tax again.
  amountsTaxInclusive: z.boolean().nullable(),
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
const nullableBooleanJson = { anyOf: [{ type: "boolean" }, { type: "null" }] } as const
const partyJson = {
  type: "object",
  additionalProperties: false,
  required: ["name", "taxId", "address", "email", "phone"],
  properties: { name: nullableStringJson, taxId: nullableStringJson, address: nullableStringJson, email: nullableStringJson, phone: nullableStringJson },
} as const

export const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "language", "vendor", "issuer", "customer", "invoiceHandlerName", "invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "currency", "subtotal", "taxAmount", "totalAmount", "amountsTaxInclusive", "paymentTerms", "bankAccount", "lineItems", "warnings", "fieldEvidence"],
  properties: {
    documentType: { type: "string", enum: ["invoice", "credit_note", "receipt", "other"] },
    language: nullableStringJson,
    vendor: partyJson,
    issuer: partyJson,
    customer: partyJson,
    invoiceHandlerName: nullableStringJson,
    invoiceNumber: nullableStringJson,
    invoiceDate: nullableStringJson,
    dueDate: nullableStringJson,
    purchaseOrderNumber: nullableStringJson,
    currency: nullableStringJson,
    subtotal: nullableNumberJson,
    taxAmount: nullableNumberJson,
    totalAmount: nullableNumberJson,
    amountsTaxInclusive: nullableBooleanJson,
    paymentTerms: nullableStringJson,
    bankAccount: nullableStringJson,
    lineItems: { type: "array", items: { type: "object", additionalProperties: false, required: ["description", "quantity", "unitPrice", "taxAmount", "totalAmount"], properties: { description: nullableStringJson, quantity: nullableNumberJson, unitPrice: nullableNumberJson, taxAmount: nullableNumberJson, totalAmount: nullableNumberJson } } },
    warnings: { type: "array", items: { type: "string" } },
    fieldEvidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "text", "page", "certainty"], properties: { field: { type: "string" }, text: nullableStringJson, page: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] }, certainty: { type: "string", enum: ["high", "medium", "low"] } } } },
  },
} as const
