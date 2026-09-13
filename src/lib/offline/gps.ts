/**
 * Lasha GPS Buffering Strategy
 *
 * Manages location updates during temporary connectivity loss for an ACTIVE
 * DELIVERY. Buffered points are stored in the pending-operations queue
 * (IndexedDB), bound to their delivery at enqueue time, and synchronized
 * through the EXISTING `tracking.mutations.updateDeliveryLocation` mutation
 * when connectivity returns. Convex remains authoritative: the server
 * re-validates assignment, trackable state, coordinates, timestamp age,
 * frequency, and movement for every replayed point, and rejects anything
 * stale — exactly as it does for live updates. No second tracking backend.
 *
 * Retention policy (explicit, documented in docs/offline-driver.md):
 *  - MAX_BUFFERED_LOCATIONS: the queue never holds more than this many
 *    points; the oldest are dropped first (bounded growth).
 *  - MAX_BUFFER_AGE_MS: points older than this are discarded before sync,
 *    because the server's timestamp validation (MAX_AGE_MS = 5 minutes)
 *    would reject them anyway.
 *  - When a delivery completes/fails, its remaining buffered points are
 *    discarded — never replayed against another delivery.
 *
 * The browser-only navigator.geolocation watch loop stays in the driver
 * tracking hook (useDriverLocationTracking); this module only decides
 * sample/buffer/sync. Nothing here writes delivery state.
 */

import {
  addLocation,
  getBufferedLocations,
  clearBufferedLocations,
  trimLocationBuffer,
  StoredLocation,
} from "./db";
import { isOnline, onConnectivityChange } from "./connectivity";
import {
  queueOperation,
  getOperationsForEntity,
  discardOperation,
  discardOperationsForEntity,
  type OfflineLocationPayload,
  type StoredOperation,
} from "./operations";

// ─── Configuration ────────────────────────────────────────────────────────────

export const GPS_CONFIG = {
  /** Maximum number of GPS points buffered per queue (bounded growth). */
  maxBufferSize: 100,

  /** Minimum time between location samples (ms) — mirrors the tracking hook's
   *  SEND_INTERVAL_MS (15s), comfortably above the backend's 10s minimum. */
  minSampleInterval: 15_000,

  /** Maximum age of a buffered point (ms). Points older than this are
   *  discarded before sync: the server's validateTimestamp (5-minute max age)
   *  would reject them, so replaying is pointless. */
  maxAge: 5 * 60 * 1000,

  /** Distance threshold for sampling (meters) — negligible movement. */
  minDistanceMeters: 20,
} as const;

// ─── GPS State (sampling bookkeeping) ─────────────────────────────────────────

let lastSampleTime: number = 0;
let lastSampleLat: number | null = null;
let lastSampleLng: number | null = null;

// ─── Haversine Distance ───────────────────────────────────────────────────────

/**
 * Calculate distance between two coordinates in meters.
 */
function haversineDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// ─── Sampling Logic ───────────────────────────────────────────────────────────

/**
 * Determine if a new location should be sampled.
 * Uses both time-based and distance-based sampling.
 */
function shouldSample(
  lat: number,
  lng: number,
  timestamp: number
): boolean {
  const now = Date.now();

  // Always sample if this is the first fix of the session.
  if (lastSampleLat === null || lastSampleLng === null) {
    return true;
  }

  // Time-based sampling with a distance-based exception (real movement).
  if (now - lastSampleTime < GPS_CONFIG.minSampleInterval) {
    const distance = haversineDistanceMeters(
      lastSampleLat, lastSampleLng,
      lat, lng
    );
    if (distance < GPS_CONFIG.minDistanceMeters) {
      return false; // Too close, skip
    }
  }

  return true;
}

function updateSampleState(lat: number, lng: number, timestamp: number): void {
  lastSampleTime = timestamp;
  lastSampleLat = lat;
  lastSampleLng = lng;
}

// ─── Location Processing ──────────────────────────────────────────────────────

/**
 * Process a new GPS fix for an ACTIVE delivery while offline.
 *
 * Applies sampling, then queues the point as an `updateLocation` operation
 * bound to `deliveryId` (cross-delivery isolation is structural: the entity
 * is fixed at enqueue time, never taken from stale UI state at sync time).
 *
 * While online this is a no-op — live updates go straight through the
 * existing tracking hook and Convex mutation.
 */
export async function processLocation(
  deliveryId: string,
  lat: number,
  lng: number,
  timestamp: number,
  accuracy?: number,
  speed?: number,
  heading?: number
): Promise<{ buffered: boolean; sampled: boolean }> {
  // Apply sampling
  if (!shouldSample(lat, lng, timestamp)) {
    return { buffered: false, sampled: false };
  }

  updateSampleState(lat, lng, timestamp);

  // If online, we don't buffer (the live path sends directly to Convex).
  if (isOnline()) {
    return { buffered: false, sampled: true };
  }

  // Queue the point as an offline-safe updateLocation operation.
  await queueOperation("updateLocation", deliveryId, {
    lat,
    lng,
    timestamp,
    accuracy,
    speed,
    heading,
  });

  return { buffered: true, sampled: true };
}

// ─── Buffer Inspection (UI) ───────────────────────────────────────────────────

/**
 * Number of GPS points buffered for a delivery (UI: "N locations buffered").
 */
export async function getBufferedCountForDelivery(
  deliveryId: string
): Promise<number> {
  const ops = await getOperationsForEntity(deliveryId);
  return ops.filter((o) => o.operationType === "updateLocation").length;
}

/**
 * All buffered GPS points for a delivery, oldest first (ordered replay).
 */
export async function getBufferedLocationsForDelivery(
  deliveryId: string
): Promise<StoredOperation[]> {
  const ops = await getOperationsForEntity(deliveryId);
  return ops.filter((o) => o.operationType === "updateLocation");
}

/**
 * Discard a delivery's remaining buffered points.
 * Called when the delivery becomes terminal (completed/failed/cancelled):
 * queued GPS for a finished delivery is operationally irrelevant and must
 * never be replayed, and never against another delivery.
 */
export async function discardBufferForDelivery(
  deliveryId: string
): Promise<number> {
  return discardOperationsForEntity(deliveryId);
}

/**
 * Drop buffered points older than the retention window. The server's
 * timestamp validation rejects points older than 5 minutes, so keeping them
 * only wastes storage. Called before each sync attempt.
 */
export async function discardStaleBufferedLocations(): Promise<number> {
  const ops = await getOperationsForSyncAll();
  const cutoff = Date.now() - GPS_CONFIG.maxAge;
  let discarded = 0;
  for (const op of ops) {
    const payload = op.payload as OfflineLocationPayload;
    if (payload.timestamp < cutoff) {
      await discardOperation(op.operationId);
      discarded++;
    }
  }
  return discarded;
}

/**
 * All updateLocation operations across deliveries (maintenance helper).
 */
async function getOperationsForSyncAll(): Promise<
  Awaited<ReturnType<typeof getOperationsForEntity>>
> {
  const { getOperationsForSync } = await import("./operations");
  const all = await getOperationsForSync();
  return all.filter((o) => o.operationType === "updateLocation");
}

// ─── Synchronization ──────────────────────────────────────────────────────────

/** Per-point sync outcome. */
export type PointSyncOutcome = "synced" | "discarded" | "retry" | "skipped";

export interface GpsSyncResult {
  synced: number;
  discarded: number;
  retrying: number;
  skipped: number;
  lastError?: string;
}

/**
 * Authenticated Convex executor injected from React context
 * (useConvexClient() from "convex/react"). The app's authenticated client is
 * the ONLY transport — offline sync never creates its own client or
 * credentials, so server authorization (driver identity, assignment,
 * state validation) applies to replayed points exactly as to live ones.
 */
export type ConvexExecutor = (
  mutation: unknown,
  args: Record<string, unknown>
) => Promise<unknown>;

/**
 * Synchronize a delivery's buffered GPS points through the existing
 * `updateDeliveryLocation` mutation, oldest first (preserves ordering).
 *
 * Per point:
 *  - accepted  → remove from queue ("synced")
 *  - authoritatively rejected as stale/invalid/terminal → remove ("discarded";
 *    the server decided the point is no longer relevant — accepting that
 *    decision is correct, retrying would never succeed)
 *  - transient failure (network, unknown) → keep ("retry") for the next cycle
 *
 * Idempotency/duplicate safety: each queued point is transmitted once and
 * removed on acceptance; the server's own frequency + down-sampling
 * validation makes any accidental replay harmless.
 */
export async function syncBufferedLocationsForDelivery(
  deliveryId: string,
  executeMutation: ConvexExecutor
): Promise<GpsSyncResult> {
  const result: GpsSyncResult = {
    synced: 0,
    discarded: 0,
    retrying: 0,
    skipped: 0,
  };

  if (isOnline() === false) {
    // Nothing to do while offline; entries are retained.
    const count = await getBufferedCountForDelivery(deliveryId);
    result.skipped = count;
    return result;
  }

  // Enforce retention first: never replay points the server would reject.
  await discardStaleBufferedLocations();

  const { api } = await import("@/convex/_generated/api");

  const ops = await getBufferedLocationsForDelivery(deliveryId);

  for (const op of ops) {
    const payload = op.payload as OfflineLocationPayload;
    try {
      await executeMutation(api.tracking.mutations.updateDeliveryLocation, {
        deliveryId,
        location: {
          lat: payload.lat,
          lng: payload.lng,
          timestamp: payload.timestamp,
          accuracy: payload.accuracy,
          speed: payload.speed,
          heading: payload.heading,
        },
      });

      // Accepted by the server (or benignly rejected as a duplicate of an
      // already-recorded point) — remove from the queue.
      await discardOperation(op.operationId);
      result.synced++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.lastError = message;

      if (isAuthoritativeRejection(message)) {
        // The server examined the point and refused it on its merits —
        // stale, invalid, unassigned, or terminal delivery. Retrying can
        // never succeed; drop the point (never silently, never fatal).
        await discardOperation(op.operationId);
        result.discarded++;
      } else {
        // Transient (network/auth hiccup) — keep for the next cycle.
        result.retrying++;
        break; // Ordered replay: stop at the first non-terminal failure.
      }
    }
  }

  return result;
}

/**
 * Classify a Convex error: authoritative rejection (point can be discarded)
 * vs transient failure (point can never succeed — keep for retry).
 * Exported for offline resilience tests.
 *
 * Authoritative = the server processed the request and applied its domain
 * validation. Transient = the request likely never reached validation
 * (network) or failed on infrastructure.
 */
export function isAuthoritativeRejection(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("timestamp") ||
    m.includes("frequency") ||
    m.includes("too frequent") ||
    m.includes("not trackable") ||
    m.includes("not assigned") ||
    m.includes("not found") ||
    m.includes("invalid") ||
    m.includes("only drivers") ||
    m.includes("movement") ||
    m.includes("speed") ||
    m.includes("coordinates")
  );
}

// ─── Legacy direct-buffer API (kept for the standalone IndexedDB buffer) ─────
//
// The raw location store remains available for diagnostics/retention tooling,
// but the driver workflow uses the delivery-bound operations queue above.

/**
 * Add a location to the raw GPS buffer (diagnostics only).
 */
export async function addRawLocation(location: Omit<StoredLocation, "id">): Promise<number> {
  const id = await addLocation(location);
  await trimLocationBuffer(GPS_CONFIG.maxBufferSize);
  return id;
}

/**
 * Get all raw buffered locations.
 */
export async function getRawBufferedLocations(): Promise<StoredLocation[]> {
  return getBufferedLocations();
}

/**
 * Clear the raw location buffer.
 */
export async function clearRawBuffer(): Promise<void> {
  await clearBufferedLocations();
  lastSampleLat = null;
  lastSampleLng = null;
  lastSampleTime = 0;
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize GPS module.
 * Sets up connectivity-based logging (sync itself is driven by the sync
 * engine with the authenticated executor injected from React context).
 */
export function initGPS(): void {
  onConnectivityChange((state) => {
    if (state === "ONLINE") {
      // The sync engine (with the injected authenticated executor) handles
      // uploading buffered locations when the driver app mounts.
      console.log("[offline-gps] back online — buffered points ready to sync");
    }
  });
}
