/**
 * Wallet Top-ups — Paystack funding for a user's Lasha wallet.
 *
 * Security model:
 *  - The amount is chosen by the authenticated user, validated server-side
 *    (integer cents, min/max), and sent to Paystack by this action.
 *  - The wallet is credited only after Paystack verification or a
 *    signature-verified webhook, and the provider amount must match exactly.
 *  - `topup-<random>` is the idempotency key. Completion is guarded by the
 *    top-up status, so a verify/webhook race credits at most once.
 *  - No client can pass a user, wallet, or provider status into a write path.
 */

import { action, internalMutation, internalQuery } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { AUDIT_ACTIONS } from "../audit/service";
import { classifyProviderStatus } from "./_paymentAttempts";
import {
  requireProviderAmount,
  verifyPaystackTransaction,
} from "./_provider";

const PAYSTACK_BASE = "https://api.paystack.co";
const MIN_TOPUP_CENTS = 1_000; // R10
const MAX_TOPUP_CENTS = 5_000_000; // R50,000

function validateAmount(amount: number) {
  if (!Number.isInteger(amount)) {
    throw new Error("Wallet top-up amount must be a whole number of cents");
  }
  if (amount < MIN_TOPUP_CENTS) {
    throw new Error(`The minimum wallet top-up is R${MIN_TOPUP_CENTS / 100}`);
  }
  if (amount > MAX_TOPUP_CENTS) {
    throw new Error(`The maximum wallet top-up is R${MAX_TOPUP_CENTS / 100}`);
  }
}

/** Authenticated user + email needed for Paystack initialization. */
export const getWalletTopUpUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      email: user.email ?? null,
      role: (user.role as string | undefined) ?? "customer",
    };
  },
});

/**
 * Create the pending top-up row before calling the provider. Reusing the
 * reference returns the existing row, so retries cannot create duplicates.
 */
export const createWalletTopUp = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reference: v.string(),
    actorRole: v.string(),
  },
  handler: async (ctx, args) => {
    validateAmount(args.amount);

    const existing = await ctx.db
      .query("wallet_topups")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
    if (existing) {
      return { topUpId: existing._id, alreadyExists: true };
    }

    const now = Date.now();
    const topUpId = await ctx.db.insert("wallet_topups", {
      userId: args.userId,
      amount: args.amount,
      currency: "ZAR",
      provider: "paystack",
      status: "pending",
      reference: args.reference,
      createdAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: args.userId,
      actorRole: args.actorRole,
      action: AUDIT_ACTIONS.PAYMENT_INITIATED,
      entityType: "wallet_topup",
      entityId: topUpId,
      metadata: JSON.stringify({
        reference: args.reference,
        amount: args.amount,
        provider: "paystack",
        method: "wallet_top_up",
      }),
    });

    return { topUpId, alreadyExists: false };
  },
});

export const getWalletTopUpByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wallet_topups")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .first();
  },
});

/**
 * Credit the wallet exactly once. Called only after verified provider success
 * (or a signature-verified webhook). The provider amount is required and must
 * match the stored top-up amount exactly.
 *
 * A top-up previously marked `failed` may still be completed by a later
 * verified provider success. Provider success is authoritative: refusing it
 * would leave the customer charged without the wallet credit. The completed
 * guard makes the transition safe under duplicate verify/webhook delivery.
 */
export const completeWalletTopUp = internalMutation({
  args: {
    topUpId: v.id("wallet_topups"),
    providerTransactionId: v.string(),
    providerStatus: v.string(),
    amountFromProvider: v.number(),
  },
  handler: async (ctx, args) => {
    const topUp = await ctx.db.get(args.topUpId);
    if (!topUp) throw new Error("Wallet top-up not found");

    if (topUp.status === "completed") {
      return { success: true, alreadyCompleted: true };
    }

    if (args.providerStatus !== "success") {
      throw new Error("Only a verified provider success can credit a wallet top-up");
    }
    if (!Number.isInteger(args.amountFromProvider)) {
      throw new Error("Provider amount must be a whole number of cents");
    }
    if (
      topUp.providerTransactionId &&
      topUp.providerTransactionId !== args.providerTransactionId
    ) {
      throw new Error("Provider transaction ID mismatch — refusing to credit");
    }
    if (args.amountFromProvider !== topUp.amount) {
      throw new Error(
        `Wallet top-up amount mismatch: provider reported ${args.amountFromProvider}, stored amount is ${topUp.amount} — refusing to credit`,
      );
    }

    const now = Date.now();

    // Ensure one wallet per user, created lazily on first credit.
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", topUp.userId))
      .first();

    if (!wallet) {
      const walletId = await ctx.db.insert("wallets", {
        userId: topUp.userId,
        balance: 0,
        currency: "ZAR",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      wallet = await ctx.db.get(walletId);
      if (!wallet) throw new Error("Failed to create wallet");
    }

    if (!wallet.isActive) {
      throw new Error("This wallet is inactive; top-up cannot be credited");
    }

    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + topUp.amount,
      updatedAt: now,
    });

    await ctx.db.insert("transactions", {
      walletId: wallet._id,
      type: "credit",
      amount: topUp.amount,
      description: "Wallet top-up",
      reference: `TOP-${args.topUpId}`,
      status: "completed",
      createdAt: now,
    });

    await ctx.db.patch(args.topUpId, {
      status: "completed",
      providerTransactionId: args.providerTransactionId,
      completedAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: topUp.userId,
      actorRole: "system",
      action: AUDIT_ACTIONS.PAYMENT_CONFIRMED,
      entityType: "wallet_topup",
      entityId: args.topUpId,
      metadata: JSON.stringify({
        reference: topUp.reference,
        amount: topUp.amount,
        providerStatus: args.providerStatus,
        providerTransactionId: args.providerTransactionId,
      }),
    });

    return {
      success: true,
      alreadyCompleted: false,
      balance: wallet.balance + topUp.amount,
    };
  },
});

export const failWalletTopUp = internalMutation({
  args: { topUpId: v.id("wallet_topups"), reason: v.string() },
  handler: async (ctx, args) => {
    const topUp = await ctx.db.get(args.topUpId);
    if (!topUp) throw new Error("Wallet top-up not found");

    if (topUp.status === "completed") {
      return { success: true, alreadyCompleted: true };
    }
    if (topUp.status === "failed") {
      return { success: true, alreadyFailed: true };
    }

    await ctx.db.patch(args.topUpId, {
      status: "failed",
      failureReason: args.reason.slice(0, 300),
    });

    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: topUp.userId,
      actorRole: "system",
      action: AUDIT_ACTIONS.PAYMENT_FAILED,
      entityType: "wallet_topup",
      entityId: args.topUpId,
      metadata: JSON.stringify({
        reference: topUp.reference,
        amount: topUp.amount,
        reason: args.reason.slice(0, 300),
      }),
    });

    return { success: true, alreadyFailed: false };
  },
});

/**
 * Start a hosted Paystack checkout for a wallet top-up.
 * Returns only the provider URL and our reference.
 */
export const initiateWalletTopUp = action({
  args: { amount: v.number() },
  handler: async (ctx, args) => {
    validateAmount(args.amount);

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "Payment provider is not configured. Add PAYSTACK_SECRET_KEY in the project's API keys settings.",
      );
    }

    const siteUrl = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    if (!siteUrl) {
      throw new Error(
        "Payment return URL is not configured. Add SITE_URL in the project's environment settings.",
      );
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const user = await ctx.runQuery(
      internal.payments.walletTopUps.getWalletTopUpUser,
      { userId },
    );
    if (!user) throw new Error("User not found");
    if (!user.email) {
      throw new Error(
        "Your account has no verified email address — a payment email is required",
      );
    }

    const reference = `topup-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    const creation = await ctx.runMutation(
      internal.payments.walletTopUps.createWalletTopUp,
      {
        userId,
        amount: args.amount,
        reference,
        actorRole: user.role,
      },
    );

    const fail = async (reason: string) => {
      await ctx.runMutation(internal.payments.walletTopUps.failWalletTopUp, {
        topUpId: creation.topUpId,
        reason,
      });
    };

    let response: Response;
    try {
      response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: args.amount, // cents == kobo
          reference,
          currency: "ZAR",
          metadata: {
            kind: "wallet_top_up",
            userId,
          },
          callback_url: `${siteUrl}/wallet?reference=${encodeURIComponent(reference)}`,
        }),
      });
    } catch {
      await fail("Could not reach the payment provider");
      throw new Error("Could not reach the payment provider. Please try again.");
    }

    const raw = await response.text().catch(() => "");
    let data: {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    } = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      // fall through with empty data
    }

    if (
      !response.ok ||
      !data.status ||
      !data.data?.authorization_url
    ) {
      const reason = data.message ?? `HTTP ${response.status}`;
      await fail(`Provider initialization failed: ${reason}`);
      throw new Error(`Payment provider rejected initialization: ${reason}`);
    }

    return {
      reference,
      authorizationUrl: data.data.authorization_url,
    };
  },
});

/**
 * Verify a returned wallet top-up with Paystack. Only the owner can call it;
 * the provider status is authoritative and never read from the browser.
 */
export const verifyWalletTopUp = action({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error("Payment provider is not configured");

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const topUp = await ctx.runQuery(
      internal.payments.walletTopUps.getWalletTopUpByReference,
      { reference: args.reference },
    );
    if (!topUp) throw new Error("Unknown wallet top-up reference");
    if (topUp.userId !== userId) {
      throw new Error("Access denied: not your wallet top-up");
    }

    if (topUp.status === "completed") {
      return { status: "completed" as const };
    }

    // A failed top-up is re-checked too: if the provider later confirms a
    // success, the customer must receive the wallet credit rather than being
    // stranded behind our earlier failure record.
    const verification = await verifyPaystackTransaction(secretKey, args.reference);
    const outcome = classifyProviderStatus(verification.status);

    if (outcome === "success") {
      await ctx.runMutation(
        internal.payments.walletTopUps.completeWalletTopUp,
        {
          topUpId: topUp._id,
          providerTransactionId: verification.id ?? args.reference,
          providerStatus: verification.status,
          amountFromProvider: requireProviderAmount(verification),
        },
      );
      return { status: "completed" as const };
    }

    if (outcome === "failed") {
      await ctx.runMutation(internal.payments.walletTopUps.failWalletTopUp, {
        topUpId: topUp._id,
        reason: `provider reported ${verification.status}`,
      });
      return { status: "failed" as const };
    }

    return { status: "pending" as const };
  },
});
