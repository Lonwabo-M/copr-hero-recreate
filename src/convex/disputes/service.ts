/**
 * Lasha Disputes
 *
 * The customer-complaint workflow for a delivery, and the financial control
 * that sits behind it.
 *
 * Why this exists: before this module a customer had no in-platform way to
 * dispute a delivery, and a driver's settlement could be paid out while a
 * complaint about that same delivery was being investigated. The rules here
 * are deliberately narrow:
 *
 *   - Only the person who booked the delivery (or an admin of the booking
 *     business) can raise a dispute, and only within 7 days of completion —
 *     the same window as the Terms of Service claims clause.
 *   - Raising a dispute moves the linked settlement (if it is still payable)
 *     to `disputed`, which the payout-eligibility gate already blocks. Ops
 *     cannot pay the driver until the dispute is closed and the payout
 *     decision is recorded.
 *   - Closing a dispute requires an outcome, a note explaining it, and an
 *     explicit decision on the driver's settlement. Nothing is inferred.
 *   - Every step is audit-logged with the actor and the before/after state.
 *
 * A dispute is NOT a refund processor: resolution records the decision and
 * amount. Refunds are executed against the payment provider by finance and
 * reconciled against the same dispute reference.
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getCurrentAuthUser, requireAuth } from "../auth/authorization";
import { ROLES } from "../schema";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Claims and refunds must be raised within 7 days of completion (Terms §6–7). */
const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Operations commits to an outcome within 7 days of the dispute being raised. */
const RESPONSE_TARGET_MS = 7 * 24 * 60 * 60 * 1000;

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2_000;
const NOTE_MIN = 10;
const NOTE_MAX = 2_000;

const DISPUTE_CATEGORIES = [
  "not_delivered",
  "damaged",
  "late",
  "wrong_item",
  "overcharged",
  "driver_conduct",
  "other",
] as const;

const RESOLUTIONS = [
  "refund_full",
  "refund_partial",
  "redelivery",
  "goodwill_credit",
  "no_action",
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];
export type DisputeResolution = (typeof RESOLUTIONS)[number];

const CATEGORY_LABELS: Record<DisputeCategory, string> = {
  not_delivered: "Not delivered",
  damaged: "Damaged in transit",
  late: "Late delivery",
  wrong_item: "Wrong item delivered",
  overcharged: "Incorrect charge",
  driver_conduct: "Driver conduct",
  other: "Something else",
};

/** Uppercase, unambiguous reference: no O/0, I/1 to survive being read aloud. */
function newReference(year: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `DSP-${year}-${suffix}`;
}

function isOps(user: { role?: string }): boolean {
  return user.role === ROLES.OPERATIONS || user.role === ROLES.SUPER_ADMIN;
}

/**
 * A customer may dispute their own booking. A company_admin may dispute a
 * booking made under their business. Nobody else can — drivers and other
 * businesses are refused without learning whether the delivery exists.
 */
function canRaiseForOrder(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentAuthUser>>>,
  order: Doc<"orders">,
): boolean {
  if (order.senderId === user.userId) return true;
  return (
    user.role === ROLES.COMPANY_ADMIN &&
    order.businessId !== undefined &&
    user.businessId !== undefined &&
    order.businessId === user.businessId
  );
}

async function requireOps(ctx: Parameters<typeof getCurrentAuthUser>[0]) {
  const actor = await getCurrentAuthUser(ctx);
  if (!actor) throw new Error("Authentication required");
  if (!isOps(actor)) throw new Error("Access denied: operations only");
  return actor;
}

// ─── Customer: raise and inspect ─────────────────────────────────────────────

/**
 * Raise a dispute against a delivery.
 *
 * Idempotency guard: one open/investigating dispute per customer per delivery,
 * so a double-submit or a refresh cannot create duplicate claims or duplicate
 * settlement holds.
 */
export const raiseDispute = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    category: v.union(
      v.literal("not_delivered"),
      v.literal("damaged"),
      v.literal("late"),
      v.literal("wrong_item"),
      v.literal("overcharged"),
      v.literal("driver_conduct"),
      v.literal("other"),
    ),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");
    const order = await ctx.db.get(delivery.orderId);
    if (!order) throw new Error("Delivery not found");
    if (!canRaiseForOrder(user, order)) {
      throw new Error("Access denied: this delivery belongs to another account");
    }

    const description = args.description.trim();
    if (description.length < DESCRIPTION_MIN) {
      throw new Error(`Please describe what went wrong (at least ${DESCRIPTION_MIN} characters)`);
    }
    if (description.length > DESCRIPTION_MAX) {
      throw new Error(`Description must be under ${DESCRIPTION_MAX} characters`);
    }

    const now = Date.now();
    if (delivery.completedAt != null && now - delivery.completedAt > CLAIM_WINDOW_MS) {
      throw new Error(
        "Disputes must be raised within 7 days of delivery completion. Email info@lasha.co.za if you need this reviewed.",
      );
    }

    const existing = await ctx.db
      .query("disputes")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .collect();
    const alreadyOpen = existing.find(
      (d) =>
        d.raisedBy === user.userId &&
        (d.status === "open" || d.status === "investigating"),
    );
    if (alreadyOpen) {
      return {
        ok: true as const,
        reference: alreadyOpen.reference,
        dueAt: alreadyOpen.slaDueAt,
        duplicate: true as const,
      };
    }

    // Traffic-light guard: an ancient dispute chain on one delivery is a sign
    // of misuse. Five total claims is well beyond normal.
    if (existing.filter((d) => d.raisedBy === user.userId).length >= 5) {
      throw new Error("Too many disputes on this delivery. Email info@lasha.co.za.");
    }

    // Hold the driver's settlement while the complaint is investigated. Only a
    // settlement that has not yet been paid can be held; a completed payout is
    // a finance/refund matter, not a state change.
    const settlement = await ctx.db
      .query("settlements")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .first();
    const holdSettlement =
      settlement != null &&
      (settlement.status === "pending" || settlement.status === "processing")
        ? settlement
        : null;
    const holdable = holdSettlement != null;

    let reference = newReference(new Date(now).getUTCFullYear());
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const clash = await ctx.db
        .query("disputes")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .first();
      if (!clash) break;
      reference = newReference(new Date(now).getUTCFullYear());
    }

    const disputeId = await ctx.db.insert("disputes", {
      reference,
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      raisedBy: user.userId,
      category: args.category,
      description,
      status: "open",
      ...(holdSettlement
        ? { settlementId: holdSettlement._id, settlementPriorStatus: holdSettlement.status }
        : {}),
      createdAt: now,
      updatedAt: now,
      slaDueAt: now + RESPONSE_TARGET_MS,
    });

    if (holdSettlement) {
      await ctx.db.patch(holdSettlement._id, {
        status: "disputed",
        failureReason: `Held pending dispute ${reference}`,
      });
    }

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: user.userId,
      actorRole: (user.role as string) ?? "customer",
      category: "delivery",
      action: "dispute.raised",
      entityType: "dispute",
      entityId: disputeId,
      after: JSON.stringify({
        reference,
        category: args.category,
        deliveryId: args.deliveryId,
        settlementHeld: holdable,
      }),
      metadata: `Dispute raised: ${CATEGORY_LABELS[args.category]}`,
    });

    return {
      ok: true as const,
      reference,
      dueAt: now + RESPONSE_TARGET_MS,
      duplicate: false as const,
    };
  },
});

/**
 * Deliveries the signed-in customer can still dispute: completed, failed or
 * cancelled within the 7-day claim window. Returns only the display fields the
 * dispute form needs, plus any open dispute already on that delivery.
 */
export const getDisputableDeliveries = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) return [];

    const bySender = await ctx.db
      .query("orders")
      .withIndex("by_sender", (q) => q.eq("senderId", user.userId))
      .collect();
    const byBusiness =
      user.role === ROLES.COMPANY_ADMIN && user.businessId
        ? await ctx.db
            .query("orders")
            .withIndex("by_business", (q) => q.eq("businessId", user.businessId!))
            .collect()
        : [];
    const seen = new Set<Id<"orders">>();
    const orders = [...bySender, ...byBusiness].filter((o) => {
      if (seen.has(o._id)) return false;
      seen.add(o._id);
      return true;
    });

    const now = Date.now();
    const rows: Array<{
      deliveryId: Id<"deliveries">;
      trackingNumber: string;
      status: string;
      completedAt: number | null;
      description: string | null;
      amount: number;
      driverName: string | null;
      openDisputeReference: string | null;
    }> = [];

    for (const order of orders) {
      const delivery = await ctx.db
        .query("deliveries")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .unique();
      if (!delivery) continue;
      if (!["delivered", "failed", "cancelled"].includes(delivery.status)) continue;
      if (delivery.completedAt != null && now - delivery.completedAt > CLAIM_WINDOW_MS) continue;

      const existing = await ctx.db
        .query("disputes")
        .withIndex("by_delivery", (q) => q.eq("deliveryId", delivery._id))
        .collect();
      const open = existing.find(
        (d) => d.raisedBy === user.userId && (d.status === "open" || d.status === "investigating"),
      );

      const driver = delivery.courierId ? await ctx.db.get(delivery.courierId) : null;
      rows.push({
        deliveryId: delivery._id,
        trackingNumber: delivery.trackingNumber,
        status: delivery.status,
        completedAt: delivery.completedAt ?? null,
        description: order.description ?? null,
        amount: order.price,
        driverName: driver?.name ?? null,
        openDisputeReference: open?.reference ?? null,
      });
    }

    return rows.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  },
});

/** The signed-in customer's own disputes, newest first. */
export const getMyDisputes = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) return [];

    const rows = await ctx.db
      .query("disputes")
      .withIndex("by_raised_by", (q) => q.eq("raisedBy", user.userId))
      .order("desc")
      .take(100);

    return await Promise.all(
      rows.map(async (d) => {
        const delivery = await ctx.db.get(d.deliveryId);
        const order = await ctx.db.get(d.orderId);
        return {
          _id: d._id,
          reference: d.reference,
          category: d.category,
          categoryLabel: CATEGORY_LABELS[d.category],
          description: d.description,
          status: d.status,
          resolution: d.resolution ?? null,
          resolutionAmount: d.resolutionAmount ?? null,
          resolutionNote: d.resolutionNote ?? null,
          createdAt: d.createdAt,
          slaDueAt: d.slaDueAt,
          resolvedAt: d.resolvedAt ?? null,
          trackingNumber: delivery?.trackingNumber ?? order?.trackingNumber ?? null,
          deliveryStatus: delivery?.status ?? null,
          orderDescription: order?.description ?? null,
          amount: order?.price ?? null,
        };
      }),
    );
  },
});

/** Any dispute already on one of the customer's own deliveries. */
export const getDisputesForDelivery = query({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) return [];

    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return [];
    const order = await ctx.db.get(delivery.orderId);
    if (!order) return [];
    if (!canRaiseForOrder(user, order) && !isOps(user)) {
      throw new Error("Access denied: this delivery belongs to another account");
    }

    const rows = await ctx.db
      .query("disputes")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .collect();

    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({
        _id: d._id,
        reference: d.reference,
        category: d.category,
        categoryLabel: CATEGORY_LABELS[d.category],
        status: d.status,
        createdAt: d.createdAt,
        slaDueAt: d.slaDueAt,
        resolutionNote: d.resolutionNote ?? null,
      }));
  },
});

// ─── Operations: review and resolve ──────────────────────────────────────────

/** Operations queue, optionally filtered by status. */
export const listDisputes = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("investigating"),
        v.literal("resolved"),
        v.literal("rejected"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireOps(ctx);

    const rows = args.status
      ? await ctx.db
          .query("disputes")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("disputes").order("desc").take(200);

    return await Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (d) => {
          const delivery = await ctx.db.get(d.deliveryId);
          const order = await ctx.db.get(d.orderId);
          const customer = await ctx.db.get(d.raisedBy);
          const driver = delivery?.courierId ? await ctx.db.get(delivery.courierId) : null;
          const settlement = d.settlementId ? await ctx.db.get(d.settlementId) : null;
          return {
            _id: d._id,
            reference: d.reference,
            category: d.category,
            categoryLabel: CATEGORY_LABELS[d.category],
            description: d.description,
            status: d.status,
            resolution: d.resolution ?? null,
            resolutionAmount: d.resolutionAmount ?? null,
            resolutionNote: d.resolutionNote ?? null,
            driverPayout: d.driverPayout ?? null,
            createdAt: d.createdAt,
            slaDueAt: d.slaDueAt,
            resolvedAt: d.resolvedAt ?? null,
            overdue:
              d.status !== "resolved" && d.status !== "rejected" && Date.now() > d.slaDueAt,
            trackingNumber: delivery?.trackingNumber ?? null,
            deliveryStatus: delivery?.status ?? null,
            orderPrice: order?.price ?? null,
            orderDescription: order?.description ?? null,
            customerName: customer?.name ?? "—",
            customerEmail: customer?.email ?? null,
            driverName: driver?.name ?? null,
            settlementStatus: settlement?.status ?? null,
            settlementAmount: settlement?.driverEarnings ?? null,
          };
        }),
    );
  },
});

/** Counts for the operations header. */
export const getDisputeStats = query({
  args: {},
  handler: async (ctx) => {
    await requireOps(ctx);
    const now = Date.now();
    const rows = await ctx.db.query("disputes").take(2_000);
    const unresolved = rows.filter((d) => d.status === "open" || d.status === "investigating");
    return {
      open: rows.filter((d) => d.status === "open").length,
      investigating: rows.filter((d) => d.status === "investigating").length,
      overdue: unresolved.filter((d) => d.slaDueAt < now).length,
      resolved: rows.filter((d) => d.status === "resolved" || d.status === "rejected").length,
      total: rows.length,
    };
  },
});

/** Move an open dispute into investigation (records who looked at it). */
export const startDisputeReview = mutation({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, args) => {
    const actor = await requireOps(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status !== "open") {
      throw new Error(`Dispute is ${dispute.status}, not open`);
    }
    const now = Date.now();
    await ctx.db.patch(args.disputeId, { status: "investigating", updatedAt: now });
    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: actor.userId,
      actorRole: (actor.role as string) ?? "operations",
      category: "delivery",
      action: "dispute.review_started",
      entityType: "dispute",
      entityId: args.disputeId,
      before: JSON.stringify({ status: "open" }),
      after: JSON.stringify({ status: "investigating" }),
      metadata: `Dispute ${dispute.reference} under investigation`,
    });
    return { success: true };
  },
});

/**
 * Close a dispute.
 *
 * `driverPayout` is not inferred from the outcome: operations states whether
 * the driver is paid. Withholding marks the held settlement `failed` with the
 * dispute reference as the reason, which permanently blocks the payout gate;
 * releasing restores the settlement to the state it held before the dispute.
 */
export const resolveDispute = mutation({
  args: {
    disputeId: v.id("disputes"),
    status: v.union(v.literal("resolved"), v.literal("rejected")),
    resolution: v.union(
      v.literal("refund_full"),
      v.literal("refund_partial"),
      v.literal("redelivery"),
      v.literal("goodwill_credit"),
      v.literal("no_action"),
    ),
    resolutionAmount: v.optional(v.number()), // cents
    resolutionNote: v.string(),
    driverPayout: v.union(v.literal("released"), v.literal("withheld")),
  },
  handler: async (ctx, args) => {
    const actor = await requireOps(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status === "resolved" || dispute.status === "rejected") {
      return { success: true, alreadyClosed: true };
    }

    const note = args.resolutionNote.trim();
    if (note.length < NOTE_MIN) {
      throw new Error(`Explain the outcome (at least ${NOTE_MIN} characters) — it is the customer's answer`);
    }
    if (note.length > NOTE_MAX) throw new Error(`Note must be under ${NOTE_MAX} characters`);

    if (args.status === "rejected" && args.resolution !== "no_action") {
      throw new Error("A rejected dispute must use the no_action resolution");
    }

    const order = await ctx.db.get(dispute.orderId);
    if (!order) throw new Error("The order for this dispute no longer exists");

    let amount: number | undefined;
    if (args.resolution === "refund_full") {
      amount = order.price;
    } else if (args.resolution === "refund_partial" || args.resolution === "goodwill_credit") {
      if (
        args.resolutionAmount == null ||
        !Number.isFinite(args.resolutionAmount) ||
        args.resolutionAmount <= 0
      ) {
        throw new Error("Enter the amount to refund or credit (in rands)");
      }
      if (args.resolutionAmount > order.price) {
        throw new Error("The amount cannot exceed the amount charged for this order");
      }
      amount = Math.round(args.resolutionAmount);
    }

    const now = Date.now();
    await ctx.db.patch(args.disputeId, {
      status: args.status,
      resolution: args.resolution,
      ...(amount != null ? { resolutionAmount: amount } : {}),
      resolutionNote: note,
      driverPayout: args.driverPayout,
      resolvedBy: actor.userId,
      resolvedAt: now,
      updatedAt: now,
    });

    // Apply the driver-pay decision to the settlement this dispute held.
    const settlement = dispute.settlementId ? await ctx.db.get(dispute.settlementId) : null;
    if (settlement && settlement.status !== "completed") {
      if (args.driverPayout === "withheld") {
        await ctx.db.patch(settlement._id, {
          status: "failed",
          failureReason: `Driver payout withheld — dispute ${dispute.reference}: ${args.resolution}`,
        });
      } else if (settlement.status === "disputed") {
        const restore =
          dispute.settlementPriorStatus === "processing" ? "processing" : "pending";
        await ctx.db.patch(settlement._id, {
          status: restore,
          failureReason: undefined,
        });
      }
    }

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: actor.userId,
      actorRole: (actor.role as string) ?? "operations",
      category: "delivery",
      action: args.status === "resolved" ? "dispute.resolved" : "dispute.rejected",
      entityType: "dispute",
      entityId: args.disputeId,
      before: JSON.stringify({ status: dispute.status }),
      after: JSON.stringify({
        status: args.status,
        resolution: args.resolution,
        resolutionAmount: amount ?? null,
        driverPayout: args.driverPayout,
        settlementId: dispute.settlementId ?? null,
      }),
      metadata: `Dispute ${dispute.reference}: ${args.resolution}${amount != null ? ` (${amount} cents)` : ""}`,
    });

    return { success: true, alreadyClosed: false, reference: dispute.reference };
  },
});
