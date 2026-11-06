// ─── Admin: account inventory + staff lifecycle ──────────────────────────────
// Every login known to the deployment, plus the staff provisioning surface.
// This is the "guest list": who exists, which realm/role they belong to, which
// sign-in provider they use, and whether staff access is active, awaiting
// ZITADEL, or suspended.
//
// Admin-only (`admin:access`), and every write additionally requires
// `staff:manage`. The inventory deliberately does not expose password hashes
// or provider account IDs.
//
// ZITADEL remains the identity provider. Creating a staff record here does NOT
// create a ZITADEL user; the account stays in "Awaiting ZITADEL" until an
// identity with the same verified email signs in and links.
//
// Deployment: these lifecycle mutations target the Development deployment
// (incredible-warbler-335), not the separate production deployment.

import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { hasPermission, requireAdmin } from "../auth/authorization";
import {
  AUTH_REALMS,
  PERMISSIONS,
  ROLES,
  effectiveRoleForUser,
  isStaffRole,
  realmForRole,
  schemaRoleValidator,
  type AuthRealm,
  type Role,
} from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";
import {
  assignableStaffRolesFor,
  canActOnStaffAccount,
  canChangeStaffRole,
  canGrantStaffRole,
  canReactivateStaffAccount,
  canSuspendStaffAccount,
  findUserWithNormalizedEmail,
  normalizeStaffEmail,
  validateStaffEmail,
  validateStaffName,
  wouldRemoveLastSuperAdmin,
} from "./staffPolicy";

const MAX_USERS = 1_000;
const MAX_AUTH_ACCOUNTS = 2_000;
const MAX_SUSPENSION_REASON = 300;

type InventoryRole = Role | "unassigned";

function sortRank(realm: AuthRealm, role: InventoryRole): number {
  const realmRank =
    realm === AUTH_REALMS.STAFF ? 0 : realm === AUTH_REALMS.DRIVER ? 1 : 2;
  const roleRank =
    role === "unassigned" ? 9 : role === ROLES.SUPER_ADMIN ? 0 : 1;
  return realmRank * 10 + roleRank;
}

async function countActiveSuperAdmins(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const superAdmins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", ROLES.SUPER_ADMIN))
    .collect();
  return superAdmins.filter(
    (user) => user.testElevated !== true && user.staffSuspendedAt === undefined,
  ).length;
}

async function requireStaffManager(ctx: MutationCtx) {
  const admin = await requireAdmin(ctx);
  if (!hasPermission(admin.role, PERMISSIONS.STAFF_MANAGE)) {
    throw new Error("Access denied: staff management required");
  }
  return admin;
}

export const getAccountInventory = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    const users = await ctx.db.query("users").take(MAX_USERS);
    const authAccounts = await ctx.db.query("authAccounts").take(MAX_AUTH_ACCOUNTS);

    const providersByUser = new Map<string, string[]>();
    for (const account of authAccounts) {
      const providers = providersByUser.get(account.userId) ?? [];
      if (!providers.includes(account.provider)) providers.push(account.provider);
      providersByUser.set(account.userId, providers);
    }

    const activeSuperAdminCount = users.filter(
      (user) =>
        user.role === ROLES.SUPER_ADMIN &&
        user.testElevated !== true &&
        user.staffSuspendedAt === undefined,
    ).length;

    const canManageStaff = hasPermission(admin.role, PERMISSIONS.STAFF_MANAGE);
    const assignableRoles = assignableStaffRolesFor(admin.role);

    const countsByRealm: Record<string, number> = {
      [AUTH_REALMS.CUSTOMER]: 0,
      [AUTH_REALMS.DRIVER]: 0,
      [AUTH_REALMS.STAFF]: 0,
      unassigned: 0,
    };
    const countsByRole: Record<string, number> = {};

    const rows = await Promise.all(
      users.map(async (user) => {
        const role: InventoryRole = (user.role as Role | undefined) ?? "unassigned";
        const realm = realmForRole(role === "unassigned" ? undefined : role);
        if (role === "unassigned") {
          countsByRealm.unassigned += 1;
        } else {
          countsByRealm[realm] += 1;
        }
        countsByRole[role] = (countsByRole[role] ?? 0) + 1;

        const business = user.businessId ? await ctx.db.get(user.businessId) : null;
        const providers = providersByUser.get(user._id) ?? [];
        const staff = role !== "unassigned" && isStaffRole(role);
        const suspended = user.staffSuspendedAt !== undefined;
        const isSelf = user._id === admin.userId;
        const lastActiveSuperAdmin =
          role === ROLES.SUPER_ADMIN && activeSuperAdminCount <= 1;
        const staffStatus: "not_staff" | "suspended" | "active" | "awaiting_sso" = !staff
          ? "not_staff"
          : suspended
            ? "suspended"
            : providers.includes("zitadel")
              ? "active"
              : "awaiting_sso";

        const canAct =
          staff &&
          canManageStaff &&
          canActOnStaffAccount(admin.userId, user._id, admin.role, role);
        const canChangeRole =
          canAct &&
          !lastActiveSuperAdmin &&
          assignableRoles.some((candidate) => candidate !== role);
        const canSuspend =
          canAct &&
          !suspended &&
          canSuspendStaffAccount(
            admin.userId,
            user._id,
            admin.role,
            role,
            activeSuperAdminCount,
          );
        const canReactivate =
          canAct &&
          suspended &&
          canReactivateStaffAccount(admin.userId, user._id, admin.role, role);

        return {
          userId: user._id,
          name: user.name ?? null,
          email: user.email ?? null,
          role,
          realm,
          businessId: user.businessId ?? null,
          businessName: business?.name ?? null,
          providers,
          isAnonymous: user.isAnonymous === true,
          emailVerified: user.emailVerificationTime !== undefined,
          createdAt: user._creationTime,
          staffSuspendedAt: user.staffSuspendedAt ?? null,
          staffStatus,
          isSelf,
          lastActiveSuperAdmin,
          canChangeRole,
          canSuspend,
          canReactivate,
          // Legacy marker from the retired test-access mechanism. These
          // accounts should be restored before staff migration.
          legacyTestElevated: user.testElevated === true,
          legacyPreviousRole: user.testPreviousRole ?? null,
        };
      }),
    );

    rows.sort(
      (a, b) =>
        sortRank(a.realm, a.role) - sortRank(b.realm, b.role) ||
        (a.email ?? "").localeCompare(b.email ?? ""),
    );

    return {
      generatedAt: Date.now(),
      truncated: users.length === MAX_USERS || authAccounts.length === MAX_AUTH_ACCOUNTS,
      total: rows.length,
      countsByRealm,
      countsByRole,
      activeSuperAdmins: activeSuperAdminCount,
      suspendedStaff: rows.filter((row) => row.staffStatus === "suspended").length,
      viewerId: admin.userId,
      viewerRole: admin.role,
      canManageStaff,
      assignableRoles,
      legacyTestElevated: rows.filter((row) => row.legacyTestElevated).length,
      staffMissingVerifiedEmail: rows.filter(
        (row) =>
          row.realm === AUTH_REALMS.STAFF &&
          row.email !== null &&
          !row.emailVerified,
      ).length,
      accounts: rows,
    };
  },
});

// ─── Staff lifecycle writes ──────────────────────────────────────────────────

/**
 * Create Lasha staff authorization for an existing person.
 *
 * This writes only the Convex `users` record. It does not create a ZITADEL
 * identity, set a password, or send an invitation. The new account remains
 * "Awaiting ZITADEL" until a ZITADEL user with the same verified email signs in.
 */
export const createStaffAccount = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    role: schemaRoleValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireStaffManager(ctx);

    const nameError = validateStaffName(args.name);
    if (nameError) throw new Error(nameError);
    const emailError = validateStaffEmail(args.email);
    if (emailError) throw new Error(emailError);

    const email = normalizeStaffEmail(args.email);
    if (!canGrantStaffRole(admin.role, args.role)) {
      throw new Error("Your role cannot grant that staff role");
    }

    // Exact index lookup catches a match beyond the inventory scan cap; the
    // normalised scan catches stored casing/whitespace variants.
    const exactDuplicate = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const existing =
      exactDuplicate ??
      findUserWithNormalizedEmail(
        await ctx.db.query("users").take(MAX_USERS),
        email,
      );
    if (existing) {
      throw new Error(
        "An account with this email already exists. Use a different work email; this screen does not convert customer or driver accounts.",
      );
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: args.name.trim(),
      email,
      // The admin is asserting this is the person's work address. ZITADEL
      // still has to prove `email_verified` before the OAuth link succeeds.
      emailVerificationTime: now,
      isAnonymous: false,
      role: args.role,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: admin.userId,
      actorRole: admin.role,
      category: "user",
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: "users",
      entityId: userId,
      after: JSON.stringify({
        name: args.name.trim(),
        email,
        role: args.role,
        emailVerified: true,
        staffStatus: "awaiting_sso",
      }),
      metadata:
        "Staff access created from Admin → Accounts; ZITADEL identity not created",
    });

    return { userId, email, role: args.role };
  },
});

/**
 * Change an existing staff account's role within the caller's ceiling.
 * Self-edits, admin-tier grants above the caller, and demoting the last active
 * super admin are rejected server-side.
 */
export const changeStaffRole = mutation({
  args: {
    userId: v.id("users"),
    role: schemaRoleValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireStaffManager(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Account not found");
    if (target.testElevated === true) {
      throw new Error("Restore this account's legacy test elevation before changing its role");
    }

    const currentRole = target.role;
    if (!currentRole || !isStaffRole(currentRole)) {
      throw new Error("Only staff accounts can be managed here");
    }
    if (currentRole === args.role) {
      return { userId: target._id, role: currentRole, changed: false };
    }
    if (target._id === admin.userId) {
      throw new Error("You cannot change your own staff role");
    }
    if (
      !canChangeStaffRole(
        admin.userId,
        target._id,
        admin.role,
        currentRole,
        args.role,
      )
    ) {
      throw new Error("That role change exceeds your staff-management ceiling");
    }

    const activeSuperAdminCount = await countActiveSuperAdmins(ctx);
    if (
      wouldRemoveLastSuperAdmin(currentRole, args.role, activeSuperAdminCount)
    ) {
      throw new Error("At least one active super admin must remain");
    }

    await ctx.db.patch(target._id, { role: args.role });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: admin.userId,
      actorRole: admin.role,
      category: "user",
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      entityType: "users",
      entityId: target._id,
      before: JSON.stringify({ role: currentRole }),
      after: JSON.stringify({ role: args.role }),
      metadata: `Staff role changed from ${currentRole} to ${args.role}`,
    });

    return { userId: target._id, role: args.role, changed: true };
  },
});

/**
 * Suspend staff access without deleting the account or touching ZITADEL.
 * Suspension is checked at the authorization boundary, so an existing session
 * stops working immediately.
 */
export const suspendStaffAccount = mutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireStaffManager(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Account not found");
    if (target.testElevated === true) {
      throw new Error("Restore this account's legacy test elevation before suspending it");
    }

    const role = target.role;
    if (!role || !isStaffRole(role)) {
      throw new Error("Only staff accounts can be suspended here");
    }
    if (target.staffSuspendedAt !== undefined) {
      return { userId: target._id, suspendedAt: target.staffSuspendedAt, changed: false };
    }
    if (target._id === admin.userId) {
      throw new Error("You cannot suspend your own account");
    }

    const reason = args.reason?.trim();
    if (reason && reason.length > MAX_SUSPENSION_REASON) {
      throw new Error(`Suspension reason must be ${MAX_SUSPENSION_REASON} characters or fewer`);
    }

    const activeSuperAdminCount = await countActiveSuperAdmins(ctx);
    if (
      !canSuspendStaffAccount(
        admin.userId,
        target._id,
        admin.role,
        role,
        activeSuperAdminCount,
      )
    ) {
      if (wouldRemoveLastSuperAdmin(role, null, activeSuperAdminCount)) {
        throw new Error("At least one active super admin must remain");
      }
      throw new Error("That account exceeds your staff-management ceiling");
    }

    const suspendedAt = Date.now();
    await ctx.db.patch(target._id, { staffSuspendedAt: suspendedAt });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: admin.userId,
      actorRole: admin.role,
      category: "user",
      action: AUDIT_ACTIONS.USER_DEACTIVATED,
      entityType: "users",
      entityId: target._id,
      before: JSON.stringify({ staffSuspendedAt: null }),
      after: JSON.stringify({ staffSuspendedAt: suspendedAt }),
      metadata: reason
        ? `Staff access suspended: ${reason}`
        : "Staff access suspended",
    });

    return { userId: target._id, suspendedAt, changed: true };
  },
});

/** Reactivate a suspended staff account. The ZITADEL identity is untouched. */
export const reactivateStaffAccount = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await requireStaffManager(ctx);

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Account not found");
    if (target.testElevated === true) {
      throw new Error("Restore this account's legacy test elevation before reactivating it");
    }

    const role = target.role;
    if (!role || !isStaffRole(role)) {
      throw new Error("Only staff accounts can be reactivated here");
    }
    if (target.staffSuspendedAt === undefined) {
      return { userId: target._id, changed: false };
    }
    if (
      !canReactivateStaffAccount(
        admin.userId,
        target._id,
        admin.role,
        role,
      )
    ) {
      throw new Error("That account exceeds your staff-management ceiling");
    }

    await ctx.db.patch(target._id, { staffSuspendedAt: undefined });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: admin.userId,
      actorRole: admin.role,
      category: "user",
      action: AUDIT_ACTIONS.USER_REACTIVATED,
      entityType: "users",
      entityId: target._id,
      before: JSON.stringify({ staffSuspendedAt: target.staffSuspendedAt }),
      after: JSON.stringify({ staffSuspendedAt: null }),
      metadata: "Staff access reactivated",
    });

    return { userId: target._id, changed: true };
  },
});

// ─── Legacy migration helpers ───────────────────────────────────────────────

/**
 * Restore any account left marked by the retired test-access mechanism.
 *
 * This is intentionally explicit and Admin-only. It only touches records where
 * `testElevated === true`; it cannot demote a genuinely staffed account. If a
 * previous role was not recorded (the old test flow allowed a roleless account
 * to elevate), the account is returned to the customer default.
 */
export const restoreLegacyTestElevations = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(MAX_USERS);

    let restored = 0;
    for (const user of users) {
      if (user.testElevated !== true) continue;

      const previousRole = user.testPreviousRole ?? ROLES.CUSTOMER;
      const before = JSON.stringify({
        role: user.role ?? null,
        testElevated: true,
        testPreviousRole: user.testPreviousRole ?? null,
      });

      await ctx.db.patch(user._id, {
        role: previousRole,
        testElevated: undefined,
        testPreviousRole: undefined,
      });
      restored += 1;

      await ctx.runMutation(internal.audit.service.recordGenericEvent, {
        actorId: admin.userId,
        actorRole: admin.role,
        category: "user",
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        entityType: "users",
        entityId: user._id,
        before,
        after: JSON.stringify({
          role: previousRole,
          testElevated: false,
          testPreviousRole: null,
        }),
        metadata: "Retired test-access elevation restored to previous role",
      });
    }

    return { scanned: users.length, restored };
  },
});

/**
 * Prepare existing staff accounts for ZITADEL email linking.
 *
 * Convex Auth only links an OAuth identity to an existing user when the
 * existing user's email is marked verified. Password-era staff records may
 * predate that marker. This marks only unique staff emails; it never touches
 * customers or drivers, and it refuses ambiguous duplicate addresses. The
 * subsequent ZITADEL login still has to prove `email_verified` and pass the
 * staff-realm guard in auth.ts.
 */
export const prepareStaffSsoLinking = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(MAX_USERS);

    let prepared = 0;
    let alreadyVerified = 0;
    let skippedNoEmail = 0;
    let skippedDuplicateEmail = 0;

    for (const user of users) {
      if (!isStaffRole(effectiveRoleForUser(user))) continue;

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        skippedNoEmail += 1;
        continue;
      }
      if (user.emailVerificationTime !== undefined) {
        alreadyVerified += 1;
        continue;
      }

      const matchingEmail = users.filter(
        (candidate) => candidate.email?.trim().toLowerCase() === email,
      );
      if (matchingEmail.length !== 1) {
        skippedDuplicateEmail += 1;
        continue;
      }

      const verifiedAt = Date.now();
      await ctx.db.patch(user._id, { emailVerificationTime: verifiedAt });
      prepared += 1;

      await ctx.runMutation(internal.audit.service.recordGenericEvent, {
        actorId: admin.userId,
        actorRole: admin.role,
        category: "user",
        action: AUDIT_ACTIONS.USER_UPDATED,
        entityType: "users",
        entityId: user._id,
        before: JSON.stringify({ emailVerified: false }),
        after: JSON.stringify({ emailVerified: true }),
        metadata: "Staff email prepared for ZITADEL SSO linking",
      });
    }

    return {
      scanned: users.length,
      prepared,
      alreadyVerified,
      skippedNoEmail,
      skippedDuplicateEmail,
    };
  },
});
