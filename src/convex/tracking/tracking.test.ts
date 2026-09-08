/**
 * Lasha Tracking Validation Tests
 *
 * These tests verify that the tracking validation functions correctly:
 * 1. Validate coordinates
 * 2. Validate timestamps
 * 3. Validate update frequency
 * 4. Validate movement reasonableness
 * 5. Validate driver authorization
 *
 * Run with: bun run src/convex/tracking/tracking.test.ts
 */

import {
  validateCoordinates,
  validateTimestamp,
  validateUpdateFrequency,
  validateMovement,
  validateDriverAuthorization,
  validateDeliveryTrackable,
  haversineDistance,
} from "./validation";
import {
  LAT_MIN, LAT_MAX,
  LNG_MIN, LNG_MAX,
  MIN_UPDATE_INTERVAL_MS,
  MAX_SPEED_KMH,
  EARTH_RADIUS_KM,
} from "./config";
import { DELIVERY_STATUS, ROLES } from "../schema";

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

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Coordinate Validation", () => {
  test("should accept valid coordinates", () => {
    const result = validateCoordinates(JHB_LAT, JHB_LNG);
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should accept coordinates at boundaries", () => {
    assertEqual(validateCoordinates(LAT_MIN, LNG_MIN).valid, true, "Min boundary");
    assertEqual(validateCoordinates(LAT_MAX, LNG_MAX).valid, true, "Max boundary");
    assertEqual(validateCoordinates(0, 0).valid, true, "Origin");
  });

  test("should reject latitude out of range", () => {
    assertEqual(validateCoordinates(-91, JHB_LNG).valid, false, "Too low");
    assertEqual(validateCoordinates(91, JHB_LNG).valid, false, "Too high");
  });

  test("should reject longitude out of range", () => {
    assertEqual(validateCoordinates(JHB_LAT, -181).valid, false, "Too low");
    assertEqual(validateCoordinates(JHB_LAT, 181).valid, false, "Too high");
  });

  test("should reject NaN coordinates", () => {
    assertEqual(validateCoordinates(NaN, JHB_LNG).valid, false, "Lat NaN");
    assertEqual(validateCoordinates(JHB_LAT, NaN).valid, false, "Lng NaN");
  });

  test("should reject non-numeric coordinates", () => {
    // @ts-expect-error Testing invalid input
    assertEqual(validateCoordinates("invalid", JHB_LNG).valid, false, "Lat string");
  });
});

describe("Timestamp Validation", () => {
  test("should accept recent timestamp", () => {
    const result = validateTimestamp(Date.now());
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should accept timestamp slightly in the past", () => {
    const result = validateTimestamp(Date.now() - 60_000); // 1 minute ago
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should reject timestamp too far in the past", () => {
    const result = validateTimestamp(Date.now() - 10 * 60_000); // 10 minutes ago
    assertEqual(result.valid, false, "Should be invalid");
    assertEqual(result.code, "STALE_TIMESTAMP", "Should have correct code");
  });

  test("should reject timestamp in the future", () => {
    const result = validateTimestamp(Date.now() + 60_000); // 1 minute in future
    assertEqual(result.valid, false, "Should be invalid");
    assertEqual(result.code, "FUTURE_TIMESTAMP", "Should have correct code");
  });

  test("should reject NaN timestamp", () => {
    const result = validateTimestamp(NaN);
    assertEqual(result.valid, false, "Should be invalid");
  });
});

describe("Update Frequency Validation", () => {
  test("should accept first update (no previous)", () => {
    const result = validateUpdateFrequency(undefined, Date.now());
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should accept update after minimum interval", () => {
    const lastUpdate = Date.now() - MIN_UPDATE_INTERVAL_MS - 1000;
    const result = validateUpdateFrequency(lastUpdate, Date.now());
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should reject update before minimum interval", () => {
    const lastUpdate = Date.now() - 5000; // 5 seconds ago
    const result = validateUpdateFrequency(lastUpdate, Date.now());
    assertEqual(result.valid, false, "Should be invalid");
    assertEqual(result.code, "TOO_FREQUENT", "Should have correct code");
  });
});

describe("Haversine Distance", () => {
  test("should calculate distance between same point as 0", () => {
    const dist = haversineDistance(JHB_LAT, JHB_LNG, JHB_LAT, JHB_LNG);
    assert(dist < 0.001, `Should be ~0, got ${dist}`);
  });

  test("should calculate distance between two points", () => {
    // CBD to Sandton (~8km)
    const dist = haversineDistance(CBD_LAT, CBD_LNG, -26.0975, 28.0565);
    assert(dist > 5 && dist < 15, `Should be ~8km, got ${dist}`);
  });

  test("should be commutative", () => {
    const dist1 = haversineDistance(JHB_LAT, JHB_LNG, CBD_LAT, CBD_LNG);
    const dist2 = haversineDistance(CBD_LAT, CBD_LNG, JHB_LAT, JHB_LNG);
    assert(Math.abs(dist1 - dist2) < 0.001, "Should be same both ways");
  });
});

describe("Movement Validation", () => {
  test("should accept first update (no previous location)", () => {
    const result = validateMovement(
      undefined, undefined, undefined,
      JHB_LAT, JHB_LNG, Date.now()
    );
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should accept reasonable movement", () => {
    const prevTime = Date.now() - 30_000; // 30 seconds ago
    const result = validateMovement(
      CBD_LAT, CBD_LNG, prevTime,
      CBD_LAT + 0.001, CBD_LNG + 0.001, Date.now()
    );
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should reject unreasonable speed", () => {
    const prevTime = Date.now() - 1000; // 1 second ago
    // Move ~100km in 1 second = 360,000 km/h
    const result = validateMovement(
      JHB_LAT, JHB_LNG, prevTime,
      JHB_LAT + 1, JHB_LNG + 1, Date.now()
    );
    assertEqual(result.valid, false, "Should be invalid");
    assertEqual(result.code, "UNREASONABLE_SPEED", "Should have correct code");
  });

  test("should reject non-sequential timestamps", () => {
    const prevTime = Date.now();
    const result = validateMovement(
      CBD_LAT, CBD_LNG, prevTime,
      CBD_LAT + 0.001, CBD_LNG + 0.001, prevTime - 1000
    );
    assertEqual(result.valid, false, "Should be invalid");
  });
});

describe("Driver Authorization", () => {
  test("should accept assigned driver", () => {
    const result = validateDriverAuthorization(
      "driver1" as any,
      {
        deliveryId: "delivery1" as any,
        courierId: "driver1" as any,
        status: DELIVERY_STATUS.IN_TRANSIT,
        orderId: "order1" as any,
      }
    );
    assertEqual(result.valid, true, "Should be valid");
  });

  test("should reject unassigned driver", () => {
    const result = validateDriverAuthorization(
      "driver2" as any,
      {
        deliveryId: "delivery1" as any,
        courierId: "driver1" as any,
        status: DELIVERY_STATUS.IN_TRANSIT,
        orderId: "order1" as any,
      }
    );
    assertEqual(result.valid, false, "Should be invalid");
    assertEqual(result.code, "NOT_ASSIGNED", "Should have correct code");
  });

  test("should reject delivery with no driver", () => {
    const result = validateDriverAuthorization(
      "driver1" as any,
      {
        deliveryId: "delivery1" as any,
        courierId: undefined,
        status: DELIVERY_STATUS.PENDING_DISPATCH,
        orderId: "order1" as any,
      }
    );
    assertEqual(result.valid, false, "Should be invalid");
    assertEqual(result.code, "NO_DRIVER", "Should have correct code");
  });
});

describe("Delivery Trackable Validation", () => {
  test("should accept trackable statuses", () => {
    const trackableStatuses = [
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_DROPOFF,
    ];

    for (const status of trackableStatuses) {
      const result = validateDeliveryTrackable({
        deliveryId: "delivery1" as any,
        courierId: "driver1" as any,
        status,
        orderId: "order1" as any,
      });
      assertEqual(result.valid, true, `${status} should be trackable`);
    }
  });

  test("should reject non-trackable statuses", () => {
    const nonTrackableStatuses = [
      DELIVERY_STATUS.REQUESTED,
      DELIVERY_STATUS.PENDING_DISPATCH,
      DELIVERY_STATUS.DELIVERED,
      DELIVERY_STATUS.CANCELLED,
      DELIVERY_STATUS.FAILED,
      DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
    ];

    for (const status of nonTrackableStatuses) {
      const result = validateDeliveryTrackable({
        deliveryId: "delivery1" as any,
        courierId: "driver1" as any,
        status,
        orderId: "order1" as any,
      });
      assertEqual(result.valid, false, `${status} should not be trackable`);
    }
  });
});

describe("Configuration Constants", () => {
  test("should have valid minimum update interval", () => {
    assert(MIN_UPDATE_INTERVAL_MS > 0, "Should be positive");
    assert(MIN_UPDATE_INTERVAL_MS <= 60_000, "Should be <= 1 minute");
  });

  test("should have valid max speed", () => {
    assert(MAX_SPEED_KMH > 0, "Should be positive");
    assert(MAX_SPEED_KMH <= 500, "Should be reasonable");
  });

  test("should have valid earth radius", () => {
    assert(Math.abs(EARTH_RADIUS_KM - 6371) < 1, "Should be ~6371 km");
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
