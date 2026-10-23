// ─── Development Table Counts ────────────────────────────────────────────────
// Lightweight read-only query used to verify data-seeding passes and diagnose
// empty deployments. Returns row counts for the tables a seeded demo dataset
// is expected to populate.
//
// Access: staff only (operations / super_admin). This is deployment telemetry
// — an unauthenticated caller must not be able to read platform volumes or
// force a full-table scan. Scans are bounded so a large deployment cannot turn
// a diagnostic read into an expensive query.

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentAuthUser } from "../auth/authorization";
import { ROLES } from "../schema";

const COUNTED_TABLES = [
  "users",
  "businesses",
  "addresses",
  "orders",
  "deliveries",
  "vehicles",
  "driver_applications",
  "driver_profiles",
  "dispatch_offers",
  "tracking_events",
  "proof_of_delivery",
  "audit_events",
] as const;

/** Upper bound per table — counts saturate here instead of scanning everything. */
const MAX_COUNTED_ROWS = 5000;

export const getTableCounts = query({
  args: {},
  returns: v.record(v.string(), v.number()),
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    if (user.role !== ROLES.OPERATIONS && user.role !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: operations only");
    }

    const counts: Record<string, number> = {};
    for (const table of COUNTED_TABLES) {
      counts[table] = (await ctx.db.query(table).take(MAX_COUNTED_ROWS)).length;
    }
    return counts;
  },
});
