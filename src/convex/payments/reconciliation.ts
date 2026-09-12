/**
 * Lasha Payment Reconciliation (READ MODEL — privileged)
 *
 * Derives the current financial relationship between customer payments and
 * driver settlements for an order, from existing authoritative records ONLY.
 *
 * CRITICAL: this query is a pure read model.
 *   - It NEVER persists reconciliation state (no reconciliation table exists).
 *   - It NEVER modifies payment status, settlement status, wallet balance,
 *     transactions, delivery status, or order status.
 *   - It NEVER moves money, credits wallets, or initiates payouts.
 *
 * Authorization: privileged financial roles only, via the existing permission
 * system (SETTLEMENT_VIEW). Drivers and customers cannot access this data.
 *
 * The financial interpretation itself lives in payments/_reconcile.ts
 * (evaluateOrderFinancials) so the payout-eligibility gate and the settlement
 * completion hardening reuse the SAME authoritative evaluation instead of
 * duplicating payment/settlement/anomaly logic.
 *
 * See docs/payment-settlement-reconciliation.md §12 (Reconciliation Read
 * Model). RECONCILED does NOT mean accounting is complete or a driver payout
 * has occurred.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { requirePermission } from "../auth/authorization";
import {
  evaluateOrderFinancials,
  derivePlatformRevenue,
  RECONCILIATION_STATES,
  type ReconciliationState,
} from "./_reconcile";

// Re-exported so existing consumers/tests keep their import path.
export { RECONCILIATION_STATES };
export type { ReconciliationState };

/**
 * Reconcile an order's customer payment against its driver settlement.
 *
 * Args: orderId ONLY. The caller's identity and authorization are resolved
 * from the session; no driver/settlement/payment IDs are accepted as input.
 */
export const getOrderReconciliation = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    // Privileged financial access only (operations / company_admin /
    // super_admin hold SETTLEMENT_VIEW; drivers and customers do not).
    const actor = await requirePermission(ctx, "settlement:view");

    let evaluation;
    try {
      evaluation = await evaluateOrderFinancials(ctx, args.orderId);
    } catch (e) {
      // Order not found — same structured shape as before.
      return {
        order: { orderId: args.orderId, exists: false },
        quote: null,
        customerPayment: null,
        settlement: null,
        reconciliation: {
          state: "ANOMALY" as ReconciliationState,
          customerPaid: false,
          driverEntitled: false,
          platformRevenue: null,
          anomalies: ["Order not found"],
        },
        actorRole: actor.role as string,
        derivedAt: Date.now(),
      };
    }

    const {
      order,
      quote,
      completedPayment,
      settlement,
      delivery,
      customerPaid,
      paymentAmountVerified,
      driverEntitled,
      state,
      anomalies,
    } = evaluation;

    // Safe wallet transaction reference (no wallet state exposed): the
    // settlement completion writes reference SET-{settlementId}; a completed
    // settlement implies that reference. We only report the settlement's own
    // reference format — we do not query wallets here.
    const walletTransactionReference =
      settlement?.status === "completed" ? `SET-${settlement._id}` : null;

    return {
      order: {
        orderId: order._id,
        exists: true,
        orderStatus: order.status,
        price: order.price,
        trackingNumber: order.trackingNumber ?? null,
        createdAt: order.createdAt,
      },
      quote: quote
        ? {
            quoteId: quote._id,
            totalCharge: quote.totalCharge,
            deliveryFee: quote.deliveryFee,
            platformFee: quote.platformFee,
            driverEarnings: quote.driverEarnings,
            calculatedAt: quote.calculatedAt,
          }
        : null,
      customerPayment: completedPayment
        ? {
            transactionId: completedPayment._id,
            // Safe stored reference (Paystack reference / idempotency key).
            reference: completedPayment.idempotencyKey,
            provider: completedPayment.provider,
            providerTransactionId: completedPayment.providerTransactionId ?? null,
            status: completedPayment.status,
            amount: completedPayment.amount,
            amountMatchesOrderPrice: paymentAmountVerified,
            createdAt: completedPayment.createdAt,
            completedAt: completedPayment.completedAt ?? null,
          }
        : null,
      settlement: settlement
        ? {
            settlementId: settlement._id,
            deliveryId: settlement.deliveryId,
            driverId: settlement.driverId,
            status: settlement.status,
            driverEarnings: settlement.driverEarnings,
            platformFee: settlement.platformFee,
            deliveryFee: settlement.deliveryFee,
            idempotencyKey: settlement.idempotencyKey,
            walletTransactionReference,
            createdAt: settlement.createdAt,
            processedAt: settlement.processedAt ?? null,
            completedAt: settlement.completedAt ?? null,
          }
        : null,
      reconciliation: {
        state,
        customerPaid,
        driverEntitled,
        platformRevenue: derivePlatformRevenue(evaluation),
        anomalies,
      },
      delivery: delivery
        ? {
            deliveryId: delivery._id,
            status: delivery.status,
            courierId: delivery.courierId ?? null,
          }
        : null,
      actorRole: actor.role as string,
      derivedAt: Date.now(),
    };
  },
});
