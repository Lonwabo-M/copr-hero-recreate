/**
 * Lasha Routing Actions
 *
 * Convex actions for server-side routing operations.
 * These are used for:
 * - Operations requiring API keys (server-side only)
 * - Batch routing operations
 * - Routing with authenticated provider access
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { createLogger, LOG_CATEGORIES, generateCorrelationId } from "../logging/service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Waypoint {
  lat: number;
  lng: number;
  address?: string;
}

interface RouteRequest {
  origin: Waypoint;
  destination: Waypoint;
  waypoints?: Waypoint[];
  travelMode?: "driving" | "walking" | "cycling" | "transit";
  departureTime?: string | number;
}

interface RouteResult {
  routeId: string;
  provider: string;
  distance: number;
  duration: number;
  eta: number;
  geometry: string;
  legs: Array<{
    start: Waypoint;
    end: Waypoint;
    distance: number;
    duration: number;
  }>;
  warnings: Array<{
    type: string;
    message: string;
  }>;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Get a route between two points using server-side provider.
 */
export const getRoute = action({
  args: {
    origin: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
    }),
    waypoints: v.optional(
      v.array(
        v.object({
          lat: v.number(),
          lng: v.number(),
          address: v.optional(v.string()),
        })
      )
    ),
    travelMode: v.optional(
      v.union(
        v.literal("driving"),
        v.literal("walking"),
        v.literal("cycling"),
        v.literal("transit")
      )
    ),
  },
  handler: async (ctx, args) => {
    const log = createLogger(LOG_CATEGORIES.ROUTING);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    const provider = apiKey ? "google-maps" : "osrm";
    log.info(`Route request: ${provider}`, {
      operation: "getRoute",
      metadata: { provider },
    });

    try {
      if (!apiKey) {
        return await getRouteOSRM(args);
      }
      return await getRouteGoogle(args, apiKey);
    } catch (err) {
      log.error(`Routing failed: ${provider}`, {
        operation: "getRoute",
        error: err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: "UnknownError", message: String(err) },
      });
      throw err;
    }
  },
});

/**
 * Get ETA between two points.
 */
export const getETA = action({
  args: {
    origin: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
    }),
    travelMode: v.optional(
      v.union(
        v.literal("driving"),
        v.literal("walking"),
        v.literal("cycling"),
        v.literal("transit")
      )
    ),
  },
  handler: async (ctx, args) => {
    const route = await getRouteHandler({
      origin: args.origin,
      destination: args.destination,
      travelMode: args.travelMode,
    });

    return {
      duration: route.duration,
      eta: route.eta,
    };
  },
});

/**
 * Calculate distance between two points.
 */
export const calculateDistance = action({
  args: {
    origin: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
    }),
    destination: v.object({
      lat: v.number(),
      lng: v.number(),
      address: v.optional(v.string()),
    }),
    travelMode: v.optional(
      v.union(
        v.literal("driving"),
        v.literal("walking"),
        v.literal("cycling"),
        v.literal("transit")
      )
    ),
  },
  handler: async (ctx, args) => {
    const log = createLogger(LOG_CATEGORIES.ROUTING);
    // Calculate straight-line distance
    const straightLineDistance = haversineDistance(
      args.origin.lat,
      args.origin.lng,
      args.destination.lat,
      args.destination.lng
    );

    try {
      const route = await getRouteHandler({
        origin: args.origin,
        destination: args.destination,
        travelMode: args.travelMode,
      });

      log.info("Distance calculation completed", {
        operation: "calculateDistance",
        metadata: {
          routeDistance: route.distance,
          straightLineDistance,
          ratio: route.distance / straightLineDistance,
        },
      });

      return {
        straightLineDistance,
        routeDistance: route.distance,
        routeDuration: route.duration,
      };
    } catch (err) {
      // Graceful degradation: return straight-line distance
      log.warn("Routing failed, using straight-line distance", {
        operation: "calculateDistance",
        error: err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: "UnknownError", message: String(err) },
        metadata: { degraded: true, straightLineDistance },
      });
      return {
        straightLineDistance,
      };
    }
  },
});

// ─── Geocoding ────────────────────────────────────────────────────────────────

/**
 * Geocode an address string into lat/lng coordinates.
 *
 * Resolution strategy (server-side only, the key never leaves this process):
 * 1. Normalise the address (whitespace, SA country context).
 * 2. Google Maps Geocoding when GOOGLE_MAPS_API_KEY is configured, otherwise
 *    OpenStreetMap Nominatim — each tried across query variants.
 * 3. On total failure of the primary provider, the other provider is tried
 *    as an explicit fallback (two independent datasets disagree often
 *    enough that this materially improves resolution).
 * 4. If nothing resolves, throw a clean user-safe error.
 *
 * NEVER fabricates coordinates: a returned lat/lng always comes from the
 * provider for one of the user's own address variants.
 */
export const geocodeAddress = action({
  args: {
    address: v.string(),
  },
  returns: v.object({
    lat: v.number(),
    lng: v.number(),
    formattedAddress: v.string(),
  }),
  handler: async (ctx, args) => {
    const log = createLogger(LOG_CATEGORIES.ROUTING);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const variants = geocodeQueryVariants(args.address);

    const primary = apiKey
      ? (q: string) => geocodeGoogle(q, apiKey, log)
      : (q: string) => geocodeNominatim(q, log);
    const fallback = apiKey
      ? (q: string) => geocodeNominatim(q, log)
      : undefined;

    for (const provider of fallback ? [primary, fallback] : [primary]) {
      const label = apiKey && provider === primary ? "google-maps" : "nominatim";
      for (const variant of variants) {
        try {
          const result = await provider(variant);
          if (result) {
            log.info("Geocoding resolved", {
              operation: "geocodeAddress",
              metadata: { provider: label },
            });
            return result;
          }
        } catch (err) {
          // Provider HTTP/config failures are not "no results" — skip the
          // remaining variants and try the next provider immediately.
          if (err instanceof Error && /API error|error: \d/.test(err.message)) break;
        }
      }
    }

    log.error("Geocoding exhausted all providers/variants", {
      operation: "geocodeAddress",
      metadata: { attempts: variants.length },
    });
    // Single clean, user-safe failure — raw provider/Convex output never
    // reaches the client through this path.
    throw new Error(ADDRESS_UNRESOLVED);
  },
});

/** Country context applied to free-form addresses. Lasha is a South African
 *  delivery platform; most user-entered addresses omit the country, and both
 *  providers resolve far better with it. */
const DEFAULT_COUNTRY = "South Africa";

/** The single user-facing error thrown when an address genuinely cannot be
 *  resolved. Clean application-level copy — the UI maps this string instead
 *  of printing raw Convex/provider output. */
const ADDRESS_UNRESOLVED =
  "We could not find that address. Check the spelling, add a suburb and city, and try again.";

/**
 * Normalise a user-entered address for geocoding:
 * - collapse whitespace, strip trailing punctuation
 * - append the country when the address does not already mention it
 */
export function normalizeAddressForGeocoding(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim().replace(/[,;]+$/, "");
  if (!cleaned) return cleaned;
  if (cleaned.toLowerCase().includes(DEFAULT_COUNTRY.toLowerCase())) {
    return cleaned;
  }
  return `${cleaned}, ${DEFAULT_COUNTRY}`;
}

/**
 * Candidate query variants for an address, tried in order. Geocoders reject a
 * whole query when ONE token is unknown (a misspelt suburb like
 * "Lemeonkloof" poisons "333 Main Road, Lemeonkloof, The Towers"), so we
 * retry with single segments removed — each variant keeps the user's street
 * plus every other context segment, preserving precision.
 *
 * Precision floor: never collapse to a bare street + country — that could
 * silently resolve to a different city's street of the same name, which is
 * unsafe for courier routing.
 *
 * Every candidate is the USER's own address text — no fabricated coordinates,
 * no fabricated places. Capped to bound latency.
 */
export function geocodeQueryVariants(input: string): string[] {
  const base = normalizeAddressForGeocoding(input);
  const parts = base.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [base];

  // Last comma-separated token is the appended country (normalize guarantees
  // it, or the address already contained it — either way dropping ONE
  // locality segment while keeping the country preserves validity).
  const country = parts[parts.length - 1];
  const core = parts.slice(0, -1); // [street, ...context segments]
  const join = (segs: string[]) =>
    [...segs, country].filter(Boolean).join(", ");

  const variants = [base];
  const push = (v: string) => {
    if (!variants.includes(v) && variants.length < 10) variants.push(v);
  };

  // Drop the least-significant (last) context segment first — but only when
  // the street keeps at least one other context segment (never bare street).
  if (core.length > 2) push(join(core.slice(0, -1)));

  // Then drop each single context segment in turn (keeping the street):
  // tolerates ONE misspelt/unknown token anywhere in the address. Only when
  // at least one context segment always survives — a bare street + country
  // could silently resolve to the wrong city and is never attempted.
  if (core.length >= 3) {
    for (let i = 1; i < core.length; i++) {
      push(join([...core.slice(0, i), ...core.slice(i + 1)]));
    }
  }

  return variants;
}

async function geocodeGoogle(
  address: string,
  apiKey: string,
  log: ReturnType<typeof createLogger>
): Promise<{ lat: number; lng: number; formattedAddress: string }> {
  log.info("Geocoding via Google Maps", {
    operation: "geocodeAddress",
    metadata: { provider: "google-maps", address },
  });

  const params = new URLSearchParams({
    address,
    key: apiKey,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Google Geocoding API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== "OK" || !data.results || data.results.length === 0) {
    throw new Error(
      `Could not geocode address: ${data.error_message ?? data.status}`
    );
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}

async function geocodeNominatim(
  address: string,
  log: ReturnType<typeof createLogger>
): Promise<{ lat: number; lng: number; formattedAddress: string }> {
  log.info("Geocoding via Nominatim (fallback)", {
    operation: "geocodeAddress",
    metadata: { provider: "nominatim", address },
  });

  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        "User-Agent": "Lasha/1.0 (delivery-platform)",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Nominatim API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error(
      `Could not geocode address: no results found for "${address}"`
    );
  }

  const result = data[0];
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    formattedAddress: result.display_name,
  };
}

// ─── Internal Handlers ────────────────────────────────────────────────────────

async function getRouteHandler(request: RouteRequest): Promise<RouteResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    return getRouteGoogle(request, apiKey);
  }

  return getRouteOSRM(request);
}

async function getRouteGoogle(
  request: RouteRequest,
  apiKey: string
): Promise<RouteResult> {
  const params = new URLSearchParams({
    origin: formatWaypoint(request.origin),
    destination: formatWaypoint(request.destination),
    key: apiKey,
    mode: request.travelMode ?? "driving",
  });

  if (request.waypoints && request.waypoints.length > 0) {
    const waypointStr = request.waypoints.map(formatWaypoint).join("|");
    params.set("waypoints", waypointStr);
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
    throw new Error(data.error_message ?? `No route found: ${data.status}`);
  }

  const route = data.routes[0];
  const legs = route.legs.map((leg: any) => ({
    start: { lat: leg.start_location.lat, lng: leg.start_location.lng },
    end: { lat: leg.end_location.lat, lng: leg.end_location.lng },
    distance: leg.distance.value,
    duration: leg.duration.value,
  }));

  const totalDistance = legs.reduce(
    (sum: number, leg: any) => sum + leg.distance,
    0
  );
  const totalDuration = legs.reduce(
    (sum: number, leg: any) => sum + leg.duration,
    0
  );

  return {
    routeId: `gmaps-${Date.now()}`,
    provider: "google-maps",
    distance: totalDistance,
    duration: totalDuration,
    eta: Date.now() + totalDuration * 1000,
    geometry: route.overview_polyline.points,
    legs,
    warnings: (route.warnings ?? []).map((w: string) => ({
      type: "congestion",
      message: w,
    })),
  };
}

async function getRouteOSRM(request: RouteRequest): Promise<RouteResult> {
  const coords = [
    `${request.origin.lng},${request.origin.lat}`,
    ...(request.waypoints?.map((wp) => `${wp.lng},${wp.lat}`) ?? []),
    `${request.destination.lng},${request.destination.lat}`,
  ].join(";");

  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "false",
  });

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coords}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`OSRM API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error(`No route found: ${data.code}`);
  }

  const route = data.routes[0];
  const legs = route.legs.map((leg: any, idx: number) => {
    const allWaypoints = [request.origin, ...(request.waypoints ?? []), request.destination];
    return {
      start: allWaypoints[idx],
      end: allWaypoints[idx + 1],
      distance: leg.distance,
      duration: leg.duration,
    };
  });

  // Convert GeoJSON to encoded polyline
  const geometry = encodePolyline(
    route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
      lat,
      lng,
    }))
  );

  return {
    routeId: `osrm-${Date.now()}`,
    provider: "osrm",
    distance: route.distance,
    duration: route.duration,
    eta: Date.now() + route.duration * 1000,
    geometry,
    legs,
    warnings: [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWaypoint(wp: Waypoint): string {
  if (wp.address) return wp.address;
  return `${wp.lat},${wp.lng}`;
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let result = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);

    result += encodeValue(lat - prevLat);
    result += encodeValue(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return result;
}

function encodeValue(value: number): string {
  let result = "";
  let shiftedValue = value << 1;

  if (value < 0) {
    shiftedValue = ~shiftedValue;
  }

  while (shiftedValue >= 0x20) {
    result += String.fromCharCode((shiftedValue & 0x1f) | 0x20);
    shiftedValue >>= 5;
  }

  result += String.fromCharCode(shiftedValue);
  return result;
}
