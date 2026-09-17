import test from "node:test"
import assert from "node:assert/strict"
import {
  PAGE_IDS,
  SUPER_ADMIN_UID,
  assignableRolesFor,
  canAccessPage,
  canManageAccess,
  canManageMember,
  canOperate,
  isAdmin,
  pageForPathname,
} from "../lib/rbac.ts"

const superAdmin = {
  uid: SUPER_ADMIN_UID,
  email: "super@example.com",
  displayName: "Super Admin",
  role: "super_admin",
  status: "active",
  pageAccess: [...PAGE_IDS],
}

const pendingUser = {
  uid: "pending-user",
  email: "pending@example.com",
  displayName: "Pending User",
  role: null,
  status: "pending",
  pageAccess: [],
}

const assignedUser = {
  uid: "assigned-user",
  email: "user@example.com",
  displayName: "Assigned User",
  role: "user",
  status: "active",
  pageAccess: ["overview", "contacts"],
}

const workspaceAdmin = {
  uid: "admin-user",
  email: "admin@example.com",
  displayName: "Workspace Admin",
  role: "admin",
  status: "active",
  pageAccess: ["overview", "invoices"],
}

const anotherAdmin = {
  uid: "admin-two",
  email: "admin2@example.com",
  displayName: "Second Admin",
  role: "admin",
  status: "active",
  pageAccess: ["overview"],
}

test("the fixed super admin can manage access and open every registered page", () => {
  assert.equal(canManageAccess(superAdmin), true)
  for (const pageId of PAGE_IDS) assert.equal(canAccessPage(superAdmin, pageId), true)
})

test("a pending account cannot operate or open pages", () => {
  assert.equal(canOperate(pendingUser), false)
  assert.equal(canAccessPage(pendingUser, "overview"), false)
})

test("an active user can open only explicitly assigned non-privileged pages", () => {
  assert.equal(canAccessPage(assignedUser, "overview"), true)
  assert.equal(canAccessPage(assignedUser, "contacts"), true)
  assert.equal(canAccessPage(assignedUser, "invoices"), false)
  assert.equal(canAccessPage(assignedUser, "access-management"), false)
  assert.equal(canAccessPage(assignedUser, "system-logs"), false)
})

test("active admins and developers are operational while normal and disabled users are not", () => {
  assert.equal(canOperate({ role: "admin", status: "active" }), true)
  assert.equal(canOperate({ role: "developer", status: "active" }), true)
  assert.equal(canOperate({ role: "user", status: "active" }), false)
  assert.equal(canOperate({ role: "developer", status: "disabled" }), false)
})

test("nested and legacy routes map to the correct permission", () => {
  assert.equal(pageForPathname("/"), "overview")
  assert.equal(pageForPathname("/review/invoice?id=1"), "review")
  assert.equal(pageForPathname("/settings/access"), "access-management")
  assert.equal(pageForPathname("/settings"), "settings")
  assert.equal(pageForPathname("/vendors"), "contacts")
})

test("workspace admins can open the access-management console but not super-admin-only pages", () => {
  assert.equal(isAdmin(workspaceAdmin), true)
  assert.equal(canManageAccess(workspaceAdmin), true)
  assert.equal(canAccessPage(workspaceAdmin, "access-management"), true)
  assert.equal(canAccessPage(workspaceAdmin, "system-logs"), false)
  // access-management is not part of the per-page grant, yet a plain user without it is denied
  assert.equal(canAccessPage(assignedUser, "access-management"), false)
})

test("only the super admin and admins can manage access", () => {
  assert.equal(canManageAccess(superAdmin), true)
  assert.equal(canManageAccess(workspaceAdmin), true)
  assert.equal(canManageAccess(assignedUser), false)
  assert.equal(canManageAccess(pendingUser), false)
})

test("the super admin can assign any assignable role; an admin only developer/user", () => {
  assert.deepEqual(assignableRolesFor(superAdmin), ["admin", "developer", "user"])
  assert.deepEqual(assignableRolesFor(workspaceAdmin), ["developer", "user"])
  assert.deepEqual(assignableRolesFor(assignedUser), [])
  assert.deepEqual(assignableRolesFor(pendingUser), [])
})

test("the super admin can manage anyone except being managed away, admins only non-privileged targets", () => {
  // Super admin manages regular members and admins, but the fixed super admin is never a target.
  assert.equal(canManageMember(superAdmin, assignedUser), true)
  assert.equal(canManageMember(superAdmin, workspaceAdmin), true)
  assert.equal(canManageMember(superAdmin, superAdmin), false)

  // Admin manages pending and developer/user accounts.
  assert.equal(canManageMember(workspaceAdmin, pendingUser), true)
  assert.equal(canManageMember(workspaceAdmin, assignedUser), true)

  // Admin cannot manage other admins, the super admin, or themselves.
  assert.equal(canManageMember(workspaceAdmin, anotherAdmin), false)
  assert.equal(canManageMember(workspaceAdmin, superAdmin), false)
  assert.equal(canManageMember(workspaceAdmin, workspaceAdmin), false)

  // Non-managers cannot manage anyone.
  assert.equal(canManageMember(assignedUser, pendingUser), false)
})
