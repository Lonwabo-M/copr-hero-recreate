/**
 * Lasha Pending Operation Queue
 *
 * Manages offline operations with idempotent operation IDs.
 * Each operation is uniquely identified and can be safely retried.
 *
 * Operation format:
 * {
 *   operationId: string (UUID),
 *   operationType: string (e.g., "acceptAssignment"),
 *   entityId: string (e.g., delivery ID),
 *   payload: Record<string, any>,
 *   clientCreatedAt: number (timestamp),
 *   status: "pending" | "syncing" | "synced" | "failed" | "expired",
 *   retryCount: number,
 * }
 */

import {
  addOperation,
  getPendingOperations,
  getSyncingOperations,
  updateOperationStatus,
  StoredOperation,
} from "./db";

// ─── Operation Types ──────────────────────────────────────────────────────────

export type OperationType =
  | "acceptAssignment"
  | "rejectAssignment"
  | "updateDeliveryStatus"
  | "arriveAtPickup"
  | "pickupDelivery"
  | "startTrip"
  | "arriveAtDropoff"
  | "completeDelivery"
  | "cancelDelivery"
  | "updateLocation"
  | "captureProofOfDelivery";

export interface PendingOperation {
  operationId: string;
  operationType: OperationType;
  entityId: string;
  payload: Record<string, any>;
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
 * Add a new operation to the pending queue.
 */
export async function queueOperation(
  operationType: OperationType,
  entityId: string,
  payload: Record<string, any>
): Promise<string> {
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

  // Combine and sort by creation time (oldest first)
  return [...pending, ...syncing].sort(
    (a, b) => a.clientCreatedAt - b.clientCreatedAt
  );
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
 * Mark an operation as failed.
 */
export async function markOperationFailed(operationId: string, error: string): Promise<void> {
  await updateOperationStatus(operationId, "failed", error);
}

/**
 * Get operation count by status.
 */
export async function getOperationStats(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}> {
  const pending = await getPendingOperations();
  const syncing = await getSyncingOperations();

  return {
    pending: pending.length,
    syncing: syncing.length,
    synced: 0, // Would need additional query
    failed: 0, // Would need additional query
  };
}

// ─── Operation Validation ─────────────────────────────────────────────────────

/**
 * Check if an operation type is valid for offline queuing.
 */
export function isValidOperationType(type: string): type is OperationType {
  const validTypes: OperationType[] = [
    "acceptAssignment",
    "rejectAssignment",
    "updateDeliveryStatus",
    "arriveAtPickup",
    "pickupDelivery",
    "startTrip",
    "arriveAtDropoff",
    "completeDelivery",
    "cancelDelivery",
    "updateLocation",
    "captureProofOfDelivery",
  ];
  return validTypes.includes(type as OperationType);
}

/**
 * Check if an operation has exceeded max retries.
 */
export function hasExceededMaxRetries(operation: StoredOperation, maxRetries: number = 5): boolean {
  return operation.retryCount >= maxRetries;
}

/**
 * Check if an operation is expired (older than max age).
 */
export function isOperationExpired(operation: StoredOperation, maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
  return Date.now() - operation.clientCreatedAt > maxAgeMs;
}

// ─── Operation Payload Builders ───────────────────────────────────────────────

/**
 * Build payload for acceptAssignment operation.
 */
export function buildAcceptAssignmentPayload(offerId: string): Record<string, any> {
  return { offerId };
}

/**
 * Build payload for updateDeliveryStatus operation.
 */
export function buildUpdateStatusPayload(
  status: string,
  location?: { lat: number; lng: number }
): Record<string, any> {
  return { status, location };
}

/**
 * Build payload for updateLocation operation.
 */
export function buildLocationPayload(
  lat: number,
  lng: number,
  timestamp: number,
  accuracy?: number,
  speed?: number,
  heading?: number
): Record<string, any> {
  return { lat, lng, timestamp, accuracy, speed, heading };
}

/**
 * Build payload for captureProofOfDelivery operation.
 */
export function buildProofOfDeliveryPayload(
  photos: string[], // Base64 encoded
  signature?: string, // Base64 encoded
  notes?: string
): Record<string, any> {
  return { photos, signature, notes };
}
