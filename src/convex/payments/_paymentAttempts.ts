/**
 * Payment attempt policy (pure helper — not a Convex function).
 *
 * The payment layer supports two customer payment methods for one order:
 * hosted Paystack card checkout and the internal Lasha wallet. They must never
 * both be able to settle the same order.
 *
 * This module is the single, testable source of truth for those decisions:
 *
 *   - A wallet payment may proceed only when no card checkout is still able
 *     to succeed and no payment has already completed.
 *   - A new card attempt may be created only while the order is unpaid and not
 *     refunded.
 *   - A provider success may complete the transaction it references only when
 *     no OTHER payment has already completed.
 *   - Provider statuses are mapped conservatively: unknown/ongoing statuses
 *     keep the wallet blocked rather than being treated as terminal failure.
 *
 * The underscore prefix keeps this file out of Convex's function scanner.
 */

export type PaymentAttemptStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded";

/** Structural subset shared by Convex documents and plain test fixtures. */
export interface PaymentAttempt {
  _id: string;
  status: PaymentAttemptStatus;
  method: string;
  provider: string;
  idempotencyKey: string;
  createdAt: number;
  metadata?: string;
}

export const CARD_CHECKOUT_OPEN_MESSAGE =
  "A card checkout is still open for this delivery. Complete it, or wait for it to expire, before paying with your wallet.";

/** Newest completed payment, if one exists. */
export function findCompletedPayment<T extends PaymentAttempt>(
  attempts: readonly T[]
): T | null {
  return (
    attempts
      .filter((attempt) => attempt.status === "completed")
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

/**
 * Card attempts that can still succeed at the provider. `processing` is
 * included even though the current flow rarely writes it: a transitional
 * provider confirmation must block the wallet just like `pending` does.
 */
export function findActiveCardAttempts<T extends PaymentAttempt>(
  attempts: readonly T[]
): T[] {
  return attempts
    .filter(
      (attempt) =>
        attempt.method === "card" &&
        (attempt.status === "pending" || attempt.status === "processing")
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function findRefundedPayment<T extends PaymentAttempt>(
  attempts: readonly T[]
): T | null {
  return attempts.find((attempt) => attempt.status === "refunded") ?? null;
}

/** Parse our internal payment metadata without ever throwing. */
export function parseAttemptMetadata(
  metadata: string | undefined,
): Record<string, unknown> {
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

/** True when this failed attempt is a verified charge the guard quarantined. */
export function isQuarantinedCharge(metadata: string | undefined): boolean {
  const parsed = parseAttemptMetadata(metadata);
  return parsed.duplicatePayment === true || parsed.paymentAfterRefund === true;
}

/** Refund lifecycle written by the automatic refund processor. */
export type AutomaticRefundStatus =
  | "queued"
  | "requesting"
  | "pending"
  | "processing"
  | "processed"
  | "failed";

export function automaticRefundStatus(
  metadata: string | undefined,
): AutomaticRefundStatus | null {
  const status = parseAttemptMetadata(metadata).refundStatus;
  if (
    status === "queued" ||
    status === "requesting" ||
    status === "pending" ||
    status === "processing" ||
    status === "processed" ||
    status === "failed"
  ) {
    return status;
  }
  return null;
}

/** A refund is still being requested/processed by the provider. */
export function isAutomaticRefundInProgress(
  metadata: string | undefined,
): boolean {
  const status = automaticRefundStatus(metadata);
  return (
    status === "queued" ||
    status === "requesting" ||
    status === "pending" ||
    status === "processing"
  );
}

/**
 * Metadata written when a verified duplicate charge is quarantined.
 * A completed automatic refund no longer requires manual review.
 */
export function requiresRefund(metadata: string | undefined): boolean {
  const parsed = parseAttemptMetadata(metadata);
  return (
    parsed.refundRequired === true &&
    automaticRefundStatus(metadata) !== "processed"
  );
}

export function findRefundRequiredAttempts<T extends PaymentAttempt>(
  attempts: readonly T[]
): T[] {
  return attempts.filter(
    (attempt) => attempt.status === "failed" && requiresRefund(attempt.metadata)
  );
}

export type WalletPaymentGate<T extends PaymentAttempt> =
  | { kind: "already_paid"; payment: T }
  | { kind: "card_pending"; attempts: T[] }
  | { kind: "refunded"; payment: T }
  | { kind: "allowed" };

/**
 * Decide whether a wallet debit may run. Completed payment wins first: even if
 * legacy data also contains an active card attempt, the order is already paid
 * and wallet money must not be taken again.
 */
export function evaluateWalletPaymentGate<T extends PaymentAttempt>(
  attempts: readonly T[]
): WalletPaymentGate<T> {
  const completed = findCompletedPayment(attempts);
  if (completed) return { kind: "already_paid", payment: completed };

  const activeCards = findActiveCardAttempts(attempts);
  if (activeCards.length > 0) {
    return { kind: "card_pending", attempts: activeCards };
  }

  const refunded = findRefundedPayment(attempts);
  if (refunded) return { kind: "refunded", payment: refunded };

  return { kind: "allowed" };
}

export type CardCreationGate<T extends PaymentAttempt> =
  | { kind: "already_paid"; payment: T }
  | { kind: "refunded"; payment: T }
  | { kind: "allowed" };

/** Decide whether a new card checkout may be created for an order. */
export function evaluateCardCreationGate<T extends PaymentAttempt>(
  attempts: readonly T[]
): CardCreationGate<T> {
  const completed = findCompletedPayment(attempts);
  if (completed) return { kind: "already_paid", payment: completed };

  const refunded = findRefundedPayment(attempts);
  if (refunded) return { kind: "refunded", payment: refunded };

  return { kind: "allowed" };
}

export type CompletionGate<T extends PaymentAttempt> =
  | { kind: "duplicate"; payment: T }
  | { kind: "refunded"; payment: T }
  | { kind: "allowed" };

/**
 * Decide whether provider evidence may complete this transaction.
 *
 * A different completed payment means the order is already settled; the
 * incoming charge is quarantined instead of producing a second authoritative
 * completion. A refunded payment also blocks completion: an already-open card
 * checkout must not turn a refunded order back into a paid one. The provider
 * may still have charged it, so the attempt is quarantined and the automatic
 * refund path is triggered; a failed refund remains manual review.
 */
export function evaluateCompletionGate<T extends PaymentAttempt>(
  attempts: readonly T[],
  transactionId: string
): CompletionGate<T> {
  const others = attempts.filter((attempt) => attempt._id !== transactionId);
  const otherCompleted = findCompletedPayment(others);
  if (otherCompleted) {
    return { kind: "duplicate", payment: otherCompleted };
  }

  const refunded = findRefundedPayment(others);
  if (refunded) {
    return { kind: "refunded", payment: refunded };
  }

  return { kind: "allowed" };
}

export type ProviderOutcome = "success" | "failed" | "active";

/**
 * Map Paystack transaction statuses to payment-attempt outcomes.
 *
 * Only `success` is money received. `failed`, `abandoned`, and `reversed` end
 * this attempt. Everything else (`ongoing`, `pending`, `queued`, `processing`,
 * or an unknown future status) is active, so the wallet stays blocked.
 */
export function classifyProviderStatus(status: string): ProviderOutcome {
  if (status === "success") return "success";
  if (
    status === "failed" ||
    status === "abandoned" ||
    status === "reversed"
  ) {
    return "failed";
  }
  return "active";
}
