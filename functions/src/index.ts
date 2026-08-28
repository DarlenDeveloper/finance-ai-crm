import { initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { defineSecret } from "firebase-functions/params"
import { logger } from "firebase-functions"
import { onDocumentUpdated } from "firebase-functions/v2/firestore"
import { HttpsError, onCall } from "firebase-functions/v2/https"
import { z } from "zod"
import { extractInvoice } from "./extract.js"
import { findDuplicates } from "./duplicates.js"
import { changedFields as computeChangedFields, normalize, validate } from "./normalization.js"
import type { Extraction } from "./schema.js"

initializeApp()

const geminiApiKey = defineSecret("GEMINI_API_KEY")
const geminiModel = "gemini-3.1-pro-preview"
const supportedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"])
const maxBytes = 20 * 1024 * 1024

export const processInvoice = onDocumentUpdated({
  document: "workspaces/{workspaceId}/invoices/{invoiceId}",
  region: "us-central1",
  memory: "1GiB",
  timeoutSeconds: 540,
  concurrency: 2,
  maxInstances: 5,
  retry: false,
  serviceAccount: "ledger-ai-functions@ledger-ai-d1931.iam.gserviceaccount.com",
  secrets: [geminiApiKey],
}, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!after || before?.status === "uploaded" || after.status !== "uploaded") return

  const invoiceRef = event.data!.after.ref
  const eventRef = invoiceRef.collection("events").doc()
  const db = getFirestore()

  const claimed = await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(invoiceRef)
    if (latest.data()?.status !== "uploaded") return false
    transaction.update(invoiceRef, {
      status: "processing",
      "ai.startedAt": FieldValue.serverTimestamp(),
      "ai.completedAt": null,
      "ai.errorCode": null,
      "ai.errorMessage": null,
      "ai.attemptCount": FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.set(eventRef, { type: "extraction_started", actorType: "system", actorId: null, createdAt: FieldValue.serverTimestamp(), metadata: {} })
    return true
  })
  if (!claimed) return

  try {
    const storagePath = after.source?.storagePath as string | undefined
    const mimeType = after.source?.contentType as string | undefined
    if (!storagePath) throw coded("SOURCE_NOT_FOUND", "Invoice source path is missing")
    if (!mimeType || !supportedTypes.has(mimeType)) throw coded("UNSUPPORTED_DOCUMENT", "Document type is unsupported")

    const file = getStorage().bucket().file(storagePath)
    const [metadata] = await file.getMetadata()
    const size = Number(metadata.size || 0)
    if (!size || size > maxBytes) throw coded("DOCUMENT_TOO_LARGE", "Document exceeds the 20 MB limit")
    if (metadata.contentType && metadata.contentType !== mimeType) throw coded("UNSUPPORTED_DOCUMENT", "Stored content type does not match invoice metadata")

    const [bytes] = await file.download()
    const model = geminiModel
    const result = await extractInvoice(bytes, mimeType, geminiApiKey.value(), model)
    const warnings = validate(result.extraction)
    const normalized = normalize(result.extraction)
    const duplicateCheck = await findDuplicates(db, event.params.workspaceId, event.params.invoiceId, after.source?.sha256 ?? null, normalized)
    const completedEvent = invoiceRef.collection("events").doc()

    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(invoiceRef)
      if (latest.data()?.status !== "processing") throw coded("INVALID_INVOICE_STATE", "Processing state changed")
      transaction.update(invoiceRef, {
        status: "needs_review",
        extracted: result.extraction,
        normalized,
        duplicateCheck,
        "ai.provider": "google",
        "ai.model": model,
        "ai.schemaVersion": 1,
        "ai.promptVersion": 1,
        "ai.completedAt": FieldValue.serverTimestamp(),
        "ai.latencyMs": result.latencyMs,
        "ai.warnings": [...result.extraction.warnings, ...warnings],
        "ai.usage": result.usage,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(completedEvent, { type: "extraction_completed", actorType: "system", actorId: null, createdAt: FieldValue.serverTimestamp(), metadata: { model, latencyMs: result.latencyMs, warningCount: warnings.length, duplicateStatus: duplicateCheck.status } })
    })
    logger.info("Invoice extraction completed", { invoiceId: event.params.invoiceId, workspaceId: event.params.workspaceId, model, latencyMs: result.latencyMs, duplicateStatus: duplicateCheck.status, promptTokens: result.usage?.promptTokens ?? null, outputTokens: result.usage?.outputTokens ?? null })
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "EXTRACTION_FAILED"
    logger.error("Invoice extraction failed", { invoiceId: event.params.invoiceId, workspaceId: event.params.workspaceId, code, error })
    await invoiceRef.update({ status: "failed", "ai.completedAt": FieldValue.serverTimestamp(), "ai.errorCode": code, "ai.errorMessage": safeMessage(code), updatedAt: FieldValue.serverTimestamp() })
    await invoiceRef.collection("events").add({ type: "extraction_failed", actorType: "system", actorId: null, createdAt: FieldValue.serverTimestamp(), metadata: { code } })
  }
})

function coded(code: string, message: string) { return Object.assign(new Error(message), { code }) }
function safeMessage(code: string) {
  const messages: Record<string, string> = { SOURCE_NOT_FOUND: "Invoice source file was not found.", UNSUPPORTED_DOCUMENT: "Document format is unsupported.", DOCUMENT_TOO_LARGE: "Document exceeds the processing limit.", INVALID_INVOICE_STATE: "Invoice state changed during processing." }
  return messages[code] || "Invoice extraction failed. Retry from the review queue."
}

const isoDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use YYYY-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Date is not a valid calendar date.")
  .nullable()
const currencyField = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code.")
  .nullable()
const moneyField = z.object({ amount: z.number().finite().nullable(), currency: currencyField })

const normalizedInput = z
  .object({
    vendorId: z.string().nullable(),
    vendorName: z.string().trim().min(1).nullable(),
    invoiceNumber: z.string().trim().min(1).nullable(),
    invoiceDate: isoDateField,
    dueDate: isoDateField,
    subtotal: moneyField,
    tax: moneyField,
    total: moneyField,
  })
  .refine(
    (value) => !value.invoiceDate || !value.dueDate || value.dueDate >= value.invoiceDate,
    { message: "Due date cannot be earlier than the invoice date.", path: ["dueDate"] },
  )

const reviewInput = z.object({
  workspaceId: z.string().min(1),
  invoiceId: z.string().min(1),
  action: z.enum(["approve", "reject", "retry"]),
  // ISO timestamp of the invoice the reviewer was looking at; guards against
  // overwriting another reviewer's concurrent edit.
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  rejectionReason: z.enum(["not_an_invoice", "duplicate", "unreadable", "fraud_suspected", "wrong_workspace", "other"]).nullable().optional(),
  normalized: normalizedInput.optional(),
})

export const reviewInvoice = onCall({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 10,
  serviceAccount: "ledger-ai-functions@ledger-ai-d1931.iam.gserviceaccount.com",
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to review invoices.")
  const parsed = reviewInput.safeParse(request.data)
  if (!parsed.success) throw new HttpsError("invalid-argument", "Review data is invalid.")
  const { workspaceId, invoiceId, action, normalized, rejectionReason, expectedUpdatedAt } = parsed.data
  const db = getFirestore()
  const memberRef = db.doc(`workspaces/${workspaceId}/members/${request.auth.uid}`)
  const invoiceRef = db.doc(`workspaces/${workspaceId}/invoices/${invoiceId}`)
  const auditRef = invoiceRef.collection("events").doc()

  await db.runTransaction(async (transaction) => {
    const [member, invoice] = await Promise.all([transaction.get(memberRef), transaction.get(invoiceRef)])
    const role = member.data()?.role
    if (!member.exists || !["admin", "reviewer"].includes(role)) throw new HttpsError("permission-denied", "You cannot review invoices in this workspace.")
    if (!invoice.exists) throw new HttpsError("not-found", "Invoice was not found.")
    const data = invoice.data()!
    const status = data.status

    // Concurrency guard: reject stale edits when the record changed since load.
    if (expectedUpdatedAt) {
      const currentUpdatedAt = data.updatedAt?.toDate?.()?.toISOString?.() ?? null
      if (currentUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
        throw new HttpsError("aborted", "This invoice changed since you opened it. Reload and try again.")
      }
    }

    if (action === "retry") {
      if (status !== "failed") throw new HttpsError("failed-precondition", "Only failed invoices can be retried.")
      // Transition back to `uploaded` so the processInvoice trigger re-fires.
      transaction.update(invoiceRef, {
        status: "uploaded",
        "ai.errorCode": null,
        "ai.errorMessage": null,
        "ai.completedAt": null,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(auditRef, { type: "extraction_started", actorType: "user", actorId: request.auth!.uid, createdAt: FieldValue.serverTimestamp(), metadata: { retry: true } })
      return
    }

    if (status !== "needs_review") throw new HttpsError("failed-precondition", "Invoice is no longer awaiting review.")

    if (action === "approve") {
      if (!normalized) throw new HttpsError("invalid-argument", "Approved invoice values are required.")
      const before = data.normalized || {}
      const changedFields = computeChangedFields(before, normalized)
      transaction.update(invoiceRef, {
        status: "verified",
        normalized,
        review: { reviewedBy: request.auth!.uid, reviewedAt: FieldValue.serverTimestamp(), decision: "approved", changedFields, rejectionReason: null },
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(auditRef, { type: "review_approved", actorType: "user", actorId: request.auth!.uid, createdAt: FieldValue.serverTimestamp(), metadata: { changedFields } })
    } else {
      if (!rejectionReason) throw new HttpsError("invalid-argument", "A rejection reason is required.")
      transaction.update(invoiceRef, {
        status: "rejected",
        review: { reviewedBy: request.auth!.uid, reviewedAt: FieldValue.serverTimestamp(), decision: "rejected", changedFields: [], rejectionReason },
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.set(auditRef, { type: "review_rejected", actorType: "user", actorId: request.auth!.uid, createdAt: FieldValue.serverTimestamp(), metadata: { rejectionReason } })
    }
  })
  return { invoiceId, status: action === "approve" ? "verified" : action === "reject" ? "rejected" : "uploaded" }
})
