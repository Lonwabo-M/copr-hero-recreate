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
