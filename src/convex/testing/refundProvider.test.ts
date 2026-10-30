/**
 * Paystack refund provider contract tests.
 *
 * Mocks fetch and verifies the exact refund endpoint, request body, amount
 * normalisation, and response parsing. No network or deployment is required.
 *
 * Run: bunx tsx src/convex/testing/refundProvider.test.ts
 */

import {
  createPaystackRefund,
  listPaystackRefunds,
  normalizePaystackRefundStatus,
} from "../payments/_provider";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
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
    throw new Error(`Assertion failed: ${message}. Expected ${String(expected)}, got ${String(actual)}`);
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

const originalFetch = globalThis.fetch;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function run() {
  console.log("\nPaystack refund provider contract");

  await test("lists refunds by the original transaction reference", async () => {
    let calledUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return json({
        status: true,
        data: [
          {
            id: 3018284,
            status: "processed",
            amount: "10000",
            refund_reference: "TRF_9vgfawjnoz58uxy",
          },
        ],
      });
    }) as typeof fetch;

    const refunds = await listPaystackRefunds("sk_test", "pay-order-123");
    assertContains(calledUrl, "/refund?reference=pay-order-123", "refund lookup URL");
    assertEqual(refunds.length, 1, "one refund parsed");
    assertEqual(refunds[0].id, "3018284", "provider refund id");
    assertEqual(refunds[0].status, "processed", "provider refund status");
    assertEqual(refunds[0].amount, 10000, "string cents normalised to number");
    assertEqual(
      refunds[0].refundReference,
      "TRF_9vgfawjnoz58uxy",
      "processor refund reference",
    );
  });

  await test("creates a full refund with the quarantined amount", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return json({
        status: true,
        data: {
          id: 3018284,
          status: "pending",
          amount: 10000,
        },
      });
    }) as typeof fetch;

    const result = await createPaystackRefund("sk_test", {
      transaction: "tx_123",
      amount: 10000,
      currency: "ZAR",
      merchantNote: "Duplicate payment charge",
      customerNote: "Duplicate payment refund",
    });

    assertEqual(body.transaction, "tx_123", "transaction reference sent");
    assertEqual(body.amount, 10000, "integer cents sent");
    assertEqual(body.currency, "ZAR", "currency sent");
    assertEqual(body.merchant_note, "Duplicate payment charge", "merchant note");
    assertEqual(body.customer_note, "Duplicate payment refund", "customer note");
    assertEqual(result.id, "3018284", "refund id parsed");
    assertEqual(result.status, "pending", "pending status parsed");
  });

  await test("rejects a non-2xx refund request", async () => {
    globalThis.fetch = (async () => json({ status: false }, 400)) as typeof fetch;
    let threw = false;
    try {
      await createPaystackRefund("sk_test", {
        transaction: "tx_123",
        amount: 10000,
        currency: "ZAR",
        merchantNote: "Duplicate payment charge",
        customerNote: "Duplicate payment refund",
      });
    } catch (e) {
      threw = e instanceof Error && e.message.includes("HTTP 400");
    }
    assertTrue(threw, "HTTP status is surfaced as a controlled failure");
  });

  await test("rejects an invalid refund response", async () => {
    globalThis.fetch = (async () =>
      json({ status: true, data: [] })) as typeof fetch;
    let threw = false;
    try {
      await createPaystackRefund("sk_test", {
        transaction: "tx_123",
        amount: 10000,
        currency: "ZAR",
        merchantNote: "Duplicate payment charge",
        customerNote: "Duplicate payment refund",
      });
    } catch (e) {
      threw = e instanceof Error && e.message.includes("invalid response");
    }
    assertTrue(threw, "invalid provider response is rejected");
  });

  await test("only the four documented refund statuses are accepted", () => {
    for (const status of ["pending", "processing", "processed", "failed"] as const) {
      assertEqual(normalizePaystackRefundStatus(status), status, status);
    }
    assertEqual(normalizePaystackRefundStatus("success"), null, "transaction status rejected");
    assertEqual(normalizePaystackRefundStatus(undefined), null, "missing status rejected");
  });

  globalThis.fetch = originalFetch;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

run();
