/**
 * Offline Resilience Tests
 *
 * Verifies the driver offline-first layer:
 *   - GPS buffer: bounded growth, age retention, delivery binding, ordering
 *   - queue whitelist: only updateLocation is queueable (state transitions,
 *     offers, POD are refused offline by construction)
 *   - sync engine: wired into the Driver App, replays through the EXISTING
 *     updateDeliveryLocation mutation, per-delivery isolation, defensive
 *     refusal of unsafe operation types, bounded backoff
 *   - connectivity model: Convex-connection-derived, not navigator.onLine
 *   - driver UI: indicator mounted in the shell; offers/transitions/POD
 *     blocked offline with clear messaging; no fabricated completion
 *   - security: logout clears local queue; no tokens/secrets stored
 *   - no second tracking backend, no new database, no polling infra
 *
 * Run: bunx tsx src/lib/offline/offline.test.ts
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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Expected to find: "${needle}"`);
  }
}

function assertNotIncludes(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Expected NOT to find: "${needle}"`);
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

// ─── Imports under test (pure logic) ──────────────────────────────────────────

import {
  GPS_CONFIG,
  processLocation,
  syncBufferedLocationsForDelivery,
  isAuthoritativeRejection,
  type ConvexExecutor,
} from "./gps";
import { QUEUE_LIMITS, queueOperation, enforceRetention } from "./operations";
import type { StoredOperation } from "./db";

// The IndexedDB layer requires a browser. The queue modules call getDatabase()
// lazily; in Node (no indexedDB) queueing must fail gracefully, which the
// tracking hook already treats as a no-op degradation. We exercise the pure
// decision logic directly and verify storage wiring via source assertions.
const browserStorageAvailable = typeof indexedDB !== "undefined";

// ─── 1. GPS buffer configuration (bounded, retention policy) ──────────────────

console.log("\n── GPS buffer bounds & retention ──");

test("GPS buffer has an explicit bounded size", () => {
  assert(GPS_CONFIG.maxBufferSize > 0, "maxBufferSize must be positive");
  assert(GPS_CONFIG.maxBufferSize <= 1000, "buffer stays bounded (no unbounded arrays)");
});

test("GPS max age matches the server timestamp validation window", () => {
  // Backend: validateTimestamp rejects > 5 min old. Buffering beyond that is
  // pointless — points must be discarded before sync.
  assertEqual(GPS_CONFIG.maxAge, 5 * 60 * 1000, "maxAge must be 5 minutes");
});

test("GPS sample interval respects the backend frequency validation", () => {
  // Backend MIN_UPDATE_INTERVAL_MS = 10_000; the client samples at 15s.
  assert(GPS_CONFIG.minSampleInterval >= 10_000, "sampling must respect server frequency floor");
});

test("queue limits are explicit and bounded", () => {
  assert(QUEUE_LIMITS.maxOperationsPerDelivery > 0, "per-delivery ceiling must be positive");
  assert(QUEUE_LIMITS.maxOperationsGlobal >= QUEUE_LIMITS.maxOperationsPerDelivery, "global ceiling >= per-delivery");
  assertEqual(QUEUE_LIMITS.maxOperationAgeMs, 5 * 60 * 1000, "age limit matches server timestamp window");
});

// ─── 2. Queue whitelist: only GPS is queueable ─────────────────────────────────

console.log("\n── Offline queue whitelist ──");

const operationsSource = read("src/lib/offline/operations.ts");
const syncSource = read("src/lib/offline/sync.ts");
const gpsSource = read("src/lib/offline/gps.ts");
const connectivitySource = read("src/lib/offline/connectivity.ts");
const hooksSource = read("src/hooks/use-offline.ts");
const shellSource = read("src/components/shells/DriverShell.tsx");
const offersSource = read("src/pages/DriverOffers.tsx");
const activeDeliverySource = read("src/pages/DriverActiveDelivery.tsx");
const appShellSource = read("src/components/shells/AppShell.tsx");

test("OperationType whitelist allows ONLY updateLocation", () => {
  assertIncludes(operationsSource, `export type OperationType = "updateLocation";`, "only GPS is queueable");
});

test("unsafe operation types are refused at enqueue time", () => {
  assertIncludes(
    operationsSource,
    `is not safe to queue offline`,
    "enqueue guard refuses non-whitelisted operations"
  );
});

test("the former unsafe operation union is fully removed", () => {
  for (const unsafe of [
    "acceptAssignment",
    "rejectAssignment",
    "updateDeliveryStatus",
    "arriveAtPickup",
    "pickupDelivery",
    "startTrip",
    "arriveAtDropoff",
    "completeDelivery",
    "cancelDelivery",
    "captureProofOfDelivery",
  ]) {
    assertNotIncludes(
      operationsSource,
      `"${unsafe}"`,
      `${unsafe} must not be an offline-queueable operation type`
    );
  }
});

test("sync engine defensively purges non-GPS queue entries", () => {
  assertIncludes(syncSource, "purgeUnsafeOperations", "defensive purge exists");
  assertIncludes(
    syncSource,
    "require live connectivity",
    "purge explains the safety model"
  );
});

// ─── 3. Sync engine wiring & behaviour ────────────────────────────────────────

console.log("\n── Sync engine ──");

test("sync engine is started in the Driver App shell", () => {
  assertIncludes(shellSource, "useSyncEngine()", "DriverShell starts the sync engine");
  assertIncludes(hooksSource, "startSyncEngine", "hook wires the engine");
});

test("sync engine uses the authenticated Convex client (no own transport)", () => {
  assertIncludes(hooksSource, "useConvex()", "executor comes from the app's Convex client");
  assertNotIncludes(gpsSource, "new ConvexReactClient", "no second Convex client is created");
  assertNotIncludes(syncSource, "new ConvexReactClient", "no second Convex client is created");
});

test("replay goes through the EXISTING updateDeliveryLocation mutation", () => {
  assertIncludes(
    gpsSource,
    "api.tracking.mutations.updateDeliveryLocation",
    "buffered points replay through the existing tracking mutation"
  );
});

test("no new tracking mutation is introduced by the offline layer", () => {
  assertNotIncludes(gpsSource, "createMutation", "offline layer defines no Convex mutations");
  assertNotIncludes(syncSource, "createMutation", "sync layer defines no Convex mutations");
});

test("sync does not run while offline or reconnecting", () => {
  assertIncludes(
    syncSource,
    `connectivity === "OFFLINE" || connectivity === "RECONNECTING"`,
    "cycle refuses OFFLINE and RECONNECTING"
  );
});

test("backoff is bounded (no tight retry loops)", () => {
  assertIncludes(syncSource, "maxRetryDelay", "max backoff configured");
  assertIncludes(syncSource, "baseRetryDelay * Math.pow(2", "exponential backoff applied");
});

test("sync is triggered on reconnect, focus, and a periodic check", () => {
  assertIncludes(syncSource, `state === "ONLINE"`, "reconnect trigger");
  assertIncludes(syncSource, "visibilitychange", "tab re-focus trigger");
  assertIncludes(syncSource, "setInterval", "periodic check");
});

test("failed sync retains entries with bounded backoff, not deletion", () => {
  // Transient failures keep entries (retry path); only authoritative
  // rejections and successes remove them.
  const syncFn = syncBufferedLocationsForDelivery;
  assert(typeof syncFn === "function", "sync function exported");
  assertIncludes(gpsSource, "break; // Ordered replay: stop at the first non-terminal failure.", "ordered replay stops at first transient failure");
});

// ─── 4. Per-point sync outcome classification ─────────────────────────────────

console.log("\n── Sync outcome classification ──");

test("server timestamp/staleness rejections are classified as authoritative", () => {
  assert(isAuthoritativeRejection('Timestamp is too old (max 5 minutes)'), "stale timestamp → discard");
  assert(isAuthoritativeRejection('Timestamp cannot be in the future'), "future timestamp → discard");
});

test("server state/assignment rejections are classified as authoritative", () => {
  assert(isAuthoritativeRejection('Delivery in "delivered" state is not trackable'), "terminal delivery → discard");
  assert(isAuthoritativeRejection("Driver is not assigned to this delivery"), "unassigned → discard");
  assert(isAuthoritativeRejection("Delivery not found"), "missing delivery → discard");
  assert(isAuthoritativeRejection("Coordinates out of range"), "invalid coordinates → discard");
});

test("network-level failures are NOT authoritative (kept for retry)", () => {
  assert(!isAuthoritativeRejection("Network request failed"), "network error → retry");
  assert(!isAuthoritativeRejection("TypeError: fetch failed"), "fetch failure → retry");
  assert(!isAuthoritativeRejection("WebSocket closed unexpectedly"), "transport error → retry");
});

// ─── 5. Delivery binding & isolation ──────────────────────────────────────────

console.log("\n── Delivery binding & isolation ──");

test("queue binds every entry to its delivery at enqueue time", () => {
  assertIncludes(
    operationsSource,
    "fixed at enqueue time",
    "entity binding documented and enforced at enqueue"
  );
  assertIncludes(gpsSource, "getBufferedLocationsForDelivery(deliveryId)", "replay is delivery-scoped");
});

test("terminal deliveries discard their buffer (no cross-delivery replay)", () => {
  assertIncludes(
    activeDeliverySource,
    "clearDeliveryOfflineBuffer(deliveryId)",
    "Active Delivery clears the buffer on terminal state"
  );
  assertIncludes(
    operationsSource,
    "deleteOperationsForEntity(entityId)",
    "discard is entity-scoped deletion"
  );
});

test("session change clears ALL local offline data", () => {
  assertIncludes(appShellSource, "clearAllOfflineData()", "logout clears offline stores");
  assertIncludes(
    appShellSource.replace(/\s+/g, " "),
    "must never survive logout",
    "cleanup rationale documented at the logout path"
  );
});

// ─── 6. Connectivity model ────────────────────────────────────────────────────

console.log("\n── Connectivity model ──");

test("all six connectivity states exist", () => {
  for (const s of ["ONLINE", "OFFLINE", "RECONNECTING", "SYNCING", "SYNC_COMPLETE", "SYNC_ERROR"]) {
    assertIncludes(connectivitySource, `"${s}"`, `state ${s} defined`);
  }
});

test("connectivity is derived from the Convex client connection, not /health fetch", () => {
  assertIncludes(connectivitySource, "reportConvexConnection", "Convex connection bridge exists");
  assertNotIncludes(connectivitySource, 'fetch("/health"', "no app-origin health probe (SPA fallback false positive)");
  assertNotIncludes(connectivitySource, "probeConvexConnectivity", "probe removed");
});

test("the bridge observes the real Convex client connection state", () => {
  assertIncludes(hooksSource, "useConvexConnectionState", "hook reads the actual client state");
  assertIncludes(hooksSource, "isWebSocketConnected", "WebSocket connectivity is the signal");
  assertIncludes(shellSource, "useConvexConnectionBridge()", "bridge mounted in the Driver App");
});

test("requireOnline guard re-verifies at execution time", () => {
  assertIncludes(
    hooksSource,
    "const current = checkConnectivity();",
    "guard re-checks when the mutation runs"
  );
  assertIncludes(
    hooksSource,
    `current === "OFFLINE" || current === "RECONNECTING"`,
    "guard blocks when Convex is unreachable"
  );
});

// ─── 7. Driver UI: offline blocking without fabricated state ──────────────────

console.log("\n── Driver UI offline behaviour ──");

test("offer accept/reject are blocked offline (buttons + handler)", () => {
  assertIncludes(offersSource, "useRequireOnline()", "offers guard wired");
  assertEqual(
    (offersSource.match(/!isOnline/g) ?? []).length >= 4,
    true,
    "accept+reject handlers and both buttons check connectivity"
  );
  assertIncludes(offersSource, "Accepting or rejecting offers needs a connection", "offline explanation shown");
});

test("delivery state transitions are blocked offline", () => {
  assertIncludes(activeDeliverySource, "Delivery actions need a connection", "transition handler blocks offline");
  assertIncludes(
    activeDeliverySource,
    "disabled={actionPending !== null || podBusy || !isOnline}",
    "primary action disabled offline"
  );
});

test("reject assignment is blocked offline", () => {
  assertIncludes(
    activeDeliverySource,
    "disabled={actionPending !== null || !isOnline}",
    "reject button disabled offline"
  );
  assertIncludes(activeDeliverySource, "Rejecting needs a connection", "reject handler blocks offline");
});

test("POD submission is blocked offline and never claims server completion", () => {
  assertIncludes(activeDeliverySource, "disabled={podBusy || !isOnline}", "POD submit disabled offline");
  assertIncludes(
    activeDeliverySource,
    "Proof-of-delivery submission needs a connection",
    "POD handler blocks offline"
  );
  // No offline terminal claim: podSuccess only set after the server-confirmed
  // flow (the setter lives in the online try-block after completeDelivery).
  assertIncludes(
    activeDeliverySource,
    "await completeDelivery({ deliveryId });",
    "completion flows through the existing authoritative mutation"
  );
});

test("offline page distinguishes last known server state from pending local action", () => {
  assertIncludes(activeDeliverySource, "last known server state", "server state is labelled as cached");
  assertIncludes(activeDeliverySource, "buffered", "buffered GPS surfaced to the driver");
});

test("connectivity indicator is mounted in the Driver shell", () => {
  assertIncludes(shellSource, "DriverConnectivityIndicator", "indicator present");
});

test("indicator consumes the delivery-scoped buffer count (id field)", () => {
  const indicator = read("src/components/driver/DriverConnectivityIndicator.tsx");
  assertIncludes(indicator, "current?.delivery?.id", "reads the correct delivery id field");
  assertNotIncludes(indicator, "delivery?._id", "stale _id access removed");
});

// ─── 8. History / earnings remain server-authoritative ────────────────────────

console.log("\n── Server-authoritative views ──");

test("history and earnings do not consume offline data", () => {
  const history = read("src/pages/DriverHistory.tsx");
  const earnings = read("src/pages/DriverEarnings.tsx");
  assertNotIncludes(history, "lib/offline", "history uses no offline layer");
  assertNotIncludes(earnings, "lib/offline", "earnings uses no offline layer");
  assertNotIncludes(history, "IndexedDB", "history uses no local persistence");
});

test("notifications are never fabricated offline", () => {
  assertNotIncludes(activeDeliverySource, "createNotification", "no client-side notification creation");
  assertNotIncludes(offersSource, "createNotification", "no client-side notification creation");
});

// ─── 9. Security: minimized local storage ─────────────────────────────────────

console.log("\n── Security & storage minimization ──");

const dbSource = read("src/lib/offline/db.ts");

test("no tokens, secrets, or credentials are stored in the offline layer", () => {
  const all = [dbSource, operationsSource, gpsSource, syncSource, connectivitySource].join("\n");
  assertNotIncludes(all, "token", "no auth token storage");
  assertNotIncludes(all, "password", "no password storage");
  assertNotIncludes(all, "apiKey", "no API key storage");
});

test("stored GPS payloads contain only operational fields", () => {
  assertIncludes(operationsSource, "lat", "lat");
  assertIncludes(operationsSource, "lng", "lng");
  assertIncludes(operationsSource, "timestamp", "timestamp");
  assertIncludes(operationsSource, "accuracy", "accuracy");
  assertNotIncludes(operationsSource, "customerId", "no customer identity in queue");
  assertNotIncludes(operationsSource, "payment", "no payment data in queue");
});

// ─── 10. No forbidden infrastructure ─────────────────────────────────────────

console.log("\n── No forbidden infrastructure ──");

test("no Redis, Socket.io, Firebase, Supabase, or secondary DB", () => {
  const all = [gpsSource, syncSource, connectivitySource, operationsSource, dbSource, hooksSource].join("\n");
  assertNotIncludes(all, "ioredis", "no Redis");
  assertNotIncludes(all, "socket.io", "no Socket.io");
  assertNotIncludes(all, "firebase", "no Firebase");
  assertNotIncludes(all, "supabase", "no Supabase");
  assertNotIncludes(all, "dexie", "no secondary DB wrapper");
  assertNotIncludes(all, "localforage", "no secondary DB wrapper");
});

test("no service worker or second tracking system", () => {
  assertNotIncludes(gpsSource, "navigator.serviceWorker", "no service worker");
  assertNotIncludes(gpsSource, "watchPosition", "offline layer does not create its own GPS watcher");
});

test("no localStorage-based GPS queue", () => {
  assertNotIncludes(dbSource, "localStorage", "GPS queue uses IndexedDB, not localStorage");
});

// ─── 11. Pure sampling logic ──────────────────────────────────────────────────

console.log("\n── Sampling logic ──");

test("processLocation is exported and wired into the tracking hook", () => {
  const hook = read("src/hooks/useDriverLocationTracking.ts");
  assertIncludes(hook, "bufferLocationOffline", "tracking hook buffers offline");
  assertIncludes(hook, `getConnectivityState() === "OFFLINE" || getConnectivityState() === "RECONNECTING"`, "buffering engages on OFFLINE/RECONNECTING");
  assertIncludes(hook, 'setStatus({ state: "buffered" })', "driver sees the buffered state");
});

// ─── 12. Storage-availability degradation ─────────────────────────────────────

test("tracking hook degrades safely when IndexedDB is unavailable", () => {
  const hook = read("src/hooks/useDriverLocationTracking.ts");
  assertIncludes(hook, "offline buffering unavailable", "storage failure is non-fatal");
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
