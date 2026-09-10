import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { getAuth } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { logger } from "firebase-functions"
import { defineSecret } from "firebase-functions/params"
import { onRequest, type Request } from "firebase-functions/v2/https"
import type { Response } from "express"

const clientIdSecret = defineSecret("GMAIL_OAUTH_CLIENT_ID")
const clientSecret = defineSecret("GMAIL_OAUTH_CLIENT_SECRET")
const stateSecret = defineSecret("GMAIL_OAUTH_STATE_SECRET")
const encryptionKeySecret = defineSecret("GMAIL_TOKEN_ENCRYPTION_KEY")
const secrets = [clientIdSecret, clientSecret, stateSecret, encryptionKeySecret]

const scopes = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/gmail.send"]
const stateCookie = "mercury_gmail_oauth_nonce"
const pkceCookie = "mercury_gmail_oauth_pkce"
const stateLifetimeSeconds = 10 * 60
const allowedOrigins = new Set(["https://crm-companion.mercurycomputerslimited.com", "http://localhost:3000"])
const functionOptions = {
  region: "us-central1",
  memory: "256MiB" as const,
  timeoutSeconds: 60,
  maxInstances: 10,
  serviceAccount: "ledger-ai-functions@ledger-ai-d1931.iam.gserviceaccount.com",
  secrets,
}

type Role = "admin" | "reviewer" | "viewer"
type OAuthState = { workspaceId: string; userId: string; nonce: string; exp: number }
type EncryptedToken = { algorithm: "A256GCM"; keyVersion: 1; iv: string; ciphertext: string; tag: string }
type GoogleTokenResponse = { access_token?: string; refresh_token?: string; scope?: string; error?: string; error_description?: string }
type GoogleUser = { sub: string; email: string; name?: string; picture?: string }

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

function config() {
  const clientId = clientIdSecret.value().trim()
  const oauthClientSecret = clientSecret.value().trim()
  const signingSecret = stateSecret.value().trim()
  const encodedKey = encryptionKeySecret.value().trim()
  if (!clientId || !oauthClientSecret || !signingSecret || !encodedKey) throw new HttpError(503, "GMAIL_NOT_CONFIGURED", "Gmail OAuth secrets are not configured.")
  const encryptionKey = Buffer.from(encodedKey, "base64")
  if (encryptionKey.length !== 32) throw new HttpError(503, "GMAIL_NOT_CONFIGURED", "Gmail token encryption key is invalid.")
  return { clientId, clientSecret: oauthClientSecret, stateSecret: signingSecret, encryptionKey }
}

function requestOrigin(request: Request) {
  const host = (request.get("x-forwarded-host") || request.get("host") || "").split(",")[0].trim()
  const protocol = (request.get("x-forwarded-proto") || request.protocol || "https").split(",")[0].trim()
  const origin = `${protocol}://${host}`
  if (!allowedOrigins.has(origin)) throw new HttpError(400, "INVALID_ORIGIN", "Request origin is not registered for Gmail OAuth.")
  return origin
}

function callbackUri(request: Request) {
  return `${requestOrigin(request)}/api/integrations/gmail/callback`
}

function cookieMap(request: Request) {
  const result = new Map<string, string>()
  for (const part of (request.get("cookie") || "").split(";")) {
    const separator = part.indexOf("=")
    if (separator > 0) result.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()))
  }
  return result
}

function cookie(name: string, value: string, secure: boolean, maxAge = stateLifetimeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
}

function clearOAuthCookies(request: Request) {
  const secure = requestOrigin(request).startsWith("https://")
  return [cookie(stateCookie, "", secure, 0), cookie(pkceCookie, "", secure, 0)]
}

function base64url(value: Buffer | string) { return Buffer.from(value).toString("base64url") }

function createState(workspaceId: string, userId: string, nonce: string) {
  const payload: OAuthState = { workspaceId, userId, nonce, exp: Math.floor(Date.now() / 1000) + stateLifetimeSeconds }
  const encoded = base64url(JSON.stringify(payload))
  const signature = createHmac("sha256", config().stateSecret).update(encoded).digest("base64url")
  return `${encoded}.${signature}`
}

function verifyState(value: string) {
  const [encoded, signature, ...extra] = value.split(".")
  if (!encoded || !signature || extra.length) throw new Error("Invalid OAuth state")
  const expected = createHmac("sha256", config().stateSecret).update(encoded).digest()
  const supplied = Buffer.from(signature, "base64url")
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid OAuth state signature")
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<OAuthState>
  if (!parsed.workspaceId || !parsed.userId || !parsed.nonce || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) throw new Error("Invalid or expired OAuth state")
  return parsed as OAuthState
}

function createPkce() {
  const verifier = randomBytes(48).toString("base64url")
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }
}

function authorizationUrl(state: string, challenge: string, redirectUri: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({ client_id: config().clientId, redirect_uri: redirectUri, response_type: "code", scope: scopes.join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, code_challenge: challenge, code_challenge_method: "S256" }).toString()
  return url.toString()
}

async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config().clientId, client_secret: config().clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }) })
  const body = await response.json() as GoogleTokenResponse
  if (!response.ok || body.error || !body.access_token) throw new Error(body.error_description || body.error || "Google token exchange failed")
  return body
}

async function googleUser(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } })
  const body = await response.json() as Partial<GoogleUser>
  if (!response.ok || !body.sub || !body.email) throw new Error("Could not identify the connected Google account")
  return body as GoogleUser
}

function encryptToken(value: string): EncryptedToken {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", config().encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return { algorithm: "A256GCM", keyVersion: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") }
}

function decryptToken(value: EncryptedToken) {
  if (value.algorithm !== "A256GCM" || value.keyVersion !== 1) throw new Error("Unsupported token encryption")
  const decipher = createDecipheriv("aes-256-gcm", config().encryptionKey, Buffer.from(value.iv, "base64"))
  decipher.setAuthTag(Buffer.from(value.tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8")
}

async function workspaceUser(request: Request, workspaceId: string, roles: Role[]) {
  const authorization = request.get("authorization") || ""
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required.")
  let user
  try { user = await getAuth().verifyIdToken(authorization.slice(7)) } catch { throw new HttpError(401, "AUTH_REQUIRED", "Authentication session is invalid or expired.") }
  const member = await getFirestore().doc(`workspaces/${workspaceId}/members/${user.uid}`).get()
  const role = member.data()?.role as Role | undefined
  if (!member.exists || !role || !roles.includes(role)) throw new HttpError(403, "WORKSPACE_FORBIDDEN", "You do not have permission for this workspace.")
  return { user, role }
}

function workspaceIdFrom(value: unknown) {
  const workspaceId = typeof value === "string" ? value : ""
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) throw new HttpError(400, "INVALID_WORKSPACE", "A valid workspace is required.")
  return workspaceId
}

function fail(response: Response, error: unknown) {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }
  logger.error("Gmail integration request failed", { error: error instanceof Error ? error.message : "Unknown error" })
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } })
}

function callbackRedirect(request: Request, response: Response, result: "connected" | "denied" | "error") {
  response.setHeader("Set-Cookie", clearOAuthCookies(request))
  response.setHeader("Cache-Control", "no-store")
  response.redirect(302, `${requestOrigin(request)}/integrations?gmail=${result}`)
}

export const gmailOAuthStart = onRequest(functionOptions, async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } })
    return
  }
  try {
    const workspaceId = workspaceIdFrom(request.body?.workspaceId)
    const { user } = await workspaceUser(request, workspaceId, ["admin"])
    config()
    const nonce = randomBytes(32).toString("base64url")
    const pkce = createPkce()
    const state = createState(workspaceId, user.uid, nonce)
    const secure = requestOrigin(request).startsWith("https://")
    response.setHeader("Set-Cookie", [cookie(stateCookie, nonce, secure), cookie(pkceCookie, pkce.verifier, secure)])
    response.setHeader("Cache-Control", "no-store")
    response.json({ authorizationUrl: authorizationUrl(state, pkce.challenge, callbackUri(request)) })
  } catch (error) { fail(response, error) }
})

export const gmailOAuthCallback = onRequest(functionOptions, async (request, response) => {
  if (request.method !== "GET") {
    response.status(405).send("GET is required.")
    return
  }
  const providerError = typeof request.query.error === "string" ? request.query.error : ""
  if (providerError) {
    callbackRedirect(request, response, providerError === "access_denied" ? "denied" : "error")
    return
  }
  try {
    const code = typeof request.query.code === "string" ? request.query.code : ""
    const stateValue = typeof request.query.state === "string" ? request.query.state : ""
    const cookies = cookieMap(request)
    const nonce = cookies.get(stateCookie) || ""
    const verifier = cookies.get(pkceCookie) || ""
    if (!code || !stateValue || !nonce || !verifier) throw new Error("Incomplete OAuth callback")
    const state = verifyState(stateValue)
    if (state.nonce !== nonce) throw new Error("OAuth state cookie mismatch")
    const member = await getFirestore().doc(`workspaces/${state.workspaceId}/members/${state.userId}`).get()
    if (!member.exists || member.data()?.role !== "admin") throw new Error("Workspace admin access is required")
    const token = await exchangeCode(code, verifier, callbackUri(request))
    if (!token.refresh_token) throw new Error("Google did not return an offline refresh token")
    if (!new Set((token.scope || "").split(/\s+/)).has("https://www.googleapis.com/auth/gmail.send")) throw new Error("Gmail send permission was not granted")
    const identity = await googleUser(token.access_token!)
    const ref = getFirestore().doc(`workspaces/${state.workspaceId}/integrations/gmail`)
    const existing = await ref.get()
    const now = FieldValue.serverTimestamp()
    await ref.set({ provider: "gmail", status: "connected", accountId: identity.sub, accountEmail: identity.email, accountName: identity.name || null, accountPicture: identity.picture || null, scopes, token: encryptToken(token.refresh_token), connectedBy: state.userId, connectedAt: now, updatedAt: now, createdAt: existing.data()?.createdAt || now }, { merge: true })
    await ref.collection("events").add({ type: existing.exists ? "gmail_reconnected" : "gmail_connected", actorId: state.userId, createdAt: FieldValue.serverTimestamp(), metadata: { accountEmail: identity.email } })
    callbackRedirect(request, response, "connected")
  } catch (error) {
    logger.error("Gmail OAuth callback failed", { error: error instanceof Error ? error.message : "Unknown error" })
    callbackRedirect(request, response, "error")
  }
})

export const gmailOAuthStatus = onRequest(functionOptions, async (request, response) => {
  if (request.method !== "GET") {
    response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "GET is required." } })
    return
  }
  try {
    const workspaceId = workspaceIdFrom(request.query.workspaceId)
    await workspaceUser(request, workspaceId, ["admin", "reviewer", "viewer"])
    config()
    const snapshot = await getFirestore().doc(`workspaces/${workspaceId}/integrations/gmail`).get()
    const data = snapshot.data()
    const connected = snapshot.exists && data?.status === "connected"
    const date = data?.connectedAt?.toDate?.()
    response.setHeader("Cache-Control", "no-store")
    response.json({ configured: true, connected, account: connected ? { email: typeof data?.accountEmail === "string" ? data.accountEmail : null, name: typeof data?.accountName === "string" ? data.accountName : null, picture: typeof data?.accountPicture === "string" ? data.accountPicture : null, connectedAt: date instanceof Date ? date.toISOString() : null } : null })
  } catch (error) { fail(response, error) }
})

export const gmailOAuthDisconnect = onRequest(functionOptions, async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } })
    return
  }
  try {
    const workspaceId = workspaceIdFrom(request.body?.workspaceId)
    const { user } = await workspaceUser(request, workspaceId, ["admin"])
    const ref = getFirestore().doc(`workspaces/${workspaceId}/integrations/gmail`)
    const snapshot = await ref.get()
    if (!snapshot.exists || snapshot.data()?.status !== "connected") {
      response.json({ connected: false, revoked: true })
      return
    }
    let revoked = false
    const encrypted = snapshot.data()?.token as EncryptedToken | undefined
    if (encrypted) {
      try {
        const revoke = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptToken(encrypted) }) })
        revoked = revoke.ok
      } catch (error) { logger.warn("Google revocation failed; local Gmail credential will still be removed", { error: error instanceof Error ? error.message : "Unknown error" }) }
    }
    const batch = getFirestore().batch()
    batch.set(ref, { status: "disconnected", token: FieldValue.delete(), disconnectedBy: user.uid, disconnectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    batch.set(ref.collection("events").doc(), { type: "gmail_disconnected", actorId: user.uid, createdAt: FieldValue.serverTimestamp(), metadata: { googleRevoked: revoked } })
    await batch.commit()
    response.setHeader("Cache-Control", "no-store")
    response.json({ connected: false, revoked })
  } catch (error) { fail(response, error) }
})
