/**
 * Lasha Metrics Collection Service
 *
 * Collects and stores operational metrics for monitoring.
 * Metrics are aggregated at regular intervals and stored in the
 * metrics_storage table for querying by the Operations Centre.
 *
 * Metric types:
 * - counter: monotonically increasing (e.g., total deliveries completed)
 * - gauge: point-in-time value (e.g., active drivers)
 * - histogram: distribution of values (e.g., delivery duration)
 *
 * All metrics include dimensions for slicing (e.g., by status, role, zone).
 */

import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentAuthUser } from "../auth/authorization";

// ─── Metric Names ────────────────────────────────────────────────────────────

export const METRICS = {
  // Delivery metrics
  DELIVERY_CREATED: "delivery.created",
  DELIVERY_COMPLETED: "delivery.completed",
  DELIVERY_CANCELLED: "delivery.cancelled",
  DELIVERY_FAILED: "delivery.failed",
  DELIVERY_DURATION: "delivery.duration",

  // Dispatch metrics
  DISPATCH_STARTED: "dispatch.started",
  DISPATCH_COMPLETED: "dispatch.completed",
  DISPATCH_LATENCY: "dispatch.latency",
  DISPATCH_OFFER_ACCEPTED: "dispatch.offer_accepted",
  DISPATCH_OFFER_REJECTED: "dispatch.offer_rejected",
  DISPATCH_NO_CANDIDATES: "dispatch.no_candidates",

  // GPS/Tracking metrics
  GPS_UPDATE_RECEIVED: "tracking.gps_update",
  GPS_UPDATE_THROTTLED: "tracking.gps_throttled",
  GPS_UPDATE_INVALID: "tracking.gps_invalid",
  TRACKING_SESSION_ACTIVE: "tracking.session_active",

  // Notification metrics
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_FAILED: "notification.failed",

  // Routing metrics
  ROUTING_REQUEST: "routing.request",
  ROUTING_SUCCESS: "routing.success",
  ROUTING_FAILED: "routing.failed",
  ROUTING_FALLBACK: "routing.fallback",

  // Pricing metrics
  QUOTE_CALCULATED: "pricing.quote_calculated",

  // POD metrics
  POD_SUBMITTED: "pod.submitted",
  POD_FAILED: "pod.failed",

  // Payment metrics
  PAYMENT_INITIATED: "payment.initiated",
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_FAILED: "payment.failed",
  SETTLEMENT_COMPLETED: "settlement.completed",

  // Auth metrics
  AUTH_LOGIN_SUCCESS: "auth.login_success",
  AUTH_LOGIN_FAILED: "auth.login_failed",

  // Offline sync metrics
  OFFLINE_SYNC_STARTED: "offline.sync_started",
  OFFLINE_SYNC_COMPLETED: "offline.sync_completed",
  OFFLINE_SYNC_CONFLICT: "offline.sync_conflict",
  OFFLINE_SYNC_FAILED: "offline.sync_failed",

  // System metrics
  SYSTEM_ERROR: "system.error",
  SYSTEM_SLOW_QUERY: "system.slow_query",
} as const;

// ─── Recording Functions ─────────────────────────────────────────────────────

/**
 * Internal: Record a metric data point.
 * Called by domain operations to emit metrics.
 */
export const recordMetric = internalMutation({
  args: {
    metricName: v.string(),
    metricType: v.union(
      v.literal("counter"),
      v.literal("gauge"),
      v.literal("histogram")
    ),
    value: v.number(),
    dimensions: v.optional(v.record(v.string(), v.string())),
    timestamp: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    sampleCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("metrics_storage", {
      metricName: args.metricName,
      metricType: args.metricType,
      value: args.value,
      dimensions: args.dimensions,
      timestamp: args.timestamp,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      sampleCount: args.sampleCount,
    });
  },
});

/**
 * Increment a counter metric by 1.
 */
export const incrementCounter = internalMutation({
  args: {
    metricName: v.string(),
    dimensions: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Aggregate into 5-minute windows
    const windowMs = 5 * 60 * 1000;
    const periodStart = Math.floor(now / windowMs) * windowMs;
    const periodEnd = periodStart + windowMs;

    // Check for existing counter in this window
    const existing = await ctx.db
      .query("metrics_storage")
      .withIndex("by_name_period", (q) =>
        q.eq("metricName", args.metricName).eq("periodStart", periodStart)
      )
      .filter((q) => q.eq(q.field("periodEnd"), periodEnd))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: existing.value + 1,
        sampleCount: (existing.sampleCount ?? 0) + 1,
      });
    } else {
      await ctx.db.insert("metrics_storage", {
        metricName: args.metricName,
        metricType: "counter",
        value: 1,
        dimensions: args.dimensions,
        timestamp: now,
        periodStart,
        periodEnd,
        sampleCount: 1,
      });
    }
  },
});

/**
 * Record a histogram value (for latency, duration, etc.).
 */
export const recordHistogram = internalMutation({
  args: {
    metricName: v.string(),
    value: v.number(),
    dimensions: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    const periodStart = Math.floor(now / windowMs) * windowMs;
    const periodEnd = periodStart + windowMs;

    const existing = await ctx.db
      .query("metrics_storage")
      .withIndex("by_name_period", (q) =>
        q.eq("metricName", args.metricName).eq("periodStart", periodStart)
      )
      .filter((q) => q.eq(q.field("periodEnd"), periodEnd))
      .first();

    if (existing) {
      // Running average for simplicity
      const samples = existing.sampleCount ?? 1;
      const newValue = (existing.value * samples + args.value) / (samples + 1);
      await ctx.db.patch(existing._id, {
        value: newValue,
        sampleCount: samples + 1,
      });
    } else {
      await ctx.db.insert("metrics_storage", {
        metricName: args.metricName,
        metricType: "histogram",
        value: args.value,
        dimensions: args.dimensions,
        timestamp: now,
        periodStart,
        periodEnd,
        sampleCount: 1,
      });
    }
  },
});

/**
 * Set a gauge metric (point-in-time value).
 */
export const setGauge = internalMutation({
  args: {
    metricName: v.string(),
    value: v.number(),
    dimensions: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = 5 * 60 * 1000;
    const periodStart = Math.floor(now / windowMs) * windowMs;
    const periodEnd = periodStart + windowMs;

    const existing = await ctx.db
      .query("metrics_storage")
      .withIndex("by_name_period", (q) =>
        q.eq("metricName", args.metricName).eq("periodStart", periodStart)
      )
      .filter((q) => q.eq(q.field("periodEnd"), periodEnd))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        timestamp: now,
      });
    } else {
      await ctx.db.insert("metrics_storage", {
        metricName: args.metricName,
        metricType: "gauge",
        value: args.value,
        dimensions: args.dimensions,
        timestamp: now,
        periodStart,
        periodEnd,
      });
    }
  },
});

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Get metrics for a time range.
 */
export const getMetrics = query({
  args: {
    metricName: v.string(),
    sinceMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const allowed = ["operations", "super_admin"];
    if (!allowed.includes(user.role)) {
      throw new Error("Access denied");
    }

    const since = args.sinceMs ?? Date.now() - 24 * 60 * 60 * 1000;
    const limit = args.limit ?? 100;

    const metrics = await ctx.db
      .query("metrics_storage")
      .withIndex("by_name_time", (q) =>
        q.eq("metricName", args.metricName).gte("timestamp", since)
      )
      .order("desc")
      .take(limit);

    return metrics;
  },
});

/**
 * Get aggregated dashboard metrics for the Operations Centre.
 */
export const getDashboardMetrics = query({
  args: {
    sinceMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const allowed = ["operations", "super_admin", "company_admin"];
    if (!allowed.includes(user.role)) {
      throw new Error("Access denied");
    }

    const since = args.sinceMs ?? Date.now() - 24 * 60 * 60 * 1000;

    // Aggregate key metrics from the last 24 hours
    const metricNames = [
      METRICS.DELIVERY_COMPLETED,
      METRICS.DELIVERY_CANCELLED,
      METRICS.DELIVERY_FAILED,
      METRICS.DISPATCH_COMPLETED,
      METRICS.DISPATCH_LATENCY,
      METRICS.NOTIFICATION_SENT,
      METRICS.NOTIFICATION_FAILED,
      METRICS.ROUTING_FAILED,
      METRICS.PAYMENT_FAILED,
      METRICS.AUTH_LOGIN_FAILED,
      METRICS.OFFLINE_SYNC_CONFLICT,
    ];

    const results: Record<string, { value: number; samples: number; avg?: number }> = {};

    for (const name of metricNames) {
      const metrics = await ctx.db
        .query("metrics_storage")
        .withIndex("by_name_time", (q) =>
          q.eq("metricName", name).gte("timestamp", since)
        )
        .collect();

      let totalValue = 0;
      let totalSamples = 0;
      for (const m of metrics) {
        totalValue += m.value;
        totalSamples += m.sampleCount ?? 1;
      }

      results[name] = {
        value: totalValue,
        samples: totalSamples,
        avg: totalSamples > 0 ? totalValue / totalSamples : 0,
      };
    }

    return results;
  },
});
