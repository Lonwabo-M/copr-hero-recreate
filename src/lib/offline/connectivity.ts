/**
 * Lasha Connectivity Detection
 *
 * Driver-facing connectivity state. Does NOT trust `navigator.onLine` alone:
 * a browser can report "online" while Convex is unreachable (captive portals,
 * Wi-Fi without internet).
 *
 * Convex reachability is observed from the ACTUAL Convex client connection
 * (`useConvexConnectionState` → `isWebSocketConnected` / `connectionRetries`),
 * bridged into this module by the Driver App shell via `reportConvexConnection`.
 * This is the honest signal: it reflects whether Convex itself is reachable,
 * not whether some server answered a fetch. (A previous implementation
 * fetched a Convex /health http action from the app origin — but http actions
 * live on the Convex deployment URL, so the SPA fallback answered the probe
 * and the app claimed ONLINE while Convex was down. Removed.)
 *
 * States (documented in docs/offline-driver.md):
 *  - ONLINE         navigator online AND the Convex client's WebSocket is connected
 *  - OFFLINE        navigator offline, or Convex connection lost (including connectionRetries > 0 while nominal-online)
 *  - RECONNECTING   browser came back online; Convex connection not yet re-established
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

// ─── Convex Connection Bridge ─────────────────────────────────────────────────

/** Last Convex connection observation reported by the React bridge. */
let convexConnected: boolean | null = null;

/**
 * Bridge the Convex client's real connection state into this module.
 * Called by a small React observer hook that subscribes to
 * `useConvexConnectionState()` in the Driver App. `connected` is the
 * client's `isWebSocketConnected` observation; `hasEverConnected`/
 * `connectionRetries` disambiguate the initial pre-connection window
 * (treated as CONNECTING, not ONLINE — the driver must not be told the
 * app is synced to Convex before the WebSocket has ever opened).
 */
export function reportConvexConnection(connected: boolean, hasEverConnected: boolean): void {
  convexConnected = connected;

  // navigator offline always wins — the OS says there is no network.
  if (!navigator.onLine) {
    setState("OFFLINE");
    return;
  }
  if (isSyncing) return; // SYNCING implies connectivity; don't downgrade mid-cycle.

  if (connected) {
    setState("ONLINE");
  } else {
    setState(hasEverConnected ? "RECONNECTING" : "OFFLINE");
  }
}

/**
 * Derive the current state from browser + Convex connection observations.
 * Used at initialization before the first bridge report arrives.
 */
function deriveStateFromBrowser(): ConnectivityState {
  if (!navigator.onLine) return "OFFLINE";
  if (convexConnected === true) return "ONLINE";
  // Convex not yet observed: treat as OFFLINE until the client proves the
  // connection. A brief OFFLINE indicator that resolves on connect is honest;
  // a false ONLINE that hides a dead connection is not.
  return "OFFLINE";
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

// ─── Public API ───────────────────────────────────────── States ──────────────

/**
 * Initialize connectivity monitoring.
 * Call once when the driver app mounts. Idempotent.
 *
 * Convex reachability is NOT probed with HTTP here — it arrives via
 * `reportConvexConnection` from the Convex client observer. The browser
 * `online`/`offline` events alone only ever move the state between OFFLINE
 * and the last Convex-observed reality; the Convex WebSocket state is the
 * authority for "the app can actually reach Convex".
 */
export function initConnectivityMonitoring(): void {
  if (monitoringInitialized) return;
  monitoringInitialized = true;

  window.addEventListener("online", () => {
    // Browser network returned. Convex reconnection is observed separately by
    // the client bridge (reportConvexConnection) — re-derive optimistically.
    setState(deriveStateFromBrowser());
  });

  window.addEventListener("offline", () => {
    setState("OFFLINE");
  });

  // Belt-and-braces: if the browser silently drops its network without firing
  // `offline` (observed on some mobile browsers), reconcile with reality.
  window.setInterval(() => {
    if (!navigator.onLine) {
      setState("OFFLINE");
    }
  }, 30_000);

  setState(deriveStateFromBrowser());
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
 * Force a connectivity re-derivation (returns the resulting state).
 * The Convex client bridge keeps the underlying observation current; this
 * simply re-applies it (e.g. before executing a connectivity-required
 * mutation) so the guard reflects the latest known reality.
 */
export function checkConnectivity(): ConnectivityState {
  if (!navigator.onLine) {
    setState("OFFLINE");
    return currentState;
  }
  // Re-apply the latest Convex observation (reportConvexConnection is the
  // source of Convex truth; deriveStateFromBrowser reapplies it).
  const observed = deriveStateFromBrowser();
  if (observed === "OFFLINE" && currentState !== "OFFLINE") {
    setState("OFFLINE");
  }
  return currentState;
}
