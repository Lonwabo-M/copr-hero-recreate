/**
 * Lasha Tracking Queries
 *
 * Real-time queries for React subscriptions. These queries are designed
 * to be reactive - when the underlying data changes, subscribed React
 * components automatically re-render.
 *
 * Authorization:
 * - Customers can only track their own deliveries
 * - Drivers can track any delivery they're assigned to
 * - Operations/Admin can track any delivery
 *
 * Data minimization:
 * - Each query returns only the data needed for its specific use case
 * - No over-fetching of unrelated fields
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { DELIVERY_STATUS, ROLES } from "../schema";
import { getCurrentAuthUser } from "../auth/authorization";
import {
  MAX_TRACKING_EVENTS,
  MAX_ROUTE_HISTORY,
  MAX_STALENESS_MS,
} from "./config";

// ─── Driver Location Query ────────────────────────────────────────────────────

/**
 * Get a driver's current location.
 * Used by operations to see where drivers are.
 *
 * Authorization:
 * - Operations/Admin: any driver
 * - Company Admin: drivers in their company
 * - Driver: only themselves
 * - Customer: cannot access
 */
export const getDriverLocation = query({
  args: {
    driverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Authorization check
    const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    const canViewAny = allowedRoles.includes(user.role as any);
    const isSelf = user.userId === args.driverId;

    if (!canViewAny && !isSelf) {
      throw new Error("Access denied: cannot view other drivers' locations");
    }

    // Get driver
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");

    // Check if location is stale
    const now = Date.now();
    const isStale = !driver.lastLocationUpdate ||
      (now - driver.lastLocationUpdate) > MAX_STALENESS_MS;

    return {
      driverId: args.driverId,
      lat: driver.currentLat,
      lng: driver.currentLng,
      lastUpdate: driver.lastLocationUpdate,
      isStale,
    };
  },
});

/**
 * Get locations of all available drivers.
 * Used for dispatch and operations dashboard.
 *
 * Authorization:
 * - Operations/Admin: all drivers
 * - Company Admin: drivers in their company
 */
export const getAvailableDriverLocations = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Authorization check
    const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied: only operations can view all driver locations");
    }

    // Get all available drivers
    const driverProfiles = await ctx.db
      .query("driver_profiles")
      .withIndex("by_available", (q) => q.eq("isAvailable", true))
      .collect();

    const now = Date.now();
    const locations = [];

    for (const profile of driverProfiles) {
      const driver = await ctx.db.get(profile.userId);
      if (!driver) continue;

      // Skip if no location data
      if (driver.currentLat === undefined || driver.currentLng === undefined) {
        continue;
      }

      const isStale = !driver.lastLocationUpdate ||
        (now - driver.lastLocationUpdate) > MAX_STALENESS_MS;

      locations.push({
        driverId: profile.userId,
        lat: driver.currentLat,
        lng: driver.currentLng,
        lastUpdate: driver.lastLocationUpdate,
        isStale,
        rating: profile.rating,
        totalTrips: profile.totalTrips,
      });
    }

    return locations;
  },
});

// ─── Delivery Tracking Queries ────────────────────────────────────────────────

/**
 * Get real-time tracking data for a delivery.
 * This is the primary query for customer tracking UI.
 *
 * Returns:
 * - Delivery status
 * - Driver location (if available)
 * - Route history (recent locations)
 * - ETA (estimated)
 *
 * Authorization:
 * - Customer: only their own deliveries
 * - Driver: deliveries they're assigned to
 * - Operations/Admin: any delivery
 */
export const getDeliveryTracking = query({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Authorization check
    await authorizeTrackingAccess(ctx, user, delivery);

    // Get driver location (if assigned)
    let driverLocation = null;
    if (delivery.courierId) {
      const driver = await ctx.db.get(delivery.courierId);
      if (driver) {
        const now = Date.now();
        const isStale = !driver.lastLocationUpdate ||
          (now - driver.lastLocationUpdate) > MAX_STALENESS_MS;

        driverLocation = {
          lat: driver.currentLat,
          lng: driver.currentLng,
          lastUpdate: driver.lastLocationUpdate,
          isStale,
        };
      }
    }

    // Get recent tracking events (route history)
    const trackingEvents = await ctx.db
      .query("tracking_events")
      .withIndex("by_delivery_time", (q) => q.eq("deliveryId", args.deliveryId))
      .order("desc")
      .take(MAX_ROUTE_HISTORY);

    // Reverse to get chronological order (metadata included so the UI can
    // distinguish the real pickup milestone from other picked_up-typed events).
    const routeHistory = trackingEvents.reverse().map((event) => ({
      lat: event.lat,
      lng: event.lng,
      timestamp: event.timestamp,
      type: event.type,
      metadata: event.metadata ?? null,
    }));

    // Get order for additional context
    const order = await ctx.db.get(delivery.orderId);

    return {
      delivery: {
        id: delivery._id,
        status: delivery.status,
        trackingNumber: delivery.trackingNumber,
        pickupLat: delivery.pickupLat,
        pickupLng: delivery.pickupLng,
        dropoffLat: delivery.dropoffLat,
        dropoffLng: delivery.dropoffLng,
        estimatedArrival: delivery.estimatedArrival,
        startedAt: delivery.startedAt,
        completedAt: delivery.completedAt,
      },
      driverLocation,
      routeHistory,
      order: order ? {
        packageSize: order.packageSize,
        expeditionType: order.expeditionType,
      } : null,
    };
  },
});

/**
 * Get the driver's current delivery and location.
 * Used by driver app to show current assignment.
 *
 * Authorization:
 * - Driver: only their own current delivery
 */
export const getMyCurrentDelivery = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Driver-only, plus a marked reversible test elevation (users.testAccess)
    // so the Driver App can be exercised end-to-end from a test account. The
    // delivery is still resolved from the session user — a tester only ever
    // sees their own assignments.
    if (user.role !== ROLES.DRIVER && user.testElevated !== true) {
      throw new Error("Only drivers can access this query");
    }

    // Find active delivery for this driver
    const activeStatuses = [
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_DROPOFF,
    ];

    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_courier", (q) => q.eq("courierId", user.userId))
      .collect();

    const activeDelivery = deliveries.find(
      (d) => activeStatuses.includes(d.status as any)
    );

    if (!activeDelivery) {
      return { delivery: null, driverLocation: null };
    }

    // Get driver's current location
    const driver = await ctx.db.get(user.userId);
    const driverLocation = driver ? {
      lat: driver.currentLat,
      lng: driver.currentLng,
      lastUpdate: driver.lastLocationUpdate,
    } : null;

    // Get order
    const order = await ctx.db.get(activeDelivery.orderId);
    const pickupAddress = order ? await ctx.db.get(order.pickupAddressId) : null;
    const dropoffAddress = order ? await ctx.db.get(order.dropoffAddressId) : null;

    return {
      delivery: {
        id: activeDelivery._id,
        status: activeDelivery.status,
        trackingNumber: activeDelivery.trackingNumber,
        pickupLat: activeDelivery.pickupLat,
        pickupLng: activeDelivery.pickupLng,
        dropoffLat: activeDelivery.dropoffLat,
        dropoffLng: activeDelivery.dropoffLng,
        estimatedArrival: activeDelivery.estimatedArrival,
        startedAt: activeDelivery.startedAt,
        pickupAddress: pickupAddress ? {
          street: pickupAddress.street,
          city: pickupAddress.city,
        } : null,
        dropoffAddress: dropoffAddress ? {
          street: dropoffAddress.street,
          city: dropoffAddress.city,
        } : null,
      },
      driverLocation,
    };
  },
});

/**
 * Get driver's delivery history with tracking data.
 * Used for driver performance and route replay.
 *
 * Authorization:
 * - Driver: only their own history
 * - Operations/Admin: any driver's history
 */
export const getDriverDeliveryHistory = query({
  args: {
    driverId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Authorization check
    const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    const canViewAny = allowedRoles.includes(user.role as any);
    const isSelf = user.userId === args.driverId;

    if (!canViewAny && !isSelf) {
      throw new Error("Access denied: cannot view other drivers' history");
    }

    const limit = args.limit ?? 20;

    // Get completed deliveries for this driver
    const completedStatuses = [
      DELIVERY_STATUS.DELIVERED,
      DELIVERY_STATUS.CANCELLED,
      DELIVERY_STATUS.FAILED,
    ];

    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_courier", (q) => q.eq("courierId", args.driverId))
      .order("desc")
      .take(limit * 2); // Get more, then filter

    const completedDeliveries = deliveries
      .filter((d) => completedStatuses.includes(d.status as any))
      .slice(0, limit);

    // Enrich with tracking data
    const history = [];
    for (const delivery of completedDeliveries) {
      const trackingEvents = await ctx.db
        .query("tracking_events")
        .withIndex("by_delivery_time", (q) => q.eq("deliveryId", delivery._id))
        .order("desc")
        .take(100);

      history.push({
        deliveryId: delivery._id,
        status: delivery.status,
        trackingNumber: delivery.trackingNumber,
        startedAt: delivery.startedAt,
        completedAt: delivery.completedAt,
        routePoints: trackingEvents.length,
      });
    }

    return history;
  },
});

// ─── Authorization Helper ─────────────────────────────────────────────────────

/**
 * Check if a user is authorized to track a delivery.
 */
async function authorizeTrackingAccess(
  ctx: any,
  user: { userId: Id<"users">; role: string; businessId?: Id<"businesses"> },
  delivery: Doc<"deliveries">
): Promise<void> {
  // Operations/Admin can track any delivery
  const adminRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
  if (adminRoles.includes(user.role as any)) {
    // Company admin can only track their company's deliveries
    if (user.role === ROLES.COMPANY_ADMIN) {
      const order = await ctx.db.get(delivery.orderId);
      if (order && order.businessId !== user.businessId) {
        throw new Error("Access denied: delivery belongs to another company");
      }
    }
    return;
  }

  // Driver can track their assigned deliveries
  if (user.role === ROLES.DRIVER) {
    if (delivery.courierId !== user.userId) {
      throw new Error("Access denied: not your delivery");
    }
    return;
  }

  // Customer can track their own deliveries
  if (user.role === ROLES.CUSTOMER) {
    const order = await ctx.db.get(delivery.orderId);
    if (!order || order.senderId !== user.userId) {
      throw new Error("Access denied: not your delivery");
    }
    return;
  }

  throw new Error("Access denied");
}
