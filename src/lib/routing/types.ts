/**
 * Lasha Routing Types
 *
 * Normalized types for routing operations.
 * All routing providers must convert their results to these types.
 */

// ─── Core Types ───────────────────────────────────────────────────────────────

/** Geographic coordinate */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Waypoint with optional metadata */
export interface Waypoint extends LatLng {
  /** Human-readable address */
  address?: string;
  /** Unique identifier for this waypoint */
  id?: string;
}

/** Travel mode for routing */
export type TravelMode = "driving" | "walking" | "cycling" | "transit";

/** Route preference */
export type RoutePreference =
  | "fastest"
  | "shortest"
  | "eco"
  | "balanced"
  | "avoid_tolls"
  | "avoid_highways";

// ─── Request Types ────────────────────────────────────────────────────────────

/** Single route request */
export interface RouteRequest {
  /** Origin waypoint */
  origin: Waypoint;
  /** Destination waypoint */
  destination: Waypoint;
  /** Optional intermediate waypoints */
  waypoints?: Waypoint[];
  /** Travel mode (default: driving) */
  travelMode?: TravelMode;
  /** Route preference (default: fastest) */
  preference?: RoutePreference;
  /** Request departure time (ISO 8601 or timestamp) */
  departureTime?: string | number;
  /** Avoid specific road features */
  avoid?: string[];
  /** Language for turn-by-turn instructions */
  language?: string;
  /** Units for distances */
  units?: "metric" | "imperial";
}

/** Multi-stop route optimization request */
export interface OptimizeStopsRequest {
  /** Starting location (depot) */
  depot: Waypoint;
  /** List of stops to optimize */
  stops: Waypoint[];
  /** Return to depot after last stop */
  returnToDepot?: boolean;
  /** Vehicle capacity constraints */
  capacity?: {
    maxWeight?: number;
    maxVolume?: number;
    maxStops?: number;
  };
  /** Time windows for each stop */
  timeWindows?: Array<{
    stopId?: string;
    earliest: string | number;
    latest: string | number;
  }>;
  /** Travel mode */
  travelMode?: TravelMode;
}

// ─── Response Types ───────────────────────────────────────────────────────────

/** Normalized route result from any provider */
export interface RouteResult {
  /** Unique route identifier */
  routeId: string;
  /** Provider that generated this result */
  provider: string;
  /** Total distance in meters */
  distance: number;
  /** Total duration in seconds */
  duration: number;
  /** Estimated time of arrival (timestamp) */
  eta: number;
  /** Route geometry as encoded polyline */
  geometry: string;
  /** Route legs (segments between waypoints) */
  legs: RouteLeg[];
  /** Turn-by-turn instructions */
  steps: RouteStep[];
  /** Any warnings or notices */
  warnings: RouteWarning[];
  /** Route bounding box */
  bounds: {
    northeast: LatLng;
    southwest: LatLng;
  };
  /** Raw provider response (for debugging) */
  raw?: unknown;
}

/** A leg of a route (between two waypoints) */
export interface RouteLeg {
  /** Starting waypoint */
  start: Waypoint;
  /** Ending waypoint */
  end: Waypoint;
  /** Distance in meters */
  distance: number;
  /** Duration in seconds */
  duration: number;
  /** Departure time */
  departureTime?: number;
  /** Arrival time */
  arrivalTime?: number;
}

/** Turn-by-turn instruction step */
export interface RouteStep {
  /** Step index */
  index: number;
  /** Instruction text */
  instruction: string;
  /** Distance for this step (meters) */
  distance: number;
  /** Duration for this step (seconds) */
  duration: number;
  /** Start location of this step */
  startLocation: LatLng;
  /** End location of this step */
  endLocation: LatLng;
  /** Road name */
  roadName?: string;
  /** Maneuver type */
  maneuver: ManeuverType;
}

/** Maneuver types for navigation */
export type ManeuverType =
  | "depart"
  | "turn-left"
  | "turn-right"
  | "turn-slight-left"
  | "turn-slight-right"
  | "turn-sharp-left"
  | "turn-sharp-right"
  | "uturn"
  | "continue"
  | "roundabout"
  | "exit-roundabout"
  | "merge"
  | "fork-left"
  | "fork-right"
  | "arrive"
  | "new-name"
  | "roundabout-clockwise"
  | "roundabout-counterclockwise";

/** Route warning or notice */
export interface RouteWarning {
  /** Warning type */
  type: "toll" | "highway" | "unpaved" | "ferry" | "restricted" | "closure" | "congestion";
  /** Human-readable description */
  message: string;
  /** Affected route segment index */
  affectedStep?: number;
}

/** Distance/duration calculation result */
export interface DistanceResult {
  /** Straight-line distance (Haversine) in meters */
  straightLineDistance: number;
  /** Route distance in meters (if routing was used) */
  routeDistance?: number;
  /** Route duration in seconds (if routing was used) */
  routeDuration?: number;
}

/** Optimized stop order result */
export interface OptimizedRoute {
  /** Original request */
  request: OptimizeStopsRequest;
  /** Optimized order of stop indices */
  optimizedOrder: number[];
  /** Optimized waypoints (with IDs mapped back) */
  stops: Waypoint[];
  /** Total distance in meters */
  totalDistance: number;
  /** Total duration in seconds */
  totalDuration: number;
  /** Individual route segments between consecutive stops */
  segments: RouteResult[];
  /** Per-stop arrival estimates */
  arrivalEstimates: Array<{
    stopId?: string;
    estimatedArrival: number;
    eta: number;
  }>;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

/** Routing error codes */
export type RoutingErrorCode =
  | "PROVIDER_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_ORIGIN"
  | "INVALID_DESTINATION"
  | "NO_ROUTE_FOUND"
  | "GEOCODE_FAILED"
  | "NETWORK_ERROR"
  | "CACHE_ERROR"
  | "UNKNOWN";

/** Structured routing error */
export interface RoutingError {
  /** Error code */
  code: RoutingErrorCode;
  /** Human-readable message */
  message: string;
  /** Provider that failed */
  provider: string;
  /** Whether this is retryable */
  retryable: boolean;
  /** Original error from provider */
  originalError?: unknown;
}

// ─── Configuration Types ──────────────────────────────────────────────────────

/** Provider configuration */
export interface RoutingProviderConfig {
  /** Provider name */
  name: string;
  /** API key (if required) */
  apiKey?: string;
  /** Base URL for API calls */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Rate limit (requests per minute) */
  rateLimitPerMinute?: number;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Whether this is the fallback provider */
  isFallback?: boolean;
}

/** Caching configuration */
export interface RoutingCacheConfig {
  /** Enable caching */
  enabled: boolean;
  /** TTL for route results in milliseconds */
  routeTtlMs?: number;
  /** TTL for distance calculations in milliseconds */
  distanceTtlMs?: number;
  /** Maximum cache size */
  maxSize?: number;
}

/** Main routing service configuration */
export interface RoutingConfig {
  /** Ordered list of providers to try */
  providers: RoutingProviderConfig[];
  /** Caching settings */
  cache: RoutingCacheConfig;
  /** Default travel mode */
  defaultTravelMode?: TravelMode;
  /** Default route preference */
  defaultPreference?: RoutePreference;
  /** Global request timeout (ms) */
  globalTimeoutMs?: number;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

/**
 * RoutingProvider interface.
 *
 * All routing providers must implement this interface.
 * The implementation should be stateless and idempotent.
 */
export interface RoutingProvider {
  /** Provider name */
  readonly name: string;

  /** Whether this provider is available (API key set, etc.) */
  isAvailable(): boolean;

  /** Get a route between two points */
  getRoute(request: RouteRequest): Promise<RouteResult>;

  /** Get ETA between two points */
  getETA(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<{ duration: number; eta: number }>;

  /** Calculate distance between two points */
  calculateDistance(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<DistanceResult>;

  /** Optimize multiple stops */
  optimizeStops(
    request: OptimizeStopsRequest
  ): Promise<OptimizedRoute>;
}

// ─── Event Types ──────────────────────────────────────────────────────────────

/** Cache event for monitoring */
export interface CacheEvent {
  type: "hit" | "miss" | "set" | "evict" | "error";
  key: string;
  provider?: string;
  duration?: number;
}

/** Provider event for monitoring */
export interface ProviderEvent {
  type: "request" | "success" | "error" | "timeout" | "rate_limited";
  provider: string;
  operation: string;
  duration?: number;
  error?: RoutingError;
}
