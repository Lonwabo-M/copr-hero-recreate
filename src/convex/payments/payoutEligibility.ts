/**
 * Lasha Settlement Payout Eligibility (READ MODEL — privileged)
 *
 * Determines whether a driver settlement is eligible to move from
 * payable/pending into actual payout processing.
 *
 * POLICY — Model B (see docs/payment-settlement-reconciliation.md §13):
 *   Current implementation policy pending business sign-off. A settlement is
 *   payout-eligible only when:
 *     1. the delivery is DELIVERED (correct terminal state),
 *     2. exactly one settlement exists for the order and it belongs to that
 *        delivery/order/driver,
 *     3. the settlement status is payout-eligible (pending or processing —
 *        pending = payable; processing = payout already in progress by an
 *        authorized operator),
 *     4. the settlement amount matches the stored quote driverEarnings,
 *     5. a server-verified completed customer payment exists and its amount
 *        matches orders.price,
 *     6. the shared reconciliation evaluation reports no anomalies.
 *
 * CRITICAL: this operation is a pure read.
 *   - It NEVER moves money or calls any payout provider.
 *   - It NEVER changes settlement status, credit wallets, or create
 *     transactions or payout records.
 *   - It reuses the SAME authoritative financial evaluation as the
 *     reconciliation read model (payments/_reconcile.ts) — no duplicated
 *     payment/settlement/anomaly logic, no circular dependencies.
 *
 * Authorization: privileged financial roles only (settlement:view). Drivers
 * and customers cannot invoke this gate.
 */

import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requirePermission } from "../auth/authorization";
import { DELIVERY_STATUS } from "../schema";
import { evaluateOrderFinancials } from "./_reconcile";

// ─── Eligibility Reasons ──────────────────────────────────────────────────────

/**
 * Payout-eligibility reason codes (derived, never persisted).
 * Single reason per evaluation: the first blocking condition wins, in the
 * order the checks run (delivery → settlement → payment → anomalies).
 */
export const PAYOUT_ELIGIBILITY_REASONS = [
  "ELIGIBLE",
  "DELIVERY_NOT_COMPLETED",
  "DELIVERY_MISSING",
  "NO_SETTLEMENT",
  "SETTLEMENT_NOT_PAYABLE",
  "SETTLEMENT_ALREADY_PAID",
  "CUSTOMER_PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PAYMENT_AMOUNT_MISMATCH",
  "FINANCIAL_ANOMALY",
] as const;

export type PayoutEligibilityReason = (typeof PAYOUT_ELIGIBILITY_REASONS)[number];

// Settlement statuses eligible for entering/continuing payout processing.
// "pending"  = payable, payout not yet started.
// "processing" = an authorized operator has already moved it into processing;
//                re-checking eligibility must not flip it to ineligible mid-
//                lifecycle (idempotent evaluation). "completed" is NOT eligible
//                (already paid) and failed/disputed are terminal blocks.
const ELIGIBLE_SETTLEMENT_STATUSES = new Set(["pending", "processing"]);

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Evaluate payout eligibility for a settlement.
 *
 * Args: settlementId ONLY (locates the financial record). All financial facts
 * — delivery state, order charge, quote amounts, payment verification,
 * anomalies — are resolved server-side from the shared evaluation. No driver/
 * customer/wallet IDs or amounts are accepted from the client.
 */
export const checkSettlementPayoutEligibility = query({
  args: { settlementId: v.id("settlements") },
  handler: async (ctx, args) => {
    // Privileged financial access only (settlement:view).
    const actor = await requirePermission(ctx, "settlement:view");

    // ── Settlement (exists? belongs to the delivery/order/driver triad?) ──
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      return {
        eligible: false,
        reason: "NO_SETTLEMENT" as const,
        settlementId: args.settlementId,
        orderId: null,
        deliveryId: null,
        driverId: null,
        settlementAmount: null,
        customerPaymentAmount: null,
        reconciliationState: null,
        anomalies: ["Settlement not found"],
        checkedAt: Date.now(),
        actorRole: actor.role as string,
      };
    }

    // Shared authoritative evaluation for the settlement's order — the same
    // interpretation the reconciliation read model uses.
    const evaluation = await evaluateOrderFinancials(ctx, settlement.orderId);

    const {
      order,
      quote,
      completedPayment,
      settlement: evalSettlement,
      delivery,
      customerPaid,
      paymentAmountVerified,
      state,
      anomalies,
    } = evaluation;

    // The settlement found via by_order must be the one being checked —
    // multiple settlements is itself an anomaly (already recorded), but verify
    // identity explicitly so we never evaluate the wrong record.
    const settlementMatches =
      evalSettlement !== null && evalSettlement._id === settlement._id;

    const result = (eligible: boolean, reason: (typeof PAYOUT_ELIGIBILITY_REASONS)[number]) => ({
      eligible,
      reason,
      settlementId: settlement._id,
      orderId: settlement.orderId,
      deliveryId: settlement.deliveryId,
      driverId: settlement.driverId,
      settlementAmount: settlement.driverEarnings,
      customerPaymentAmount: completedPayment?.amount ?? null,
      settlementStatus: settlement.status,
      deliveryStatus: delivery?.status ?? null,
      reconciliationState: state,
      anomalies,
      checkedAt: Date.now(),
      actorRole: actor.role as string,
    });

    // ── 1. Delivery ──
    if (!delivery) {
      return result(false, "DELIVERY_MISSING");
    }
    if (delivery.status !== DELIVERY_STATUS.DELIVERED) {
      return result(false, "DELIVERY_NOT_COMPLETED");
    }

    // ── 2. Settlement correspondence & integrity ──
    if (!settlementMatches) {
      return result(false, "FINANCIAL_ANOMALY");
    }
    // Settlement amount must match the authoritative stored quote.
    if (quote && settlement.driverEarnings !== quote.driverEarnings) {
      return result(false, "SETTLEMENT_NOT_PAYABLE");
    }
    // Status gate: completed = already paid; failed/disputed = blocked;
    // pending/processing = payable lifecycle states.
    if (!ELIGIBLE_SETTLEMENT_STATUSES.has(settlement.status)) {
      return result(
        false,
        settlement.status === "completed" ? "SETTLEMENT_ALREADY_PAID" : "SETTLEMENT_NOT_PAYABLE"
      );
    }

    // ── 3. Customer payment (Model B: verified payment required) ──
    if (!customerPaid) {
      const failedPayments = evaluation.allPayments.filter((p) => p.status === "failed");
      if (completedPayment && !paymentAmountVerified) {
        return result(false, "PAYMENT_AMOUNT_MISMATCH");
      }
      if (failedPayments.length > 0 && completedPayment === null) {
        return result(false, "PAYMENT_FAILED");
      }
      return result(false, "CUSTOMER_PAYMENT_PENDING");
    }

    // ── 4. Reconciliation anomalies block eligibility ──
    if (state === "ANOMALY" || anomalies.length > 0) {
      return result(false, "FINANCIAL_ANOMALY");
    }

    return result(true, "ELIGIBLE");
  },
});

/**
 * Internal evaluation used by settlement-lifecycle mutations
 * (pricing/service.ts processSettlement / completeSettlement).
 *
 * Same gate logic and same reason codes as the privileged query, but
 * permission is inherited from the calling mutation (which already requires
 * settlement:manage). Kept internal so React can never invoke it directly.
 *
 * Read-only: evaluating eligibility inside the mutation transaction performs
 * no writes — the mutation applies the status change only after the gate passes.
 */
export const evaluateInternal = internalQuery({
  args: { settlementId: v.id("settlements") },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) {
      return {
        eligible: false,
        reason: "NO_SETTLEMENT" as const,
        settlementId: args.settlementId,
        orderId: null,
        deliveryId: null,
        driverId: null,
        settlementAmount: null,
        customerPaymentAmount: null,
        settlementStatus: null,
        deliveryStatus: null,
        reconciliationState: null,
        anomalies: ["Settlement not found"],
      };
    }

    const evaluation = await evaluateOrderFinancials(ctx, settlement.orderId);
    const {
      quote,
      completedPayment,
      settlement: evalSettlement,
      delivery,
      customerPaid,
      paymentAmountVerified,
      state,
      anomalies,
    } = evaluation;

    const settlementMatches =
      evalSettlement !== null && evalSettlement._id === settlement._id;

    const result = (
      eligible: boolean,
      reason: (typeof PAYOUT_ELIGIBILITY_REASONS)[number]
    ) => ({
      eligible,
      reason,
      settlementId: settlement._id,
      orderId: settlement.orderId,
      deliveryId: settlement.deliveryId,
      driverId: settlement.driverId,
      settlementAmount: settlement.driverEarnings,
      customerPaymentAmount: completedPayment?.amount ?? null,
      settlementStatus: settlement.status,
      deliveryStatus: delivery?.status ?? null,
      reconciliationState: state,
      anomalies,
    });

    // 1. Delivery
    if (!delivery) return result(false, "DELIVERY_MISSING");
    if (delivery.status !== DELIVERY_STATUS.DELIVERED) {
      return result(false, "DELIVERY_NOT_COMPLETED");
    }

    // 2. Settlement correspondence & integrity
    if (!settlementMatches) return result(false, "FINANCIAL_ANOMALY");
    if (quote && settlement.driverEarnings !== quote.driverEarnings) {
      return result(false, "SETTLEMENT_NOT_PAYABLE");
    }
    if (!ELIGIBLE_SETTLEMENT_STATUSES.has(settlement.status)) {
      return result(
        false,
        settlement.status === "completed" ? "SETTLEMENT_ALREADY_PAID" : "SETTLEMENT_NOT_PAYABLE"
      );
    }

    // 3. Customer payment (Model B)
    if (!customerPaid) {
      const failedPayments = evaluation.allPayments.filter((p) => p.status === "failed");
      if (completedPayment && !paymentAmountVerified) {
        return result(false, "PAYMENT_AMOUNT_MISMATCH");
      }
      if (failedPayments.length > 0 && completedPayment === null) {
        return result(false, "PAYMENT_FAILED");
      }
      return result(false, "CUSTOMER_PAYMENT_PENDING");
    }

    // 4. Reconciliation anomalies block eligibility
    if (state === "ANOMALY" || anomalies.length > 0) {
      return result(false, "FINANCIAL_ANOMALY");
    }

    return result(true, "ELIGIBLE");
  },
});
