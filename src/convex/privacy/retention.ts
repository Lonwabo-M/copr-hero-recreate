/**
 * Scheduled retention clean-up (POPIA s14).
 *
 * The published retention schedule commits Lasha to deleting or de-identifying
 * records once their purpose is spent. This job is the automated part of that
 * commitment, and deliberately covers only records whose retention is
 * unconditional and whose deletion is safe:
 *
 *   - privacy_requests: 24 months after the request was resolved.
 *   - demo_requests: 12 months after last contact when the lead never became a
 *     customer (status new / contacted / closed). A qualified lead is kept —
 *     turning into a customer moves it under customer retention instead.
 *   - consent_records: all rows for a user/purpose pair once the pair's latest
 *     decision is a withdrawal older than 36 months. Until then the full
 *     append-only history is evidence and stays.
 *
 * NOT covered here, because deletion needs a human decision or another
 * system's record: orders and invoices (5-year tax hold), delivery and
 * proof-of-delivery records (claims window), driver onboarding documents,
 * location pings, audit logs and support threads. Those are worked from
 * docs/popia/retention-schedule.md. Every run is bounded, so one invocation can
 * never delete an unbounded amount of data.
 */

import { internalMutation } from "../_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_RETENTION_MS = 730 * DAY_MS;
const LEAD_RETENTION_MS = 365 * DAY_MS;
const CONSENT_RETENTION_MS = 1095 * DAY_MS;
const MAX_DELETIONS_PER_RUN = 400;

export const purgeExpiredPersonalInformation = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deletedPrivacyRequests = 0;
    let deletedDemoRequests = 0;
    let deletedConsentRecords = 0;

    // ── Resolved privacy requests ──────────────────────────────────────────
    const requestCutoff = now - REQUEST_RETENTION_MS;
    for (const status of ["completed", "refused"] as const) {
      const rows = await ctx.db
        .query("privacy_requests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(200);
      for (const row of rows) {
        if (deletedPrivacyRequests >= MAX_DELETIONS_PER_RUN) break;
        if (row.resolvedAt && row.resolvedAt < requestCutoff) {
          await ctx.db.delete(row._id);
          deletedPrivacyRequests += 1;
        }
      }
    }

    // ── Unconverted demo enquiries ─────────────────────────────────────────
    const leadCutoff = now - LEAD_RETENTION_MS;
    for (const status of ["new", "contacted", "closed"] as const) {
      const rows = await ctx.db
        .query("demo_requests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(200);
      for (const row of rows) {
        if (deletedDemoRequests >= MAX_DELETIONS_PER_RUN) break;
        if (row.submittedAt < leadCutoff) {
          await ctx.db.delete(row._id);
          deletedDemoRequests += 1;
        }
      }
    }

    // ── Consent history for withdrawn purposes ────────────────────────────
    const consentCutoff = now - CONSENT_RETENTION_MS;
    for (const purpose of ["service", "marketing", "analytics"] as const) {
      if (deletedConsentRecords >= MAX_DELETIONS_PER_RUN) break;
      const rows = await ctx.db
        .query("consent_records")
        .withIndex("by_purpose", (q) => q.eq("purpose", purpose))
        .take(1000);

      // Group the page by user; rows arrive oldest-first.
      const byUser = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = row.userId;
        const list = byUser.get(key);
        if (list) list.push(row);
        else byUser.set(key, [row]);
      }

      for (const history of byUser.values()) {
        if (deletedConsentRecords >= MAX_DELETIONS_PER_RUN) break;
        const latest = history[history.length - 1];
        if (latest.granted === false && latest.createdAt < consentCutoff) {
          for (const row of history) {
            if (deletedConsentRecords >= MAX_DELETIONS_PER_RUN) break;
            await ctx.db.delete(row._id);
            deletedConsentRecords += 1;
          }
        }
      }
    }

    return {
      ranAt: now,
      deletedPrivacyRequests,
      deletedDemoRequests,
      deletedConsentRecords,
    };
  },
});
