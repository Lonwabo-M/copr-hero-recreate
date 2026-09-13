/**
 * Lasha Pending Operation Queue
 *
 * Manages offline operations with idempotent operation IDs.
 * Each operation is uniquely identified and can be safely retried.
 *
 * OFFLINE-SAFETY MODEL (see docs/offline-driver.md):
 * Only connectivity-insensitive operations may be queued offline. Today that
 * is exactly ONE operation type: buffered GPS location updates. Every other
 * driver mutation (offer accept/reject, delivery state transitions, POD
 * submission, financial actions) is concurrency-sensitive or
 * state-machine-authoritative and REQUIRES live connectivity — the server
 * must confirm current state at execution time, and a delayed replay could
 * produce an invalid transition. Queueing those offline would be unsafe.
 *
 * The former OperationType union (acceptAssignment, rejectAssignment,
 * updateDeliveryStatus, arriveAtPickup, pickupDelivery, startTrip,
 * arriveAtDropoff, completeDelivery, cancelDelivery, captureProofOfDelivery)
 * is deliberately removed: none of those operations is safe to queue offline.
 */

import {
  addOperation,
  getPendingOperations,
  getSyncingOperations,
  getPendingOperationsForEntity,
  updateOperationStatus,
  deleteOperation,
  deleteOperationsForEntity,
  countPendingOperationsForEntity,
  StoredOperation as _StoredOperation,
} from "./db";

// Re-export StoredOperation for consumers
export type StoredOperation = _StoredOperation;

// ─── Retention Policy (bounded queue) ─────────────────────────────────────────

/**
 * Explicit retention bounds (documented in docs/offline-driver.md):
 *  - MAX_OPERATIONS_PER_DELIVERY: a single delivery never holds more than
 *    this many buffered points; the OLDEST are dropped first (FIFO). The
 *    server's 5-minute timestamp validation means points beyond a few
 *    minutes old are worthless anyway — this is a hard storage ceiling.
 *  - MAX_OPERATIONS_GLOBAL: absolute ceiling across ALL deliveries (a driver
 *    could theoretically accumulate buffers for several deliveries if
 *    terminal-state cleanup failed); the oldest across the board are dropped.
 *  - MAX_OPERATION_AGE_MS: matches the backend's validateTimestamp max age
 *    (5 minutes). Older points are pruned at enqueue time — keeping them
 *    would only waste storage since the server would reject them at sync.
 *
 * Location data is operational telemetry, not a record: it is deliberately
 * NOT retained indefinitely.
 */
export const QUEUE_LIMITS = {
  maxOperationsPerDelivery: 100,
  maxOperationsGlobal: 300,
  maxOperationAgeMs: 5 * 60 * 1000,
} as const;

// ─── Operation Types ──────────────────────────────────────────────────────────

/**
 * Operation types that may be queued while offline.
 * GPS location updates are safe because:
 *  - the server validates every point against the delivery's CURRENT state
 *    (assignment, trackable status, coordinates, timestamp age, frequency,
 *    movement) and rejects stale/irrelevant points authoritatively;
 *  - replaying an old point can never advance delivery state;
 *  - duplicates are harmless (server-side down-sampling by timestamp; the
 *    client also de-duplicates by generated location ID before send).
 */
export type OperationType = "updateLocation";

/**
 * The offline payload contract for buffered GPS points. Every entry is bound
 * to its delivery at enqueue time (entityId) — a queued point for Delivery A
 * is never replayed against Delivery B.
 */
export interface OfflineLocationPayload {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

export interface PendingOperation {
  operationId: string;
  operationType: OperationType;
  entityId: string;
  payload: OfflineLocationPayload;
  clientCreatedAt: number;
}

// ─── Operation ID Generation ──────────────────────────────────────────────────

/**
 * Generate a unique operation ID.
 * Uses crypto.randomUUID if available, otherwise falls back to timestamp + random.
 */
function generateOperationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// ─── Queue Operations ─────────────────────────────────────────────────────────

/**
 * Add a new GPS location update to the pending queue.
 * `entityId` is the delivery the point belongs to — fixed at enqueue time.
 *
 * Bounded: enforces the retention policy BEFORE inserting — stale points are
 * pruned, and when a delivery's buffer is full the oldest points are dropped
 * (the queue can never exceed its ceiling, even during a long offline drive).
 */
export async function queueOperation(
  operationType: OperationType,
  entityId: string,
  payload: OfflineLocationPayload
): Promise<string> {
  if (operationType !== "updateLocation") {
    // Compile-time-enforced whitelist; guard for future contributors.
    throw new Error(
      `Operation "${operationType}" is not safe to queue offline. Only GPS location updates may be buffered.`
    );
  }

  // Retention first: drop points the server's timestamp validation would
  // reject at sync time anyway, then enforce the per-delivery and global
  // ceilings (oldest first). Bounded growth regardless of offline duration.
  await enforceRetention();

  const operationId = generateOperationId();

  const operation: StoredOperation = {
    operationId,
    operationType,
    entityId,
    payload,
    clientCreatedAt: Date.now(),
    status: "pending",
    retryCount: 0,
  };

  await addOperation(operation);
  return operationId;
}

/**
 * Apply the retention policy: prune stale points and trim to the global and
 * per-delivery ceilings. Called at enqueue time (bounded growth) and safe to
 * call before sync as well.
 */
export async function enforceRetention(): Promise<number> {
  const now = Date.now();
  let dropped = 0;

  // 1. Age-based prune (points the server would reject as stale).
  const all = await getAllOperations();
  for (const op of all) {
    if (op.payload && typeof op.payload.timestamp === "number" && now - op.payload.timestamp > QUEUE_LIMITS.maxOperationAgeMs) {
      await deleteOperation(op.operationId);
      dropped++;
    }
  }

  // 2. Global ceiling — drop oldest across all deliveries.
  const remaining = await getAllOperations();
  if (remaining.length > QUEUE_LIMITS.maxOperationsGlobal) {
    const overflow = [...remaining]
      .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt)
      .slice(0, remaining.length - QUEUE_LIMITS.maxOperationsGlobal);
    for (const op of overflow) {
      await deleteOperation(op.operationId);
      dropped++;
    }
  }

  // 3. Per-delivery ceiling — drop that delivery's oldest first.
  const byEntity = new Map<string, StoredOperation[]>();
  for (const op of await getAllOperations()) {
    const list = byEntity.get(op.entityId) ?? [];
    list.push(op);
    byEntity.set(op.entityId, list);
  }
  for (const [entityId, ops] of byEntity) {
    if (ops.length > QUEUE_LIMITS.maxOperationsPerDelivery) {
      const overflow = ops
        .sort((a, b) => a.clientCreatedAt - b.clientCreatedAt)
        .slice(0, ops.length - QUEUE_LIMITS.maxOperationsPerDelivery);
      for (const op of overflow) {
        await deleteOperation(op.operationId);
        dropped++;
      }
    }
    void entityId;
  }

  return dropped;
}

/** All queued operations regardless of status (retention bookkeeping). */
async function getAllOperations(): Promise<StoredOperation[]> {
  const pending = await getPendingOperations();
  const syncing = await getSyncingOperations();
  return [...pending, ...syncing];
}

/**
 * Get all pending operations ready for sync.
 * Returns operations that are either "pending" or "syncing" (for retry).
 */
export async function getOperationsForSync(): Promise<StoredOperation[]> {
  const pending = await getPendingOperations();
  const syncing = await getSyncingOperations();

  // Combine and sort by creation time (oldest first) — preserves GPS ordering.
  return [...pending, ...syncing].sort(
    (a, b) => a.clientCreatedAt - b.clientCreatedAt
  );
}

/**
 * Get pending operations for one entity (delivery-scoped).
 */
export async function getOperationsForEntity(
  entityId: string
): Promise<StoredOperation[]> {
  const all = await getPendingOperationsForEntity(entityId);
  return all.sort((a, b) => a.clientCreatedAt - b.clientCreatedAt);
}

/**
 * Mark an operation as syncing (in progress).
 */
export async function markOperationSyncing(operationId: string): Promise<void> {
  await updateOperationStatus(operationId, "syncing");
}

/**
 * Mark an operation as successfully synced.
 */
export async function markOperationSynced(operationId: string): Promise<void> {
  await updateOperationStatus(operationId, "synced");
}

/**
 * Mark an operation as failed with a reason.
 */
export async function markOperationFailed(
  operationId: string,
  error: string
): Promise<void> {
  await updateOperationStatus(operationId, "failed", error);
}

/**
 * Remove an operation from the queue permanently.
 * Called after successful sync (GPS points are ephemeral) or after the server
 * authoritatively rejects a point as stale/invalid (accepted-and-discarded).
 */
export async function discardOperation(operationId: string): Promise<void> {
  await deleteOperation(operationId);
}

/**
 * Remove all queued operations for one delivery.
 * Called when the delivery becomes terminal or the session ends.
 */
export async function discardOperationsForEntity(
  entityId: string
): Promise<number> {
  return deleteOperationsForEntity(entityId);
}

/**
 * Count pending operations for one delivery (UI: "buffering N locations").
 */
export async function countPendingOperationsForDelivery(
  entityId: string
): Promise<number> {
  return countPendingOperationsForEntity(entityId);
}

/**
 * Get aggregate stats across the queue.
 */
export async function getOperationStats(): Promise<{
  pending: number;
  failed: number;
}> {
  const pending = await getPendingOperations();
  const all = await getOperationsForSync();
  return {
    pending: pending.length,
    failed: all.filter((o) => o.status === "failed").length,
  };
}
