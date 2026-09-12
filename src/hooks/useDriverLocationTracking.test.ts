/**
 * Lasha Driver Location Tracking Hook — Unit Tests
 *
 * Verifies the pure helpers of the continuous-GPS tracking hook
 * (`src/hooks/useDriverLocationTracking.ts`) in isolation. The hook itself
 * is browser-bound (navigator.geolocation + Convex), so the browser-free
 * invariants are tested here:
 *
 * 1. Throttling: fixes inside the send window are never sent.
 * 2. First fix after a watcher session start is always sent.
 * 3. Negligible movement (< MIN_DISTANCE_METERS) is skipped until the
 *    stationary heartbeat interval elapses (stays below MAX_STALENESS_MS).
 * 4. Sufficient movement always sends once past the send interval.
 * 5. Haversine math is correct (known distance sanity check).
 * 6. GPS error codes map to distinct, driver-legible statuses:
 *    permission denial must be distinguishable from unavailability/timeout.
 *
 * The server (`tracking.mutations`) re-validates every update
 * authoritatively — these tests cover only the client-side decision logic.
 *
 * Run: bunx tsx src/hooks/useDriverLocationTracking.test.ts
 */

import {
  SEND_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  MIN_DISTANCE_METERS,
  shouldSendLocation,
  haversineMeters,
  statusForGpsError,
  TRACKING_STATUS_COPY,
  type TrackingState,
} from "./useDriverLocationTracking";

// ─── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSuite = "";

function describe(name: string, fn: () => void) {
  currentSuite = name;
  console.log(`\n  ${name}`);
  fn();
  currentSuite = "";
}

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`    ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${currentSuite} > ${name}: ${msg}`);
    console.log(`    ✗ ${name}`);
    console.log(`      ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}. Expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

const T0 = 1_700_000_000_000;
const base = {
  now: T0,
  lastSentAt: 0,
  lastLat: null as number | null,
  lastLng: null as number | null,
  lat: -26.2041,
  lng: 28.0473,
};

// ─── Throttling ──────────────────────────────────────────────────────────────

describe("shouldSendLocation — throttling", () => {
  test("skips fixes inside the send window", () => {
    const justSent = {
      ...base,
      lastSentAt: T0 - (SEND_INTERVAL_MS - 1_000),
    };
    assertEqual(shouldSendLocation(justSent), false, "inside window must not send");
  });

  test("sends the first fix after a watcher session start", () => {
    assertEqual(shouldSendLocation(base), true, "first fix must send");
  });

  test("sends once the send window has elapsed", () => {
    const due = {
      ...base,
      lastSentAt: T0 - SEND_INTERVAL_MS,
    };
    assertEqual(shouldSendLocation(due), true, "window elapsed must send");
  });
});

// ─── Movement filtering / heartbeat ─────────────────────────────────────────

describe("shouldSendLocation — movement and heartbeat", () => {
  test("skips negligible movement before the heartbeat interval", () => {
    const now = T0;
    const lastSentAt = now - (SEND_INTERVAL_MS + 1_000); // past send window
    const tinyMove = 5; // meters
    const dLat = tinyMove / 111_320; // ~meters per degree latitude
    const decision = shouldSendLocation({
      now,
      lastSentAt,
      lastLat: -26.2041,
      lastLng: 28.0473,
      lat: -26.2041 + dLat,
      lng: 28.0473,
    });
    assertEqual(decision, false, "negligible movement must be skipped before heartbeat");
  });

  test("stationary heartbeat sends after HEARTBEAT_INTERVAL_MS", () => {
    const now = T0;
    const lastSentAt = now - HEARTBEAT_INTERVAL_MS; // stationary too long
    const decision = shouldSendLocation({
      now,
      lastSentAt,
      lastLat: -26.2041,
      lastLng: 28.0473,
      lat: -26.2041,
      lng: 28.0473, // same position
    });
    assertEqual(decision, true, "stationary heartbeat must send to avoid server staleness");
  });

  test("sends real movement past the send window", () => {
    const now = T0;
    const lastSentAt = now - (SEND_INTERVAL_MS + 5_000);
    // ~200m north
    const dLat = 200 / 111_320;
    const decision = shouldSendLocation({
      now,
      lastSentAt,
      lastLat: -26.2041,
      lastLng: 28.0473,
      lat: -26.2041 + dLat,
      lng: 28.0473,
    });
    assertEqual(decision, true, "real movement must send");
  });

  test("client send interval stays above the backend minimum (10s)", () => {
    // Import-free sanity check against tracking config values documented in
    // the hook; guards against future edits violating server validation.
    const BACKEND_MIN_UPDATE_INTERVAL_MS = 10_000;
    assert(
      SEND_INTERVAL_MS > BACKEND_MIN_UPDATE_INTERVAL_MS,
      `SEND_INTERVAL_MS (${SEND_INTERVAL_MS}) must exceed backend MIN_UPDATE_INTERVAL_MS`
    );
    const BACKEND_MAX_STALENESS_MS = 60_000;
    assert(
      HEARTBEAT_INTERVAL_MS < BACKEND_MAX_STALENESS_MS,
      `HEARTBEAT_INTERVAL_MS (${HEARTBEAT_INTERVAL_MS}) must stay below backend MAX_STALENESS_MS`
    );
    assert(
      MIN_DISTANCE_METERS > 0,
      "MIN_DISTANCE_METERS must be positive"
    );
  });
});

// ─── Haversine ───────────────────────────────────────────────────────────────

describe("haversineMeters", () => {
  test("returns ~0 for the same point", () => {
    const d = haversineMeters(-26.2041, 28.0473, -26.2041, 28.0473);
    assert(d < 1, `same point distance should be <1m, got ${d}`);
  });

  test("measures a known 1-degree-latitude span as ~111km", () => {
    const d = haversineMeters(0, 0, 1, 0);
    assert(
      d > 110_000 && d < 112_000,
      `1 degree latitude should be ~111km, got ${d}`
    );
  });

  test("is symmetric", () => {
    const a = haversineMeters(-26.2041, 28.0473, -26.1367, 28.0433);
    const b = haversineMeters(-26.1367, 28.0433, -26.2041, 28.0473);
    assert(Math.abs(a - b) < 1e-6, "distance must be symmetric");
  });
});

// ─── GPS error mapping ───────────────────────────────────────────────────────

describe("statusForGpsError", () => {
  test("PERMISSION_DENIED (1) maps to denied", () => {
    const s = statusForGpsError(1);
    assertEqual(s.state, "denied" as TrackingState, "code 1 must map to denied");
    assert(!!s.message, "denied must carry a message");
  });

  test("POSITION_UNAVAILABLE (2) maps to error", () => {
    const s = statusForGpsError(2);
    assertEqual(s.state, "error" as TrackingState, "code 2 must map to error");
    assert(!!s.message, "unavailable must carry a message");
  });

  test("TIMEOUT (3) maps to error", () => {
    const s = statusForGpsError(3);
    assertEqual(s.state, "error" as TrackingState, "code 3 must map to error");
    assert(!!s.message, "timeout must carry a message");
  });

  test("denied is distinguishable from other errors", () => {
    const denied = statusForGpsError(1).state;
    const unavailable = statusForGpsError(2).state;
    assertNotEqual(denied, unavailable);
  });
});

function assertNotEqual<T>(actual: T, expected: T) {
  if (actual === expected) {
    throw new Error(`Assertion failed: values must differ, both are ${String(actual)}`);
  }
}

// ─── Status copy ─────────────────────────────────────────────────────────────

describe("TRACKING_STATUS_COPY", () => {
  const expectedStates: TrackingState[] = [
    "idle",
    "starting",
    "waiting",
    "sent",
    "denied",
    "error",
    "unsupported",
  ];

  test("every tracking state has driver-facing copy", () => {
    for (const state of expectedStates) {
      assert(
        typeof TRACKING_STATUS_COPY[state] === "string" &&
          TRACKING_STATUS_COPY[state].length > 0,
        `missing copy for state "${state}"`
      );
    }
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n════════════════════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    - ${f}`);
  process.exit(1);
}
console.log("  All driver location tracking hook tests passed.\n");
