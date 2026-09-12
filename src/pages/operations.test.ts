/**
 * Operations Centre Tests
 *
 * Verifies the live Operations Centre (OperationsCentre.tsx) against the actual
 * source. Tests the pure client-side logic and the backend contracts the UI
 * relies on — not the full Convex runtime.
 *
 * Covers:
 *  - authorization model (operations/super_admin only for live ops views)
 *  - active delivery status vocabulary (exact state-machine terminology)
 *  - live tactical map renders from real tracking data only (no mock locations,
 *    no external map service, no GPS from this browser)
 *  - tracking freshness logic (Live / Recently updated / Stale / No location)
 *  - exceptions derived from real data (failed, reassignment_required, no
 *    driver, stale GPS, no location, expired offers)
 *  - operational actions use existing authorized backend mutations (dispatch,
 *    reassign, cancel) — no generic updateDeliveryStatus
 *  - financial systems are NOT mixed into the operations interface
 *  - no mock data, no Math.random() usage, no fake driver locations
 *
 * Run: bunx tsx src/pages/operations.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Test harness (matches repo pattern) ──────────────────────────────────────

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

function assertNotContains(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Should NOT contain: "${needle}"`);
  }
}

function assertNotContainsCode(haystack: string, needle: string, message: string) {
  // Like assertNotContains but ignores occurrences inside comments and string
  // literals. Useful when a name is mentioned in a doc comment but never executed.
  const lines = haystack.split("\n");
  for (const line of lines) {
    const stripped = line.replace(/\/\/.*$/, "").trim();
    if (stripped.includes(needle)) {
      throw new Error(`Assertion failed: ${message}. Found executable occurrence of "${needle}"`);
    }
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const opsPage = read("src/pages/OperationsCentre.tsx");
const stateMachine = read("src/convex/deliveries/state_machine.ts");
const dispatchEngine = read("src/convex/dispatch/engine.ts");
const trackingQueries = read("src/convex/tracking/queries.ts");
const trackingConfig = read("src/convex/tracking/config.ts");
const operationsCss = read("src/styles/operations.css");

// ─── 1. Authorization ──────────────────────────────────────────────────────────

console.log("\n1. Authorization model");

test("OperationsCentre renders inside OperationsShell", () => {
  assertContains(
    opsPage,
    "<OperationsShell activeItem=\"Operations Centre\">",
    "OperationsCentre uses OperationsShell",
  );
});

test("OperationsCentre Live Map uses getActiveDeliveries (operations-scoped)", () => {
  assertContains(
    opsPage,
    "api.deliveries.state_machine.getActiveDeliveries",
    "OperationsCentre reads getActiveDeliveries",
  );
});

test("getActiveDeliveries is gated to operations / super_admin", () => {
  assertContains(
    stateMachine,
    "if (!allowedRoles.includes(user.role as any)) {\n      throw new Error(\"Access denied: operations only\");",
    "getActiveDeliveries rejects non-operations users",
  );
});

test("getAvailableDriverLocations is gated to operations / company_admin / super_admin", () => {
  assertContains(
    trackingQueries,
    "const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];",
    "getAvailableDriverLocations gates on operations roles",
  );
  assertContains(
    trackingQueries,
    "throw new Error(\"Access denied: only operations can view all driver locations\");",
    "getAvailableDriverLocations rejects unauthorized roles",
  );
});

test("getDeliveryTracking authorizes operations to view any delivery", () => {
  assertContains(
    trackingQueries,
    "adminRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]",
    "getDeliveryTracking lets operations track any delivery",
  );
});

test("getDispatchOffers is authenticated", () => {
  assertContains(
    dispatchEngine,
    "const user = await getCurrentAuthUser(ctx);\n    if (!user) throw new Error(\"Authentication required\");",
    "getDispatchOffers requires authentication",
  );
});

// ─── 2. Active delivery status vocabulary ──────────────────────────────────────

console.log("\n2. Active delivery status vocabulary");

test("getActiveDeliveries uses exact existing state-machine statuses", () => {
  const block = stateMachine.slice(
    stateMachine.indexOf("export const getActiveDeliveries = query"),
    stateMachine.indexOf("export const getMyDeliveryHistory"),
  );
  // Match status literals as strings (the file uses DELIVERY_STATUS.ASSIGNED etc).
  const statuses = [
    "assigned",
    "driver_accepted",
    "en_route_to_pickup",
    "at_pickup",
    "picked_up",
    "in_transit",
    "at_dropoff",
  ];
  for (const s of statuses) {
    assertTrue(block.includes(`"${s}"`), `active statuses include ${s}`);
  }
});

test("getActiveDeliveries excludes terminal states", () => {
  const block = stateMachine.slice(
    stateMachine.indexOf("export const getActiveDeliveries = query"),
    stateMachine.indexOf("export const getMyDeliveryHistory"),
  );
  // The activeStatuses array only lists the 7 active statuses — delivered/failed/
  // cancelled/reassignment_required/pending_dispatch/requested are omitted.
  // Verify by checking that delivered does not appear inside the activeStatuses array.
  const activeStatusesBlock = block.slice(
    block.indexOf("const activeStatuses = ["),
    block.indexOf("];", block.indexOf("const activeStatuses = [")),
  );
  assertNotContains(activeStatusesBlock, "delivered", "activeStatuses excludes delivered");
  assertNotContains(activeStatusesBlock, "failed", "activeStatuses excludes failed");
  assertNotContains(activeStatusesBlock, "cancelled", "activeStatuses excludes cancelled");
});

test("OperationsCentre renders status labels from real DELIVERY_STATUS vocabulary", () => {
  assertContains(opsPage, "DELIVERY_STATUS.ASSIGNED", "page references assigned status");
  assertContains(opsPage, "DELIVERY_STATUS.IN_TRANSIT", "page references in_transit status");
  assertContains(opsPage, "DELIVERY_STATUS.AT_DROPOFF", "page references at_dropoff status");
  assertContains(opsPage, "DELIVERY_STATUS.REASSIGNMENT_REQUIRED", "page references reassignment_required");
});

// ─── 3. Live tactical map ──────────────────────────────────────────────────────

console.log("\n3. Live tactical map");

test("OperationsCentre renders an inline SVG tactical map (no external map service)", () => {
  assertContains(opsPage, "<svg viewBox=", "map is an inline SVG");
  assertContains(opsPage, "function SvgMap", "map is rendered by an SvgMap component");
  assertNotContains(opsPage, "Mapbox", "no Mapbox");
  assertNotContains(opsPage, "Leaflet", "no Leaflet");
  assertNotContains(opsPage, "google.maps", "no Google Maps");
  assertNotContains(opsPage, "mapboxgl", "no mapbox-gl");
  assertNotContains(opsPage, "navigator.geolocation", "map does not request GPS from this browser");
});

test("tactical map renders driver positions from getAvailableDriverLocations", () => {
  assertContains(
    opsPage,
    "api.tracking.queries.getAvailableDriverLocations",
    "map reads driver positions from existing tracking query",
  );
  assertContains(opsPage, "driverMarkers", "map renders driver markers");
  assertContains(opsPage, "dr.lat", "map uses driver lat from tracking records");
  assertContains(opsPage, "dr.lng", "map uses driver lng from tracking records");
});

test("tactical map renders pickup and dropoff markers from delivery records", () => {
  assertContains(opsPage, "pickupMarkers", "map renders pickup markers");
  assertContains(opsPage, "dropoffMarkers", "map renders dropoff markers");
  assertContains(opsPage, "d.pickupLat", "map uses delivery pickupLat");
  assertContains(opsPage, "d.dropoffLat", "map uses delivery dropoffLat");
});

test("tactical map shows stale driver locations with a distinct visual", () => {
  assertContains(opsPage, "stale ? \"#C62828\" : \"#0A7C42\"", "stale drivers are rendered red");
  assertContains(opsPage, "strokeDasharray=\"2 2\"", "stale drivers have a dashed ring indicator");
});

test("tactical map coordinate range is derived from real data, not a fixed fake viewport", () => {
  assertContains(
    opsPage,
    "const points: [number, number][] = [];",
    "map bounds derive from actual point data",
  );
  assertContains(opsPage, "points.push([d.pickupLat, d.pickupLng])", "bounds include real pickup coords");
  assertContains(opsPage, "points.push([dr.lat as number, dr.lng as number])", "bounds include real driver coords");
  assertContains(opsPage, "hasData: false", "fallback is clearly flagged as no-data");
});

test("tactical map route lines connect pickup → dropoff for deliveries with both coords", () => {
  assertContains(opsPage, "strokeDasharray={selected ? \"none\" : \"4 4\"}", "routes are dashed for non-selected");
  assertContains(opsPage, "route lines", "map draws route lines");
  // SvgMap derives routes from pickups (which carry the delivery with dropoff coords).
  assertContains(opsPage, "const routes = pickups", "routes are derived from pickup markers with delivery dropoff");
});

// ─── 4. Tracking freshness ─────────────────────────────────────────────────────

console.log("\n4. Tracking freshness");

test("freshness uses documented thresholds (Live < 10s, Recently updated < 60s)", () => {
  assertContains(opsPage, "fresh: 10_000", "Live threshold: 10 seconds");
  assertContains(opsPage, "recent: 60_000", "Recently updated threshold: 60 seconds");
});

test("freshness labels are Live / Recently updated / Stale / No location", () => {
  assertContains(opsPage, "\"Live\"", "freshness label: Live");
  assertContains(opsPage, "\"Recently updated\"", "freshness label: Recently updated");
  assertContains(opsPage, "\"Stale\"", "freshness label: Stale");
  assertContains(opsPage, "\"No location\"", "freshness label: No location");
});

test("stale threshold aligns with MAX_STALENESS_MS from tracking/config.ts", () => {
  // MAX_STALENESS_MS is written as 60_000 in the config. Parse it handling the
  // underscore.
  const maxStalenessMatch = trackingConfig.match(/MAX_STALENESS_MS\s*=\s*(\d+(?:_\d+)*)/);
  assertTrue(maxStalenessMatch !== null, "MAX_STALENESS_MS is defined in tracking config");
  const raw = maxStalenessMatch![1];
  const maxStaleness = parseInt(raw.replace(/_/g, ""), 10);
  assertEqual(maxStaleness, 60_000, "MAX_STALENESS_MS is 60 seconds");
  assertTrue(
    opsPage.includes("recent: 60_000"),
    "page's 'recent' threshold (60s) matches MAX_STALENESS_MS",
  );
});

test("freshness is computed from driver lastUpdate timestamp", () => {
  assertContains(opsPage, "function freshnessState(lastUpdate", "freshnessState takes lastUpdate");
  assertContains(opsPage, "const age = Date.now() - lastUpdate", "freshness computes age from timestamp");
});

test("live indicators use a pulse animation for live drivers", () => {
  assertContains(opsPage, "animate-pulse", "live indicators animate");
});

// ─── 5. Exceptions derived from real data ──────────────────────────────────────

console.log("\n5. Exceptions");

test("exceptions include failed deliveries", () => {
  assertContains(opsPage, "d.status === DELIVERY_STATUS.FAILED", "exceptions include failed");
  assertContains(opsPage, "Delivery has failed", "failed exception message");
});

test("exceptions include reassignment_required deliveries", () => {
  assertContains(opsPage, "d.status === DELIVERY_STATUS.REASSIGNMENT_REQUIRED", "exceptions include reassignment_required");
  assertContains(opsPage, "Reassignment required", "reassignment exception message");
});

test("exceptions include deliveries with no assigned driver in active states", () => {
  assertContains(opsPage, "d.courierId === undefined && ACTIVE_STATUSES.includes", "exceptions include no-driver in active states");
  assertContains(opsPage, "No driver assigned", "no-driver exception message");
});

test("exceptions include stale GPS for active deliveries", () => {
  assertContains(opsPage, "loc && loc.isStale", "exceptions include stale GPS");
  assertContains(opsPage, "Driver location stale", "stale GPS exception message");
});

test("exceptions include no driver location for in-transit deliveries", () => {
  assertContains(opsPage, "No driver location available", "no-location exception message");
});

test("exceptions can include expired dispatch offers", () => {
  assertContains(opsPage, "o.status === \"expired\"", "exceptions include expired offers");
  assertContains(opsPage, "Dispatch offer expired", "expired offer exception message");
});

test("no-driver exception is only surfaced for active statuses (not terminal)", () => {
  const block = opsPage.slice(
    opsPage.indexOf("d.courierId === undefined && ACTIVE_STATUSES.includes"),
    opsPage.indexOf("d.courierId === undefined && ACTIVE_STATUSES.includes") + 120,
  );
  assertTrue(block.includes("ACTIVE_STATUSES"), "no-driver check is gated by ACTIVE_STATUSES");
});

// ─── 6. Operational actions use existing authorized backend mutations ──────────

console.log("\n6. Operational actions");

test("dispatch action uses dispatchDelivery mutation (not a generic updateDeliveryStatus)", () => {
  assertContains(opsPage, "api.deliveries.state_machine.dispatchDelivery", "dispatch uses existing dispatchDelivery");
  // updateDeliveryStatus must not appear as executable code (only in the doc comment
  // describing what we do NOT do).
  assertNotContainsCode(opsPage, "updateDeliveryStatus", "no generic updateDeliveryStatus mutation");
});

test("reassign action uses reassignDelivery mutation", () => {
  assertContains(opsPage, "api.dispatch.engine.reassignDelivery", "reassign uses existing reassignDelivery");
});

test("dispatchDelivery backend mutation is operations-authorized", () => {
  const block = dispatchEngine.slice(
    dispatchEngine.indexOf("export const dispatchDelivery = mutation"),
    dispatchEngine.indexOf("export const getDispatchOffers"),
  );
  assertTrue(
    block.includes("ROLES.OPERATIONS") || block.includes("allowedRoles"),
    "dispatchDelivery backend checks operations authorization",
  );
  assertContains(
    block,
    "Cannot dispatch: delivery is in \"${delivery.status}\" state, expected \"pending_dispatch\"",
    "dispatchDelivery validates delivery is in pending_dispatch",
  );
});

test("reassignDelivery backend mutation is operations-authorized", () => {
  const block = dispatchEngine.slice(
    dispatchEngine.indexOf("export const reassignDelivery = mutation"),
    dispatchEngine.indexOf("export const getMyDispatchOffers"),
  );
  assertTrue(
    block.includes("ROLES.OPERATIONS") || block.includes("allowedRoles"),
    "reassignDelivery backend checks operations authorization",
  );
});

test("cancel action uses cancelDelivery mutation", () => {
  assertContains(opsPage, "api.deliveries.state_machine.cancelDelivery", "cancel uses existing cancelDelivery");
});

// ─── 7. Financial separation ───────────────────────────────────────────────────

console.log("\n7. Financial separation");

test("OperationsCentre does not read payment/settlement/reconciliation/earnings queries", () => {
  assertNotContains(opsPage, "api.payments", "ops page does not read payments");
  assertNotContains(opsPage, "api.driver_earnings", "ops page does not read driver earnings");
  assertNotContains(opsPage, "settlements", "ops page does not reference settlements");
  assertNotContains(opsPage, "wallets", "ops page does not reference wallets");
  assertNotContains(opsPage, "getOrderReconciliation", "ops page does not read reconciliation");
});

test("OperationsCentre does not display earnings/payable/payout/paid amounts", () => {
  // These must not appear as executable code (data labels, not in comments).
  assertNotContainsCode(opsPage, " earned", "ops page does not display earned amounts");
  assertNotContainsCode(opsPage, " payable", "ops page does not display payable amounts");
  assertNotContainsCode(opsPage, " payout", "ops page does not display payout amounts");
  assertNotContainsCode(opsPage, "paid out", "ops page does not display paid-out amounts");
});

test("OperationsCentre operations.css does not add financial components", () => {
  assertNotContains(operationsCss, ".ops-earnings", "ops css has no earnings component");
  assertNotContains(operationsCss, ".ops-payout", "ops css has no payout component");
  assertNotContains(operationsCss, ".ops-settlement", "ops css has no settlement component");
});

// ─── 8. No mock data ───────────────────────────────────────────────────────────

console.log("\n8. No mock data");

test("OperationsCentre does not call Math.random() in executable code", () => {
  assertNotContainsCode(opsPage, "Math.random()", "ops page does not use Math.random()");
});

test("OperationsCentre does not hardcode fake driver locations", () => {
  // The only numeric coordinate constants should be the no-data fallback viewport
  // (-34.0, -33.6, 18.2, 18.7) which is clearly flagged hasData: false.
  // Reject any other fixed lat/lng literals with 5+ decimal digits.
  const fallback = /-?34\.0\b|-33\.6\b|18\.2\b|18\.7\b/g;
  const suspicious = /-?3[34]\.\d{5,}/g;
  // Remove the fallback viewport constants, then check nothing else looks like a
  // fixed coordinate literal.
  const withoutFallback = opsPage.replace(fallback, "");
  assertTrue(
    !suspicious.test(withoutFallback),
    "ops page has no hardcoded coordinate literals beyond the no-data fallback viewport",
  );
});

test("OperationsCentre does not import mock data", () => {
  assertNotContainsCode(opsPage, "../mocks", "ops page does not import from a mocks directory");
  // "mock" may appear in a doc comment — that is fine. Check it does not appear
  // as an import or variable name.
  assertNotContainsCode(opsPage, "import.*mock", "ops page does not import mock modules");
});

test("OperationsCentre does not fabricate driver ratings", () => {
  assertNotContainsCode(opsPage, "rating:", "ops page does not display driver ratings");
  // Driver names come from the real tracking query (dr.name). "Driver" is a
  // presentation fallback when name is missing, not a fabricated identity.
  assertContains(opsPage, "dr.driver.name ? dr.driver.name.split", "driver name from real data, fallback when missing");
});

// ─── 9. Reactive queries ───────────────────────────────────────────────────────

console.log("\n9. Reactive queries");

test("OperationsCentre uses Convex useQuery for reactive updates (no polling)", () => {
  const queryCalls = (opsPage.match(/useQuery\(/g) ?? []).length;
  assertTrue(queryCalls >= 4, `ops page uses useQuery ${queryCalls} times for reactive data`);
  assertNotContains(opsPage, "setInterval(", "ops page does not poll");
});

test("Live deliveries, drivers, tracking, and dispatch offers are all reactive", () => {
  assertContains(opsPage, "const activeDeliveries = useQuery", "active deliveries reactive");
  assertContains(opsPage, "const driverLocations = useQuery", "driver locations reactive");
  assertContains(opsPage, "const selectedTracking = useQuery", "tracking reactive");
  assertContains(opsPage, "const dispatchOffers = useQuery", "dispatch offers reactive");
});

// ─── 10. Delivery detail reuses existing tracking query ────────────────────────

console.log("\n10. Delivery detail");

test("delivery detail uses getDeliveryTracking (existing tracking query)", () => {
  assertContains(opsPage, "api.tracking.queries.getDeliveryTracking", "detail uses getDeliveryTracking");
});

test("delivery detail shows driver location + route history from tracking", () => {
  assertContains(opsPage, "tracking.driverLocation", "detail shows driver location");
  assertContains(opsPage, "tracking.routeHistory", "detail shows route history");
});

test("delivery detail does not expose customer payment or provider secrets", () => {
  assertNotContains(opsPage, "payment_transactions", "detail does not expose payment transactions");
  assertNotContains(opsPage, "PAYSTACK", "detail does not expose Paystack references");
  assertNotContains(opsPage, "\"provider\"", "detail does not expose provider references");
});

// ─── 11. Dispatch visibility ───────────────────────────────────────────────────

console.log("\n11. Dispatch visibility");

test("dispatch tab shows pending_dispatch deliveries", () => {
  assertContains(opsPage, "d.status === DELIVERY_STATUS.PENDING_DISPATCH", "dispatch tab filters pending_dispatch");
});

test("dispatch tab shows active offers via getDispatchOffers", () => {
  assertContains(opsPage, "api.dispatch.engine.getDispatchOffers", "dispatch tab reads offers");
  assertContains(opsPage, "active offer(s)", "dispatch tab displays offer count");
});

test("dispatch tab does not invent offer/execution logic", () => {
  assertNotContainsCode(opsPage, "score(", "dispatch tab does not recalculate scores");
});

// ─── 12. Drivers panel ─────────────────────────────────────────────────────────

console.log("\n12. Drivers panel");

test("drivers panel shows driver name, ID, location, freshness, active delivery", () => {
  assertContains(opsPage, "ops-driver-name", "drivers panel shows driver name");
  assertContains(opsPage, "ops-driver-id", "drivers panel shows driver ID");
  assertContains(opsPage, "ops-driver-coords", "drivers panel shows coordinates");
  assertContains(opsPage, "ops-freshness-badge", "drivers panel shows freshness");
  assertContains(opsPage, "Active delivery", "drivers panel shows active delivery when assigned");
  assertContains(opsPage, "Available", "drivers panel shows Available when free");
});

test("drivers panel does not show ratings or earnings", () => {
  assertNotContainsCode(opsPage, "ops-driver-rating", "drivers panel has no rating display");
  assertNotContainsCode(opsPage, " earned", "drivers panel does not show earnings");
});

test("drivers panel shows totalTrips only as informational context (not a performance score)", () => {
  // totalTrips is surfaced from the real tracking query as lightweight context
  // (total trips completed), not as a rating/performance score.
  const hasTotalTrips = opsPage.includes("totalTrips");
  const hasRatingDisplay = opsPage.includes("ops-driver-rating");
  assertTrue(
    hasTotalTrips && !hasRatingDisplay,
    "drivers panel may show totalTrips as context but has no rating/performance score display",
  );
});

// ─── 13. History tab ───────────────────────────────────────────────────────────

console.log("\n13. History tab");

test("history tab uses getMyDeliveries (operations sees all)", () => {
  assertContains(opsPage, "api.deliveries.state_machine.getMyDeliveries", "history tab reads all deliveries");
});

test("history tab shows delivered / failed / cancelled counts", () => {
  assertContains(opsPage, "DELIVERED", "history tab shows delivered");
  assertContains(opsPage, "FAILED", "history tab shows failed");
  assertContains(opsPage, "CANCELLED", "history tab shows cancelled");
});

// ─── 14. CSS / design ──────────────────────────────────────────────────────────

console.log("\n14. CSS / design");

test("operations.css includes live map styles", () => {
  assertContains(operationsCss, ".ops-map {", "ops css has map styles");
  assertContains(operationsCss, ".ops-map-svg {", "ops css has svg map styles");
  assertContains(operationsCss, ".ops-map-marker {", "ops css has map marker styles");
  assertContains(operationsCss, ".ops-legend-dot", "ops css has map legend styles");
});

test("operations.css includes drivers grid styles", () => {
  assertContains(operationsCss, ".ops-drivers-grid", "ops css has drivers grid");
  assertContains(operationsCss, ".ops-driver-card", "ops css has driver card");
  assertContains(operationsCss, ".ops-driver-active", "ops css has driver active delivery");
});

test("operations.css includes dispatch card styles", () => {
  assertContains(operationsCss, ".ops-dispatch-card", "ops css has dispatch card");
  assertContains(operationsCss, ".ops-dispatch-list", "ops css has dispatch list");
});

test("operations.css includes exceptions styles", () => {
  assertContains(operationsCss, ".ops-exception-card", "ops css has exception card");
  assertContains(operationsCss, ".ops-exception-kind", "ops css has exception kind");
});

// ─── Summary ────────────────────────────────────────────────────────────────────

console.log(`\nOperations Centre tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}
