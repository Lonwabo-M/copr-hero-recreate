// ─── Admin: account inventory ─────────────────────────────────────────────────
// Read-only inventory of every login known to the deployment. This is the
// Phase 0 "guest list": who exists, which realm/role they belong to, which
// sign-in provider they use, and which accounts are unassigned or still carry
// a legacy test-elevation marker.
//
// Admin-only (`admin:access`), not staff-wide. The inventory deliberately does
// not expose password hashes or provider account IDs.

import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAdmin } from "../auth/authorization";
import {
  AUTH_REALMS,
  ROLES,
  effectiveRoleForUser,
  isStaffRole,
  realmForRole,
  type AuthRealm,
  type Role,
} from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";

const MAX_USERS = 1_000;
const MAX_AUTH_ACCOUNTS = 2_000;

type InventoryRole = Role | "unassigned";

function sortRank(realm: AuthRealm, role: InventoryRole): number {
  const realmRank =
    realm === AUTH_REALMS.STAFF ? 0 : realm === AUTH_REALMS.DRIVER ? 1 : 2;
  const roleRank =
    role === "unassigned" ? 9 : role === ROLES.SUPER_ADMIN ? 0 : 1;
  return realmRank * 10 + roleRank;
}

export const getAccountInventory = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").take(MAX_USERS);
    const authAccounts = await ctx.db.query("authAccounts").take(MAX_AUTH_ACCOUNTS);

    const providersByUser = new Map<string, string[]>();
    for (const account of authAccounts) {
      const providers = providersByUser.get(account.userId) ?? [];
      if (!providers.includes(account.provider)) providers.push(account.provider);
      providersByUser.set(account.userId, providers);
    }

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

        return {
          userId: user._id,
          name: user.name ?? null,
          email: user.email ?? null,
          role,
          realm,
          businessId: user.businessId ?? null,
          businessName: business?.name ?? null,
          providers: providersByUser.get(user._id) ?? [],
          isAnonymous: user.isAnonymous === true,
          emailVerified: user.emailVerificationTime !== undefined,
          createdAt: user._creationTime,
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
