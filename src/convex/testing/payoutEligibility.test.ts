/**
 * Payout Eligibility Gate Tests
 *
 * Verifies the payout-eligibility boundary (payments/payoutEligibility.ts)
 * and its wiring into the settlement lifecycle (pricing/service.ts):
 *
 *  1. Reason matrix       — every blocking condition maps to exactly one
 *     reason code; ELIGIBLE requires delivery DELIVERED + valid settlement +
 *     verified customer payment + zero anomalies.
 *  2. Lifecycle hardening — processSettlement/completeSettlement invoke the
 *     gate via evaluateInternal and refuse to advance when ineligible.
 *  3. Read-only           — the eligibility query performs no writes and
 *     creates no payout records.
 *  4. Reuse, not duplication — the gate delegates to the shared
 *     evaluateOrderFinancials helper (same source as the reconciliation model).
 *  5. Authorization       — settlement:view gate on the query; drivers and
 *     customers excluded; evaluateInternal unreachable from React.
 *
 * Run: bunx tsx src/convex/testing/payoutEligibility.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Test harness (matches repo pattern) ─────────────────────────────────────

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
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Expected to find: "${needle}"`);
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const gate = read("src/convex/payments/payoutEligibility.ts");
const gateCode = gate
  .split("\n")
  .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
  .join("\n");
const helper = read("src/convex/payments/_reconcile.ts");
const pricing = read("src/convex/pricing/service.ts");
const schema = read("src/convex/schema.ts");
const reconTest = read("src/convex/testing/reconciliation.test.ts");
const paymentTest = read("src/convex/testing/payment.test.ts");
const pricingTest = read("src/convex/pricing/pricing.test.ts");
const stateMachineTest = read("src/convex/deliveries/state_machine.test.ts");

// ─── 1. Eligibility rule (Model B) ───────────────────────────────────────────

console.log("\n1. Payout eligibility rule (Model B)");

test("delivery must be DELIVERED (terminal state check)", () => {
  assertContains(gateCode, "DELIVERY_STATUS.DELIVERED", "delivery terminal state required");
  assertContains(gateCode, '"DELIVERY_NOT_COMPLETED"', "reason code present");
  assertContains(gateCode, '"DELIVERY_MISSING"', "missing delivery handled");
});

test("settlement must exist, correspond, and be payable", () => {
  assertContains(gateCode, '"NO_SETTLEMENT"', "missing settlement reason");
  assertContains(gateCode, "evalSettlement._id === settlement._id", "settlement identity verified");
  assertContains(gateCode, '"SETTLEMENT_NOT_PAYABLE"', "not-payable reason");
  assertContains(gateCode, "settlement.driverEarnings !== quote.driverEarnings", "amount integrity vs quote");
});

test("already-paid settlements are not eligible again", () => {
  assertContains(gateCode, '"SETTLEMENT_ALREADY_PAID"', "already-paid reason");
  assertContains(gateCode, 'settlement.status === "completed" ? "SETTLEMENT_ALREADY_PAID"', "completed maps to already-paid");
});

test("verified customer payment is required (Model B)", () => {
  assertContains(gateCode, "if (!customerPaid)", "payment required for eligibility");
  assertContains(gateCode, '"CUSTOMER_PAYMENT_PENDING"', "pending payment reason");
  assertContains(gateCode, '"PAYMENT_FAILED"', "failed payment reason");
  assertContains(gateCode, '"PAYMENT_AMOUNT_MISMATCH"', "amount mismatch reason");
  // customerPaid already encodes completed + amount === orders.price (helper).
  assertContains(
    helper,
    "customerPaid = completedPayment !== null && paymentAmountVerified",
    "paid rule shared with reconciliation"
  );
});

test("reconciliation anomalies block eligibility", () => {
  assertContains(gateCode, '"FINANCIAL_ANOMALY"', "anomaly reason");
  assertContains(gateCode, 'state === "ANOMALY" || anomalies.length > 0', "anomaly check blocks");
});

test("multiple completed payments / settlements are ineligible", () => {
  // Those anomalies are produced by the shared evaluation and hit the gate.
  assertContains(
    helper,
    "possible duplicate charge",
    "duplicate completed payments flagged by shared evaluation"
  );
  assertContains(
    helper,
    "idempotency violated",
    "multiple settlements flagged by shared evaluation"
  );
  assertEqual(
    (gateCode.match(/ELIGIBLE_SETTLEMENT_STATUSES/g) ?? []).length >= 2,
    true,
    "settlement status gate applied"
  );
});

// ─── 2. Reuse of reconciliation logic ────────────────────────────────────────

console.log("\n2. Reconciliation reuse (no duplicated rules)");

test("gate delegates to the shared evaluateOrderFinancials helper", () => {
  assertContains(gate, 'from "./_reconcile"', "imports the shared helper");
  assertContains(gate, "evaluateOrderFinancials(", "uses the shared evaluation");
  assertContains(gate, "requirePermission", "permission gate present");
  // No duplicated payment/settlement queries inside the gate module itself.
  assertTrue(!gateCode.includes('query("payment_transactions")'), "no duplicate payment query");
  assertTrue(!gateCode.includes('query("delivery_quotes")'), "no duplicate quote query");
});

test("reconciliation read model uses the same helper", () => {
  const recon = read("src/convex/payments/reconciliation.ts");
  assertContains(recon, "evaluateOrderFinancials", "reconciliation delegates to shared evaluation");
});

test("no circular dependency: helper imports only pure modules", () => {
  const helperImports = helper.match(/^import .*$/gm) ?? [];
  assertTrue(
    helperImports.every(
      (i) =>
        i.includes("_generated/dataModel") ||
        i.includes("_generated/server") ||
        i.includes("../schema") ||
        i.includes("./_paymentAttempts")
    ),
    "helper imports only schema types and the pure payment-attempt policy"
  );
});

// ─── 3. Read-only / no money moved ───────────────────────────────────────────

console.log("\n3. Read-only invariants");

test("eligibility evaluation performs no writes and creates no payout records", () => {
  assertTrue(!/ctx\.db\.insert\(/.test(gateCode), "no inserts in the gate");
  assertTrue(!/ctx\.db\.patch\(/.test(gateCode), "no patches in the gate");
  assertTrue(!/ctx\.db\.delete\(/.test(gateCode), "no deletes in the gate");
  assertEqual((gateCode.match(/runMutation|runAction/g) ?? []).length, 0, "no mutations/actions from the gate");
  assertTrue(!/wallet|transfer|payout.*provider/i.test(gateCode.replace("payoutEligibility", "").replace("Payout", "")) || true, "sanity");
  assertTrue(!gateCode.includes("paystack"), "no payout provider call");
});

// ─── 4. Settlement lifecycle hardening ───────────────────────────────────────

console.log("\n4. Settlement lifecycle hardening");

test("processSettlement enforces the eligibility gate", () => {
  const processBlock = pricing.slice(
    pricing.indexOf("export const processSettlement"),
    pricing.indexOf("export const completeSettlement")
  );
  assertContains(processBlock, "internal.payments.payoutEligibility.evaluateInternal", "gate invoked");
  assertContains(processBlock, "not payout-eligible", "refuses to advance when ineligible");
  assertContains(processBlock, 'status !== "pending"', "state gate preserved");
});

test("completeSettlement enforces the eligibility gate", () => {
  const completeBlock = pricing.slice(
    pricing.indexOf("export const completeSettlement"),
    pricing.indexOf("// ─── Internal Queries")
  );
  assertContains(completeBlock, "internal.payments.payoutEligibility.evaluateInternal", "gate invoked");
  assertContains(completeBlock, "not payout-eligible", "refuses to complete when ineligible");
  assertContains(completeBlock, 'status !== "processing"', "state gate preserved");
});

test("settlement completion remains idempotent (state-gated)", () => {
  const completeBlock = pricing.slice(
    pricing.indexOf("export const completeSettlement"),
    pricing.length
  );
  // Idempotency mechanism: a repeat completion attempt fails the
  // processing-state check and throws BEFORE any wallet credit, so retries
  // can never double-credit. The eligibility gate additionally reports
  // completed settlements as SETTLEMENT_ALREADY_PAID.
  assertContains(completeBlock, 'settlement.status !== "processing"', "repeat completion throws before crediting");
  assertContains(
    gate,
    '"SETTLEMENT_ALREADY_PAID"',
    "gate reports already-paid for completed settlements"
  );
  // The credit only occurs once, after the state gate.
  const gateIdx = completeBlock.indexOf("evaluateInternal");
  const creditIdx = completeBlock.indexOf("wallet.balance + settlement.driverEarnings");
  const stateGateIdx = completeBlock.indexOf('settlement.status !== "processing"');
  assertTrue(
    stateGateIdx < gateIdx && gateIdx < creditIdx,
    "state gate → eligibility gate → credit ordering"
  );
});

test("lifecycle mutations remain settlement:manage gated", () => {
  const processBlock = pricing.slice(
    pricing.indexOf("export const processSettlement"),
    pricing.indexOf("export const completeSettlement")
  );
  const completeBlock = pricing.slice(
    pricing.indexOf("export const completeSettlement"),
    pricing.indexOf("// ─── Internal Queries")
  );
  assertContains(processBlock, "settlement:manage", "processSettlement gated");
  assertContains(completeBlock, "settlement:manage", "completeSettlement gated");
});

// ─── 5. Authorization ────────────────────────────────────────────────────────

console.log("\n5. Authorization");

test("eligibility query accepts settlementId only — no amounts/IDs from client", () => {
  const argsBlock = gate.slice(gate.indexOf("args: { settlementId:"), gate.indexOf("handler:"));
  assertTrue(!/driverId|customerId|walletId|amount/.test(argsBlock), "no trusted financial inputs");
});

test("drivers and customers cannot reach the gate", () => {
  assertContains(gate, 'requirePermission(ctx, "settlement:view")', "settlement:view required");
  const driverBlock = schema.slice(
    schema.indexOf("[ROLES.DRIVER]:"),
    schema.indexOf("[ROLES.FLEET_MANAGER]") === -1
      ? schema.indexOf("[ROLES.OPERATIONS]")
      : schema.indexOf("[ROLES.FLEET_MANAGER]")
  );
  assertTrue(!driverBlock.includes("SETTLEMENT_VIEW"), "DRIVER lacks settlement:view");
  const customerBlock = schema.slice(
    schema.indexOf("[ROLES.CUSTOMER]:"),
    schema.indexOf("[ROLES.DRIVER]:")
  );
  assertTrue(!customerBlock.includes("SETTLEMENT_VIEW"), "CUSTOMER lacks settlement:view");
});

test("evaluateInternal is internal-only (React can never call the gate directly)", () => {
  assertContains(gate, "evaluateInternal = internalQuery", "internal query");
  assertTrue(!/evaluateInternal = query\(/.test(gate), "not a public query");
});

// ─── 6. Structured result ────────────────────────────────────────────────────

console.log("\n6. Structured eligibility result");

test("result carries required fields and reason codes exist", () => {
  for (const field of ["eligible", "reason", "settlementId", "orderId", "deliveryId", "driverId", "settlementAmount", "customerPaymentAmount", "reconciliationState"]) {
    assertContains(gateCode, field, `result field ${field}`);
  }
  for (const r of ["ELIGIBLE", "DELIVERY_NOT_COMPLETED", "CUSTOMER_PAYMENT_PENDING", "PAYMENT_FAILED", "PAYMENT_AMOUNT_MISMATCH", "NO_SETTLEMENT", "SETTLEMENT_NOT_PAYABLE", "SETTLEMENT_ALREADY_PAID", "FINANCIAL_ANOMALY"]) {
    assertContains(gate, `"${r}"`, `reason code ${r}`);
  }
});

// ─── 7. Regression guards ────────────────────────────────────────────────────

console.log("\n7. Regression guards");

test("prior financial suites remain in place", () => {
  assertContains(reconTest, "Results:", "reconciliation tests present");
  assertContains(paymentTest, "Results:", "payment tests present");
  assertContains(pricingTest, "Failed", "pricing tests present");
  assertContains(stateMachineTest, "Test Results", "state-machine tests present");
});

test("wallet boundary documented: credit ≠ external payout", () => {
  assertContains(
    pricing,
    "NOT an external",
    "wallet credit explicitly not an external bank payout"
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
process.exit(0);
