// ─── Admin maintenance ───────────────────────────────────────────────────────
// Idempotent data-repair tools for the Admin Portal's Platform Health panel.
// Every repair RE-DERIVES its values from the authoritative records (never
// client-supplied numbers), so running it is always safe and repeatable.

import { mutation } from "../_generated/server";
import { requireAdmin } from "../auth/authorization";

/**
 * Recount every driver profile's lifetime trip total from the deliveries
 * table. totalTrips went un-counted before completion stats were wired into
 * completeDelivery, so profiles could under-report versus their real
 * settlement history. This recomputes from actual DELIVERED deliveries —
 * derived from real records, never fabricated.
 */
export const recalculateDriverLifetimeStats = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const profiles = await ctx.db.query("driver_profiles").collect();
    let updated = 0;
    for (const profile of profiles) {
      const delivered = await ctx.db
        .query("deliveries")
        .withIndex("by_courier_status", (q) =>
          q.eq("courierId", profile.userId).eq("status", "delivered")
        )
        .collect();
      const trips = delivered.length;
      if (trips !== profile.totalTrips) {
        await ctx.db.patch(profile._id, { totalTrips: trips });
        updated++;
      }
    }
    return { profiles: profiles.length, updated };
  },
});
