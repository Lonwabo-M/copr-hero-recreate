import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authorization";
import { ROLES } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";

// ─── Test access ─────────────────────────────────────────────────────────────
// Temporary, explicitly-marked elevation to the Operations Centre for testing.
//
// Safety model:
//  - claimTestOperationsAccess only elevates users who are NOT already
//    operations/fleet/admin staff, and stamps `testElevated: true` so the
//    release mutation can distinguish a real staff account from a test one.
//  - releaseTestOperationsAccess only lowers roles where testElevated === true
//    — it can therefore never demote a genuinely-staffed operations user, even
//    if the release button is pressed by someone else.
//  - Both paths audit-log the change (category "user").

const ELEVATED_TEST_ROLE = ROLES.OPERATIONS;

export const claimTestOperationsAccess = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (
      user.role === ROLES.OPERATIONS ||
      user.role === ROLES.FLEET_MANAGER ||
      user.role === ROLES.COMPANY_ADMIN ||
      user.role === ROLES.SUPER_ADMIN
    ) {
      return { success: true, alreadyElevated: true };
    }

    // Remember the previous role (or its absence) so release restores exactly.
    const previousRole = user.role ?? null;

    await ctx.db.patch(userId, {
      role: ELEVATED_TEST_ROLE,
      testElevated: true,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (previousRole as string) ?? "none",
      category: "user",
      action: "user.test_access_granted",
      entityType: "users",
      entityId: userId,
      before: JSON.stringify({ role: previousRole ?? null, testElevated: false }),
      after: JSON.stringify({ role: ELEVATED_TEST_ROLE, testElevated: true }),
      metadata: "Testing access point (customer portal → operations centre)",
    });

    return { success: true, alreadyElevated: false };
  },
});

export const releaseTestOperationsAccess = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Guard: only test-elevated accounts may be released. A real operations
    // staff member (or any other non-test role) can never be demoted here.
    if (user.testElevated !== true) {
      return { success: true, released: false };
    }

    const before = JSON.stringify({ role: user.role ?? null, testElevated: true });
    await ctx.db.patch(userId, {
      role: ROLES.CUSTOMER,
      testElevated: undefined,
    });
    const after = JSON.stringify({ role: ROLES.CUSTOMER, testElevated: false });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (user.role as string) ?? "none",
      category: "user",
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: "users",
      entityId: userId,
      before,
      after,
      metadata: "Test operations access released",
    });

    return { success: true, released: true };
  },
});

// Whether the current user is currently test-elevated (drives the dashboard
// access card's "release" affordance).
export const getTestAccessState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { testElevated: false, role: null };
    const user = await ctx.db.get(userId);
    if (!user) return { testElevated: false, role: null };
    return {
      testElevated: user.testElevated === true,
      role: (user.role as string) ?? null,
    };
  },
});
