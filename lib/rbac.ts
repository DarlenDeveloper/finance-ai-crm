export const SUPER_ADMIN_UID = "Vv8hNHNb11TIlHTkkhmgBW6us502"
export const ORGANIZATION_WORKSPACE_ID = `ws_${SUPER_ADMIN_UID}`
export const ORGANIZATION_NAME = "Mercury Computers Limited"

export const WORKSPACE_ROLES = ["super_admin", "admin", "developer", "user"] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]
export type AssignableRole = Exclude<WorkspaceRole, "super_admin">

export const MEMBER_STATUSES = ["pending", "active", "disabled"] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export const PAGE_IDS = [
  "overview",
  "invoices",
  "review",
  "analytics",
  "sales-performance",
  "follow-ups",
  "contacts",
  "integrations",
  "settings",
  "access-management",
  "system-logs",
] as const
export type PageId = (typeof PAGE_IDS)[number]

export type PageDefinition = {
  id: PageId
  label: string
  href: string | null
  description: string
  navigation: "primary" | "secondary" | "hidden"
  superAdminOnly?: boolean
  // Pages an admin may open (in addition to the super admin) even though they are
  // not part of the normal per-page assignment grid.
  adminManaged?: boolean
  comingSoon?: boolean
}

export const PAGE_DEFINITIONS: readonly PageDefinition[] = [
  { id: "overview", label: "Overview", href: "/", description: "Dashboard metrics and recent activity", navigation: "primary" },
  { id: "invoices", label: "Invoices", href: "/invoices", description: "Invoice records, uploads, and payments", navigation: "primary" },
  { id: "review", label: "AI Review", href: "/review", description: "Review and approve extracted invoices", navigation: "primary" },
  { id: "analytics", label: "Analytics", href: "/analytics", description: "Financial and invoice analytics", navigation: "primary" },
  { id: "sales-performance", label: "Sales Performance", href: "/sales-performance", description: "Sales-team performance reports", navigation: "primary" },
  { id: "follow-ups", label: "Follow-ups", href: "/follow-ups", description: "Customer payment follow-ups", navigation: "primary" },
  { id: "contacts", label: "Contacts", href: "/contacts", description: "Customer and sales-team contacts", navigation: "primary" },
  { id: "integrations", label: "Integrations", href: "/integrations", description: "Connected delivery and accounting services", navigation: "primary" },
  { id: "settings", label: "Settings", href: "/settings", description: "Organisation and application settings", navigation: "secondary" },
  { id: "access-management", label: "Access Management", href: "/settings/access", description: "Approve users and manage roles", navigation: "secondary", adminManaged: true },
  { id: "system-logs", label: "System Logs", href: null, description: "Security and system activity logs", navigation: "hidden", superAdminOnly: true, comingSoon: true },
] as const

export const ASSIGNABLE_PAGES = PAGE_DEFINITIONS.filter((page) => !page.superAdminOnly && !page.adminManaged && !page.comingSoon)

export const DEFAULT_PAGE_ACCESS: Record<AssignableRole, PageId[]> = {
  admin: ASSIGNABLE_PAGES.map((page) => page.id),
  developer: ["overview", "invoices", "review", "analytics", "contacts", "integrations", "settings"],
  user: ["overview", "invoices", "analytics", "follow-ups", "contacts"],
}

export type WorkspaceMember = {
  uid: string
  email: string
  displayName: string
  role: WorkspaceRole | null
  status: MemberStatus
  pageAccess: PageId[]
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value)
}

export function isMemberStatus(value: unknown): value is MemberStatus {
  return typeof value === "string" && (MEMBER_STATUSES as readonly string[]).includes(value)
}

export function validPageAccess(value: unknown): PageId[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is PageId => typeof item === "string" && (PAGE_IDS as readonly string[]).includes(item)))]
}

export function isSuperAdmin(member: Pick<WorkspaceMember, "uid" | "role" | "status"> | null | undefined) {
  return member?.uid === SUPER_ADMIN_UID && member.role === "super_admin" && member.status === "active"
}

export function isAdmin(member: Pick<WorkspaceMember, "role" | "status"> | null | undefined) {
  return member?.status === "active" && member.role === "admin"
}

// Super admin and workspace admins can open the access-management console.
export function canManageAccess(member: Pick<WorkspaceMember, "uid" | "role" | "status"> | null | undefined) {
  return isSuperAdmin(member) || isAdmin(member)
}

// The roles an actor is allowed to assign to other members. The super admin can
// grant any assignable role (including admin); a plain admin can only manage
// developer and user accounts and therefore can only assign those two roles.
export function assignableRolesFor(actor: Pick<WorkspaceMember, "uid" | "role" | "status"> | null | undefined): AssignableRole[] {
  if (isSuperAdmin(actor)) return ["admin", "developer", "user"]
  if (isAdmin(actor)) return ["developer", "user"]
  return []
}

// Whether `actor` may create/modify the membership of `target`.
// - The fixed super admin account can never be managed by anyone.
// - The super admin can manage every other member.
// - An admin can manage only pending accounts and existing developer/user
//   accounts; admins cannot manage other admins or the super admin, and cannot
//   promote anyone to admin (enforced together with assignableRolesFor).
export function canManageMember(
  actor: Pick<WorkspaceMember, "uid" | "role" | "status"> | null | undefined,
  target: Pick<WorkspaceMember, "uid" | "role"> | null | undefined,
): boolean {
  if (!target || target.uid === SUPER_ADMIN_UID) return false
  if (isSuperAdmin(actor)) return true
  if (isAdmin(actor)) {
    if (actor?.uid === target.uid) return false
    return target.role === null || target.role === "developer" || target.role === "user"
  }
  return false
}

export function canOperate(member: Pick<WorkspaceMember, "role" | "status"> | null | undefined) {
  return member?.status === "active" && (member.role === "super_admin" || member.role === "admin" || member.role === "developer")
}

export function canAccessPage(member: WorkspaceMember | null | undefined, pageId: PageId) {
  if (!member || member.status !== "active" || !member.role) return false
  if (isSuperAdmin(member)) return true
  const page = PAGE_DEFINITIONS.find((entry) => entry.id === pageId)
  if (!page || page.superAdminOnly || page.comingSoon) return false
  // Admin-managed pages (e.g. access management) are open to admins without an
  // explicit per-page grant; everyone else needs the page in their assignment.
  if (page.adminManaged) return isAdmin(member)
  return member.pageAccess.includes(pageId)
}

export function pageForPathname(pathname: string): PageId | null {
  if (pathname === "/") return "overview"
  if (pathname === "/settings/access" || pathname.startsWith("/settings/access/")) return "access-management"
  if (pathname === "/review" || pathname.startsWith("/review/")) return "review"
  if (pathname === "/vendors" || pathname.startsWith("/vendors/")) return "contacts"
  const page = PAGE_DEFINITIONS.find((entry) => entry.href && entry.href !== "/" && (pathname === entry.href || pathname.startsWith(`${entry.href}/`)))
  return page?.id ?? null
}

export function firstAccessiblePage(member: WorkspaceMember | null | undefined) {
  return PAGE_DEFINITIONS.find((page) => page.href && !page.comingSoon && canAccessPage(member, page.id)) ?? null
}

export function displayRole(role: WorkspaceRole | null) {
  if (!role) return "Awaiting role assignment"
  return ({ super_admin: "Super admin", admin: "Admin", developer: "Developer", user: "User" } as const)[role]
}
