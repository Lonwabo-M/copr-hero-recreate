/**
 * Lasha Pricing Service
 *
 * Server-side pricing calculation for deliveries.
 * React must NEVER calculate prices directly.
 * All pricing logic lives in Convex.
 */

import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import {
  DELIVERY_STATUS,
  ROLES,
  packageSizeValidator,
  parcelTypeValidator,
  expeditionTypeValidator,
} from "../schema";
import { requireAuth, requirePermission, getCurrentAuthUser } from "../auth/authorization";
import { AUDIT_ACTIONS } from "../audit/service";
import { internal } from "../_generated/api";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Pricing input for quote calculation */
export interface PricingInput {
  packageSize: "small" | "medium" | "large";
  parcelType?: "document" | "small_parcel" | "large_parcel" | "pallet";
  expeditionType: "standard" | "express" | "same_day";
  distanceKm: number;
  weightKg: number;
  numberOfStops?: number;
}

/** Pricing breakdown */
export interface PricingBreakdown {
  // Pricing rule used
  pricingRuleId: Id<"pricing_rules">;
  pricingRuleVersion: number;
  
  // Base calculation
  basePrice: number;
  distanceFee: number;
  weightFee: number;
  subtotal: number;
  
  // Surcharges
  expressSurcharge: number;
  sameDaySurcharge: number;
  additionalFees: number;
  
  // Totals
  deliveryFee: number;
  platformFee: number;
  totalCharge: number;
  
  // Driver
  driverEarnings: number;
  
  // Metadata
  distanceKm: number;
  weightKg: number;
}

// ─── Pricing Calculation Logic ────────────────────────────────────────────────

/**
 * Calculate pricing breakdown from input.
 * This is the core pricing algorithm.
 */
function calculatePricingBreakdown(
  input: PricingInput,
  rule: Doc<"pricing_rules">
): PricingBreakdown {
  // Base price
  const basePrice = rule.basePrice;
  
  // Distance fee
  const distanceFee = Math.round(rule.pricePerKm * input.distanceKm);
  
  // Weight fee
  const weightFee = Math.round(rule.pricePerKg * input.weightKg);
  
  // Subtotal (before surcharges)
  const subtotal = basePrice + distanceFee + weightFee;
  
  // Surcharges
  let expressSurcharge = 0;
  let sameDaySurcharge = 0;
  
  if (input.expeditionType === "express" && rule.expressSurcharge) {
    expressSurcharge = rule.expressSurcharge;
  }
  
  if (input.expeditionType === "same_day" && rule.sameDaySurcharge) {
    sameDaySurcharge = rule.sameDaySurcharge;
  }
  
  // Additional fees (e.g., extra stops)
  const additionalFees = 0; // Can be extended later
  
  // Delivery fee (subtotal + surcharges)
  const deliveryFee = Math.max(
    subtotal + expressSurcharge + sameDaySurcharge + additionalFees,
    rule.minimumPrice
  );
  
  // Platform fee
  let platformFee: number;
  if (rule.platformFeeType === "percentage") {
    platformFee = Math.round(deliveryFee * (rule.platformFeeValue / 100));
  } else {
    platformFee = rule.platformFeeValue;
  }
  
  // Total charge to customer
  const totalCharge = deliveryFee + platformFee;
  
  // Driver earnings (delivery fee minus platform fee)
  const driverEarnings = deliveryFee - platformFee;
  
  return {
    pricingRuleId: rule._id,
    pricingRuleVersion: rule.version,
    basePrice,
    distanceFee,
    weightFee,
    subtotal,
    expressSurcharge,
    sameDaySurcharge,
    additionalFees,
    deliveryFee,
    platformFee,
    totalCharge,
    driverEarnings,
    distanceKm: input.distanceKm,
    weightKg: input.weightKg,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get active pricing rules.
 */
export const getActivePricingRules = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    
    // Only operations and admin can view all rules
    const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied");
    }
    
    const rules = await ctx.db.query("pricing_rules").collect();
    return rules.filter((r) => r.isActive);
  },
});

/**
 * Get pricing rule by ID.
 */
export const getPricingRule = query({
  args: { ruleId: v.id("pricing_rules") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    
    return await ctx.db.get(args.ruleId);
  },
});

/**
 * Get quote for an order.
 */
export const getQuoteForOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    
    // Get the quote
    const quote = await ctx.db
      .query("delivery_quotes")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .first();
    
    if (!quote) return null;
    
    // Check access
    if (user.role === ROLES.CUSTOMER && quote.userId !== user.userId) {
      throw new Error("Access denied");
    }
    
    return quote;
  },
});

/**
 * Get driver's earnings summary.
 */
export const getDriverEarnings = query({
  args: {
    driverId: v.optional(v.id("users")),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    
    // Drivers can only view their own earnings
    const driverId = args.driverId ?? user.userId;
    if (user.role === ROLES.DRIVER && driverId !== user.userId) {
      throw new Error("Access denied: can only view own earnings");
    }
    
    // Get completed settlements
    let query = ctx.db
      .query("settlements")
      .withIndex("by_driver", (q) => q.eq("driverId", driverId));
    
    const settlements = await query.collect();
    
    // Filter by date range if provided
    const filtered = settlements.filter((s) => {
      if (args.startDate && s.createdAt < args.startDate) return false;
      if (args.endDate && s.createdAt > args.endDate) return false;
      return true;
    });
    
    // Calculate totals
    const completed = filtered.filter((s) => s.status === "completed");
    const pending = filtered.filter((s) => s.status === "pending" || s.status === "processing");
    
    const totalEarnings = completed.reduce((sum, s) => sum + s.driverEarnings, 0);
    const pendingEarnings = pending.reduce((sum, s) => sum + s.driverEarnings, 0);
    
    return {
      totalEarnings,
      pendingEarnings,
      completedCount: completed.length,
      pendingCount: pending.length,
      settlements: filtered,
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Calculate and store a quote for an order.
 * This is the authoritative pricing calculation.
 */
export const calculateQuote = mutation({
  args: {
    orderId: v.id("orders"),
    distanceKm: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    
    // Get the order
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    
    // Verify ownership
    if (order.senderId !== userId) {
      const user = await getCurrentAuthUser(ctx);
      if (!user || (user.role !== ROLES.OPERATIONS && user.role !== ROLES.SUPER_ADMIN)) {
        throw new Error("Access denied");
      }
    }
    
    // Find matching pricing rule
    const rule = await ctx.db
      .query("pricing_rules")
      .withIndex("size_expedition", (q) =>
        q
          .eq("packageSize", order.packageSize)
          .eq("expeditionType", order.expeditionType ?? "standard")
          .eq("isActive", true)
      )
      .first();
    
    if (!rule) {
      throw new Error("No active pricing rule found for this delivery type");
    }
    
    // Calculate pricing
    const input: PricingInput = {
      packageSize: order.packageSize,
      parcelType: order.parcelType,
      expeditionType: order.expeditionType ?? "standard",
      distanceKm: args.distanceKm,
      weightKg: order.weight ?? 0,
    };
    
    const breakdown = calculatePricingBreakdown(input, rule);
    
    // Store the quote
    const quoteId = await ctx.db.insert("delivery_quotes", {
      orderId: args.orderId,
      pricingRuleId: breakdown.pricingRuleId,
      userId: order.senderId,
      basePrice: breakdown.basePrice,
      distanceFee: breakdown.distanceFee,
      weightFee: breakdown.weightFee,
      subtotal: breakdown.subtotal,
      expressSurcharge: breakdown.expressSurcharge,
      sameDaySurcharge: breakdown.sameDaySurcharge,
      additionalFees: breakdown.additionalFees,
      deliveryFee: breakdown.deliveryFee,
      platformFee: breakdown.platformFee,
      totalCharge: breakdown.totalCharge,
      driverEarnings: breakdown.driverEarnings,
      distanceKm: breakdown.distanceKm,
      weightKg: breakdown.weightKg,
      calculatedAt: Date.now(),
    });
    
    // Update order with the quote price
    await ctx.db.patch(args.orderId, {
      price: breakdown.totalCharge,
      updatedAt: Date.now(),
    });
    
    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPricingEvent, {
      actorId: userId,
      actorRole: (await getCurrentAuthUser(ctx))?.role ?? "unknown",
      action: AUDIT_ACTIONS.PRICING_QUOTE_CREATED,
      entityType: "delivery_quote",
      entityId: quoteId,
      after: JSON.stringify({ totalCharge: breakdown.totalCharge, driverEarnings: breakdown.driverEarnings, platformFee: breakdown.platformFee }),
      orderId: args.orderId,
    });
    
    return {
      quoteId,
      ...breakdown,
    };
  },
});

/**
 * Create a pricing rule.
 */
export const createPricingRule = mutation({
  args: {
    name: v.string(),
    packageSize: packageSizeValidator,
    parcelType: v.optional(parcelTypeValidator),
    expeditionType: expeditionTypeValidator,
    basePrice: v.number(),
    pricePerKm: v.number(),
    pricePerKg: v.number(),
    minimumPrice: v.number(),
    platformFeeType: v.union(v.literal("percentage"), v.literal("flat")),
    platformFeeValue: v.number(),
    expressSurcharge: v.optional(v.number()),
    sameDaySurcharge: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "pricing:manage");
    
    const now = Date.now();
    
    // Get next version number
    const existingRules = await ctx.db.query("pricing_rules").collect();
    const maxVersion = existingRules.reduce((max, r) => Math.max(max, r.version), 0);
    
    const ruleId = await ctx.db.insert("pricing_rules", {
      ...args,
      version: maxVersion + 1,
      effectiveFrom: now,
      isActive: true,
      createdAt: now,
    });
    
    // Record audit event
    const user = await getCurrentAuthUser(ctx);
    if (user) {
      await ctx.runMutation(internal.audit.service.recordPricingEvent, {
        actorId: user.userId,
        actorRole: user.role,
        action: AUDIT_ACTIONS.PRICING_RULE_CREATED,
        entityType: "pricing_rule",
        entityId: ruleId,
        after: JSON.stringify({ name: args.name, version: maxVersion + 1, basePrice: args.basePrice }),
      });
    }
    
    return ruleId;
  },
});

/**
 * Deactivate a pricing rule.
 */
export const deactivatePricingRule = mutation({
  args: { ruleId: v.id("pricing_rules") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "pricing:manage");
    
    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new Error("Pricing rule not found");
    
    const before = JSON.stringify({ isActive: rule.isActive, version: rule.version });
    
    await ctx.db.patch(args.ruleId, {
      isActive: false,
      effectiveTo: Date.now(),
    });
    
    // Record audit event
    const user = await getCurrentAuthUser(ctx);
    if (user) {
      await ctx.runMutation(internal.audit.service.recordPricingEvent, {
        actorId: user.userId,
        actorRole: user.role,
        action: AUDIT_ACTIONS.PRICING_RULE_DEACTIVATED,
        entityType: "pricing_rule",
        entityId: args.ruleId,
        before,
        after: JSON.stringify({ isActive: false }),
      });
    }
    
    return { success: true };
  },
});

// ─── Internal Mutations (for state machine integration) ──────────────────────

/**
 * Calculate and store a quote for an order.
 * Called internally by the delivery state machine during order creation.
 * This is the authoritative pricing calculation used by createOrderAndDelivery.
 */
export const calculateAndStoreQuote = internalMutation({
  args: {
    orderId: v.id("orders"),
    distanceKm: v.number(),
  },
  handler: async (ctx, args) => {
    // Get the order
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Find matching pricing rule
    const rule = await ctx.db
      .query("pricing_rules")
      .withIndex("size_expedition", (q) =>
        q
          .eq("packageSize", order.packageSize)
          .eq("expeditionType", order.expeditionType ?? "standard")
          .eq("isActive", true)
      )
      .first();

    if (!rule) {
      throw new Error("No active pricing rule found for this delivery type");
    }

    // Calculate pricing
    const input: PricingInput = {
      packageSize: order.packageSize,
      parcelType: order.parcelType,
      expeditionType: order.expeditionType ?? "standard",
      distanceKm: args.distanceKm,
      weightKg: order.weight ?? 0,
    };

    const breakdown = calculatePricingBreakdown(input, rule);

    // Store the quote
    const quoteId = await ctx.db.insert("delivery_quotes", {
      orderId: args.orderId,
      pricingRuleId: breakdown.pricingRuleId,
      userId: order.senderId,
      basePrice: breakdown.basePrice,
      distanceFee: breakdown.distanceFee,
      weightFee: breakdown.weightFee,
      subtotal: breakdown.subtotal,
      expressSurcharge: breakdown.expressSurcharge,
      sameDaySurcharge: breakdown.sameDaySurcharge,
      additionalFees: breakdown.additionalFees,
      deliveryFee: breakdown.deliveryFee,
      platformFee: breakdown.platformFee,
      totalCharge: breakdown.totalCharge,
      driverEarnings: breakdown.driverEarnings,
      distanceKm: breakdown.distanceKm,
      weightKg: breakdown.weightKg,
      calculatedAt: Date.now(),
    });

    // Update order with the quote price
    await ctx.db.patch(args.orderId, {
      price: breakdown.totalCharge,
      updatedAt: Date.now(),
    });

    return {
      quoteId,
      totalCharge: breakdown.totalCharge,
      driverEarnings: breakdown.driverEarnings,
      platformFee: breakdown.platformFee,
    };
  },
});

/**
 * Create settlement when delivery is completed.
 * Called by the delivery state machine.
 */

/**
 * Create settlement when delivery is completed.
 * Called by the delivery state machine.
 */
export const createSettlement = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    orderId: v.id("orders"),
    driverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Idempotency check
    const existing = await ctx.db
      .query("settlements")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .first();
    
    if (existing) {
      return { settlementId: existing._id, alreadyExists: true };
    }
    
    // Get the quote
    const quote = await ctx.db
      .query("delivery_quotes")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .first();
    
    if (!quote) {
      throw new Error("No pricing quote found for this order");
    }
    
    // Create settlement
    const idempotencyKey = `settlement-${args.deliveryId}-${now}`;
    
    const settlementId = await ctx.db.insert("settlements", {
      driverId: args.driverId,
      deliveryId: args.deliveryId,
      orderId: args.orderId,
      quoteId: quote._id,
      deliveryFee: quote.deliveryFee,
      platformFee: quote.platformFee,
      driverEarnings: quote.driverEarnings,
      status: "pending",
      idempotencyKey,
      createdAt: now,
    });
    
    // Update driver's total earnings
    const driverProfile = await ctx.db
      .query("driver_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.driverId))
      .first();
    
    if (driverProfile) {
      await ctx.db.patch(driverProfile._id, {
        totalEarnings: driverProfile.totalEarnings + quote.driverEarnings,
      });
    }
    
    return { settlementId, alreadyExists: false };
  },
});

/**
 * Process a settlement (mark as processing).
 */
export const processSettlement = mutation({
  args: { settlementId: v.id("settlements") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settlement:manage");
    
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");
    
    if (settlement.status !== "pending") {
      throw new Error(`Settlement is ${settlement.status}, not pending`);
    }
    
    await ctx.db.patch(args.settlementId, {
      status: "processing",
      processedAt: Date.now(),
    });
    
    return { success: true };
  },
});

/**
 * Complete a settlement.
 */
export const completeSettlement = mutation({
  args: { settlementId: v.id("settlements") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settlement:manage");
    
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");
    
    if (settlement.status !== "processing") {
      throw new Error(`Settlement is ${settlement.status}, not processing`);
    }
    
    await ctx.db.patch(args.settlementId, {
      status: "completed",
      completedAt: Date.now(),
    });
    
    // Credit driver's wallet
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", settlement.driverId))
      .first();
    
    if (wallet) {
      await ctx.db.patch(wallet._id, {
        balance: wallet.balance + settlement.driverEarnings,
        updatedAt: Date.now(),
      });
      
      // Create transaction record
      await ctx.db.insert("transactions", {
        walletId: wallet._id,
        type: "credit",
        amount: settlement.driverEarnings,
        description: `Earnings from delivery`,
        reference: `SET-${args.settlementId}`,
        status: "completed",
        orderId: settlement.orderId,
        createdAt: Date.now(),
      });
    }
    
    return { success: true };
  },
});
