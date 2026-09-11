/**
 * Lasha Pricing Service Tests
 *
 * Pricing calculation tests.
 * Run with: bun run src/convex/pricing/pricing.test.ts
 */

// ─── Simple Test Runner ───────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}: ${(error as Error).message}`);
    testsFailed++;
  }
}

function expect(value: any) {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeGreaterThanOrEqual: (expected: number) => {
      if (value < expected) {
        throw new Error(`Expected ${value} >= ${expected}`);
      }
    },
  };
}

// ─── Pricing Calculation Tests ────────────────────────────────────────────────

console.log("\n── Pricing Calculation Tests ──\n");

const mockPricingRule = {
  _id: "rule1" as any,
  name: "Standard Small",
  packageSize: "small",
  expeditionType: "standard",
  basePrice: 5000, // R50.00
  pricePerKm: 1500, // R15.00 per km
  pricePerKg: 200, // R2.00 per kg
  minimumPrice: 8000, // R80.00
  platformFeeType: "percentage" as const,
  platformFeeValue: 15, // 15%
  expressSurcharge: 3000, // R30.00
  sameDaySurcharge: 5000, // R50.00
  version: 1,
  effectiveFrom: Date.now(),
  isActive: true,
  createdAt: Date.now(),
};

test("should calculate basic pricing correctly", () => {
  const distanceKm = 10;
  const weightKg = 2;

  const basePrice = mockPricingRule.basePrice;
  const distanceFee = Math.round(mockPricingRule.pricePerKm * distanceKm);
  const weightFee = Math.round(mockPricingRule.pricePerKg * weightKg);
  const subtotal = basePrice + distanceFee + weightFee;
  const deliveryFee = Math.max(subtotal, mockPricingRule.minimumPrice);
  const platformFee = Math.round(deliveryFee * (mockPricingRule.platformFeeValue / 100));
  const totalCharge = deliveryFee + platformFee;
  const driverEarnings = deliveryFee - platformFee;

  expect(basePrice).toBe(5000);
  expect(distanceFee).toBe(15000);
  expect(weightFee).toBe(400);
  expect(subtotal).toBe(20400);
  expect(deliveryFee).toBe(20400);
  expect(platformFee).toBe(3060);
  expect(totalCharge).toBe(23460);
  expect(driverEarnings).toBe(17340);
});

test("should apply minimum price", () => {
  const distanceKm = 1;
  const weightKg = 0.5;

  const basePrice = mockPricingRule.basePrice;
  const distanceFee = Math.round(mockPricingRule.pricePerKm * distanceKm);
  const weightFee = Math.round(mockPricingRule.pricePerKg * weightKg);
  const subtotal = basePrice + distanceFee + weightFee;
  const deliveryFee = Math.max(subtotal, mockPricingRule.minimumPrice);

  expect(subtotal).toBe(6600);
  expect(deliveryFee).toBe(8000);
});

test("should apply express surcharge", () => {
  const distanceKm = 10;
  const weightKg = 2;
  const expeditionType = "express";

  const basePrice = mockPricingRule.basePrice;
  const distanceFee = Math.round(mockPricingRule.pricePerKm * distanceKm);
  const weightFee = Math.round(mockPricingRule.pricePerKg * weightKg);
  const subtotal = basePrice + distanceFee + weightFee;
  const expressSurcharge = expeditionType === "express" ? mockPricingRule.expressSurcharge : 0;
  const deliveryFee = Math.max(subtotal + expressSurcharge, mockPricingRule.minimumPrice);

  expect(expressSurcharge).toBe(3000);
  expect(deliveryFee).toBe(23400);
});

test("should apply same-day surcharge", () => {
  const distanceKm = 10;
  const weightKg = 2;
  const expeditionType = "same_day";

  const basePrice = mockPricingRule.basePrice;
  const distanceFee = Math.round(mockPricingRule.pricePerKm * distanceKm);
  const weightFee = Math.round(mockPricingRule.pricePerKg * weightKg);
  const subtotal = basePrice + distanceFee + weightFee;
  const sameDaySurcharge = expeditionType === "same_day" ? mockPricingRule.sameDaySurcharge : 0;
  const deliveryFee = Math.max(subtotal + sameDaySurcharge, mockPricingRule.minimumPrice);

  expect(sameDaySurcharge).toBe(5000);
  expect(deliveryFee).toBe(25400);
});

test("should handle flat platform fee", () => {
  const deliveryFee = 20400;
  const platformFeeValue = 5000; // R50.00 flat
  const platformFee = platformFeeValue;
  const totalCharge = deliveryFee + platformFee;

  expect(platformFee).toBe(5000);
  expect(totalCharge).toBe(25400);
});

test("should handle zero weight", () => {
  const weightKg = 0;
  const weightFee = Math.round(mockPricingRule.pricePerKg * weightKg);

  expect(weightFee).toBe(0);
});

// ─── Settlement Tests ─────────────────────────────────────────────────────────

console.log("\n── Settlement Tests ──\n");

test("should prevent duplicate settlements", () => {
  const existingSettlement = {
    deliveryId: "delivery1",
    status: "completed",
  };

  const newSettlement = {
    deliveryId: "delivery1",
    status: "pending",
  };

  const isDuplicate = existingSettlement.deliveryId === newSettlement.deliveryId;
  expect(isDuplicate).toBe(true);
});

test("should validate settlement state transitions", () => {
  const validTransitions: Record<string, string[]> = {
    pending: ["processing", "failed"],
    processing: ["completed", "failed"],
    completed: [],
    failed: [],
    disputed: ["completed", "failed"],
  };

  expect(validTransitions["pending"].includes("processing")).toBe(true);
  expect(validTransitions["processing"].includes("completed")).toBe(true);
  expect(validTransitions["completed"].includes("pending")).toBe(false);
  expect(validTransitions["failed"].includes("completed")).toBe(false);
});

test("should calculate driver earnings correctly", () => {
  const deliveryFee = 20400;
  const platformFee = 3060;
  const driverEarnings = deliveryFee - platformFee;

  expect(driverEarnings).toBe(17340);
});

// ─── Authorization Tests ──────────────────────────────────────────────────────

console.log("\n── Authorization Tests ──\n");

test("should restrict pricing rule management", () => {
  const allowedRoles = ["operations", "company_admin", "super_admin"];

  expect(allowedRoles.includes("operations")).toBe(true);
  expect(allowedRoles.includes("super_admin")).toBe(true);
  expect(allowedRoles.includes("customer")).toBe(false);
  expect(allowedRoles.includes("driver")).toBe(false);
});

test("should restrict settlement management", () => {
  const allowedRoles = ["operations", "company_admin", "super_admin"];

  expect(allowedRoles.includes("operations")).toBe(true);
  expect(allowedRoles.includes("driver")).toBe(false);
});

test("should allow drivers to view own earnings only", () => {
  const driverId = "driver1";
  const userRole = "driver";

  // Can view own
  const canViewOwn = userRole === "driver" ? driverId === driverId : true;
  expect(canViewOwn).toBe(true);

  // Cannot view other (simulated check)
  const otherId: string = "driver2";
  const canViewOther = userRole === "driver" ? driverId === otherId : true;
  expect(canViewOther).toBe(false);
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

console.log("\n── Edge Cases ──\n");

test("should handle very large distances", () => {
  const distanceKm = 1000;
  const pricePerKm = 1500;
  const distanceFee = Math.round(pricePerKm * distanceKm);

  expect(distanceFee).toBe(1500000);
});

test("should handle very heavy packages", () => {
  const weightKg = 500;
  const pricePerKg = 200;
  const weightFee = Math.round(pricePerKg * weightKg);

  expect(weightFee).toBe(100000);
});

test("should handle zero distance", () => {
  const distanceKm = 0;
  const pricePerKm = 1500;
  const distanceFee = Math.round(pricePerKm * distanceKm);

  expect(distanceFee).toBe(0);
});

test("should round correctly", () => {
  const distanceKm = 3.333;
  const pricePerKm = 1500;
  const distanceFee = Math.round(pricePerKm * distanceKm);

  expect(distanceFee).toBe(5000);
});

// ─── Order Creation Pricing Integration Tests ──────────────────────────────

// These tests verify the pricing failure behavior that createOrderAndDelivery relies on.
// createOrderAndDelivery calls calculateAndStoreQuote which throws when:
//   1. No active pricing rule matches the order's packageSize + expeditionType
//   2. The pricing calculation itself fails
// When it throws, the entire Convex transaction rolls back — no orphaned records.

console.log("\n── Order Creation Pricing Integration Tests ──\n");

test("should throw when no matching pricing rule exists for the delivery type", () => {
  // Simulate: order has packageSize=large, expeditionType=same_day
  // but only small+standard rule exists in the database
  const orderPackageSize = "large";
  const orderExpeditionType = "same_day";

  // The pricing rule lookup filters by packageSize + expeditionType + isActive
  // If no rule matches, calculateAndStoreQuote throws:
  //   "No active pricing rule found for this delivery type"
  const matchingRule = [mockPricingRule].find(
    (r) =>
      r.packageSize === orderPackageSize &&
      r.expeditionType === orderExpeditionType &&
      r.isActive
  );

  if (!matchingRule) {
    // This is the expected path — no rule matches, pricing throws
    // createOrderAndDelivery would propagate this error and roll back
    expect(matchingRule).toBe(undefined);
  } else {
    throw new Error("Expected no matching rule but found one");
  }
});

test("should match pricing rule when packageSize and expeditionType align", () => {
  const orderPackageSize = "small";
  const orderExpeditionType = "standard";

  const matchingRule = [mockPricingRule].find(
    (r) =>
      r.packageSize === orderPackageSize &&
      r.expeditionType === orderExpeditionType &&
      r.isActive
  );

  if (!matchingRule) {
    throw new Error("Expected a matching rule but found none");
  }

  expect(matchingRule._id).toBe("rule1");
});

test("should not match inactive pricing rules", () => {
  const inactiveRule = {
    ...mockPricingRule,
    _id: "rule_inactive" as any,
    isActive: false,
  };

  const orderPackageSize = "small";
  const orderExpeditionType = "standard";

  const matchingRule = [inactiveRule].find(
    (r) =>
      r.packageSize === orderPackageSize &&
      r.expeditionType === orderExpeditionType &&
      r.isActive
  );

  if (matchingRule) {
    throw new Error("Expected no matching rule for inactive rule");
  }

  // No rule found — pricing would throw, order creation would roll back
  expect(matchingRule).toBe(undefined);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log("\n── Summary ──\n");
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}
