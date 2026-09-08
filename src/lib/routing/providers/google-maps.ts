/**
 * Lasha Google Maps Routing Provider
 *
 * Implements the RoutingProvider interface using Google Maps Directions API.
 * This is the default provider for production use.
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

// ─── Google Maps Response Types ───────────────────────────────────────────────

interface GoogleDirectionsResponse {
  status: string;
  routes: GoogleRoute[];
  error_message?: string;
}

interface GoogleRoute {
  overview_polyline: { points: string };
  legs: GoogleLeg[];
  bounds: {
    northeast: GoogleLatLng;
    southwest: GoogleLatLng;
  };
  warnings: string[];
  summary: string;
}

interface GoogleLeg {
  start_location: GoogleLatLng;
  end_location: GoogleLatLng;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  departure_time?: { value: number; text: string };
  arrival_time?: { value: number; text: string };
  steps: GoogleStep[];
}

interface GoogleStep {
  html_instructions: string;
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  start_location: GoogleLatLng;
  end_location: GoogleLatLng;
  maneuver?: string;
  name?: string;
}

interface GoogleLatLng {
  lat: number;
  lng: number;
}

// ─── Provider Implementation ──────────────────────────────────────────────────

export class GoogleMapsProvider implements RoutingProvider {
  readonly name = "google-maps";
  private config: RoutingProviderConfig;

  constructor(config: RoutingProviderConfig) {
    this.config = {
      timeoutMs: 10000,
      baseUrl: "https://maps.googleapis.com/maps/api/directions/json",
      ...config,
    };
  }

  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  async getRoute(request: RouteRequest): Promise<RouteResult> {
    if (!this.isAvailable()) {
      throw classifyError(
        new Error("Google Maps API key not configured"),
        this.name
      );
    }

    const params = new URLSearchParams({
      origin: this.formatWaypoint(request.origin),
      destination: this.formatWaypoint(request.destination),
      key: this.config.apiKey!,
      mode: this.mapTravelMode(request.travelMode ?? "driving"),
      alternatives: "false",
      units: request.units === "imperial" ? "imperial" : "metric",
    });

    // Add waypoints
    if (request.waypoints && request.waypoints.length > 0) {
      const waypointStr = request.waypoints
        .map((wp) => this.formatWaypoint(wp))
        .join("|");
      params.set("waypoints", `optimize:true|${waypointStr}`);
    }

    // Add departure time for ETA
    if (request.departureTime) {
      const time =
        typeof request.departureTime === "string"
          ? Math.floor(new Date(request.departureTime).getTime() / 1000)
          : Math.floor(request.departureTime / 1000);
      params.set("departure_time", String(time));
    }

    // Add avoid flags
    if (request.avoid && request.avoid.length > 0) {
      params.set("avoid", request.avoid.join("|"));
    }

    const controller = createTimeoutController(this.config.timeoutMs!);

    try {
      const response = await fetch(
        `${this.config.baseUrl}?${params.toString()}`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GoogleDirectionsResponse = await response.json();

      if (data.status !== "OK") {
        throw new Error(
          data.error_message ?? `Google Directions API error: ${data.status}`
        );
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
      departureTime: Date.now(),
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
    // Calculate straight-line distance using Haversine
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
      // If routing fails, return just straight-line distance
      return {
        straightLineDistance,
      };
    }
  }

  async optimizeStops(request: OptimizeStopsRequest): Promise<OptimizedRoute> {
    if (!this.isAvailable()) {
      throw classifyError(
        new Error("Google Maps API key not configured"),
        this.name
      );
    }

    // Google Maps can optimize up to 25 waypoints
    if (request.stops.length > 25) {
      throw new Error("Google Maps supports maximum 25 waypoints for optimization");
    }

    // Build the route with all stops
    const allWaypoints = [request.depot, ...request.stops];
    if (request.returnToDepot) {
      allWaypoints.push(request.depot);
    }

    // Get routes between consecutive stops
    const segments: RouteResult[] = [];
    let totalDistance = 0;
    let totalDuration = 0;
    const optimizedOrder: number[] = [];

    // For now, use the provided order (optimization would require VRP solver)
    // In production, this would use Google's optimize:true parameter
    for (let i = 0; i < allWaypoints.length - 1; i++) {
      const segment = await this.getRoute({
        origin: allWaypoints[i],
        destination: allWaypoints[i + 1],
        travelMode: request.travelMode,
      });

      segments.push(segment);
      totalDistance += segment.distance;
      totalDuration += segment.duration;
      optimizedOrder.push(i);
    }

    // Calculate arrival estimates
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

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private formatWaypoint(wp: Waypoint): string {
    if (wp.address) return wp.address;
    return `${wp.lat},${wp.lng}`;
  }

  private mapTravelMode(mode: TravelMode): string {
    const modeMap: Record<TravelMode, string> = {
      driving: "driving",
      walking: "walking",
      cycling: "bicycling",
      transit: "transit",
    };
    return modeMap[mode] ?? "driving";
  }

  private normalizeRoute(
    googleRoute: GoogleRoute,
    request: RouteRequest
  ): RouteResult {
    const legs: RouteLeg[] = googleRoute.legs.map((leg) => ({
      start: {
        lat: leg.start_location.lat,
        lng: leg.start_location.lng,
      },
      end: {
        lat: leg.end_location.lat,
        lng: leg.end_location.lng,
      },
      distance: leg.distance.value,
      duration: leg.duration.value,
      departureTime: leg.departure_time?.value,
      arrivalTime: leg.arrival_time?.value,
    }));

    const steps: RouteStep[] = [];
    let stepIndex = 0;

    for (const leg of googleRoute.legs) {
      for (const step of leg.steps) {
        steps.push({
          index: stepIndex++,
          instruction: this.stripHtml(step.html_instructions),
          distance: step.distance.value,
          duration: step.duration.value,
          startLocation: {
            lat: step.start_location.lat,
            lng: step.start_location.lng,
          },
          endLocation: {
            lat: step.end_location.lat,
            lng: step.end_location.lng,
          },
          roadName: step.name,
          maneuver: this.mapManeuver(step.maneuver),
        });
      }
    }

    const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);
    const totalDuration = legs.reduce((sum, leg) => sum + leg.duration, 0);

    // Calculate ETA
    const departureTime = request.departureTime
      ? typeof request.departureTime === "string"
        ? new Date(request.departureTime).getTime()
        : request.departureTime
      : Date.now();

    return {
      routeId: `gmaps-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      provider: this.name,
      distance: totalDistance,
      duration: totalDuration,
      eta: departureTime + totalDuration * 1000,
      geometry: googleRoute.overview_polyline.points,
      legs,
      steps,
      warnings: googleRoute.warnings.map((w) => ({
        type: "congestion" as const,
        message: w,
      })),
      bounds: {
        northeast: {
          lat: googleRoute.bounds.northeast.lat,
          lng: googleRoute.bounds.northeast.lng,
        },
        southwest: {
          lat: googleRoute.bounds.southwest.lat,
          lng: googleRoute.bounds.southwest.lng,
        },
      },
    };
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  private mapManeuver(maneuver?: string): ManeuverType {
    const maneuverMap: Record<string, ManeuverType> = {
      "turn-left": "turn-left",
      "turn-right": "turn-right",
      "turn-slight-left": "turn-slight-left",
      "turn-slight-right": "turn-slight-right",
      "turn-sharp-left": "turn-sharp-left",
      "turn-sharp-right": "turn-sharp-right",
      uturn: "uturn",
      straight: "continue",
      roundabout: "roundabout",
    };
    return maneuverMap[maneuver ?? ""] ?? "continue";
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
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
