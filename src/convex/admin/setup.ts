import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  PERMISSIONS,
  ROLES,
  effectiveRoleForUser,
  isUserSuspended,
} from "../schema";
import { hasPermission } from "../auth/authorization";

// ─── First administrator bootstrap ────────────────────────────────────────────
// A deployment with no staff administrator cannot use the staff portal: every
// staff entry point requires an existing staff record, and creating that record
// requires an administrator. This module provides the one operator step that
// breaks the loop:
//
//   1. An authenticated account claims the first administrator.
//   2. The claim is allowed only while no active administrator exists.
//   3. The new administrator can then add the real staff emails under
//      Admin → Accounts and use ZITADEL for subsequent sign-ins.
//
// The check is server-side and is re-read inside the mutation, so a second
// caller cannot also claim the account after the first one succeeds.

async function hasActiveAdmin(ctx: QueryCtx | MutationCtx): Promise<boolean> {
  for (const role of [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN] as const) {
    const candidates = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .collect();

    if (
      candidates.some((candidate) => {
        if (isUserSuspended(candidate)) return false;
        const effectiveRole = effectiveRoleForUser(candidate);
        return (
          effectiveRole === role &&
          hasPermission(effectiveRole, PERMISSIONS.ADMIN_ACCESS)
        );
      })
    ) {
      return true;
    }
  }

  return false;
}

/** Public setup status: no names, emails, or counts are exposed. */
export const getSetupStatus = query({
  args: {},
  handler: async (ctx) => {
    return { needsSetup: !(await hasActiveAdmin(ctx)) };
  },
});

/**
 * Promote the signed-in account to the first super administrator.
 *
 * This is intentionally limited to a deployment with no active administrator.
 * It is not a general role-elevation endpoint: once an administrator exists,
 * every call fails and staff changes must go through Admin → Accounts.
 */
export const claimFirstAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in before setting up the first administrator.");
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("The signed-in account no longer exists.");
    }
    if (user.isAnonymous) {
      throw new Error(
        "Use a password or ZITADEL account to set up the first administrator.",
      );
    }
    if (isUserSuspended(user)) {
      throw new Error("This account is suspended and cannot claim administrator.");
    }
    if (await hasActiveAdmin(ctx)) {
      throw new Error(
        "An administrator already exists. Sign in through the staff portal.",
      );
    }

    const previousRole = effectiveRoleForUser(user) ?? null;

    await ctx.db.patch(userId, {
      role: ROLES.SUPER_ADMIN,
      emailVerificationTime: user.emailVerificationTime ?? Date.now(),
      testElevated: false,
      testPreviousRole: undefined,
      staffSuspendedAt: undefined,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: ROLES.SUPER_ADMIN,
      category: "admin",
      action: "admin.first_admin_claimed",
      entityType: "user",
      entityId: userId,
      before: JSON.stringify({ role: previousRole }),
      after: JSON.stringify({ role: ROLES.SUPER_ADMIN }),
      metadata: JSON.stringify({ bootstrap: true }),
    });

    return { userId, role: ROLES.SUPER_ADMIN };
  },
});

