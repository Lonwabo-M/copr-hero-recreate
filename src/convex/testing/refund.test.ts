/**
 * Automatic duplicate-charge refund tests.
 *
 * Verifies the provider-refund path against the actual source files:
 *
 *  1. Refund model        — one payment_refunds row per quarantined charge.
 *  2. At-most-once gate   — only a queued row can request a provider refund.
 *  3. Provider safety     — existing Paystack refunds are adopted, never
 *                           duplicated; failures stay manual review.
 *  4. Webhook authority   — refund.processed is the only state that clears
 *                           refundRequired.
 *  5. Reconciliation      — pending refunds are in-progress anomalies; failed
 *                           refunds remain manual-review anomalies.
 *
 * Run: bunx tsx src/convex/testing/refund.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isQuarantinedCharge,
  requiresRefund,
  isAutomaticRefundInProgress,
  parseAttemptMetadata,
} from "../payments/_paymentAttempts";
import { normalizePaystackRefundStatus } from "../payments/_provider";

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Expected to find: "${needle}"`);
  }
}

function before(src: string, first: string, second: string, message: string) {
  const firstIndex = src.indexOf(first);
  const secondIndex = src.indexOf(second);
  assertTrue(
    firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex,
    message,
  );
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const schema = read("src/convex/schema.ts");
const mutations = read("src/convex/payments/mutations.ts");
const actions = read("src/convex/payments/actions.ts");
const refunds = read("src/convex/payments/refunds.ts");
const provider = read("src/convex/payments/_provider.ts");
const http = read("src/convex/http.ts");
const reconcile = read("src/convex/payments/_reconcile.ts");
const crons = read("src/convex/crons.ts");

// ─── 1. Refund model ─────────────────────────────────────────────────────────

console.log("\n1. Refund model");

test("payment_refunds is a dedicated table, not a payment status overload", () => {
  assertContains(schema, "payment_refunds: defineTable", "refund table exists");
  const block = schema.slice(
    schema.indexOf("payment_refunds: defineTable"),
    schema.indexOf("// ─── Proof of Delivery", schema.indexOf("payment_refunds: defineTable")),
  );
  for (const field of [
    "paymentTransactionId",
    "orderId",
    "userId",
    "transactionReference",
    "providerTransactionId",
    "amount",
    "reason",
    "status",
    "providerRefundId",
    "providerRefundReference",
    "failureReason",
    "attempts",
    "requestedAt",
    "processedAt",
  ]) {
    assertContains(block, field, `refund field ${field}`);
  }
  for (const status of ["queued", "requesting", "pending", "processing", "processed", "failed"]) {
    assertContains(block, `"${status}"`, `refund status ${status}`);
  }
  assertContains(block, 'by_payment', "one-refund-per-payment lookup index");
  assertContains(block, 'by_transaction_reference', "webhook lookup index");
});

test("quarantine creates exactly one refund and schedules the provider call", () => {
  const quarantine = mutations.slice(
    mutations.indexOf("completionGate.kind === \"duplicate\""),
    mutations.indexOf("// Attach provider evidence, then complete."),
  );
  assertContains(quarantine, 'query("payment_refunds")', "checks for an existing refund row");
  assertContains(quarantine, "by_payment", "uses the one-per-payment index");
  assertContains(quarantine, 'insert("payment_refunds"', "creates the refund row");
  assertContains(quarantine, "status: \"queued\"", "starts queued");
  assertContains(quarantine, "ctx.scheduler.runAfter", "schedules the action");
  assertContains(
    quarantine,
    "internal.payments.refunds.processAutomaticRefund",
    "schedules the refund processor",
  );
});

test("quarantine preserves an already-processed refund on webhook replay", () => {
  assertContains(mutations, "priorRefundStatus", "reads prior refund state");
  assertContains(mutations, "refundRequired: priorRefundStatus !== \"processed\"", "does not reset terminal refund");
  assertContains(mutations, "refundStatus: priorRefundStatus ??", "preserves provider status");
});

test("existing and pre-deploy quarantines are backfilled hourly", () => {
  assertContains(
    refunds,
    "export const enqueueMissingAutomaticRefunds",
    "backfill mutation exists",
  );
  assertContains(
    refunds,
    "isQuarantinedCharge(tx.metadata)",
    "only quarantined charges are picked up",
  );
  assertContains(
    refunds,
    "requiresRefund(tx.metadata)",
    "processed refunds are not re-queued",
  );
  assertContains(refunds, 'existing.status === "queued"', "lost queued actions are rescheduled");
  assertContains(refunds, "refundId: existing._id", "reuses the existing row");
  assertContains(crons, "enqueue missing duplicate refunds", "backfill is scheduled");
  assertContains(
    crons,
    "internal.payments.refunds.enqueueMissingAutomaticRefunds",
    "cron calls the backfill mutation",
  );
});

// ─── 2. At-most-once gate ────────────────────────────────────────────────────

console.log("\n2. At-most-once claim");

test("only a queued refund can become requesting", () => {
  const claim = refunds.slice(
    refunds.indexOf("export const claimAutomaticRefund"),
    refunds.indexOf("export const expireStuckAutomaticRefund"),
  );
  assertContains(claim, 'refund.status !== "queued"', "queued-only guard");
  assertContains(claim, 'status: "requesting"', "claims before the provider call");
  assertContains(claim, "ctx.scheduler.runAfter", "schedules the stuck-refund safety net");
  assertContains(
    claim,
    "expireStuckAutomaticRefund",
    "stuck claims become manual review, not a second request",
  );
});

test("the processor re-reads and claims before touching the provider", () => {
  const action = refunds.slice(refunds.indexOf("export const processAutomaticRefund"));
  assertContains(action, "getRefundForProcessing", "re-reads the queued row");
  assertContains(action, "claimAutomaticRefund", "claims it");
  before(action, "claimAutomaticRefund", "listPaystackRefunds", "claim precedes provider calls");
  before(action, "listPaystackRefunds", "createPaystackRefund", "lookup precedes creation");
});

test("provider calls stay inside the internal action", () => {
  assertTrue(!mutations.includes("api.paystack.co/refund"), "no provider refund call in a mutation");
  assertTrue(!actions.includes("api.paystack.co/refund"), "charge action does not call refunds");
  assertContains(provider, "fetch", "provider call lives in the shared helper");
});

// ─── 3. Provider safety ──────────────────────────────────────────────────────

console.log("\n3. Provider safety");

test("refund lookup uses the original transaction reference", () => {
  assertContains(
    provider,
    "`${PAYSTACK_BASE}/refund?reference=${encodeURIComponent(transactionReference)}`",
    "lists refunds by transaction reference",
  );
  assertContains(provider, 'method: "POST"', "creates a refund with POST");
  assertContains(provider, "merchant_note", "records an internal reason");
  assertContains(provider, "customer_note", "records a customer-safe reason");
  assertContains(provider, "amount: input.amount", "refunds the quarantined amount");
});

test("existing refunds are adopted instead of duplicated", () => {
  const action = refunds.slice(refunds.indexOf("export const processAutomaticRefund"));
  assertContains(action, "pickExistingRefund", "selects an existing refund");
  assertContains(action, "adoptedExisting: true", "reports adoption");
  assertContains(action, "found.id", "stores the provider refund id");
  before(action, "const found = pickExistingRefund", "let created:", "returns before creating a second refund");
});

test("failed or ambiguous provider outcomes stay flagged for manual review", () => {
  const action = refunds.slice(refunds.indexOf("export const processAutomaticRefund"));
  for (const reason of [
    "PAYSTACK_SECRET_KEY is not configured",
    "Could not check existing provider refunds",
    "Paystack refund request failed",
    "unrecognised refund status",
  ]) {
    assertContains(action, reason, `manual-review fallback: ${reason}`);
  }
  assertContains(
    action,
    'status: "failed"',
    "ambiguity is recorded as failed, not silently retried",
  );
});

test("refund amount mismatches cannot clear the flag", () => {
  const record = refunds.slice(
    refunds.indexOf("export const recordProviderRefund"),
    refunds.indexOf("export const getAutomaticRefundByReference"),
  );
  assertContains(record, "args.amountFromProvider !== refund.amount", "amount integrity check");
  assertContains(record, "nextStatus = \"failed\"", "mismatch becomes a failure");
  assertContains(record, "without a verifiable amount", "missing amount stays manual");
});

// ─── 4. Webhook authority ────────────────────────────────────────────────────

console.log("\n4. Refund webhook authority");

test("Paystack refund webhooks are routed by transaction_reference", () => {
  assertContains(http, "transaction_reference", "flat refund reference field read");
  assertContains(http, "refund_reference", "processor refund reference read");
  assertContains(http, "refundStatus", "webhook status forwarded");
  assertContains(actions, 'args.event.startsWith("refund.")', "refund events recognized");
  assertContains(
    actions,
    "getAutomaticRefundByReference",
    "matches our refund row to the original transaction",
  );
  assertContains(actions, "recordProviderRefund", "updates from provider evidence");
});

test("only provider-processed clears refundRequired", () => {
  const record = refunds.slice(
    refunds.indexOf("export const recordProviderRefund"),
    refunds.indexOf("export const getAutomaticRefundByReference"),
  );
  assertContains(record, "isTerminalSuccess", "terminal-success branch exists");
  assertContains(record, "refundRequired: !isTerminalSuccess", "flag clears only on processed");
  assertContains(record, "PAYMENT_REFUNDED", "processed audit event");
  assertContains(record, "PAYMENT_REFUND_FAILED", "failed audit event");
  assertContains(record, "payment_refunded", "customer notification on success");
});

test("webhook replays cannot downgrade a processed refund", () => {
  const record = refunds.slice(
    refunds.indexOf("export const recordProviderRefund"),
    refunds.indexOf("export const getAutomaticRefundByReference"),
  );
  assertContains(record, 'if (refund.status === "processed")', "terminal guard");
  assertContains(record, "return { updated: false", "replay is a no-op");
  assertContains(record, 'refund.status === "processing" && nextStatus === "pending"', "no backwards transition");
});

// ─── 5. Reconciliation semantics ─────────────────────────────────────────────

console.log("\n5. Reconciliation semantics");

test("pending automatic refunds are reported as in progress", () => {
  assertContains(
    reconcile,
    "isAutomaticRefundInProgress",
    "reconciliation distinguishes pending from manual",
  );
  assertContains(
    reconcile,
    "automatic refund in progress",
    "operator-facing in-progress message",
  );
  assertContains(
    reconcile,
    "manual refund review",
    "failed refunds remain manual",
  );
});

test("a processed refund no longer appears as a refund-required anomaly", () => {
  assertTrue(
    !requiresRefund(
      JSON.stringify({
        refundRequired: true,
        refundStatus: "processed",
      }),
    ),
    "processed metadata is not refund-required",
  );
  assertTrue(
    !isAutomaticRefundInProgress(
      JSON.stringify({ refundStatus: "processed" }),
    ),
    "processed is not in progress",
  );
});

test("quarantine metadata is recognized even before a refund row exists", () => {
  assertTrue(
    isQuarantinedCharge(
      JSON.stringify({ duplicatePayment: true, refundRequired: true }),
    ),
    "legacy duplicate metadata recognized",
  );
  assertTrue(
    isQuarantinedCharge(
      JSON.stringify({ paymentAfterRefund: true, refundRequired: true }),
    ),
    "post-refund charge recognized",
  );
  assertTrue(
    !isQuarantinedCharge(JSON.stringify({ failureReason: "declined" })),
    "ordinary failure not treated as a duplicate",
  );
  assertEqual(
    parseAttemptMetadata("not-json").refundStatus,
    undefined,
    "malformed metadata is safe",
  );
});

test("refund statuses are normalized and unknown statuses are rejected", () => {
  for (const status of ["pending", "processing", "processed", "failed"] as const) {
    assertEqual(normalizePaystackRefundStatus(status), status, status);
  }
  assertEqual(normalizePaystackRefundStatus("reversed"), null, "unknown status");
  assertEqual(normalizePaystackRefundStatus(undefined), null, "missing status");
});

console.log(`\n${"=".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
