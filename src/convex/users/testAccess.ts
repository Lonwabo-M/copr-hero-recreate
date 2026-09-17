import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authorization";
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

const STAFF_ROLES: string[] = [
  ROLES.DRIVER,
  ROLES.OPERATIONS,
  ROLES.FLEET_MANAGER,
  ROLES.COMPANY_ADMIN,
  ROLES.SUPER_ADMIN,
];

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

    const area = args.area ?? "operations";
    const elevatedRole = elevatedRoleForArea(area);

    // Staff check scoped to the target area's roles (and supersets: admins can
    // reach ops+driver anyway, ops can reach driver).
    const isRealStaff =
      (user.role !== undefined && STAFF_ROLES.includes(user.role)) &&
      // If already elevated into some area, further claims just switch area.
      user.testElevated !== true;

    if (isRealStaff) {
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
