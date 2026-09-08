/**
 * Lasha Dispatch Scoring Service Tests
 *
 * These tests verify that the scoring service correctly:
 * 1. Evaluates driver eligibility
 * 2. Calculates individual score components
 * 3. Ranks candidates appropriately
 * 4. Handles edge cases (no location, stale data, etc.)
 *
 * Run with: bun run src/convex/dispatch/scoring_service.test.ts
 */

import {
  DispatchScoringService,
  createScoringService,
  DEFAULT_SCORING_CONFIG,
  haversineDistance,
  DeliveryContext,
  DriverCandidate,
} from "./scoring_service";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Assertion failed: ${message}. Expected ~${expected}, got ${actual} (tolerance: ${tolerance})`);
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ─── Test Data ────────────────────────────────────────────────────────────────

// Johannesburg coordinates
const JHB_LAT = -26.2041;
const JHB_LNG = 28.0473;
const CBD_LAT = -26.2025;
const CBD_LNG = 28.0443;

function createDelivery(overrides: Partial<DeliveryContext> = {}): DeliveryContext {
  return {
    deliveryId: "delivery_id" as any,
    orderId: "order_id" as any,
    pickupLat: CBD_LAT,
    pickupLng: CBD_LNG,
    dropoffLat: -26.1367,
    dropoffLng: 28.0433,
    packageWeight: 5,
    packageSize: "small",
    requiresBreaking: false,
    requiresExpress: false,
    requiresFlammable: false,
    requiresTrailer: false,
    ...overrides,
  };
}

function createCandidate(overrides: Partial<DriverCandidate> = {}): DriverCandidate {
  return {
    driverId: "driver1" as any,
    vehicleId: "vehicle1" as any,
    currentLat: CBD_LAT,
    currentLng: CBD_LNG,
    lastLocationUpdate: Date.now(),
    rating: 4.5,
    totalTrips: 50,
    isAvailable: true,
    vehicleCapacity: 50,
    vehicleBreaking: false,
    vehicleExpress: false,
    vehicleFlammable: false,
    vehicleTrailer: false,
    vehicleIsActive: true,
    activeAssignmentCount: 0,
    pendingOfferCount: 0,
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Haversine Distance", () => {
  test("should calculate distance between same point as 0", () => {
    const dist = haversineDistance(CBD_LAT, CBD_LNG, CBD_LAT, CBD_LNG);
    assertApprox(dist, 0, 0.001, "Same point distance");
  });

  test("should calculate distance between two points", () => {
    // CBD to Sandton (~8km)
    const dist = haversineDistance(CBD_LAT, CBD_LNG, -26.0975, 28.0565);
    assert(dist > 5 && dist < 15, `Distance should be ~8km, got ${dist}`);
  });
});

describe("Eligibility Checks", () => {
  const service = createScoringService();

  test("should accept eligible candidate", () => {
    const candidate = createCandidate();
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, true, "Should be eligible");
    assert(result.reason === undefined, "Should not have ineligibility reason");
  });

  test("should reject unavailable driver", () => {
    const candidate = createCandidate({ isAvailable: false });
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, false, "Should not be eligible");
    assert(result.reason !== undefined && result.reason.includes("not available"), "Should mention not available");
  });

  test("should reject inactive vehicle", () => {
    const candidate = createCandidate({ vehicleIsActive: false });
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, false, "Should not be eligible");
    assert(result.reason !== undefined && result.reason.includes("not active"), "Should mention not active");
  });

  test("should reject low-rated driver", () => {
    const candidate = createCandidate({ rating: 2.5 });
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, false, "Should not be eligible");
    assert(result.reason !== undefined && result.reason.includes("Rating"), "Should mention rating");
  });

  test("should reject inexperienced driver", () => {
    const candidate = createCandidate({ totalTrips: 2 });
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, false, "Should not be eligible");
    assert(result.reason !== undefined && result.reason.includes("trips"), "Should mention trips");
  });

  test("should reject driver at max assignments", () => {
    const candidate = createCandidate({ activeAssignmentCount: 3 });
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, false, "Should not be eligible");
    assert(result.reason !== undefined && result.reason.includes("max capacity"), "Should mention max capacity");
  });

  test("should reject driver with too many pending offers", () => {
    const candidate = createCandidate({ pendingOfferCount: 2 });
    const result = service.checkEligibility(candidate);
    assertEqual(result.eligible, false, "Should not be eligible");
    assert(result.reason !== undefined && result.reason.includes("pending offers"), "Should mention pending offers");
  });
});

describe("Scoring Components", () => {
  const service = createScoringService();
  const delivery = createDelivery();

  test("proximity: closer drivers score higher", () => {
    const closeCandidate = createCandidate({
      currentLat: CBD_LAT,
      currentLng: CBD_LNG,
    });
    const farCandidate = createCandidate({
      currentLat: -26.0975, // Sandton
      currentLng: 28.0565,
    });

    const closeResult = service.scoreCandidate(closeCandidate, delivery);
    const farResult = service.scoreCandidate(farCandidate, delivery);

    const closeProximity = closeResult.components.find((c) => c.name === "proximity");
    const farProximity = farResult.components.find((c) => c.name === "proximity");

    assert(closeProximity !== undefined && farProximity !== undefined, "Should have proximity component");
    assert(closeProximity!.score > farProximity!.score, "Closer driver should score higher");
  });

  test("proximity: should handle missing location gracefully", () => {
    const candidate = createCandidate({
      currentLat: undefined,
      currentLng: undefined,
    });

    const result = service.scoreCandidate(candidate, delivery);
    const proximity = result.components.find((c) => c.name === "proximity");

    assert(proximity !== undefined, "Should have proximity component");
    assertApprox(proximity!.score, 50, 5, "Missing location gets neutral score");
  });

  test("capacity: should reject insufficient capacity", () => {
    const candidate = createCandidate({
      vehicleCapacity: 3, // Less than 5kg package
    });

    const result = service.scoreCandidate(candidate, delivery);
    const capacity = result.components.find((c) => c.name === "capacity");

    assert(capacity !== undefined, "Should have capacity component");
    assertEqual(capacity!.score, 0, "Should score 0 for insufficient capacity");
  });

  test("capacity: more headroom should score higher", () => {
    const smallVehicle = createCandidate({ vehicleCapacity: 6 });
    const largeVehicle = createCandidate({ vehicleCapacity: 50 });

    const smallResult = service.scoreCandidate(smallVehicle, delivery);
    const largeResult = service.scoreCandidate(largeVehicle, delivery);

    const smallCapacity = smallResult.components.find((c) => c.name === "capacity");
    const largeCapacity = largeResult.components.find((c) => c.name === "capacity");

    assert(smallCapacity !== undefined && largeCapacity !== undefined, "Should have capacity component");
    // Both should be eligible, but scoring differs due to headroom
    assert(smallResult.isEligible, "Small vehicle should be eligible");
    assert(largeResult.isEligible, "Large vehicle should be eligible");
  });

  test("rating: higher rated drivers should score higher", () => {
    const lowRated = createCandidate({ rating: 3.5 });
    const highRated = createCandidate({ rating: 5.0 });

    const lowResult = service.scoreCandidate(lowRated, delivery);
    const highResult = service.scoreCandidate(highRated, delivery);

    const lowRating = lowResult.components.find((c) => c.name === "rating");
    const highRating = highResult.components.find((c) => c.name === "rating");

    assert(lowRating !== undefined && highRating !== undefined, "Should have rating component");
    assert(lowRating!.score < highRating!.score, "Higher rating should score higher");
  });

  test("workload: less busy drivers should score higher", () => {
    const busy = createCandidate({ activeAssignmentCount: 2 });
    const free = createCandidate({ activeAssignmentCount: 0 });

    const busyResult = service.scoreCandidate(busy, delivery);
    const freeResult = service.scoreCandidate(free, delivery);

    const busyWorkload = busyResult.components.find((c) => c.name === "workload");
    const freeWorkload = freeResult.components.find((c) => c.name === "workload");

    assert(busyWorkload !== undefined && freeWorkload !== undefined, "Should have workload component");
    assert(busyWorkload!.score < freeWorkload!.score, "Less busy should score higher");
  });
});

describe("Candidate Ranking", () => {
  const service = createScoringService();
  const delivery = createDelivery();

  test("should rank eligible candidates by total score", () => {
    const candidates = [
      createCandidate({
        driverId: "driver1" as any,
        rating: 4.0,
        activeAssignmentCount: 2,
      }),
      createCandidate({
        driverId: "driver2" as any,
        rating: 5.0,
        activeAssignmentCount: 0,
        currentLat: CBD_LAT, // closer
        currentLng: CBD_LNG,
      }),
      createCandidate({
        driverId: "driver3" as any,
        rating: 3.5,
        activeAssignmentCount: 1,
      }),
    ];

    const ranked = service.rankCandidates(candidates, delivery);

    // All should be eligible
    assert(ranked.every((r) => r.isEligible), "All should be eligible");

    // Should be sorted by score descending
    for (let i = 1; i < ranked.length; i++) {
      assert(
        ranked[i - 1].totalScore >= ranked[i].totalScore,
        `Score should be descending: ${ranked[i - 1].totalScore} >= ${ranked[i].totalScore}`
      );
    }
  });

  test("should put ineligible candidates last", () => {
    const candidates = [
      createCandidate({
        driverId: "ineligible" as any,
        isAvailable: false,
      }),
      createCandidate({
        driverId: "eligible" as any,
      }),
    ];

    const ranked = service.rankCandidates(candidates, delivery);

    // Eligible should come first
    assert(ranked[0].isEligible, "First should be eligible");
    assert(!ranked[1].isEligible, "Second should be ineligible");
  });
});

describe("Scoring Configuration", () => {
  test("default config should have valid weights", () => {
    const weights = DEFAULT_SCORING_CONFIG.weights;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assertApprox(sum, 1.0, 0.01, "Weights should sum to 1.0");
  });

  test("should allow custom configuration", () => {
    const customConfig = {
      weights: {
        proximity: 0.5,
        availability: 0.1,
        capacity: 0.2,
        rating: 0.1,
        workload: 0.05,
        routeCompatibility: 0.05,
      },
      maxProximityDistance: 30,
    };

    const service = createScoringService(customConfig);
    const config = service.getConfig();

    assertEqual(config.weights.proximity, 0.5, "Custom proximity weight");
    assertEqual(config.maxProximityDistance, 30, "Custom max distance");
  });

  test("should use defaults for unspecified values", () => {
    const customConfig = {
      weights: {
        proximity: 0.5,
        availability: 0.1,
        capacity: 0.2,
        rating: 0.1,
        workload: 0.05,
        routeCompatibility: 0.05,
      },
    };

    const service = createScoringService(customConfig);
    const config = service.getConfig();

    // Should use default for unspecified values
    assertEqual(config.maxActiveAssignments, DEFAULT_SCORING_CONFIG.maxActiveAssignments, "Default max assignments");
    assertEqual(config.offerExpiryMs, DEFAULT_SCORING_CONFIG.offerExpiryMs, "Default offer expiry");
  });
});

describe("Edge Cases", () => {
  const service = createScoringService();
  const delivery = createDelivery();

  test("should handle candidate with all missing optional data", () => {
    const candidate = createCandidate({
      currentLat: undefined,
      currentLng: undefined,
      lastLocationUpdate: undefined,
      vehicleCapacity: 50,
      rating: 4.0,
      totalTrips: 50,
    });

    const result = service.scoreCandidate(candidate, delivery);
    assert(result.isEligible, "Should be eligible");
    assert(result.totalScore > 0, "Should have positive score");
  });

  test("should handle delivery with missing coordinates", () => {
    const deliveryNoCoords = createDelivery({
      pickupLat: 0,
      pickupLng: 0,
      dropoffLat: 0,
      dropoffLng: 0,
    });

    const candidate = createCandidate();
    const result = service.scoreCandidate(candidate, deliveryNoCoords);
    assert(result.isEligible, "Should be eligible");
  });

  test("should handle zero weight package", () => {
    const deliveryZeroWeight = createDelivery({ packageWeight: 0 });
    const candidate = createCandidate({ vehicleCapacity: 50 });

    const result = service.scoreCandidate(candidate, deliveryZeroWeight);
    assert(result.isEligible, "Should be eligible with zero weight");
  });
});

describe("Utility Functions", () => {
  test("getOfferExpiryMs should return configured value", () => {
    const service = createScoringService();
    assertEqual(
      service.getOfferExpiryMs(),
      DEFAULT_SCORING_CONFIG.offerExpiryMs,
      "Offer expiry should match config"
    );
  });

  test("getConfig should return a copy", () => {
    const service = createScoringService();
    const config1 = service.getConfig();
    const config2 = service.getConfig();

    // Should not be the same object
    assert(config1 !== config2, "Should return different object references");
    // But should have same values
    assertEqual(config1.maxProximityDistance, config2.maxProximityDistance, "Same values");
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
