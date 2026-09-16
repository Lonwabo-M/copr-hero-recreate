import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ─── Validators ───────────────────────────────────────────────────────────────

// ─── Roles ───────────────────────────────────────────────────────────────────
// Canonical role definitions. These replace the old admin/user/member/business/courier
// roles with a cleaner RBAC model.

export const ROLES = {
  CUSTOMER: "customer",
  DRIVER: "driver",
  FLEET_MANAGER: "fleet_manager",
  OPERATIONS: "operations",
  COMPANY_ADMIN: "company_admin",
  SUPER_ADMIN: "super_admin",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.CUSTOMER),
  v.literal(ROLES.DRIVER),
  v.literal(ROLES.FLEET_MANAGER),
  v.literal(ROLES.OPERATIONS),
  v.literal(ROLES.COMPANY_ADMIN),
  v.literal(ROLES.SUPER_ADMIN),
);
export type Role = Infer<typeof roleValidator>;

// ─── Permissions ──────────────────────────────────────────────────────────────
// Explicit permission strings. Use these in authorization checks.

export const PERMISSIONS = {
  // Delivery permissions
  DELIVERY_CREATE: "delivery:create",
  DELIVERY_VIEW: "delivery:view",
  DELIVERY_CANCEL: "delivery:cancel",
  DELIVERY_ASSIGN: "delivery:assign",
  DELIVERY_REASSIGN: "delivery:reassign",
  DELIVERY_UPDATE_STATUS: "delivery:update_status",

  // Driver permissions
  DRIVER_VIEW: "driver:view",
  DRIVER_MANAGE: "driver:manage",

  // Fleet permissions
  FLEET_VIEW: "fleet:view",
  FLEET_MANAGE: "fleet:manage",

  // Tracking permissions
  TRACKING_VIEW: "tracking:view",

  // Operations permissions
  OPERATIONS_MANAGE: "operations:manage",

  // Pricing permissions
  PRICING_MANAGE: "pricing:manage",

  // Settlement permissions
  SETTLEMENT_VIEW: "settlement:view",
  SETTLEMENT_MANAGE: "settlement:manage",

  // User permissions
  USER_VIEW: "user:view",
  USER_MANAGE: "user:manage",

  // Business permissions
  BUSINESS_VIEW: "business:view",
  BUSINESS_MANAGE: "business:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ─── Role → Permission Mapping ────────────────────────────────────────────────
// Each role has an explicit set of permissions. No implicit access.

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.CUSTOMER]: [
    PERMISSIONS.DELIVERY_CREATE,
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.DELIVERY_CANCEL,
    PERMISSIONS.TRACKING_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.BUSINESS_VIEW,
  ],

  [ROLES.DRIVER]: [
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.DELIVERY_UPDATE_STATUS,
    PERMISSIONS.DRIVER_VIEW,
    PERMISSIONS.TRACKING_VIEW,
    PERMISSIONS.USER_VIEW,
  ],

  [ROLES.FLEET_MANAGER]: [
    PERMISSIONS.DRIVER_VIEW,
    PERMISSIONS.DRIVER_MANAGE,
    PERMISSIONS.FLEET_VIEW,
    PERMISSIONS.FLEET_MANAGE,
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.TRACKING_VIEW,
    PERMISSIONS.USER_VIEW,
  ],

  [ROLES.OPERATIONS]: [
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.DELIVERY_ASSIGN,
    PERMISSIONS.DELIVERY_REASSIGN,
    PERMISSIONS.DELIVERY_UPDATE_STATUS,
    PERMISSIONS.DRIVER_VIEW,
    PERMISSIONS.OPERATIONS_MANAGE,
    PERMISSIONS.TRACKING_VIEW,
    PERMISSIONS.PRICING_MANAGE,
    PERMISSIONS.SETTLEMENT_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.BUSINESS_VIEW,
  ],

  [ROLES.COMPANY_ADMIN]: [
    PERMISSIONS.DELIVERY_CREATE,
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.DELIVERY_CANCEL,
    PERMISSIONS.DELIVERY_ASSIGN,
    PERMISSIONS.DELIVERY_REASSIGN,
    PERMISSIONS.DELIVERY_UPDATE_STATUS,
    PERMISSIONS.DRIVER_VIEW,
    PERMISSIONS.DRIVER_MANAGE,
    PERMISSIONS.FLEET_VIEW,
    PERMISSIONS.FLEET_MANAGE,
    PERMISSIONS.TRACKING_VIEW,
    PERMISSIONS.OPERATIONS_MANAGE,
    PERMISSIONS.PRICING_MANAGE,
    PERMISSIONS.SETTLEMENT_VIEW,
    PERMISSIONS.SETTLEMENT_MANAGE,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.BUSINESS_VIEW,
    PERMISSIONS.BUSINESS_MANAGE,
  ],

  [ROLES.SUPER_ADMIN]: [
    // Super admin has all permissions
    ...Object.values(PERMISSIONS),
  ],
};

// ─── Schema-Scoped Role Validator ─────────────────────────────────────────────
// Use this when storing roles in the database.
export const schemaRoleValidator = v.union(
  v.literal(ROLES.CUSTOMER),
  v.literal(ROLES.DRIVER),
  v.literal(ROLES.FLEET_MANAGER),
  v.literal(ROLES.OPERATIONS),
  v.literal(ROLES.COMPANY_ADMIN),
  v.literal(ROLES.SUPER_ADMIN),
);

// ─── Order Status Values ──────────────────────────────────────────────────────
// Order status values (separate from delivery status).
export const ORDER_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PICKING_UP: "picking_up",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export const orderStatusValidator = v.union(
  v.literal(ORDER_STATUS.PENDING),
  v.literal(ORDER_STATUS.CONFIRMED),
  v.literal(ORDER_STATUS.PICKING_UP),
  v.literal(ORDER_STATUS.IN_TRANSIT),
  v.literal(ORDER_STATUS.DELIVERED),
  v.literal(ORDER_STATUS.CANCELLED),
);

// ─── Delivery Status Values ────────────────────────────────────────────────────
// Authoritative delivery lifecycle states. The frontend must NEVER write arbitrary
// statuses — only explicit domain mutations are allowed.

export const DELIVERY_STATUS = {
  // Normal flow
  REQUESTED: "requested",
  PENDING_DISPATCH: "pending_dispatch",
  ASSIGNED: "assigned",
  DRIVER_ACCEPTED: "driver_accepted",
  EN_ROUTE_TO_PICKUP: "en_route_to_pickup",
  AT_PICKUP: "at_pickup",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  AT_DROPOFF: "at_dropoff",
  DELIVERED: "delivered",

  // Exceptional states
  CANCELLED: "cancelled",
  FAILED: "failed",
  REASSIGNMENT_REQUIRED: "reassignment_required",
} as const;

type DeliveryStatusValue = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

export const deliveryStatusValidator = v.union(
  v.literal(DELIVERY_STATUS.REQUESTED),
  v.literal(DELIVERY_STATUS.PENDING_DISPATCH),
  v.literal(DELIVERY_STATUS.ASSIGNED),
  v.literal(DELIVERY_STATUS.DRIVER_ACCEPTED),
  v.literal(DELIVERY_STATUS.EN_ROUTE_TO_PICKUP),
  v.literal(DELIVERY_STATUS.AT_PICKUP),
  v.literal(DELIVERY_STATUS.PICKED_UP),
  v.literal(DELIVERY_STATUS.IN_TRANSIT),
  v.literal(DELIVERY_STATUS.AT_DROPOFF),
  v.literal(DELIVERY_STATUS.DELIVERED),
  v.literal(DELIVERY_STATUS.CANCELLED),
  v.literal(DELIVERY_STATUS.FAILED),
  v.literal(DELIVERY_STATUS.REASSIGNMENT_REQUIRED),
);

// ─── Valid State Transitions ──────────────────────────────────────────────────
// Defines which transitions are allowed from each state.
// The state machine enforces these rules.

export const VALID_TRANSITIONS: Record<DeliveryStatusValue, DeliveryStatusValue[]> = {
  [DELIVERY_STATUS.REQUESTED]: [
    DELIVERY_STATUS.PENDING_DISPATCH,
    DELIVERY_STATUS.CANCELLED,
  ],
  [DELIVERY_STATUS.PENDING_DISPATCH]: [
    DELIVERY_STATUS.ASSIGNED,
    DELIVERY_STATUS.CANCELLED,
  ],
  [DELIVERY_STATUS.ASSIGNED]: [
    DELIVERY_STATUS.DRIVER_ACCEPTED,
    DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
    DELIVERY_STATUS.CANCELLED,
  ],
  [DELIVERY_STATUS.DRIVER_ACCEPTED]: [
    DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
    DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
    DELIVERY_STATUS.CANCELLED,
  ],
  [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP]: [
    DELIVERY_STATUS.AT_PICKUP,
    DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
    DELIVERY_STATUS.CANCELLED,
  ],
  [DELIVERY_STATUS.AT_PICKUP]: [
    DELIVERY_STATUS.PICKED_UP,
    DELIVERY_STATUS.FAILED,
    DELIVERY_STATUS.CANCELLED,
  ],
  [DELIVERY_STATUS.PICKED_UP]: [
    DELIVERY_STATUS.IN_TRANSIT,
    DELIVERY_STATUS.FAILED,
  ],
  [DELIVERY_STATUS.IN_TRANSIT]: [
    DELIVERY_STATUS.AT_DROPOFF,
    DELIVERY_STATUS.FAILED,
  ],
  [DELIVERY_STATUS.AT_DROPOFF]: [
    DELIVERY_STATUS.DELIVERED,
    DELIVERY_STATUS.FAILED,
  ],
  [DELIVERY_STATUS.DELIVERED]: [],
  [DELIVERY_STATUS.CANCELLED]: [],
  [DELIVERY_STATUS.FAILED]: [],
  [DELIVERY_STATUS.REASSIGNMENT_REQUIRED]: [
    DELIVERY_STATUS.PENDING_DISPATCH,
  ],
};

// ─── Who Can Initiate Each Transition ─────────────────────────────────────────
// Maps transitions to the roles that can initiate them.

export const TRANSITION_PERMISSIONS: Record<string, string[]> = {
  // createDelivery: customer, company_admin, operations
  "requested->pending_dispatch": ["customer", "company_admin", "operations"],
  "pending_dispatch->assigned": ["operations", "company_admin", "super_admin"],
  "assigned->driver_accepted": ["driver"],
  "assigned->reassignment_required": ["operations", "company_admin", "super_admin"],
  "driver_accepted->en_route_to_pickup": ["driver"],
  "driver_accepted->reassignment_required": ["driver", "operations", "company_admin", "super_admin"],
  "en_route_to_pickup->at_pickup": ["driver"],
  "en_route_to_pickup->reassignment_required": ["driver", "operations", "company_admin", "super_admin"],
  "at_pickup->picked_up": ["driver"],
  "at_pickup->failed": ["driver", "operations", "company_admin", "super_admin"],
  "picked_up->in_transit": ["driver"],
  "picked_up->failed": ["driver", "operations", "company_admin", "super_admin"],
  "in_transit->at_dropoff": ["driver"],
  "in_transit->failed": ["driver", "operations", "company_admin", "super_admin"],
  "at_dropoff->delivered": ["driver"],
  "at_dropoff->failed": ["driver", "operations", "company_admin", "super_admin"],
  // Cancel can happen from most states
  "requested->cancelled": ["customer", "company_admin", "operations", "super_admin"],
  "pending_dispatch->cancelled": ["customer", "company_admin", "operations", "super_admin"],
  "assigned->cancelled": ["customer", "company_admin", "operations", "super_admin"],
  "driver_accepted->cancelled": ["customer", "company_admin", "operations", "super_admin"],
  "en_route_to_pickup->cancelled": ["customer", "company_admin", "operations", "super_admin"],
  "at_pickup->cancelled": ["customer", "company_admin", "operations", "super_admin"],
  // Reassignment: ops/admin puts delivery back in dispatch queue
  "reassignment_required->pending_dispatch": ["operations", "company_admin", "super_admin"],
};

// Package size
export const packageSizeValidator = v.union(
  v.literal("small"),
  v.literal("medium"),
  v.literal("large"),
);

// Parcel type (for Request Delivery form)
export const parcelTypeValidator = v.union(
  v.literal("document"),
  v.literal("small_parcel"),
  v.literal("large_parcel"),
  v.literal("pallet"),
);

// Expedition type (delivery speed)
export const expeditionTypeValidator = v.union(
  v.literal("standard"),
  v.literal("express"),
  v.literal("same_day"),
);

// Transaction type
export const transactionTypeValidator = v.union(
  v.literal("credit"),
  v.literal("debit"),
);

// Transaction status
export const transactionStatusValidator = v.union(
  v.literal("completed"),
  v.literal("pending"),
  v.literal("failed"),
);

// Invoice status
export const invoiceStatusValidator = v.union(
  v.literal("paid"),
  v.literal("pending"),
  v.literal("cancelled"),
);

// Notification type
export const notificationTypeValidator = v.union(
  v.literal("delivery"),
  v.literal("payment"),
  v.literal("alert"),
  v.literal("system"),
  v.literal("security"),
);

// Tracking event type
export const trackingEventTypeValidator = v.union(
  v.literal("order_placed"),
  v.literal("picked_up"),
  v.literal("in_transit"),
  v.literal("delivered"),
  v.literal("location_update"),
);

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = defineSchema(
  {
    // ─── Auth Tables (from @convex-dev/auth — do not remove) ───────────────
    ...authTables,

    // ─── Users ─────────────────────────────────────────────────────────────
    // Extends Convex Auth's user table with Lasha-specific fields.
    users: defineTable({
      // Auth fields (from @convex-dev/auth — do not remove or modify)
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),

      // Lasha fields
      role: v.optional(schemaRoleValidator),
      phone: v.optional(v.string()),
      businessId: v.optional(v.id("businesses")),

      // Driver fields (only for couriers)
      currentLat: v.optional(v.number()),
      currentLng: v.optional(v.number()),
      lastLocationUpdate: v.optional(v.number()),
    })
      .index("email", ["email"]) // do not remove or modify
      .index("by_business", ["businessId"])
      .index("by_role", ["role"]),

    // ─── Businesses ────────────────────────────────────────────────────────
    // B2B accounts. Owned by a user.
    businesses: defineTable({
      name: v.string(),
      ownerUserId: v.id("users"),
      industry: v.optional(v.string()),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      registrationNumber: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_owner", ["ownerUserId"]),

    // ─── Addresses ─────────────────────────────────────────────────────────
    // Saved delivery locations for users and businesses.
    addresses: defineTable({
      userId: v.id("users"),
      label: v.string(), // e.g. "Home", "Office", "Warehouse"
      street: v.string(),
      city: v.string(),
      state: v.optional(v.string()),
      zip: v.string(),
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      isDefault: v.optional(v.boolean()),
    }).index("by_user", ["userId"]),

    // ─── Orders ────────────────────────────────────────────────────────────
    // Customer shipment requests. The primary business entity.
    orders: defineTable({
      senderId: v.id("users"),
      businessId: v.optional(v.id("businesses")),
      pickupAddressId: v.id("addresses"),
      dropoffAddressId: v.id("addresses"),
      // Recipient (who the package is sent to) — captured at creation.
      recipientName: v.optional(v.string()),
      recipientPhone: v.optional(v.string()),
      status: orderStatusValidator,
      description: v.optional(v.string()),
      packageSize: packageSizeValidator,
      parcelType: v.optional(parcelTypeValidator),
      expeditionType: v.optional(expeditionTypeValidator),
      width: v.optional(v.number()),       // cm
      height: v.optional(v.number()),      // cm
      weight: v.optional(v.number()),      // kg
      price: v.number(),                   // cents (ZAR)
      scheduledTime: v.optional(v.number()),
      trackingNumber: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_sender", ["senderId"])
      .index("by_status", ["status"])
      .index("by_business", ["businessId"])
      .index("by_tracking", ["trackingNumber"])
      .index("by_sender_status", ["senderId", "status"])
      .index("by_created", ["createdAt"]),

    // ─── Deliveries ────────────────────────────────────────────────────────
    // Courier assignments. One delivery per order.
    // Uses the authoritative delivery status validator.
    deliveries: defineTable({
      orderId: v.id("orders"),
      courierId: v.optional(v.id("users")),
      vehicleId: v.optional(v.id("vehicles")),
      status: deliveryStatusValidator,
      trackingNumber: v.string(),
      pickupLat: v.optional(v.number()),
      pickupLng: v.optional(v.number()),
      dropoffLat: v.optional(v.number()),
      dropoffLng: v.optional(v.number()),
      estimatedArrival: v.optional(v.number()),
      actualArrival: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      assignedAt: v.optional(v.number()),
      acceptedAt: v.optional(v.number()),
      rejectedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
    })
      .index("by_order", ["orderId"])
      .index("by_courier", ["courierId"])
      .index("by_status", ["status"])
      .index("by_tracking", ["trackingNumber"])
      .index("by_courier_status", ["courierId", "status"]),

    // ─── Reviews ───────────────────────────────────────────────────────────
    // Post-delivery ratings.
    reviews: defineTable({
      orderId: v.id("orders"),
      reviewerId: v.id("users"),
      courierId: v.id("users"),
      rating: v.number(), // 1-5
      comment: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_order", ["orderId"])
      .index("by_courier", ["courierId"]),

    // ─── Vehicles ──────────────────────────────────────────────────────────
    // Fleet vehicles. Each vehicle belongs to a driver.
    vehicles: defineTable({
      driverId: v.id("users"),
      registration: v.string(),           // "FR35C0 GP"
      make: v.string(),                   // "Toyota"
      model: v.string(),                  // "Quantum"
      year: v.optional(v.number()),
      capacity: v.number(),               // kg
      breaking: v.boolean(),
      express: v.boolean(),
      flammable: v.boolean(),
      trailer: v.boolean(),
      isActive: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_driver", ["driverId"])
      .index("by_registration", ["registration"])
      .index("by_active_driver", ["driverId", "isActive"]),

    // ─── Driver Profiles ───────────────────────────────────────────────────
    // Driver-specific data. One profile per driver user.
    driver_profiles: defineTable({
      userId: v.id("users"),
      licenseClass: v.string(),           // "B Code 08", "C Code 10"
      licenseNumber: v.optional(v.string()),
      rating: v.number(),                 // 0-5 average
      totalTrips: v.number(),
      totalEarnings: v.number(),          // cents
      isAvailable: v.boolean(),
      currentVehicleId: v.optional(v.id("vehicles")),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_available", ["isAvailable"]),

    // ─── Wallets ───────────────────────────────────────────────────────────
    // User wallet balances. One wallet per user.
    wallets: defineTable({
      userId: v.id("users"),
      balance: v.number(),                // cents (ZAR)
      currency: v.literal("ZAR"),
      isActive: v.boolean(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // ─── Transactions ──────────────────────────────────────────────────────
    // Financial transaction history.
    transactions: defineTable({
      walletId: v.id("wallets"),
      type: transactionTypeValidator,
      amount: v.number(),                 // cents
      description: v.string(),
      reference: v.optional(v.string()),  // "TOP-20260901-001"
      status: transactionStatusValidator,
      orderId: v.optional(v.id("orders")),
      invoiceId: v.optional(v.id("invoices")),
      createdAt: v.number(),
    })
      .index("by_wallet", ["walletId"])
      .index("by_wallet_status", ["walletId", "status"])
      .index("by_order", ["orderId"])
      .index("by_created", ["createdAt"]),

    // ─── Invoices ──────────────────────────────────────────────────────────
    // Invoice management.
    invoices: defineTable({
      businessId: v.optional(v.id("businesses")),
      userId: v.id("users"),
      invoiceNumber: v.string(),          // "INV-2024-001"
      amount: v.number(),                 // cents
      status: invoiceStatusValidator,
      dueDate: v.optional(v.number()),
      paidAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_business", ["businessId"])
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_number", ["invoiceNumber"]),

    // ─── Notifications ─────────────────────────────────────────────────────
    // User notifications.
    notifications: defineTable({
      userId: v.id("users"),
      type: notificationTypeValidator,
      title: v.string(),
      description: v.string(),
      isRead: v.boolean(),
      entityId: v.optional(v.string()),
      // Idempotency for domain-event notifications: `${eventType}:${deliveryId}`
      // (or the analogous event/entity pair). Unique per (user, eventKey) — a
      // retried domain transition cannot create a duplicate notification.
      eventKey: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_unread", ["userId", "isRead"])
      .index("by_user_event", ["userId", "eventKey"]),

    // ─── Notification Preferences ──────────────────────────────────────────
    // User notification settings. One record per user.
    notification_preferences: defineTable({
      userId: v.id("users"),
      emailNotifications: v.boolean(),
      smsNotifications: v.boolean(),
      pushNotifications: v.boolean(),
      deliveryUpdates: v.boolean(),
      marketingEmails: v.boolean(),
    }).index("by_user", ["userId"]),

    // ─── Tracking Events ───────────────────────────────────────────────────
    // Delivery location history.
    tracking_events: defineTable({
      deliveryId: v.id("deliveries"),
      type: trackingEventTypeValidator,
      lat: v.optional(v.number()),
      lng: v.optional(v.number()),
      timestamp: v.number(),
      metadata: v.optional(v.string()),
    })
      .index("by_delivery", ["deliveryId"])
      .index("by_delivery_time", ["deliveryId", "timestamp"]),

    // ─── Dispatch Offers ─────────────────────────────────────────────────
    // Pending assignment offers to drivers. One active offer per delivery.
    dispatch_offers: defineTable({
      deliveryId: v.id("deliveries"),
      driverId: v.id("users"),
      vehicleId: v.id("vehicles"),
      score: v.number(),                 // composite score from scoring service
      status: v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("rejected"),
        v.literal("expired"),
        v.literal("cancelled"),
      ),
      offeredAt: v.number(),
      expiresAt: v.number(),
      respondedAt: v.optional(v.number()),
      rejectionReason: v.optional(v.string()),
    })
      .index("by_delivery", ["deliveryId"])
      .index("by_driver", ["driverId"])
      .index("by_delivery_status", ["deliveryId", "status"])
      .index("by_expires", ["expiresAt", "status"]),

    // ─── Pricing Rules ─────────────────────────────────────────────────────
    // Delivery pricing logic with versioning.
    pricing_rules: defineTable({
      name: v.string(),
      packageSize: packageSizeValidator,
      parcelType: v.optional(parcelTypeValidator),
      expeditionType: expeditionTypeValidator,
      basePrice: v.number(),              // cents
      pricePerKm: v.number(),             // cents
      pricePerKg: v.number(),             // cents
      minimumPrice: v.number(),           // cents
      // Platform fee
      platformFeeType: v.union(v.literal("percentage"), v.literal("flat")),
      platformFeeValue: v.number(),       // percentage (0-100) or cents
      // Surcharges
      expressSurcharge: v.optional(v.number()),  // cents
      sameDaySurcharge: v.optional(v.number()),  // cents
      // Versioning
      version: v.number(),
      effectiveFrom: v.number(),
      effectiveTo: v.optional(v.number()),
      isActive: v.boolean(),
      createdAt: v.number(),
    }).index("size_expedition", ["packageSize", "expeditionType", "isActive"])
      .index("by_version", ["version"])  
      .index("by_effective", ["effectiveFrom", "isActive"]),

    // ─── Delivery Quotes ────────────────────────────────────────────────────
    // Stores pricing breakdown for each delivery for audit trail.
    delivery_quotes: defineTable({
      orderId: v.id("orders"),
      deliveryId: v.optional(v.id("deliveries")),
      pricingRuleId: v.id("pricing_rules"),
      userId: v.id("users"),
      // Pricing breakdown
      basePrice: v.number(),              // cents
      distanceFee: v.number(),            // cents
      weightFee: v.number(),              // cents
      subtotal: v.number(),               // cents
      // Surcharges
      expressSurcharge: v.number(),       // cents
      sameDaySurcharge: v.number(),       // cents
      additionalFees: v.number(),         // cents
      // Totals
      deliveryFee: v.number(),            // cents (subtotal + surcharges)
      platformFee: v.number(),            // cents
      totalCharge: v.number(),            // cents (deliveryFee + platformFee)
      // Driver
      driverEarnings: v.number(),         // cents
      // Metadata
      distanceKm: v.number(),
      weightKg: v.number(),
      calculatedAt: v.number(),
    })
      .index("by_order", ["orderId"])
      .index("by_delivery", ["deliveryId"])
      .index("by_user", ["userId"])
      .index("by_calculated", ["calculatedAt"]),

    // ─── Email Outbox ─────────────────────────────────────────────────────
    // Durable outbound email queue (Resend-ready seam — see email/index.ts).
    // Rows are written when RESEND_API_KEY is absent or delivery fails, so
    // nothing is silently dropped; a worker can drain the queue once email
    // is configured.
    email_outbox: defineTable({
      to: v.array(v.string()),
      subject: v.string(),
      html: v.string(),
      text: v.string(),
      status: v.union(
        v.literal("queued"),
        v.literal("failed"),
        v.literal("sent"),
      ),
      entityId: v.optional(v.string()),
      orderId: v.optional(v.string()),
      attempts: v.number(),
      sentAt: v.optional(v.number()),
      lastError: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_order", ["orderId"]),

    // ─── Settlements ────────────────────────────────────────────────────────
    // Driver settlement records.
    settlements: defineTable({
      driverId: v.id("users"),
      deliveryId: v.id("deliveries"),
      orderId: v.id("orders"),
      quoteId: v.id("delivery_quotes"),
      // Amounts
      deliveryFee: v.number(),            // cents
      platformFee: v.number(),            // cents
      driverEarnings: v.number(),         // cents
      // State
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("disputed"),
      ),
      // Idempotency
      idempotencyKey: v.string(),
      // Timestamps
      createdAt: v.number(),
      processedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      failureReason: v.optional(v.string()),
    })
      .index("by_driver", ["driverId"])
      .index("by_delivery", ["deliveryId"])
      .index("by_order", ["orderId"])
      .index("by_status", ["status"])
      .index("by_idempotency", ["idempotencyKey"])  
      .index("by_driver_status", ["driverId", "status"]),

    // ─── Payment Transactions ───────────────────────────────────────────────
    // External payment tracking.
    payment_transactions: defineTable({
      orderId: v.id("orders"),
      userId: v.id("users"),
      // Payment details
      amount: v.number(),                 // cents
      currency: v.literal("ZAR"),
      method: v.string(),                 // "card", "eft", "wallet", "snapscan"
      // Provider
      provider: v.string(),               // "payfast", "stripe", etc.
      providerTransactionId: v.optional(v.string()),
      // State
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("refunded"),
      ),
      // Idempotency
      idempotencyKey: v.string(),
      // Metadata
      metadata: v.optional(v.string()),
      createdAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_order", ["orderId"])
      .index("by_user", ["userId"])
      .index("by_status", ["status"])
      .index("by_idempotency", ["idempotencyKey"])  
      .index("by_provider", ["provider", "providerTransactionId"]),

    // ─── Proof of Delivery ──────────────────────────────────────────────────
    // POD records for completed/failed deliveries.
    proof_of_delivery: defineTable({
      deliveryId: v.id("deliveries"),
      orderId: v.id("orders"),
      submittedBy: v.id("users"),
      // Delivery outcome
      outcome: v.union(
        v.literal("delivered"),
        v.literal("partial"),
        v.literal("failed"),
      ),
      // Recipient information
      recipientName: v.string(),
      recipientPhone: v.optional(v.string()),
      recipientSignatureId: v.optional(v.string()),  // File storage ID
      // Delivery notes
      deliveryNotes: v.optional(v.string()),
      // Location evidence
      latitude: v.optional(v.number()),
      longitude: v.optional(v.number()),
      locationAccuracy: v.optional(v.number()),
      // Timestamps
      deliveredAt: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
      // Failure information (if outcome is failed)
      failureReason: v.optional(v.union(
        v.literal("recipient_unavailable"),
        v.literal("incorrect_address"),
        v.literal("refused_delivery"),
        v.literal("damaged_goods"),
        v.literal("missing_goods"),
        v.literal("vehicle_problem"),
        v.literal("safety_issue"),
        v.literal("other"),
      )),
      failureNotes: v.optional(v.string()),
      // Idempotency
      idempotencyKey: v.string(),
    })
      .index("by_delivery", ["deliveryId"])
      .index("by_order", ["orderId"])
      .index("by_submitter", ["submittedBy"])
      .index("by_outcome", ["outcome"])
      .index("by_idempotency", ["idempotencyKey"]),

    // ─── POD Files ───────────────────────────────────────────────────────────
    // Photos, signatures, and documents attached to POD.
    pod_files: defineTable({
      podId: v.id("proof_of_delivery"),
      deliveryId: v.id("deliveries"),
      fileId: v.string(),          // Convex File Storage ID
      fileType: v.union(
        v.literal("photo"),
        v.literal("signature"),
        v.literal("document"),
      ),
      fileName: v.string(),
      fileSize: v.number(),        // bytes
      mimeType: v.string(),
      description: v.optional(v.string()),
      uploadedBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_pod", ["podId"])
      .index("by_delivery", ["deliveryId"])
      .index("by_type", ["fileType"]),

    // ─── Audit Events ────────────────────────────────────────────────────────
    // Immutable audit trail for all important system actions.
    // Records who did what, when, to which entity, and what changed.
    audit_events: defineTable({
      // Actor information.
      // actorId is the authenticated human user who performed the action.
      // It is OPTIONAL: explicitly system-generated events (actorRole:
      // "system", e.g. the logging bridge) omit actorId entirely so a system
      // event can never be mistaken for — or misattributed to — a real user.
      // Never fall back to an arbitrary user to satisfy this field.
      actorId: v.optional(v.id("users")),
      actorRole: v.string(),
      actorEmail: v.optional(v.string()),
      
      // Event classification
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
        v.literal("system"),
      ),
      action: v.string(),
      
      // Entity reference
      entityType: v.string(),
      entityId: v.string(),
      
      // Changes (before/after snapshots)
      before: v.optional(v.string()),  // JSON string of previous state
      after: v.optional(v.string()),   // JSON string of new state
      
      // Context
      metadata: v.optional(v.string()),  // Additional context as JSON
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      
      // Delivery-specific context (optional denormalization for fast queries)
      deliveryId: v.optional(v.id("deliveries")),
      orderId: v.optional(v.id("orders")),
      
      // Timestamp (immutable)
      timestamp: v.number(),
    })
      .index("by_actor", ["actorId", "timestamp"])
      .index("by_category", ["category", "timestamp"])
      .index("by_entity", ["entityType", "entityId", "timestamp"])
      .index("by_delivery", ["deliveryId", "timestamp"])
      .index("by_order", ["orderId", "timestamp"])
      .index("by_timestamp", ["timestamp"])  
      .index("by_action", ["action", "timestamp"]),

    // ─── Metrics Storage ────────────────────────────────────────────────
    // Aggregated operational metrics for monitoring.
    // Stored at regular intervals by background jobs or manual collection.
    metrics_storage: defineTable({
      metricName: v.string(),           // e.g., "delivery.completed", "dispatch.latency",
      metricType: v.union(
        v.literal("counter"),
        v.literal("gauge"),
        v.literal("histogram"),
      ),
      value: v.number(),
      dimensions: v.optional(v.record(v.string(), v.string())),  // e.g., { status: "delivered", role: "driver" }
      timestamp: v.number(),
      periodStart: v.number(),           // aggregation window start
      periodEnd: v.number(),             // aggregation window end
      sampleCount: v.optional(v.number()),  // for histograms
    })
      .index("by_name_time", ["metricName", "timestamp"])
      .index("by_period", ["periodStart", "periodEnd"])
      .index("by_name_period", ["metricName", "periodStart"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
