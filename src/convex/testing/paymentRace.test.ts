/**
 * Cross-method payment race tests.
 *
 * These exercise the pure policy helpers in payments/_paymentAttempts.ts —
 * the same functions the Convex mutations use to gate wallet debits, card
 * creation, and provider completion. No deployment is required.
 *
 * Run: bunx tsx src/convex/testing/paymentRace.test.ts
 */

import {
  CARD_CHECKOUT_OPEN_MESSAGE,
  classifyProviderStatus,
  evaluateCardCreationGate,
  evaluateCompletionGate,
  evaluateWalletPaymentGate,
  findActiveCardAttempts,
  findRefundRequiredAttempts,
  isAutomaticRefundInProgress,
  requiresRefund,
  type PaymentAttempt,
  type PaymentAttemptStatus,
} from "../payments/_paymentAttempts";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}. Expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

let nextId = 1;
function attempt(
  overrides: Partial<PaymentAttempt> & {
    status?: PaymentAttemptStatus;
    method?: string;
  } = {},
): PaymentAttempt {
  return {
    _id: `tx_${nextId++}`,
    status: "pending",
    method: "card",
    provider: "paystack",
    idempotencyKey: `pay-order-${nextId}`,
    createdAt: nextId,
    ...overrides,
  };
}

console.log("Cross-method wallet gate");

test("wallet is blocked while a card checkout is pending", () => {
  const card = attempt({ status: "pending", method: "card" });
  const gate = evaluateWalletPaymentGate([card]);
  assertEqual(gate.kind, "card_pending", "pending card blocks the wallet");
  if (gate.kind === "card_pending") {
    assertEqual(gate.attempts.length, 1, "blocking attempt returned");
  }
  assert(
    CARD_CHECKOUT_OPEN_MESSAGE.includes("card checkout is still open"),
    "customer-facing refusal explains the open checkout",
  );
});

test("wallet is blocked while a card attempt is processing", () => {
  const gate = evaluateWalletPaymentGate([
    attempt({ status: "processing", method: "card" }),
  ]);
  assertEqual(gate.kind, "card_pending", "processing card blocks the wallet");
});

test("wallet is allowed after every card attempt reached a terminal failure", () => {
  const gate = evaluateWalletPaymentGate([
    attempt({ status: "failed", method: "card" }),
    attempt({ status: "failed", method: "card" }),
  ]);
  assertEqual(gate.kind, "allowed", "failed cards no longer block the wallet");
});

test("wallet is blocked when a card attempt has an unknown future status", () => {
  // Unknown provider statuses stay `pending` in our table by design; the
  // helper must treat them as active rather than terminal.
  assertEqual(
    classifyProviderStatus("some_new_paystack_status"),
    "active",
    "unknown provider status stays active",
  );
  assertEqual(
    evaluateWalletPaymentGate([attempt({ status: "pending" })]).kind,
    "card_pending",
    "active attempt blocks the wallet",
  );
});

test("wallet refuses a refunded order before checking card attempts", () => {
  const gate = evaluateWalletPaymentGate([attempt({ status: "refunded" })]);
  assertEqual(gate.kind, "refunded", "refund is terminal for wallet payment");
});

test("wallet reports already paid even with a legacy active card record", () => {
  const completed = attempt({
    status: "completed",
    method: "wallet",
    provider: "lasha_wallet",
    createdAt: 10,
  });
  const legacyCard = attempt({ status: "pending", method: "card", createdAt: 20 });
  const gate = evaluateWalletPaymentGate([legacyCard, completed]);
  assertEqual(gate.kind, "already_paid", "completed payment wins over stale card");
});

console.log("\nCard creation gate");

test("card creation is refused after a wallet payment completed", () => {
  const gate = evaluateCardCreationGate([
    attempt({
      status: "completed",
      method: "wallet",
      provider: "lasha_wallet",
    }),
  ]);
  assertEqual(gate.kind, "already_paid", "no card checkout after wallet debit");
});

test("card creation is refused for a refunded payment", () => {
  assertEqual(
    evaluateCardCreationGate([attempt({ status: "refunded" })]).kind,
    "refunded",
    "no card checkout for a refunded payment",
  );
});

test("card creation is allowed when only failed attempts exist", () => {
  assertEqual(
    evaluateCardCreationGate([attempt({ status: "failed" })]).kind,
    "allowed",
    "retry is allowed after failure",
  );
});

console.log("\nProvider completion gate");

test("a second provider success is quarantined as a duplicate", () => {
  const wallet = attempt({
    status: "completed",
    method: "wallet",
    provider: "lasha_wallet",
  });
  const card = attempt({ status: "pending", method: "card" });
  const gate = evaluateCompletionGate([wallet, card], card._id);
  assertEqual(gate.kind, "duplicate", "second completion becomes duplicate");
  if (gate.kind === "duplicate") {
    assertEqual(gate.payment._id, wallet._id, "duplicate points at settled payment");
  }
});

test("card completion wins over a stale failed wallet attempt", () => {
  const wallet = attempt({ status: "failed", method: "wallet" });
  const card = attempt({ status: "processing", method: "card" });
  assertEqual(
    evaluateCompletionGate([wallet, card], card._id).kind,
    "allowed",
    "failed attempt does not block card completion",
  );
});

test("a transaction does not count as its own duplicate", () => {
  const card = attempt({ status: "completed", method: "card" });
  assertEqual(
    evaluateCompletionGate([card], card._id).kind,
    "allowed",
    "self is excluded from the duplicate check",
  );
});

test("an open card cannot complete a refunded order", () => {
  const refunded = attempt({
    status: "refunded",
    method: "card",
    createdAt: 10,
  });
  const openCard = attempt({ status: "pending", method: "card", createdAt: 20 });
  const gate = evaluateCompletionGate([refunded, openCard], openCard._id);
  assertEqual(gate.kind, "refunded", "post-refund success is quarantined");
  if (gate.kind === "refunded") {
    assertEqual(gate.payment._id, refunded._id, "refunded payment identified");
  }
});

console.log("\nProvider status classification");

test("success, failure, and active statuses are classified conservatively", () => {
  assertEqual(classifyProviderStatus("success"), "success", "success");
  assertEqual(classifyProviderStatus("failed"), "failed", "failed");
  assertEqual(classifyProviderStatus("abandoned"), "failed", "abandoned");
  assertEqual(classifyProviderStatus("reversed"), "failed", "reversed");
  assertEqual(classifyProviderStatus("ongoing"), "active", "ongoing");
  assertEqual(classifyProviderStatus("pending"), "active", "pending");
  assertEqual(classifyProviderStatus("queued"), "active", "queued");
});

test("only pending/processing card attempts are active", () => {
  const attempts = [
    attempt({ status: "pending" }),
    attempt({ status: "processing" }),
    attempt({ status: "failed" }),
    attempt({ status: "completed" }),
    attempt({ status: "pending", method: "wallet" }),
  ];
  assertEqual(findActiveCardAttempts(attempts).length, 2, "two active card attempts");
});

console.log("\nDuplicate refund quarantine");

test("refund-required is read only from failed duplicates", () => {
  const duplicate = attempt({
    status: "failed",
    metadata: JSON.stringify({
      duplicatePayment: true,
      refundRequired: true,
      duplicateOf: "tx_original",
    }),
  });
  const ordinaryFailure = attempt({
    status: "failed",
    metadata: JSON.stringify({ failureReason: "declined" }),
  });
  const completed = attempt({
    status: "completed",
    metadata: JSON.stringify({ refundRequired: true }),
  });
  assertEqual(
    findRefundRequiredAttempts([duplicate, ordinaryFailure, completed]).length,
    1,
    "only the failed duplicate is flagged",
  );
});

test("a pending automatic refund stays refund-required", () => {
  const duplicate = attempt({
    status: "failed",
    metadata: JSON.stringify({
      duplicatePayment: true,
      refundRequired: true,
      refundStatus: "pending",
    }),
  });
  assert(requiresRefund(duplicate.metadata), "pending refund still flagged");
  assert(
    isAutomaticRefundInProgress(duplicate.metadata),
    "pending refund is in progress, not manual",
  );
});

test("a processed automatic refund clears refund-required", () => {
  const duplicate = attempt({
    status: "failed",
    metadata: JSON.stringify({
      duplicatePayment: true,
      refundRequired: true,
      refundStatus: "processed",
    }),
  });
  assert(!requiresRefund(duplicate.metadata), "processed refund no longer flagged");
  assert(
    !isAutomaticRefundInProgress(duplicate.metadata),
    "processed refund is not in progress",
  );
  assertEqual(
    findRefundRequiredAttempts([duplicate]).length,
    0,
    "reconciliation no longer treats it as unresolved",
  );
});

test("a failed automatic refund remains manual review", () => {
  const duplicate = attempt({
    status: "failed",
    metadata: JSON.stringify({
      duplicatePayment: true,
      refundRequired: true,
      refundStatus: "failed",
    }),
  });
  assert(requiresRefund(duplicate.metadata), "failed refund still flagged");
  assert(
    !isAutomaticRefundInProgress(duplicate.metadata),
    "failed refund is not in progress",
  );
});

console.log("\n============================================================");
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
