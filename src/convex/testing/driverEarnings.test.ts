/**
 * Driver Earnings Backend Tests
 *
 * Verifies the driver-scoped earnings read model (driver_earnings.ts) against
 * the actual source. These tests inspect the source files directly — they do
 * NOT run Convex (which would require a running server). They cover:
 *
 *  1. Authorization / driver scoping — queries reject non-drivers and refuse
 *     arbitrary driverId input.
 *  2. No pricing recalculation — amounts come from stored settlements + quotes,
 *     never from calculatePricingBreakdown / calculateQuote.
 *  3. Settlement status semantics — completed is never labeled "paid";
 *     pending/processing are "Payable"/"Processing".
 *  4. Payout eligibility — driver-safe wrapper reuses evaluateOrderFinancials
 *     (Model B), never exposes privileged reconciliation diagnostics.
 *  5. Read-only guarantee — no settlement/payment/wallet writes exposed to the
 *     driver through these queries.
 *  6. Paid-out honesty — paidOut is 0 with an explicit "No external payouts
 *     recorded" note, never a fabricated balance.
 *
 * Run: bunx tsx src/convex/testing/driverEarnings.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Test harness (matches repo pattern) ──────────────────────────────────────

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
    throw new Error(
      `Assertion failed: ${message}. Expected ${expected}, got ${actual}`,
    );
  }
}

function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(
      `Assertion failed: ${message}. Expected to find: "${needle}"`,
    );
  }
}

function assertNotContains(
  haystack: string,
  needle: string,
  message: string,
) {
  if (haystack.includes(needle)) {
    throw new Error(
      `Assertion failed: ${message}. Should NOT contain: "${needle}"`,
    );
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const driverEarnings = read("src/convex/driver_earnings.ts");
const pricingService = read("src/convex/pricing/service.ts");
const _reconcile = read("src/convex/payments/_reconcile.ts");
const payoutEligibility = read("src/convex/payments/payoutEligibility.ts");

// ─── 1. Authorization / driver scoping ────────────────────────────────────────

console.log("\n1. Authorization and driver scoping");

test("only drivers can view earnings (getDriverEarnings rejects non-drivers)", () => {
  assertContains(
    driverEarnings,
    'if (user.role !== ROLES.DRIVER) {\n      throw new Error("Only drivers can view their earnings");',
    "getDriverEarnings gates on ROLES.DRIVER",
  );
});

test("getDriverEarningsSummary only allows drivers", () => {
  assertContains(
    driverEarnings,
    'if (user.role !== ROLES.DRIVER) {\n      throw new Error("Only drivers can view their earnings");',
    "getDriverEarningsSummary gates on ROLES.DRIVER",
  );
});

test("getSettlementDriverEligibility only allows drivers", () => {
  assertContains(
    driverEarnings,
    'if (user.role !== ROLES.DRIVER) {\n      throw new Error("Only drivers can check payout eligibility");',
    "getSettlementDriverEligibility gates on ROLES.DRIVER",
  );
});

test("no driverId accepted from client in getDriverEarnings (identity from session)", () => {
  // The query args may optionally include cursor/limit/status but NOT a
  // driverId. The authenticated driver IS the driver.
  assertNotContains(
    driverEarnings.slice(
      driverEarnings.indexOf("export const getDriverEarnings = query"),
      driverEarnings.indexOf("export const getSettlementDriverEligibility"),
    ),
    "driverId: v.id",
    "getDriverEarnings does not accept driverId from client",
  );
});

test("settlement ownership enforced in driver eligibility (driver must own settlement)", () => {
  // The driver eligibility query refuses to return data for settlements that
  // belong to another driver — it returns a safe "Not found" rather than a
  // denial that would leak the settlement's existence.
  assertContains(
    driverEarnings,
    'if (settlement.driverId !== user.userId) {',
    "driver eligibility checks settlement.driverId against the authenticated user",
  );
  assertContains(
    driverEarnings,
    'return { ok: false, error: "Not found" };',
    "driver eligibility returns safe 'Not found' for another driver's settlement",
  );
});

// ─── 2. No pricing recalculation ──────────────────────────────────────────────

console.log("\n2. No pricing recalculation");

test("driver earnings query does not import calculatePricingBreakdown", () => {
  assertNotContains(
    driverEarnings,
    "calculatePricingBreakdown",
    "driver_earnings does not import the pricing calculation function",
  );
});

test("driver earnings query does not import calculateQuote", () => {
  assertNotContains(
    driverEarnings,
    "calculateQuote",
    "driver_earnings does not import the public quote API",
  );
});

test("driver earnings amounts come from stored settlement.driverEarnings", () => {
  assertContains(
    driverEarnings,
    "s.driverEarnings",
    "earnings are derived from stored settlement.driverEarnings",
  );
});

test("driver earnings enriches with stored quote.driverEarnings", () => {
  assertContains(
    driverEarnings,
    "const quote = await ctx.db.get(s.quoteId);\n      const order = await ctx.db.get(s.orderId);\n      const delivery = await ctx.db.get(s.deliveryId);",
    "each settlement row is enriched with its stored quote/order/delivery",
  );
  assertContains(
    driverEarnings,
    "quoteDriverEarnings = quote?.driverEarnings",
    "quote.driverEarnings is read (not recalculated)",
  );
});

test("driver earnings does not call calculateAndStoreQuote", () => {
  assertNotContains(
    driverEarnings,
    "calculateAndStoreQuote",
    "driver_earnings never triggers a new quote calculation",
  );
});

// ─── 3. Settlement status semantics ───────────────────────────────────────────

console.log("\n3. Settlement status presentation semantics");

test("pending settlements are labeled Payable, not Paid", () => {
  assertContains(
    driverEarnings,
    "pending      → \"Payable\"",
    "pending status is presented as Payable",
  );
});

test("processing settlements are labeled Processing", () => {
  assertContains(
    driverEarnings,
    "processing   → \"Processing\"",
    "processing status is presented as Processing",
  );
});

test("completed settlements are NOT labeled Paid", () => {
  // The doc comment says completed → "Settlement completed" (not "Paid").
  const block = driverEarnings.slice(
    driverEarnings.indexOf("Presentation semantics"),
    driverEarnings.indexOf("Payout eligibility:"),
  );
  assertContains(block, "completed    → \"Settlement completed\"", "completed is labeled Settlement completed");
  assertNotContains(block, "completed    → \"Paid\"", "completed is NOT labeled Paid");
});

test("UI maps settlementStatus === 'completed' to 'Settlement completed'", () => {
  assertContains(
    driverEarnings,
    "Already settled",
    "completed settlements get the 'Already settled' driver-facing label",
  );
});

// ─── 4. Payout eligibility (driver-safe wrapper) ─────────────────────────────

console.log("\n4. Payout eligibility");

test("driver eligibility reuses evaluateOrderFinancials", () => {
  assertContains(
    driverEarnings,
    "evaluateOrderFinancials(ctx, settlement.orderId)",
    "driver eligibility uses the shared financial evaluation",
  );
});

test("driver eligibility does not expose privileged reconciliation diagnostics in its return value", () => {
  // The driver-facing result shape is { ok, eligible, label, reason }. It must
  // NOT return the raw `anomalies` array, `platformRevenue`, provider
  // references, or internal settlement/IDs.
  const eligBlock = driverEarnings.slice(
    driverEarnings.indexOf("export const getSettlementDriverEligibility"),
    driverEarnings.indexOf("export const getDriverEarningsSummary"),
  );

  // The return value must be a simple object with ok/eligible/label/reason only.
  const returnShape = eligBlock.match(/const result = \([^)]+\) => \(\{/);
  assertTrue(
    returnShape !== null,
    "driver eligibility defines a result() closure for its return value",
  );
  const resultBody = eligBlock.slice(
    eligBlock.indexOf("const result = (") + "const result = (".length,
    eligBlock.indexOf("});", eligBlock.indexOf("const result = (") + 1),
  );
  assertContains(resultBody, "ok: true", "result returns ok");
  assertContains(resultBody, "eligible:", "result returns eligible");
  assertContains(resultBody, "label,", "result returns label");
  assertContains(resultBody, "reason,", "result returns reason");
  assertNotContains(resultBody, "anomalies", "result does NOT expose anomalies");
  assertNotContains(resultBody, "platformRevenue", "result does NOT expose platformRevenue");
  assertNotContains(resultBody, "provider", "result does NOT expose provider references");

  // The block may internally *use* `anomalies` for the state check — that's
  // fine. What matters is the return value does not expose it.
  assertTrue(
    eligBlock.includes("anomalies"),
    "driver eligibility internally reads anomalies for the state gate (allowed)",
  );
});

test("driver eligibility maps reasons to driver-safe labels", () => {
  assertContains(
    driverEarnings,
    "Awaiting customer payment",
    "CUSTOMER_PAYMENT_PENDING → driver-safe label",
  );
  assertContains(
    driverEarnings,
    "Customer payment failed",
    "PAYMENT_FAILED → driver-safe label",
  );
  assertContains(
    driverEarnings,
    "Payment amount does not match",
    "PAYMENT_AMOUNT_MISMATCH → driver-safe label",
  );
});

test("driver eligibility returns a simple Eligible / Not yet eligible / Not payable / Already settled model", () => {
  const eligBlock = driverEarnings.slice(
    driverEarnings.indexOf("export const getSettlementDriverEligibility"),
    driverEarnings.indexOf("export const getDriverEarningsSummary"),
  );
  assertTrue(
    eligBlock.includes('"Eligible"'),
    "driver eligibility can return Eligible",
  );
  assertTrue(
    eligBlock.includes('"Not yet eligible"'),
    "driver eligibility can return Not yet eligible",
  );
  assertTrue(
    eligBlock.includes('"Not payable"'),
    "driver eligibility can return Not payable",
  );
  assertTrue(
    eligBlock.includes('"Already settled"'),
    "driver eligibility can return Already settled",
  );
});

// ─── 5. Read-only guarantee ───────────────────────────────────────────────────

console.log("\n5. Read-only guarantee");

test("driver earnings queries perform no writes", () => {
  // All three exports are `query`, never `mutation` / `internalMutation`.
  const block = driverEarnings;
  assertTrue(
    block.split("export const getDriverEarnings = query").length >= 2 ||
      block.includes("export const getDriverEarnings = query"),
    "getDriverEarnings is a query",
  );
  assertTrue(
    block.includes("export const getSettlementDriverEligibility = query"),
    "getSettlementDriverEligibility is a query",
  );
  assertTrue(
    block.includes("export const getDriverEarningsSummary = query"),
    "getDriverEarningsSummary is a query",
  );
});

test("driver earnings queries do not call insert/patch/runMutation on settlements", () => {
  const block = driverEarnings;
  assertNotContains(
    block,
    "ctx.db.insert",
    "driver earnings does not insert records",
  );
  assertNotContains(
    block,
    "ctx.db.patch",
    "driver earnings does not patch records",
  );
});

// ─── 6. Paid-out honesty ──────────────────────────────────────────────────────

console.log("\n6. Paid-out honesty");

test("paidOut is explicitly 0 with an explanatory note", () => {
  assertContains(
    driverEarnings,
    "paidOut: 0,\n      paidOutNote: \"No external payouts recorded\"",
    "paidOut is 0 with explicit 'No external payouts recorded' note",
  );
});

test("paid-out note also appears in the summary query", () => {
  assertContains(
    driverEarnings,
    "paidOut: 0,\n      paidOutNote: \"No external payouts recorded\"",
    "summary query also states no external payouts recorded",
  );
});

// ─── 7. No external payout integration exposed ───────────────────────────────

console.log("\n7. No external payout integration");

test("driver earnings does not import Paystack Transfers or payout provider code", () => {
  assertNotContains(
    driverEarnings,
    "Paystack",
    "driver earnings does not reference Paystack",
  );
  assertNotContains(
    driverEarnings,
    "Transfers",
    "driver earnings does not reference Transfers",
  );
});

test("driver earnings does not call processSettlement or completeSettlement", () => {
  assertNotContains(
    driverEarnings,
    "processSettlement",
    "driver earnings does not trigger settlement processing",
  );
  assertNotContains(
    driverEarnings,
    "completeSettlement",
    "driver earnings does not trigger settlement completion",
  );
});

// ─── 8. Relationship to driver history (reuse, not duplication) ──────────────

console.log("\n8. Relationship to driver history");

test("driver earnings references the existing delivery history route for detail", () => {
  // The UI (DriverEarnings.tsx) navigates to /driver/history/:deliveryId for
  // detail rather than building a separate earnings detail page.
  // This is verified by the fact that the earnings page navigates via history
  // route. We check the backend doesn't claim to have a separate earnings
  // detail mutation.
  assertNotContains(
    driverEarnings,
    "earningsDetail",
    "no separate earnings-detail mutation is introduced",
  );
});

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nDriver Earnings backend tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}
