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
 * Source records (all derived, none created):
 *   orders.price            — authoritative customer charge
 *   delivery_quotes         — authoritative pricing breakdown (by_order)
 *   payment_transactions    — server-verified provider payments (by_order)
 *   settlements             — driver entitlement (by_order)
 *
 * See docs/payment-settlement-reconciliation.md §12 (Reconciliation Read
 * Model). RECONCILED does NOT mean accounting is complete or a driver payout
 * has occurred.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { requirePermission } from "../auth/authorization";

// ─── Reconciliation States ────────────────────────────────────────────────────

/**
 * Derived (never persisted) reconciliation status for an order.
 *
 * - RECONCILED: customer payment verified AND settlement exists AND
 *   settlement completed. Does NOT mean accounting is done or the driver
 *   payout occurred — settlement "completed" only records the wallet credit
 *   event if/when the settlement lifecycle has been driven to completion.
 * - UNPAID: no completed customer payment, no settlement.
 * - PAID_NO_SETTLEMENT: customer paid but no settlement exists (e.g. delivery
 *   not yet completed, or a failed/cancelled delivery — see compensation
 *   policy in docs/driver-earnings-settlement.md).
 * - SETTLEMENT_PENDING: settlement exists and is pending/payable.
 * - SETTLEMENT_PROCESSING: settlement has been marked processing by an
 *   authorized operator (payout in progress, by existing terminology).
 * - ANOMALY: authoritative records disagree (amount mismatches, duplicate
 *   completed payments). Returned with diagnostics; nothing is auto-corrected.
 */
export const RECONCILIATION_STATES = [
  "RECONCILED",
  "UNPAID",
  "PAID_NO_SETTLEMENT",
  "SETTLEMENT_PENDING",
  "SETTLEMENT_PROCESSING",
  "ANOMALY",
] as const;

export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

// ─── Query ────────────────────────────────────────────────────────────────────

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

    const anomalies: string[] = [];

    // ── Order (authoritative customer charge) ──
    const order = await ctx.db.get(args.orderId);
    if (!order) {
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

    // ── Quote (authoritative pricing breakdown) ──
    const quotes = await ctx.db
      .query("delivery_quotes")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    // Newest quote is the authoritative one (same rule as settlement creation).
    const quote =
      quotes.length > 0
        ? quotes.sort((a, b) => b.calculatedAt - a.calculatedAt)[0]
        : null;
    if (quotes.length > 1) {
      anomalies.push(`Multiple quotes exist (${quotes.length}); using the latest by calculatedAt`);
    }

    // ── Customer payment (server-verified provider records) ──
    const payments = await ctx.db
      .query("payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const completedPayments = payments.filter((p) => p.status === "completed");

    // Multiple completed payments must never be silently collapsed.
    let completedPayment: Doc<"payment_transactions"> | null = null;
    if (completedPayments.length > 1) {
      anomalies.push(
        `${completedPayments.length} completed payments exist for this order — possible duplicate charge; do not treat as cleanly paid`
      );
      // Use the newest for diagnostics, but the anomaly flags the state.
      completedPayment = completedPayments.sort((a, b) => b.createdAt - a.createdAt)[0];
    } else if (completedPayments.length === 1) {
      completedPayment = completedPayments[0];
    }

    // Amount integrity: the completed payment must match orders.price.
    let paymentAmountVerified = false;
    if (completedPayment) {
      if (completedPayment.amount === order.price) {
        paymentAmountVerified = true;
      } else {
        anomalies.push(
          `Completed payment amount (${completedPayment.amount}) does not match orders.price (${order.price})`
        );
      }
    }

    const customerPaid = completedPayment !== null && paymentAmountVerified;

    // Quote/charge consistency: orders.price must match the stored quote total.
    if (quote && quote.totalCharge !== order.price) {
      anomalies.push(
        `orders.price (${order.price}) does not match quote totalCharge (${quote.totalCharge})`
      );
    }

    // ── Settlement (driver entitlement) ──
    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const settlement = settlements.length > 0 ? settlements[0] : null;
    if (settlements.length > 1) {
      anomalies.push(
        `${settlements.length} settlements exist for this order — idempotency violated; investigate`
      );
    }

    // Settlement amount must match the stored quote driverEarnings.
    if (settlement && quote && settlement.driverEarnings !== quote.driverEarnings) {
      anomalies.push(
        `Settlement driverEarnings (${settlement.driverEarnings}) does not match quote driverEarnings (${quote.driverEarnings})`
      );
    }

    const driverEntitled = settlement !== null;

    // Safe wallet transaction reference (no wallet state exposed): the
    // settlement completion writes reference SET-{settlementId}; a completed
    // settlement implies that reference. We only report the settlement's own
    // reference format — we do not query wallets here.
    const walletTransactionReference =
      settlement?.status === "completed" ? `SET-${settlement._id}` : null;

    // ── Derived reconciliation state ──
    let state: ReconciliationState;
    if (anomalies.length > 0) {
      state = "ANOMALY";
    } else if (!customerPaid && !driverEntitled) {
      state = "UNPAID";
    } else if (customerPaid && !driverEntitled) {
      state = "PAID_NO_SETTLEMENT";
    } else if (!customerPaid && driverEntitled) {
      // Settlement exists but customer hasn't (verifiably) paid.
      state =
        settlement!.status === "processing"
          ? "SETTLEMENT_PROCESSING"
          : "SETTLEMENT_PENDING";
    } else {
      // customerPaid && driverEntitled — check the settlement lifecycle.
      switch (settlement!.status) {
        case "completed":
          state = "RECONCILED";
          break;
        case "processing":
          state = "SETTLEMENT_PROCESSING";
          break;
        case "pending":
          state = "SETTLEMENT_PENDING";
          break;
        default:
          // failed / disputed settlements with a paid customer are anomalies
          // for operator attention — not silently non-reconciled.
          anomalies.push(
            `Settlement status is "${settlement!.status}" while the customer has paid`
          );
          state = "ANOMALY";
      }
    }

    // ── Derived platform revenue ──
    // totalCharge − driverEarnings, from the STORED quote only. No pricing
    // recalculation. This is derived revenue, NOT recognized accounting
    // revenue and NOT a payout of any kind.
    const platformRevenue =
      quote !== null
        ? { amount: quote.totalCharge - quote.driverEarnings, source: "derived from stored quote" }
        : null;

    // ── Context (privileged; no customer PII beyond references) ──
    const delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();

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
        platformRevenue,
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
