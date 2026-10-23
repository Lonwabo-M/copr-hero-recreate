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
//  - The caller MUST present the deployment's SEED_ACCESS_KEY. An email
//    pattern alone is satisfiable by anyone (sign-up accepts any address),
//    so it cannot be the only gate on a self-service role assignment.
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

/** Constant-time comparison so the seed key cannot be probed byte-by-byte. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export const provisionSeedAccountRole = mutation({
  args: {
    role: v.union(v.literal(ROLES.CUSTOMER), v.literal(ROLES.DRIVER)),
    // Shared secret configured on the deployment; the seeding script reads it
    // from its own environment. Absent on the deployment ⇒ path disabled.
    seedKey: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedKey = process.env.SEED_ACCESS_KEY;
    if (!expectedKey || expectedKey.length < 16) {
      throw new Error(
        "Seed role provisioning is disabled: set SEED_ACCESS_KEY (min 16 chars) on the deployment.",
      );
    }
    if (!safeEqual(args.seedKey, expectedKey)) {
      throw new Error("Access denied: invalid seed key");
    }

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
