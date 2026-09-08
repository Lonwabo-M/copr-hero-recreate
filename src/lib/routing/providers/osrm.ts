/**
 * Lasha OSRM Routing Provider
 *
 * Implements the RoutingProvider interface using OSRM (Open Source Routing Machine).
 * This is a free, open-source fallback provider.
 *
 * Uses the public OSRM demo server or a self-hosted instance.
 */

import {
  RoutingProvider,
  RouteRequest,
  RouteResult,
  RouteLeg,
  RouteStep,
  Waypoint,
  LatLng,
  TravelMode,
  DistanceResult,
  OptimizeStopsRequest,
  OptimizedRoute,
  ManeuverType,
  RoutingProviderConfig,
} from "../types";
import { classifyError, createTimeoutController } from "../errors";

// ─── OSRM Response Types ──────────────────────────────────────────────────────

interface OSRMRouteResponse {
  code: string;
  routes: OSRMRoute[];
  waypoints: OSRMWaypoint[];
}

interface OSRMRoute {
  geometry: { coordinates: Array<[number, number]>; type: string };
  legs: OSRMLeg[];
  distance: number;
  duration: number;
  weight: number;
  weight_name: string;
}

interface OSRMLeg {
  summary: string;
  distance: number;
  duration: number;
  weight: number;
  steps: OSRMStep[];
}

interface OSRMStep {
  geometry: { coordinates: Array<[number, number]>; type: string };
  maneuver: {
    bearing_after: number;
    bearing_before: number;
    location: [number, number];
    modifier?: string;
    type: string;
  };
  name: string;
  distance: number;
  duration: number;
  weight: number;
}

interface OSRMWaypoint {
  hint: string;
  distance: number;
  name: string;
  location: [number, number];
}

// ─── Provider Implementation ──────────────────────────────────────────────────

export class OSRMProvider implements RoutingProvider {
  readonly name = "osrm";
  private config: RoutingProviderConfig;
  private baseUrl: string;

  constructor(config: RoutingProviderConfig) {
    this.config = {
      timeoutMs: 15000, // OSRM can be slower
      baseUrl: "https://router.project-osrm.org",
      ...config,
    };
    this.baseUrl = this.config.baseUrl ?? "https://router.project-osrm.org";
  }

  isAvailable(): boolean {
    // OSRM public server doesn't require an API key
    return true;
  }

  async getRoute(request: RouteRequest): Promise<RouteResult> {
    const coordinates = this.buildCoordinates(request);

    // OSRM uses overview=full for polyline
    const params = new URLSearchParams({
      overview: "full",
      geometries: "geojson",
      steps: "true",
      annotations: "true",
    });

    // Add alternatives
    params.set("alternatives", "false");

    const profile = this.getProfile(request.travelMode);
    const url = `${this.baseUrl}/route/v1/${profile}/${coordinates}?${params.toString()}`;

    const controller = createTimeoutController(this.config.timeoutMs!);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OSRMRouteResponse = await response.json();

      if (data.code !== "Ok") {
        throw new Error(`OSRM error: ${data.code}`);
      }

      if (!data.routes || data.routes.length === 0) {
        throw new Error("No route found");
      }

      return this.normalizeRoute(data.routes[0], request);
    } catch (error) {
      throw classifyError(error, this.name);
    }
  }

  async getETA(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<{ duration: number; eta: number }> {
    const result = await this.getRoute({
      origin,
      destination,
      travelMode,
    });

    return {
      duration: result.duration,
      eta: result.eta,
    };
  }

  async calculateDistance(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<DistanceResult> {
    const straightLineDistance = this.haversineDistance(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );

    try {
      const route = await this.getRoute({
        origin,
        destination,
        travelMode,
      });

      return {
        straightLineDistance,
        routeDistance: route.distance,
        routeDuration: route.duration,
      };
    } catch {
      return {
        straightLineDistance,
      };
    }
  }

  async optimizeStops(request: OptimizeStopsRequest): Promise<OptimizedRoute> {
    const allWaypoints = [request.depot, ...request.stops];
    if (request.returnToDepot) {
      allWaypoints.push(request.depot);
    }

    // OSRM's trip endpoint can optimize multiple stops
    if (allWaypoints.length <= 26) {
      return this.optimizeWithTripEndpoint(request, allWaypoints);
    }

    // Fallback: just use provided order
    return this.optimizeWithSequentialRoutes(request, allWaypoints);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private buildCoordinates(request: RouteRequest): string {
    // OSRM expects coordinates as lng,lat (note: reversed!)
    const coords: string[] = [];

    coords.push(`${request.origin.lng},${request.origin.lat}`);

    if (request.waypoints) {
      for (const wp of request.waypoints) {
        coords.push(`${wp.lng},${wp.lat}`);
      }
    }

    coords.push(`${request.destination.lng},${request.destination.lat}`);

    return coords.join(";");
  }

  private getProfile(travelMode?: TravelMode): string {
    const profileMap: Record<TravelMode, string> = {
      driving: "driving",
      walking: "walking",
      cycling: "cycling",
      transit: "driving", // OSRM doesn't support transit
    };
    return profileMap[travelMode ?? "driving"] ?? "driving";
  }

  private normalizeRoute(
    osrmRoute: OSRMRoute,
    request: RouteRequest
  ): RouteResult {
    const legs: RouteLeg[] = osrmRoute.legs.map((leg, idx) => ({
      start: idx === 0
        ? request.origin
        : request.waypoints?.[idx - 1] ?? request.origin,
      end:
        idx === osrmRoute.legs.length - 1
          ? request.destination
          : request.waypoints?.[idx] ?? request.destination,
      distance: leg.distance,
      duration: leg.duration,
    }));

    const steps: RouteStep[] = [];
    let stepIndex = 0;

    for (const leg of osrmRoute.legs) {
      for (const step of leg.steps) {
        steps.push({
          index: stepIndex++,
          instruction: this.generateInstruction(step),
          distance: step.distance,
          duration: step.duration,
          startLocation: {
            lat: step.maneuver.location[1], // OSRM is [lng, lat]
            lng: step.maneuver.location[0],
          },
          endLocation: {
            lat: step.geometry.coordinates[step.geometry.coordinates.length - 1]?.[1] ?? step.maneuver.location[1],
            lng: step.geometry.coordinates[step.geometry.coordinates.length - 1]?.[0] ?? step.maneuver.location[0],
          },
          roadName: step.name || undefined,
          maneuver: this.mapManeuver(step.maneuver.type, step.maneuver.modifier),
        });
      }
    }

    const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);
    const totalDuration = legs.reduce((sum, leg) => sum + leg.duration, 0);

    // Convert GeoJSON coordinates to encoded polyline format
    const geometry = this.encodePolyline(
      osrmRoute.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
    );

    return {
      routeId: `osrm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      provider: this.name,
      distance: totalDistance,
      duration: totalDuration,
      eta: Date.now() + totalDuration * 1000,
      geometry,
      legs,
      steps,
      warnings: [],
      bounds: this.calculateBounds(osrmRoute.geometry.coordinates),
    };
  }

  private generateInstruction(step: OSRMStep): string {
    const modifier = step.maneuver.modifier ?? "";
    const type = step.maneuver.type;
    const name = step.name || "the road";

    const typeMap: Record<string, string> = {
      depart: `Head ${modifier} on ${name}`,
      arrive: `Arrive at your destination`,
      turn: `Turn ${modifier} onto ${name}`,
      "new name": `Continue onto ${name}`,
      merge: `Merge ${modifier} onto ${name}`,
      "on ramp": `Take the ramp ${modifier}`,
      "off ramp": `Take the exit ${modifier}`,
      fork: `At the fork, keep ${modifier}`,
      roundabout: `At the roundabout, take the ${modifier} exit`,
      "roundabout counterclockwise": `At the roundabout, take the ${modifier} exit`,
    };

    return typeMap[type] ?? `Continue on ${name}`;
  }

  private mapManeuver(type: string, modifier?: string): ManeuverType {
    if (type === "roundabout" || type === "roundabout counterclockwise") {
      return "roundabout";
    }

    const key = modifier ? `${type}-${modifier}` : type;
    const maneuverMap: Record<string, ManeuverType> = {
      "turn-left": "turn-left",
      "turn-right": "turn-right",
      "turn-slight left": "turn-slight-left",
      "turn-slight right": "turn-slight-right",
      "turn-sharp left": "turn-sharp-left",
      "turn-sharp right": "turn-sharp-right",
      "turn-uturn": "uturn",
      "new name": "new-name",
      merge: "merge",
      "fork-left": "fork-left",
      "fork-right": "fork-right",
      depart: "depart",
      arrive: "arrive",
    };

    return maneuverMap[key] ?? "continue";
  }

  private encodePolyline(points: LatLng[]): string {
    let result = "";
    let prevLat = 0;
    let prevLng = 0;

    for (const point of points) {
      const lat = Math.round(point.lat * 1e5);
      const lng = Math.round(point.lng * 1e5);

      result += this.encodeValue(lat - prevLat);
      result += this.encodeValue(lng - prevLng);

      prevLat = lat;
      prevLng = lng;
    }

    return result;
  }

  private encodeValue(value: number): string {
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

  private calculateBounds(
    coordinates: Array<[number, number]>
  ): { northeast: LatLng; southwest: LatLng } {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const [lng, lat] of coordinates) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    return {
      northeast: { lat: maxLat, lng: maxLng },
      southwest: { lat: minLat, lng: minLng },
    };
  }

  private async optimizeWithTripEndpoint(
    request: OptimizeStopsRequest,
    allWaypoints: Waypoint[]
  ): Promise<OptimizedRoute> {
    const coordinates = allWaypoints
      .map((wp) => `${wp.lng},${wp.lat}`)
      .join(";");

    const params = new URLSearchParams({
      roundtrip: request.returnToDepot ? "true" : "false",
      source: "first",
      destination: request.returnToDepot ? "last" : "any",
      geometries: "geojson",
      steps: "true",
    });

    const profile = this.getProfile(request.travelMode);
    const url = `${this.baseUrl}/trip/v1/${profile}/${coordinates}?${params.toString()}`;

    const controller = createTimeoutController(this.config.timeoutMs!);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: {
        code: string;
        trips: OSRMRoute[];
        waypoints: Array<{
          trips_index: number;
          waypoint_index: number;
          name: string;
          location: [number, number];
        }>;
      } = await response.json();

      if (data.code !== "Ok" || !data.trips || data.trips.length === 0) {
        throw new Error("Trip optimization failed");
      }

      const trip = data.trips[0];

      // Map waypoint indices back to original stop indices
      const optimizedOrder = data.waypoints
        .filter((w) => w.waypoint_index > 0 && w.waypoint_index < allWaypoints.length - 1)
        .map((w) => w.waypoint_index - 1);

      const segments: RouteResult[] = [];
      let totalDistance = 0;
      let totalDuration = 0;

      for (let i = 0; i < trip.legs.length; i++) {
        const leg = trip.legs[i];
        totalDistance += leg.distance;
        totalDuration += leg.duration;

        segments.push({
          routeId: `osrm-trip-${i}`,
          provider: this.name,
          distance: leg.distance,
          duration: leg.duration,
          eta: Date.now() + totalDuration * 1000,
          geometry: "",
          legs: [{
            start: allWaypoints[i],
            end: allWaypoints[i + 1],
            distance: leg.distance,
            duration: leg.duration,
          }],
          steps: [],
          warnings: [],
          bounds: {
            northeast: { lat: 0, lng: 0 },
            southwest: { lat: 0, lng: 0 },
          },
        });
      }

      let currentTime = Date.now();
      const arrivalEstimates = request.stops.map((stop, idx) => {
        const segment = segments[idx];
        if (segment) {
          currentTime += segment.duration * 1000;
        }
        return {
          stopId: stop.id,
          estimatedArrival: currentTime,
          eta: currentTime,
        };
      });

      return {
        request,
        optimizedOrder,
        stops: optimizedOrder.map((i) => request.stops[i]),
        totalDistance,
        totalDuration,
        segments,
        arrivalEstimates,
      };
    } catch (error) {
      throw classifyError(error, this.name);
    }
  }

  private async optimizeWithSequentialRoutes(
    request: OptimizeStopsRequest,
    allWaypoints: Waypoint[]
  ): Promise<OptimizedRoute> {
    // Simple sequential routing (no optimization)
    const segments: RouteResult[] = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < allWaypoints.length - 1; i++) {
      const segment = await this.getRoute({
        origin: allWaypoints[i],
        destination: allWaypoints[i + 1],
        travelMode: request.travelMode,
      });

      segments.push(segment);
      totalDistance += segment.distance;
      totalDuration += segment.duration;
    }

    const optimizedOrder = request.stops.map((_, i) => i);

    let currentTime = Date.now();
    const arrivalEstimates = request.stops.map((stop, idx) => {
      const segment = segments[idx];
      if (segment) {
        currentTime += segment.duration * 1000;
      }
      return {
        stopId: stop.id,
        estimatedArrival: currentTime,
        eta: currentTime,
      };
    });

    return {
      request,
      optimizedOrder,
      stops: request.stops,
      totalDistance,
      totalDuration,
      segments,
      arrivalEstimates,
    };
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
