/**
 * Lasha Synchronization Engine
 *
 * Handles synchronization of pending operations with Convex.
 * Implements idempotent operations with conflict detection.
 *
 * Sync protocol:
 * 1. Get pending operations from IndexedDB
 * 2. Mark as "syncing"
 * 3. Execute against Convex
 * 4. Handle response (SUCCESS, DUPLICATE, CONFLICT, INVALID, EXPIRED)
 * 5. Update status accordingly
 * 6. Retry failed operations with exponential backoff
 */

import {
  getOperationsForSync,
  markOperationSyncing,
  markOperationSynced,
  markOperationFailed,
  hasExceededMaxRetries,
  isOperationExpired,
  StoredOperation,
} from "./operations";
import {
  setSyncingState,
  updatePendingOperationCount,
  getConnectivityState,
} from "./connectivity";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncResult =
  | { status: "SUCCESS"; operationId: string }
  | { status: "DUPLICATE"; operationId: string }
  | { status: "CONFLICT"; operationId: string; reason: string }
  | { status: "INVALID"; operationId: string; reason: string }
  | { status: "EXPIRED"; operationId: string }
  | { status: "ERROR"; operationId: string; error: string };

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current: string | null;
}

export type SyncProgressListener = (progress: SyncProgress) => void;

// ─── Configuration ────────────────────────────────────────────────────────────

const SYNC_CONFIG = {
  /** Maximum concurrent sync operations */
  maxConcurrent: 3,

  /** Base delay for exponential backoff (ms) */
  baseRetryDelay: 1000,

  /** Maximum retry delay (ms) */
  maxRetryDelay: 30000,

  /** Maximum retry count before marking as failed */
  maxRetries: 5,

  /** Operation expiry time (24 hours) */
  operationExpiryMs: 24 * 60 * 60 * 1000,

  /** Sync interval when online (ms) */
  syncIntervalMs: 10000,

  /** Sync interval when degraded (ms) */
  degradedSyncIntervalMs: 30000,
};

// ─── Sync State ───────────────────────────────────────────────────────────────

let isSyncRunning = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;
const progressListeners: Set<SyncProgressListener> = new Set();

// ─── Convex API References ────────────────────────────────────────────────────

/**
 * Execute an operation against Convex.
 * This maps operation types to the appropriate Convex mutations.
 */
async function executeOperation(operation: StoredOperation): Promise<SyncResult> {
  const { operationType, entityId, payload, operationId } = operation;

  try {
    // Dynamic import to avoid circular dependencies
    const { api } = await import("@/convex/_generated/api");
    const { default: convexClient } = await import("@/lib/convex");

    switch (operationType) {
      case "acceptAssignment":
        await convexClient.mutation(api.deliveries.state_machine.acceptAssignment, {
          offerId: payload.offerId,
        });
        return { status: "SUCCESS", operationId };

      case "updateDeliveryStatus":
        await convexClient.mutation(api.deliveries.state_machine.updateDeliveryStatus, {
          deliveryId: entityId,
          status: payload.status,
          location: payload.location,
        });
        return { status: "SUCCESS", operationId };

      case "arriveAtPickup":
        await convexClient.mutation(api.deliveries.state_machine.arriveAtPickup, {
          deliveryId: entityId,
          location: payload.location,
        });
        return { status: "SUCCESS", operationId };

      case "pickupDelivery":
        await convexClient.mutation(api.deliveries.state_machine.pickupDelivery, {
          deliveryId: entityId,
          location: payload.location,
        });
        return { status: "SUCCESS", operationId };

      case "startTrip":
        await convexClient.mutation(api.deliveries.state_machine.startTrip, {
          deliveryId: entityId,
          location: payload.location,
        });
        return { status: "SUCCESS", operationId };

      case "arriveAtDropoff":
        await convexClient.mutation(api.deliveries.state_machine.arriveAtDropoff, {
          deliveryId: entityId,
          location: payload.location,
        });
        return { status: "SUCCESS", operationId };

      case "completeDelivery":
        await convexClient.mutation(api.deliveries.state_machine.completeDelivery, {
          deliveryId: entityId,
          location: payload.location,
          proofOfDelivery: payload.proofOfDelivery,
        });
        return { status: "SUCCESS", operationId };

      case "cancelDelivery":
        await convexClient.mutation(api.deliveries.state_machine.cancelDelivery, {
          deliveryId: entityId,
          reason: payload.reason,
        });
        return { status: "SUCCESS", operationId };

      case "updateLocation":
        await convexClient.mutation(api.tracking.mutations.updateDeliveryLocation, {
          deliveryId: entityId,
          location: {
            lat: payload.lat,
            lng: payload.lng,
            timestamp: payload.timestamp,
            accuracy: payload.accuracy,
            speed: payload.speed,
            heading: payload.heading,
          },
        });
        return { status: "SUCCESS", operationId };

      default:
        return {
          status: "INVALID",
          operationId,
          reason: `Unknown operation type: ${operationType}`,
        };
    }
  } catch (error: any) {
    // Parse Convex error to determine the result type
    const errorMessage = error?.message || String(error);

    // Check for duplicate operation
    if (errorMessage.includes("duplicate") || errorMessage.includes("already")) {
      return { status: "DUPLICATE", operationId };
    }

    // Check for conflict (delivery state changed)
    if (errorMessage.includes("conflict") || errorMessage.includes("state")) {
      return { status: "CONFLICT", operationId, reason: errorMessage };
    }

    // Check for invalid operation
    if (errorMessage.includes("invalid") || errorMessage.includes("not found")) {
      return { status: "INVALID", operationId, reason: errorMessage };
    }

    // Check for expired operation
    if (errorMessage.includes("expired")) {
      return { status: "EXPIRED", operationId };
    }

    // Generic error
    return { status: "ERROR", operationId, error: errorMessage };
  }
}

// ─── Sync Engine ──────────────────────────────────────────────────────────────

/**
 * Process a single operation with retry logic.
 */
async function processOperation(operation: StoredOperation): Promise<SyncResult> {
  // Check if operation is expired
  if (isOperationExpired(operation, SYNC_CONFIG.operationExpiryMs)) {
    await markOperationFailed(operation.operationId, "Operation expired");
    return { status: "EXPIRED", operationId: operation.operationId };
  }

  // Check if max retries exceeded
  if (hasExceededMaxRetries(operation, SYNC_CONFIG.maxRetries)) {
    await markOperationFailed(operation.operationId, "Max retries exceeded");
    return {
      status: "ERROR",
      operationId: operation.operationId,
      error: "Max retries exceeded",
    };
  }

  // Mark as syncing
  await markOperationSyncing(operation.operationId);

  // Execute the operation
  const result = await executeOperation(operation);

  // Handle result
  switch (result.status) {
    case "SUCCESS":
    case "DUPLICATE":
      await markOperationSynced(operation.operationId);
      break;

    case "CONFLICT":
    case "INVALID":
    case "EXPIRED":
      // These are terminal failures - don't retry
      await markOperationFailed(
        operation.operationId,
        result.status === "CONFLICT" ? result.reason :
        result.status === "INVALID" ? result.reason :
        "Operation expired"
      );
      break;

    case "ERROR":
      // Will be retried on next sync cycle
      await markOperationFailed(operation.operationId, result.error);
      break;
  }

  return result;
}

/**
 * Run a sync cycle.
 * Processes all pending operations sequentially.
 */
async function runSyncCycle(): Promise<SyncProgress> {
  if (isSyncRunning) {
    return { total: 0, completed: 0, failed: 0, current: null };
  }

  // Check connectivity
  const connectivity = getConnectivityState();
  if (connectivity === "OFFLINE") {
    return { total: 0, completed: 0, failed: 0, current: null };
  }

  isSyncRunning = true;
  setSyncingState(true);

  const operations = await getOperationsForSync();
  updatePendingOperationCount(operations.length);

  const progress: SyncProgress = {
    total: operations.length,
    completed: 0,
    failed: 0,
    current: null,
  };

  try {
    for (const operation of operations) {
      progress.current = operation.operationType;
      notifyProgress(progress);

      const result = await processOperation(operation);

      if (result.status === "SUCCESS" || result.status === "DUPLICATE") {
        progress.completed++;
      } else {
        progress.failed++;
      }

      updatePendingOperationCount(progress.total - progress.completed - progress.failed);
    }
  } finally {
    isSyncRunning = false;
    setSyncingState(false);
    progress.current = null;
    notifyProgress(progress);
  }

  return progress;
}

/**
 * Notify progress listeners.
 */
function notifyProgress(progress: SyncProgress): void {
  for (const listener of progressListeners) {
    try {
      listener(progress);
    } catch (error) {
      console.error("Sync progress listener error:", error);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the sync engine.
 * Begins periodic synchronization when online.
 */
export function startSyncEngine(): void {
  if (syncInterval) {
    return; // Already running
  }

  // Initial sync attempt
  runSyncCycle();

  // Set up periodic sync
  syncInterval = setInterval(() => {
    const connectivity = getConnectivityState();
    const interval = connectivity === "DEGRADED"
      ? SYNC_CONFIG.degradedSyncIntervalMs
      : SYNC_CONFIG.syncIntervalMs;

    runSyncCycle();
  }, SYNC_CONFIG.syncIntervalMs);
}

/**
 * Stop the sync engine.
 */
export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Trigger an immediate sync cycle.
 */
export async function triggerSync(): Promise<SyncProgress> {
  return runSyncCycle();
}

/**
 * Subscribe to sync progress updates.
 * Returns an unsubscribe function.
 */
export function onSyncProgress(listener: SyncProgressListener): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

/**
 * Get current sync status.
 */
export function getSyncStatus(): {
  isRunning: boolean;
  pendingCount: number;
} {
  return {
    isRunning: isSyncRunning,
    pendingCount: 0, // Would need to query IndexedDB
  };
}
