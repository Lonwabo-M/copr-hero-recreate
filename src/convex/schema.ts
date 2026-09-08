import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ─── Validators ───────────────────────────────────────────────────────────────

// User roles
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
  BUSINESS: "business",
  COURIER: "courier",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
  v.literal(ROLES.BUSINESS),
  v.literal(ROLES.COURIER),
);
export type Role = Infer<typeof roleValidator>;

// Order status values
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
      role: v.optional(roleValidator),
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
    deliveries: defineTable({
      orderId: v.id("orders"),
      courierId: v.optional(v.id("users")),
      vehicleId: v.optional(v.id("vehicles")),
      status: orderStatusValidator,
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
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_unread", ["userId", "isRead"]),

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

    // ─── Pricing Rules ─────────────────────────────────────────────────────
    // Delivery pricing logic.
    pricing_rules: defineTable({
      name: v.string(),
      packageSize: packageSizeValidator,
      parcelType: v.optional(parcelTypeValidator),
      expeditionType: expeditionTypeValidator,
      basePrice: v.number(),              // cents
      pricePerKm: v.number(),             // cents
      pricePerKg: v.number(),             // cents
      minimumPrice: v.number(),           // cents
      isActive: v.boolean(),
      createdAt: v.number(),
    }).index("size_expedition", ["packageSize", "expeditionType", "isActive"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
