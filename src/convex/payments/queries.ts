/**
 * Lasha Payment Queries
 *
 * Customer payment queries. All reads are scoped to the authenticated user —
 * the client never supplies a customer/business/order owner identity.
 *
 * Layer 1 of the financial model (see docs/customer-payment.md):
 *   Customer charge (orders.price / delivery_quotes) → payment_transactions.
 * Payment status here NEVER touches driver settlements or delivery state.
 */

import { query, internalQuery, type QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentAuthUser } from "../auth/authorization";
import { ROLES } from "../schema";
import {
  findActiveCardAttempts,
  findCompletedPayment,
  findRefundedPayment,
} from "./_paymentAttempts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Payment inspection authorization. Resolves entirely from the authenticated
 * session:
 *  - the order's sender
 *  - a company_admin belonging to the order's business
 *  - super_admin
 * Drivers / fleet managers / anonymous users have no access.
 */
function canInspectOrder(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentAuthUser>>>,
  order: Doc<"orders">
): boolean {
  if (order.senderId === user.userId) return true;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  if (
    user.role === ROLES.COMPANY_ADMIN &&
    order.businessId !== undefined &&
    user.businessId !== undefined &&
    order.businessId === user.businessId
  ) {
    return true;
  }
  return false;
}

/**
 * Authoritative payment facts for an order.
 *
 * The latest attempt drives the visible pending/failed label, but "paid" and
 * "refunded" are derived from ANY attempt. A later failed duplicate-charge
 * quarantine must never make an already-paid order look unpaid.
 */
async function paymentStateForOrder(
  ctx: Pick<QueryCtx, "db">,
  orderId: Id<"orders">
): Promise<{
  latest: Doc<"payment_transactions"> | null;
  completed: Doc<"payment_transactions"> | null;
  refunded: Doc<"payment_transactions"> | null;
  activeCards: Doc<"payment_transactions">[];
}> {
  const txs = await ctx.db
    .query("payment_transactions")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const sorted = txs.sort((a, b) => b.createdAt - a.createdAt);
  return {
    latest: sorted[0] ?? null,
    completed: findCompletedPayment(sorted),
    refunded: findRefundedPayment(sorted),
    activeCards: findActiveCardAttempts(sorted),
  };
}

// ─── Public Queries ───────────────────────────────────────────────────────────

/**
 * Payment overview for the authenticated customer: their orders with the
 * authoritative charge and the latest payment transaction state. Checkout and
 * delivery tracking filter this customer-scoped read model to the order they
 * are displaying; the client never receives another customer's rows.
 *
 * Excludes settlement and wallet data — customers do not see driver financials.
 */
export const getMyPaymentOverview = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Every role can be an order sender in the Customer Portal, so always
    // include the user's own orders. A company admin additionally sees the
    // business's orders; canInspectOrder below remains the final scope check.
    const ordersById = new Map(
      (
        await ctx.db
          .query("orders")
          .withIndex("by_sender", (q) => q.eq("senderId", user.userId))
          .collect()
      ).map((order) => [order._id, order])
    );

    if (user.role === ROLES.COMPANY_ADMIN && user.businessId !== undefined) {
      const businessOrders = await ctx.db
        .query("orders")
        .withIndex("by_business", (q) => q.eq("businessId", user.businessId!))
        .collect();
      for (const order of businessOrders) {
        ordersById.set(order._id, order);
      }
    }

    const orders = [...ordersById.values()];
    const overview = [];
    for (const order of orders) {
      if (!canInspectOrder(user, order)) continue;
      const state = await paymentStateForOrder(ctx, order._id);
      const payment = state.latest;
      overview.push({
        orderId: order._id,
        trackingNumber: order.trackingNumber ?? null,
        orderStatus: order.status,
        createdAt: order.createdAt,
        // Authoritative customer charge — stored at order creation.
        amount: order.price,
        // Paid/refunded are order-level facts, not the latest attempt's state.
        paid: state.completed !== null,
        refunded: state.refunded !== null,
        hasOpenCardCheckout: state.activeCards.length > 0,
        payment: payment
          ? {
              status: payment.status,
              provider: payment.provider,
              amount: payment.amount,
              createdAt: payment.createdAt,
              completedAt: payment.completedAt ?? null,
            }
          : null,
      });
    }

    return overview.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ─── Internal Queries (for payment actions) ──────────────────────────────────

/**
 * Resolve an order for payment initiation/verification. Authentication and
 * ownership are enforced here (identity from the session, never from args).
 * Returns the authoritative charge and any existing payment transactions so
 * the action can stay idempotent.
 */
export const getAuthorizedOrderForPayment = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Initiation is limited to the order's sender (the customer being
    // charged). Company admins and operations may inspect but not initiate —
    // no established business rule permits them to pay on a sender's behalf.
    if (order.senderId !== user.userId && user.role !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: you can only pay for your own orders");
    }

    const sender = await ctx.db.get(order.senderId);
    const email = sender?.email ?? undefined;

    const existing = await ctx.db
      .query("payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const sorted = existing.sort((a, b) => b.createdAt - a.createdAt);
    const completedPayment = findCompletedPayment(sorted);
    const refundedPayment = findRefundedPayment(sorted);
    const pendingCards = findActiveCardAttempts(sorted);
    const delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();

    return {
      orderId: order._id,
      orderStatus: order.status,
      deliveryStatus: delivery?.status ?? null,
      // The authoritative amount — never taken from the client.
      amount: order.price,
      senderEmail: email ?? null,
      userId: user.userId,
      userRole: user.role,
      latestPayment: sorted[0] ?? null,
      // Order-level facts used by both payment actions. `latestPayment` alone
      // is insufficient: a failed duplicate quarantine can be newer than the
      // completed payment it duplicates.
      completedPayment: completedPayment
        ? {
            transactionId: completedPayment._id,
            reference: completedPayment.idempotencyKey,
          }
        : null,
      refundedPayment: refundedPayment
        ? {
            transactionId: refundedPayment._id,
            reference: refundedPayment.idempotencyKey,
          }
        : null,
      pendingCards: pendingCards.map((attempt) => ({
        transactionId: attempt._id,
        reference: attempt.idempotencyKey,
        createdAt: attempt.createdAt,
      })),
      failedAttempts: sorted.filter((t) => t.status === "failed").length,
    };
  },
});

/**
 * Resolve a payment transaction by provider reference (idempotency key).
 * Used by the webhook handler and verification flows. Internal — no auth,
 * the webhook route verifies the provider signature before calling.
 */
export const getPaymentByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payment_transactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.reference))
      .first();
  },
});

/**
 * Full transaction record for completion checks (webhook/verify).
 */
export const getPaymentTransaction = internalQuery({
  args: { transactionId: v.id("payment_transactions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.transactionId);
  },
});

/**
 * Load the authenticated user's role identity for action-level role checks
 * (actions have no db access, so this internal query provides it).
 */
export const getUserRoleForPayment = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      userId: user._id,
      role: user.role as string,
      businessId: user.businessId,
    };
  },
});
