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
 *  - Initiation is idempotent per (orderId, method): repeated attempts reuse
 *    the same pending transaction/reference.
 */

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ROLES } from "../schema";

const PAYSTACK_BASE = "https://api.paystack.co";

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
    method: v.string(), // "card" | "eft" | "wallet" | "snapscan" — passed to provider metadata
  },
  handler: async (ctx, args) => {
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

    // Authentication (session-derived) + role check via internal query —
    // actions have no db access, so identity resolution happens in Convex
    // queries/mutations only.
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");
    const roleCtx = await ctx.runQuery(internal.payments.queries.getUserRoleForPayment, {
      userId,
    });
    if (!roleCtx) throw new Error("User not found");
    if (
      roleCtx.role === ROLES.DRIVER ||
      roleCtx.role === ROLES.FLEET_MANAGER ||
      roleCtx.role === ROLES.OPERATIONS
    ) {
      throw new Error("Access denied: this role cannot initiate customer payments");
    }

    // Server-side order + amount resolution (auth + ownership enforced inside).
    type OrderPaymentCtx = {
      orderId: Id<"orders">;
      orderStatus: string;
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
      failedAttempts: number;
    };
    const orderCtx: OrderPaymentCtx = await ctx.runQuery(
      internal.payments.queries.getAuthorizedOrderForPayment,
      { orderId: args.orderId }
    );

    // Already paid → refuse re-payment (idempotent, no duplicate completion).
    if (orderCtx.latestPayment?.status === "completed") {
      return {
        alreadyPaid: true,
        reference: orderCtx.latestPayment.idempotencyKey,
        authorizationUrl: null,
      };
    }

    // Deterministic reference: one order gets one stable checkout reference.
    // A failed attempt increments the attempt counter so the retried checkout
    // gets a fresh reference (Paystack rejects reused references).
    const reference =
      orderCtx.failedAttempts === 0
        ? `pay-${orderCtx.orderId}`
        : `pay-${orderCtx.orderId}-r${orderCtx.failedAttempts}`;

    // Idempotent transaction creation (internal re-checks the reference).
    const creation: { transactionId: string; alreadyExists: boolean } = await ctx.runMutation(
      internal.payments.mutations.createPaymentTransaction,
      {
        orderId: orderCtx.orderId,
        userId: orderCtx.userId,
        amount: orderCtx.amount,
        method: args.method,
        reference,
        metadata: JSON.stringify({ attempt: orderCtx.failedAttempts + 1 }),
      }
    );
    const { transactionId } = creation;

    // Idempotent initiation: if Paystack was already initialized for this
    // reference we re-verify its status rather than re-initializing.
    // (Simplest safe path: always re-initialize — Paystack returns a fresh
    // authorization URL for the same reference with no charge side-effect
    // until the customer completes checkout.)

    if (!orderCtx.senderEmail) {
      throw new Error(
        "Your account has no verified email address — a payment email is required"
      );
    }

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
        metadata: { orderId: orderCtx.orderId, method: args.method },
        // Client redirects back; verification is server-side regardless.
        callback_url: `${siteUrl}/make-payment?reference=${encodeURIComponent(reference)}`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Payment provider error (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
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
      transactionId,
      reference,
      authorizationUrl: data.data.authorization_url,
    };
  },
});

// ─── Direct card charge (inline checkout UI) ────────────────────────────────

/**
 * Charge an order directly with card details from the inline checkout UI.
 *
 * Flow:
 *  1. Resolve the authenticated customer + authoritative order charge
 *     server-side — the amount NEVER comes from the client.
 *  2. Create the pending transaction with a deterministic reference
 *     (`card-<orderId>` + attempt suffix), idempotent per attempt.
 *  3. POST the card to Paystack's /charge endpoint with the SECRET key.
 *  4. Map the provider outcome:
 *      - "success"   → complete the transaction (provider evidence recorded)
 *      - "send_otp"  → return otp_required; the client collects the OTP and
 *                      calls submitPaymentOtp (the OTP check is server-side)
 *      - "failed"    → fail the transaction and report the reason
 *      - others (send_phone / send_birthday / open_url …) → unsupported with
 *        the provider's display text; hosted checkout remains available.
 *
 * Security notes: the secret key stays in this action; card data is forwarded
 * straight to Paystack, never persisted, never logged, never audited. Convex's
 * function-args viewer is the only place inputs appear — production should
 * move to Paystack's hosted/inline.js flow (already supported below) to keep
 * PANs fully out of the stack.
 */
export const chargeOrderPaymentWithCard = action({
  args: {
    orderId: v.id("orders"),
    card: v.object({
      holderName: v.string(),
      number: v.string(), // digits only (client strips spaces)
      expiryMonth: v.string(), // "01".."12"
      expiryYear: v.string(), // "YY" or "YYYY"
      cvv: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const result = await chargeWithPaystack(ctx, args.orderId, {
      number: args.card.number,
      cvv: args.card.cvv,
      month: args.card.expiryMonth,
      year: args.card.expiryYear,
    });
    return result;
  },
});

/**
 * Submit the OTP for a pending direct charge (Paystack /submitOTP).
 * Only the payer may submit — the transaction is resolved by our own
 * internal reference and ownership-checked exactly like verification.
 */
export const submitPaymentOtp = action({
  args: {
    reference: v.string(),
    otp: v.string(),
  },
  handler: async (ctx, args): Promise<ChargeResult> => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) throw new Error("Payment provider is not configured");

    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");

    const tx = await ctx.runQuery(internal.payments.queries.getPaymentByReference, {
      reference: args.reference,
    });
    if (!tx) throw new Error("Unknown payment reference");
    if (tx.userId !== userId) {
      throw new Error("Access denied: not your payment");
    }

    const response = await fetch(`${PAYSTACK_BASE}/submitOTP`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reference: args.reference, otp: args.otp }),
    });

    return settlePaystackChargeResponse(ctx, tx._id, response, "OTP");
  },
});

// ─── Shared direct-charge internals ──────────────────────────────────────────

type ChargeResult =
  | { status: "already_paid" }
  | { status: "completed"; reference: string }
  | { status: "otp_required"; reference: string; displayText?: string }
  | { status: "failed"; message: string }
  | { status: "unsupported"; reference: string; message: string };

async function chargeWithPaystack(
  ctx: any,
  orderId: Id<"orders">,
  card: { number: string; cvv: string; month: string; year: string },
): Promise<ChargeResult> {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Payment provider is not configured. Add PAYSTACK_SECRET_KEY in the project's API keys settings."
    );
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required");
  const roleCtx = await ctx.runQuery(internal.payments.queries.getUserRoleForPayment, {
    userId,
  });
  if (!roleCtx) throw new Error("User not found");
  if (
    roleCtx.role === ROLES.DRIVER ||
    roleCtx.role === ROLES.FLEET_MANAGER ||
    roleCtx.role === ROLES.OPERATIONS
  ) {
    throw new Error("Access denied: this role cannot initiate customer payments");
  }

  const orderCtx = await ctx.runQuery(
    internal.payments.queries.getAuthorizedOrderForPayment,
    { orderId }
  );

  if (orderCtx.latestPayment?.status === "completed") {
    return { status: "already_paid" };
  }
  if (!orderCtx.senderEmail) {
    throw new Error(
      "Your account has no verified email address — a payment email is required"
    );
  }

  const reference =
    orderCtx.failedAttempts === 0
      ? `card-${orderCtx.orderId}`
      : `card-${orderCtx.orderId}-r${orderCtx.failedAttempts}`;

  await ctx.runMutation(internal.payments.mutations.createPaymentTransaction, {
    orderId: orderCtx.orderId,
    userId: orderCtx.userId,
    amount: orderCtx.amount,
    method: "card",
    reference,
    metadata: JSON.stringify({ channel: "inline", attempt: orderCtx.failedAttempts + 1 }),
  });

  const year = card.year.length <= 2 ? `20${card.year}` : card.year;
  const response = await fetch(`${PAYSTACK_BASE}/charge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`, // secret key — server-side only
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: orderCtx.senderEmail,
      amount: orderCtx.amount, // cents == kobo
      currency: "ZAR",
      reference,
      card: {
        number: card.number,
        cvv: card.cvv,
        month: parseInt(card.month, 10),
        year: parseInt(year, 10),
      },
      metadata: { orderId, channel: "inline" },
    }),
  });

  const tx = await ctx.runQuery(internal.payments.queries.getPaymentByReference, {
    reference,
  });
  if (!tx) throw new Error("Payment transaction could not be created");

  return settlePaystackChargeResponse(ctx, tx._id, response, "Card charge");
}

async function settlePaystackChargeResponse(
  ctx: any,
  transactionId: string,
  response: Response,
  label: string,
): Promise<ChargeResult> {
  const raw = await response.text().catch(() => "");
  let data: {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string; display_text?: string };
  } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    // fall through with empty data
  }

  if (!response.ok || !data.status || !data.data) {
    const message =
      data.message ?? `Payment declined (HTTP ${response.status})`;
    await ctx.runMutation(internal.payments.mutations.failPaymentTransaction, {
      transactionId,
      reason: `${label} failed: ${message}`.slice(0, 300),
    });
    return { status: "failed", message };
  }

  const providerStatus = data.data.status;
  const reference = data.data.reference ?? "";

  if (providerStatus === "success") {
    await ctx.runMutation(internal.payments.mutations.completePaymentTransaction, {
      transactionId,
      providerTransactionId: reference || transactionId,
      providerStatus: "success",
    });
    return { status: "completed", reference };
  }

  if (providerStatus === "send_otp") {
    return {
      status: "otp_required",
      reference,
      displayText: data.data.display_text,
    };
  }

  if (providerStatus === "failed" || providerStatus === "declined") {
    const message = data.data.display_text ?? data.message ?? "Payment declined";
    await ctx.runMutation(internal.payments.mutations.failPaymentTransaction, {
      transactionId,
      reason: message.slice(0, 300),
    });
    return { status: "failed", message };
  }

  // send_phone / send_birthday / open_url / abandoned … — report, don't guess.
  return {
    status: "unsupported",
    reference,
    message:
      data.data.display_text ??
      `Additional authorization required (${providerStatus ?? "unknown"}). Use the secure hosted checkout instead.`,
  };
}

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

    // Ask Paystack for the authoritative status.
    const response = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(args.reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Payment verification failed (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      status: boolean;
      data?: {
        status: string; // "success" | "failed" | "abandoned" | "ongoing"
        id?: number;
        amount?: number; // kobo
        reference?: string;
      };
    };

    if (!data.status || !data.data) {
      throw new Error("Payment verification returned an invalid response");
    }

    const providerStatus = data.data.status;
    const providerTxId = data.data.id ? String(data.data.id) : args.reference;
    const amountFromProvider = data.data.amount;

    if (providerStatus === "success") {
      await ctx.runMutation(internal.payments.mutations.completePaymentTransaction, {
        transactionId: tx._id,
        providerTransactionId: providerTxId,
        providerStatus,
        amountFromProvider,
      });
      return { status: "completed" as const };
    }

    if (providerStatus === "failed") {
      await ctx.runMutation(internal.payments.mutations.failPaymentTransaction, {
        transactionId: tx._id,
        reason: "provider reported failed",
      });
      return { status: "failed" as const };
    }

    // abandoned / ongoing — still pending from our perspective.
    return { status: "pending" as const };
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
  },
  handler: async (ctx, args) => {
    const tx = await ctx.runQuery(internal.payments.queries.getPaymentByReference, {
      reference: args.reference,
    });
    // Unknown reference: acknowledge to stop retries but do nothing — we only
    // ever act on transactions we created.
    if (!tx) {
      return { handled: false as const };
    }

    if (args.event === "charge.success") {
      await ctx.runMutation(internal.payments.mutations.completePaymentTransaction, {
        transactionId: tx._id,
        providerTransactionId: args.providerTransactionId ?? args.reference,
        providerStatus: "success",
        amountFromProvider: args.amountFromProvider,
      });
      return { handled: true as const, result: "completed" as const };
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
