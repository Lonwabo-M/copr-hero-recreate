/**
 * Lasha Synchronization Engine
 *
 * Replays buffered offline operations through the app's AUTHENTICATED Convex
 * client when connectivity returns. Convex remains authoritative: the server
 * validates every replayed operation exactly as a live one.
 *
 * OFFLINE-SAFETY MODEL (docs/offline-driver.md):
 * The only queueable operation is buffered GPS (`updateLocation`). Offer
 * accept/reject, delivery state transitions, and POD submission are
 * concurrency-sensitive and are never queued — the sync engine refuses them
 * defensively even if a malformed record appears in IndexedDB.
 *
 * Sync protocol per buffered GPS point:
 *   1. ordered replay (oldest first) through updateDeliveryLocation
 *   2. accepted  → remove from queue
 *   3. authoritatively rejected (stale/invalid/terminal) → remove (accepted
 *      decision, retrying can never succeed)
 *   4. transient failure → retain, retry with bounded backoff
 *
 * Retry behaviour: an interval-driven engine with per-delivery sync locking
 * (no overlapping cycles), bounded backoff after failures, and sync
 * triggered by (a) connectivity transitions, (b) the periodic check, and
 * (c) app visibility changes (tab re-focus).
 */

import { getOperationsForSync, discardOperation, type StoredOperation } from "./operations";
import {
  syncBufferedLocationsForDelivery,
  discardStaleBufferedLocations,
  type ConvexExecutor,
  type GpsSyncResult,
} from "./gps";
import {
  beginSyncCycle,
  endSyncCycle,
  updatePendingOperationCount,
  getConnectivityState,
  onConnectivityChange,
} from "./connectivity";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncProgress {
  total: number;
  synced: number;
  discarded: number;
  retrying: number;
  current: string | null;
  lastError?: string;
}

export type SyncProgressListener = (progress: SyncProgress) => void;

// ─── Configuration ────────────────────────────────────────────────────────────

const SYNC_CONFIG = {
  /** Delay before the next attempt after a failed cycle (ms). */
  baseRetryDelay: 30_000,

  /** Maximum backoff delay (ms) — no tight retry loops. */
  maxRetryDelay: 5 * 60_000,

  /** Periodic sync check while the driver app is open (ms). */
  syncIntervalMs: 30_000,
} as const;

// ─── Sync State ───────────────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setInterval> | null = null;
let backoffUntil = 0;
let consecutiveFailures = 0;
const progressListeners: Set<SyncProgressListener> = new Set();
/** One sync attempt per delivery at a time (no overlapping cycles). */
const inFlightDeliveries = new Set<string>();

// ─── Progress Notification ────────────────────────────────────────────────────

function notifyProgress(progress: SyncProgress): void {
  for (const listener of progressListeners) {
    try {
      listener(progress);
    } catch (error) {
      console.error("[offline-sync] progress listener error:", error);
    }
  }
}

// ─── Defensive Refusal of Unsafe Operation Types ──────────────────────────────

/**
 * The sync engine only ever replays buffered GPS. Any other operation type
 * found in the queue is malformed (impossible via the public queue API) and
 * is refused + removed rather than executed.
 */
async function purgeUnsafeOperations(operations: StoredOperation[]): Promise<number> {
  let purged = 0;
  for (const op of operations) {
    if (op.operationType !== "updateLocation") {
      console.warn(
        `[offline-sync] refusing unsafe offline operation "${op.operationType}" (${op.operationId}) — delivery mutations require live connectivity`
      );
      await discardOperation(op.operationId);
      purged++;
    }
  }
  return purged;
}

// ─── Sync Cycle ───────────────────────────────────────────────────────────────

/**
 * Run one sync pass across all deliveries that have buffered points.
 * `executor` is the authenticated Convex client's mutation function.
 */
export async function runSyncCycle(executor: ConvexExecutor): Promise<SyncProgress> {
  const progress: SyncProgress = {
    total: 0,
    synced: 0,
    discarded: 0,
    retrying: 0,
    current: null,
  };

  // Never sync while offline; respect bounded backoff after failures.
  const connectivity = getConnectivityState();
  if (connectivity === "OFFLINE") {
    return progress;
  }
  if (Date.now() < backoffUntil) {
    return progress;
  }

  // Retention first: drop points the server's timestamp validation would
  // reject anyway (bounded storage, no pointless replays).
  await discardStaleBufferedLocations();

  const operations = await getOperationsForSync();
  await purgeUnsafeOperations(operations);

  // Group by delivery — each delivery's points replay in order, isolated.
  const byDelivery = new Map<string, StoredOperation[]>();
  for (const op of operations) {
    const list = byDelivery.get(op.entityId) ?? [];
    list.push(op);
    byDelivery.set(op.entityId, list);
  }

  progress.total = operations.length;

  if (operations.length === 0) {
    updatePendingOperationCount(0);
    consecutiveFailures = 0;
    backoffUntil = 0;
    // Nothing left to replay — surface an explicit all-clear to the UI.
    endSyncCycle({ failed: false });
    return progress;
  }

  beginSyncCycle();
  let cycleHadFailure = false;

  try {
    for (const [deliveryId] of byDelivery) {
      // Cross-delivery isolation + no overlapping cycles per delivery.
      if (inFlightDeliveries.has(deliveryId)) {
        continue;
      }
      inFlightDeliveries.add(deliveryId);
      progress.current = deliveryId;
      notifyProgress(progress);

      let result: GpsSyncResult;
      try {
        result = await syncBufferedLocationsForDelivery(deliveryId, executor);
      } finally {
        inFlightDeliveries.delete(deliveryId);
      }

      progress.synced += result.synced;
      progress.discarded += result.discarded;
      progress.retrying += result.retrying;
      if (result.lastError) {
        progress.lastError = result.lastError;
        cycleHadFailure = cycleHadFailure || result.retrying > 0;
      }
    }
  } finally {
    updatePendingOperationCount(progress.retrying);
    endSyncCycle({ failed: cycleHadFailure, error: progress.lastError });
    progress.current = null;
    notifyProgress(progress);
  }

  // Bounded exponential backoff only after real failures.
  if (cycleHadFailure) {
    consecutiveFailures++;
    const delay = Math.min(
      SYNC_CONFIG.baseRetryDelay * Math.pow(2, consecutiveFailures - 1),
      SYNC_CONFIG.maxRetryDelay
    );
    backoffUntil = Date.now() + delay;
  } else {
    consecutiveFailures = 0;
    backoffUntil = 0;
  }

  return progress;
}

// ─── Engine Lifecycle ─────────────────────────────────────────────────────────

/**
 * Start the sync engine with the authenticated Convex executor.
 * Idempotent: repeated calls (e.g. remounts) do not create duplicate timers
 * or listeners.
 */
export function startSyncEngine(executor: ConvexExecutor): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const attempt = () => {
    void runSyncCycle(executor).catch((error) => {
      console.error("[offline-sync] sync cycle error:", error);
    });
  };

  const handleConnectivity = (state: string) => {
    if (state === "ONLINE") {
      attempt(); // Sync immediately on reconnect.
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      attempt(); // Tab re-focus — cheap opportunistic retry.
    }
  };

  attempt();
  timer = setInterval(attempt, SYNC_CONFIG.syncIntervalMs);
  const unsubscribeConnectivity = onConnectivityChange(handleConnectivity);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    if (timer) clearInterval(timer);
    unsubscribeConnectivity();
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

/**
 * Trigger an immediate sync pass (manual retry).
 */
export async function triggerSync(executor: ConvexExecutor): Promise<SyncProgress> {
  backoffUntil = 0; // Manual retry overrides backoff.
  return runSyncCycle(executor);
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
