/**
 * Lasha Offline React Hooks
 *
 * React hooks for integrating offline functionality into components.
 * Provides:
 * - Connectivity state
 * - Pending operation management
 * - Offline-aware mutations
 * - GPS tracking with offline support
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getConnectivityState,
  getConnectivityInfo,
  onConnectivityChange,
  ConnectivityState,
  ConnectivityInfo,
} from "@/lib/offline/connectivity";
import {
  queueOperation,
  OperationType,
  getOperationStats,
} from "@/lib/offline/operations";
import {
  triggerSync,
  onSyncProgress,
  SyncProgress,
} from "@/lib/offline/sync";
import {
  startTracking,
  stopTracking,
  isTrackingActive,
  getBufferCount,
  processLocation,
} from "@/lib/offline/gps";

// ─── Use Connectivity Hook ────────────────────────────────────────────────────

/**
 * Hook to track connectivity state.
 */
export function useConnectivity(): {
  state: ConnectivityState;
  isOnline: boolean;
  isOffline: boolean;
  isDegraded: boolean;
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
    isOnline: state === "ONLINE",
    isOffline: state === "OFFLINE",
    isDegraded: state === "DEGRADED",
    isSyncing: state === "SYNCING",
    info,
  };
}

// ─── Use Pending Operations Hook ──────────────────────────────────────────────

/**
 * Hook to track pending operations count.
 */
export function usePendingOperations(): {
  count: number;
  refresh: () => Promise<void>;
} {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const stats = await getOperationStats();
    setCount(stats.pending);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { count, refresh };
}

// ─── Use Offline Mutation Hook ────────────────────────────────────────────────

/**
 * Hook for mutations that work offline.
 * Queues operations when offline, executes immediately when online.
 */
export function useOfflineMutation(): {
  execute: (
    operationType: OperationType,
    entityId: string,
    payload: Record<string, any>,
    onlineMutation?: () => Promise<void>
  ) => Promise<{ queued: boolean; operationId?: string }>;
  isExecuting: boolean;
} {
  const [isExecuting, setIsExecuting] = useState(false);
  const { isOnline } = useConnectivity();

  const execute = useCallback(
    async (
      operationType: OperationType,
      entityId: string,
      payload: Record<string, any>,
      onlineMutation?: () => Promise<void>
    ) => {
      setIsExecuting(true);

      try {
        if (isOnline && onlineMutation) {
          // Execute immediately when online
          await onlineMutation();
          return { queued: false };
        } else {
          // Queue for later when offline
          const operationId = await queueOperation(
            operationType,
            entityId,
            payload
          );
          return { queued: true, operationId };
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [isOnline]
  );

  return { execute, isExecuting };
}

// ─── Use Sync Hook ────────────────────────────────────────────────────────────

/**
 * Hook for manual sync triggering and progress tracking.
 */
export function useSync(): {
  triggerSync: () => Promise<SyncProgress>;
  progress: SyncProgress | null;
  isSyncing: boolean;
} {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = onSyncProgress((newProgress) => {
      setProgress(newProgress);
      setIsSyncing(newProgress.current !== null);
    });

    return unsubscribe;
  }, []);

  const trigger = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await triggerSync();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return { triggerSync: trigger, progress, isSyncing };
}

// ─── Use GPS Tracking Hook ────────────────────────────────────────────────────

/**
 * Hook for GPS tracking with offline support.
 */
export function useGPSTracking(deliveryId?: string): {
  isTracking: boolean;
  bufferCount: number;
  startTracking: () => void;
  stopTracking: () => void;
  lastLocation: { lat: number; lng: number; timestamp: number } | null;
} {
  const [isTracking, setIsTracking] = useState(false);
  const [bufferCount, setBufferCount] = useState(0);
  const [lastLocation, setLastLocation] = useState<{
    lat: number;
    lng: number;
    timestamp: number;
  } | null>(null);

  const start = useCallback(() => {
    if (isTrackingActive()) {
      return;
    }

    startTracking(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: position.timestamp,
        };
        setLastLocation(location);

        // Update buffer count periodically
        getBufferCount().then(setBufferCount);
      },
      (error) => {
        console.error("GPS tracking error:", error);
      }
    );

    setIsTracking(true);
  }, []);

  const stop = useCallback(() => {
    stopTracking();
    setIsTracking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTrackingActive()) {
        stopTracking();
      }
    };
  }, []);

  return {
    isTracking,
    bufferCount,
    startTracking: start,
    stopTracking: stop,
    lastLocation,
  };
}

// ─── Use Offline Status Hook ──────────────────────────────────────────────────

/**
 * Hook that provides a human-readable offline status message.
 */
export function useOfflineStatus(): {
  message: string;
  type: "info" | "warning" | "error" | "success";
  showSyncButton: boolean;
} {
  const { state, info } = useConnectivity();

  if (state === "SYNCING") {
    return {
      message: "Syncing data...",
      type: "info",
      showSyncButton: false,
    };
  }

  if (state === "OFFLINE") {
    return {
      message: info.pendingOperations > 0
        ? `${info.pendingOperations} changes saved locally — waiting for connection`
        : "You are offline",
      type: "warning",
      showSyncButton: false,
    };
  }

  if (state === "DEGRADED") {
    return {
      message: "Connection unstable",
      type: "warning",
      showSyncButton: true,
    };
  }

  // ONLINE
  if (info.pendingOperations > 0) {
    return {
      message: `Syncing ${info.pendingOperations} pending changes...`,
      type: "info",
      showSyncButton: false,
    };
  }

  return {
    message: "Connected",
    type: "success",
    showSyncButton: false,
  };
}

// ─── Use Offline-Aware Query Hook ─────────────────────────────────────────────

/**
 * Hook that provides cached data when offline.
 * Falls back to cached data when Convex query returns undefined (loading) or null (error).
 */
export function useOfflineQuery<T>(
  queryResult: T | undefined | null,
  cacheKey: string
): {
  data: T | null;
  isFromCache: boolean;
  isStale: boolean;
} {
  const [cachedData, setCachedData] = useState<T | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Update cache when we have fresh data
  useEffect(() => {
    if (queryResult !== undefined && queryResult !== null) {
      setCachedData(queryResult);
      setIsFromCache(false);

      // Store in localStorage for simple caching
      try {
        localStorage.setItem(`lasha-cache-${cacheKey}`, JSON.stringify(queryResult));
      } catch {
        // Ignore storage errors
      }
    }
  }, [queryResult, cacheKey]);

  // Load from cache when offline
  useEffect(() => {
    if (queryResult === undefined || queryResult === null) {
      try {
        const cached = localStorage.getItem(`lasha-cache-${cacheKey}`);
        if (cached) {
          setCachedData(JSON.parse(cached));
          setIsFromCache(true);
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [queryResult, cacheKey]);

  return {
    data: queryResult ?? cachedData,
    isFromCache,
    isStale: isFromCache && queryResult === null,
  };
}
