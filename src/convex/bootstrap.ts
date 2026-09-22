// ─── One-time Platform Bootstrap ──────────────────────────────────────────────
// Self-gating seeding pass for freshly provisioned / migrated deployments.
//
// Purpose: a brand-new Convex deployment starts with an empty database — no
// users, no auth accounts, no pricing rules. The public sign-up flow exists,
// but the platform's seeded demonstration accounts (the "Dev quick sign-in"
// buttons on /auth) would not exist, so nobody could reach the staffed areas
// that the whole product demo depends on (Operations Centre, Admin approvals,
// Driver App).
//
// Safety model (why this is safe to ship in the codebase):
//  - GATED: the mutation hard-returns unless the users table is EMPTY. On any
//    deployment that has even one user (i.e. every long-lived deployment and
//    the original platform deployment), this is a no-op read. It cannot merge,
//    overwrite, or duplicate anything.
//  - ONE-SHOT: success writes a platform_bootstrap marker and subsequent calls
//    short-circuit on it before doing any work.
//  - REPRODUCIBLE: it recreates exactly the same accounts the original
//    platform hosted (same emails, roles, display names, and password), so
//    the dev quick sign-in buttons and all demo flows behave identically
//    post-migration.
//
// This is the seeding equivalent of the lazy pricing-rules seed
// (seed/pricing.ts): operational setup that must not require a manual step on
// a new deployment.

import { Scrypt } from "lucia";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { AUDIT_ACTIONS } from "./audit/service";

const BOOTSTRAP_VERSION = 1;

/** The dev quick sign-in password (matches pages/Auth.tsx DEV_PASSWORD). */
const DEV_PASSWORD = "Lasha!Pump2026";

const SEED_ACCOUNTS = [
  {
    email: "agent.admin@lasha.test",
    name: "Platform Admin",
    role: ROLES.SUPER_ADMIN,
  },
  {
    email: "agent.ops@lasha.test",
    name: "Operations Agent",
    role: ROLES.OPERATIONS,
  },
  {
    email: "agent.driver1@lasha.test",
    name: "Thabo Mokoena",
    role: ROLES.DRIVER,
  },
  {
    email: "agent.customer1@lasha.test",
    name: "Cape Spaza Collective",
    role: ROLES.CUSTOMER,
  },
] as const;

/** Driver profile values for the seeded driver account. */
const SEED_DRIVER_PROFILE = {
  licenseClass: "C Code 10",
  rating: 4.8,
  totalTrips: 214,
  totalEarnings: 0,
  isAvailable: true,
};

export const seedPlatformBootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    // ── Gates ────────────────────────────────────────────────────────────────
    // 1. Already bootstrapped → no-op (cheap marker read).
    const marker = await ctx.db.query("platform_bootstrap").first();
    if (marker) {
      return { seeded: false as const, reason: "already-bootstrapped" as const };
    }

    // 2. Deployment not empty → never seed over real data (defence in depth;
    //    the marker above should always have caught this on our deployments).
    const anyUser = await ctx.db.query("users").first();
    if (anyUser) {
      return { seeded: false as const, reason: "users-exist" as const };
    }

    // ── Seed ─────────────────────────────────────────────────────────────────
    const scrypt = new Scrypt();
    const secret = await scrypt.hash(DEV_PASSWORD);
    const now = Date.now();
    const created: Array<{ email: string; role: string }> = [];
    let adminUserId: Id<"users"> | null = null;

    for (const account of SEED_ACCOUNTS) {
      const userId = await ctx.db.insert("users", {
        email: account.email,
        name: account.name,
        role: account.role,
        emailVerificationTime: now,
      });
      if (account.role === ROLES.SUPER_ADMIN) adminUserId = userId;
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: account.email,
        secret,
      });
      if (account.role === ROLES.DRIVER) {
        await ctx.db.insert("driver_profiles", {
          userId,
          licenseClass: SEED_DRIVER_PROFILE.licenseClass,
          rating: SEED_DRIVER_PROFILE.rating,
          totalTrips: SEED_DRIVER_PROFILE.totalTrips,
          totalEarnings: SEED_DRIVER_PROFILE.totalEarnings,
          isAvailable: SEED_DRIVER_PROFILE.isAvailable,
          createdAt: now,
        });
      }
      created.push({ email: account.email, role: account.role });
    }

    // Audit trail for the bootstrap itself, attributed to the admin account
    // it created (the audit service requires a concrete actor).
    if (adminUserId !== null) {
      await ctx.runMutation(internal.audit.service.recordGenericEvent, {
        actorId: adminUserId,
        actorRole: "system",
        category: "user",
        action: AUDIT_ACTIONS.USER_UPDATED,
        entityType: "users",
        entityId: adminUserId,
        before: undefined,
        after: JSON.stringify({ seeded: created }),
        metadata: "Platform bootstrap: seeded deployment accounts",
      });
    }

    await ctx.db.insert("platform_bootstrap", {
      seededAt: now,
      reason: "fresh-deployment",
      version: BOOTSTRAP_VERSION,
    });

    return {
      seeded: true as const,
      created,
    };
  },
});
