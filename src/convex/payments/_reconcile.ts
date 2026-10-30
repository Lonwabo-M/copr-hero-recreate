/**
 * Shared Order Financial Evaluation (internal helper — not a Convex function)
 *
 * The underscore prefix keeps this file out of Convex's function scanner. It
 * is a plain module importable by queries (payments/reconciliation.ts,
 * payments/payoutEligibility.ts) and mutations (pricing/service.ts) alike —
 * deliberately flat so there are no circular dependencies.
 *
 * Single source of truth for interpreting the financial records of one order:
 *
 *   Financial records
 *     → evaluateOrderFinancials (here)
 *     → reconciliation read model (payments/reconciliation.ts)
 *     → payout eligibility gate   (payments/payoutEligibility.ts)
 *     → settlement completion hardening (pricing/service.ts)
 *
 * The evaluation is a PURE READ: it never inserts, patches, or deletes any
 * record, never moves money, and never calls pricing calculation services.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DELIVERY_STATUS } from "../schema";
import { findRefundRequiredAttempts } from "./_paymentAttempts";

// ─── Reconciliation States ────────────────────────────────────────────────────

/**
 * Derived (never persisted) reconciliation status for an order.
 *
 * - RECONCILED: customer payment verified AND settlement exists AND
 *   settlement completed. Does NOT mean accounting is done or a driver
 *   payout has occurred.
 * - UNPAID: no completed customer payment, no settlement.
 * - PAID_NO_SETTLEMENT: customer paid but no settlement exists (delivery not
 *   completed, or failed/cancelled per the compensation policy).
 * - SETTLEMENT_PENDING: settlement exists and is pending/payable.
 * - SETTLEMENT_PROCESSING: settlement marked processing by an authorized
 *   operator (payout in progress, by existing terminology).
 * - ANOMALY: authoritative records disagree; diagnostics attached; nothing
 *   auto-corrected.
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

// ─── Evaluation Result ────────────────────────────────────────────────────────

export interface OrderFinancialEvaluation {
  order: Doc<"orders">;
  /** Newest quote by calculatedAt (same rule as settlement creation). */
  quote: Doc<"delivery_quotes"> | null;
  /** Newest completed payment, or null when none exists. */
  completedPayment: Doc<"payment_transactions"> | null;
  /** Any failed/pending/processing attempts, for anomaly context. */
  allPayments: Doc<"payment_transactions">[];
  /** The single settlement, or null. */
  settlement: Doc<"settlements"> | null;
  /** The order's delivery, when one exists. */
  delivery: Doc<"deliveries"> | null;
  /** True when a completed payment exists AND its amount equals orders.price. */
  customerPaid: boolean;
  /** True when the completed payment amount matched orders.price. */
  paymentAmountVerified: boolean;
  /** True when a settlement record exists for the order. */
  driverEntitled: boolean;
  state: ReconciliationState;
  /** Human-readable diagnostics. Non-empty ⇒ state is (or includes) ANOMALY. */
  anomalies: string[];
}

// ─── Core Evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate the authoritative financial records of one order.
 * Reads order, quote(s), payment_transactions, settlements, and delivery —
 * all via existing indexes — and derives the reconciliation state.
 */
export async function evaluateOrderFinancials(
  ctx: Pick<QueryCtx, "db">,
  orderId: Id<"orders">
): Promise<OrderFinancialEvaluation> {
  const anomalies: string[] = [];

  // ── Order (authoritative customer charge) ──
  const order = await ctx.db.get(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // ── Quote (authoritative pricing breakdown) ──
  const quotes = (await ctx.db
    .query("delivery_quotes")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect()) as Doc<"delivery_quotes">[];
  // Newest quote is the authoritative one (same rule as settlement creation).
  const quote =
    quotes.length > 0
      ? quotes.slice().sort((a, b) => b.calculatedAt - a.calculatedAt)[0]
      : null;
  if (quotes.length > 1) {
    anomalies.push(
      `Multiple quotes exist (${quotes.length}); using the latest by calculatedAt`
    );
  }

  // ── Customer payment (server-verified provider records) ──
  const allPayments = (await ctx.db
    .query("payment_transactions")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect()) as Doc<"payment_transactions">[];

  // A verified duplicate charge stays `failed` with refundRequired metadata.
  // It does not count as a completed payment, but it must still surface: the
  // customer has been charged twice even though only one completion exists.
  const refundRequiredAttempts = findRefundRequiredAttempts(allPayments);
  if (refundRequiredAttempts.length > 0) {
    anomalies.push(
      `${refundRequiredAttempts.length} provider charge(s) require refund review (duplicate or post-refund)`
    );
  }

  const completedPayments = allPayments.filter((p) => p.status === "completed");

  // Multiple completed payments must never be silently collapsed.
  let completedPayment: Doc<"payment_transactions"> | null = null;
  if (completedPayments.length > 1) {
    anomalies.push(
      `${completedPayments.length} completed payments exist for this order — possible duplicate charge; do not treat as cleanly paid`
    );
    // Newest for diagnostics only; the anomaly blocks downstream eligibility.
    completedPayment = completedPayments.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
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

  // Quote/charge consistency.
  if (quote && quote.totalCharge !== order.price) {
    anomalies.push(
      `orders.price (${order.price}) does not match quote totalCharge (${quote.totalCharge})`
    );
  }

  // ── Settlement (driver entitlement) ──
  const settlements = (await ctx.db
    .query("settlements")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect()) as Doc<"settlements">[];
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

  // ── Delivery (context) ──
  const delivery =
    (await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .unique()) ?? null;

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

  return {
    order,
    quote,
    completedPayment,
    allPayments,
    settlement,
    delivery,
    customerPaid,
    paymentAmountVerified,
    driverEntitled,
    state,
    anomalies,
  };
}

/**
 * Derived platform revenue for an evaluated order: totalCharge −
 * driverEarnings from the STORED quote. Never a recalculation; never
 * recognized accounting revenue; never a payout.
 */
export function derivePlatformRevenue(
  evaluation: OrderFinancialEvaluation
): { amount: number; source: string } | null {
  const { quote } = evaluation;
  return quote !== null
    ? { amount: quote.totalCharge - quote.driverEarnings, source: "derived from stored quote" }
    : null;
}

/**
 * True when the delivery associated with the evaluation has reached the
 * DELIVERED terminal state (the only state that should ever carry a
 * settlement).
 */
export function isDeliveryDelivered(evaluation: OrderFinancialEvaluation): boolean {
  return evaluation.delivery?.status === DELIVERY_STATUS.DELIVERED;
}
