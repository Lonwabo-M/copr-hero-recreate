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
    
    // Check access.
    // - Customers: only quotes on their own orders.
    // - Drivers: only quotes for deliveries assigned to them (prevents a
    //   driver from reading other orders' earnings/platform-fee breakdowns).
    // - Operations/company_admin/super_admin: privileged financial roles.
    if (user.role === ROLES.CUSTOMER && quote.userId !== user.userId) {
      throw new Error("Access denied");
    }
    if (user.role === ROLES.DRIVER || user.role === ROLES.FLEET_MANAGER) {
      const delivery = await ctx.db
        .query("deliveries")
        .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
        .unique();
      if (!delivery || delivery.courierId !== user.userId) {
        throw new Error("Access denied");
      }
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
 * Create a settlement for a delivered delivery.
 *
 * Called internally by the delivery state machine when a delivery reaches the
 * DELIVERED terminal state. This is layer 2 of the financial model:
 *
 *   1. Pricing calculation  (delivery_quotes — authoritative at creation)
 *   2. Settlement/payable   (this function — creates the "driver is owed" record)
 *   3. Payment to driver    (processSettlement/completeSettlement — NOT yet
 *                            triggered anywhere; a settlement is NOT a payment)
 *
 * Compensation policy (see docs/driver-earnings-settlement.md):
 *   - delivered: full settlement from the stored quote.
 *   - failed / cancelled: NO settlement. There is no partial-compensation rule
 *     in the repository, so zero is encoded explicitly by simply not calling
 *     this function from those paths (failDelivery/cancelDelivery).
 *
 * Amount source: the already-stored delivery quote — pricing is NEVER
 * recalculated here.
 *
 * Idempotency: the settlement identity is the deterministic key
 * `settlement-${deliveryId}`, aligned with the by_idempotency index. Retries
 * and repeated completion attempts resolve to the same settlement and return
 * it without creating duplicates. The by_delivery index check is kept as a
 * belt-and-braces guard (one delivery can only ever have one settlement).
 */
export const createSettlement = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    orderId: v.id("orders"),
    driverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Deterministic settlement identity for this delivery.
    const idempotencyKey = `settlement-${args.deliveryId}`;

    // Idempotency check #1: exact deterministic key (by_idempotency index).
    const byKey = await ctx.db
      .query("settlements")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (byKey) {
      return { settlementId: byKey._id, alreadyExists: true };
    }

    // Idempotency check #2: one delivery can only ever have one settlement
    // (legacy rows created before the deterministic key still resolve here).
    const byDelivery = await ctx.db
      .query("settlements")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .first();

    if (byDelivery) {
      return { settlementId: byDelivery._id, alreadyExists: true };
    }

    // Get the quote — the authoritative stored pricing result. Never
    // recalculate pricing here (requirement: settlement locks onto the amount
    // established at delivery creation).
    const quote = await ctx.db
      .query("delivery_quotes")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .first();

    if (!quote) {
      throw new Error(
        `No pricing quote found for this order — cannot create a settlement without an authoritative pricing result`
      );
    }

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

    // Update the driver profile's running total (settled+payable bookkeeping
    // only — this is NOT a payment).
    const driverProfile = await ctx.db
      .query("driver_profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.driverId))
      .first();

    if (driverProfile) {
      await ctx.db.patch(driverProfile._id, {
        totalEarnings: driverProfile.totalEarnings + quote.driverEarnings,
      });
    }

    // Audit: settlement created (amount + parties, no secrets).
    await ctx.runMutation(internal.audit.service.recordPricingEvent, {
      actorId: args.driverId,
      actorRole: "system",
      action: AUDIT_ACTIONS.SETTLEMENT_CREATED,
      entityType: "settlement",
      entityId: settlementId,
      after: JSON.stringify({
        status: "pending",
        driverEarnings: quote.driverEarnings,
        platformFee: quote.platformFee,
        deliveryFee: quote.deliveryFee,
      }),
      orderId: args.orderId,
    });

    return { settlementId, alreadyExists: false };
  },
});

/**
 * Process a settlement (mark as processing — payout lifecycle start).
 *
 * HARDENED with the payout-eligibility gate (Model B, see
 * docs/payment-settlement-reconciliation.md §13): the settlement must be
 * payout-eligible per the shared reconciliation evaluation before the
 * lifecycle may advance. The gate re-uses payments/_reconcile.ts so this
 * mutation enforces exactly the same financial interpretation as the
 * reconciliation read model and the eligibility query — no duplicated rules.
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
    
    // ── Payout-eligibility gate (read-only evaluation, no money moved) ──
    const eligibility = await ctx.runQuery(
      internal.payments.payoutEligibility.evaluateInternal,
      { settlementId: args.settlementId }
    );
    if (!eligibility.eligible) {
      let detail = "Settlement is not payout-eligible: " + eligibility.reason;
      if (eligibility.anomalies.length > 0) {
        detail = detail + " — anomalies: " + eligibility.anomalies.join("; ");
      }
      throw new Error(detail);
    }
    
    await ctx.db.patch(args.settlementId, {
      status: "processing",
      processedAt: Date.now(),
    });
    
    // Audit: settlement moved into processing.
    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: settlement.driverId,
      actorRole: "system",
      action: AUDIT_ACTIONS.SETTLEMENT_PROCESSED,
      entityType: "settlement",
      entityId: args.settlementId,
      metadata: JSON.stringify({
        status: "processing",
        amount: settlement.driverEarnings,
        eligibility: eligibility.reason,
      }),
      orderId: settlement.orderId,
    });
    
    return { success: true };
  },
});

/**
 * Complete a settlement (layer 3: driver wallet credit — NOT an external
 * bank payout).
 *
 * WALLET INTERPRETATION (documented, unchanged architecture): crediting the
 * driver's Lasha wallet moves the amount from "payable" to "paid into the
 * driver's internal balance". It does NOT represent an external bank payout —
 * no payout provider exists. Any future external payout layer must be built
 * on top of this and reconcile against the transactions ledger.
 *
 * HARDENED: completion requires settlement:manage AND the payout-eligibility
 * gate. The system can no longer mark a settlement completed while the
 * customer payment is unpaid, financial reconciliation is anomalous, or any
 * required settlement condition is missing. The gate is evaluated on the
 * processing → completed transition, where settlement status "processing"
 * is itself an accepted eligible state (the lifecycle that this mutation
 * continues).
 *
 * Wallet policy (see docs/driver-earnings-settlement.md): the wallet is
 * ensured automatically, and idempotently, before crediting. The previous
 * silent `if (wallet)` skip is gone — a settlement can no longer appear
 * financially complete while the driver's wallet is missing, and a wallet is
 * never duplicated (one wallet per driver, via the by_user index).
 *
 * Authorization: settlement:manage only (drivers can never mark their own
 * settlement as paid).
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

    // ── Payout-eligibility gate (read-only evaluation, no money moved) ──
    const eligibility = await ctx.runQuery(
      internal.payments.payoutEligibility.evaluateInternal,
      { settlementId: args.settlementId }
    );
    if (!eligibility.eligible) {
      let detail = "Settlement is not payout-eligible: " + eligibility.reason;
      if (eligibility.anomalies.length > 0) {
        detail = detail + " — anomalies: " + eligibility.anomalies.join("; ");
      }
      throw new Error(detail);
    }

    const now = Date.now();

    await ctx.db.patch(args.settlementId, {
      status: "completed",
      completedAt: now,
    });

    // Ensure the driver's wallet exists (idempotent — one per driver). Failing
    // silently here would produce a completed settlement with no balance and
    // no transaction record.
    let wallet = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", settlement.driverId))
      .first();

    if (!wallet) {
      const walletId = await ctx.db.insert("wallets", {
        userId: settlement.driverId,
        balance: 0,
        currency: "ZAR",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      wallet = await ctx.db.get(walletId);
      if (!wallet) throw new Error("Failed to create driver wallet");
    }

    // Credit the wallet.
    await ctx.db.patch(wallet._id, {
      balance: wallet.balance + settlement.driverEarnings,
      updatedAt: now,
    });

    // Transaction record for the credit.
    await ctx.db.insert("transactions", {
      walletId: wallet._id,
      type: "credit",
      amount: settlement.driverEarnings,
      description: `Earnings from delivery`,
      reference: `SET-${args.settlementId}`,
      status: "completed",
      orderId: settlement.orderId,
      createdAt: now,
    });

    // Audit: settlement paid.
    await ctx.runMutation(internal.audit.service.recordPaymentEvent, {
      actorId: settlement.driverId,
      actorRole: "system",
      action: AUDIT_ACTIONS.SETTLEMENT_COMPLETED,
      entityType: "settlement",
      entityId: args.settlementId,
      metadata: JSON.stringify({
        status: "completed",
        amount: settlement.driverEarnings,
        walletId: wallet._id,
      }),
      orderId: settlement.orderId,
    });

    return { success: true };
  },
});
