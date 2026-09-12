/**
 * Settlement Activation Tests
 *
 * Verifies the settlement layer against the actual source files:
 *
 *  1. Compensation policy wiring  — settlement is triggered exactly from the
 *     two DELIVERED completion paths (state_machine.completeDelivery and
 *     pod.service.completeDeliveryWithPOD) and from NO other delivery-lifecycle
 *     path. failed/cancelled encode zero explicitly (no settlement call).
 *  2. Idempotency                 — deterministic `settlement-${deliveryId}`
 *     key (no time component), dual-check (by_idempotency + by_delivery),
 *     same-transaction execution in both completion paths.
 *  3. Authoritative amount source — settlement reads the stored delivery quote;
 *     it never calls calculateQuote / calculatePricingBreakdown.
 *  4. Wallet policy               — completeSettlement ensures an idempotent
 *     wallet before crediting; the old silent `if (wallet)` skip is gone.
 *  5. Authorization               — settlement mutations are settlement:manage
 *     gated; drivers cannot mark their own settlement as paid; state gates
 *     pending → processing → completed are preserved.
 *
 * Run: bunx tsx src/convex/testing/settlement.test.ts
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

const pricingService = read("src/convex/pricing/service.ts");
const stateMachine = read("src/convex/deliveries/state_machine.ts");
const podService = read("src/convex/pod/service.ts");
const auditService = read("src/convex/audit/service.ts");

// ─── 1. Deterministic idempotency key ────────────────────────────────────────

console.log("\n1. Deterministic settlement identity");

test("idempotency key is settlement-${deliveryId} with no time component", () => {
  const m = pricingService.match(/const idempotencyKey = `([^`]+)`;/);
  assertTrue(m !== null, "createSettlement defines an idempotencyKey");
  assertEqual(m![1], "settlement-${args.deliveryId}", "key is exactly settlement-${deliveryId}");
});

test("legacy time-based key is gone", () => {
  assertTrue(
    !pricingService.includes("settlement-${args.deliveryId}-${now}"),
    "no time-based key variant remains"
  );
});

test("key is aligned with the by_idempotency index", () => {
  assertContains(
    pricingService,
    '.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))',
    "createSettlement checks by_idempotency with the deterministic key"
  );
  // schema declares the index
  assertTrue(
    /\.index\("by_idempotency", \["idempotencyKey"\]\)/.test(pricingService) ||
      read("src/convex/schema.ts").includes('.index("by_idempotency", ["idempotencyKey"])'),
    "schema declares by_idempotency on settlements"
  );
});

test("dual idempotency check: by_idempotency AND by_delivery", () => {
  const createBlock = pricingService.slice(
    pricingService.indexOf("export const createSettlement"),
    pricingService.indexOf("export const processSettlement")
  );
  assertContains(createBlock, "by_idempotency", "first check via deterministic key");
  assertContains(createBlock, "by_delivery", "second check via delivery index");
  assertContains(createBlock, "alreadyExists: true", "existing settlements short-circuit");
});

// ─── 2. Authoritative amount source ─────────────────────────────────────────

console.log("\n2. Authoritative amount source");

test("settlement reads the stored quote, never recalculates pricing", () => {
  const createBlock = pricingService.slice(
    pricingService.indexOf("export const createSettlement"),
    pricingService.indexOf("export const processSettlement")
  );
  assertContains(createBlock, 'query("delivery_quotes")', "reads delivery_quotes");
  assertContains(createBlock, "driverEarnings: quote.driverEarnings", "locks stored driverEarnings");
  assertContains(createBlock, "platformFee: quote.platformFee", "locks stored platformFee");
  assertContains(createBlock, "deliveryFee: quote.deliveryFee", "locks stored deliveryFee");
  assertTrue(
    !createBlock.includes("calculatePricingBreakdown"),
    "no recalculation inside createSettlement"
  );
  assertTrue(!createBlock.includes("haversine"), "no distance recalculation inside createSettlement");
});

test("missing quote fails settlement loudly (no zero-amount fallback)", () => {
  const createBlock = pricingService.slice(
    pricingService.indexOf("export const createSettlement"),
    pricingService.indexOf("export const processSettlement")
  );
  assertContains(
    createBlock,
    "No pricing quote found for this order",
    "throws when no authoritative quote exists"
  );
  // no silent 0-amount settlement insert
  assertTrue(!/driverEarnings:\s*0[,}]/.test(createBlock), "no zero-earnings fallback");
});

// ─── 3. Settlement trigger wiring (compensation policy) ─────────────────────

console.log("\n3. Compensation policy wiring");

test("completeDelivery triggers settlement inside the same transaction", () => {
  const completeBlock = stateMachine.slice(
    stateMachine.indexOf("export const completeDelivery"),
    stateMachine.indexOf("export const failDelivery")
  );
  assertContains(
    completeBlock,
    "internal.pricing.service.createSettlement",
    "settlement called after DELIVERED transition"
  );
  assertContains(
    completeBlock,
    "delivery.courierId",
    "driver identity from the authoritative delivery assignment"
  );
  assertTrue(
    !completeBlock.includes("ctx.runMutation(api."),
    "no public mutation round-trips — internal only"
  );
});

test("POD-aware completion path also triggers settlement", () => {
  const podCompleteBlock = podService.slice(
    podService.indexOf("export const completeDeliveryWithPOD"),
    podService.indexOf("export const recordFailedDeliveryWithPOD")
  );
  assertContains(
    podCompleteBlock,
    "internal.pricing.service.createSettlement",
    "settlement called in completeDeliveryWithPOD"
  );
});

test("failDelivery encodes zero compensation explicitly", () => {
  const failBlock = stateMachine.slice(
    stateMachine.indexOf("export const failDelivery"),
    stateMachine.indexOf("export const requestReassignment")
  );
  assertTrue(
    !failBlock.includes("createSettlement"),
    "failed deliveries create NO settlement (explicit policy)"
  );
  assertContains(failBlock, "Compensation policy", "policy is documented inline");
});

test("cancelDelivery encodes zero compensation explicitly", () => {
  const cancelBlock = stateMachine.slice(
    stateMachine.indexOf("export const cancelDelivery"),
    stateMachine.indexOf("export const failDelivery")
  );
  assertTrue(
    !cancelBlock.includes("createSettlement"),
    "cancelled deliveries create NO settlement (explicit policy)"
  );
  assertContains(cancelBlock, "Compensation policy", "policy is documented inline");
});

test("failDelivery/cancelled paths exist in the state machine (lifecycle intact)", () => {
  assertContains(stateMachine, "DELIVERY_STATUS.FAILED", "FAILED terminal state handled");
  assertContains(stateMachine, "DELIVERY_STATUS.CANCELLED", "CANCELLED terminal state handled");
});

// ─── 4. Wallet policy ────────────────────────────────────────────────────────

console.log("\n4. Wallet policy");

test("completeSettlement no longer silently skips a missing wallet", () => {
  const completeBlock = pricingService.slice(
    pricingService.indexOf("export const completeSettlement"),
    pricingService.lastIndexOf("});")
  );
  assertTrue(!/if \(wallet\) \{/.test(completeBlock), "silent if (wallet) skip removed");
  assertContains(completeBlock, "if (!wallet)", "missing wallet handled explicitly");
  assertContains(
    completeBlock,
    'balance: 0,',
    "wallet auto-created with a zero balance before crediting"
  );
});

test("wallet creation is idempotent (single wallet per driver)", () => {
  const completeBlock = pricingService.slice(
    pricingService.indexOf("export const completeSettlement"),
    pricingService.lastIndexOf("});")
  );
  const ensureCount = (completeBlock.match(/if \(!wallet\)/g) ?? []).length;
  assertTrue(ensureCount >= 1, "ensure-wallet guard present");
  // wallet is only inserted when absent — insert lives inside the guard
  const insertIdx = completeBlock.indexOf('db.insert("wallets"');
  const guardIdx = completeBlock.indexOf("if (!wallet)");
  assertTrue(insertIdx > guardIdx, "wallet insert occurs only inside the missing-wallet guard");
});

test("credit amount equals the settlement's stored driverEarnings", () => {
  const completeBlock = pricingService.slice(
    pricingService.indexOf("export const completeSettlement"),
    pricingService.lastIndexOf("});")
  );
  assertContains(completeBlock, "wallet.balance + settlement.driverEarnings", "credits stored amount");
  assertContains(completeBlock, "type: \"credit\"", "credit transaction recorded");
  assertContains(completeBlock, "status: \"completed\"", "transaction recorded as completed");
});

// ─── 5. Authorization and state gates ────────────────────────────────────────

console.log("\n5. Authorization and state gates");

test("settlement lifecycle mutations remain settlement:manage gated", () => {
  const processBlock = pricingService.slice(
    pricingService.indexOf("export const processSettlement"),
    pricingService.indexOf("export const completeSettlement")
  );
  const completeBlock = pricingService.slice(
    pricingService.indexOf("export const completeSettlement"),
    pricingService.lastIndexOf("});")
  );
  assertContains(processBlock, "settlement:manage", "processSettlement gated");
  assertContains(completeBlock, "settlement:manage", "completeSettlement gated");
});

test("driver role cannot mark their own settlement as paid", () => {
  // DRIVER permission set must NOT include SETTLEMENT_MANAGE
  const schema = read("src/convex/schema.ts");
  const driverBlock = schema.slice(
    schema.indexOf("[ROLES.DRIVER]:"),
    schema.indexOf("[ROLES.FLEET_MANAGER]") === -1
      ? schema.indexOf("[ROLES.OPERATIONS]")
      : schema.indexOf("[ROLES.FLEET_MANAGER]")
  );
  assertTrue(!driverBlock.includes("SETTLEMENT_MANAGE"), "DRIVER lacks settlement:manage");
});

test("state gates preserved: pending → processing → completed", () => {
  const processBlock = pricingService.slice(
    pricingService.indexOf("export const processSettlement"),
    pricingService.indexOf("export const completeSettlement")
  );
  const completeBlock = pricingService.slice(
    pricingService.indexOf("export const completeSettlement"),
    pricingService.lastIndexOf("});")
  );
  assertContains(processBlock, 'status !== "pending"', "processSettlement requires pending");
  assertContains(completeBlock, 'status !== "processing"', "completeSettlement requires processing");
});

test("settlement creation is internal (not callable from React)", () => {
  const createBlock = pricingService.slice(
    pricingService.indexOf("export const createSettlement"),
    pricingService.indexOf("export const processSettlement")
  );
  assertContains(createBlock, "internalMutation", "createSettlement is an internalMutation");
});

// ─── 6. Audit logging ────────────────────────────────────────────────────────

console.log("\n6. Audit logging");

test("settlement creation is audit-logged", () => {
  const createBlock = pricingService.slice(
    pricingService.indexOf("export const createSettlement"),
    pricingService.indexOf("export const processSettlement")
  );
  assertContains(createBlock, "AUDIT_ACTIONS.SETTLEMENT_CREATED", "creation audited");
  assertContains(createBlock, "driverEarnings: quote.driverEarnings", "amount in audit payload");
});

test("settlement completion is audit-logged", () => {
  const completeBlock = pricingService.slice(
    pricingService.indexOf("export const completeSettlement"),
    pricingService.lastIndexOf("});")
  );
  assertContains(completeBlock, "AUDIT_ACTIONS.SETTLEMENT_COMPLETED", "completion audited");
});

test("audit actions exist in the audit service", () => {
  assertContains(auditService, 'SETTLEMENT_CREATED: "settlement.created"', "created action defined");
  assertContains(auditService, 'SETTLEMENT_COMPLETED: "settlement.completed"', "completed action defined");
});

// ─── 7. Payment separation ───────────────────────────────────────────────────

console.log("\n7. Payment separation");

test("new settlements start pending — never marked paid on creation", () => {
  const createBlock = pricingService.slice(
    pricingService.indexOf("export const createSettlement"),
    pricingService.indexOf("export const processSettlement")
  );
  assertContains(createBlock, 'status: "pending"', "settlement starts pending (payable, not paid)");
});

test("no payment provider is invoked anywhere in settlement code", () => {
  const settlementCode = pricingService.slice(pricingService.indexOf("export const createSettlement"));
  assertTrue(
    !/paystack|payfast|stripe/i.test(settlementCode),
    "no payment provider references"
  );
});

// ─── 8. Driver earnings query scoping ────────────────────────────────────────

console.log("\n8. Driver earnings query scoping");

test("getDriverEarnings remains driver-scoped", () => {
  const earningsBlock = pricingService.slice(
    pricingService.indexOf("export const getDriverEarnings"),
    pricingService.indexOf("export const calculateQuote")
  );
  assertContains(
    earningsBlock,
    "can only view own earnings",
    "drivers cannot view another driver's earnings"
  );
  assertContains(earningsBlock, 's.status === "completed"', "completed → paid totals");
  assertContains(earningsBlock, 's.status === "pending"', "pending → payable totals");
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
