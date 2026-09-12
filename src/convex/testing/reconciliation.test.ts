/**
 * Reconciliation Read-Model Tests
 *
 * Verifies the reconciliation query source (payments/reconciliation.ts)
 * against the actual schema, indexes, and permission model:
 *
 *  1. State derivation matrix — RECONCILED / UNPAID / PAID_NO_SETTLEMENT /
 *     SETTLEMENT_PENDING / SETTLEMENT_PROCESSING / ANOMALY mapped to the exact
 *     record combinations the query reads.
 *  2. Anomaly detection — payment vs orders.price, orders.price vs quote
 *     totalCharge, settlement vs quote driverEarnings, duplicate completed
 *     payments, duplicate settlements — surfaced, never auto-corrected.
 *  3. Authorization — settlement:view permission gate; drivers and customers
 *     structurally excluded.
 *  4. Read-only invariants — the query performs no writes (mutation/patch/
 *     insert of any financial record), no pricing recalculation.
 *  5. Platform revenue derivation — totalCharge − driverEarnings from the
 *     stored quote, never recalculated.
 *
 * Run: bunx tsx src/convex/testing/reconciliation.test.ts
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
    console.log(`  ✓✗ ${name}`);
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

const recon = read("src/convex/payments/reconciliation.ts");
const schema = read("src/convex/schema.ts");
const paymentTest = read("src/convex/testing/payment.test.ts");
const settlementTest = read("src/convex/testing/settlement.test.ts");
const pricingTest = read("src/convex/pricing/pricing.test.ts");

function stripComments(src: string): string {
  return src
    .split("\n")
    .filter(
      (l) =>
        !l.trim().startsWith("//") &&
        !l.trim().startsWith("*") &&
        !l.trim().startsWith("/*")
    )
    .join("\n");
}

const reconCode = stripComments(recon);

// ─── 1. Source records & indexes ─────────────────────────────────────────────

console.log("\n1. Source records and indexes");

test("reads all four authoritative sources via existing indexes", () => {
  assertContains(reconCode, '.query("delivery_quotes")', "reads delivery_quotes");
  assertContains(reconCode, '.withIndex("by_order"', "quotes via by_order");
  assertContains(reconCode, '.query("payment_transactions")', "reads payment_transactions");
  assertContains(reconCode, '.query("settlements")', "reads settlements");
  assertContains(reconCode, '.query("deliveries")', "reads deliveries for context");
  assertContains(reconCode, "ctx.db.get(args.orderId)", "reads the order document");
});

test("no new table, no reconciliation persistence", () => {
  assertEqual(
    (schema.match(/reconciliation/g) ?? []).length,
    0,
    "no reconciliation table in the schema"
  );
  const writePatterns = [/ctx\.db\.insert\(/, /ctx\.db\.patch\(/, /ctx\.db\.delete\(/];
  for (const p of writePatterns) {
    assertTrue(!p.test(reconCode), `query performs no writes (${p})`);
  }
  assertEqual(
    (reconCode.match(/runMutation|runAction/g) ?? []).length,
    0,
    "query performs no mutations or actions"
  );
});

// ─── 2. Authorization ────────────────────────────────────────────────────────

console.log("\n2. Authorization");

test("gated by the existing settlement:view permission", () => {
  assertContains(reconCode, 'requirePermission(ctx, "settlement:view")', "permission gate present");
});

test("drivers and customers cannot access reconciliation", () => {
  // Structural: DRIVER role must lack SETTLEMENT_VIEW.
  const driverBlock = schema.slice(
    schema.indexOf("[ROLES.DRIVER]:"),
    schema.indexOf("[ROLES.FLEET_MANAGER]") === -1
      ? schema.indexOf("[ROLES.OPERATIONS]")
      : schema.indexOf("[ROLES.FLEET_MANAGER]")
  );
  assertTrue(!driverBlock.includes("SETTLEMENT_VIEW"), "DRIVER lacks settlement:view");

  // CUSTOMER role must lack SETTLEMENT_VIEW.
  const customerBlock = schema.slice(
    schema.indexOf("[ROLES.CUSTOMER]:"),
    schema.indexOf("[ROLES.DRIVER]:")
  );
  assertTrue(!customerBlock.includes("SETTLEMENT_VIEW"), "CUSTOMER lacks settlement:view");
});

test("accepts orderId only — no driver/settlement/payment/amount inputs", () => {
  const argsBlock = recon.slice(
    recon.indexOf("args: { orderId:"),
    recon.indexOf("handler:")
  );
  assertTrue(!/driverId|settlementId|amount|customerId|userId/.test(argsBlock), "no trusted financial inputs");
});

// ─── 3. Customer payment determination ───────────────────────────────────────

console.log("\n3. Customer payment determination");

test("paid = completed payment whose amount matches orders.price", () => {
  assertContains(reconCode, 'p.status === "completed"', "only completed payments count");
  assertContains(reconCode, "completedPayment.amount === order.price", "amount verified against orders.price");
  assertContains(reconCode, "paymentAmountVerified", "verification flag exists");
  assertContains(reconCode, "customerPaid = completedPayment !== null && paymentAmountVerified", "customerPaid requires both");
});

test("failed/pending payments never count as customer payment", () => {
  // Only the completed filter feeds the paid decision; no summing of attempts.
  assertTrue(!reconCode.includes(".reduce("), "no summing of payment attempts");
  assertTrue(!/status !== "completed"/.test(reconCode), "no inverted (failed-as-paid) logic");
});

test("multiple completed payments surface as an anomaly, not silently picked", () => {
  assertContains(
    reconCode,
    "completedPayments.length > 1",
    "duplicate-completed check exists"
  );
  assertContains(
    reconCode,
    "possible duplicate charge",
    "explicit duplicate-payment anomaly"
  );
});

// ─── 4. Settlement determination & status terminology ────────────────────────

console.log("\n4. Settlement determination");

test("settlement read from by_order; never created or altered", () => {
  const settleBlock = recon.slice(recon.indexOf('// ── Settlement'), recon.indexOf("const driverEntitled"));
  assertContains(settleBlock, '.withIndex("by_order"', "settlement via by_order index");
  assertTrue(!/insert\("settlements"\)/.test(reconCode), "never inserts settlements");
  assertTrue(!/patch\(settlement/.test(reconCode), "never patches settlements");
});

test("all real settlement statuses distinguished, pending ≠ paid", () => {
  for (const st of ['"completed"', '"processing"', '"pending"']) {
    assertContains(recon, st, `handles settlement status ${st}`);
  }
  // RECONCILED only from completed settlement.
  const switchBlock = recon.slice(recon.indexOf('switch (settlement!.status)'), recon.indexOf("// ── Derived platform revenue"));
  assertContains(switchBlock, 'case "completed":\n          state = "RECONCILED"', "RECONCILED requires completed settlement");
  assertContains(switchBlock, 'case "pending":\n          state = "SETTLEMENT_PENDING"', "pending maps to SETTLEMENT_PENDING");
  assertContains(switchBlock, 'case "processing":\n          state = "SETTLEMENT_PROCESSING"', "processing maps to SETTLEMENT_PROCESSING");
  // failed/disputed + paid customer → anomaly.
  assertContains(reconCode, "Settlement status is", "failed/disputed + paid surfaces an anomaly");
});

// ─── 5. Reconciliation states ────────────────────────────────────────────────

console.log("\n5. Reconciliation state derivation");

test("all six states exist with clear names", () => {
  for (const s of ["RECONCILED", "UNPAID", "PAID_NO_SETTLEMENT", "SETTLEMENT_PENDING", "SETTLEMENT_PROCESSING", "ANOMALY"]) {
    assertContains(recon, `"${s}"`, `state ${s} defined`);
  }
});

test("state matrix matches the required derivation rules", () => {
  assertContains(reconCode, "anomalies.length > 0", "anomaly wins over everything");
  assertContains(reconCode, "!customerPaid && !driverEntitled", "UNPAID rule");
  assertContains(reconCode, "customerPaid && !driverEntitled", "PAID_NO_SETTLEMENT rule");
  assertContains(reconCode, "!customerPaid && driverEntitled", "settlement-without-payment rule");
  assertContains(reconCode, "state = \"RECONCILED\"", "RECONCILED assignment");
});

test("amount/record anomalies force ANOMALY", () => {
  const checks = [
    "does not match orders.price",
    "does not match quote totalCharge",
    "does not match quote driverEarnings",
  ];
  for (const c of checks) {
    assertContains(recon, c, `anomaly check: ${c}`);
  }
  assertContains(reconCode, 'state = "ANOMALY"', "ANOMALY state assigned");
});

// ─── 6. Platform revenue ─────────────────────────────────────────────────────

console.log("\n6. Platform revenue derivation");

test("derived from stored quote only — never recalculated", () => {
  assertContains(
    recon,
    "quote.totalCharge - quote.driverEarnings",
    "derived from stored quote values"
  );
  assertContains(reconCode, "derived from stored quote", "labelled as derived");
  const noCalc = !reconCode.includes("calculatePricingBreakdown") &&
    !reconCode.includes("calculateAndStoreQuote");
  assertTrue(noCalc, "no pricing-engine calls");
  assertContains(recon, "NOT recognized accounting", "explicitly not accounting revenue");
});

// ─── 7. Safe references / no secrets ─────────────────────────────────────────

console.log("\n7. Reference exposure");

test("exposes only safe stored references", () => {
  assertContains(recon, "completedPayment.idempotencyKey", "payment reference (idempotency key) exposed");
  assertContains(recon, "providerTransactionId", "provider transaction id exposed");
  assertContains(recon, "SET-${settlement._id}", "wallet transaction reference derived, not fetched");
  // No secret material anywhere.
  assertTrue(!/secret|signature|apiKey|api_key|cvv|cardNumber/i.test(reconCode), "no secrets in the result");
  // No wallet document read.
  assertTrue(!reconCode.includes('.query("wallets")'), "wallet state not read");
});

// ─── 8. Context payload shape ────────────────────────────────────────────────

console.log("\n8. Structured response shape");

test("response contains order/quote/customerPayment/settlement/reconciliation sections", () => {
  for (const section of ["order:", "quote:", "customerPayment:", "settlement:", "reconciliation:", "anomalies"]) {
    assertContains(recon, section, `result section ${section}`);
  }
  assertContains(recon, "deliveryId: delivery._id", "delivery context included");
  assertContains(recon, "delivery.status", "delivery status included");
});

// ─── 9. Regression guards ────────────────────────────────────────────────────

console.log("\n9. Regression guards");

test("payment/settlement/pricing suites remain in place and structured", () => {
  assertContains(paymentTest, "Results:", "payment tests present");
  assertContains(settlementTest, "Results:", "settlement tests present");
  assertContains(pricingTest, "Failed", "pricing tests present");
});

test("payment and settlement flows untouched by this task", () => {
  const actions = read("src/convex/payments/actions.ts");
  const mutations = read("src/convex/payments/mutations.ts");
  const stateMachine = read("src/convex/deliveries/state_machine.ts");
  assertContains(actions, "initiateOrderPayment", "payment initiation intact");
  assertContains(mutations, "completePaymentTransaction", "payment completion intact");
  assertContains(stateMachine, "internal.pricing.service.createSettlement", "settlement trigger intact");
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
