/**
 * Lasha Routing Cache
 *
 * In-memory cache for routing results.
 * Uses LRU eviction and configurable TTLs.
 */

import {
  RouteResult,
  DistanceResult,
  OptimizedRoute,
  Waypoint,
  TravelMode,
  RoutingCacheConfig,
  CacheEvent,
} from "./types";

// ─── Cache Entry Types ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

// ─── Cache Implementation ─────────────────────────────────────────────────────

export class RoutingCache {
  private routeCache: Map<string, CacheEntry<RouteResult>> = new Map();
  private distanceCache: Map<string, CacheEntry<DistanceResult>> = new Map();
  private etaCache: Map<string, CacheEntry<{ duration: number; eta: number }>> =
    new Map();
  private optimizeCache: Map<string, CacheEntry<OptimizedRoute>> = new Map();

  private config: Required<RoutingCacheConfig>;
  private listeners: Set<(event: CacheEvent) => void> = new Set();

  constructor(config: RoutingCacheConfig) {
    this.config = {
      enabled: config.enabled,
      routeTtlMs: config.routeTtlMs ?? 5 * 60 * 1000, // 5 minutes
      distanceTtlMs: config.distanceTtlMs ?? 15 * 60 * 1000, // 15 minutes
      maxSize: config.maxSize ?? 1000,
    };
  }

  /**
   * Subscribe to cache events for monitoring.
   */
  onEvent(listener: (event: CacheEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: CacheEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Generate a cache key for route requests.
   */
  private generateKey(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): string {
    const o = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
    const d = `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
    const mode = travelMode ?? "driving";
    return `route:${o}:${d}:${mode}`;
  }

  /**
   * Generate a cache key for distance requests.
   */
  private generateDistanceKey(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): string {
    return this.generateKey(origin, destination, travelMode);
  }

  /**
   * Generate a cache key for optimization requests.
   */
  private generateOptimizeKey(stops: Waypoint[], travelMode?: TravelMode): string {
    const sorted = [...stops]
      .map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`)
      .sort();
    const mode = travelMode ?? "driving";
    return `optimize:${sorted.join(";")}:${mode}`;
  }

  /**
   * Get a cached route.
   */
  getRoute(origin: Waypoint, destination: Waypoint, travelMode?: TravelMode): RouteResult | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(origin, destination, travelMode);
    const entry = this.routeCache.get(key);

    if (!entry) {
      this.emit({ type: "miss", key });
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.routeCache.delete(key);
      this.emit({ type: "miss", key });
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.emit({ type: "hit", key, provider: entry.value.provider });
    return entry.value;
  }

  /**
   * Set a cached route.
   */
  setRoute(
    origin: Waypoint,
    destination: Waypoint,
    travelMode: TravelMode | undefined,
    result: RouteResult
  ): void {
    if (!this.config.enabled) return;

    const key = this.generateKey(origin, destination, travelMode);
    const now = Date.now();

    this.routeCache.set(key, {
      value: result,
      expiresAt: now + this.config.routeTtlMs,
      accessCount: 1,
      lastAccessed: now,
    });

    this.evictIfNeeded(this.routeCache);
    this.emit({ type: "set", key, provider: result.provider });
  }

  /**
   * Get cached distance result.
   */
  getDistance(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): DistanceResult | null {
    if (!this.config.enabled) return null;

    const key = this.generateDistanceKey(origin, destination, travelMode);
    const entry = this.distanceCache.get(key);

    if (!entry) {
      this.emit({ type: "miss", key });
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.distanceCache.delete(key);
      this.emit({ type: "miss", key });
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.emit({ type: "hit", key });
    return entry.value;
  }

  /**
   * Set cached distance result.
   */
  setDistance(
    origin: Waypoint,
    destination: Waypoint,
    travelMode: TravelMode | undefined,
    result: DistanceResult
  ): void {
    if (!this.config.enabled) return;

    const key = this.generateDistanceKey(origin, destination, travelMode);
    const now = Date.now();

    this.distanceCache.set(key, {
      value: result,
      expiresAt: now + this.config.distanceTtlMs,
      accessCount: 1,
      lastAccessed: now,
    });

    this.evictIfNeeded(this.distanceCache);
    this.emit({ type: "set", key });
  }

  /**
   * Get cached ETA.
   */
  getETA(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): { duration: number; eta: number } | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(origin, destination, travelMode);
    const entry = this.etaCache.get(key);

    if (!entry) {
      this.emit({ type: "miss", key });
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.etaCache.delete(key);
      this.emit({ type: "miss", key });
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.emit({ type: "hit", key });
    return entry.value;
  }

  /**
   * Set cached ETA.
   */
  setETA(
    origin: Waypoint,
    destination: Waypoint,
    travelMode: TravelMode | undefined,
    result: { duration: number; eta: number }
  ): void {
    if (!this.config.enabled) return;

    const key = this.generateKey(origin, destination, travelMode);
    const now = Date.now();

    this.etaCache.set(key, {
      value: result,
      expiresAt: now + this.config.routeTtlMs,
      accessCount: 1,
      lastAccessed: now,
    });

    this.evictIfNeeded(this.etaCache);
    this.emit({ type: "set", key });
  }

  /**
   * Get cached optimized route.
   */
  getOptimizedRoute(stops: Waypoint[], travelMode?: TravelMode): OptimizedRoute | null {
    if (!this.config.enabled) return null;

    const key = this.generateOptimizeKey(stops, travelMode);
    const entry = this.optimizeCache.get(key);

    if (!entry) {
      this.emit({ type: "miss", key });
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.optimizeCache.delete(key);
      this.emit({ type: "miss", key });
      return null;
    }

    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.emit({ type: "hit", key });
    return entry.value;
  }

  /**
   * Set cached optimized route.
   */
  setOptimizedRoute(stops: Waypoint[], travelMode: TravelMode | undefined, result: OptimizedRoute): void {
    if (!this.config.enabled) return;

    const key = this.generateOptimizeKey(stops, travelMode);
    const now = Date.now();

    this.optimizeCache.set(key, {
      value: result,
      expiresAt: now + this.config.routeTtlMs,
      accessCount: 1,
      lastAccessed: now,
    });

    this.evictIfNeeded(this.optimizeCache);
    this.emit({ type: "set", key });
  }

  /**
   * Evict oldest entries when cache exceeds max size.
   */
  private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size <= this.config.maxSize) return;

    // Sort by last accessed (oldest first)
    const entries = Array.from(cache.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    );

    // Remove oldest 10%
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      const [key] = entries[i];
      cache.delete(key);
      this.emit({ type: "evict", key });
    }
  }

  /**
   * Clear all caches.
   */
  clear(): void {
    this.routeCache.clear();
    this.distanceCache.clear();
    this.etaCache.clear();
    this.optimizeCache.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    routes: number;
    distances: number;
    etas: number;
    optimizations: number;
  } {
    return {
      routes: this.routeCache.size,
      distances: this.distanceCache.size,
      etas: this.etaCache.size,
      optimizations: this.optimizeCache.size,
    };
  }
}

/**
 * Create a routing cache with default configuration.
 */
export function createRoutingCache(config: RoutingCacheConfig): RoutingCache {
  return new RoutingCache(config);
}
