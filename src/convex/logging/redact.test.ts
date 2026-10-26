/**
 * Log redaction tests (POPIA s19).
 *
 * Run with: bun test src/convex/logging/redact.test.ts
 * (or: bunx tsx src/convex/logging/redact.test.ts)
 *
 * These assert the property that matters operationally: no contact detail,
 * South African identifier, card number or credential survives a log call.
 */

import { redactMetadata, redactPII } from "./redact";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push(name);
}

function expectRedacted(name: string, input: string, leaked: string, expected: string): void {
  const output = redactPII(input);
  check(`${name}: masks the value`, !output.includes(leaked));
  check(`${name}: keeps surrounding text`, output.includes(expected));
}

// ─── Strings ────────────────────────────────────────────────────────────────

expectRedacted(
  "email",
  "Delivery created for thandi@example.co.za",
  "thandi@example.co.za",
  "Delivery created for [email]",
);

expectRedacted(
  "mobile number",
  "Driver phone 071 123 4567",
  "071 123 4567",
  "[phone]",
);

expectRedacted(
  "international mobile",
  "contact: +27 82 555 0101",
  "+27 82 555 0101",
  "[phone]",
);

expectRedacted(
  "SA ID number",
  "id 8501125800088 verified",
  "8501125800088",
  "[id-number]",
);

expectRedacted(
  "card number",
  "card 4111 1111 1111 1111 declined",
  "4111 1111 1111 1111",
  "[card]",
);

expectRedacted(
  "JWT",
  "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij rejected",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij",
  "[token]",
);

expectRedacted("API key", "using sk_live_abcd1234efgh", "sk_live_abcd1234efgh", "[key]");

check(
  "ordinary message untouched",
  redactPII("Delivery dlv_123 moved to IN_TRANSIT in 420ms") ===
    "Delivery dlv_123 moved to IN_TRANSIT in 420ms",
);

check(
  "amounts and ids untouched",
  redactPII("Payment ord_9981 amount 129900 cents") === "Payment ord_9981 amount 129900 cents",
);

// ─── Metadata ───────────────────────────────────────────────────────────────

const metadata = redactMetadata({
  operation: "createDelivery",
  email: "sender@example.com",
  phone: "+27 71 000 1234",
  password: "hunter2",
  nested: { note: "call 082 444 5555", parcelCount: 2 },
  tags: ["thandi@example.co.za", "fragile"],
});

check("metadata: sensitive key masked", metadata?.email === "[redacted]");
check("metadata: password masked", metadata?.password === "[redacted]");
check("metadata: phone key masked", metadata?.phone === "[redacted]");
check("metadata: ordinary key kept", metadata?.operation === "createDelivery");
check(
  "metadata: nested value scrubbed",
  JSON.stringify(metadata?.nested).includes("[phone]") &&
    !JSON.stringify(metadata?.nested).includes("082 444 5555"),
);
check(
  "metadata: array values scrubbed",
  JSON.stringify(metadata?.tags).includes("[email]") &&
    JSON.stringify(metadata?.tags).includes("fragile"),
);
check("metadata: numbers preserved", (metadata?.nested as { parcelCount: number }).parcelCount === 2);
check("metadata: undefined stays undefined", redactMetadata(undefined) === undefined);

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\nLog redaction: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  process.exit(1);
}
