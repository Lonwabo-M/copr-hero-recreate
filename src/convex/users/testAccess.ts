import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth, isTestAccessAccount } from "../auth/authorization";
import { ROLES } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";

// ─── Test access ─────────────────────────────────────────────────────────────
// Temporary, explicitly-marked elevation into any staffed application area
// (Driver App / Operations Centre) for end-to-end testing from the Customer
// Portal, plus the return path back out.
//
// Safety model:
//  - claim only elevates users who are NOT already staff for that area, and
//    stamps `testElevated: true` + `testPreviousRole` so release can restore
//    exactly where the user was.
//  - release only lowers roles where testElevated === true — it can therefore
//    never demote a genuinely-staffed user, even if pressed by someone else.
//  - release target defaults to the customer portal (the common test loop);
//    releasing "to another area" simply re-claims against that area instead.
//  - both paths audit-log the change (category "user").

function elevatedRoleForArea(area: "driver" | "operations" | "admin"): string {
  switch (area) {
    case "driver":
      return ROLES.DRIVER;
    case "operations":
      return ROLES.OPERATIONS;
    case "admin":
      return ROLES.SUPER_ADMIN;
  }
}

export const claimTestAreaAccess = mutation({
  args: {
    // Defaults to the operations centre — the original access point — so the
    // existing call sites remain valid.
    area: v.optional(v.union(v.literal("driver"), v.literal("operations"), v.literal("admin"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // SECURITY: this mutation writes a staff role onto the caller's own user
    // record. Without this gate any self-registered account could call it and
    // become super_admin. Only operator-allowlisted test accounts pass.
    if (!isTestAccessAccount(user.email)) {
      throw new Error("Access denied: test access is not enabled for this account");
    }

    const area = args.area ?? "operations";
    const elevatedRole = elevatedRoleForArea(area);

    // No-op only when the caller already holds the exact role the target area
    // is enforced with. A supervisory walk-in (e.g. super_admin → Driver App)
    // is admitted by the frontend area rule but does NOT hold the target role,
    // so every driver-scoped query would throw ("Only drivers can access this
    // query"). Those walk-ins therefore receive the same marked, reversible
    // elevation: testPreviousRole preserves their real role and release can
    // never demote a genuinely-staffed account (it only lowers records where
    // testElevated === true).
    if (user.role === elevatedRole) {
      return { success: true, alreadyElevated: true };
    }

    // Remember the pre-test role only on first elevation so chained claims
    // (driver → operations) never overwrite the original.
    const previousRole =
      user.testElevated === true ? (user.testPreviousRole ?? null) : (user.role ?? null);

    await ctx.db.patch(userId, {
      role: elevatedRole as typeof user.role,
      testElevated: true,
      testPreviousRole: (previousRole ?? undefined) as typeof user.testPreviousRole,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (previousRole as string) ?? "none",
      category: "user",
      action: "user.test_access_granted",
      entityType: "users",
      entityId: userId,
      before: JSON.stringify({ role: previousRole ?? null, testElevated: false }),
      after: JSON.stringify({ role: elevatedRole, testElevated: true, area }),
      metadata: `Testing access point (customer portal → ${area})`,
    });

    return { success: true, alreadyElevated: false };
  },
});

export const releaseTestAreaAccess = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Guard: only test-elevated accounts may be released. A real staff member
    // can never be demoted here.
    if (user.testElevated !== true) {
      return { success: true, released: false };
    }

    const restoreRole = user.testPreviousRole ?? ROLES.CUSTOMER;
    const before = JSON.stringify({ role: user.role ?? null, testElevated: true });
    await ctx.db.patch(userId, {
      role: restoreRole as typeof user.role,
      testElevated: undefined,
      testPreviousRole: undefined,
    });
    const after = JSON.stringify({ role: restoreRole, testElevated: false });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (user.role as string) ?? "none",
      category: "user",
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: "users",
      entityId: userId,
      before,
      after,
      metadata: "Test area access released",
    });

    return { success: true, released: true };
  },
});

// Whether the current user is currently test-elevated (drives the shell's
// "release test access" affordance).
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

// Back-compat aliases — the original operations-only access point names.
export const claimTestOperationsAccess = claimTestAreaAccess;
export const releaseTestOperationsAccess = releaseTestAreaAccess;
