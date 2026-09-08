/**
 * Lasha Tracking Data Retention
 *
 * Manages the lifecycle of tracking data:
 * - High-resolution data: kept for 24 hours
 * - Low-resolution data: kept for 30 days
 * - Old data: archived or deleted
 *
 * Strategy:
 * 1. High-frequency location updates (every 5-10s) are kept for 24 hours
 * 2. After 24 hours, data is downsampled to 5-minute intervals
 * 3. Downsampled data is kept for 30 days
 * 4. After 30 days, data is deleted (or archived to cold storage)
 *
 * This is implemented as a mutation that can be called:
 * - Periodically via Convex scheduled functions
 * - On-demand by operations
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentAuthUser } from "../auth/authorization";
import { ROLES } from "../schema";
import {
  HIGH_RES_RETENTION_MS,
  LOW_RES_RETENTION_MS,
  DOWNSAMPLE_INTERVAL_MS,
  RETENTION_BATCH_SIZE,
} from "./config";

// ─── Retention Cleanup ────────────────────────────────────────────────────────

/**
 * Clean up old tracking data.
 * This should be called periodically (e.g., every hour).
 *
 * Process:
 * 1. Find tracking events older than high-res retention (24h)
 * 2. Downsample to 5-minute intervals
 * 3. Delete events older than low-res retention (30 days)
 *
 * Authorization:
 * - Operations/Admin only
 */
export const cleanupTrackingData = mutation({
  args: {
    dryRun: v.optional(v.boolean()), // If true, only report what would be deleted
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const adminRoles = [ROLES.OPERATIONS, ROLES.SUPER_ADMIN];
    if (!adminRoles.includes(user.role as any)) {
      throw new Error("Access denied: only operations can cleanup tracking data");
    }

    const now = Date.now();
    const dryRun = args.dryRun ?? false;

    let deletedCount = 0;
    let downsampledCount = 0;

    // 1. Find old high-resolution data (older than 24 hours)
    const highResCutoff = now - HIGH_RES_RETENTION_MS;
    const lowResCutoff = now - LOW_RES_RETENTION_MS;

    // Get events that need downsampling (between 24h and 30 days old)
    const oldEvents = await ctx.db
      .query("tracking_events")
      .collect();

    // Group by delivery for downsampling
    const deliveryEvents = new Map<string, any[]>();
    for (const event of oldEvents) {
      if (event.timestamp < highResCutoff) {
        const existing = deliveryEvents.get(event.deliveryId) || [];
        existing.push(event);
        deliveryEvents.set(event.deliveryId, existing);
      }
    }

    // Downsample each delivery's old events
    for (const [deliveryId, events] of deliveryEvents) {
      // Sort by timestamp
      events.sort((a, b) => a.timestamp - b.timestamp);

      // Keep every DOWNSAMPLE_INTERVAL_MS
      let lastKeptTimestamp = 0;
      const toKeep = new Set<string>();
      const toDelete: string[] = [];

      for (const event of events) {
        if (event.timestamp - lastKeptTimestamp >= DOWNSAMPLE_INTERVAL_MS) {
          toKeep.add(event._id);
          lastKeptTimestamp = event.timestamp;
        } else {
          toDelete.push(event._id);
        }
      }

      if (!dryRun) {
        // Delete excess events
        for (const eventId of toDelete) {
          await ctx.db.delete(eventId as any);
          deletedCount++;
        }
      } else {
        deletedCount += toDelete.length;
      }
    }

    // 2. Delete very old data (older than 30 days)
    const ancientEvents = await ctx.db
      .query("tracking_events")
      .collect();

    const toDeleteOld: string[] = [];
    for (const event of ancientEvents) {
      if (event.timestamp < lowResCutoff) {
        toDeleteOld.push(event._id);
      }
    }

    if (!dryRun) {
      for (const eventId of toDeleteOld) {
        await ctx.db.delete(eventId as any);
        deletedCount++;
      }
    } else {
      deletedCount += toDeleteOld.length;
    }

    return {
      deletedCount,
      downsampledCount,
      dryRun,
      message: dryRun
        ? `Would delete ${deletedCount} events`
        : `Deleted ${deletedCount} events`,
    };
  },
});

// ─── Retention Statistics ─────────────────────────────────────────────────────

/**
 * Get statistics about tracking data volume.
 * Used for monitoring and capacity planning.
 */
export const getTrackingStats = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const adminRoles = [ROLES.OPERATIONS, ROLES.SUPER_ADMIN];
    if (!adminRoles.includes(user.role as any)) {
      throw new Error("Access denied");
    }

    const now = Date.now();
    const highResCutoff = now - HIGH_RES_RETENTION_MS;
    const lowResCutoff = now - LOW_RES_RETENTION_MS;

    const allEvents = await ctx.db
      .query("tracking_events")
      .collect();

    let highResCount = 0;
    let lowResCount = 0;
    let ancientCount = 0;

    for (const event of allEvents) {
      if (event.timestamp >= highResCutoff) {
        highResCount++;
      } else if (event.timestamp >= lowResCutoff) {
        lowResCount++;
      } else {
        ancientCount++;
      }
    }

    return {
      total: allEvents.length,
      highResolution: highResCount,
      lowResolution: lowResCount,
      ancient: ancientCount,
      highResRetentionHours: HIGH_RES_RETENTION_MS / (1000 * 60 * 60),
      lowResRetentionDays: LOW_RES_RETENTION_MS / (1000 * 60 * 60 * 24),
    };
  },
});
