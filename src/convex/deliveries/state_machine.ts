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

import { mutation, query, MutationCtx, QueryCtx } from "../_generated/server";
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
import { waybillNumberFor } from "./waybills";
import { AUDIT_ACTIONS } from "../audit/service";
import { internal } from "../_generated/api";
import { createLogger, LOG_CATEGORIES, generateCorrelationId } from "../logging/service";
import type { NotificationEventType } from "../notifications/service";

// ─── Delivery display details (shared resolver) ──────────────────────
// Resolve the human-readable route/parcel details for a delivery from the
// authoritative order + address records. Used by every customer-facing read
// path so UIs never fall back to raw coordinates.
//
// Ctx is structurally typed (only ctx.db.get is used) so the resolver works
// from both query and mutation contexts.
async function resolveDeliveryDetails(
  ctx: { db: Pick<QueryCtx["db"], "get" | "query"> },
  delivery: Doc<"deliveries">,
): Promise<DeliveryDisplayDetails> {
  const order = await ctx.db.get(delivery.orderId);
  const pickup = order ? await ctx.db.get(order.pickupAddressId) : null;
  const dropoff = order ? await ctx.db.get(order.dropoffAddressId) : null;
  const business = order?.businessId ? await ctx.db.get(order.businessId) : null;
  const sender = order ? await ctx.db.get(order.senderId) : null;

  // Assigned driver's profile + active vehicle — powers the Activity Centre's
  // Driver/Vehicle tabs and the ops views. Null until a driver is assigned.
  const driverProfile = delivery.courierId
    ? await ctx.db
        .query("driver_profiles")
        .withIndex("by_user", (q) => q.eq("userId", delivery.courierId!))
        .first()
    : null;
  const driverUser = delivery.courierId ? await ctx.db.get(delivery.courierId) : null;
  const vehicle =
    driverProfile?.currentVehicleId != null
      ? await ctx.db.get(driverProfile.currentVehicleId)
      : null;

  return {
    description: order?.description ?? null,
    businessName: business?.name ?? null,
    packageSize: order?.packageSize ?? null,
    parcelType: order?.parcelType ?? null,
    expeditionType: order?.expeditionType ?? null,
    width: order?.width ?? null,
    height: order?.height ?? null,
    weight: order?.weight ?? null,
    price: order?.price ?? null,
    scheduledTime: order?.scheduledTime ?? null,
    createdAt: order?.createdAt ?? null,
    recipientName: order?.recipientName ?? null,
    recipientPhone: order?.recipientPhone ?? null,
    pickupAddress: pickup?.street ?? null,
    pickupCity: pickup?.city ?? null,
    dropoffAddress: dropoff?.street ?? null,
    dropoffCity: dropoff?.city ?? null,
    senderName: sender?.name ?? null,
    senderEmail: sender?.email ?? null,
    senderPhone: sender?.phone ?? null,
    driverName: driverUser?.name ?? null,
    driverPhone: driverUser?.phone ?? null,
    driverLicenseClass: driverProfile?.licenseClass ?? null,
    driverRating: driverProfile?.rating ?? null,
    driverTotalTrips: driverProfile?.totalTrips ?? null,
    vehicleMake: vehicle?.make ?? null,
    vehicleModel: vehicle?.model ?? null,
    vehicleYear: vehicle?.year ?? null,
    vehicleRegistration: vehicle?.registration ?? null,
    vehicleCapacityKg: vehicle?.capacity ?? null,
    vehicleBreaking: vehicle?.breaking ?? null,
    vehicleExpress: vehicle?.express ?? null,
    vehicleFlammable: vehicle?.flammable ?? null,
    vehicleTrailer: vehicle?.trailer ?? null,
  };
}

interface DeliveryDisplayDetails {
  description: string | null;
  businessName: string | null;
  packageSize: string | null;
  parcelType: string | null;
  expeditionType: string | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  price: number | null;
  scheduledTime: number | null;
  createdAt: number | null;
  recipientName: string | null;
  recipientPhone: string | null;
  pickupAddress: string | null;
  pickupCity: string | null;
  dropoffAddress: string | null;
  dropoffCity: string | null;
  senderName: string | null;
  senderEmail: string | null;
  senderPhone: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLicenseClass: string | null;
  driverRating: number | null;
  driverTotalTrips: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleRegistration: string | null;
  vehicleCapacityKg: number | null;
  vehicleBreaking: boolean | null;
  vehicleExpress: boolean | null;
  vehicleFlammable: boolean | null;
  vehicleTrailer: boolean | null;
}

// ─── Delivery notification fan-out ──────────────────────────────────────────
// Domain-event → in-app notification bridge. Recipients are always resolved
// server-side from authoritative relationships (order sender, assigned
// courier) — never accepted from the client. `sendDeliveryNotification` is
// idempotent per (eventType, deliveryId, user), so retried transitions cannot
// create duplicate notifications. Notification failure is logged, never
// allowed to fail the domain transaction itself.
async function notifyDeliveryEvent(
  ctx: MutationCtx,
  eventType: NotificationEventType,
  deliveryId: Id<"deliveries">,
  extra?: { recipientUserIds?: Id<"users">[]; templateData?: Record<string, string> },
): Promise<void> {
  try {
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery) return;

    const recipientUserIds: Id<"users">[] = extra?.recipientUserIds ?? [];

    // Customer recipient: the order's authoritative sender.
    if (extra?.recipientUserIds === undefined) {
      const order = await ctx.db.get(delivery.orderId);
      if (order?.senderId) recipientUserIds.push(order.senderId);
    }

    if (recipientUserIds.length === 0) return;

    await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
      deliveryId,
      eventType,
      recipientUserIds,
      templateData: extra?.templateData,
    });
  } catch (error) {
    console.error(
      `[notifyDeliveryEvent] Failed to send "${eventType}" notification for delivery ${deliveryId}`,
      error,
    );
  }
}

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

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Calculate haversine distance between two coordinates in kilometers.
 * Used for pricing when no routing distance is available.
 */
function haversineDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
    // Who the package is being sent to (display + POD reference).
    recipientName: v.optional(v.string()),
    recipientPhone: v.optional(v.string()),
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

    // 4. Create order (price placeholder — will be set by pricing engine)
    const now = Date.now();
    const orderId = await ctx.db.insert("orders", {
      senderId: userId,
      businessId: user.businessId,
      pickupAddressId,
      dropoffAddressId,
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      status: "pending",
      description: args.orderName,
      packageSize: args.weight && args.weight > 30 ? "large" : args.weight && args.weight > 5 ? "medium" : "small",
      parcelType: args.parcelType as any,
      expeditionType: args.expeditionType as any,
      width: args.width,
      height: args.height,
      weight: args.weight,
      price: 0,
      scheduledTime: args.scheduledTime,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Calculate price using the existing pricing engine.
    // This MUST succeed for a delivery to be created.
    // If it throws (e.g. no matching pricing rule), the entire mutation
    // rolls back — no orphaned order, addresses, or delivery.
    const distanceKm = haversineDistanceKm(
      args.pickupLat, args.pickupLng,
      args.dropoffLat, args.dropoffLng
    );
    const quote: { quoteId: any; totalCharge: number; driverEarnings: number; platformFee: number } = await ctx.runMutation(
      internal.pricing.service.calculateAndStoreQuote,
      { orderId, distanceKm }
    );
    const orderPrice: number = quote.totalCharge;

    // 6. Generate tracking number
    const trackingNumber = `LSH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // 7. Create delivery in REQUESTED state
    const deliveryId = await ctx.db.insert("deliveries", {
      orderId,
      status: DELIVERY_STATUS.REQUESTED,
      trackingNumber,
      waybillNumber: waybillNumberFor(trackingNumber),
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      dropoffLat: args.dropoffLat,
      dropoffLng: args.dropoffLng,
      startedAt: now,
    });

    // 8. Update order status
    await ctx.db.patch(orderId, {
      status: "confirmed",
      trackingNumber,
      updatedAt: now,
    });

    // 8b. Write the order_placed tracking event — the tracking page's
    // "placed" milestone derives from this event log entry. (Pump finding:
    // this creation path never wrote the event, so every order created
    // through the Request Delivery flow showed a tracking timeline that
    // began at "picked up" with no placed milestone.)
    await recordDeliveryEvent(
      ctx,
      deliveryId,
      "order_placed",
      "none",
      DELIVERY_STATUS.REQUESTED,
      userId,
      JSON.stringify({ orderId })
    );

    // 9. Record audit
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

    // 10. Notify the customer their delivery request was received.
    await notifyDeliveryEvent(ctx, "delivery_created", deliveryId);

    return { orderId, deliveryId, trackingNumber, price: orderPrice };
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
      waybillNumber: waybillNumberFor(trackingNumber),
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

    // 9. Notify the customer their delivery request was received.
    await notifyDeliveryEvent(ctx, "delivery_created", deliveryId);

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

    // 2b. Resolve the delivery's order (the authoritative company-owner
    // record) and enforce company ownership for COMPANY_ADMIN — the same
    // rule as dispatchDelivery/reassignDelivery/requestReassignment. The
    // actor's company comes from the session user (never client args); the
    // delivery's company comes from its order. Fails closed: a company
    // admin with no company association, a missing order, or an order whose
    // business cannot be established is denied. Runs before any write.
    const order = await ctx.db.get(delivery.orderId);
    if (!order) throw new Error("Order not found");

    if ((user.role as string) === ROLES.COMPANY_ADMIN) {
      const actorBusinessId = user.businessId;
      if (!actorBusinessId || !order.businessId || order.businessId !== actorBusinessId) {
        throw new Error("Access denied: delivery belongs to another company");
      }
    }

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

    // 10. Notify the customer their driver has been assigned.
    await notifyDeliveryEvent(ctx, "delivery_assigned", args.deliveryId, {
      templateData: { driverName: driver.name ?? "A driver" },
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

    // 9. Notify the customer the driver accepted their delivery.
    await notifyDeliveryEvent(ctx, "delivery_accepted", args.deliveryId);

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

    // 9. Notify the customer of the delay (existing template wording).
    await notifyDeliveryEvent(ctx, "delivery_rejected", args.deliveryId);

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

    // 9. Notify the customer the driver is en route to pickup.
    await notifyDeliveryEvent(ctx, "delivery_en_route_pickup", args.deliveryId);

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

    // 9. Notify the customer the driver arrived at pickup.
    await notifyDeliveryEvent(ctx, "delivery_arrived_pickup", args.deliveryId);

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

    // 9. Notify the customer their package was picked up.
    await notifyDeliveryEvent(ctx, "delivery_picked_up", args.deliveryId);

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

    // 9. Notify the customer their delivery is in transit.
    await notifyDeliveryEvent(ctx, "delivery_in_transit", args.deliveryId);

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

    // 9. Notify the customer the driver arrived at the destination.
    await notifyDeliveryEvent(ctx, "delivery_arrived_dropoff", args.deliveryId);

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

    // 5b. Require proof of delivery before completion.
    // The server is authoritative: completion is blocked until a POD record
    // exists for this delivery (created via pod.service.createPOD or
    // completeDeliveryWithPOD). The UI alone never grants completion.
    const existingPOD = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .order("desc")
      .first();
    if (!existingPOD) {
      throw new Error(
        "Proof of delivery is required before completing this delivery. Submit the POD first."
      );
    }

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

    // 10. Notify the customer their delivery is complete.
    await notifyDeliveryEvent(ctx, "delivery_completed", args.deliveryId);

    // 11. Create the driver settlement (POD validation → completion →
    // settlement). Runs inside the same mutation transaction: a settlement
    // failure fails the completion (never an apparently-completed delivery
    // with missing financial records), and the deterministic
    // settlement-${deliveryId} key makes retries safe. The driver is the
    // delivery's authoritative assigned courier — never a client-supplied ID.
    if (delivery.courierId) {
      const courierId = delivery.courierId;
      await ctx.runMutation(
        internal.pricing.service.createSettlement,
        {
          deliveryId: args.deliveryId,
          orderId: delivery.orderId,
          driverId: delivery.courierId,
        }
      );

      // Completion stats: the driver profile's trip counter and lifetime
      // rating aggregate must reflect completed work — the Operations Drivers
      // tab and dispatch scoring both read them. (Pump finding: settlements
      // were created but totalTrips stayed 0 forever, so freshly approved
      // drivers showed zero experience no matter how much they drove.)
      const courierProfile = await ctx.db
        .query("driver_profiles")
        .withIndex("by_user", (q) => q.eq("userId", courierId))
        .unique();
      if (courierProfile) {
        await ctx.db.patch(courierProfile._id, {
          totalTrips: (courierProfile.totalTrips ?? 0) + 1,
        });
      }
    }

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

    // 10. Notify the customer their delivery was cancelled.
    await notifyDeliveryEvent(ctx, "delivery_cancelled", args.deliveryId, {
      templateData: args.reason ? { reason: args.reason } : undefined,
    });

    // 11. Compensation policy (explicit): CANCELLED deliveries earn the
    // driver NOTHING. Cancellations are only permitted before pickup, so no
    // work has been performed. There is no partial-compensation rule in this
    // repository, so zero is encoded deliberately — no settlement record is
    // created here. See docs/driver-earnings-settlement.md.

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

    // 9. Notify the customer their delivery failed.
    await notifyDeliveryEvent(ctx, "delivery_failed", args.deliveryId, {
      templateData: { reason: args.reason ?? "See your delivery page for details" },
    });

    // 10. Compensation policy (explicit): FAILED deliveries earn the driver
    // NOTHING. No partial-compensation business rule exists in this
    // repository, so zero is encoded deliberately — no settlement record is
    // created here. This is a documented, unresolved business policy: if the
    // business later decides failed runs deserve partial pay, it belongs in a
    // new policy decision, not in this code path silently. See
    // docs/driver-earnings-settlement.md.

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

    // 2. Get delivery and its order (the order is the authoritative
    // company-owner record for the delivery)
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    const order = await ctx.db.get(delivery.orderId);
    if (!order) throw new Error("Order not found");

    // 3. Check company ownership (if company admin) — same authoritative rule
    // as dispatchDelivery/reassignDelivery: the actor's company is resolved
    // server-side from the session user (never from client args), and the
    // delivery's company is resolved from the order record. Fails closed:
    // a company admin with no company association, or an order whose company
    // ownership cannot be established, is denied.
    if (userRole === ROLES.COMPANY_ADMIN) {
      const actorBusinessId = (currentUser as Doc<"users">).businessId;
      if (!actorBusinessId || order.businessId !== actorBusinessId) {
        throw new Error("Access denied: delivery belongs to another company");
      }
    }

    // 4. Validate current state
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

    // 5. Validate driver ownership (if driver)
    if (userRole === ROLES.DRIVER && delivery.courierId !== user) {
      throw new Error("Access denied: this delivery is not assigned to you");
    }

    // 6. Perform transition
    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      rejectedAt: now,
      rejectionReason: args.reason,
      courierId: undefined,
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
      action: AUDIT_ACTIONS.DELIVERY_REASSIGNED,
      fromStatus: delivery.status,
      toStatus: DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      metadata: JSON.stringify({ reason: args.reason }),
    });

    // 9. Notify the customer the delivery is being reassigned.
    await notifyDeliveryEvent(ctx, "delivery_reassigned", args.deliveryId);

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

    // Check access based on role. Every authorized branch returns the delivery
    // enriched with display details (addresses, parcel info) — the details are
    // derived from the same order the role check just validated access to.
    if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
      return { ...delivery, details: await resolveDeliveryDetails(ctx, delivery) };
    }

    if (user.role === ROLES.DRIVER) {
      if (delivery.courierId !== user.userId) {
        throw new Error("Access denied: not your delivery");
      }
      return { ...delivery, details: await resolveDeliveryDetails(ctx, delivery) };
    }

    if (user.role === ROLES.COMPANY_ADMIN) {
      const order = await ctx.db.get(delivery.orderId);
      if (order && order.businessId === user.businessId) {
        return { ...delivery, details: await resolveDeliveryDetails(ctx, delivery) };
      }
      throw new Error("Access denied: delivery belongs to another company");
    }

    if (user.role === ROLES.CUSTOMER) {
      const order = await ctx.db.get(delivery.orderId);
      if (order && order.senderId === user.userId) {
        return { ...delivery, details: await resolveDeliveryDetails(ctx, delivery) };
      }
      throw new Error("Access denied: not your delivery");
    }

    throw new Error("Access denied");
  },
});

/**
 * Get delivery by tracking number (public query).
 *
 * Resolution is case-insensitive (tracking codes are displayed uppercase and
 * are hand-typed), and trailing whitespace is tolerated. A miss returns null
 * so the UI can show its own not-found state instead of a raw server error.
 *
 * Enriched with the order's display details (route addresses, parcel info,
 * schedule) resolved server-side from the order's authoritative address
 * records — the same fields the customer saw at creation.
 */
export const getDeliveryByTracking = query({
  args: {
    trackingNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.trackingNumber.trim().toUpperCase();
    if (!code) return null;

    // Exact (normalized) match first — index lookup.
    let delivery = await ctx.db
      .query("deliveries")
      .withIndex("by_tracking", (q) => q.eq("trackingNumber", code))
      .unique();

    // Case-insensitive fallback for hand-typed variants.
    if (!delivery) {
      const all = await ctx.db
        .query("deliveries")
        .withIndex("by_tracking", (q) => q.eq("trackingNumber", args.trackingNumber.trim()))
        .unique();
      delivery = all;
    }

    if (!delivery) return null;

    const details = await resolveDeliveryDetails(ctx, delivery);

    // Milestone timestamps for the tracking stepper, derived from the real
    // tracking event log (order_placed / picked_up / in_transit / delivered).
    // A milestone with no event stays pending — nothing is fabricated.
    const events = await ctx.db
      .query("tracking_events")
      .withIndex("by_delivery_time", (q) => q.eq("deliveryId", delivery._id))
      .collect();

    const latestTime = (type: string): number | null => {
      const matches = events.filter((e) => e.type === type);
      return matches.length > 0 ? matches[matches.length - 1].timestamp : null;
    };

    // Several transitions reuse the "picked_up" event type (dispatch, accept,
    // en-route, at-pickup); the actual pickup milestone is the one whose
    // metadata records toStatus = PICKED_UP.
    const isPickupMilestone = (e: (typeof events)[number]): boolean => {
      try {
        return JSON.parse(e.metadata ?? "{}").toStatus === DELIVERY_STATUS.PICKED_UP;
      } catch {
        return false;
      }
    };
    const pickupEvents = events.filter((e) => e.type === "picked_up" && isPickupMilestone(e));

    // Return limited information for public tracking
    return {
      trackingNumber: delivery.trackingNumber,
      status: delivery.status,
      estimatedArrival: delivery.estimatedArrival,
      startedAt: delivery.startedAt,
      completedAt: delivery.completedAt,
      // Milestone-adjacent timeline (location blips excluded) so the
      // tracking-number lookup renders the same event timeline card as the
      // activity-centre view. Same fields, same order — asc by time.
      pickupLat: delivery.pickupLat,
      pickupLng: delivery.pickupLng,
      dropoffLat: delivery.dropoffLat,
      dropoffLng: delivery.dropoffLng,
      courierId: delivery.courierId ?? null,
      timeline: events
        .filter((e) => e.type !== "location_update")
        .slice(-10)
        .map((e) => ({ type: e.type, timestamp: e.timestamp })),
      milestones: {
        placed: latestTime("order_placed"),
        pickedUp: pickupEvents.length > 0 ? pickupEvents[pickupEvents.length - 1].timestamp : null,
        inTransit: latestTime("in_transit"),
        delivered: latestTime("delivered"),
      },
      details,
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
      // Customer sees only deliveries for their own orders — enforced
      // server-side. The senderId is never accepted from the client. Each
      // order's deliveries are read through the by_order index, so only rows
      // belonging to this customer are ever touched.
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_sender", (q) => q.eq("senderId", user.userId))
        .collect();

      const collected: Doc<"deliveries">[] = [];
      for (const order of orders) {
        const rows = await ctx.db
          .query("deliveries")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        collected.push(...rows);
      }

      // Newest first; status filter and limit applied server-side.
      collected.sort((a, b) =>
        (b.startedAt ?? b.assignedAt ?? b._creationTime) -
        (a.startedAt ?? a.assignedAt ?? a._creationTime),
      );
      const limit = args.limit ?? 50;
      const statusFiltered = args.status
        ? collected.filter((d) => d.status === args.status)
        : collected;
      // Enrich with display details (addresses, parcel info) resolved
      // server-side so customer UIs never show raw coordinates.
      return await Promise.all(
        statusFiltered.slice(0, limit).map(async (d) => ({
          ...d,
          details: await resolveDeliveryDetails(ctx, d),
        })),
      );
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
    const rows = await q.order("desc").take(limit);
    // Enrich with display details (addresses, parcel info) resolved
    // server-side so customer UIs never show raw coordinates.
    return await Promise.all(
      rows.map(async (d) => ({
        ...d,
        details: await resolveDeliveryDetails(ctx, d),
      })),
    );
  },
});

// ─── Operations: Active Deliveries ─────────────────────────────────────────────
// Server-side, operations-scoped view of active (in-flight) deliveries.
//
// Authorization: operations / super_admin see all active deliveries.
// company_admin/company-owned scope is NOT applied here — operations has
// cross-company visibility by design (see ROLE_PERMISSIONS for OPERATIONS).
// The query filters to operational statuses server-side so the live view only
// loads in-flight work, not the entire delivery table.
//
// Statuses included: every non-terminal state — requested (newly created,
// awaiting staff release), pending_dispatch (released into the dispatch pool,
// driver offers in flight), reassignment_required (surfaced in dispatch +
// exceptions), and the in-flight chain assigned → at_dropoff.
// Excluded (terminal only): delivered, failed, cancelled.

export const getActiveDeliveries = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Operations and super_admin can see all active deliveries.
    const allowedRoles = [ROLES.OPERATIONS, ROLES.SUPER_ADMIN];
    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied: operations only");
    }

    const limit = Math.max(1, Math.min(args.limit ?? 200, 500));

    const activeStatuses = [
      DELIVERY_STATUS.REQUESTED,
      DELIVERY_STATUS.PENDING_DISPATCH,
      DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_DROPOFF,
    ];

    // Collect active deliveries, then order by most recent activity.
    // We use the global query (operations sees all) and filter server-side.
    const all = await ctx.db
      .query("deliveries")
      .order("desc")
      .take(limit * 2);

    const active = all.filter((d) =>
      activeStatuses.includes(d.status as any),
    );

    // Sort by most recent activity: started/assigned timestamps for in-flight
    // work; creation time for not-yet-started requests so fresh requests
    // surface at the top of the operational view.
    active.sort((a, b) => {
      const aTime = a.startedAt ?? a.assignedAt ?? a._creationTime;
      const bTime = b.startedAt ?? b.assignedAt ?? b._creationTime;
      return bTime - aTime;
    });

    const opsPage = active.slice(0, limit);
    // Enrich each row with display details (route addresses, recipient, parcel
    // info) resolved server-side from the order's authoritative address
    // records — operations shows human-readable addresses, never coordinates.
    return await Promise.all(
      opsPage.map(async (d) => ({
        ...d,
        details: await resolveDeliveryDetails(ctx, d),
      })),
    );
  },
});

// ─── Driver Delivery History ─────────────────────────────────────────────────
// Server-side, driver-scoped history for the Driver App's History page.
//
// Authorization: the authenticated session IS the driver. The driverId is
// never accepted from the client — the query resolves it via getCurrentAuthUser
// and only returns deliveries where courierId === that identity. No React-side
// filtering of a global list occurs.
//
// Scope: terminal (historical) deliveries only — delivered, failed, cancelled —
// using existing state-machine terminology. Rejected *offers* live in
// dispatch_offers (not deliveries) and are not part of a delivery-history
// record (documented limitation).
//
// Pagination: cursor-based via by_courier_status index ordering; no unbounded
// table scans on the client.

export const getMyDeliveryHistory = query({
  args: {
    /** Existing state-machine statuses only. Omit for all historical outcomes. */
    status: v.optional(deliveryStatusValidator),
    /** Inclusive lower bound (epoch ms) on the delivery's completion/failure/cancellation time. */
    from: v.optional(v.number()),
    /** Exclusive upper bound (epoch ms). */
    to: v.optional(v.number()),
    /** Page size (default 20, max 100). */
    limit: v.optional(v.number()),
    /** Continuation cursor from the previous page (a delivery _id). */
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only drivers have a delivery history");
    }

    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    // Historical (terminal) statuses in existing state-machine terminology.
    const historicalStatuses = [
      DELIVERY_STATUS.DELIVERED,
      DELIVERY_STATUS.FAILED,
      DELIVERY_STATUS.CANCELLED,
    ];

    // Query this driver's deliveries. If a specific status is requested,
    // use the composite index for a server-side filter; otherwise scan the
    // driver's own deliveries (scoped by courierId — never a global list).
    let rows;
    if (args.status) {
      rows = await ctx.db
        .query("deliveries")
        .withIndex("by_courier_status", (q) =>
          q.eq("courierId", user.userId).eq("status", args.status!)
        )
        .order("desc")
        .take(500);
    } else {
      const all = await ctx.db
        .query("deliveries")
        .withIndex("by_courier", (q) => q.eq("courierId", user.userId))
        .order("desc")
        .take(500);
      rows = all.filter((d) => historicalStatuses.includes(d.status as any));
    }

    // Sort by most relevant historical timestamp (completion > started > assigned).
    const historicalTime = (d: Doc<"deliveries">) =>
      d.completedAt ?? d.startedAt ?? d.assignedAt ?? 0;
    rows.sort((a, b) => historicalTime(b) - historicalTime(a));

    // Server-side date-range filter on the historical timestamp.
    if (args.from !== undefined) {
      rows = rows.filter((d) => historicalTime(d) >= args.from!);
    }
    if (args.to !== undefined) {
      rows = rows.filter((d) => historicalTime(d) < args.to!);
    }

    // Cursor pagination: resume after the row matching the cursor id.
    if (args.cursor) {
      const idx = rows.findIndex((d) => d._id === (args.cursor as any));
      if (idx >= 0) rows = rows.slice(idx + 1);
    }

    const page = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit && page.length > 0
        ? (page[page.length - 1]._id as unknown as string)
        : null;

    // Enrich each row with fields that already exist in orders/addresses.
    const items = [];
    for (const d of page) {
      const order = await ctx.db.get(d.orderId);
      const pickupAddress = order ? await ctx.db.get(order.pickupAddressId) : null;
      const dropoffAddress = order ? await ctx.db.get(order.dropoffAddressId) : null;

      items.push({
        _id: d._id,
        trackingNumber: d.trackingNumber,
        status: d.status,
        completedAt: d.completedAt,
        startedAt: d.startedAt,
        assignedAt: d.assignedAt,
        // From the linked order (existing data):
        packageSize: order?.packageSize ?? null,
        parcelType: order?.parcelType ?? null,
        orderPrice: order?.price ?? null,
        // From the linked addresses (existing data):
        pickupCity: pickupAddress?.city ?? null,
        pickupStreet: pickupAddress?.street ?? null,
        dropoffCity: dropoffAddress?.city ?? null,
        dropoffStreet: dropoffAddress?.street ?? null,
      });
    }

    return { items, nextCursor };
  },
});

/**
 * Operations-scoped historical deliveries.
 *
 * Authorization: operations / super_admin only. This is intentionally a
 * separate query from the driver-scoped getMyDeliveryHistory so the Driver App
 * history page remains driver-only and the Operations Centre history page remains
 * operations-only. No client-supplied driver/courier/wallet identity is accepted.
 *
 * Scope: terminal (historical) statuses only — delivered, failed, cancelled —
 * using existing state-machine terminology.
 */
export const getOperationalDeliveryHistory = query({
  args: {
    /** Existing state-machine statuses only. Omit for all historical outcomes. */
    status: v.optional(deliveryStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    if (user.role !== ROLES.OPERATIONS && user.role !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: operations only");
    }

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const historicalStatuses = [
      DELIVERY_STATUS.DELIVERED,
      DELIVERY_STATUS.FAILED,
      DELIVERY_STATUS.CANCELLED,
    ];

    // Operations sees all deliveries; server-side status filter when requested.
    const rows = await ctx.db
      .query("deliveries")
      .order("desc")
      .take(limit * 3);

    let filtered = rows.filter((d) => historicalStatuses.includes(d.status as any));

    if (args.status) {
      filtered = filtered.filter((d) => d.status === args.status);
    }

    // Relevance ordering: completion/failure/cancellation time first.
    const historicalTime = (d: Doc<"deliveries">) =>
      d.completedAt ?? d.startedAt ?? d.assignedAt ?? 0;
    filtered.sort((a, b) => historicalTime(b) - historicalTime(a));

    const page = filtered.slice(0, limit);

    // Enrich with existing order/address data (no financial internals exposed).
    const items = [];
    for (const d of page) {
      const order = await ctx.db.get(d.orderId);
      const pickupAddress = order ? await ctx.db.get(order.pickupAddressId) : null;
      const dropoffAddress = order ? await ctx.db.get(order.dropoffAddressId) : null;

      items.push({
        _id: d._id,
        trackingNumber: d.trackingNumber,
        status: d.status,
        completedAt: d.completedAt,
        startedAt: d.startedAt,
        assignedAt: d.assignedAt,
        courierId: d.courierId ?? null,
        orderPrice: order?.price ?? null,
        packageSize: order?.packageSize ?? null,
        pickupCity: pickupAddress?.city ?? null,
        pickupStreet: pickupAddress?.street ?? null,
        dropoffCity: dropoffAddress?.city ?? null,
        dropoffStreet: dropoffAddress?.street ?? null,
      });
    }

    return { items };
  },
});

// ─── Orders Tab (Operations Centre): aggregate all orders ────────────────────
//
// Every delivery regardless of state — requested through delivered — enriched
// with the shared display details (route addresses, business name, recipient,
// parcel, order reference). Powers the Operations Centre "Orders" tab search:
// tracking number, order reference, business, recipient, addresses, driver.
// Server-side search on the fields operations searches by; the client narrows
// further within the fetched page.

export const getAllDeliveriesForOps = query({
  args: {
    /** Server-side substring match on tracking number / order reference (case-insensitive). */
    search: v.optional(v.string()),
    /** Page size (default 200, max 500). */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    if (user.role !== ROLES.OPERATIONS && user.role !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: operations only");
    }

    const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const needle = args.search?.trim().toLowerCase() ?? "";

    // Aggregate across the whole lifecycle, newest first.
    const all = await ctx.db.query("deliveries").order("desc").take(1000);

    const matches = needle
      ? all.filter((d) => {
          const t = d.trackingNumber?.toLowerCase() ?? "";
          if (t.includes(needle)) return true;
          // Order reference — operations quote the last-6 display form.
          if (d.orderId.toLowerCase().includes(needle)) return true;
          return false;
        })
      : all;

    const page = matches.slice(0, limit);

    // Enrich with the shared display details, same resolver as the active list.
    return await Promise.all(
      page.map(async (d) => ({
        ...d,
        details: await resolveDeliveryDetails(ctx, d),
      })),
    );
  },
});


