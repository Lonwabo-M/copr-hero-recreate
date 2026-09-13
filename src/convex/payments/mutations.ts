/**
 * Lasha Payment Mutations (internal)
 *
 * All payment record mutations are internal — React can never write payment
 * state directly, and there is no public mutation accepting
 * `{ paymentSuccessful: true }`. Status changes are driven exclusively by
 * verified provider evidence (Paystack verify/webhook) through the actions
 * in payments/actions.ts.
 *
 * State model (payment_transactions.status, from schema):
 *   pending    — checkout created, awaiting provider confirmation
 *   processing — provider reports success; confirmation being finalized
 *   completed  — server-verified success (authoritative "paid")
 *   failed     — provider reported failure or verification failed
 *   refunded   — minimal representation only; no refund workflow yet
 *
 * Financial invariants (docs/customer-payment.md §5):
 *   - amount integrity: the stored order/quote charge is used; never client data
 *   - idempotency:      one provider reference ⇒ one transaction ⇒ one completion
 *   - settlement separation: these mutations never touch settlements
 *   - delivery separation:   these mutations never touch deliveries/orders state
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { AUDIT_ACTIONS } from "../audit/service";
import { internal } from "../_generated/api";

// ─── Transaction Creation ─────────────────────────────────────────────────────

/**
 * Create (or reuse) a pending payment transaction for an order.
 *
 * Idempotency: the reference IS the idempotency key (`pay-${orderId}-${seq}`).
 * Callers first check via payments.queries.getPaymentByReference; if that
 * misses (e.g. concurrent initiation), this mutation re-checks by reference
 * and returns the existing record instead of inserting a duplicate.
 *
 * Amount: always supplied from the server-read order price (see
 * payments.queries.getAuthorizedOrderForPayment). The client cannot influence it.
 */
export const createPaymentTransaction = internalMutation({
  args: {
    orderId: v.id("orders"),
    userId: v.id("users"),
    amount: v.number(),
    method: v.string(),
    reference: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotency guard — resolve by the deterministic reference first.
    const byRef = await ctx.db
      .query("payment_transactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.reference))
      .first();
    if (byRef) {
      return { transactionId: byRef._id, alreadyExists: true };
    }

    const now = Date.now();

    const transactionId = await ctx.db.insert("payment_transactions", {
      orderId: args.orderId,
      userId: args.userId,
      amount: args.amount,
      currency: "ZAR",
      method: args.method,
      provider: "paystack",
      providerTransactionId: undefined,
      status: "pending",
      idempotencyKey: args.reference,
      metadata: args.metadata,
      createdAt: now,
    });

    // Audit: payment initiated (safe references only — no credentials).
    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: args.userId,
      actorRole: "customer",
      action: AUDIT_ACTIONS.PAYMENT_INITIATED,
      entityType: "payment_transaction",
      entityId: transactionId,
      metadata: JSON.stringify({
        reference: args.reference,
        amount: args.amount,
        method: args.method,
        provider: "paystack",
      }),
      orderId: args.orderId,
    });

    return { transactionId, alreadyExists: false };
  },
});

// ─── Provider-Evidenced Transitions ──────────────────────────────────────────

/**
 * Attach the provider transaction ID to a pending transaction.
 * Called during verification before a status transition.
 */
export const attachProviderTransaction = internalMutation({
  args: {
    transactionId: v.id("payment_transactions"),
    providerTransactionId: v.string(),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Payment transaction not found");
    if (tx.providerTransactionId && tx.providerTransactionId !== args.providerTransactionId) {
      throw new Error(
        "Provider transaction ID mismatch — refusing to overwrite existing evidence"
      );
    }
    if (tx.providerTransactionId === args.providerTransactionId) return { success: true };
    await ctx.db.patch(args.transactionId, {
      providerTransactionId: args.providerTransactionId,
    });
    return { success: true };
  },
});

/**
 * Mark a payment completed — ONLY from verified provider evidence.
 *
 * Idempotent and concurrency-safe: completion only transitions from
 * `pending`/`processing`. A `completed` transaction short-circuits with
 * `alreadyCompleted: true`; a `failed` transaction refuses completion
 * (a failed payment cannot be resurrected by a stray late webhook — a new
 * attempt creates a new reference).
 */
export const completePaymentTransaction = internalMutation({
  args: {
    transactionId: v.id("payment_transactions"),
    providerTransactionId: v.string(),
    providerStatus: v.string(),
    amountFromProvider: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Payment transaction not found");

    // Idempotency: already done — return unchanged.
    if (tx.status === "completed") {
      return { success: true, alreadyCompleted: true };
    }

    if (tx.status === "failed") {
      throw new Error(
        "Payment transaction is failed; provider success cannot be applied to it"
      );
    }

    if (tx.status === "refunded") {
      throw new Error("Payment transaction is refunded; cannot be completed");
    }

    // Amount integrity: if the provider reports an amount, it must match the
    // authoritative stored charge (cents).
    if (
      args.amountFromProvider !== undefined &&
      args.amountFromProvider !== tx.amount
    ) {
      throw new Error(
        `Payment amount mismatch: provider reported ${args.amountFromProvider}, order charge is ${tx.amount} — refusing to complete`
      );
    }

    // Attach provider evidence, then complete.
    if (!tx.providerTransactionId) {
      await ctx.db.patch(args.transactionId, {
        providerTransactionId: args.providerTransactionId,
      });
    } else if (tx.providerTransactionId !== args.providerTransactionId) {
      throw new Error("Provider transaction ID mismatch — refusing to complete");
    }

    const now = Date.now();
    await ctx.db.patch(args.transactionId, {
      status: "completed",
      completedAt: now,
    });

    // Audit: payment confirmed.
    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: tx.userId,
      actorRole: "system",
      action: AUDIT_ACTIONS.PAYMENT_CONFIRMED,
      entityType: "payment_transaction",
      entityId: args.transactionId,
      metadata: JSON.stringify({
        reference: tx.idempotencyKey,
        amount: tx.amount,
        providerStatus: args.providerStatus,
        providerTransactionId: args.providerTransactionId,
      }),
      orderId: tx.orderId,
    });

    // Notify the customer their payment was confirmed. Recipient is the
    // transaction's authoritative payer (server-resolved); internal mutation
    // so no client identity is involved. Customer-safe wording only — no
    // settlement/settlement internals are exposed.
    await ctx.runMutation(internal.notifications.service.sendPaymentNotification, {
      userId: tx.userId,
      eventType: "payment_confirmed",
      templateData: { orderId: args.transactionId.slice(-6).toUpperCase() },
    });

    // NOTE: Deliberately NO calls to processSettlement/completeSettlement and
    // NO changes to deliveries/orders. Customer payment ≠ driver settlement
    // (docs/customer-payment.md §5).
    return { success: true, alreadyCompleted: false };
  },
});

/**
 * Mark a payment failed — from verified provider evidence (webhook
 * charge.failed / verification returning failed status).
 *
 * Idempotent: a failed transaction stays failed (idempotent no-op).
 * A completed transaction refuses failure (verified success wins).
 */
export const failPaymentTransaction = internalMutation({
  args: {
    transactionId: v.id("payment_transactions"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Payment transaction not found");

    if (tx.status === "failed") {
      return { success: true, alreadyFailed: true };
    }
    if (tx.status === "completed") {
      // Verified success beats a late failure event; keep the completion.
      return { success: true, alreadyCompleted: true };
    }

    const now = Date.now();
    await ctx.db.patch(args.transactionId, {
      status: "failed",
      completedAt: now,
      metadata: JSON.stringify({ failureReason: args.reason }),
    });

    // Audit: payment failed.
    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: tx.userId,
      actorRole: "system",
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entityType: "payment_transaction",
      entityId: args.transactionId,
      metadata: JSON.stringify({
        reference: tx.idempotencyKey,
        amount: tx.amount,
        reason: args.reason,
      }),
      orderId: tx.orderId,
    });

    return { success: true, alreadyFailed: false };
  },
});
