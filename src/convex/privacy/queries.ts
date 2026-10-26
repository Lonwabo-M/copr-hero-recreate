/**
 * POPIA read models.
 *
 * - getMyConsents / getMyPrivacyRequests power the self-service privacy
 *   centre for the signed-in person.
 * - listPrivacyRequests / getPrivacyRequestStats are the staff queue used by
 *   the Admin Portal and the DSAR runbook. They are role-gated to Operations
 *   and Super Admin; a company admin can never see another business's requests.
 *
 * Consent history is returned as current state only (latest decision per
 * purpose). The full append-only log stays in the database as evidence.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentAuthUser } from "../auth/authorization";
import { ROLES } from "../schema";
import { CONSENT_PURPOSES, PRIVACY_POLICY_VERSION } from "./policy";

const statusValidator = v.union(
  v.literal("received"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("refused"),
);

async function requirePrivacyStaff(ctx: Parameters<typeof getCurrentAuthUser>[0]) {
  const user = await getCurrentAuthUser(ctx);
  if (!user) throw new Error("Authentication required");
  const allowed: string[] = [ROLES.OPERATIONS, ROLES.SUPER_ADMIN];
  if (!allowed.includes(user.role)) throw new Error("Access denied");
  return user;
}

export const getMyConsents = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await getCurrentAuthUser(ctx);
    if (!authUser) return null;

    const rows = await ctx.db
      .query("consent_records")
      .withIndex("by_user", (q) => q.eq("userId", authUser.userId))
      .order("desc")
      .take(200);

    const latest = new Map<string, { granted: boolean; createdAt: number }>();
    for (const row of rows) {
      if (!latest.has(row.purpose)) {
        latest.set(row.purpose, { granted: row.granted, createdAt: row.createdAt });
      }
    }

    return {
      policyVersion: PRIVACY_POLICY_VERSION,
      consents: CONSENT_PURPOSES.map((purpose) => ({
        purpose,
        granted: latest.get(purpose)?.granted ?? false,
        decidedAt: latest.get(purpose)?.createdAt ?? null,
      })),
    };
  },
});

export const getMyPrivacyRequests = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await getCurrentAuthUser(ctx);
    if (!authUser) return [];
    return await ctx.db
      .query("privacy_requests")
      .withIndex("by_user", (q) => q.eq("userId", authUser.userId))
      .order("desc")
      .take(25);
  },
});

/** Staff queue: the minimum needed to work a request, no extras. */
export const listPrivacyRequests = query({
  args: {
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePrivacyStaff(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    const now = Date.now();

    const rows = args.status
      ? await ctx.db
          .query("privacy_requests")
          .withIndex("by_status", (q) =>
            q.eq("status", args.status as "received" | "in_progress" | "completed" | "refused"),
          )
          .take(limit)
      : await ctx.db
          .query("privacy_requests")
          .withIndex("by_submitted")
          .order("desc")
          .take(limit);

    return rows
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .map((request) => ({
        _id: request._id,
        reference: request.reference,
        type: request.type,
        name: request.name,
        email: request.email,
        phone: request.phone ?? null,
        details: request.details,
        status: request.status,
        submittedAt: request.submittedAt,
        dueAt: request.dueAt,
        overdue:
          (request.status === "received" || request.status === "in_progress") &&
          request.dueAt < now,
        resolutionNote: request.resolutionNote ?? null,
      }));
  },
});

export const getPrivacyRequestStats = query({
  args: {},
  handler: async (ctx) => {
    await requirePrivacyStaff(ctx);
    const rows = await ctx.db.query("privacy_requests").take(1000);
    const now = Date.now();
    const open = rows.filter(
      (request) => request.status === "received" || request.status === "in_progress",
    );
    return {
      total: rows.length,
      open: open.length,
      overdue: open.filter((request) => request.dueAt < now).length,
      completed: rows.filter((request) => request.status === "completed").length,
      refused: rows.filter((request) => request.status === "refused").length,
    };
  },
});
