/**
 * Lasha Routing React Hooks
 *
 * React hooks for integrating routing functionality into components.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  RouteRequest,
  RouteResult,
  Waypoint,
  TravelMode,
  DistanceResult,
  OptimizeStopsRequest,
  OptimizedRoute,
  RoutingError,
} from "@/lib/routing/types";
import { getRoutingService, RoutingService } from "@/lib/routing";

// ─── Use Route Hook ───────────────────────────────────────────────────────────

interface UseRouteState {
  route: RouteResult | null;
  isLoading: boolean;
  error: RoutingError | null;
}

/**
 * Hook for fetching a route between two points.
 */
export function useRoute() {
  const [state, setState] = useState<UseRouteState>({
    route: null,
    isLoading: false,
    error: null,
  });
  const requestIdRef = useRef(0);

  const fetchRoute = useCallback(async (request: RouteRequest) => {
    const requestId = ++requestIdRef.current;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const service = getRoutingService();
      const route = await service.getRoute(request);

      // Only update if this is still the latest request
      if (requestId === requestIdRef.current) {
        setState({ route, isLoading: false, error: null });
      }

      return route;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState({
          route: null,
          isLoading: false,
          error: error as RoutingError,
        });
      }
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setState({ route: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    fetchRoute,
    reset,
  };
}

// ─── Use ETA Hook ─────────────────────────────────────────────────────────────

interface UseETAState {
  eta: { duration: number; eta: number } | null;
  isLoading: boolean;
  error: RoutingError | null;
}

/**
 * Hook for fetching ETA between two points.
 */
export function useETA() {
  const [state, setState] = useState<UseETAState>({
    eta: null,
    isLoading: false,
    error: null,
  });
  const requestIdRef = useRef(0);

  const fetchETA = useCallback(
    async (
      origin: Waypoint,
      destination: Waypoint,
      travelMode?: TravelMode
    ) => {
      const requestId = ++requestIdRef.current;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const service = getRoutingService();
        const eta = await service.getETA(origin, destination, travelMode);

        if (requestId === requestIdRef.current) {
          setState({ eta, isLoading: false, error: null });
        }

        return eta;
      } catch (error) {
        if (requestId === requestIdRef.current) {
          setState({
            eta: null,
            isLoading: false,
            error: error as RoutingError,
          });
        }
        throw error;
      }
    },
    []
  );

  const reset = useCallback(() => {
    requestIdRef.current++;
    setState({ eta: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    fetchETA,
    reset,
  };
}

// ─── Use Distance Hook ────────────────────────────────────────────────────────

interface UseDistanceState {
  distance: DistanceResult | null;
  isLoading: boolean;
  error: RoutingError | null;
}

/**
 * Hook for calculating distance between two points.
 */
export function useDistance() {
  const [state, setState] = useState<UseDistanceState>({
    distance: null,
    isLoading: false,
    error: null,
  });
  const requestIdRef = useRef(0);

  const calculate = useCallback(
    async (
      origin: Waypoint,
      destination: Waypoint,
      travelMode?: TravelMode
    ) => {
      const requestId = ++requestIdRef.current;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const service = getRoutingService();
        const distance = await service.calculateDistance(
          origin,
          destination,
          travelMode
        );

        if (requestId === requestIdRef.current) {
          setState({ distance, isLoading: false, error: null });
        }

        return distance;
      } catch (error) {
        if (requestId === requestIdRef.current) {
          setState({
            distance: null,
            isLoading: false,
            error: error as RoutingError,
          });
        }
        throw error;
      }
    },
    []
  );

  const reset = useCallback(() => {
    requestIdRef.current++;
    setState({ distance: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    calculate,
    reset,
  };
}

// ─── Use Optimize Stops Hook ──────────────────────────────────────────────────

interface UseOptimizeStopsState {
  optimizedRoute: OptimizedRoute | null;
  isLoading: boolean;
  error: RoutingError | null;
}

/**
 * Hook for optimizing multiple stops.
 */
export function useOptimizeStops() {
  const [state, setState] = useState<UseOptimizeStopsState>({
    optimizedRoute: null,
    isLoading: false,
    error: null,
  });
  const requestIdRef = useRef(0);

  const optimize = useCallback(async (request: OptimizeStopsRequest) => {
    const requestId = ++requestIdRef.current;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const service = getRoutingService();
      const optimizedRoute = await service.optimizeStops(request);

      if (requestId === requestIdRef.current) {
        setState({ optimizedRoute, isLoading: false, error: null });
      }

      return optimizedRoute;
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setState({
          optimizedRoute: null,
          isLoading: false,
          error: error as RoutingError,
        });
      }
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setState({ optimizedRoute: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    optimize,
    reset,
  };
}

// ─── Use Routing Service Hook ─────────────────────────────────────────────────

/**
 * Hook that provides access to the routing service.
 * Useful when you need direct access to the service.
 */
export function useRoutingService(): RoutingService {
  return getRoutingService();
}

// ─── Use Debounced Route Hook ─────────────────────────────────────────────────

interface UseDebouncedRouteOptions {
  /** Debounce delay in milliseconds */
  delay?: number;
  /** Auto-fetch on mount if origin/destination are provided */
  autoFetch?: boolean;
}

/**
 * Hook for debounced route fetching.
 * Useful for search-as-you-type or map interactions.
 */
export function useDebouncedRoute(options: UseDebouncedRouteOptions = {}) {
  const { delay = 500, autoFetch = false } = options;
  const [origin, setOrigin] = useState<Waypoint | null>(null);
  const [destination, setDestination] = useState<Waypoint | null>(null);
  const { route, isLoading, error, fetchRoute, reset } = useRoute();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!origin || !destination) {
      return;
    }

    if (!autoFetch && !origin && !destination) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      fetchRoute({ origin, destination });
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [origin, destination, delay, autoFetch, fetchRoute]);

  const updateOrigin = useCallback((newOrigin: Waypoint | null) => {
    setOrigin(newOrigin);
  }, []);

  const updateDestination = useCallback((newDestination: Waypoint | null) => {
    setDestination(newDestination);
  }, []);

  const resetAll = useCallback(() => {
    setOrigin(null);
    setDestination(null);
    reset();
  }, [reset]);

  return {
    origin,
    destination,
    route,
    isLoading,
    error,
    updateOrigin,
    updateDestination,
    reset: resetAll,
  };
}
