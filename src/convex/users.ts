import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth, getCurrentAuthUser } from "./auth/authorization";
import { ROLES } from "./schema";
import {
  AUDIT_ACTIONS,
} from "./audit/service";
import {
  validateName,
  validatePhone,
} from "./users/profileValidation";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/**
 * Update the authenticated user's own profile.
 *
 * Security model:
 * - The target user is ALWAYS the authenticated session user. There are no
 *   client-provided user IDs, so one user can never modify another user's
 *   profile through this mutation.
 * - Only name and phone are accepted. Privileged fields (role, businessId,
 *   email, verification state, GPS) are not part of the mutation args and
 *   cannot be changed here.
 * - Input is validated server-side (see users/profileValidation.ts).
 * - Changes are recorded in the audit log (user.updated).
 */
export const updateMyProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Server-side validation of the permitted fields
    if (args.name !== undefined) {
      const nameError = validateName(args.name);
      if (nameError) throw new Error(nameError);
    }
    if (args.phone !== undefined) {
      const phoneError = validatePhone(args.phone);
      if (phoneError) throw new Error(phoneError);
    }

    // Build the patch from the whitelisted fields only
    const patch: { name?: string; phone?: string; updatedAt?: number } = {};
    if (args.name !== undefined) {
      patch.name = args.name.trim();
    }
    if (args.phone !== undefined) {
      patch.phone = args.phone.trim() === "" ? undefined : args.phone.trim();
    }

    const changed = Object.keys(patch);
    if (changed.length === 0) {
      return { success: true, updated: [] };
    }

    const before = JSON.stringify({ name: user.name ?? null, phone: user.phone ?? null });

    await ctx.db.patch(userId, patch);

    const after = JSON.stringify({
      name: patch.name ?? user.name ?? null,
      phone: patch.phone ?? null,
    });

    // Audit: record who changed their own profile and what changed
    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (user.role as string) ?? "customer",
      category: "user",
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: "users",
      entityId: userId,
      before,
      after,
      metadata: JSON.stringify({ fields: changed }),
    });

    return { success: true, updated: changed };
  },
});

/**
 * Get the current user's wallet.
 */
export const getWallet = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    // Return wallet or a default empty wallet shape
    return wallet ?? {
      _id: null,
      balance: 0,
      currency: "ZAR" as const,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
});

/**
 * Get the current user's transactions.
 */
export const getTransactions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!wallet) return [];

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
      .order("desc")
      .take(50);

    return transactions;
  },
});

/**
 * Get invoices for the current user.
 */
export const getInvoices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // Super admin and operations see all invoices
    if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
      return await ctx.db.query("invoices").order("desc").take(50);
    }

    // Others see only their own invoices
    return await ctx.db
      .query("invoices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

/**
 * Get past deliveries for the current user.
 */
export const getPastDeliveries = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    let deliveries;

    if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
      // Admin sees all completed/cancelled deliveries
      deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_status", (q) => q.eq("status", "delivered"))
        .order("desc")
        .take(50);

      const cancelled = await ctx.db
        .query("deliveries")
        .withIndex("by_status", (q) => q.eq("status", "cancelled"))
        .order("desc")
        .take(50);

      deliveries = [...deliveries, ...cancelled].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    } else if (user.role === ROLES.DRIVER) {
      // Driver sees their assigned deliveries
      deliveries = await ctx.db
        .query("deliveries")
        .withIndex("by_courier_status", (q) => q.eq("courierId", userId).eq("status", "delivered"))
        .order("desc")
        .take(50);
    } else {
      // Customer sees their orders' deliveries
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_sender", (q) => q.eq("senderId", userId))
        .collect();

      const orderIds = new Set(orders.map((o) => o._id));
      const allDeliveries: any[] = [];

      for (const order of orders) {
        const delivery = await ctx.db
          .query("deliveries")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .unique();
        if (delivery && (delivery.status === "delivered" || delivery.status === "cancelled")) {
          allDeliveries.push(delivery);
        }
      }

      deliveries = allDeliveries.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    }

    // Enrich with driver info
    const enriched = [];
    for (const d of deliveries) {
      let driverName = "N/A";
      if (d.courierId) {
        const driver = await ctx.db.get(d.courierId);
        if (driver && "name" in driver) {
          driverName = (driver as any).name ?? "Unknown";
        }
      }
      enriched.push({
        ...d,
        driverName,
      });
    }

    return enriched;
  },
});
