// ─── Dev Seed-Account Provisioning ───────────────────────────────────────────
// Dev tooling for the light data pass (scripts/light-seed.ts).
//
// Real sign-ups arrive roleless (roles are server-assigned, never client
// input). The seeding pass therefore needs a server-side way to pin the
// intended role on the accounts it just created. This mutation is tightly
// scoped so it can never touch production accounts:
//
//  - The caller may ONLY modify their OWN account (session-derived user).
//  - The account's email MUST match the seeding pass's reserved pattern
//    (@seed.lasha.test). Real accounts are structurally unreachable.
//  - The role MUST be one of the two non-staff roles the pass creates
//    (customer | driver) — no staff elevation through this path.
//
// Every call is audit-logged with category "user".

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { ROLES } from "../schema";

const SEED_EMAIL_PATTERN = /^[a-z0-9.]+\.[a-z0-9]+@seed\.lasha\.test$/;

export const provisionSeedAccountRole = mutation({
  args: {
    role: v.union(v.literal(ROLES.CUSTOMER), v.literal(ROLES.DRIVER)),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Reserved-pattern gate: only seeding-pass accounts are touchable.
    if (!user.email || !SEED_EMAIL_PATTERN.test(user.email)) {
      throw new Error(
        "Role provisioning is restricted to the seeding pass's reserved accounts",
      );
    }

    if (user.role === args.role) {
      return { success: true, alreadySet: true };
    }

    await ctx.db.patch(userId, { role: args.role });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: user.role ?? "none",
      category: "user",
      action: "user.seed_role_provisioned",
      entityType: "users",
      entityId: userId,
      before: JSON.stringify({ role: user.role ?? null }),
      after: JSON.stringify({ role: args.role }),
      metadata: "Light data pass: seed account role provisioning",
    });

    return { success: true, alreadySet: false };
  },
});
