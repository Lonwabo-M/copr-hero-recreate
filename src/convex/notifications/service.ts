/**
 * Lasha Notifications Service
 *
 * Server-side notification system that creates notifications from domain events.
 * Notifications are created by mutations, not by React.
 * React only reads notifications via reactive queries.
 */

import { mutation, query, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { ROLES, DELIVERY_STATUS } from "../schema";
import { requireAuth, getCurrentAuthUser } from "../auth/authorization";

// ─── Notification Event Types ─────────────────────────────────────────────────

/** Notification categories for UI display */
export type NotificationCategory =
  | "delivery"
  | "payment"
  | "alert"
  | "system"
  | "security";

/** Notification event types for domain operations */
export type NotificationEventType =
  // Delivery events
  | "delivery_created"
  | "delivery_assigned"
  | "delivery_accepted"
  | "delivery_rejected"
  | "delivery_en_route_pickup"
  | "delivery_arrived_pickup"
  | "delivery_picked_up"
  | "delivery_in_transit"
  | "delivery_arrived_dropoff"
  | "delivery_completed"
  | "delivery_failed"
  | "delivery_cancelled"
  | "delivery_reassigned"
  // Payment events
  | "payment_received"
  | "payment_failed"
  | "invoice_generated"
  | "settlement_completed"
  // System events
  | "account_updated"
  | "security_alert"
  | "system_maintenance";

// ─── Notification Templates ───────────────────────────────────────────────────

interface NotificationTemplate {
  category: NotificationCategory;
  titleTemplate: string;
  descriptionTemplate: string;
  iconType: "delivery" | "payment" | "alert";
}

const NOTIFICATION_TEMPLATES: Record<NotificationEventType, NotificationTemplate> = {
  // Delivery events
  delivery_created: {
    category: "delivery",
    titleTemplate: "Delivery Requested",
    descriptionTemplate: "Your delivery request for order #{orderId} has been received.",
    iconType: "delivery",
  },
  delivery_assigned: {
    category: "delivery",
    titleTemplate: "Driver Assigned",
    descriptionTemplate: "{driverName} has been assigned to your delivery #{orderId}.",
    iconType: "delivery",
  },
  delivery_accepted: {
    category: "delivery",
    titleTemplate: "Assignment Accepted",
    descriptionTemplate: "You have accepted the delivery assignment for order #{orderId}.",
    iconType: "delivery",
  },
  delivery_rejected: {
    category: "delivery",
    titleTemplate: "Assignment Rejected",
    descriptionTemplate: "The driver has rejected the assignment for order #{orderId}.",
    iconType: "alert",
  },
  delivery_en_route_pickup: {
    category: "delivery",
    titleTemplate: "Driver En Route",
    descriptionTemplate: "The driver is on the way to pick up order #{orderId}.",
    iconType: "delivery",
  },
  delivery_arrived_pickup: {
    category: "delivery",
    titleTemplate: "Driver Arrived",
    descriptionTemplate: "The driver has arrived at the pickup location for order #{orderId}.",
    iconType: "delivery",
  },
  delivery_picked_up: {
    category: "delivery",
    titleTemplate: "Package Picked Up",
    descriptionTemplate: "Order #{orderId} has been picked up and is on its way.",
    iconType: "delivery",
  },
  delivery_in_transit: {
    category: "delivery",
    titleTemplate: "In Transit",
    descriptionTemplate: "Order #{orderId} is now in transit to the dropoff location.",
    iconType: "delivery",
  },
  delivery_arrived_dropoff: {
    category: "delivery",
    titleTemplate: "Arrived at Destination",
    descriptionTemplate: "The driver has arrived at the dropoff location for order #{orderId}.",
    iconType: "delivery",
  },
  delivery_completed: {
    category: "delivery",
    titleTemplate: "Delivery Completed",
    descriptionTemplate: "Order #{orderId} has been successfully delivered.",
    iconType: "delivery",
  },
  delivery_failed: {
    category: "alert",
    titleTemplate: "Delivery Failed",
    descriptionTemplate: "Order #{orderId} could not be delivered. Reason: {reason}",
    iconType: "alert",
  },
  delivery_cancelled: {
    category: "delivery",
    titleTemplate: "Delivery Cancelled",
    descriptionTemplate: "Order #{orderId} has been cancelled.",
    iconType: "alert",
  },
  delivery_reassigned: {
    category: "delivery",
    titleTemplate: "Delivery Reassigned",
    descriptionTemplate: "Order #{orderId} has been reassigned to a new driver.",
    iconType: "delivery",
  },
  // Payment events
  payment_received: {
    category: "payment",
    titleTemplate: "Payment Received",
    descriptionTemplate: "R{amount} has been credited to your wallet.",
    iconType: "payment",
  },
  payment_failed: {
    category: "payment",
    titleTemplate: "Payment Failed",
    descriptionTemplate: "Your payment of R{amount} could not be processed.",
    iconType: "alert",
  },
  invoice_generated: {
    category: "payment",
    titleTemplate: "Invoice Generated",
    descriptionTemplate: "Invoice {invoiceNumber} for R{amount} has been generated.",
    iconType: "payment",
  },
  settlement_completed: {
    category: "payment",
    titleTemplate: "Settlement Completed",
    descriptionTemplate: "R{amount} has been transferred to your account.",
    iconType: "payment",
  },
  // System events
  account_updated: {
    category: "system",
    titleTemplate: "Account Updated",
    descriptionTemplate: "Your account settings have been updated.",
    iconType: "delivery",
  },
  security_alert: {
    category: "security",
    titleTemplate: "Security Alert",
    descriptionTemplate: "{message}",
    iconType: "alert",
  },
  system_maintenance: {
    category: "system",
    titleTemplate: "System Maintenance",
    descriptionTemplate: "Scheduled maintenance is planned for {time}.",
    iconType: "alert",
  },
};

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get notifications for the current user.
 */
export const getMyNotifications = query({
  args: {
    limit: v.optional(v.number()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    let q = ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user.userId));

    if (args.unreadOnly) {
      q = ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", user.userId).eq("isRead", false)
        );
    }

    const limit = args.limit ?? 50;
    return await q.order("desc").take(limit);
  },
});

/**
 * Get unread notification count for the current user.
 */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user.userId).eq("isRead", false)
      )
      .collect();

    return unread.length;
  },
});

/**
 * Get notification preferences for the current user.
 */
export const getMyPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const prefs = await ctx.db
      .query("notification_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .unique();

    // Return default preferences if none exist
    if (!prefs) {
      return {
        userId: user.userId,
        emailNotifications: true,
        smsNotifications: true,
        pushNotifications: true,
        deliveryUpdates: true,
        marketingEmails: false,
      };
    }

    return prefs;
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a notification for a user.
 * This is the primary mutation for creating notifications.
 */
export const createNotification = mutation({
  args: {
    userId: v.id("users"),
    eventType: v.string(),
    title: v.string(),
    description: v.string(),
    entityId: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("delivery"),
      v.literal("payment"),
      v.literal("alert"),
      v.literal("system"),
      v.literal("security"),
    )),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check user preferences
    const prefs = await ctx.db
      .query("notification_preferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    // If preferences exist and delivery updates are disabled, skip
    if (prefs && !prefs.deliveryUpdates && args.category === "delivery") {
      return null;
    }

    // Create notification
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.category ?? "delivery",
      title: args.title,
      description: args.description,
      isRead: false,
      entityId: args.entityId,
      createdAt: now,
    });

    return notificationId;
  },
});

/**
 * Mark a notification as read.
 */
export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    // Verify ownership
    if (notification.userId !== user) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.notificationId, { isRead: true });
    return { success: true };
  },
});

/**
 * Mark all notifications as read for the current user.
 */
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user).eq("isRead", false)
      )
      .collect();

    for (const notification of unreadNotifications) {
      await ctx.db.patch(notification._id, { isRead: true });
    }

    return { marked: unreadNotifications.length };
  },
});

/**
 * Delete a notification.
 */
export const deleteNotification = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    // Verify ownership
    if (notification.userId !== user) {
      throw new Error("Access denied");
    }

    await ctx.db.delete(args.notificationId);
    return { success: true };
  },
});

/**
 * Update notification preferences.
 */
export const updatePreferences = mutation({
  args: {
    emailNotifications: v.optional(v.boolean()),
    smsNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    deliveryUpdates: v.optional(v.boolean()),
    marketingEmails: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const now = Date.now();

    // Get existing preferences
    const existing = await ctx.db
      .query("notification_preferences")
      .withIndex("by_user", (q) => q.eq("userId", user))
      .unique();

    if (existing) {
      // Update existing preferences
      await ctx.db.patch(existing._id, {
        ...(args.emailNotifications !== undefined && { emailNotifications: args.emailNotifications }),
        ...(args.smsNotifications !== undefined && { smsNotifications: args.smsNotifications }),
        ...(args.pushNotifications !== undefined && { pushNotifications: args.pushNotifications }),
        ...(args.deliveryUpdates !== undefined && { deliveryUpdates: args.deliveryUpdates }),
        ...(args.marketingEmails !== undefined && { marketingEmails: args.marketingEmails }),
      });
    } else {
      // Create new preferences
      await ctx.db.insert("notification_preferences", {
        userId: user,
        emailNotifications: args.emailNotifications ?? true,
        smsNotifications: args.smsNotifications ?? true,
        pushNotifications: args.pushNotifications ?? true,
        deliveryUpdates: args.deliveryUpdates ?? true,
        marketingEmails: args.marketingEmails ?? false,
      });
    }

    return { success: true };
  },
});

// ─── Internal Mutations (for domain events) ───────────────────────────────────

/**
 * Internal: Send notification for delivery event.
 * Called by domain operations (state machine, dispatch, etc.)
 */
export const sendDeliveryNotification = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    eventType: v.string(),
    recipientUserIds: v.array(v.id("users")),
    templateData: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const template = NOTIFICATION_TEMPLATES[args.eventType as NotificationEventType];
    if (!template) {
      console.warn(`No template for event type: ${args.eventType}`);
      return;
    }

    // Get delivery for context
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return;

    const order = await ctx.db.get(delivery.orderId);
    const orderIdShort = order ? args.deliveryId.slice(-6).toUpperCase() : "UNKNOWN";

    const now = Date.now();
    const results = [];

    for (const userId of args.recipientUserIds) {
      // Check preferences
      const prefs = await ctx.db
        .query("notification_preferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();

      // Skip if delivery updates disabled
      if (prefs && !prefs.deliveryUpdates && template.category === "delivery") {
        continue;
      }

      // Replace template variables
      let title = template.titleTemplate;
      let description = template.descriptionTemplate;

      description = description.replace("{orderId}", orderIdShort);

      // Apply custom template data
      if (args.templateData) {
        for (const [key, value] of Object.entries(args.templateData)) {
          title = title.replace(`{${key}}`, value);
          description = description.replace(`{${key}}`, value);
        }
      }

      // Create notification
      await ctx.db.insert("notifications", {
        userId,
        type: template.category,
        title,
        description,
        isRead: false,
        entityId: args.deliveryId,
        createdAt: now,
      });

      results.push(userId);
    }

    return { sent: results.length };
  },
});

/**
 * Internal: Send notification for payment event.
 */
export const sendPaymentNotification = internalMutation({
  args: {
    userId: v.id("users"),
    eventType: v.string(),
    templateData: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const template = NOTIFICATION_TEMPLATES[args.eventType as NotificationEventType];
    if (!template) return;

    // Check preferences
    const prefs = await ctx.db
      .query("notification_preferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (prefs && !prefs.deliveryUpdates && template.category === "payment") {
      return;
    }

    // Replace template variables
    let title = template.titleTemplate;
    let description = template.descriptionTemplate;

    if (args.templateData) {
      for (const [key, value] of Object.entries(args.templateData)) {
        title = title.replace(`{${key}}`, value);
        description = description.replace(`{${key}}`, value);
      }
    }

    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: template.category,
      title,
      description,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

/**
 * Internal: Send system notification.
 */
export const sendSystemNotification = internalMutation({
  args: {
    userId: v.id("users"),
    eventType: v.string(),
    templateData: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const template = NOTIFICATION_TEMPLATES[args.eventType as NotificationEventType];
    if (!template) return;

    let title = template.titleTemplate;
    let description = template.descriptionTemplate;

    if (args.templateData) {
      for (const [key, value] of Object.entries(args.templateData)) {
        title = title.replace(`{${key}}`, value);
        description = description.replace(`{${key}}`, value);
      }
    }

    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: template.category,
      title,
      description,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});
