import "server-only"

import { adminAuth, adminDb } from "@/lib/firebase/admin"

export type WorkspaceRole = "admin" | "reviewer" | "viewer"

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export async function requireUser(request: Request) {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.")

  try {
    return await adminAuth.verifyIdToken(header.slice(7))
  } catch {
    throw new ApiError(401, "AUTH_REQUIRED", "The authentication session is invalid or expired.")
  }
}

export async function requireWorkspaceRole(request: Request, workspaceId: string, roles: WorkspaceRole[]) {
  const user = await requireUser(request)
  const member = await adminDb.doc(`workspaces/${workspaceId}/members/${user.uid}`).get()
  const role = member.data()?.role as WorkspaceRole | undefined
  if (!member.exists || !role || !roles.includes(role)) {
    throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You do not have permission for this workspace.")
  }
  return { user, role }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status })
  }
  console.error("Unhandled API error", error)
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } }, { status: 500 })
}
