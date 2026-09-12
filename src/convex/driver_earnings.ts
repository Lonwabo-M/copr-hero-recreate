/**
 * Driver Earnings (driver-scoped read model)
 *
 * Provides the Driver App with authoritative financial data for the
 * authenticated driver. Everything is derived from stored records:
 *
 *   earned/payable/eligible  → settlements (by_driver)
 *   amounts                  → stored delivery_quotes.driverEarnings
 *                                (never recalculated from rules/distance)
 *   payout eligibility       → shared _reconcile evaluation (no new logic)
 *
 * Authorization: driver session IS the driver. No driverId/courierId/walletId
 * accepted from the client. A driver only sees their own settlements and
 * earnings. Wallet balance is exposed as an *internal payable balance*, never
 * as an external bank payout.
 *
 * Presentation semantics (consistent with docs/driver-earnings.md):
 *   pending      → "Payable"
 *   processing   → "Processing"
 *   completed    → "Settlement completed"  (not "Paid" — no external payout yet)
 *   failed/disputed → shown with failure/display reason
 *
 * Payout eligibility: derived from evaluateOrderFinancials using the same
 * Model B rule implemented in payments/payoutEligibility.ts. The driver sees a
 * simple Eligible / Not yet eligible / Processing / Already settled / Not
 * available state — never privileged reconciliation diagnostics.
 */

import { query } from "./_generated/server";
import { getCurrentAuthUser } from "./auth/authorization";
import { v } from "convex/values";
import { ROLES } from "./schema";
import {
  evaluateOrderFinancials,
  type OrderFinancialEvaluation,
} from "./payments/_reconcile";

// Mirror the local set from payments/payoutEligibility.ts (not exported).
const ELIGIBLE_SETTLEMENT_STATUSES = new Set(["pending", "processing"]);

export const getDriverEarnings = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("all"),
        v.literal("payable"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only drivers can view their earnings");
    }

    // The authenticated driver IS the driver. No driverId accepted from client.
    const driverId = user.userId;
    const limit = Math.max(1, Math.min(args.limit ?? 30, 100));

    // Authoritative settlements for the authenticated driver (server-side scope).
    let rows = await ctx.db
      .query("settlements")
      .withIndex("by_driver", (q) => q.eq("driverId", driverId))
      .order("desc")
      .take(limit + 1);

    if (args.cursor) {
      const idx = rows.findIndex((r) => r._id === (args.cursor as any));
      if (idx >= 0) rows = rows.slice(idx + 1);
    }

    // Server-side date-range filter on settlement createdAt.
    if (args.from !== undefined) {
      rows = rows.filter((r) => r.createdAt >= args.from!);
    }
    if (args.to !== undefined) {
      rows = rows.filter((r) => r.createdAt < args.to!);
    }

    const hasMore = rows.length > limit;
    const rowsPage = hasMore ? rows.slice(0, limit) : rows;

    type EarningRow = {
      settlementId: string;
      deliveryId: string;
      orderId: string;
      trackingNumber: string | null;
      deliveryStatus: string | null;
      createdAt: number;
      settlementStatus: string;
      settlementDriverEarnings: number;
      quoteDriverEarnings: number | null;
      quoteTotalCharge: number | null;
      payoutEligible: boolean;
      payoutReason: string;
      payoutEligibleLabel: string;
      customerPaid: boolean;
      settlementCompleted: boolean;
    };

    const rowsOut: EarningRow[] = [];
    for (const s of rowsPage) {
      const quote = await ctx.db.get(s.quoteId);
      const order = await ctx.db.get(s.orderId);
      const delivery = await ctx.db.get(s.deliveryId);

      const quoteDriverEarnings = quote?.driverEarnings ?? null;
      const quoteTotalCharge = quote?.totalCharge ?? null;

      let payoutEligible = false;
      let payoutReason = "";
      let payoutEligibleLabel = "Not available";
      let customerPaid = false;
      let settlementCompleted = s.status === "completed";

      if (s.status === "failed" || s.status === "disputed") {
        payoutEligibleLabel = "Not payable";
        payoutReason = `Settlement ${s.status === "failed" ? "failed" : "disputed"}`;
      } else if (s.status === "completed") {
        payoutEligibleLabel = "Already settled";
        payoutReason = "Settlement completed";
      } else if (ELIGIBLE_SETTLEMENT_STATUSES.has(s.status)) {
        // Evaluate via the shared financial model (no duplicate logic).
        let evaluation: OrderFinancialEvaluation | null = null;
        try {
          evaluation = await evaluateOrderFinancials(ctx, s.orderId);
        } catch {
          evaluation = null;
        }

        if (!evaluation) {
          payoutEligibleLabel = "Not available";
          payoutReason = "Financial data unavailable";
        } else {
          const {
            settlement: evalSettlement,
            customerPaid: paid,
            state,
            anomalies,
            quote: evalQuote,
            delivery: evalDelivery,
          } = evaluation;

          const matches =
            evalSettlement !== null && evalSettlement._id === s._id;

          customerPaid = paid;

          if (!matches) {
            payoutEligibleLabel = "Not yet eligible";
            payoutReason = "Financial review required";
          } else if (state === "ANOMALY" || anomalies.length > 0) {
            payoutEligibleLabel = "Not yet eligible";
            payoutReason = "Financial review required";
          } else if (evalDelivery?.status !== "delivered") {
            payoutEligibleLabel = "Not yet eligible";
            payoutReason = "Delivery not completed";
          } else if (!customerPaid) {
            // Look at failed payments to give a better label.
            const failedPayments = evaluation.allPayments.filter(
              (p) => p.status === "failed",
            );
            if (failedPayments.length > 0) {
              payoutEligibleLabel = "Not yet eligible";
              payoutReason = "Customer payment failed";
            } else {
              payoutEligibleLabel = "Not yet eligible";
              payoutReason = "Awaiting customer payment";
            }
          } else if (!evaluation.paymentAmountVerified) {
            payoutEligibleLabel = "Not yet eligible";
            payoutReason = "Payment amount does not match";
          } else if (evalQuote && s.driverEarnings !== evalQuote.driverEarnings) {
            payoutEligibleLabel = "Not payable";
            payoutReason = "Settlement amount does not match";
          } else {
            // Passed all Model B checks.
            payoutEligible = true;
            payoutEligibleLabel = "Eligible";
            payoutReason = "Eligible for payout";
          }
        }
      }

      rowsOut.push({
        settlementId: s._id as unknown as string,
        deliveryId: s.deliveryId as unknown as string,
        orderId: s.orderId as unknown as string,
        trackingNumber: delivery?.trackingNumber ?? null,
        deliveryStatus: delivery?.status ?? null,
        createdAt: s.createdAt,
        settlementStatus: s.status,
        settlementDriverEarnings: s.driverEarnings,
        quoteDriverEarnings,
        quoteTotalCharge,
        payoutEligible,
        payoutReason,
        payoutEligibleLabel,
        customerPaid,
        settlementCompleted,
      });
    }

    const allPayable = rowsOut.filter(
      (r) => r.settlementStatus === "pending" || r.settlementStatus === "processing",
    );
    const allCompleted = rowsOut.filter((r) => r.settlementStatus === "completed");
    const allFailed = rowsOut.filter(
      (r) => r.settlementStatus === "failed" || r.settlementStatus === "disputed",
    );

    const earnedFromCompleted = allCompleted.reduce(
      (sum, r) => sum + r.settlementDriverEarnings,
      0,
    );
    const pendingPayable = allPayable.reduce(
      (sum, r) => sum + r.settlementDriverEarnings,
      0,
    );
    const eligibleForPayout = rowsOut
      .filter((r) => r.payoutEligible)
      .reduce((sum, r) => sum + r.settlementDriverEarnings, 0);

    return {
      items: rowsOut,
      nextCursor: hasMore && rowsOut.length > 0
        ? (rowsOut[rowsOut.length - 1].settlementId ?? null)
        : null,
      hasMore,
      summary: {
        earnedFromCompleted,
        pendingPayable,
        eligibleForPayout,
        // External payout has never been run — do NOT invent a "paid" total.
        paidOut: 0,
        paidOutNote: "No external payouts recorded",
        deliveredCount: allCompleted.length,
        payableCount: allPayable.length,
        failedCount: allFailed.length,
      },
    };
  },
});

/**
 * Driver-safe payout eligibility for one settlement.
 *
 * Reuses the same financial evaluation as the privileged operation but exposes
 * only a driver-safe label — never reconciliation diagnostics, provider
 * references, platform revenue, or internal settlement IDs.
 */
export const getSettlementDriverEligibility = query({
  args: { settlementId: v.id("settlements") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only drivers can check payout eligibility");
    }

    // Driver must own the settlement.
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      return { ok: false, error: "Settlement not found" };
    }
    if (settlement.driverId !== user.userId) {
      // A driver attempting to inspect another driver's settlement gets a safe
      // "not found" rather than a direct denial message that leaks existence.
      return { ok: false, error: "Not found" };
    }

    let evaluation: OrderFinancialEvaluation | null = null;
    try {
      evaluation = await evaluateOrderFinancials(ctx, settlement.orderId);
    } catch {
      return {
        ok: true,
        eligible: false,
        label: "Not available",
        reason: "Financial data unavailable",
      };
    }

    const {
      settlement: evalSettlement,
      customerPaid: paid,
      state,
      anomalies,
      delivery,
      quote,
    } = evaluation;

    const matches = evalSettlement !== null && evalSettlement._id === settlement._id;

    const result = (label: string, eligible_: boolean) => ({
      ok: true,
      eligible: eligible_,
      label,
      reason,
    });

    if (!matches) {
      return result("Not yet eligible", false);
    }

    // Status label mapping (driver-safe, meaning-preserving).
    if (settlement.status === "completed") {
      return result("Already settled", false);
    }
    if (settlement.status === "failed" || settlement.status === "disputed") {
      return result("Not payable", false);
    }
    if (!ELIGIBLE_SETTLEMENT_STATUSES.has(settlement.status)) {
      return result("Not payable", false);
    }

    const customerPaid = paid;
    const reason = state === "ANOMALY" || anomalies.length > 0
      ? "Financial review required"
      : !customerPaid
        ? evaluation.allPayments.some((p) => p.status === "failed")
          ? "Customer payment failed"
          : "Awaiting customer payment"
        : !evaluation.paymentAmountVerified
          ? "Payment amount does not match"
          : quote && settlement.driverEarnings !== quote.driverEarnings
            ? "Settlement amount does not match"
            : "Eligible";

    const eligible = customerPaid
      && evaluation.paymentAmountVerified
      && (!quote || settlement.driverEarnings === quote.driverEarnings)
      && (state !== "ANOMALY" && anomalies.length === 0)
      && delivery?.status === "delivered";

    // Passed all Model B checks.
    return result(eligible ? "Eligible" : "Not yet eligible", eligible);
  },
});

/**
 * Earnings summary for the authenticated driver.
 *
 * IMPORTANT semantics change from older legacy helpers:
 *   - "completed" settlements are NOT labeled as "paid". There is no external
 *     payout integration yet. They are presented as "Settlement completed".
 *   - totals are computed from stored settlement.driverEarnings, not from
 *     recalculated pricing.
 */
export const getDriverEarningsSummary = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("all"),
        v.literal("payable"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only drivers can view their earnings");
    }

    const rows = await ctx.db
      .query("settlements")
      .withIndex("by_driver", (q) => q.eq("driverId", user.userId))
      .collect();

    const filter =
      args.status && args.status !== "all"
        ? rows.filter((s) => s.status === args.status)
        : rows;

    const completed = filter.filter((s) => s.status === "completed");
    const payable = filter.filter(
      (s) => s.status === "pending" || s.status === "processing",
    );
    const failed = filter.filter(
      (s) => s.status === "failed" || s.status === "disputed",
    );

    const earned = completed.reduce((sum, s) => sum + s.driverEarnings, 0);
    const pending = payable.reduce((sum, s) => sum + s.driverEarnings, 0);

    // Eligible-for-payout is a derived attribute (Model B). We re-derive it here
    // from the same financial model so the summary is authoritative.
    let eligibleSum = 0;
    for (const s of payable) {
      let elig: { eligible: boolean } | null = null;
      try {
        const ev = await evaluateOrderFinancials(ctx, s.orderId);
        const matches = ev.settlement !== null && ev.settlement._id === s._id;
        if (
          matches
          && ev.state !== "ANOMALY"
          && ev.anomalies.length === 0
          && ev.delivery?.status === "delivered"
          && ev.customerPaid
          && ev.paymentAmountVerified
          && (!ev.quote || s.driverEarnings === ev.quote.driverEarnings)
        ) {
          elig = { eligible: true };
        }
      } catch {
        // leave elig null
      }
      if (elig?.eligible) {
        eligibleSum += s.driverEarnings;
      }
    }

    return {
      earnedFromCompleted: earned,
      pendingPayable: pending,
      eligibleForPayout: eligibleSum,
      payableCount: payable.length,
      completedCount: completed.length,
      failedCount: failed.length,
      // No external payout integration exists — paid out is 0, stated explicitly.
      paidOut: 0,
      paidOutNote: "No external payouts recorded",
    };
  },
});
