/**
 * Customer Payment Tests
 *
 * Verifies the payment layer against the actual source files:
 *
 *  1. Authorization            — initiation resolves identity server-side;
 *                                drivers/operations are excluded; the payer
 *                                (or super admin) is the only verifier.
 *  2. Amount integrity         — the charge comes from the stored order price;
 *                                the client cannot supply an amount; provider
 *                                amount mismatch refuses completion.
 *  3. State machine            — pending → completed / failed transitions only
 *                                from provider evidence; no public
 *                                `{ paymentSuccessful: true }` mutation exists.
 *  4. Idempotency              — deterministic references, already-completed /
 *                                already-failed guards, duplicate-webhook safe.
 *  5. Webhook security         — signature verified before processing; unknown
 *                                references ignored; resolution by reference
 *                                (never payload order IDs).
 *  6. Settlement separation    — no settlement mutations called from payment.
 *  7. Delivery separation      — no delivery/order state writes from payment.
 *  8. UI integrity             — no setTimeout simulation, no fake success,
 *                                amount is read-only from the server data.
 *
 * Run: bunx tsx src/convex/testing/payment.test.ts
 */

import { existsSync, readFileSync } from "node:fs";
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

const queries = read("src/convex/payments/queries.ts");
const mutations = read("src/convex/payments/mutations.ts");
const actions = read("src/convex/payments/actions.ts");
const http = read("src/convex/http.ts");
const schema = read("src/convex/schema.ts");
const checkout = read("src/pages/Checkout.tsx");
const stateMachine = read("src/convex/deliveries/state_machine.ts");
const settlementTest = read("src/convex/testing/settlement.test.ts");

function block(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = endMarker === "" ? src.length : src.indexOf(endMarker, start);
  if (start === -1) throw new Error(`Block start not found: ${startMarker}`);
  return end === -1 || endMarker === "" ? src.slice(start) : src.slice(start, end);
}

// ─── 1. Schema (reuse, no second table) ──────────────────────────────────────

console.log("\n1. Payment transaction model");

test("payment_transactions reused — not redefined", () => {
  const count = (schema.match(/payment_transactions: defineTable/g) ?? []).length;
  assertEqual(count, 1, "exactly one payment_transactions definition");
});

test("schema can represent the required lifecycle", () => {
  const txBlock = schema.slice(
    schema.indexOf("payment_transactions: defineTable"),
    schema.indexOf("// ─── Delivery", schema.indexOf("payment_transactions: defineTable"))
  );
  for (const field of ["orderId", "userId", "amount", "provider", "providerTransactionId", "status", "idempotencyKey", "createdAt", "completedAt", "metadata"]) {
    assertContains(txBlock, field, `schema field ${field}`);
  }
  for (const st of ["pending", "processing", "completed", "failed", "refunded"]) {
    assertContains(txBlock, `"${st}"`, `status literal ${st}`);
  }
  assertTrue(txBlock.includes('by_idempotency'), "by_idempotency index exists");
  assertTrue(txBlock.includes('by_provider'), "by_provider index exists");
});

// ─── 2. Authorization ────────────────────────────────────────────────────────

console.log("\n2. Authorization model");

test("initiation resolves identity server-side (no client-supplied payer)", () => {
  assertContains(
    queries,
    "getAuthorizedOrderForPayment",
    "server-side authorized order resolution exists"
  );
  const orderBlock = block(queries, "getAuthorizedOrderForPayment", "getPaymentByReference");
  assertContains(orderBlock, "getCurrentAuthUser", "identity from session");
  assertContains(
    orderBlock,
    "only pay for your own orders",
    "non-owner initiation rejected"
  );
  assertContains(orderBlock, "amount: order.price", "amount read from stored order");
});

test("drivers, fleet managers and operations cannot initiate customer payments", () => {
  const initBlock = block(actions, "initiateOrderPayment", "verifyOrderPayment");
  for (const role of ["ROLES.DRIVER", "ROLES.FLEET_MANAGER", "ROLES.OPERATIONS"]) {
    assertContains(initBlock, role, `${role} excluded from initiation`);
  }
});

test("verification restricted to the payer (or super admin)", () => {
  const verifyBlock = block(actions, "verifyOrderPayment", "processWebhookEvent");
  assertContains(verifyBlock, "not your payment", "ownership check on verify");
});

test("payment queries hide customer payment data from drivers/operations", () => {
  const overviewBlock = block(queries, "getMyPaymentOverview", "getAuthorizedOrderForPayment");
  assertContains(
    overviewBlock,
    "no customer payment visibility",
    "driver/operations role branch returns no payment data"
  );
  assertTrue(
    !overviewBlock.includes("providerTransactionId"),
    "public payment overview does not expose provider transaction IDs"
  );
});

test("order payment status comes from payment_transactions", () => {
  const orderBlock = block(queries, "getMyPaymentOverview", "getAuthorizedOrderForPayment");
  assertContains(orderBlock, "paymentStateForOrder", "authoritative transaction lookup");
  assertContains(orderBlock, "paid: state.completed !== null", "paid derived from any completed attempt");
  assertContains(orderBlock, "payment: payment", "payment state returned per order");
  assertTrue(!orderBlock.includes("deliveryStatus"), "payment is not inferred from delivery status");
});

// ─── 3. Amount integrity ─────────────────────────────────────────────────────

console.log("\n3. Amount integrity");

test("the client cannot supply amount or an arbitrary payment method", () => {
  const initArgs = block(actions, "export const initiateOrderPayment", "handler:");
  assertTrue(!/amount/.test(initArgs), "initiation accepts no amount from the client");
  assertContains(
    initArgs,
    'method: v.optional(v.literal("card"))',
    "only the legacy card literal is accepted",
  );
  // The internal mutation takes an amount — but it is fed from orderCtx.amount.
  assertContains(
    actions,
    "amount: orderCtx.amount",
    "creation amount sourced from the server-read order price"
  );
  assertContains(actions, 'method: "card"', "server owns the hosted card method");
});

test("payment eligibility is enforced server-side", () => {
  assertContains(actions, 'orderCtx.orderStatus === "cancelled"', "cancelled orders rejected");
  assertContains(actions, 'orderCtx.deliveryStatus === "failed"', "failed deliveries rejected");
  assertContains(actions, "orderCtx.refundedPayment", "refunded orders rejected");
  assertContains(mutations, 'order.status === "cancelled"', "wallet path rejects cancelled orders");
  assertContains(mutations, 'delivery?.status === "failed"', "wallet path rejects failed deliveries");
  assertContains(mutations, 'walletGate.kind === "refunded"', "wallet path rejects refunded payments");
});

test("provider amount mismatch refuses completion", () => {
  assertContains(
    mutations,
    "Payment amount mismatch",
    "amount verification before completion"
  );
  assertContains(
    mutations,
    "refusing to complete",
    "loud refusal on mismatch"
  );
});

test("pricing is never recalculated in the payment layer", () => {
  const paymentsCode = queries + mutations + actions;
  assertTrue(
    !paymentsCode.includes("calculatePricingBreakdown") &&
      !paymentsCode.includes("calculateAndStoreQuote") &&
      !paymentsCode.includes("calculateQuote("),
    "no pricing-engine calls in payment code"
  );
});

test("hosted Paystack checkout is the only card path", () => {
  assertContains(actions, "transaction/initialize", "hosted checkout initialization");
  assertTrue(!actions.includes("chargeOrderPaymentWithCard"), "direct card action removed");
  assertTrue(!actions.includes("submitPaymentOtp"), "OTP relay action removed");
  assertTrue(!actions.includes("PAYSTACK_BASE}/charge"), "no direct /charge call");
  assertTrue(!actions.includes("/submitOTP"), "no OTP submission call");
  assertTrue(!/card:\s*\{/.test(actions), "no card object crosses the action boundary");
});

// ─── 4. State machine & provider evidence ────────────────────────────────────

console.log("\n4. Payment state machine");

test("completion requires provider evidence and guards state", () => {
  const completeBlock = block(mutations, "completePaymentTransaction", "failPaymentTransaction");
  assertContains(completeBlock, 'tx.status === "completed"', "already-completed guard");
  assertContains(completeBlock, "alreadyCompleted: true", "idempotent short-circuit");
  assertContains(completeBlock, 'tx.status === "failed"', "late verified success recovers a failed attempt");
  assertContains(completeBlock, "Provider transaction ID mismatch", "evidence integrity");
  assertContains(completeBlock, "evaluateCompletionGate", "cross-method completion guard");
  assertContains(completeBlock, 'completionGate.kind === "refunded"', "post-refund charge quarantined");
  assertContains(completeBlock, "refundRequired: true", "duplicate charge quarantined for refund review");
});

test("failure transition is evidence-driven and idempotent", () => {
  const failBlock = block(mutations, "failPaymentTransaction", "");
  assertContains(failBlock, "alreadyFailed: true", "idempotent failure");
  assertContains(failBlock, 'tx.status === "completed"', "verified success beats late failure");
});

test("no public mutation accepts a client success flag", () => {
  // All payment record mutations must be internal.
  const publicMutations = mutations.match(/export const \w+ = (?!internalMutation)\w+/g) ?? [];
  assertEqual(publicMutations.length, 0, "no public payment mutations");
  // No mutation arg accepts a success flag — strip comment lines first so the
  // security rule is checked against real code, not documentation.
  const code = mutations
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
  assertTrue(
    !/paymentSuccessful|isSuccessful|success:\s*v\.boolean/.test(code),
    "no client success flag"
  );
});

// ─── 5. Idempotency ──────────────────────────────────────────────────────────

console.log("\n5. Idempotency");

test("transaction creation re-checks the deterministic reference", () => {
  const createBlock = block(mutations, "createPaymentTransaction", "attachProviderTransaction");
  assertContains(createBlock, "by_idempotency", "reference-based guard");
  assertContains(createBlock, "alreadyExists: true", "reuses existing transaction");
});

test("initiation is already-paid aware and uses deterministic references", () => {
  const initBlock = block(actions, "initiateOrderPayment", "verifyOrderPayment");
  assertContains(initBlock, "alreadyPaid: true", "refuses duplicate payment of a paid order");
  assertContains(initBlock, "pay-${orderCtx.orderId}", "deterministic reference");
});

test("webhook processing is duplicate-safe", () => {
  // The completion guard is inside completePaymentTransaction (tested above);
  // the webhook action must route through the same guarded mutations.
  const webhookBlock = block(actions, "processWebhookEvent", "");
  assertContains(webhookBlock, "completePaymentTransaction", "success via guarded mutation");
  assertContains(webhookBlock, "failPaymentTransaction", "failure via guarded mutation");
  assertContains(webhookBlock, "completion.duplicate", "duplicate result handled");
  assertContains(webhookBlock, "amountFromProvider === undefined", "success requires a provider amount");
  assertContains(webhookBlock, "handled: false", "unknown references acknowledged, not acted on");
});

test("card and wallet initiation refuse to create a second payment", () => {
  const createBlock = block(mutations, "createPaymentTransaction", "attachProviderTransaction");
  assertContains(createBlock, "evaluateCardCreationGate", "card creation checks every attempt");
  assertContains(createBlock, "alreadyPaid: true", "card creation refuses a paid order");

  const walletBlock = block(mutations, "payOrderFromWallet", "");
  assertContains(walletBlock, "evaluateWalletPaymentGate", "wallet checks every attempt");
  assertContains(walletBlock, "CARD_CHECKOUT_OPEN_MESSAGE", "wallet refuses while a card can succeed");
});

test("wallet action verifies open card attempts before debiting", () => {
  const walletAction = block(actions, "payOrderWithWallet", "// ─── Verification");
  assertContains(walletAction, "pendingCards", "open card attempts resolved");
  assertContains(walletAction, "verifyPaystackTransaction", "provider re-verified before wallet");
  assertContains(walletAction, "completePaymentTransaction", "verified card success finalized");
  assertContains(walletAction, "failPaymentTransaction", "terminal card failure closed");
  assertContains(walletAction, "CARD_CHECKOUT_OPEN_MESSAGE", "unknown/ongoing card blocks the wallet");
});

// ─── 6. Webhook security ─────────────────────────────────────────────────────

console.log("\n6. Webhook security");

test("webhook verifies the Paystack signature before processing", () => {
  const hookBlock = block(http, "payments/paystack/webhook", "");
  assertContains(hookBlock, "computePaystackSignature", "HMAC-SHA512 computed");
  assertContains(hookBlock, "x-paystack-signature", "signature header read");
  assertContains(hookBlock, "Invalid signature", "invalid signatures rejected");
  // Signature check must occur before runAction.
  const sigIdx = hookBlock.indexOf("Invalid signature");
  const actionIdx = hookBlock.indexOf("processWebhookEvent");
  assertTrue(sigIdx !== -1 && actionIdx !== -1 && sigIdx < actionIdx, "signature verified before processing");
});

test("webhook resolves the internal transaction by reference, not payload order IDs", () => {
  const webhookBlock = block(actions, "processWebhookEvent", "");
  assertContains(webhookBlock, "getPaymentByReference", "resolution by internal reference");
  assertTrue(
    !webhookBlock.includes("orderId: args."),
    "no payload order ID is trusted for lookup"
  );
});

test("webhook processing is not publicly invokable", () => {
  assertContains(actions, "processWebhookEvent = internalAction", "internalAction — clients cannot call it");
});

// ─── 7. Settlement separation ────────────────────────────────────────────────

console.log("\n7. Settlement separation");

test("successful payment never marks a settlement paid", () => {
  const paymentsCode =
    queries +
    mutations
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
      .join("\n") +
    actions +
    http;
  assertTrue(
    !paymentsCode.includes("processSettlement") && !paymentsCode.includes("completeSettlement"),
    "no settlement lifecycle calls from payment code"
  );
});

test("successful payment never alters delivery or order state", () => {
  const paymentMutations = mutations;
  assertTrue(!paymentMutations.includes('db.patch(."'.replace('."', '.')), "sanity");
  assertTrue(
    !/db\.patch\((args\.)?(delivery|order)/.test(paymentMutations) &&
      !paymentMutations.includes('db.patch(tx.orderId') &&
      !paymentMutations.includes("deliveries.state_machine"),
    "no delivery/order writes in payment mutations"
  );
});

// ─── 8. Credentials & logging hygiene ────────────────────────────────────────

console.log("\n8. Credentials and logging");

test("secret key only read inside actions, never returned", () => {
  const envReads = actions.match(/process\.env\.\w+/g) ?? [];
  for (const read0 of envReads) {
    assertTrue(
      read0 === "process.env.PAYSTACK_SECRET_KEY" ||
        read0 === "process.env.CONVEX_SITE_URL" ||
        // Public frontend origin used for the provider's return URL — not a
        // credential and never returned to the client.
        read0 === "process.env.SITE_URL",
      `unexpected env read: ${read0}`,
    );
  }
  // No return payload contains the key.
  assertTrue(
    !/authorizationUrl: secretKey|return.*PAYSTACK_SECRET_KEY/.test(actions),
    "secret never returned"
  );
});

test("audit events use existing payment actions and carry no credentials", () => {
  for (const evt of ["PAYMENT_INITIATED", "PAYMENT_CONFIRMED", "PAYMENT_FAILED"]) {
    assertContains(mutations, evt, `audit event ${evt} recorded`);
  }
  assertTrue(!/cardNumber|cvv|CVV/.test(mutations), "no card data in audit metadata");
});

// ─── 9. Checkout UI integrity ───────────────────────────────────────────────

console.log("\n9. Checkout UI integrity");

test("no payment simulation remains", () => {
  // Strip comments: the doc header states the *absence* of simulation.
  const code = checkout
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
    .join("\n");
  assertTrue(!code.includes("setTimeout"), "no setTimeout simulation");
  assertTrue(!/simulate|fake|mock/i.test(code), "no simulation wording");
});

test("payment is order-scoped and the amount is read-only", () => {
  assertTrue(
    !/type="number"/.test(checkout),
    "no amount input field — the customer cannot type an amount"
  );
  assertContains(checkout, "getMyPaymentOverview", "authoritative payment query");
  assertContains(checkout, "row.orderId === orderId", "overview filtered to this order");
  assertContains(checkout, "formatRands(total)", "amount rendered from server data");
  assertTrue(!existsSync("src/pages/MakePayment.tsx"), "duplicate payment page removed");
});

test("checkout collects no card data or bank OTP", () => {
  assertTrue(!/cardNumber|cvv|otpReference/i.test(checkout), "no card or OTP fields");
  assertTrue(!/autoComplete="cc-/.test(checkout), "no browser card autofill hooks");
  assertContains(checkout, "initiateOrderPayment", "hosted checkout is the card path");
  assertContains(checkout, "handleHostedCheckout", "hosted handler present");
});

test("verify runs server-side after checkout return", () => {
  assertContains(checkout, "verifyOrderPayment", "verification action called on return");
  assertContains(checkout, "reference", "reference-driven verification");
});

test("provider returns to the order checkout, not a duplicate page", () => {
  assertContains(actions, "callback_url: `${siteUrl}/checkout/", "order-scoped callback URL");
  assertTrue(!actions.includes("/make-payment?reference="), "no legacy payment page callback");
});

test("status badges distinguish pending / paid / failed", () => {
  for (const label of ["Paid", "Pending", "Failed", "Unpaid"]) {
    assertContains(checkout, label, `status badge ${label}`);
  }
});

// ─── 10. Regressions guard ───────────────────────────────────────────────────

console.log("\n10. Regression guards");

test("settlement activation remains intact", () => {
  assertContains(
    stateMachine,
    "internal.pricing.service.createSettlement",
    "delivery completion still creates settlements"
  );
});

test("prior suite files still present", () => {
  for (const f of [settlementTest]) {
    assertTrue(f.includes("Results:"), "settlement test file unchanged in structure");
  }
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
