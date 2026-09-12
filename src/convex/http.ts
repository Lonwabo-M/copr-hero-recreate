import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { computePaystackSignature } from "./payments/_provider";

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

/**
 * Paystack payment webhook.
 *
 * Security:
 *  - The signature header (x-paystack-signature, HMAC-SHA512 of the raw body
 *    with PAYSTACK_SECRET_KEY) is verified BEFORE any processing. Invalid
 *    signatures are rejected with 401 and no state changes occur.
 *  - The internal payment transaction is resolved by the reference inside the
 *    payload (our idempotency key) — payload order IDs are never trusted.
 *  - Processing is idempotent: duplicate charge.success events short-circuit
 *    inside completePaymentTransaction (already-completed guard).
 */
http.route({
  path: "/payments/paystack/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return new Response(JSON.stringify({ error: "Payment provider not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Raw body is required for signature verification — never re-serialize.
    const rawBody = await request.text();
    const signatureHeader =
      request.headers.get("x-paystack-signature") ??
      request.headers.get("X-Paystack-Signature");

    if (!signatureHeader) {
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const expected = await computePaystackSignature(rawBody, secretKey);
    if (expected !== signatureHeader) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let event: {
      event?: string;
      data?: { reference?: string; id?: number; amount?: number };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const reference = event.data?.reference;
    if (!event.event || !reference) {
      return new Response(JSON.stringify({ error: "Missing event or reference" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      await ctx.runAction(internal.payments.actions.processWebhookEvent, {
        reference,
        event: event.event,
        providerTransactionId: event.data?.id ? String(event.data.id) : undefined,
        amountFromProvider: event.data?.amount,
      });
    } catch (err) {
      // Return 500 so Paystack retries; the internal mutations are idempotent
      // so replayed events are safe.
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "webhook processing failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ status: "received" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
