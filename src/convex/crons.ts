/**
 * Convex Scheduled Jobs (Cron)
 *
 * Convex owns scheduled execution — no external scheduler, no browser polling.
 * See https://docs.convex.dev/scheduling/cron-jobs
 *
 * ── Offer Expiry ─────────────────────────────────────────────────────────────
 * `processExpiredOffersCron` runs the existing shared expiry core in
 * `dispatch/engine.ts` (the same code the manual operations mutation uses).
 * It closes dispatch offers that are still `pending` past their `expiresAt`.
 *
 * Interval — 1 minute. The dispatch configuration expires offers after
 * 2 minutes (`scoring_service.ts` `offerExpiryMs`), so an abandoned offer is
 * processed within ~1 minute of expiring (delivery stuck in ASSIGNED for at
 * most ~3 minutes instead of indefinitely). The job performs one bounded
 * indexed lookup per run (typically zero rows) — negligible load at this
 * frequency. This is scheduled cleanup, not exact real-time expiry.
 *
 * Concurrency safety: the predicate only matches `status === "pending" &&
 * expiresAt < now`, re-checked inside the write loop, so offers accepted,
 * rejected, cancelled, or already expired between the scan and the write are
 * never touched, and repeated/overlapping runs are idempotent. Delivery state
 * is never modified by this job — reassignment stays with the existing
 * dispatch/reassignment flows (manual Operations re-dispatch or
 * `requestReassignment`), which the Operations Centre surfaces as
 * `offer_expired` attention items.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire dispatch offers",
  { minutes: 1 },
  internal.dispatch.engine.processExpiredOffersCron,
  {},
);

export default crons;
