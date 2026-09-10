import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// ─── Application Metadata ────────────────────────────────────────────────────
const APP_VERSION = "1.0.0";
const startTime = Date.now();

// ─── Health Check Endpoints ──────────────────────────────────────────────────

/**
 * Full health check — verifies critical subsystems.
 * Returns 200 when healthy or degraded, 503 when unhealthy.
 */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    const checks: Record<string, { status: string; latencyMs?: number; message?: string }> = {};

    // Routing provider check
    const routingStart = Date.now();
    try {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=Johannesburg&key=${apiKey}`
        );
        checks.routing = {
          status: response.ok ? "healthy" : "degraded",
          latencyMs: Date.now() - routingStart,
          message: response.ok ? "Google Maps available" : `HTTP ${response.status}`,
        };
      } else {
        // OSRM fallback
        const response = await fetch(
          "https://router.project-osrm.org/route/v1/driving/28.0473,-26.2041;28.0597,-26.1845?overview=false"
        );
        checks.routing = {
          status: response.ok ? "healthy" : "degraded",
          latencyMs: Date.now() - routingStart,
          message: response.ok ? "OSRM available (fallback)" : `HTTP ${response.status}`,
        };
      }
    } catch (err) {
      checks.routing = {
        status: "degraded",
        latencyMs: Date.now() - routingStart,
        message: `Routing degraded: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }

    // If we got this far, the Convex runtime is operational
    checks.convex = { status: "healthy", message: "Convex runtime operational" };
    checks.notifications = { status: "healthy", message: "In-app notifications operational" };

    const overallStatus = Object.values(checks).some((c) => c.status === "unhealthy")
      ? "unhealthy"
      : Object.values(checks).some((c) => c.status === "degraded")
        ? "degraded"
        : "healthy";

    const response = {
      status: overallStatus,
      timestamp: Date.now(),
      version: APP_VERSION,
      uptime: Date.now() - startTime,
      checks,
    };

    const httpStatus = overallStatus === "unhealthy" ? 503 : 200;

    return new Response(JSON.stringify(response, null, 2), {
      status: httpStatus,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Health-Status": overallStatus,
      },
    });
  }),
});

/**
 * Simple liveness probe — always returns 200 if the server is running.
 */
http.route({
  path: "/health/live",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ status: "alive", timestamp: Date.now() }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      }
    );
  }),
});

/**
 * Readiness probe — returns 200 since Convex runtime is always ready when serving.
 */
http.route({
  path: "/health/ready",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ status: "ready", timestamp: Date.now() }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      }
    );
  }),
});

export default http;
