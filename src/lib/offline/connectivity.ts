/**
 * Lasha Connectivity Detection
 *
 * Monitors network connectivity and provides connectivity state.
 * Uses navigator.onLine plus active probing for more accurate detection.
 *
 * States:
 * - ONLINE: Connected and can reach Convex
 * - DEGRADED: Connected but with poor quality (high latency)
 * - OFFLINE: No network connection
 * - SYNCING: Currently synchronizing pending operations
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectivityState = "ONLINE" | "DEGRADED" | "OFFLINE" | "SYNCING";

export interface ConnectivityInfo {
  state: ConnectivityState;
  lastOnline: number | null;
  lastOffline: number | null;
  lastSync: number | null;
  pendingOperations: number;
  isSyncing: boolean;
}

export type ConnectivityListener = (state: ConnectivityState) => void;

// ─── Singleton State ──────────────────────────────────────────────────────────

let currentState: ConnectivityState = "ONLINE";
let lastOnline: number | null = Date.now();
let lastOffline: number | null = null;
let lastSync: number | null = null;
let pendingOperationCount: number = 0;
let isSyncing: boolean = false;

const listeners: Set<ConnectivityListener> = new Set();

// ─── Connectivity Detection ───────────────────────────────────────────────────

/**
 * Check if the browser reports being online.
 */
function isBrowserOnline(): boolean {
  return navigator.onLine;
}

/**
 * Active probe to check if Convex is reachable.
 * Uses a lightweight HEAD request to the Convex deployment.
 */
async function probeConvexConnectivity(): Promise<boolean> {
  try {
    // Use a simple fetch with timeout to check connectivity
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("/api/health", {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Determine the connectivity state based on browser state and probing.
 */
async function determineConnectivityState(): Promise<ConnectivityState> {
  if (!isBrowserOnline()) {
    return "OFFLINE";
  }

  if (isSyncing) {
    return "SYNCING";
  }

  // Browser says online, but let's verify with a probe
  const isReachable = await probeConvexConnectivity();

  if (!isReachable) {
    return "DEGRADED";
  }

  return "ONLINE";
}

/**
 * Update the connectivity state and notify listeners.
 */
async function updateConnectivityState(): Promise<void> {
  const newState = await determineConnectivityState();

  if (newState !== currentState) {
    const now = Date.now();

    if (newState === "ONLINE" || newState === "SYNCING") {
      lastOnline = now;
    } else if (newState === "OFFLINE") {
      lastOffline = now;
    }

    currentState = newState;
    notifyListeners(newState);
  }
}

/**
 * Notify all listeners of a state change.
 */
function notifyListeners(state: ConnectivityState): void {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.error("Connectivity listener error:", error);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize connectivity monitoring.
 * Call this once when the app starts.
 */
export function initConnectivityMonitoring(): void {
  // Listen for browser online/offline events
  window.addEventListener("online", () => {
    updateConnectivityState();
  });

  window.addEventListener("offline", () => {
    updateConnectivityState();
  });

  // Initial state check
  updateConnectivityState();

  // Periodic connectivity check (every 30 seconds)
  setInterval(() => {
    updateConnectivityState();
  }, 30000);
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
 * Set the syncing state.
 */
export function setSyncingState(syncing: boolean): void {
  isSyncing = syncing;
  if (syncing) {
    lastSync = Date.now();
  }
  updateConnectivityState();
}

/**
 * Force a connectivity check.
 */
export async function checkConnectivity(): Promise<ConnectivityState> {
  await updateConnectivityState();
  return currentState;
}

/**
 * Check if the app is currently online (simple boolean).
 */
export function isOnline(): boolean {
  return currentState === "ONLINE" || currentState === "SYNCING";
}

/**
 * Check if the app is offline.
 */
export function isOffline(): boolean {
  return currentState === "OFFLINE";
}

/**
 * Check if the app is in degraded state.
 */
export function isDegraded(): boolean {
  return currentState === "DEGRADED";
}
