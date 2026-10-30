/**
 * 30/70 commission split tests.
 * Run: bunx tsx src/convex/pricing/commission.test.ts
 */

import {
  DRIVER_SHARE_PERCENT,
  PLATFORM_COMMISSION_PERCENT,
  splitCustomerCharge,
} from "./commission";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ✗ ${name}: ${(error as Error).message}`);
  }
}

function expectEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

test("policy is 30% platform / 70% driver", () => {
  expectEqual(PLATFORM_COMMISSION_PERCENT, 30, "platform percent");
  expectEqual(DRIVER_SHARE_PERCENT, 70, "driver percent");
});

test("R100.00 splits into R30.00 / R70.00", () => {
  const split = splitCustomerCharge(10_000);
  expectEqual(split.platformFee, 3_000, "platform fee");
  expectEqual(split.driverEarnings, 7_000, "driver earnings");
  expectEqual(split.platformFee + split.driverEarnings, 10_000, "shares add up");
});

test("the split applies to the customer charge, not on top of it", () => {
  const customerCharge = 25_000;
  const split = splitCustomerCharge(customerCharge);
  expectEqual(split.platformFee + split.driverEarnings, customerCharge, "no markup");
  expectEqual(split.driverEarnings, Math.round(customerCharge * 0.7), "70% driver");
});

test("rounding never loses or invents a cent", () => {
  for (const amount of [1, 99, 100, 2_501, 12_345, 99_999]) {
    const split = splitCustomerCharge(amount);
    expectEqual(split.platformFee + split.driverEarnings, amount, `sum for ${amount}`);
    expectEqual(split.platformFee, Math.round(amount * 0.3), `platform for ${amount}`);
  }
});

test("zero charge is a valid zero split", () => {
  const split = splitCustomerCharge(0);
  expectEqual(split.platformFee, 0, "platform fee");
  expectEqual(split.driverEarnings, 0, "driver earnings");
});

test("invalid charges are rejected", () => {
  for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    let threw = false;
    try {
      splitCustomerCharge(amount);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`expected rejection for ${String(amount)}`);
  }
});

console.log(`\nCommission split: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
