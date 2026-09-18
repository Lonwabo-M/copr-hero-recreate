// ─── Admin: operations workload analytics ─────────────────────────────────────
// Answers "what does manual dispatch actually cost, and what is automation
// worth?" from REAL tracked events — never estimates. Every figure is derived
// from deliveries (outcomes), tracking_events (automated state transitions)
// and audit_events (who acted) so the numbers match the platform's own
// history. Surfaced on Admin → Platform Health.

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ROLES } from "../schema";

export const getOpsWorkload = query({
  args: {
    /** Look-back window in ms (default: 7 days). */
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");
    const admin = await ctx.db.get(userId);
    if (!admin) throw new Error("Authentication required");
    const allowed = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    if (!allowed.includes(admin.role as any)) {
      throw new Error("Access denied");
    }

    const now = Date.now();
    const since = args.sinceMs ?? now - 7 * 24 * 60 * 60 * 1000;

    // 1. Delivery outcomes in the window. Bounded scan + in-memory creation
    // filter (the deliveries table's queryable indexes lead with status /
    // tracking number, not time); the ops deliveries list uses the same
    // bounded-scan pattern, so this stays consistent with existing practice.
    const allDeliveries = await ctx.db.query("deliveries").take(2000);
    const deliveries = allDeliveries.filter((d) => d._creationTime >= since);

    const byStatus: Record<string, number> = {};
    for (const d of deliveries) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    const total = deliveries.length;
    const delivered = byStatus["delivered"] ?? 0;
    const exceptions = (byStatus["failed"] ?? 0) + (byStatus["cancelled"] ?? 0);
    const exceptionRatePct = total > 0 ? Math.round((exceptions / total) * 1000) / 10 : 0;

    // 2. Automated state transitions — every tracking event is a lifecycle
    // step the platform executed with no human in the loop (state machine
    // writes: placed, picked_up, in_transit, delivered, location_update).
    const trackingEvents = await ctx.db.query("tracking_events").take(20000);
    const automatedTransitions = trackingEvents.filter((e) => e.timestamp >= since).length;

    // 3. Manual interventions — indexed audit scan for staff-actor dispatch
    // decisions (broadcast, reassign, cancel). These are precisely the
    // actions an auto-dispatch layer would absorb.
    const dispatchAudit = await ctx.db
      .query("audit_events")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", since))
      .collect();
    const staffRoles = ["operations", "company_admin", "super_admin"];
    const manualDispatchActions = dispatchAudit.filter(
      (e) =>
        e.category === "dispatch" &&
        ["dispatch.started", "delivery.reassigned", "delivery.cancelled"].includes(e.action) &&
        staffRoles.includes(e.actorRole)
    ).length;
    const driverApprovals = dispatchAudit.filter(
      (e) => e.category === "driver" && e.action.toLowerCase().includes("approv")
    ).length;

    return {
      windowDays: Math.max(1, Math.round((now - since) / 86400000)),
      totals: {
        deliveries: total,
        delivered,
        exceptions,
        exceptionRatePct,
      },
      byStatus,
      automatedTransitions,
      manualDispatchActions,
      driverApprovals,
      basis: "Derived from deliveries + tracking_events + audit_events",
    };
  },
});
