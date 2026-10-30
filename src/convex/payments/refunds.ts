/**
 * Automatic refunds for quarantined charges.
 *
 * Scope: only charges written by the duplicate-charge guard in
 * payments/mutations.ts — a verified second charge for an already-paid order,
 * or a charge that succeeded after the order was refunded. General refunds
 * (disputes, cancellations) remain a manual finance decision.
 *
 * Safety model:
 *  - The refund row is created atomically with the quarantine.
 *  - `claimAutomaticRefund` is the at-most-once gate: only a queued row can
 *    become `requesting`, so a retried action cannot make a second request.
 *  - Before calling Paystack, the action lists existing refunds for the
 *    original transaction. An existing manual/automatic refund is adopted
 *    rather than duplicated.
 *  - `refund.processed` is the only event that clears `refundRequired`.
 *    Rejections, network failures, and `refund.failed` stay flagged for
 *    manual review.
 */

import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { AUDIT_ACTIONS } from "../audit/service";
import {
  isQuarantinedCharge,
  parseAttemptMetadata,
  requiresRefund,
} from "./_paymentAttempts";
import {
  createPaystackRefund,
  listPaystackRefunds,
  normalizePaystackRefundStatus,
  type PaystackRefundRecord,
  type PaystackRefundStatus,
} from "./_provider";

type RefundReason = "duplicate_charge" | "payment_after_refund";

function parseMetadata(metadata: string | undefined): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function refundReasonLabel(reason: RefundReason): string {
  return reason === "duplicate_charge"
    ? "Duplicate payment charge"
    : "Payment after refund";
}

/**
 * Read a queued refund for the scheduled action. The action intentionally
 * re-reads the row instead of trusting IDs/settings from the caller.
 */
export const getRefundForProcessing = internalQuery({
  args: { refundId: v.id("payment_refunds") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.refundId);
  },
});

/**
 * At-most-once claim. A queued row becomes `requesting`; any later invocation
 * sees `requesting` (or a terminal state) and performs no provider call.
 */
export const claimAutomaticRefund = internalMutation({
  args: { refundId: v.id("payment_refunds") },
  handler: async (ctx, args) => {
    const refund = await ctx.db.get(args.refundId);
    if (!refund || refund.status !== "queued") return null;

    const now = Date.now();
    await ctx.db.patch(args.refundId, {
      status: "requesting",
      attempts: refund.attempts + 1,
      updatedAt: now,
    });

    // If the action dies after this claim, the row must not sit in `requesting`
    // forever. After a generous provider-call window it becomes manual review;
    // a late `refund.processed` webhook can still rescue it.
    await ctx.scheduler.runAfter(
      15 * 60 * 1000,
      internal.payments.refunds.expireStuckAutomaticRefund,
      { refundId: args.refundId },
    );

    return {
      ...refund,
      status: "requesting" as const,
      attempts: refund.attempts + 1,
      updatedAt: now,
    };
  },
});

/**
 * Backfill safety net for quarantined charges that predate this refund path,
 * or whose refund row was never created (for example a mutation scheduled
 * before this deployment). Bounded per run and idempotent: an existing refund
 * row is never recreated.
 */
export const enqueueMissingAutomaticRefunds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const failed = await ctx.db
      .query("payment_transactions")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(200);

    const now = Date.now();
    let enqueued = 0;

    for (const tx of failed) {
      if (tx.provider !== "paystack") continue;
      if (!requiresRefund(tx.metadata)) continue;
      if (!isQuarantinedCharge(tx.metadata)) continue;

      const existing = await ctx.db
        .query("payment_refunds")
        .withIndex("by_payment", (q) =>
          q.eq("paymentTransactionId", tx._id),
        )
        .first();
      if (existing) {
        // A queued row whose scheduled action was lost can be safely
        // re-scheduled: the action's claim gate permits exactly one provider
        // request. Never retry requesting/failed/terminal rows here.
        if (existing.status === "queued") {
          await ctx.scheduler.runAfter(
            0,
            internal.payments.refunds.processAutomaticRefund,
            { refundId: existing._id },
          );
          enqueued++;
        }
        continue;
      }

      const metadata = parseAttemptMetadata(tx.metadata);
      const reason =
        metadata.duplicatePayment === true
          ? ("duplicate_charge" as const)
          : ("payment_after_refund" as const);

      const refundId = await ctx.db.insert("payment_refunds", {
        paymentTransactionId: tx._id,
        orderId: tx.orderId,
        userId: tx.userId,
        provider: tx.provider,
        transactionReference: tx.idempotencyKey,
        providerTransactionId: tx.providerTransactionId,
        amount: tx.amount,
        currency: tx.currency,
        reason,
        status: "queued",
        attempts: 0,
        requestedAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.payments.refunds.processAutomaticRefund,
        { refundId },
      );
      enqueued++;
    }

    return { enqueued };
  },
});

/**
 * Safety net for an action that claimed a refund but never recorded an outcome
 * (action timeout, process death, or an ambiguous network failure). This never
 * retries the provider call — it hands the charge to manual review.
 */
export const expireStuckAutomaticRefund = internalMutation({
  args: { refundId: v.id("payment_refunds") },
  handler: async (ctx, args) => {
    const refund = await ctx.db.get(args.refundId);
    if (!refund || refund.status !== "requesting") return;

    await ctx.runMutation(
      internal.payments.refunds.recordProviderRefund,
      {
        refundId: args.refundId,
        status: "failed",
        failureReason:
          "Automatic refund outcome was not recorded in time; manual review required",
      },
    );
  },
});

/**
 * Record an authoritative provider refund state.
 *
 * This must be safe under out-of-order webhooks:
 *   pending → processing → processed
 *   any non-processed → failed
 *   failed → processed (provider evidence wins)
 * and never allow a stale `pending` response to overwrite `processed`.
 */
export const recordProviderRefund = internalMutation({
  args: {
    refundId: v.id("payment_refunds"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    providerRefundId: v.optional(v.string()),
    providerRefundReference: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    amountFromProvider: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const refund = await ctx.db.get(args.refundId);
    if (!refund) return { updated: false as const, status: null };

    // Terminal success is final; a delayed "pending" response must not
    // downgrade it.
    if (refund.status === "processed") {
      return { updated: false as const, status: refund.status };
    }

    // A failed automatic refund stays manual-review only. A later processed
    // webhook is still allowed to rescue it because provider evidence wins.
    if (refund.status === "failed" && args.status !== "processed") {
      return { updated: false as const, status: refund.status };
    }

    let nextStatus: PaystackRefundStatus = args.status;
    let failureReason = args.failureReason;

    // Never clear the refund-required flag without a verified amount, or from
    // a partial/mismatched refund. A full automatic refund must match the
    // quarantined charge exactly.
    if (
      nextStatus === "processed" &&
      args.amountFromProvider === undefined
    ) {
      nextStatus = "failed";
      failureReason =
        "Provider reported a processed refund without a verifiable amount; manual review required";
    } else if (
      nextStatus === "processed" &&
      args.amountFromProvider !== refund.amount
    ) {
      nextStatus = "failed";
      failureReason = `Provider refund amount (${args.amountFromProvider}) did not match the quarantined charge (${refund.amount})`;
    }

    // Do not let a late "pending" webhook move processing backwards.
    if (refund.status === "processing" && nextStatus === "pending") {
      return { updated: false as const, status: refund.status };
    }

    const now = Date.now();
    const isTerminalSuccess = nextStatus === "processed";
    const isFailure = nextStatus === "failed";

    await ctx.db.patch(args.refundId, {
      status: nextStatus,
      providerRefundId: args.providerRefundId ?? refund.providerRefundId,
      providerRefundReference:
        args.providerRefundReference ?? refund.providerRefundReference,
      failureReason:
        isFailure
          ? (failureReason ?? "Provider refund failed")
          : isTerminalSuccess
            ? undefined
            : refund.failureReason,
      updatedAt: now,
      processedAt: isTerminalSuccess ? now : refund.processedAt,
    });

    // Keep the payment record's internal metadata in sync. The transaction
    // remains `failed` on purpose: it is a refunded duplicate, not the
    // authoritative payment for the order. Marking it `refunded` would make
    // order-level queries treat the whole order as refunded.
    const payment = await ctx.db.get(refund.paymentTransactionId);
    if (payment) {
      const metadata = parseMetadata(payment.metadata);
      await ctx.db.patch(payment._id, {
        metadata: JSON.stringify({
          ...metadata,
          refundStatus: nextStatus,
          refundId: refund._id,
          refundedAt: isTerminalSuccess ? now : metadata.refundedAt,
          refundFailureReason: isFailure
            ? (failureReason ?? "Provider refund failed")
            : undefined,
          providerRefundId: args.providerRefundId ?? metadata.providerRefundId,
          providerRefundReference:
            args.providerRefundReference ?? metadata.providerRefundReference,
          refundRequired: !isTerminalSuccess,
        }),
      });
    }

    // Audit lifecycle. Pending/processing is recorded once per transition;
    // the provider may replay webhooks, so only transition changes are logged.
    const refundAction = isTerminalSuccess
      ? AUDIT_ACTIONS.PAYMENT_REFUNDED
      : isFailure
        ? AUDIT_ACTIONS.PAYMENT_REFUND_FAILED
        : AUDIT_ACTIONS.PAYMENT_REFUND_REQUESTED;
    const shouldAudit =
      isTerminalSuccess ||
      isFailure ||
      (refund.status === "queued" || refund.status === "requesting");
    if (shouldAudit) {
      await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
        actorId: refund.userId,
        actorRole: "system",
        action: refundAction,
        entityType: "payment_refund",
        entityId: refund._id,
        metadata: JSON.stringify({
          reference: refund.transactionReference,
          amount: refund.amount,
          reason: refund.reason,
          automatic: true,
          status: nextStatus,
          providerRefundId: args.providerRefundId,
          failureReason: isFailure ? failureReason : undefined,
        }),
        orderId: refund.orderId,
      });
    }

    if (isTerminalSuccess) {
      await ctx.runMutation(
        internal.notifications.service.sendPaymentNotification,
        {
          userId: refund.userId,
          eventType: "payment_refunded",
          templateData: {
            orderId: refund.orderId.slice(-6).toUpperCase(),
            amount: (refund.amount / 100).toFixed(2),
          },
        },
      );
    }

    return { updated: true as const, status: nextStatus };
  },
});

/**
 * Find the automatic refund associated with a Paystack transaction reference.
 * Refund webhooks use `data.transaction_reference`, which is our idempotency
 * reference (the value we supplied when initialising checkout).
 */
export const getAutomaticRefundByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const refund = await ctx.db
      .query("payment_refunds")
      .withIndex("by_transaction_reference", (q) =>
        q.eq("transactionReference", args.reference),
      )
      .first();
    return refund ?? null;
  },
});

function pickExistingRefund(
  refunds: PaystackRefundRecord[],
): PaystackRefundRecord | null {
  const priority: Record<PaystackRefundStatus, number> = {
    processed: 4,
    processing: 3,
    pending: 2,
    failed: 1,
  };
  return (
    refunds
      .filter((refund) => normalizePaystackRefundStatus(refund.status) !== null)
      .sort((a, b) => {
        const aStatus = normalizePaystackRefundStatus(a.status) as PaystackRefundStatus;
        const bStatus = normalizePaystackRefundStatus(b.status) as PaystackRefundStatus;
        return priority[bStatus] - priority[aStatus];
      })[0] ?? null
  );
}

/**
 * Scheduled immediately after a duplicate charge is quarantined.
 *
 * Provider calls are made here, never in a Convex mutation. The action is
 * deliberately at-most-once: if Paystack cannot be reached or returns an
 * ambiguous response, the row becomes `failed` and the payment stays flagged
 * for manual review rather than risking a second refund.
 */
export const processAutomaticRefund = internalAction({
  args: { refundId: v.id("payment_refunds") },
  handler: async (ctx, args) => {
    const queued = await ctx.runQuery(
      internal.payments.refunds.getRefundForProcessing,
      { refundId: args.refundId },
    );
    if (!queued || queued.status !== "queued") {
      return { processed: false as const, skipped: true as const };
    }

    const claim = await ctx.runMutation(
      internal.payments.refunds.claimAutomaticRefund,
      { refundId: args.refundId },
    );
    if (!claim) {
      return { processed: false as const, skipped: true as const };
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      await ctx.runMutation(
        internal.payments.refunds.recordProviderRefund,
        {
          refundId: args.refundId,
          status: "failed",
          failureReason:
            "PAYSTACK_SECRET_KEY is not configured; refund requires manual review",
        },
      );
      return { processed: false as const, skipped: false as const };
    }

    // Check for an existing refund before creating one. This covers a retried
    // action, a finance refund already made in the Paystack dashboard, and a
    // previous request whose response was lost.
    let existing: PaystackRefundRecord[];
    try {
      existing = await listPaystackRefunds(
        secretKey,
        claim.transactionReference,
      );
    } catch (err) {
      await ctx.runMutation(
        internal.payments.refunds.recordProviderRefund,
        {
          refundId: args.refundId,
          status: "failed",
          failureReason: `Could not check existing provider refunds: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
      );
      return { processed: false as const, skipped: false as const };
    }

    const found = pickExistingRefund(existing);
    if (found) {
      const status = normalizePaystackRefundStatus(found.status);
      if (!status) {
        await ctx.runMutation(
          internal.payments.refunds.recordProviderRefund,
          {
            refundId: args.refundId,
            status: "failed",
            failureReason: "Provider returned an unrecognised refund status",
          },
        );
        return { processed: false as const, skipped: false as const };
      }

      await ctx.runMutation(
        internal.payments.refunds.recordProviderRefund,
        {
          refundId: args.refundId,
          status,
          providerRefundId: found.id,
          providerRefundReference: found.refundReference,
          amountFromProvider: found.amount,
        },
      );
      return {
        processed: status === "processed",
        skipped: false as const,
        adoptedExisting: true as const,
      };
    }

    let created: PaystackRefundRecord;
    try {
      created = await createPaystackRefund(secretKey, {
        transaction: claim.providerTransactionId ?? claim.transactionReference,
        amount: claim.amount,
        currency: claim.currency,
        merchantNote: refundReasonLabel(claim.reason),
        customerNote: "Duplicate payment refund",
      });
    } catch (err) {
      await ctx.runMutation(
        internal.payments.refunds.recordProviderRefund,
        {
          refundId: args.refundId,
          status: "failed",
          failureReason: `Paystack refund request failed: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
      );
      return { processed: false as const, skipped: false as const };
    }

    const status = normalizePaystackRefundStatus(created.status);
    if (!status) {
      await ctx.runMutation(
        internal.payments.refunds.recordProviderRefund,
        {
          refundId: args.refundId,
          status: "failed",
          failureReason: "Paystack returned an unrecognised refund status",
        },
      );
      return { processed: false as const, skipped: false as const };
    }

    await ctx.runMutation(
      internal.payments.refunds.recordProviderRefund,
      {
        refundId: args.refundId,
        status,
        providerRefundId: created.id,
        providerRefundReference: created.refundReference,
        amountFromProvider: created.amount,
      },
    );

    return {
      processed: status === "processed",
      skipped: false as const,
      adoptedExisting: false as const,
    };
  },
});
