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
import {
  CARD_CHECKOUT_OPEN_MESSAGE,
  evaluateCardCreationGate,
  evaluateCompletionGate,
  evaluateWalletPaymentGate,
} from "./_paymentAttempts";

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
    // Re-read the authoritative order inside the write transaction. The action
    // checked it before starting, but cancellation, a price change, or a
    // competing wallet payment may have happened in between.
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.senderId !== args.userId) {
      throw new Error("Access denied: you can only pay for your own orders");
    }
    if (order.price !== args.amount) {
      throw new Error(
        "The order amount changed while starting checkout — refresh and try again",
      );
    }
    if (!Number.isInteger(args.amount) || args.amount <= 0) {
      throw new Error("This delivery does not have a payable amount");
    }

    const delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();
    if (
      order.status === "cancelled" ||
      delivery?.status === "cancelled" ||
      delivery?.status === "failed"
    ) {
      throw new Error("This delivery was cancelled or failed — payment is no longer required");
    }

    const existing = await ctx.db
      .query("payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    // A completed payment — card or wallet — makes this order terminal for
    // payment purposes. This is the authoritative gate that closes the race
    // where a card checkout is initiated after a wallet debit has committed.
    const creationGate = evaluateCardCreationGate(existing);
    if (creationGate.kind === "already_paid") {
      return {
        transactionId: creationGate.payment._id,
        alreadyExists: true,
        alreadyPaid: true as const,
        reference: creationGate.payment.idempotencyKey,
      };
    }
    if (creationGate.kind === "refunded") {
      throw new Error("This payment was refunded — no further payment is due");
    }

    // Idempotency guard — resolve by the deterministic reference after the
    // order-level paid/refunded checks above.
    const byRef = await ctx.db
      .query("payment_transactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.reference))
      .first();
    if (byRef) {
      return {
        transactionId: byRef._id,
        alreadyExists: true,
        alreadyPaid: false as const,
        reference: byRef.idempotencyKey,
      };
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

    return {
      transactionId,
      alreadyExists: false,
      alreadyPaid: false as const,
      reference: args.reference,
    };
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
 * Idempotent and concurrency-safe:
 *  - `completed` short-circuits with `alreadyCompleted: true`.
 *  - `pending`/`processing` complete normally.
 *  - A `failed` transaction MAY still be completed by a later verified
 *    provider success. This is deliberate: a failure can be recorded before a
 *    provider charge settles (or from an earlier lifecycle event), and letting
 *    that record permanently reject the authoritative success would leave the
 *    customer charged but the order unpaid. A new attempt is not required.
 *  - Before any completion, the whole order is checked. If a DIFFERENT
 *    payment is already completed, the incoming charge is not allowed to
 *    become a second successful payment. It is quarantined as `failed` with
 *    `refundRequired` metadata so reconciliation flags it for refund review.
 */
export const completePaymentTransaction = internalMutation({
  args: {
    transactionId: v.id("payment_transactions"),
    providerTransactionId: v.string(),
    providerStatus: v.string(),
    // Required: a provider success without an amount cannot prove the charge.
    amountFromProvider: v.number(),
  },
  handler: async (ctx, args) => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Payment transaction not found");

    // Idempotency: already done — return unchanged.
    if (tx.status === "completed") {
      return {
        success: true,
        alreadyCompleted: true,
        duplicate: false as const,
      };
    }

    if (tx.status === "refunded") {
      return {
        success: false,
        alreadyCompleted: false,
        alreadyRefunded: true as const,
        duplicate: false as const,
      };
    }

    if (args.providerStatus !== "success") {
      throw new Error("Only a verified provider success can complete a payment");
    }
    if (!Number.isInteger(args.amountFromProvider)) {
      throw new Error("Provider amount must be a whole number of cents");
    }

    // Amount integrity: the provider amount must match the authoritative
    // stored charge (cents). This is checked even for late successes.
    if (args.amountFromProvider !== tx.amount) {
      throw new Error(
        `Payment amount mismatch: provider reported ${args.amountFromProvider}, order charge is ${tx.amount} — refusing to complete`
      );
    }

    // Provider evidence integrity, before any state transition.
    if (
      tx.providerTransactionId &&
      tx.providerTransactionId !== args.providerTransactionId
    ) {
      throw new Error("Provider transaction ID mismatch — refusing to complete");
    }

    // Cross-method duplicate guard: only one completed payment may exist for
    // an order, regardless of provider, reference, or attempt order.
    const attempts = await ctx.db
      .query("payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", tx.orderId))
      .collect();
    const completionGate = evaluateCompletionGate(attempts, args.transactionId);

    const now = Date.now();

    if (completionGate.kind === "duplicate") {
      const duplicateReason =
        "A second payment completed after this order was already paid — duplicate charge requires refund review";
      await ctx.db.patch(args.transactionId, {
        status: "failed",
        providerTransactionId: args.providerTransactionId,
        completedAt: now,
        metadata: JSON.stringify({
          duplicatePayment: true,
          refundRequired: true,
          duplicateOf: completionGate.payment._id,
          duplicateReference: completionGate.payment.idempotencyKey,
          providerStatus: args.providerStatus,
          providerAmount: args.amountFromProvider,
          failureReason: duplicateReason,
        }),
      });

      await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
        actorId: tx.userId,
        actorRole: "system",
        action: AUDIT_ACTIONS.PAYMENT_FAILED,
        entityType: "payment_transaction",
        entityId: args.transactionId,
        metadata: JSON.stringify({
          reference: tx.idempotencyKey,
          amount: tx.amount,
          reason: duplicateReason,
          duplicateOf: completionGate.payment._id,
          refundRequired: true,
          providerTransactionId: args.providerTransactionId,
        }),
        orderId: tx.orderId,
      });

      return {
        success: false,
        alreadyCompleted: false,
        duplicate: true as const,
        completedPaymentId: completionGate.payment._id,
      };
    }

    // Attach provider evidence, then complete.
    await ctx.db.patch(args.transactionId, {
      status: "completed",
      providerTransactionId: args.providerTransactionId,
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
        recoveredFromFailed: tx.status === "failed",
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
    return {
      success: true,
      alreadyCompleted: false,
      duplicate: false as const,
    };
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
    if (tx.status === "refunded") {
      // A refund is a terminal financial reversal; a late failure event must
      // not rewrite it as an ordinary failed attempt.
      return { success: true, alreadyRefunded: true };
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

// ─── Wallet Payment ──────────────────────────────────────────────────────────

/**
 * Pay an order from the authenticated user's Lasha wallet.
 *
 * This is the wallet equivalent of a verified card payment: the amount comes
 * from the stored order, the wallet is debited in the same transaction as the
 * completed payment record, and a debit ledger row is written. A deterministic
 * reference (`wallet-<orderId>`) plus the already-paid check make retries
 * idempotent. There is no provider involved — the wallet is the evidence.
 */
export const payOrderFromWallet = internalMutation({
  args: {
    orderId: v.id("orders"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.senderId !== args.userId) {
      throw new Error("Access denied: you can only pay for your own orders");
    }
    const delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();
    if (
      order.status === "cancelled" ||
      delivery?.status === "cancelled" ||
      delivery?.status === "failed"
    ) {
      throw new Error("This delivery was cancelled or failed — payment is no longer required");
    }

    const existingPayments = await ctx.db
      .query("payment_transactions")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const walletGate = evaluateWalletPaymentGate(existingPayments);
    if (walletGate.kind === "already_paid") {
      return {
        alreadyPaid: true,
        paymentId: walletGate.payment._id,
        reference: walletGate.payment.idempotencyKey,
      };
    }
    if (walletGate.kind === "card_pending") {
      // A hosted card checkout can still succeed. Debiting the wallet here
      // would create the exact cross-method double-charge race this guard
      // exists to prevent.
      throw new Error(CARD_CHECKOUT_OPEN_MESSAGE);
    }
    if (walletGate.kind === "refunded") {
      throw new Error("This payment was refunded — no further payment is due");
    }

    const amount = order.price;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("This delivery does not have a payable amount");
    }

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!wallet) {
      throw new Error(
        "Your wallet has no funds yet. Top up your wallet before paying for this delivery.",
      );
    }
    if (!wallet.isActive) {
      throw new Error("Your wallet is inactive; payment cannot be taken from it");
    }
    if (wallet.balance < amount) {
      throw new Error(
        "Insufficient wallet balance. Top up your wallet or choose another payment method.",
      );
    }

    const reference = `wallet-${args.orderId}`;
    const existingByReference = await ctx.db
      .query("payment_transactions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", reference))
      .first();
    if (existingByReference?.status === "completed") {
      return {
        alreadyPaid: true,
        paymentId: existingByReference._id,
        reference,
      };
    }
    if (existingByReference) {
      throw new Error(
        "A wallet payment for this delivery is already being processed",
      );
    }

    const now = Date.now();

    await ctx.db.patch(wallet._id, {
      balance: wallet.balance - amount,
      updatedAt: now,
    });

    const ledgerTransactionId = await ctx.db.insert("transactions", {
      walletId: wallet._id,
      type: "debit",
      amount,
      description: `Payment for delivery ${order.trackingNumber ?? ""}`.trim(),
      reference,
      status: "completed",
      orderId: order._id,
      createdAt: now,
    });

    const paymentId = await ctx.db.insert("payment_transactions", {
      orderId: order._id,
      userId: args.userId,
      amount,
      currency: "ZAR",
      method: "wallet",
      provider: "lasha_wallet",
      providerTransactionId: reference,
      status: "completed",
      idempotencyKey: reference,
      metadata: JSON.stringify({
        channel: "wallet",
        ledgerTransactionId,
      }),
      createdAt: now,
      completedAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: args.userId,
      actorRole: "customer",
      action: AUDIT_ACTIONS.PAYMENT_CONFIRMED,
      entityType: "payment_transaction",
      entityId: paymentId,
      metadata: JSON.stringify({
        reference,
        amount,
        method: "wallet",
      }),
      orderId: order._id,
    });

    await ctx.runMutation(internal.notifications.service.sendPaymentNotification, {
      userId: args.userId,
      eventType: "payment_confirmed",
      templateData: { orderId: paymentId.slice(-6).toUpperCase() },
    });

    return {
      alreadyPaid: false,
      paymentId,
      reference,
      balance: wallet.balance - amount,
    };
  },
});
