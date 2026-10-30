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

/** Metadata written when a verified duplicate charge is quarantined. */
export function requiresRefund(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    const parsed = JSON.parse(metadata) as { refundRequired?: unknown };
    return parsed.refundRequired === true;
  } catch {
    return false;
  }
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
  | { kind: "allowed" };

/**
 * Decide whether provider evidence may complete this transaction. A different
 * completed payment means the order is already settled; the incoming charge is
 * quarantined instead of producing a second authoritative completion.
 */
export function evaluateCompletionGate<T extends PaymentAttempt>(
  attempts: readonly T[],
  transactionId: string
): CompletionGate<T> {
  const otherCompleted = findCompletedPayment(
    attempts.filter((attempt) => attempt._id !== transactionId)
  );
  return otherCompleted
    ? { kind: "duplicate", payment: otherCompleted }
    : { kind: "allowed" };
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
