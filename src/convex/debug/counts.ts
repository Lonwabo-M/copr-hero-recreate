// ─── Development Table Counts ────────────────────────────────────────────────
// Lightweight read-only query used to verify data-seeding passes and diagnose
// empty deployments. Returns row counts for the tables a seeded demo dataset
// is expected to populate.
//
// NOTE: dev tooling only. It leaks no field values — just counts.

import { query } from "../_generated/server";
import { v } from "convex/values";

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

export const getTableCounts = query({
  args: {},
  returns: v.record(v.string(), v.number()),
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of COUNTED_TABLES) {
      counts[table] = (await ctx.db.query(table).collect()).length;
    }
    return counts;
  },
});
