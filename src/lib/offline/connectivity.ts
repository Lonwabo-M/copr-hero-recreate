/**
 * Lasha Connectivity Detection
 *
 * Driver-facing connectivity state. Does NOT trust `navigator.onLine` alone:
 * a browser can report "online" while Convex is unreachable (captive portals,
 * Wi-Fi without internet). After the browser comes back online, the state
 * probes the Convex deployment's existing /health endpoint and only reports
 * ONLINE when Convex actually responds.
 *
 * States (documented in docs/offline-driver.md):
 *  - ONLINE         navigator online AND Convex reachable
 *  - OFFLINE        navigator offline (or probe failure while navigator online → still OFFLINE for the driver: the app cannot reach Convex)
 *  - RECONNECTING   browser came back online; Convex reachability being re-verified
 *  - SYNCING        connected, and a sync cycle is replaying buffered operations
 *  - SYNC_COMPLETE  last sync cycle finished with nothing left to retry
 *  - SYNC_ERROR     last sync cycle finished with items still pending (recoverable failure)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectivityState =
  | "ONLINE"
  | "OFFLINE"
  | "RECONNECTING"
  | "SYNCING"
  | "SYNC_COMPLETE"
  | "SYNC_ERROR";

export interface ConnectivityInfo {
  state: ConnectivityState;
  lastOnline: number | null;
  lastOffline: number | null;
  lastSync: number | null;
  pendingOperations: number;
  isSyncing: boolean;
  /** Error from the last failed sync cycle, if any (recoverable). */
  lastSyncError?: string;
}

export type ConnectivityListener = (state: ConnectivityState) => void;

// ─── Singleton State ──────────────────────────────────────────────────────────

let currentState: ConnectivityState = "ONLINE";
let lastOnline: number | null = Date.now();
let lastOffline: number | null = null;
let lastSync: number | null = null;
let pendingOperationCount: number = 0;
let isSyncing: boolean = false;
let lastSyncError: string | undefined = undefined;
let monitoringInitialized = false;

const listeners: Set<ConnectivityListener> = new Set();

// ─── Convex Reachability Probe ────────────────────────────────────────────────

/**
 * Probe the existing Convex /health http action (no new backend).
 * Returns true only when Convex actually responds.
 */
async function probeConvexConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch("/health", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

// ─── State Derivation ─────────────────────────────────────────────────────────

function setState(next: ConnectivityState): void {
  if (next === currentState) return;
  const now = Date.now();

  if (next === "ONLINE" || next === "SYNCING" || next === "SYNC_COMPLETE") {
    lastOnline = now;
  } else if (next === "OFFLINE") {
    lastOffline = now;
  }

  currentState = next;
  notifyListeners(currentState);
}

function notifyListeners(state: ConnectivityState): void {
  for (const listener of listeners) {
    try {
      listener(state);
  } catch (error) {
      console.error("Connectivity listener error:", error);
    }
  }
}

/**
 * Verify actual Convex reachability after the browser reports online.
 * Only called from the `online` event (RECONNECTING verification) and the
 * periodic check while nominally online.
 */
async function verifyOnline(): Promise<void> {
  // While a sync is running, SYNCING wins (it implies connectivity).
  if (isSyncing) return;

  setState("RECONNECTING");
  const reachable = await probeConvexConnectivity();
  if (isSyncing) return; // A sync may have started during the probe.
  setState(reachable ? "ONLINE" : "OFFLINE");
}

// ─── Public API ───────────────────────────────────────── States ──────────────

/**
 * Initialize connectivity monitoring.
 * Call once when the driver app mounts. Idempotent.
 */
export function initConnectivityMonitoring(): void {
  if (monitoringInitialized) return;
  monitoringInitialized = true;

  window.addEventListener("online", () => {
    setState("RECONNECTING");
    void verifyOnline();
  });

  window.addEventListener("offline", () => {
    setState("OFFLINE");
  });

  // Periodic verification while nominally online (probe failure → OFFLINE).
  window.setInterval(() => {
    if (!navigator.onLine) {
      setState("OFFLINE");
      return;
    }
    if (isSyncing) return;
    void verifyOnline();
  }, 30_000);

  void verifyOnline();
}

/**
 * Get the current connectivity state.
 */
export function getConnectivityState(): ConnectivityState {
  return currentState;
}

/**
 * Get detailed connectivity information.
 */
export function getConnectivityInfo(): ConnectivityInfo {
  return {
    state: currentState,
    lastOnline,
    lastOffline,
    lastSync,
    pendingOperations: pendingOperationCount,
    isSyncing,
    lastSyncError,
  };
}

/**
 * Subscribe to connectivity state changes.
 * Returns an unsubscribe function.
 */
export function onConnectivityChange(listener: ConnectivityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Update the pending operation count (for UI display).
 */
export function updatePendingOperationCount(count: number): void {
  pendingOperationCount = count;
}

/**
 * Called by the sync engine at the START of a cycle.
 */
export function beginSyncCycle(): void {
  isSyncing = true;
  setState("SYNCING");
}

/**
 * Called by the sync engine at the END of a cycle with the outcome.
 */
export function endSyncCycle(outcome: { failed: boolean; error?: string }): void {
  isSyncing = false;
  lastSync = Date.now();
  lastSyncError = outcome.error;
  setState(
    outcome.failed
      ? "SYNC_ERROR"
      : pendingOperationCount === 0
        ? "SYNC_COMPLETE"
        : "SYNC_ERROR"
  );
}

/**
 * Check if the app is currently online (boolean convenience).
 * Note: ONLINE / SYNCING / SYNC_COMPLETE all imply Convex reachability.
 */
export function isOnline(): boolean {
  return currentState === "ONLINE" || currentState === "SYNCING";
}

/**
 * Check if the app is offline for the driver's purposes (cannot reach Convex).
 */
export function isOffline(): boolean {
  return currentState === "OFFLINE" || currentState === "RECONNECTING";
}

/**
 * Force a connectivity verification (returns the resulting state).
 */
export async function checkConnectivity(): Promise<ConnectivityState> {
  if (!navigator.onLine) {
    setState("OFFLINE");
    return currentState;
  }
  await verifyOnline();
  return currentState;
}
