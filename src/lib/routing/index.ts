/**
 * Lasha Routing Service
 *
 * Main facade for all routing operations.
 * Handles provider selection, caching, fallback, and error handling.
 *
 * Usage:
 *   import { routingService } from "@/lib/routing";
 *   const route = await routingService.getRoute({ origin, destination });
 */

import {
  RoutingProvider,
  RoutingConfig,
  RouteRequest,
  RouteResult,
  Waypoint,
  TravelMode,
  RoutePreference,
  DistanceResult,
  OptimizeStopsRequest,
  OptimizedRoute,
  ProviderEvent,
} from "./types";
import { RoutingCache, createRoutingCache } from "./cache";
import { ProviderFallback, withRetry, withFallback } from "./errors";
import { GoogleMapsProvider } from "./providers/google-maps";
import { OSRMProvider } from "./providers/osrm";

// ─── Default Configuration ────────────────────────────────────────────────────

const DEFAULT_CONFIG: RoutingConfig = {
  providers: [
    {
      name: "google-maps",
      priority: 1,
      timeoutMs: 10000,
    },
    {
      name: "osrm",
      priority: 2,
      isFallback: true,
      timeoutMs: 15000,
    },
  ],
  cache: {
    enabled: true,
    routeTtlMs: 5 * 60 * 1000, // 5 minutes
    distanceTtlMs: 15 * 60 * 1000, // 15 minutes
    maxSize: 1000,
  },
  defaultTravelMode: "driving",
  defaultPreference: "fastest",
  globalTimeoutMs: 30000,
};

// ─── Service Implementation ───────────────────────────────────────────────────

export class RoutingService {
  private config: RoutingConfig;
  private providers: RoutingProvider[];
  private fallback: ProviderFallback;
  private cache: RoutingCache;
  private listeners: Set<(event: ProviderEvent) => void> = new Set();

  constructor(config: Partial<RoutingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.providers) {
      this.config.providers = config.providers;
    }
    if (config.cache) {
      this.config.cache = { ...DEFAULT_CONFIG.cache, ...config.cache };
    }

    // Initialize providers
    this.providers = this.initializeProviders();

    // Initialize fallback manager
    this.fallback = new ProviderFallback(
      this.config.providers,
      this.providers
    );

    // Initialize cache
    this.cache = createRoutingCache(this.config.cache);
  }

  /**
   * Subscribe to provider events for monitoring.
   */
  onEvent(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: ProviderEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Get a route between two points.
   * Implements caching, retry, and provider fallback.
   */
  async getRoute(request: RouteRequest): Promise<RouteResult> {
    const origin = request.origin;
    const destination = request.destination;
    const travelMode = request.travelMode ?? this.config.defaultTravelMode;

    // Check cache first
    const cached = this.cache.getRoute(origin, destination, travelMode);
    if (cached) {
      return cached;
    }

    const startTime = Date.now();

    try {
      // Try providers with fallback
      const availableProviders = this.fallback.getAvailableProviders();

      const { result, provider, errors } = await withFallback(
        availableProviders,
        async (p) => {
          this.emitEvent({
            type: "request",
            provider: p.name,
            operation: "getRoute",
          });

          const result = await withRetry(() => p.getRoute(request));

          this.emitEvent({
            type: "success",
            provider: p.name,
            operation: "getRoute",
            duration: Date.now() - startTime,
          });

          return result;
        }
      );

      // Cache the successful result
      this.cache.setRoute(origin, destination, travelMode, result);

      return result;
    } catch (error) {
      this.emitEvent({
        type: "error",
        provider: "all",
        operation: "getRoute",
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Get ETA between two points.
   */
  async getETA(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<{ duration: number; eta: number }> {
    const mode = travelMode ?? this.config.defaultTravelMode;

    // Check cache
    const cached = this.cache.getETA(origin, destination, mode);
    if (cached) {
      return cached;
    }

    const availableProviders = this.fallback.getAvailableProviders();

    const { result } = await withFallback(
      availableProviders,
      async (p) => {
        return p.getETA(origin, destination, mode);
      }
    );

    // Cache result
    this.cache.setETA(origin, destination, mode, result);

    return result;
  }

  /**
   * Calculate distance between two points.
   */
  async calculateDistance(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<DistanceResult> {
    const mode = travelMode ?? this.config.defaultTravelMode;

    // Check cache
    const cached = this.cache.getDistance(origin, destination, mode);
    if (cached) {
      return cached;
    }

    const availableProviders = this.fallback.getAvailableProviders();

    const { result } = await withFallback(
      availableProviders,
      async (p) => {
        return p.calculateDistance(origin, destination, mode);
      }
    );

    // Cache result
    this.cache.setDistance(origin, destination, mode, result);

    return result;
  }

  /**
   * Optimize multiple stops.
   */
  async optimizeStops(request: OptimizeStopsRequest): Promise<OptimizedRoute> {
    const travelMode = request.travelMode ?? this.config.defaultTravelMode;

    // Check cache
    const cached = this.cache.getOptimizedRoute(request.stops, travelMode);
    if (cached) {
      return cached;
    }

    const availableProviders = this.fallback.getAvailableProviders();

    const { result } = await withFallback(
      availableProviders,
      async (p) => {
        return p.optimizeStops(request);
      }
    );

    // Cache result
    this.cache.setOptimizedRoute(request.stops, travelMode, result);

    return result;
  }

  /**
   * Get cache statistics.
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get available providers.
   */
  getAvailableProviders(): string[] {
    return this.fallback.getAvailableProviders().map((p) => p.name);
  }

  /**
   * Get a specific provider by name.
   */
  getProvider(name: string): RoutingProvider | undefined {
    return this.providers.find((p) => p.name === name);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private initializeProviders(): RoutingProvider[] {
    const providers: RoutingProvider[] = [];

    for (const config of this.config.providers) {
      switch (config.name) {
        case "google-maps":
          providers.push(new GoogleMapsProvider(config));
          break;
        case "osrm":
          providers.push(new OSRMProvider(config));
          break;
        default:
          console.warn(`Unknown routing provider: ${config.name}`);
      }
    }

    return providers;
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

let defaultInstance: RoutingService | null = null;

/**
 * Get the default routing service instance.
 * Creates one if it doesn't exist.
 */
export function getRoutingService(config?: Partial<RoutingConfig>): RoutingService {
  if (!defaultInstance) {
    defaultInstance = new RoutingService(config);
  }
  return defaultInstance;
}

/**
 * Create a new routing service with custom configuration.
 */
export function createRoutingService(config: Partial<RoutingConfig>): RoutingService {
  return new RoutingService(config);
}

/**
 * Reset the default routing service (useful for testing).
 */
export function resetRoutingService(): void {
  defaultInstance = null;
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Get a route using the default service.
 */
export async function getRoute(request: RouteRequest): Promise<RouteResult> {
  return getRoutingService().getRoute(request);
}

/**
 * Get ETA using the default service.
 */
export async function getETA(
  origin: Waypoint,
  destination: Waypoint,
  travelMode?: TravelMode
): Promise<{ duration: number; eta: number }> {
  return getRoutingService().getETA(origin, destination, travelMode);
}

/**
 * Calculate distance using the default service.
 */
export async function calculateDistance(
  origin: Waypoint,
  destination: Waypoint,
  travelMode?: TravelMode
): Promise<DistanceResult> {
  return getRoutingService().calculateDistance(origin, destination, travelMode);
}

/**
 * Optimize stops using the default service.
 */
export async function optimizeStops(
  request: OptimizeStopsRequest
): Promise<OptimizedRoute> {
  return getRoutingService().optimizeStops(request);
}
