import { z } from "zod"

export const certaintySchema = z.enum(["high", "medium", "low"])
export const moneySchema = z.object({
  amount: z.number().nullable(),
  currency: z.string().length(3).nullable(),
})

export const partySchema = z.object({
  name: z.string().nullable(),
  taxId: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
})

export const lineItemSchema = z.object({
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  taxAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
})

export const fieldEvidenceSchema = z.object({
  field: z.string(),
  text: z.string().nullable(),
  page: z.number().int().positive().nullable(),
  certainty: certaintySchema,
})

export const geminiInvoiceExtractionSchema = z.object({
  documentType: z.enum(["invoice", "credit_note", "receipt", "other"]),
  language: z.string().nullable(),
  // Issuer/seller ("us") and customer/buyer are modelled separately. `vendor`
  // is retained for backward compatibility and mirrors the issuer.
  vendor: partySchema,
  issuer: partySchema,
  customer: partySchema,
  invoiceHandlerName: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  purchaseOrderNumber: z.string().nullable(),
  currency: z.string().nullable(),
  subtotal: z.number().nullable(),
  taxAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  amountsTaxInclusive: z.boolean().nullable(),
  paymentTerms: z.string().nullable(),
  bankAccount: z.string().nullable(),
  lineItems: z.array(lineItemSchema).max(500),
  warnings: z.array(z.string()).max(50),
  fieldEvidence: z.array(fieldEvidenceSchema).max(100),
})

export type GeminiInvoiceExtraction = z.infer<typeof geminiInvoiceExtractionSchema>

export const normalizedInvoiceSchema = z.object({
  vendorId: z.string().nullable(),
  vendorName: z.string().min(1).nullable(),
  issuerName: z.string().min(1).nullable(),
  customerId: z.string().nullable(),
  customerName: z.string().min(1).nullable(),
  customerTaxId: z.string().min(1).nullable(),
  customerEmail: z.string().min(1).nullable(),
  customerPhone: z.string().min(1).nullable(),
  handlerContactId: z.string().nullable(),
  handlerName: z.string().min(1).nullable(),
  handlerEmail: z.string().min(1).nullable(),
  handlerPhone: z.string().min(1).nullable(),
  invoiceNumber: z.string().min(1).nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  amountsTaxInclusive: z.boolean().nullable(),
  subtotal: moneySchema,
  tax: moneySchema,
  total: moneySchema,
})

export type NormalizedInvoice = z.infer<typeof normalizedInvoiceSchema>
