/**
 * Lasha Payment Actions — Paystack
 *
 * Customer payment initiation and server-authoritative verification.
 *
 * Why Paystack: docs/architecture.md designates Paystack as the payment
 * gateway (§6.3 action pattern, §12.1 services map, `PAYSTACK_SECRET_KEY` in
 * §16.3). The architecture was already written for it — this module realizes
 * that boundary: React → Convex action → Paystack → payment_transactions.
 *
 * Security model:
 *  - The secret key lives ONLY here (a Convex action), read from
 *    process.env.PAYSTACK_SECRET_KEY. It is never returned to the client and
 *    never appears in logs or audit events.
 *  - The payment amount is read server-side from the order (never accepted
 *    from the client).
 *  - Success is NEVER taken from the browser. The client's "return" to the
 *    app triggers verification, and the webhook independently verifies with
 *    signing-secret authentication. Marking a payment completed requires
 *    provider evidence via internal.payments.mutations.
 *  - Card details never enter the app: the only card path is Paystack's
 *    hosted checkout. There is no direct /charge call and no OTP relay.
 *  - Initiation is idempotent per order: repeated attempts reuse the same
 *    pending transaction/reference.
 */

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ROLES } from "../schema";
import {
  CARD_CHECKOUT_OPEN_MESSAGE,
  classifyProviderStatus,
} from "./_paymentAttempts";
import {
  normalizePaystackRefundStatus,
  requireProviderAmount,
  verifyPaystackTransaction,
} from "./_provider";

const PAYSTACK_BASE = "https://api.paystack.co";

type WalletPaymentResult = {
  alreadyPaid: boolean;
  paymentId?: string;
  reference?: string;
  balance?: number;
  duplicateCharge?: boolean;
};

type InitiatePaymentResult = {
  alreadyPaid: boolean;
  reference: string;
  authorizationUrl: string | null;
};

type WebhookEventResult =
  | { handled: false }
  | {
      handled: true;
      result: "completed" | "failed" | "duplicate" | "refunded" | "refund_pending";
    };

type AuthorizedOrderPaymentCtx = {
  orderId: Id<"orders">;
  orderStatus: string;
  deliveryStatus: string | null;
  amount: number;
  senderEmail: string | null;
  userId: Id<"users">;
  userRole: string;
  latestPayment: {
    orderId: Id<"orders">;
    userId: Id<"users">;
    amount: number;
    currency: "ZAR";
    method: string;
    provider: string;
    providerTransactionId?: string;
    status: "pending" | "processing" | "completed" | "failed" | "refunded";
    idempotencyKey: string;
    metadata?: string;
    createdAt: number;
    completedAt?: number;
  } | null;
  completedPayment: {
    transactionId: Id<"payment_transactions">;
    reference: string;
  } | null;
  refundedPayment: {
    transactionId: Id<"payment_transactions">;
    reference: string;
  } | null;
  pendingCards: Array<{
    transactionId: Id<"payment_transactions">;
    reference: string;
    createdAt: number;
  }>;
  failedAttempts: number;
};


// ─── Initiation ───────────────────────────────────────────────────────────────

/**
 * Initiate (or re-initiate idempotently) a customer payment for an order.
 *
 * Flow:
 *  1. Resolve the authenticated customer + authoritative order charge
 *     server-side (internal.payments.queries.getAuthorizedOrderForPayment).
 *  2. Reuse an existing pending transaction (idempotent initiation), or
 *     create a new one with a deterministic reference.
 *  3. Call Paystack transaction/initialize with that reference and amount.
 *  4. Return only the checkout URL + reference — no credentials, no internal IDs.
 */
export const initiateOrderPayment = action({
  args: {
    orderId: v.id("orders"),
    // Compatibility only: older deployments required a method argument. The
    // handler ignores it and always records the hosted card channel.
    method: v.optional(v.literal("card")),
  },
  handler: async (ctx, args): Promise<InitiatePaymentResult> => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "Payment provider is not configured. Add PAYSTACK_SECRET_KEY in the project's API keys settings."
      );
    }

    // Paystack returns the customer to the WEB app after checkout. SITE_URL is
    // the public frontend origin (the same variable Convex Auth uses);
    // CONVEX_SITE_URL is the backend function host and has no UI routes.
    const siteUrl = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    if (!siteUrl) {
      throw new Error(
        "Payment return URL is not configured. Add SITE_URL in the project's environment settings."
      );
    }

    // Authentication (session-derived). The Customer Portal is available to
    // every authenticated role, and order creation only requires a session, so
    // a sender's role must not block paying for their own order. Ownership is
    // enforced by the internal query below (and again by the write mutation).
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    // Server-side order + amount resolution (auth + ownership enforced inside).
    const orderCtx: AuthorizedOrderPaymentCtx = await ctx.runQuery(
      internal.payments.queries.getAuthorizedOrderForPayment,
      { orderId: args.orderId }
    );

    // Already paid → refuse re-payment (idempotent, no duplicate completion).
    // This checks ANY completed payment, not only the latest attempt: a failed
    // duplicate-charge quarantine can be newer than the completed payment.
    if (orderCtx.completedPayment) {
      return {
        alreadyPaid: true,
        reference: orderCtx.completedPayment.reference,
        authorizationUrl: null,
      };
    }

    // Payment eligibility is enforced server-side, not only by the page state.
    if (
      orderCtx.orderStatus === "cancelled" ||
      orderCtx.deliveryStatus === "cancelled" ||
      orderCtx.deliveryStatus === "failed"
    ) {
      throw new Error("This delivery was cancelled or failed — payment is no longer required");
    }
    if (orderCtx.refundedPayment) {
      throw new Error("This payment was refunded — no further payment is due");
    }
    if (!Number.isInteger(orderCtx.amount) || orderCtx.amount <= 0) {
      throw new Error("This delivery does not have a payable amount");
    }
    if (!orderCtx.senderEmail) {
      throw new Error(
        "Your account has no verified email address — a payment email is required"
      );
    }

    // Deterministic reference: one order gets one stable checkout reference.
    // A failed attempt increments the attempt counter so the retried checkout
    // gets a fresh reference (Paystack rejects reused references).
    const reference =
      orderCtx.failedAttempts === 0
        ? `pay-${orderCtx.orderId}`
        : `pay-${orderCtx.orderId}-r${orderCtx.failedAttempts}`;

    // Idempotent transaction creation (internal re-checks the reference). The
    // mutation also re-checks the order and any completed payment atomically,
    // which is what stops a card checkout being created after a wallet debit.
    const creation = await ctx.runMutation(
      internal.payments.mutations.createPaymentTransaction,
      {
        orderId: orderCtx.orderId,
        userId: orderCtx.userId,
        amount: orderCtx.amount,
        method: "card",
        reference,
        metadata: JSON.stringify({ attempt: orderCtx.failedAttempts + 1 }),
      },
    );
    if (creation.alreadyPaid) {
      return {
        alreadyPaid: true,
        reference: creation.reference,
        authorizationUrl: null,
      };
    }

    // Idempotent initiation: if Paystack was already initialized for this
    // reference we re-verify its status rather than re-initializing.
    // (Simplest safe path: always re-initialize — Paystack returns a fresh
    // authorization URL for the same reference with no charge side-effect
    // until the customer completes checkout.)

    // Paystack initialize — amount in subunits (kobo) = our cents.
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: orderCtx.senderEmail,
        amount: orderCtx.amount, // cents == kobo
        reference,
        currency: "ZAR",
        metadata: { orderId: orderCtx.orderId, method: "card" },
        // Return to the order-scoped checkout; verification is server-side
        // regardless of what the browser does with this URL.
        callback_url: `${siteUrl}/checkout/${orderCtx.orderId}?reference=${encodeURIComponent(reference)}`,
      }),
    });

    if (!response.ok) {
      // Do not relay the provider's raw response body to the browser; it can
      // contain request metadata that is of no use to the customer.
      throw new Error(`Payment provider error (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      status: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };

    if (!data.status || !data.data?.authorization_url) {
      throw new Error(`Payment provider rejected initialization: ${data.message ?? "unknown error"}`);
    }

    return {
      alreadyPaid: false,
      reference,
      authorizationUrl: data.data.authorization_url,
    };
  },
});

// ─── Wallet payment ──────────────────────────────────────────────────────────

/**
 * Pay an order from the authenticated customer's wallet. No amount, wallet ID,
 * or provider status is accepted from the client — the order charge is resolved
 * server-side and the debit + payment completion happen in one mutation.
 */
export const payOrderWithWallet = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args): Promise<WalletPaymentResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    // No role gate here: the Customer Portal and order creation are open to
    // every authenticated role. The query and wallet mutation enforce that the
    // payer is the order's sender.
    const orderCtx: AuthorizedOrderPaymentCtx = await ctx.runQuery(
      internal.payments.queries.getAuthorizedOrderForPayment,
      { orderId: args.orderId },
    );

    if (orderCtx.completedPayment) {
      return {
        alreadyPaid: true,
        reference: orderCtx.completedPayment.reference,
      };
    }
    if (orderCtx.refundedPayment) {
      throw new Error("This payment was refunded — no further payment is due");
    }

    // A wallet debit must not race a card checkout that can still succeed.
    // Re-verify every open card attempt first:
    //   - provider success -> finalize the card, return "already paid"
    //   - failed/abandoned/reversed -> close that attempt, then try the wallet
    //   - ongoing/unknown -> block, because the card can still charge later
    if (orderCtx.pendingCards.length > 0) {
      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!secretKey) {
        throw new Error(CARD_CHECKOUT_OPEN_MESSAGE);
      }

      for (const pending of orderCtx.pendingCards) {
        const verification = await verifyPaystackTransaction(
          secretKey,
          pending.reference,
        );
        const outcome = classifyProviderStatus(verification.status);

        if (outcome === "success") {
          const amount = requireProviderAmount(verification);
          const completion = await ctx.runMutation(
            internal.payments.mutations.completePaymentTransaction,
            {
              transactionId: pending.transactionId,
              providerTransactionId: verification.id ?? pending.reference,
              providerStatus: verification.status,
              amountFromProvider: amount,
            },
          );

          if (completion.duplicate) {
            return {
              alreadyPaid: true,
              reference: pending.reference,
              duplicateCharge: true,
            };
          }
          if (!completion.success) {
            throw new Error(
              "The card payment could not be finalized. Please return to card checkout instead.",
            );
          }
          return { alreadyPaid: true, reference: pending.reference };
        }

        if (outcome === "failed") {
          const failed = await ctx.runMutation(
            internal.payments.mutations.failPaymentTransaction,
            {
              transactionId: pending.transactionId,
              reason: `provider reported ${verification.status}`,
            },
          );
          if ("alreadyCompleted" in failed && failed.alreadyCompleted) {
            return { alreadyPaid: true, reference: pending.reference };
          }
          continue;
        }

        // ongoing / pending / unknown: the hosted checkout is still open.
        throw new Error(CARD_CHECKOUT_OPEN_MESSAGE);
      }
    }

    return await ctx.runMutation(
      internal.payments.mutations.payOrderFromWallet,
      { orderId: args.orderId, userId },
    );
  },
});

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify a payment with Paystack (server-authoritative).
 *
 * Called when the customer returns from checkout. The browser cannot fake
 * this: the transaction status comes from Paystack's API using the secret
 * key, keyed by the internal reference (which the client cannot choose
 * arbitrarily — it must exist as our internal idempotency key).
 *
 * Safe to call repeatedly (verification is idempotent through the internal
 * mutations' state guards).
 */
export const verifyOrderPayment = action({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Payment provider is not configured");
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    // Resolve OUR internal transaction by reference — never trust a
    // client-supplied transaction/status payload.
    const tx = await ctx.runQuery(internal.payments.queries.getPaymentByReference, {
      reference: args.reference,
    });
    if (!tx) {
      throw new Error("Unknown payment reference");
    }

    // Only the payer (or super admin) may verify.
    if (tx.userId !== userId) {
      const roleCtx = await ctx.runQuery(internal.payments.queries.getUserRoleForPayment, {
        userId,
      });
      if (!roleCtx || roleCtx.role !== ROLES.SUPER_ADMIN) {
        throw new Error("Access denied: not your payment");
      }
    }

    // Already authoritative; no provider round-trip needed.
    if (tx.status === "completed") {
      return { status: "completed" as const, duplicate: false as const };
    }
    if (tx.status === "refunded") {
      return { status: "refunded" as const, duplicate: false as const };
    }

    // Ask Paystack for the authoritative status. A previously failed record is
    // still re-checked: a later verified success must be able to rescue a
    // customer who was charged after the failure was recorded.
    const verification = await verifyPaystackTransaction(secretKey, args.reference);
    const outcome = classifyProviderStatus(verification.status);

    if (outcome === "success") {
      const amountFromProvider = requireProviderAmount(verification);
      const completion = await ctx.runMutation(
        internal.payments.mutations.completePaymentTransaction,
        {
          transactionId: tx._id,
          providerTransactionId: verification.id ?? args.reference,
          providerStatus: verification.status,
          amountFromProvider,
        },
      );

      if (completion.duplicate) {
        // The order was already paid by another attempt. The duplicate is
        // quarantined by the mutation; the UI should not claim a second
        // successful payment.
        return { status: "completed" as const, duplicate: true as const };
      }
      if (!completion.success) {
        return { status: "failed" as const, duplicate: false as const };
      }
      return { status: "completed" as const, duplicate: false as const };
    }

    if (outcome === "failed") {
      await ctx.runMutation(internal.payments.mutations.failPaymentTransaction, {
        transactionId: tx._id,
        reason: `provider reported ${verification.status}`,
      });
      return { status: "failed" as const, duplicate: false as const };
    }

    // ongoing / pending / unknown — still active from our perspective.
    return { status: "pending" as const, duplicate: false as const };
  },
});

// ─── Webhook (called from http.ts) ────────────────────────────────────────────

/**
 * Process a verified Paystack webhook event. Exported for the httpAction in
 * http.ts (which performs signature verification BEFORE calling this).
 *
 * Event handling:
 *  - charge.success → completePaymentTransaction (idempotent)
 *  - charge.failed  → failPaymentTransaction   (idempotent)
 *  - others         → ignored (200 so Paystack stops retrying)
 *
 * The internal transaction is resolved by reference (Paystack's data.reference
 * is our idempotency key) — arbitrary order IDs from the payload are never
 * trusted.
 */
export const processWebhookEvent = internalAction({
  args: {
    reference: v.string(),
    event: v.string(),
    providerTransactionId: v.optional(v.string()),
    amountFromProvider: v.optional(v.number()),
    refundReference: v.optional(v.string()),
    refundStatus: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<WebhookEventResult> => {
    // Refund events carry the original transaction reference in the flat
    // `data.transaction_reference` field. Only automatic duplicate-charge
    // refunds are tracked here; general refunds remain manual.
    if (args.event.startsWith("refund.")) {
      const refund = await ctx.runQuery(
        internal.payments.refunds.getAutomaticRefundByReference,
        { reference: args.reference },
      );
      if (!refund) return { handled: false as const };

      const eventStatus =
        args.event === "refund.processed"
          ? "processed"
          : args.event === "refund.failed"
            ? "failed"
            : args.event === "refund.processing"
              ? "processing"
              : args.event === "refund.pending"
                ? "pending"
                : null;
      const status =
        normalizePaystackRefundStatus(args.refundStatus) ??
        normalizePaystackRefundStatus(eventStatus);
      if (!status) return { handled: false as const };

      await ctx.runMutation(
        internal.payments.refunds.recordProviderRefund,
        {
          refundId: refund._id,
          status,
          providerRefundReference: args.refundReference,
          amountFromProvider: args.amountFromProvider,
        },
      );

      return {
        handled: true as const,
        result:
          status === "processed"
            ? ("refunded" as const)
            : status === "failed"
              ? ("failed" as const)
              : ("refund_pending" as const),
      };
    }

    const tx = await ctx.runQuery(internal.payments.queries.getPaymentByReference, {
      reference: args.reference,
    });

    // Wallet top-ups use their own table but the same signed webhook. Resolve
    // them by our reference first; unknown references are acknowledged without
    // touching state.
    if (!tx) {
      const topUp = await ctx.runQuery(
        internal.payments.walletTopUps.getWalletTopUpByReference,
        { reference: args.reference },
      );
      if (!topUp) {
        return { handled: false as const };
      }

      if (args.event === "charge.success") {
        if (args.amountFromProvider === undefined) {
          // Paystack always includes the charged amount on charge.success.
          // Refuse to credit wallet value from an amount-less event.
          throw new Error("Webhook charge.success is missing the provider amount");
        }
        await ctx.runMutation(
          internal.payments.walletTopUps.completeWalletTopUp,
          {
            topUpId: topUp._id,
            providerTransactionId: args.providerTransactionId ?? args.reference,
            providerStatus: "success",
            amountFromProvider: args.amountFromProvider,
          },
        );
        return { handled: true as const, result: "completed" as const };
      }

      if (args.event === "charge.failed") {
        await ctx.runMutation(
          internal.payments.walletTopUps.failWalletTopUp,
          {
            topUpId: topUp._id,
            reason: "provider webhook reported charge.failed",
          },
        );
        return { handled: true as const, result: "failed" as const };
      }

      return { handled: false as const };
    }

    if (args.event === "charge.success") {
      if (args.amountFromProvider === undefined) {
        throw new Error("Webhook charge.success is missing the provider amount");
      }
      const completion = await ctx.runMutation(
        internal.payments.mutations.completePaymentTransaction,
        {
          transactionId: tx._id,
          providerTransactionId: args.providerTransactionId ?? args.reference,
          providerStatus: "success",
          amountFromProvider: args.amountFromProvider,
        },
      );
      return {
        handled: true as const,
        result: completion.duplicate ? ("duplicate" as const) : ("completed" as const),
      };
    }

    if (args.event === "charge.failed") {
      await ctx.runMutation(internal.payments.mutations.failPaymentTransaction, {
        transactionId: tx._id,
        reason: "provider webhook reported charge.failed",
      });
      return { handled: true as const, result: "failed" as const };
    }

    return { handled: false as const };
  },
});
