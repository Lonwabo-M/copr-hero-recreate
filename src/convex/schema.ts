import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
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

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      phone: v.optional(v.string()),
      businessId: v.optional(v.id("businesses")),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Businesses — B2B accounts
    businesses: defineTable({
      name: v.string(),
      ownerUserId: v.id("users"),
      industry: v.optional(v.string()),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_owner", ["ownerUserId"]),

    // Delivery addresses (saved locations for users and businesses)
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

    // Orders — customer shipments
    orders: defineTable({
      senderId: v.id("users"),
      businessId: v.optional(v.id("businesses")),
      pickupAddressId: v.id("addresses"),
      dropoffAddressId: v.id("addresses"),
      status: orderStatusValidator,
      description: v.optional(v.string()),
      packageSize: v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
      price: v.number(),
      scheduledTime: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_sender", ["senderId"]).index("by_status", ["status"]).index("by_business", ["businessId"]),

    // Couriers / deliveries — tracking courier assignments
    deliveries: defineTable({
      orderId: v.id("orders"),
      courierId: v.optional(v.id("users")),
      status: orderStatusValidator,
      pickupLat: v.optional(v.number()),
      pickupLng: v.optional(v.number()),
      dropoffLat: v.optional(v.number()),
      dropoffLng: v.optional(v.number()),
      estimatedArrival: v.optional(v.number()),
      actualArrival: v.optional(v.number()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
    }).index("by_order", ["orderId"]).index("by_courier", ["courierId"]),

    // Reviews left after completed deliveries
    reviews: defineTable({
      orderId: v.id("orders"),
      reviewerId: v.id("users"),
      courierId: v.id("users"),
      rating: v.number(), // 1-5
      comment: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_order", ["orderId"]).index("by_courier", ["courierId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
