/**
 * Lasha Delivery State Machine
 *
 * This module implements the authoritative delivery lifecycle using Convex mutations.
 * The React frontend must NEVER directly write arbitrary delivery statuses.
 * The frontend requests an operation, and Convex validates and performs the state transition.
 *
 * Every transition:
 * 1. Validates authorization
 * 2. Validates current state
 * 3. Validates required data
 * 4. Updates authoritative state
 * 5. Records an event/audit entry
 * 6. Is safe against duplicate requests
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import {
  DELIVERY_STATUS,
  VALID_TRANSITIONS,
  TRANSITION_PERMISSIONS,
  deliveryStatusValidator,
} from "../schema";
import {
  requireAuth,
  requirePermission,
  getCurrentAuthUser,
  AuthUser,
} from "../auth/authorization";
import { PERMISSIONS, ROLES } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";
import { internal } from "../_generated/api";
import { createLogger, LOG_CATEGORIES, generateCorrelationId } from "../logging/service";

// ─── Helper Functions ─────────────────────────────────────────────────────────

type DeliveryStatus = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

/**
 * Validate that a state transition is allowed.
 */
function validateTransition(from: string, to: string): void {
  const validNextStates = VALID_TRANSITIONS[from as DeliveryStatus];
  if (!validNextStates || !validNextStates.includes(to as DeliveryStatus)) {
    throw new Error(
      `Invalid transition: cannot go from "${from}" to "${to}"`
    );
  }
}

/**
 * Validate that the user has permission for this transition.
 */
function validateTransitionPermission(
  from: string,
  to: string,
  userRole: string
): void {
  const transitionKey = `${from}->${to}`;
  const allowedRoles = TRANSITION_PERMISSIONS[transitionKey];

  if (!allowedRoles) {
    throw new Error(
      `No permissions defined for transition "${transitionKey}"`
    );
  }

  if (!allowedRoles.includes(userRole)) {
    throw new Error(
      `Access denied: role "${userRole}" cannot perform transition "${transitionKey}"`
    );
  }
}

/**
 * Record a delivery event in the tracking_events table.
 */
async function recordDeliveryEvent(
  ctx: any,
  deliveryId: Id<"deliveries">,
  eventType: string,
  fromStatus: string,
  toStatus: string,
  userId: Id<"users">,
  metadata?: string
): Promise<void> {
  await ctx.db.insert("tracking_events", {
    deliveryId,
    type: eventType as any,
    timestamp: Date.now(),
    metadata: JSON.stringify({
      action: "status_change",
      fromStatus,
      toStatus,
      userId,
      ...JSON.parse(metadata || "{}"),
    }),
  });
}

// ─── Public Mutations ─────────────────────────────────────────────────────────

/**
 * Create an order and its delivery in one step.
 *
 * This is the primary entry point for the Request Delivery form.
 * It creates addresses, an order, and a delivery atomically.
 */
export const createOrderAndDelivery = mutation({
  args: {
    orderName: v.string(),
    parcelType: v.optional(v.string()),
    expeditionType: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    weight: v.optional(v.number()),
    pickupAddress: v.string(),
    dropoffAddress: v.string(),
    pickupLat: v.number(),
    pickupLng: v.number(),
    dropoffLat: v.number(),
    dropoffLng: v.number(),
    scheduledTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // 2. Create pickup address
    const pickupAddressId = await ctx.db.insert("addresses", {
      userId,
      label: "Pickup",
      street: args.pickupAddress,
      city: "",
      zip: "",
      lat: args.pickupLat,
      lng: args.pickupLng,
    });

    // 3. Create dropoff address
    const dropoffAddressId = await ctx.db.insert("addresses", {
      userId,
      label: "Dropoff",
      street: args.dropoffAddress,
      city: "",
      zip: "",
      lat: args.dropoffLat,
      lng: args.dropoffLng,
    });

    // 4. Create order
    const now = Date.now();
    const orderId = await ctx.db.insert("orders", {
      senderId: userId,
      businessId: user.businessId,
      pickupAddressId,
      dropoffAddressId,
      status: "pending",
      description: args.orderName,
      packageSize: args.weight && args.weight > 30 ? "large" : args.weight && args.weight > 5 ? "medium" : "small",
      parcelType: args.parcelType as any,
      expeditionType: args.expeditionType as any,
      width: args.width,
      height: args.height,
      weight: args.weight,
      price: 0, // Will be calculated by pricing service
      scheduledTime: args.scheduledTime,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Generate tracking number
    const trackingNumber = `LSH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // 6. Create delivery in REQUESTED state
    const deliveryId = await ctx.db.insert("deliveries", {
      orderId,
      status: DELIVERY_STATUS.REQUESTED,
      trackingNumber,
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      dropoffLat: args.dropoffLat,
      dropoffLng: args.dropoffLng,
      startedAt: now,
    });

    // 7. Update order status
    await ctx.db.patch(orderId, {
      status: "confirmed",
      trackingNumber,
      updatedAt: now,
    });

    // 8. Record audit
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: userId,
      actorRole: user.role ?? "customer",
      deliveryId,
      orderId,
      action: AUDIT_ACTIONS.DELIVERY_CREATED,
      fromStatus: "none",
      toStatus: DELIVERY_STATUS.REQUESTED,
      metadata: JSON.stringify({ trackingNumber, orderName: args.orderName }),
    });

    return { orderId, deliveryId, trackingNumber };
  },
});

/**
 * Create a new delivery request.
 *
 * Transitions: (any) -> REQUESTED
 * Required: orderId, pickup/dropoff coordinates
 * Auth: customer, company_admin, operations
 */
export const createDelivery = mutation({
  args: {
    orderId: v.id("orders"),
    pickupLat: v.number(),
    pickupLng: v.number(),
    dropoffLat: v.number(),
    dropoffLng: v.number(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // 2. Validate the order exists and user has access
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Check ownership: user must be the sender or have company access
    if (order.senderId !== userId) {
      // Check if user is company admin or operations for this order's business
      if (
        user.role !== ROLES.SUPER_ADMIN &&
        user.role !== ROLES.OPERATIONS &&
        user.role !== ROLES.COMPANY_ADMIN
      ) {
        throw new Error("Access denied: not your order");
      }
      if (
        user.role === ROLES.COMPANY_ADMIN &&
        order.businessId !== user.businessId
      ) {
        throw new Error("Access denied: order belongs to another company");
      }
    }

    // 3. Check if delivery already exists for this order
    const existingDelivery = await ctx.db
      .query("deliveries")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .unique();

    if (existingDelivery) {
      throw new Error("Delivery already exists for this order");
    }

    // 4. Generate tracking number
    const trackingNumber = `LSH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // 5. Create delivery in REQUESTED state
    const now = Date.now();
    const deliveryId = await ctx.db.insert("deliveries", {
      orderId: args.orderId,
      status: DELIVERY_STATUS.REQUESTED,
      trackingNumber,
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      dropoffLat: args.dropoffLat,
      dropoffLng: args.dropoffLng,
      startedAt: now,
    });

    // 6. Update order status
    await ctx.db.patch(args.orderId, {
      status: "confirmed",
      updatedAt: now,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      deliveryId,
      "order_placed",
      "none",
      DELIVERY_STATUS.REQUESTED,
      userId,
      JSON.stringify({ orderId: args.orderId })
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: userId,
      actorRole: user.role,
      deliveryId,
      orderId: args.orderId,
      action: AUDIT_ACTIONS.DELIVERY_CREATED,
      fromStatus: "none",
      toStatus: DELIVERY_STATUS.REQUESTED,
      metadata: JSON.stringify({ trackingNumber, pickupLat: args.pickupLat, pickupLng: args.pickupLng, dropoffLat: args.dropoffLat, dropoffLng: args.dropoffLng }),
    });

    return { deliveryId, trackingNumber };
  },
});

/**
 * Move delivery to pending dispatch.
 *
 * Transitions: REQUESTED -> PENDING_DISPATCH
 * Auth: customer (owner), company_admin, operations
 */
export const dispatchDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.REQUESTED) {
      throw new Error(
        `Cannot dispatch: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.REQUESTED}"`
      );
    }

    // 4. Validate transition permission
    validateTransitionPermission(
      delivery.status,
      DELIVERY_STATUS.PENDING_DISPATCH,
      user.role
    );

    // 5. Validate ownership (if customer)
    if (user.role === ROLES.CUSTOMER) {
      const order = await ctx.db.get(delivery.orderId);
      if (!order || order.senderId !== userId) {
        throw new Error("Access denied: not your delivery");
      }
    }

    // 6. Perform transition
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.PENDING_DISPATCH,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.PENDING_DISPATCH,
      userId
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: userId,
      actorRole: user.role,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_DISPATCHED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.PENDING_DISPATCH,
    });

    return { success: true };
  },
});

/**
 * Assign a driver to a delivery.
 *
 * Transitions: PENDING_DISPATCH -> ASSIGNED
 * Auth: operations, company_admin, super_admin
 */
export const assignDriver = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    driverId: v.id("users"),
    vehicleId: v.id("vehicles"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate with required permission
    const user = await requirePermission(ctx, PERMISSIONS.DELIVERY_ASSIGN);

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.PENDING_DISPATCH) {
      throw new Error(
        `Cannot assign: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.PENDING_DISPATCH}"`
      );
    }

    // 4. Validate driver exists and is available
    const driver = await ctx.db.get(args.driverId);
    if (!driver) throw new Error("Driver not found");

    const driverProfile = await ctx.db
      .query("driver_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.driverId))
      .unique();

    if (!driverProfile || !driverProfile.isAvailable) {
      throw new Error("Driver is not available");
    }

    // 5. Validate vehicle exists and belongs to driver
    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle) throw new Error("Vehicle not found");
    if (vehicle.driverId !== args.driverId) {
      throw new Error("Vehicle does not belong to this driver");
    }

    // 6. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.ASSIGNED);

    // 7. Perform transition transactionally
    const now = Date.now();

    // Update delivery
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.ASSIGNED,
      courierId: args.driverId,
      vehicleId: args.vehicleId,
      assignedAt: now,
    });

    // 8. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.ASSIGNED,
      user.userId,
      JSON.stringify({ driverId: args.driverId, vehicleId: args.vehicleId })
    );

    // 9. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user.userId,
      actorRole: user.role,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_ASSIGNED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.ASSIGNED,
      metadata: JSON.stringify({ driverId: args.driverId, vehicleId: args.vehicleId }),
    });

    return { success: true };
  },
});

/**
 * Driver accepts an assignment.
 *
 * Transitions: ASSIGNED -> DRIVER_ACCEPTED
 * Auth: driver (must be the assigned driver)
 * Handles concurrent acceptance: only one driver can accept
 */
export const acceptAssignment = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can accept assignments");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.ASSIGNED) {
      throw new Error(
        `Cannot accept: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.ASSIGNED}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.DRIVER_ACCEPTED);

    // 6. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.DRIVER_ACCEPTED,
      acceptedAt: now,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      user
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_ACCEPTED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.DRIVER_ACCEPTED,
    });

    return { success: true };
  },
});

/**
 * Driver rejects an assignment.
 *
 * Transitions: ASSIGNED -> REASSIGNMENT_REQUIRED
 * Auth: driver (must be the assigned driver)
 */
export const rejectAssignment = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can reject assignments");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.ASSIGNED) {
      throw new Error(
        `Cannot reject: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.ASSIGNED}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.REASSIGNMENT_REQUIRED);

    // 6. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      rejectedAt: now,
      rejectionReason: args.reason,
      courierId: undefined, // Clear assignment
      vehicleId: undefined,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      user,
      JSON.stringify({ reason: args.reason })
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_REJECTED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      metadata: JSON.stringify({ reason: args.reason }),
    });

    return { success: true };
  },
});

/**
 * Driver is en route to pickup location.
 *
 * Transitions: DRIVER_ACCEPTED -> EN_ROUTE_TO_PICKUP
 * Auth: driver (must be the assigned driver)
 */
export const startEnRouteToPickup = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can start en route");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.DRIVER_ACCEPTED) {
      throw new Error(
        `Cannot start en route: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.DRIVER_ACCEPTED}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.EN_ROUTE_TO_PICKUP);

    // 6. Perform transition
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      user
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_EN_ROUTE,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
    });

    return { success: true };
  },
});

/**
 * Driver arrived at pickup location.
 *
 * Transitions: EN_ROUTE_TO_PICKUP -> AT_PICKUP
 * Auth: driver (must be the assigned driver)
 */
export const arriveAtPickup = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can arrive at pickup");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.EN_ROUTE_TO_PICKUP) {
      throw new Error(
        `Cannot arrive at pickup: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.EN_ROUTE_TO_PICKUP}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.AT_PICKUP);

    // 6. Perform transition
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.AT_PICKUP,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.AT_PICKUP,
      user
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_ARRIVED_PICKUP,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.AT_PICKUP,
    });

    return { success: true };
  },
});

/**
 * Driver picked up the package.
 *
 * Transitions: AT_PICKUP -> PICKED_UP
 * Auth: driver (must be the assigned driver)
 */
export const pickupPackage = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can pickup packages");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.AT_PICKUP) {
      throw new Error(
        `Cannot pickup: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.AT_PICKUP}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.PICKED_UP);

    // 6. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.PICKED_UP,
      startedAt: now,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.PICKED_UP,
      user
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_PICKED_UP,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.PICKED_UP,
    });

    return { success: true };
  },
});

/**
 * Start the trip to dropoff.
 *
 * Transitions: PICKED_UP -> IN_TRANSIT
 * Auth: driver (must be the assigned driver)
 */
export const startTrip = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can start trips");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.PICKED_UP) {
      throw new Error(
        `Cannot start trip: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.PICKED_UP}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.IN_TRANSIT);

    // 6. Perform transition
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.IN_TRANSIT,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "in_transit",
      delivery.status,
      DELIVERY_STATUS.IN_TRANSIT,
      user
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_IN_TRANSIT,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.IN_TRANSIT,
    });

    return { success: true };
  },
});

/**
 * Driver arrived at dropoff location.
 *
 * Transitions: IN_TRANSIT -> AT_DROPOFF
 * Auth: driver (must be the assigned driver)
 */
export const arriveAtDropoff = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can arrive at dropoff");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.IN_TRANSIT) {
      throw new Error(
        `Cannot arrive at dropoff: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.IN_TRANSIT}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.AT_DROPOFF);

    // 6. Perform transition
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.AT_DROPOFF,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "delivered",
      delivery.status,
      DELIVERY_STATUS.AT_DROPOFF,
      user
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_ARRIVED_DROPOFF,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.AT_DROPOFF,
    });

    return { success: true };
  },
});

/**
 * Complete the delivery.
 *
 * Transitions: AT_DROPOFF -> DELIVERED
 * Auth: driver (must be the assigned driver)
 */
export const completeDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate as driver
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role;
    if (userRole !== ROLES.DRIVER && userRole !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: only drivers can complete deliveries");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    if (delivery.status !== DELIVERY_STATUS.AT_DROPOFF) {
      throw new Error(
        `Cannot complete: delivery is in "${delivery.status}" state, expected "${DELIVERY_STATUS.AT_DROPOFF}"`
      );
    }

    // 4. Validate driver is the assigned driver (or super admin)
    if (userRole !== ROLES.SUPER_ADMIN && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Validate transition
    validateTransition(delivery.status, DELIVERY_STATUS.DELIVERED);

    // 6. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.DELIVERED,
      completedAt: now,
      actualArrival: now,
    });

    // 7. Update order status
    await ctx.db.patch(delivery.orderId, {
      status: "delivered",
      updatedAt: now,
    });

    // 8. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "delivered",
      delivery.status,
      DELIVERY_STATUS.DELIVERED,
      user
    );

    // 9. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_COMPLETED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.DELIVERED,
    });

    return { success: true };
  },
});

/**
 * Cancel a delivery.
 *
 * Transitions: (most states) -> CANCELLED
 * Auth: customer (owner), company_admin, operations, super_admin
 */
export const cancelDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await requireAnyCancellationRole(ctx);

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state allows cancellation
    const cancellableStates = [
      DELIVERY_STATUS.REQUESTED,
      DELIVERY_STATUS.PENDING_DISPATCH,
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
    ];

    if (!cancellableStates.includes(delivery.status as any)) {
      throw new Error(
        `Cannot cancel: delivery is in "${delivery.status}" state`
      );
    }

    // 4. Validate ownership (if customer)
    if (user.role === ROLES.CUSTOMER) {
      const order = await ctx.db.get(delivery.orderId);
      if (!order || order.senderId !== user.userId) {
        throw new Error("Access denied: not your delivery");
      }
    }

    // 5. Validate company access (if company_admin)
    if (user.role === ROLES.COMPANY_ADMIN) {
      const order = await ctx.db.get(delivery.orderId);
      if (!order || order.businessId !== user.businessId) {
        throw new Error("Access denied: delivery belongs to another company");
      }
    }

    // 6. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.CANCELLED,
      completedAt: now,
    });

    // 7. Update order status
    await ctx.db.patch(delivery.orderId, {
      status: "cancelled",
      updatedAt: now,
    });

    // 8. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "delivered",
      delivery.status,
      DELIVERY_STATUS.CANCELLED,
      user.userId,
      JSON.stringify({ reason: args.reason })
    );

    // 9. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user.userId,
      actorRole: user.role,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_CANCELLED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.CANCELLED,
      metadata: JSON.stringify({ reason: args.reason }),
    });

    return { success: true };
  },
});

/**
 * Mark a delivery as failed.
 *
 * Transitions: AT_PICKUP, PICKED_UP, IN_TRANSIT, AT_DROPOFF -> FAILED
 * Auth: driver, operations, company_admin, super_admin
 */
export const failDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role ?? "unknown";
    const allowedRoles = [
      ROLES.DRIVER,
      ROLES.OPERATIONS,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
    ];

    if (!allowedRoles.includes(userRole as any)) {
      throw new Error("Access denied: not authorized to mark delivery as failed");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    const failableStates = [
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_DROPOFF,
    ];

    if (!failableStates.includes(delivery.status as any)) {
      throw new Error(
        `Cannot fail: delivery is in "${delivery.status}" state`
      );
    }

    // 4. Validate driver ownership (if driver)
    if (userRole === ROLES.DRIVER && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.FAILED,
      completedAt: now,
    });

    // 6. Update order status
    await ctx.db.patch(delivery.orderId, {
      status: "cancelled",
      updatedAt: now,
    });

    // 7. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "delivered",
      delivery.status,
      DELIVERY_STATUS.FAILED,
      user,
      JSON.stringify({ reason: args.reason })
    );

    // 8. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_FAILED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.FAILED,
      metadata: JSON.stringify({ reason: args.reason }),
    });

    return { success: true };
  },
});

/**
 * Request reassignment for a delivery.
 *
 * Transitions: ASSIGNED, DRIVER_ACCEPTED, EN_ROUTE_TO_PICKUP -> REASSIGNMENT_REQUIRED
 * Auth: driver, operations, company_admin, super_admin
 */
export const requestReassignment = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const user = await requireAuth(ctx);
    const currentUser = await ctx.db.get(user);
    if (!currentUser) throw new Error("User not found");

    const userRole = (currentUser as Doc<"users">).role ?? "unknown";
    const allowedRoles = [
      ROLES.DRIVER,
      ROLES.OPERATIONS,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
    ];

    if (!allowedRoles.includes(userRole as any)) {
      throw new Error("Access denied: not authorized to request reassignment");
    }

    // 2. Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // 3. Validate current state
    const reassignableStates = [
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
    ];

    if (!reassignableStates.includes(delivery.status as any)) {
      throw new Error(
        `Cannot reassign: delivery is in "${delivery.status}" state`
      );
    }

    // 4. Validate driver ownership (if driver)
    if (userRole === ROLES.DRIVER && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 5. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      rejectedAt: now,
      rejectionReason: args.reason,
      courierId: undefined,
      vehicleId: undefined,
    });

    // 6. Record event
    await recordDeliveryEvent(
      ctx,
      args.deliveryId,
      "picked_up",
      delivery.status,
      DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      user,
      JSON.stringify({ reason: args.reason })
    );

    // 7. Record audit event
    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: user,
      actorRole: userRole,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      action: AUDIT_ACTIONS.DELIVERY_REASSIGNED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      metadata: JSON.stringify({ reason: args.reason }),
    });

    return { success: true };
  },
});

// ─── Helper for Cancel Authorization ──────────────────────────────────────────

async function requireAnyCancellationRole(ctx: any): Promise<AuthUser> {
  const user = await getCurrentAuthUser(ctx);
  if (!user) throw new Error("Authentication required");

  const allowedRoles = [
    ROLES.CUSTOMER,
    ROLES.COMPANY_ADMIN,
    ROLES.OPERATIONS,
    ROLES.SUPER_ADMIN,
  ];

  if (!allowedRoles.includes(user.role as any)) {
    throw new Error("Access denied: not authorized to cancel deliveries");
  }

  return user;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get delivery by ID with authorization check.
 */
export const getDelivery = query({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Check access based on role
    if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
      return delivery;
    }

    if (user.role === ROLES.DRIVER) {
      if (delivery.courierId !== user.userId) {
        throw new Error("Access denied: not your delivery");
      }
      return delivery;
    }

    if (user.role === ROLES.COMPANY_ADMIN) {
      const order = await ctx.db.get(delivery.orderId);
      if (order && order.businessId === user.businessId) {
        return delivery;
      }
      throw new Error("Access denied: delivery belongs to another company");
    }

    if (user.role === ROLES.CUSTOMER) {
      const order = await ctx.db.get(delivery.orderId);
      if (order && order.senderId === user.userId) {
        return delivery;
      }
      throw new Error("Access denied: not your delivery");
    }

    throw new Error("Access denied");
  },
});

/**
 * Get delivery by tracking number (public query).
 */
export const getDeliveryByTracking = query({
  args: {
    trackingNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_tracking", (q) => q.eq("trackingNumber", args.trackingNumber))
      .unique();

    if (!delivery) throw new Error("Delivery not found");

    // Return limited information for public tracking
    return {
      trackingNumber: delivery.trackingNumber,
      status: delivery.status,
      estimatedArrival: delivery.estimatedArrival,
      startedAt: delivery.startedAt,
      completedAt: delivery.completedAt,
    };
  },
});

/**
 * Get deliveries for the current user based on their role.
 */
export const getMyDeliveries = query({
  args: {
    status: v.optional(deliveryStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    let q;

    if (user.role === ROLES.DRIVER) {
      q = ctx.db
        .query("deliveries")
        .withIndex("by_courier", (q) => q.eq("courierId", user.userId));
    } else if (user.role === ROLES.CUSTOMER) {
      // Get user's orders first, then their deliveries
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_sender", (q) => q.eq("senderId", user.userId))
        .collect();

      q = ctx.db.query("deliveries");
    } else if (
      user.role === ROLES.COMPANY_ADMIN ||
      user.role === ROLES.FLEET_MANAGER
    ) {
      q = ctx.db.query("deliveries");
    } else {
      // Super admin and operations see all
      q = ctx.db.query("deliveries");
    }

    // Apply status filter if provided
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }

    // Apply limit
    const limit = args.limit ?? 50;
    return await q.order("desc").take(limit);
  },
});
