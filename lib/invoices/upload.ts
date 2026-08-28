"use client"

import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore"
import { ref, uploadBytesResumable } from "firebase/storage"
import { firebaseDb, firebaseStorage } from "@/lib/firebase"

const supportedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"])
const maxBytes = 20 * 1024 * 1024

export type UploadProgress = { transferred: number; total: number; percent: number }

export async function uploadInvoice(
  file: File,
  workspaceId: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void,
) {
  if (!firebaseDb || !firebaseStorage) throw new Error("Firebase is not configured.")
  if (!supportedTypes.has(file.type)) throw new Error("Use a PDF, JPEG, PNG, or WebP invoice.")
  if (!file.size || file.size > maxBytes) throw new Error("Invoice files must be smaller than 20 MB.")

  const invoiceId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "invoice"
  const storagePath = `workspaces/${workspaceId}/invoices/${invoiceId}/source/${safeName}`
  const invoiceRef = doc(firebaseDb, `workspaces/${workspaceId}/invoices/${invoiceId}`)

  const sha256 = await sha256Hex(file)

  await setDoc(invoiceRef, {
    workspaceId,
    status: "uploading",
    source: { storagePath, originalName: file.name, contentType: file.type, sizeBytes: file.size, sha256, pageCount: null },
    ai: { provider: "google", model: null, schemaVersion: 1, promptVersion: 1, startedAt: null, completedAt: null, latencyMs: null, attemptCount: 0, warnings: [], errorCode: null, errorMessage: null },
    createdAt: serverTimestamp(), createdBy: userId, updatedAt: serverTimestamp(),
  })

  try {
    const task = uploadBytesResumable(ref(firebaseStorage, storagePath), file, { contentType: file.type, customMetadata: { workspaceId, invoiceId, uploadedBy: userId } })
    await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => {
      onProgress?.({ transferred: snapshot.bytesTransferred, total: snapshot.totalBytes, percent: Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100) })
    }, reject, () => resolve()))
    await updateDoc(invoiceRef, { status: "uploaded", updatedAt: serverTimestamp() })
    return { invoiceId, workspaceId, storagePath }
  } catch (cause) {
    await updateDoc(invoiceRef, { status: "failed", "ai.errorCode": "UPLOAD_FAILED", "ai.errorMessage": "Invoice upload failed.", updatedAt: serverTimestamp() })
    throw cause
  }
}

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
