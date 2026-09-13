/**
 * Lasha Offline React Hooks
 *
 * Offline resilience hooks for the Driver App.
 *
 * OFFLINE-SAFETY MODEL (docs/offline-driver.md):
 * - GPS location fixes may be buffered offline (the only queueable operation).
 * - Offer accept/reject, delivery state transitions, POD submission and any
 *   financial action REQUIRE live connectivity — they are concurrency-
 *   sensitive and the server must confirm current state at execution time.
 *   The hooks below therefore expose a `requireOnline` guard instead of an
 *   offline mutation queue.
 * - Connectivity state reflects ACTUAL Convex reachability (the Convex
 *   client's WebSocket connection state), not merely navigator.onLine.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useConvex, useConvexConnectionState } from "convex/react";
import {
  getConnectivityState,
  getConnectivityInfo,
  onConnectivityChange,
  checkConnectivity,
  reportConvexConnection,
  initConnectivityMonitoring,
  ConnectivityState,
  ConnectivityInfo,
} from "@/lib/offline/connectivity";
import {
  countPendingOperationsForDelivery,
} from "@/lib/offline/operations";
import {
  processLocation,
  syncBufferedLocationsForDelivery,
  getBufferedCountForDelivery,
  discardBufferForDelivery,
} from "@/lib/offline/gps";
import {
  onSyncProgress,
  startSyncEngine,
  type SyncProgress,
} from "@/lib/offline/sync";
// ─── Use Convex Connection Bridge ─────────────────────────────────────────────

/**
 * Observes the real Convex client connection and reports it into the offline
 * connectivity module. Mount once in the Driver App (DriverShell) so every
 * offline component sees Convex's actual WebSocket reachability, not just
 * navigator.onLine.
 */
export function useConvexConnectionBridge(): void {
  const connection = useConvexConnectionState();
  const { isWebSocketConnected, hasEverConnected } = connection;
  useEffect(() => {
    reportConvexConnection(isWebSocketConnected, hasEverConnected);
  }, [isWebSocketConnected, hasEverConnected]);
}

// ─── Use Sync Engine (app-lifecycle sync driver) ──────────────────────────────

/**
 * Starts the offline sync engine once per Driver App mount with the
 * authenticated Convex executor. The engine retries buffered GPS on
 * connectivity return, tab re-focus, and a periodic check, with bounded
 * backoff after failures. Idempotent per mount.
 */
export function useSyncEngine(): void {
  const convex = useConvex();
  const executorRef = useRef(convex);
  executorRef.current = convex;

  useEffect(() => {
    initConnectivityMonitoring();
    const stop = startSyncEngine((mutation, args) =>
      executorRef.current.mutation(mutation as never, args as never)
    );
    return stop;
  }, []);
}

export function useConnectivity(): {
  state: ConnectivityState;
  isOnline: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  info: ConnectivityInfo;
} {
  const [state, setState] = useState<ConnectivityState>(getConnectivityState());
  const [info, setInfo] = useState<ConnectivityInfo>(getConnectivityInfo());

  useEffect(() => {
    const unsubscribe = onConnectivityChange((newState) => {
      setState(newState);
      setInfo(getConnectivityInfo());
    });

    return unsubscribe;
  }, []);

  return {
    state,
    isOnline: state === "ONLINE" || state === "SYNCING" || state === "SYNC_COMPLETE",
    isOffline: state === "OFFLINE" || state === "RECONNECTING",
    isSyncing: state === "SYNCING",
    info,
  };
}

// ─── Use Require Online (mutation guard) ─────────────────────────────────────

/**
 * Guard hook for connectivity-required operations (offer accept/reject,
 * delivery state transitions, POD submission). `run` refuses to execute the
 * mutation while offline and explains why, so the UI never needs its own
 * network check and the server never receives an offline-replayed
 * concurrency-sensitive mutation.
 */
export function useRequireOnline(): {
  /** True when the app can currently reach Convex. */
  isOnline: boolean;
  state: ConnectivityState;
  /** Explanation shown to the driver when blocked. */
  offlineMessage: string;
  /**
   * Execute a connectivity-required operation. Rejects with the offline
   * message when offline; otherwise runs the provided executor.
   */
  run: <T>(operation: () => Promise<T>) => Promise<T>;
} {
  const { isOnline, state } = useConnectivity();

  const offlineMessage =
    "You're offline. This action needs a connection — your location is still being saved and will sync when you're back online.";

  const run = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      // Re-verify at execution time — React state may be stale by a few ms
      // and connectivity can change between render and tap. The check reads
      // the Convex client's observed connection state (bridged via
      // reportConvexConnection), not merely navigator.onLine.
      const current = checkConnectivity();
      if (current === "OFFLINE" || current === "RECONNECTING") {
        throw new Error(offlineMessage);
      }
      return operation();
    },
    [offlineMessage]
  );

  return { isOnline, state, offlineMessage, run };
}

// ─── Use Offline GPS (buffer + sync) ──────────────────────────────────────────

/**
 * Offline GPS buffering for one active delivery, layered on the driver
 * tracking hook's fixes. Online → no-op (live path). Offline → bounded,
 * delivery-bound buffer that syncs automatically when connectivity returns.
 */
export function useOfflineGPS(deliveryId: string | null): {
  /** Number of points currently buffered for this delivery. */
  bufferedCount: number;
  /** Current sync progress, when a cycle is running or just finished. */
  progress: SyncProgress | null;
  /** Manually trigger a sync pass (e.g. a "Retry now" button). */
  retrySync: () => Promise<void>;
} {
  const convex = useConvex();
  const [bufferedCount, setBufferedCount] = useState(0);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const { state } = useConnectivity();
  const executorRef = useRef(convex);
  executorRef.current = convex;

  useEffect(() => {
    initConnectivityMonitoring();
  }, []);

  useEffect(() => {
    const unsubscribe = onSyncProgress((p) => setProgress(p));
    return unsubscribe;
  }, []);

  const refreshCount = useCallback(async () => {
    if (!deliveryId) {
      setBufferedCount(0);
      return;
    }
    try {
      setBufferedCount(await getBufferedCountForDelivery(deliveryId));
    } catch {
      // IndexedDB may be unavailable (private mode) — buffering degrades to
      // no-op; never blocks the live tracking path.
      setBufferedCount(0);
    }
  }, [deliveryId]);

  useEffect(() => {
    void refreshCount();
    // Poll the small count while offline so the indicator stays accurate.
    const interval = setInterval(() => void refreshCount(), 5000);
    return () => clearInterval(interval);
  }, [refreshCount, state]);

  // Auto-sync on connectivity return (the sync engine also does this; this
  // local attempt makes the per-delivery count refresh deterministic).
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!deliveryId) return;
    if (state === "OFFLINE" || state === "RECONNECTING") {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current && (state === "ONLINE" || state === "SYNCING")) {
      wasOffline.current = false;
      void syncBufferedLocationsForDelivery(deliveryId, (mutation, args) =>
        executorRef.current.mutation(mutation as never, args as never)
      ).then(() => refreshCount());
    }
  }, [state, deliveryId, refreshCount]);

  const retrySync = useCallback(async () => {
    if (!deliveryId) return;
    await syncBufferedLocationsForDelivery(deliveryId, (mutation, args) =>
      executorRef.current.mutation(mutation as never, args as never)
    );
    await refreshCount();
  }, [deliveryId, refreshCount]);

  return { bufferedCount, progress, retrySync };
}

/**
 * Read-only buffered count for one delivery (for pages that only display
 * status, e.g. Active Delivery). Lighter than the full useOfflineGPS hook.
 */
export function useOfflineGPSCount(deliveryId: string | null): number {
  const [count, setCount] = useState(0);
  const { state } = useConnectivity();

  useEffect(() => {
    if (!deliveryId) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      getBufferedCountForDelivery(deliveryId)
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deliveryId, state]);

  return count;
}

/**
 * Buffer one GPS fix for an active delivery while offline.
 * Online → no-op. Exposed for the tracking hook integration.
 */
export function bufferLocationOffline(
  deliveryId: string,
  lat: number,
  lng: number,
  timestamp: number,
  accuracy?: number
): Promise<{ buffered: boolean; sampled: boolean }> {
  return processLocation(deliveryId, lat, lng, timestamp, accuracy);
}

/**
 * Discard a delivery's buffered points (call on terminal delivery state).
 */
export function clearDeliveryOfflineBuffer(deliveryId: string): Promise<number> {
  return discardBufferForDelivery(deliveryId);
}

// ─── Use Offline Driver Status (aggregate indicator state) ────────────────────

export type DriverOfflineStatus = {
  state: ConnectivityState;
  isOffline: boolean;
  isSyncing: boolean;
  /** Human-facing status line for the indicator. */
  label: string;
  /** Detail line (buffer count, last error) for the indicator. */
  detail?: string;
  /** Whether the indicator should present an error/recoverable styling. */
  isError: boolean;
};

/**
 * Aggregate connectivity + buffer state into the driver indicator model.
 */
export function useDriverOfflineStatus(bufferedCount: number): DriverOfflineStatus {
  const { state, info } = useConnectivity();

  return useMemo(() => {
    const base: DriverOfflineStatus = {
      state,
      isOffline: state === "OFFLINE" || state === "RECONNECTING",
      isSyncing: state === "SYNCING",
      label: "",
      isError: state === "SYNC_ERROR",
    };

    switch (state) {
      case "ONLINE":
        base.label = "Online";
        if (bufferedCount > 0) {
          base.label = "Online — syncing pending";
          base.detail = `${bufferedCount} location${bufferedCount === 1 ? "" : "s"} pending`;
        }
        break;
      case "OFFLINE":
        base.label = "Offline — location buffered";
        base.detail =
          bufferedCount > 0
            ? `${bufferedCount} location${bufferedCount === 1 ? "" : "s"} saved on this device`
            : "Actions need a connection";
        break;
      case "RECONNECTING":
        base.label = "Reconnecting…";
        break;
      case "SYNCING":
        base.label = "Syncing buffered locations…";
        break;
      case "SYNC_COMPLETE":
        base.label = "Sync complete";
        break;
      case "SYNC_ERROR":
        base.label = "Sync issue — will retry";
        base.detail = info.lastSyncError ?? `${bufferedCount} location${bufferedCount === 1 ? "" : "s"} still pending`;
        break;
    }

    return base;
  }, [state, info.lastSyncError, bufferedCount]);
}
