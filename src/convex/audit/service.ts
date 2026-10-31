/**
 * Lasha Audit Logging Service
 *
 * Provides a centralized audit trail for all important system actions.
 * Every significant state change in Lasha should be recorded as an audit event.
 *
 * Audit events are immutable and provide a reliable historical record of:
 * - Who performed the action (actor)
 * - What was done (action)
 * - When it happened (timestamp)
 * - Which entity was affected (entityType, entityId)
 * - What changed (before/after snapshots)
 *
 * The audit system is consumed by the Operations Centre for:
 * - Delivery history and traceability
 * - Driver activity logs
 * - Operational audit trails
 * - Security investigation
 * - Compliance reporting
 */

import { query, internalMutation, internalQuery, QueryCtx, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { ROLES, PERMISSIONS } from "../schema";
import { getCurrentAuthUser, requireAdmin, AuthUser } from "../auth/authorization";

// ─── Audit Event Types ────────────────────────────────────────────────────────

/** Audit event categories for classification */
export type AuditCategory =
  | "delivery"
  | "dispatch"
  | "tracking"
  | "pricing"
  | "payment"
  | "pod"
  | "user"
  | "driver"
  | "vehicle"
  | "company"
  | "notification"
  | "auth"
  | "admin"
  | "system";

/** Common action names by category */
export const AUDIT_ACTIONS = {
  // Delivery actions
  DELIVERY_CREATED: "delivery.created",
  DELIVERY_DISPATCHED: "delivery.dispatched",
  DELIVERY_ASSIGNED: "delivery.assigned",
  DELIVERY_ACCEPTED: "delivery.accepted",
  DELIVERY_REJECTED: "delivery.rejected",
  DELIVERY_EN_ROUTE: "delivery.en_route",
  DELIVERY_ARRIVED_PICKUP: "delivery.arrived_pickup",
  DELIVERY_PICKED_UP: "delivery.picked_up",
  DELIVERY_IN_TRANSIT: "delivery.in_transit",
  DELIVERY_ARRIVED_DROPOFF: "delivery.arrived_dropoff",
  DELIVERY_COMPLETED: "delivery.completed",
  DELIVERY_FAILED: "delivery.failed",
  DELIVERY_CANCELLED: "delivery.cancelled",
  DELIVERY_REASSIGNED: "delivery.reassigned",

  // Dispatch actions
  DISPATCH_STARTED: "dispatch.started",
  DISPATCH_DRIVER_MATCHED: "dispatch.driver_matched",
  DISPATCH_OFFER_SENT: "dispatch.offer_sent",
  DISPATCH_OFFER_ACCEPTED: "dispatch.offer_accepted",
  DISPATCH_OFFER_REJECTED: "dispatch.offer_rejected",
  DISPATCH_OFFER_EXPIRED: "dispatch.offer_expired",
  DISPATCH_REASSIGNED: "dispatch.reassigned",

  // Tracking actions
  TRACKING_SESSION_STARTED: "tracking.session_started",
  TRACKING_SESSION_STOPPED: "tracking.session_stopped",
  TRACKING_LOCATION_RECEIVED: "tracking.location_received",

  // Pricing actions
  PRICING_QUOTE_CREATED: "pricing.quote_created",
  PRICING_RULE_CREATED: "pricing.rule_created",
  PRICING_RULE_DEACTIVATED: "pricing.rule_deactivated",
  PRICING_RULE_CHANGED: "pricing.rule_changed",

  // Payment actions
  PAYMENT_INITIATED: "payment.initiated",
  PAYMENT_CONFIRMED: "payment.confirmed",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REFUND_REQUESTED: "payment.refund_requested",
  PAYMENT_REFUNDED: "payment.refunded",
  PAYMENT_REFUND_FAILED: "payment.refund_failed",
  SETTLEMENT_CREATED: "settlement.created",
  SETTLEMENT_PROCESSED: "settlement.processed",
  SETTLEMENT_COMPLETED: "settlement.completed",
  SETTLEMENT_FAILED: "settlement.failed",

  // POD actions
  POD_CREATED: "pod.created",
  POD_EVIDENCE_ADDED: "pod.evidence_added",
  POD_COMPLETED: "pod.completed",
  POD_FAILED: "pod.failed",

  // User actions
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DEACTIVATED: "user.deactivated",
  USER_ROLE_CHANGED: "user.role_changed",

  // Driver actions
  DRIVER_ACTIVATED: "driver.activated",
  DRIVER_DEACTIVATED: "driver.deactivated",
  DRIVER_AVAILABILITY_CHANGED: "driver.availability_changed",

  // Vehicle actions
  VEHICLE_CREATED: "vehicle.created",
  VEHICLE_UPDATED: "vehicle.updated",
  VEHICLE_ACTIVATED: "vehicle.activated",
  VEHICLE_DEACTIVATED: "vehicle.deactivated",

  // Company actions
  COMPANY_CREATED: "company.created",
  COMPANY_UPDATED: "company.updated",
  COMPANY_STATUS_CHANGED: "company.status_changed",

  // Notification actions
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_FAILED: "notification.failed",

  // Auth actions
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_FAILED_LOGIN: "auth.failed_login",
  AUTH_PASSWORD_CHANGED: "auth.password_changed",

  // Admin actions
  ADMIN_CONFIG_CHANGED: "admin.config_changed",
  ADMIN_OVERRIDE: "admin.override",
  ADMIN_DATA_CORRECTION: "admin.data_correction",

  // System actions
  SYSTEM_MAINTENANCE: "system.maintenance",
  SYSTEM_ERROR: "system.error",
} as const;

// ─── Internal Mutations ──────────────────────────────────────────────────────

/**
 * Record an audit event.
 * This is the primary internal mutation for creating audit records.
 *
 * Called by domain operations after successful state changes.
 * Never called directly from React.
 */
export const recordEvent = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    actorEmail: v.optional(v.string()),
    category: v.union(
      v.literal("delivery"),
      v.literal("dispatch"),
      v.literal("tracking"),
      v.literal("pricing"),
      v.literal("payment"),
      v.literal("pod"),
      v.literal("user"),
      v.literal("driver"),
      v.literal("vehicle"),
      v.literal("company"),
      v.literal("notification"),
      v.literal("auth"),
      v.literal("admin"),
      v.literal("system")
    ),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    metadata: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    deliveryId: v.optional(v.id("deliveries")),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Record the audit event
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail: args.actorEmail,
      category: args.category,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before,
      after: args.after,
      metadata: args.metadata,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      deliveryId: args.deliveryId,
      orderId: args.orderId,
      timestamp: now,
    });

    return { auditEventId };
  },
});

/**
 * Record a delivery state transition event.
 * Convenience wrapper for the most common audit pattern.
 */
export const recordDeliveryTransition = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    deliveryId: v.id("deliveries"),
    orderId: v.id("orders"),
    action: v.string(),
    fromStatus: v.string(),
    toStatus: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get delivery for before/after snapshots
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return;

    const before = JSON.stringify({
      status: args.fromStatus,
      courierId: delivery.courierId,
      vehicleId: delivery.vehicleId,
    });

    const after = JSON.stringify({
      status: args.toStatus,
      courierId: delivery.courierId,
      vehicleId: delivery.vehicleId,
    });

    // Get user email for audit record
    const actor = await ctx.db.get(args.actorId);
    const actorEmail = actor?.email;

    const now = Date.now();
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail,
      category: "delivery",
      action: args.action,
      entityType: "delivery",
      entityId: args.deliveryId,
      before,
      after,
      metadata: args.metadata,
      deliveryId: args.deliveryId,
      orderId: args.orderId,
      timestamp: now,
    });

    return { auditEventId };
  },
});

/**
 * Record a dispatch event.
 */
export const recordDispatchEvent = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    deliveryId: v.id("deliveries"),
    action: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return;

    const actor = await ctx.db.get(args.actorId);
    const actorEmail = actor?.email;

    const now = Date.now();
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail,
      category: "dispatch",
      action: args.action,
      entityType: "delivery",
      entityId: args.deliveryId,
      metadata: args.metadata,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      timestamp: now,
    });

    return { auditEventId };
  },
});

/**
 * Record a pricing event.
 */
export const recordPricingEvent = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    metadata: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorId);
    const actorEmail = actor?.email;

    const now = Date.now();
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail,
      category: "pricing",
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before,
      after: args.after,
      metadata: args.metadata,
      orderId: args.orderId,
      timestamp: now,
    });

    return { auditEventId };
  },
});

/**
 * Record a payment/settlement event.
 */
export const recordPaymentEvent = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    metadata: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorId);
    const actorEmail = actor?.email;

    const now = Date.now();
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail,
      category: "payment",
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      metadata: args.metadata,
      orderId: args.orderId,
      timestamp: now,
    });

    return { auditEventId };
  },
});

/**
 * Record a POD event.
 */
export const recordPODEvent = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    action: v.string(),
    deliveryId: v.id("deliveries"),
    entityId: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return;

    const actor = await ctx.db.get(args.actorId);
    const actorEmail = actor?.email;

    const now = Date.now();
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail,
      category: "pod",
      action: args.action,
      entityType: "proof_of_delivery",
      entityId: args.entityId,
      metadata: args.metadata,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      timestamp: now,
    });

    return { auditEventId };
  },
});

/**
 * Record a generic audit event (for user, driver, vehicle, company, etc.).
 */
export const recordGenericEvent = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    category: v.union(
      v.literal("delivery"),
      v.literal("user"),
      v.literal("driver"),
      v.literal("vehicle"),
      v.literal("company"),
      v.literal("auth"),
      v.literal("admin"),
      v.literal("system"),
      v.literal("notification")
    ),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await ctx.db.get(args.actorId);
    const actorEmail = actor?.email;

    const now = Date.now();
    const auditEventId = await ctx.db.insert("audit_events", {
      actorId: args.actorId,
      actorRole: args.actorRole,
      actorEmail,
      category: args.category,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before,
      after: args.after,
      metadata: args.metadata,
      timestamp: now,
    });

    return { auditEventId };
  },
});

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get audit events for a specific delivery.
 * Used by delivery detail views and Operations Centre.
 */
export const getAuditEventsForDelivery = query({
  args: {
    deliveryId: v.id("deliveries"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Resolve the resource first so authorization can be scoped to it.
    // Same resource-level ownership rule as deliveries/state_machine.getDelivery:
    // role eligibility alone is NOT access — the delivery's company/assignment
    // is resolved server-side and cross-company reads fail closed.
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    await assertDeliveryAuditAccess(ctx, user, delivery);

    const events = await ctx.db
      .query("audit_events")
      .withIndex("by_delivery", (q) =>
        q.eq("deliveryId", args.deliveryId)
      )
      .order("desc")
      .take(args.limit ?? 50);

    return events;
  },
});

/**
 * Get audit events for a specific order.
 */
export const getAuditEventsForOrder = query({
  args: {
    orderId: v.id("orders"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Resolve the resource first so authorization can be scoped to it.
    // Resource-level ownership rule mirrors getDelivery: operations/super_admin
    // have full access; company_admin must own the order's business; customers
    // must be the order sender. Cross-company reads fail closed.
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    assertOrderAuditAccess(user, order);

    const events = await ctx.db
      .query("audit_events")
      .withIndex("by_order", (q) =>
        q.eq("orderId", args.orderId)
      )
      .order("desc")
      .take(args.limit ?? 50);

    return events;
  },
});

/**
 * Get recent audit events across the system.
 * Used by the Operations Centre overview.
 */
export const getRecentAuditEvents = query({
  args: {
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Global audit is an Admin Portal capability, not a general staff read.
    await requireAdmin(ctx);

    const limit = args.limit ?? 100;
    let events;

    // Apply category filter if provided
    if (args.category) {
      events = await ctx.db
        .query("audit_events")
        .withIndex("by_category", (i) =>
          i.eq("category", args.category as any)
        )
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("audit_events")
        .withIndex("by_timestamp")
        .order("desc")
        .take(limit);
    }

    // Apply action filter in memory (compound index not available for all combos)
    if (args.action) {
      events = events.filter((e) => e.action === args.action);
    }

    return events;
  },
});

/**
 * Get audit events for a specific entity.
 *
 * Authorization model (see docs/operations-gap-audit.md):
 *
 * Only the known entity-type set is accepted — arbitrary entity-type strings
 * are rejected at the argument level. Every supported type resolves the
 * resource server-side and applies the same ownership rule used by the
 * resource's own domain queries:
 *
 *   delivery, proof_of_delivery   → assertDeliveryAuditAccess
 *                                    (ops/company-scope/driver-assigned/customer-sender)
 *   order                         → assertOrderAuditAccess
 *                                    (ops/company-scope/customer-sender)
 *   users                         → self, or ops/admin
 *   businesses                    → owning company admin, or ops/admin
 *   payment_transaction           → payer, company scope via order, or ops/admin
 *   delivery_quote                → quote owner, company scope via order, or ops/admin
 *   settlement                    → settlement driver, company scope via order, or ops/admin
 *   pricing_rule                  → OPERATIONS / SUPER_ADMIN only (platform config,
 *                                    no per-resource ownership exists)
 *
 * Entity types that are written to audit_events but carry no safe ownership
 * semantics (e.g. the logging bridge's "unknown") are NOT in the supported
 * set and are therefore rejected. Drivers and customers get access only where
 * an actual schema-backed ownership relationship exists — never merely because
 * they hold a role.
 */
const AUDIT_ENTITY_TYPES = [
  "delivery",
  "order",
  "proof_of_delivery",
  "users",
  "businesses",
  "payment_transaction",
  "delivery_quote",
  "settlement",
  "pricing_rule",
] as const;

export const getAuditEventsForEntity = query({
  args: {
    entityType: v.union(
      ...AUDIT_ENTITY_TYPES.map((t) => v.literal(t)),
    ),
    entityId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Resolve the resource first so authorization can be scoped to it, then
    // apply the resource's existing ownership rule. Unknown/missing entities
    // fail closed.
    switch (args.entityType) {
      case "delivery": {
        const delivery = await ctx.db.get(args.entityId as Id<"deliveries">);
        if (!delivery) throw new Error("Delivery not found");
        await assertDeliveryAuditAccess(ctx, user, delivery);
        break;
      }

      case "order": {
        const order = await ctx.db.get(args.entityId as Id<"orders">);
        if (!order) throw new Error("Order not found");
        assertOrderAuditAccess(user, order);
        break;
      }

      case "proof_of_delivery": {
        const pod = await ctx.db.get(args.entityId as Id<"proof_of_delivery">);
        if (!pod) throw new Error("Proof of delivery not found");
        // POD audit events always carry deliveryId; fall back to the record.
        const deliveryId = pod.deliveryId;
        const delivery = await ctx.db.get(deliveryId);
        if (!delivery) throw new Error("Delivery not found");
        await assertDeliveryAuditAccess(ctx, user, delivery);
        break;
      }

      case "users": {
        const target = await ctx.db.get(args.entityId as Id<"users">);
        if (!target) throw new Error("User not found");
        const adminRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
        if (target._id !== user.userId && !adminRoles.includes(user.role as any))
        {
          throw new Error("Access denied: cannot view another user's audit events");
        }
        break;
      }

      case "businesses": {
        const business = await ctx.db.get(args.entityId as Id<"businesses">);
        if (!business) throw new Error("Business not found");
        if (
          user.role !== ROLES.SUPER_ADMIN &&
          user.role !== ROLES.OPERATIONS &&
          user.businessId !== business._id
        ) {
          throw new Error("Access denied: business belongs to another company");
        }
        break;
      }

      case "payment_transaction": {
        const txn = await ctx.db.get(args.entityId as Id<"payment_transactions">);
        if (!txn) throw new Error("Payment transaction not found");
        const order = await ctx.db.get(txn.orderId);
        if (
          user.role !== ROLES.SUPER_ADMIN &&
          user.role !== ROLES.OPERATIONS &&
          txn.userId !== user.userId &&
          !(user.role === ROLES.COMPANY_ADMIN && order && order.businessId === user.businessId)
        ) {
          throw new Error("Access denied: payment belongs to another user or company");
        }
        break;
      }

      case "delivery_quote": {
        const quote = await ctx.db.get(args.entityId as Id<"delivery_quotes">);
        if (!quote) throw new Error("Quote not found");
        const order = await ctx.db.get(quote.orderId);
        if (
          user.role !== ROLES.SUPER_ADMIN &&
          user.role !== ROLES.OPERATIONS &&
          quote.userId !== user.userId &&
          !(user.role === ROLES.COMPANY_ADMIN && order && order.businessId === user.businessId)
        ) {
          throw new Error("Access denied: quote belongs to another user or company");
        }
        break;
      }

      case "settlement": {
        const settlement = await ctx.db.get(args.entityId as Id<"settlements">);
        if (!settlement) throw new Error("Settlement not found");
        const order = await ctx.db.get(settlement.orderId);
        if (
          user.role !== ROLES.SUPER_ADMIN &&
          user.role !== ROLES.OPERATIONS &&
          settlement.driverId !== user.userId &&
          !(user.role === ROLES.COMPANY_ADMIN && order && order.businessId === user.businessId)
        ) {
          throw new Error("Access denied: settlement belongs to another driver or company");
        }
        break;
      }

      case "pricing_rule": {
        // Platform pricing configuration: no per-resource ownership exists in
        // the schema. Operations/admin-only by explicit classification.
        const adminRoles = [ROLES.OPERATIONS, ROLES.SUPER_ADMIN];
        if (!adminRoles.includes(user.role as any)) {
          throw new Error("Access denied: pricing audit is operations-only");
        }
        break;
      }
    }

    const events = await ctx.db
      .query("audit_events")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .order("desc")
      .take(args.limit ?? 50);

    return events;
  },
});

/**
 * Get audit events by actor (user).
 */
export const getAuditEventsByActor = query({
  args: {
    actorId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Users can view their own audit events; ops/admin can view others
    if (user.userId !== args.actorId) {
      const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
      if (!allowedRoles.includes(user.role as any)) {
        throw new Error("Access denied: cannot view another user's audit events");
      }
    }

    const events = await ctx.db
      .query("audit_events")
      .withIndex("by_actor", (q) =>
        q.eq("actorId", args.actorId)
      )
      .order("desc")
      .take(args.limit ?? 50);

    return events;
  },
});

/**
 * Get audit events by action type.
 */
export const getAuditEventsByAction = query({
  args: {
    action: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied: insufficient permissions to view audit logs");
    }

    const events = await ctx.db
      .query("audit_events")
      .withIndex("by_action", (q) =>
        q.eq("action", args.action)
      )
      .order("desc")
      .take(args.limit ?? 50);

    return events;
  },
});

/**
 * Get audit statistics for the Operations Centre dashboard.
 */
export const getAuditStats = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Audit statistics power the Admin Portal dashboard.
    await requireAdmin(ctx);

    const now = Date.now();
    const startDate = args.startDate ?? (now - 24 * 60 * 60 * 1000); // Last 24h
    const endDate = args.endDate ?? now;

    // Get all events in the time range
    const events = await ctx.db
      .query("audit_events")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", startDate).lte("timestamp", endDate)
      )
      .collect();

    // Calculate statistics
    const byCategory: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const byActor: Record<string, number> = {};

    for (const event of events) {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      byAction[event.action] = (byAction[event.action] || 0) + 1;
      byActor[event.actorRole] = (byActor[event.actorRole] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      dateRange: { startDate, endDate },
      byCategory,
      byAction,
      byActorRole: byActor,
    };
  },
});

// ─── Authorization Helpers ────────────────────────────────────────────────────

/**
 * Resource-level audit access for a delivery.
 *
 * Mirrors deliveries/state_machine.getDelivery exactly:
 *   - SUPER_ADMIN / OPERATIONS: any delivery
 *   - COMPANY_ADMIN: only deliveries whose order belongs to their company
 *   - DRIVER: only deliveries assigned to them
 *   - CUSTOMER: only deliveries whose order they sent
 *
 * Fails closed: a company admin with no company association, a missing order,
 * or an order whose ownership cannot be established is denied. No client-
 * supplied identity is trusted — company/ownership comes from server records.
 */
async function assertDeliveryAuditAccess(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  delivery: Doc<"deliveries">
): Promise<void> {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return;
  }

  if (user.role === ROLES.COMPANY_ADMIN) {
    const order = await ctx.db.get(delivery.orderId);
    if (!order || !user.businessId || order.businessId !== user.businessId) {
      throw new Error("Access denied: delivery belongs to another company");
    }
    return;
  }

  if (user.role === ROLES.DRIVER) {
    if (delivery.courierId !== user.userId) {
      throw new Error("Access denied: not your delivery");
    }
    return;
  }

  if (user.role === ROLES.CUSTOMER) {
    const order = await ctx.db.get(delivery.orderId);
    if (!order || order.senderId !== user.userId) {
      throw new Error("Access denied: not your delivery");
    }
    return;
  }

  throw new Error("Access denied: insufficient permissions to view audit logs");
}

/**
 * Resource-level audit access for an order.
 *
 *   - SUPER_ADMIN / OPERATIONS: any order
 *   - COMPANY_ADMIN: only orders belonging to their company
 *   - CUSTOMER: only orders they sent
 *
 * Fails closed: a company admin with no company association is denied.
 */
function assertOrderAuditAccess(user: AuthUser, order: Doc<"orders">): void {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return;
  }

  if (user.role === ROLES.COMPANY_ADMIN) {
    if (!user.businessId || order.businessId !== user.businessId) {
      throw new Error("Access denied: order belongs to another company");
    }
    return;
  }

  if (user.role === ROLES.CUSTOMER) {
    if (order.senderId !== user.userId) {
      throw new Error("Access denied: not your order");
    }
    return;
  }

  throw new Error("Access denied: insufficient permissions to view audit logs");
}
