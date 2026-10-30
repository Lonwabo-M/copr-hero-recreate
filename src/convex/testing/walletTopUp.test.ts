/**
 * Wallet Tests
 *
 * Verifies the wallet fund-flow against the actual source files:
 *
 *  1. Funding model — top-ups have their own provider-reference table and
 *     status/amount idempotency guards.
 *  2. Server authority — the client never supplies a user, wallet, provider
 *     status, or order amount.
 *  3. Credit safety — completion requires verified success, matches the
 *     provider amount, creates one wallet, and inserts one credit ledger row.
 *  4. Spending — wallet payment debits the stored order amount atomically,
 *     refuses insufficient balances, and creates a completed payment record.
 *  5. Webhook routing — signed top-up events resolve by our reference.
 *  6. UI contract — the wallet page uses the classes wallet.css defines.
 *
 * Run: bunx tsx src/convex/testing/walletTopUp.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function assertTrue(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(
      `Assertion failed: ${message}. Expected to find: "${needle}"`,
    );
  }
}

function assertNotContains(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(
      `Assertion failed: ${message}. Did not expect: "${needle}"`,
    );
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const schema = read("src/convex/schema.ts");
const topUps = read("src/convex/payments/walletTopUps.ts");
const actions = read("src/convex/payments/actions.ts");
const mutations = read("src/convex/payments/mutations.ts");
const walletPage = read("src/pages/Wallet.tsx");
const walletCss = read("src/styles/wallet.css");
const checkoutPage = read("src/pages/Checkout.tsx");

console.log("\n1. Wallet top-up funding model");

test("wallet_topups table is reference-keyed and statusful", () => {
  const start = schema.indexOf("wallet_topups: defineTable({");
  const end = schema.indexOf("// ─── Invoices", start);
  assertTrue(start !== -1 && end > start, "wallet_topups table exists");
  const block = schema.slice(start, end);
  for (const field of [
    "userId",
    "amount",
    "provider",
    "providerTransactionId",
    "status",
    "reference",
    "completedAt",
  ]) {
    assertContains(block, field, `schema field ${field}`);
  }
  assertContains(block, "by_reference", "reference idempotency index");
  assertContains(block, "by_user", "wallet owner index");
});

test("top-up initiation takes only an amount from the client", () => {
  const block = topUps.slice(
    topUps.indexOf("export const initiateWalletTopUp = action"),
    topUps.indexOf("export const verifyWalletTopUp"),
  );
  assertContains(block, "args: { amount: v.number() }", "amount-only args");
  assertNotContains(block, "userId: v.id", "no client user ID");
  assertNotContains(block, "walletId", "no client wallet ID");
  assertContains(block, "validateAmount(args.amount)", "server amount validation");
  assertContains(block, "getAuthUserId(ctx)", "identity from session");
});

test("top-up completion is idempotent and amount-checked", () => {
  const block = topUps.slice(
    topUps.indexOf("export const completeWalletTopUp"),
    topUps.indexOf("export const failWalletTopUp"),
  );
  assertContains(block, 'topUp.status === "completed"', "already-completed guard");
  assertContains(block, "alreadyCompleted: true", "idempotent short-circuit");
  assertNotContains(block, 'topUp.status === "failed"', "a failed record does not permanently block a verified success");
  assertContains(block, "amountFromProvider: v.number()", "provider amount is required");
  assertContains(block, "Provider transaction ID mismatch", "provider evidence integrity");
  assertContains(block, "amount mismatch", "provider amount integrity");
  assertContains(block, "wallet.balance + topUp.amount", "credit amount");
  assertContains(block, 'type: "credit"', "credit ledger row");
  assertContains(block, 'status: "completed"', "transaction completed");
});

test("verification is owner-scoped and server-authoritative", () => {
  const block = topUps.slice(topUps.indexOf("export const verifyWalletTopUp"));
  assertContains(block, "topUp.userId !== userId", "owner check");
  assertContains(block, "verifyPaystackTransaction", "Paystack verify call");
  assertContains(block, "classifyProviderStatus", "terminal status classification");
  assertContains(block, "completeWalletTopUp", "verified completion");
  assertNotContains(block, "statusFromClient", "no client status input");
});

console.log("\n2. Signed webhook routing");

test("webhook falls back to top-ups by internal reference", () => {
  const block = actions.slice(actions.indexOf("export const processWebhookEvent"));
  assertContains(
    block,
    "getWalletTopUpByReference",
    "top-up reference resolution",
  );
  assertContains(block, "completeWalletTopUp", "top-up completion");
  assertContains(block, "failWalletTopUp", "top-up failure");
  assertContains(block, "handled: false", "unknown references ignored");
});

console.log("\n3. Spending from the wallet");

test("wallet payment takes no amount and reads the stored order", () => {
  const block = mutations.slice(
    mutations.indexOf("export const payOrderFromWallet"),
  );
  assertContains(block, "order.price", "authoritative order amount");
  assertNotContains(block, "amount: v.number()", "no client amount");
  assertContains(block, "wallet.balance < amount", "insufficient-balance guard");
  assertContains(block, "wallet.balance - amount", "wallet debit");
  assertContains(block, 'type: "debit"', "debit ledger row");
  assertContains(block, "method: \"wallet\"", "wallet payment method");
  assertContains(block, 'status: "completed"', "payment completed");
  assertContains(block, "wallet-${args.orderId}", "deterministic reference");
});

test("wallet payment action stays server-authoritative", () => {
  const block = actions.slice(
    actions.indexOf("export const payOrderWithWallet"),
    actions.indexOf("// ─── Verification"),
  );
  assertContains(block, "args: { orderId: v.id(\"orders\") }", "order-only args");
  assertContains(block, "getAuthorizedOrderForPayment", "server order resolution");
  assertContains(block, "payOrderFromWallet", "atomic wallet mutation");
});

console.log("\n4. Wallet page contract");

test("page uses the classes wallet.css defines", () => {
  for (const className of [
    "wallet-action-card",
    "wallet-action-icon",
    "wallet-action-label",
    "wallet-transactions",
    "wallet-transactions-title",
    "wallet-transactions-filters",
    "wallet-filter",
    "wallet-transaction",
    "wallet-transaction-info",
    "wallet-transaction-amounts",
  ]) {
    assertContains(walletPage, className, `page class ${className}`);
    assertContains(walletCss, `.${className}`, `css class ${className}`);
  }
  assertNotContains(
    walletPage,
    'className="wallet-quick-action"',
    "old unstyled class removed",
  );
  assertNotContains(
    walletPage,
    'className="wallet-transactions-card"',
    "old unstyled class removed",
  );
});

test("quick actions use a three-column grid", () => {
  const block = walletCss.slice(
    walletCss.indexOf(".wallet-quick-actions"),
    walletCss.indexOf(".wallet-action-card"),
  );
  assertContains(block, "repeat(3, 1fr)", "three action columns");
});

test("top-up and wallet payment are wired to real actions", () => {
  assertContains(
    walletPage,
    "initiateWalletTopUp",
    "wallet page starts a top-up",
  );
  assertContains(
    walletPage,
    "verifyWalletTopUp",
    "wallet page verifies the return",
  );
  assertContains(
    checkoutPage,
    "payOrderWithWallet",
    "order checkout offers wallet payment",
  );
  assertContains(
    checkoutPage,
    "handleWalletPayment",
    "wallet payment has its own handler",
  );
  assertNotContains(
    walletPage,
    "/make-payment",
    "wallet no longer links to the removed payment page",
  );
});

console.log("\n============================================================");
console.log(
  `Results: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
