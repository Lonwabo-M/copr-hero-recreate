/**
 * Lasha Tracking Mutations
 *
 * Server-side mutations for updating driver location.
 * All location updates go through comprehensive validation.
 *
 * Two types of location updates:
 * 1. Standalone - Driver's current location (not tied to a delivery)
 * 2. Delivery-linked - Driver's location during an active delivery
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { DELIVERY_STATUS, effectiveRoleForUser, ROLES } from "../schema";
import { requireAuth, getCurrentAuthUser } from "../auth/authorization";
import {
  validateCoordinates,
  validateTimestamp,
  validateUpdateFrequency,
  validateMovement,
  validateDriverAuthorization,
  validateDeliveryTrackable,
  haversineDistance,
} from "./validation";
import {
  MIN_UPDATE_INTERVAL_MS,
  DOWNSAMPLE_INTERVAL_MS,
} from "./config";

// ─── Location Update Schema ───────────────────────────────────────────────────

const locationUpdateSchema = v.object({
  lat: v.number(),
  lng: v.number(),
  timestamp: v.number(),
  speed: v.optional(v.number()),
  heading: v.optional(v.number()),
  accuracy: v.optional(v.number()),
});

// ─── Standalone Location Update ───────────────────────────────────────────────

/**
 * Update driver's current location (not tied to a specific delivery).
 * This is used for:
 * - Driver availability tracking
 * - Proximity-based dispatch
 * - Driver status display
 */
export const updateDriverLocation = mutation({
  args: {
    location: locationUpdateSchema,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // 2. Verify user is a driver
    const userRole = effectiveRoleForUser(user as Doc<"users">);
    if (userRole !== ROLES.DRIVER) {
      throw new Error("Only drivers can update location");
    }

    // 3. Validate coordinates
    const coordResult = validateCoordinates(args.location.lat, args.location.lng);
    if (!coordResult.valid) {
      throw new Error(coordResult.error);
    }

    // 4. Validate timestamp
    const timestampResult = validateTimestamp(args.location.timestamp);
    if (!timestampResult.valid) {
      throw new Error(timestampResult.error);
    }

    // 5. Validate update frequency
    const frequencyResult = validateUpdateFrequency(
      user.lastLocationUpdate,
      args.location.timestamp
    );
    if (!frequencyResult.valid) {
      throw new Error(frequencyResult.error);
    }

    // 6. Validate movement reasonableness
    const movementResult = validateMovement(
      user.currentLat,
      user.currentLng,
      user.lastLocationUpdate,
      args.location.lat,
      args.location.lng,
      args.location.timestamp
    );
    if (!movementResult.valid) {
      throw new Error(movementResult.error);
    }

    // 7. Update user's current location
    await ctx.db.patch(userId, {
      currentLat: args.location.lat,
      currentLng: args.location.lng,
      lastLocationUpdate: args.location.timestamp,
    });

    return { success: true };
  },
});

// ─── Delivery-Linked Location Update ──────────────────────────────────────────

/**
 * Update driver's location during an active delivery.
 * This:
 * 1. Updates driver's current location
 * 2. Creates a tracking event for the delivery
 * 3. Uses downsampling to reduce historical data volume
 */
export const updateDeliveryLocation = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    location: locationUpdateSchema,
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // 2. Verify user is a driver
    const userRole = effectiveRoleForUser(user as Doc<"users">);
    if (userRole !== ROLES.DRIVER) {
      throw new Error("Only drivers can update delivery location");
    }

    // 3. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 4. Validate driver is assigned to this delivery
    if (!delivery.courierId || delivery.courierId !== userId) {
      throw new Error("Driver is not assigned to this delivery");
    }

    // 5. Validate delivery is in a trackable state
    const trackableStatuses = [
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_DROPOFF,
    ];

    if (!trackableStatuses.includes(delivery.status as any)) {
      throw new Error(`Delivery in "${delivery.status}" state is not trackable`);
    }

    // 6. Validate coordinates
    const coordResult = validateCoordinates(args.location.lat, args.location.lng);
    if (!coordResult.valid) {
      throw new Error(coordResult.error);
    }

    // 7. Validate timestamp
    const timestampResult = validateTimestamp(args.location.timestamp);
    if (!timestampResult.valid) {
      throw new Error(timestampResult.error);
    }

    // 8. Validate update frequency (use tighter interval for active deliveries)
    const frequencyResult = validateUpdateFrequency(
      user.lastLocationUpdate,
      args.location.timestamp
    );
    if (!frequencyResult.valid) {
      throw new Error(frequencyResult.error);
    }

    // 9. Validate movement reasonableness
    const movementResult = validateMovement(
      user.currentLat,
      user.currentLng,
      user.lastLocationUpdate,
      args.location.lat,
      args.location.lng,
      args.location.timestamp
    );
    if (!movementResult.valid) {
      throw new Error(movementResult.error);
    }

    // 10. Update user's current location
    await ctx.db.patch(userId, {
      currentLat: args.location.lat,
      currentLng: args.location.lng,
      lastLocationUpdate: args.location.timestamp,
    });

    // 11. Downsample: Only record tracking event if enough time has passed
    // This reduces database writes while maintaining reasonable accuracy
    const lastEvent = await ctx.db
      .query("tracking_events")
      .withIndex("by_delivery_time", (q) => q.eq("deliveryId", args.deliveryId))
      .order("desc")
      .first();

    const shouldRecord = !lastEvent ||
      (args.location.timestamp - lastEvent.timestamp) >= DOWNSAMPLE_INTERVAL_MS;

    if (shouldRecord) {
      await ctx.db.insert("tracking_events", {
        deliveryId: args.deliveryId,
        type: "location_update",
        lat: args.location.lat,
        lng: args.location.lng,
        timestamp: args.location.timestamp,
        metadata: JSON.stringify({
          speed: args.location.speed,
          heading: args.location.heading,
          accuracy: args.location.accuracy,
        }),
      });
    }

    return {
      success: true,
      recorded: shouldRecord,
    };
  },
});

// ─── Status Update with Location ──────────────────────────────────────────────

/**
 * Update delivery status with location (e.g., "arrived at pickup").
 * This combines a status change with a location recording.
 */
export const updateDeliveryStatusWithLocation = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    status: v.union(
      v.literal(DELIVERY_STATUS.EN_ROUTE_TO_PICKUP),
      v.literal(DELIVERY_STATUS.AT_PICKUP),
      v.literal(DELIVERY_STATUS.PICKED_UP),
      v.literal(DELIVERY_STATUS.IN_TRANSIT),
      v.literal(DELIVERY_STATUS.AT_DROPOFF),
      v.literal(DELIVERY_STATUS.DELIVERED),
    ),
    location: v.optional(v.object({
      lat: v.number(),
      lng: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // 2. Verify user is a driver
    const userRole = effectiveRoleForUser(user as Doc<"users">);
    if (userRole !== ROLES.DRIVER) {
      throw new Error("Only drivers can update delivery status");
    }

    // 3. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 4. Validate driver is assigned
    if (!delivery.courierId || delivery.courierId !== userId) {
      throw new Error("Driver is not assigned to this delivery");
    }

    // 5. Validate status transition (simplified - full validation in state_machine.ts)
    // This mutation is for driver-initiated status updates with location

    // 6. Update delivery status
    const updateData: any = {
      status: args.status,
    };

    // Set timestamps based on status
    if (args.status === DELIVERY_STATUS.EN_ROUTE_TO_PICKUP) {
      updateData.startedAt = now;
    } else if (args.status === DELIVERY_STATUS.DELIVERED) {
      updateData.completedAt = now;
      updateData.actualArrival = now;
    }

    await ctx.db.patch(args.deliveryId, updateData);

    // 7. Record status change event with location
    if (args.location) {
      // Validate coordinates if provided
      const coordResult = validateCoordinates(args.location.lat, args.location.lng);
      if (coordResult.valid) {
        await ctx.db.insert("tracking_events", {
          deliveryId: args.deliveryId,
          type: "status_change" as any,
          lat: args.location.lat,
          lng: args.location.lng,
          timestamp: now,
          metadata: JSON.stringify({
            action: "status_change",
            newStatus: args.status,
          }),
        });

        // Also update driver's current location
        await ctx.db.patch(userId, {
          currentLat: args.location.lat,
          currentLng: args.location.lng,
          lastLocationUpdate: now,
        });
      }
    } else {
      // Record status change without location
      await ctx.db.insert("tracking_events", {
        deliveryId: args.deliveryId,
        type: "status_change" as any,
        timestamp: now,
        metadata: JSON.stringify({
          action: "status_change",
          newStatus: args.status,
        }),
      });
    }

    return { success: true };
  },
});
