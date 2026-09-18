/**
 * Lasha Dispatch Engine
 *
 * This module implements the core dispatch logic:
 * 1. Candidate Discovery - Find eligible drivers/vehicles
 * 2. Candidate Ranking - Score and rank candidates
 * 3. Assignment Offer - Send offers to top candidates
 * 4. Driver Acceptance - Handle driver accepting an offer
 * 5. Driver Rejection - Handle driver rejecting an offer
 * 6. Offer Expiration - Auto-expire stale offers
 * 7. Reassignment - Handle reassignment flow
 *
 * Concurrency Protection:
 * - Uses Convex's atomic document reads/writes for race condition safety
 * - Two drivers cannot successfully claim the same delivery
 * - All state transitions are validated
 */

import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
} from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { DELIVERY_STATUS, ROLES } from "../schema";
import { requireAuth, getCurrentAuthUser } from "../auth/authorization";
import { internal } from "../_generated/api";
import {
  createScoringService,
  DeliveryContext,
  DriverCandidate,
  haversineDistance,
} from "./scoring_service";
import { createLogger, LOG_CATEGORIES } from "../logging/service";

// ─── Public Queries ───────────────────────────────────────────────────────────

/**
 * Get dispatch offers for a delivery.
 */
export const getDispatchOffers = query({
  args: {
    deliveryId: v.id("deliveries"),
  },
  handler: async (ctx, args) => {
    // Authenticate
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Get offers
    const offers = await ctx.db
      .query("dispatch_offers")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .collect();

    // Enrich with driver/vehicle data
    const enrichedOffers = [];
    for (const offer of offers) {
      const driver = await ctx.db.get(offer.driverId);
      const vehicle = await ctx.db.get(offer.vehicleId);

      enrichedOffers.push({
        ...offer,
        driverName: driver?.name ?? "Unknown",
        vehicleRegistration: vehicle?.registration ?? "Unknown",
        vehicleMake: vehicle?.make ?? "",
        vehicleModel: vehicle?.model ?? "",
      });
    }

    return enrichedOffers;
  },
});

/**
 * Get dispatch offers for a driver (pending offers to review).
 */
export const getMyDispatchOffers = query({
  args: {},
  handler: async (ctx) => {
    // Authenticate
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Get pending offers for this driver
    const offers = await ctx.db
      .query("dispatch_offers")
      .withIndex("by_driver", (q) => q.eq("driverId", user.userId))
      .collect();

    const pendingOffers = offers.filter((o) => o.status === "pending");

    // Enrich with delivery data
    const enrichedOffers = [];
    for (const offer of pendingOffers) {
      const delivery = await ctx.db.get(offer.deliveryId);
      if (!delivery) continue;

      const order = await ctx.db.get(delivery.orderId);
      const pickupAddress = order ? await ctx.db.get(order.pickupAddressId) : null;
      const dropoffAddress = order ? await ctx.db.get(order.dropoffAddressId) : null;

      enrichedOffers.push({
        ...offer,
        deliveryStatus: delivery.status,
        pickupCity: pickupAddress?.city ?? "Unknown",
        dropoffCity: dropoffAddress?.city ?? "Unknown",
        packageSize: order?.packageSize ?? "small",
        orderPrice: order?.price ?? 0,
      });
    }

    return enrichedOffers;
  },
});

// ─── Public Mutations ─────────────────────────────────────────────────────────

/**
 * Dispatch a delivery: discover candidates, rank them, and send offers.
 *
 * This is the main entry point for the dispatch process.
 */
export const dispatchDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    maxOffers: v.optional(v.number()), // default: 3
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Authenticate and authorize
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const allowedRoles = [
      ROLES.OPERATIONS,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
      ROLES.FLEET_MANAGER,
    ];

    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied: not authorized to dispatch deliveries");
    }

    // 2. Get delivery with order data
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    const order = await ctx.db.get(delivery.orderId);
    if (!order) throw new Error("Order not found");

    const pickupAddress = await ctx.db.get(order.pickupAddressId);
    const dropoffAddress = await ctx.db.get(order.dropoffAddressId);

    if (!pickupAddress || !dropoffAddress) {
      throw new Error("Pickup or dropoff address not found");
    }

    // 3. Validate delivery is in dispatchable state
    if (delivery.status !== DELIVERY_STATUS.PENDING_DISPATCH) {
      throw new Error(
        `Cannot dispatch: delivery is in "${delivery.status}" state, expected "pending_dispatch"`
      );
    }

    // 4. Check company access (if company admin) — same authoritative rule
    // as reassignDelivery/requestReassignment/assignDriver. Fails closed:
    // a company admin with no company association, or an order whose
    // business cannot be established, is denied (undefined !== undefined
    // alone would otherwise fail open).
    if (user.role === ROLES.COMPANY_ADMIN) {
      if (!user.businessId || !order.businessId || order.businessId !== user.businessId) {
        throw new Error("Access denied: delivery belongs to another company");
      }
    }

    // 5. Create delivery context for scoring
    const deliveryContext: DeliveryContext = {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      pickupLat: delivery.pickupLat ?? pickupAddress.lat ?? 0,
      pickupLng: delivery.pickupLng ?? pickupAddress.lng ?? 0,
      dropoffLat: delivery.dropoffLat ?? dropoffAddress.lat ?? 0,
      dropoffLng: delivery.dropoffLng ?? dropoffAddress.lng ?? 0,
      packageWeight: order.weight ?? 0,
      packageSize: order.packageSize,
      requiresBreaking: false,
      requiresExpress: order.expeditionType === "express",
      requiresFlammable: false,
      requiresTrailer: false,
    };

    // 6. Discover candidates (inline the logic to avoid circular imports)
    const candidates = await discoverCandidatesInternal(ctx, {
      pickupLat: deliveryContext.pickupLat,
      pickupLng: deliveryContext.pickupLng,
      packageWeight: deliveryContext.packageWeight,
      maxDistance: 100,
    });

    if (candidates.length === 0) {
      return {
        success: false,
        message: "No eligible drivers found",
        offersSent: 0,
      };
    }

    // 7. Rank candidates using scoring service
    const scoringService = createScoringService();
    const rankedCandidates = scoringService.rankCandidates(candidates, deliveryContext);

    // 8. Select top candidates for offers
    const maxOffers = args.maxOffers ?? 3;
    const eligibleCandidates = rankedCandidates
      .filter((r) => r.isEligible)
      .slice(0, maxOffers);

    if (eligibleCandidates.length === 0) {
      return {
        success: false,
        message: "No eligible drivers found after scoring",
        offersSent: 0,
      };
    }

    // 9. Create offers for top candidates
    const offerExpiryMs = scoringService.getOfferExpiryMs();
    let offersSent = 0;

    for (const result of eligibleCandidates) {
      try {
        await createDispatchOfferInternal(ctx, {
          deliveryId: args.deliveryId,
          driverId: result.candidate.driverId,
          vehicleId: result.candidate.vehicleId,
          score: result.totalScore,
          expiresAt: now + offerExpiryMs,
        });
        offersSent++;
      } catch (error) {
        console.error(
          `Failed to create offer for driver ${result.candidate.driverId}:`,
          error
        );
      }
    }

    // 10. Hold the delivery in ASSIGNED while offers are outstanding — the
    // delivery is "claimed in principle" by the broadcast. acceptDispatch-
    // OfferInternal requires ASSIGNED (it re-verifies courierId-unclaimed
    // before the atomic claim), so offers against a pending_dispatch delivery
    // could never be accepted — the pump surfaced this as every driver accept
    // failing with "Delivery is in \"pending_dispatch\" state". ASSIGNED is
    // also the manual-assignment state, so Operations sees offer-hold and
    // manual assignment identically until a driver accepts (→
    // DRIVER_ACCEPTED). If no driver accepts before the offers expire, the
    // delivery stays ASSIGNED and is re-dispatchable via the existing
    // reassignDelivery flow (operations) or a new broadcast.
    if (offersSent > 0) {
      await ctx.db.patch(args.deliveryId, {
        status: DELIVERY_STATUS.ASSIGNED,
        assignedAt: now,
      });
    }

    return {
      success: offersSent > 0,
      message: offersSent > 0
        ? `Sent ${offersSent} offer(s) to drivers`
        : "Failed to send any offers",
      offersSent,
      candidatesEvaluated: candidates.length,
      eligibleCandidates: eligibleCandidates.length,
    };
  },
});

/**
 * Driver accepts an assignment offer.
 * This is the critical mutation that must be atomic to prevent
 * two drivers from claiming the same delivery.
 */
export const acceptAssignment = mutation({
  args: {
    offerId: v.id("dispatch_offers"),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const userRole = (user as Doc<"users">).role;

    // 2. Verify user is a driver
    if (userRole !== ROLES.DRIVER) {
      throw new Error("Only drivers can accept assignment offers");
    }

    // 3. Accept the offer (this handles all validation and atomicity)
    return await acceptDispatchOfferInternal(ctx, {
      offerId: args.offerId,
      driverId: userId,
    });
  },
});

/**
 * Driver rejects an assignment offer.
 */
export const rejectAssignment = mutation({
  args: {
    offerId: v.id("dispatch_offers"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const userRole = (user as Doc<"users">).role;

    // 2. Verify user is a driver
    if (userRole !== ROLES.DRIVER) {
      throw new Error("Only drivers can reject assignment offers");
    }

    // 3. Reject the offer
    return await rejectDispatchOfferInternal(ctx, {
      offerId: args.offerId,
      driverId: userId,
      reason: args.reason,
    });
  },
});

/**
 * Reassign a delivery: cancel current offers and dispatch again.
 */
export const reassignDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    reason: v.optional(v.string()),
    maxOffers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Authenticate and authorize
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const allowedRoles = [
      ROLES.OPERATIONS,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
    ];

    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied: not authorized to reassign deliveries");
    }

    // 2. Get delivery and its order (the order is the authoritative
    // company-owner record for the delivery)
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    const order = await ctx.db.get(delivery.orderId);
    if (!order) throw new Error("Order not found");

    // 3. Check company ownership (if company admin) — same authoritative rule
    // as dispatchDelivery: the actor's company is resolved server-side from
    // the session user (never from client args), and the delivery's company
    // is resolved from the order record. Fails closed: a company admin with
    // no company association, or an order whose company ownership cannot be
    // established, is denied.
    if (user.role === ROLES.COMPANY_ADMIN) {
      if (!user.businessId || order.businessId !== user.businessId) {
        throw new Error("Access denied: delivery belongs to another company");
      }
    }

    // 4. Validate delivery is in reassignable state
    const reassignableStatuses = [
      DELIVERY_STATUS.PENDING_DISPATCH,
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
    ];

    if (!reassignableStatuses.includes(delivery.status as any)) {
      throw new Error(
        `Cannot reassign: delivery is in "${delivery.status}" state`
      );
    }

    // 5. Cancel existing offers
    await cancelOffersForDeliveryInternal(ctx, {
      deliveryId: args.deliveryId,
      reason: args.reason ?? "Reassignment requested",
    });

    // 6. Update delivery status to pending_dispatch
    if (delivery.status !== DELIVERY_STATUS.PENDING_DISPATCH) {
      await ctx.db.patch(args.deliveryId, {
        status: DELIVERY_STATUS.PENDING_DISPATCH,
        courierId: undefined,
        vehicleId: undefined,
        assignedAt: undefined,
        acceptedAt: undefined,
      });
    }

    // 7. Re-dispatch (inline the logic). The order was already resolved for
    // the ownership check and does not change during reassignment.
    const deliveryAgain = await ctx.db.get(args.deliveryId);
    const pickupAddress = order ? await ctx.db.get(order.pickupAddressId) : null;
    const dropoffAddress = order ? await ctx.db.get(order.dropoffAddressId) : null;

    if (!deliveryAgain || !pickupAddress || !dropoffAddress) {
      return { success: false, message: "Delivery data incomplete", offersSent: 0 };
    }

    const deliveryContext: DeliveryContext = {
      deliveryId: args.deliveryId,
      orderId: deliveryAgain.orderId,
      pickupLat: deliveryAgain.pickupLat ?? pickupAddress.lat ?? 0,
      pickupLng: deliveryAgain.pickupLng ?? pickupAddress.lng ?? 0,
      dropoffLat: deliveryAgain.dropoffLat ?? dropoffAddress.lat ?? 0,
      dropoffLng: deliveryAgain.dropoffLng ?? dropoffAddress.lng ?? 0,
      packageWeight: order.weight ?? 0,
      packageSize: order.packageSize,
      requiresBreaking: false,
      requiresExpress: order.expeditionType === "express",
      requiresFlammable: false,
      requiresTrailer: false,
    };

    const candidates = await discoverCandidatesInternal(ctx, {
      pickupLat: deliveryContext.pickupLat,
      pickupLng: deliveryContext.pickupLng,
      packageWeight: deliveryContext.packageWeight,
      maxDistance: 100,
    });

    if (candidates.length === 0) {
      return { success: false, message: "No eligible drivers found", offersSent: 0 };
    }

    const scoringService = createScoringService();
    const rankedCandidates = scoringService.rankCandidates(candidates, deliveryContext);
    const maxOffers = args.maxOffers ?? 3;
    const eligibleCandidates = rankedCandidates
      .filter((r) => r.isEligible)
      .slice(0, maxOffers);

    const offerExpiryMs = scoringService.getOfferExpiryMs();
    const now = Date.now();
    let offersSent = 0;

    for (const result of eligibleCandidates) {
      try {
        await createDispatchOfferInternal(ctx, {
          deliveryId: args.deliveryId,
          driverId: result.candidate.driverId,
          vehicleId: result.candidate.vehicleId,
          score: result.totalScore,
          expiresAt: now + offerExpiryMs,
        });
        offersSent++;
      } catch (error) {
        console.error(`Failed to create offer for driver ${result.candidate.driverId}:`, error);
      }
    }

    return { success: offersSent > 0, message: `Sent ${offersSent} offer(s)`, offersSent };
  },
});

/**
 * Shared expiry-processing core (existing logic, extracted for reuse).
 *
 * Closes every dispatch offer whose `expiresAt` has passed while it is still
 * `pending`. Accepted / rejected / expired / cancelled offers are untouched,
 * and no delivery state is modified here — a closed offer makes the delivery
 * eligible for the existing reassignment flows (manual Operations
 * re-dispatch or `requestReassignment`), which remain authoritative.
 *
 * Idempotent: an already-`expired` offer no longer matches the predicate, so
 * repeated runs (cron, manual trigger, overlapping invocations) cannot
 * double-process an offer.
 *
 * Error isolation: a per-offer failure is logged with context and skipped so
 * one bad record cannot terminate the whole pass. Failures are never silent —
 * they are counted and reported in the run summary.
 */
async function processExpiredOffersInternal(ctx: MutationCtx) {
  const now = Date.now();
  let expiredCount = 0;
  let failureCount = 0;

  const log = createLogger(LOG_CATEGORIES.DISPATCH);

  // Bounded index scan: `by_expires` narrows candidates to offers past their
  // expiry window; the status predicate is applied in-memory because Convex
  // index ranges require equality fields to be a prefix of the index
  // ("expiresAt" leads here, so "status" cannot be equality-filtered in the
  // range itself). Still far narrower than scanning all offers.
  const candidateOffers = await ctx.db
    .query("dispatch_offers")
    .withIndex("by_expires", (q) => q.lt("expiresAt", now))
    .collect();
  const expiredOffers = candidateOffers.filter(
    (o) => o.status === "pending"
  );

  for (const offer of expiredOffers) {
    try {
      // Re-check inside the loop: an overlapping acceptance / rejection /
      // cancellation may have flipped the status between the scan and the
      // write. Only offers still `pending` and past their expiry are closed.
      const current = await ctx.db.get(offer._id);
      if (!current || current.status !== "pending" || current.expiresAt >= now) {
        continue;
      }

      await ctx.db.patch(current._id, {
        status: "expired",
        respondedAt: now,
      });
      expiredCount++;
    } catch (error) {
      // One problematic offer must not stop the scheduled run. Log with
      // enough context to diagnose; the offer stays `pending` and will be
      // retried by the next pass.
      failureCount++;
      log.error("Failed to expire dispatch offer", {
        metadata: {
          offerId: offer._id,
          deliveryId: offer.deliveryId,
          driverId: offer.driverId,
          expiresAt: offer.expiresAt,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  if (expiredCount > 0 || failureCount > 0) {
    log.info("Expired-offer pass complete", {
      metadata: { expiredCount, failureCount },
    });
  }

  return { expiredCount, failureCount };
}

/**
 * Process expired offers (existing operations mutation, preserved).
 *
 * Public, operations-authorized trigger for the shared expiry core. Manual
 * recovery from the Operations Centre keeps working exactly as before; the
 * scheduled job invokes the same core via `processExpiredOffersCron` below.
 */
export const processExpiredOffers = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const allowedRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied");
    }

    return processExpiredOffersInternal(ctx);
  },
});

/**
 * Scheduled execution path for offer expiry (invoked by crons.ts only).
 *
 * Internal mutation so no public endpoint exists solely for the cron. Runs
 * the same shared core as the manual `processExpiredOffers` operation —
 * identical predicate, identical write, no second expiry implementation.
 * Cron invocations have no user session, so no authentication is performed
 * here; the function is not reachable from clients.
 */
export const processExpiredOffersCron = internalMutation({
  args: {},
  handler: async (ctx) => processExpiredOffersInternal(ctx),
});

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Internal helper: Discover candidate drivers for a delivery.
 */
// (helper functions continue below; the expiry core lives above with the
// dispatch entry points it serves)
async function discoverCandidatesInternal(
  ctx: any,
  args: { pickupLat: number; pickupLng: number; packageWeight: number; maxDistance: number }
): Promise<DriverCandidate[]> {
  const availableDrivers = await ctx.db
    .query("driver_profiles")
    .withIndex("by_available", (q: any) => q.eq("isAvailable", true))
    .collect();

  const candidates: DriverCandidate[] = [];

  for (const profile of availableDrivers) {
    const user = await ctx.db.get(profile.userId);
    if (!user) continue;

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_active_driver", (q: any) =>
        q.eq("driverId", profile.userId).eq("isActive", true)
      )
      .collect();

    if (vehicles.length === 0) continue;

    const vehicle = profile.currentVehicleId
      ? vehicles.find((v: any) => v._id === profile.currentVehicleId)
      : vehicles[0];

    if (!vehicle) continue;

    // Quick proximity check
    if (user.currentLat !== undefined && user.currentLng !== undefined) {
      const dist = haversineDistance(
        user.currentLat, user.currentLng,
        args.pickupLat, args.pickupLng
      );
      if (dist > args.maxDistance) continue;
    }

    // Count active assignments
    const allDeliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_courier", (q: any) => q.eq("courierId", profile.userId))
      .collect();

    const activeStatuses = [
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_DROPOFF,
    ];

    const activeCount = allDeliveries.filter(
      (d: any) => activeStatuses.includes(d.status)
    ).length;

    // Count pending offers
    const allOffers = await ctx.db
      .query("dispatch_offers")
      .withIndex("by_driver", (q: any) => q.eq("driverId", profile.userId))
      .collect();

    const pendingOfferCount = allOffers.filter(
      (o: any) => o.status === "pending"
    ).length;

    candidates.push({
      driverId: profile.userId,
      vehicleId: vehicle._id,
      currentLat: user.currentLat,
      currentLng: user.currentLng,
      lastLocationUpdate: user.lastLocationUpdate,
      rating: profile.rating,
      totalTrips: profile.totalTrips,
      isAvailable: profile.isAvailable,
      vehicleCapacity: vehicle.capacity,
      vehicleBreaking: vehicle.breaking,
      vehicleExpress: vehicle.express,
      vehicleFlammable: vehicle.flammable,
      vehicleTrailer: vehicle.trailer,
      vehicleIsActive: vehicle.isActive,
      activeAssignmentCount: activeCount,
      pendingOfferCount,
    });
  }

  return candidates;
}

/**
 * Internal helper: Create a dispatch offer.
 */
async function createDispatchOfferInternal(
  ctx: any,
  args: {
    deliveryId: Id<"deliveries">;
    driverId: Id<"users">;
    vehicleId: Id<"vehicles">;
    score: number;
    expiresAt: number;
  }
): Promise<Id<"dispatch_offers">> {
  // Uniqueness is per (delivery, driver): dispatch BROADCASTS offers to the
  // top N candidates simultaneously (maxOffers, see dispatchDelivery), and
  // exactly one of them wins — acceptDispatchOfferInternal atomically claims
  // the delivery and cancels the sibling offers, and the expiry cron closes
  // abandoned ones. The old "one active offer per delivery" guard made
  // broadcast impossible: only the top-ranked driver could ever be offered
  // the job, defeating the multi-offer dispatch model.
  // (Pump fix: the guard below used to reference a removed `allOffers`
  // variable — a dangling compile error. It now reads the delivery's real
  // offers from the by_delivery index.)
  const existingForDelivery = await ctx.db
    .query("dispatch_offers")
    .withIndex("by_delivery", (q: any) => q.eq("deliveryId", args.deliveryId))
    .collect();
  const existingForDriver = existingForDelivery.find(
    (o: any) => o.driverId === args.driverId && o.status === "pending",
  );
  if (existingForDriver) {
    throw new Error("Driver already has a pending offer for this delivery");
  }

  return await ctx.db.insert("dispatch_offers", {
    deliveryId: args.deliveryId,
    driverId: args.driverId,
    vehicleId: args.vehicleId,
    score: args.score,
    status: "pending",
    offeredAt: Date.now(),
    expiresAt: args.expiresAt,
  }).then(async (offerId: Id<"dispatch_offers">) => {
    // Driver-facing in-app notification for the new offer. Recipient is the
    // offer's authoritative target driver — resolved server-side. The
    // notification sender is idempotent per (event, delivery, user): a
    // re-dispatch to the same driver cannot create duplicate notifications.
    // Notification failure never fails the dispatch itself.
    try {
      await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
        deliveryId: args.deliveryId,
        eventType: "delivery_offer",
        recipientUserIds: [args.driverId],
      });
    } catch (error) {
      console.error(
        `[createDispatchOfferInternal] offer notification failed for driver ${args.driverId}`,
        error,
      );
    }
    return offerId;
  });
}

/**
 * Internal helper: Accept a dispatch offer (atomic).
 * This is the critical function that prevents race conditions.
 */
async function acceptDispatchOfferInternal(
  ctx: any,
  args: { offerId: Id<"dispatch_offers">; driverId: Id<"users"> }
): Promise<{ success: boolean; deliveryId: Id<"deliveries"> }> {
  const now = Date.now();

  // Get the offer
  const offer = await ctx.db.get(args.offerId);
  if (!offer) throw new Error("Offer not found");

  // Verify ownership
  if (offer.driverId !== args.driverId) {
    throw new Error("Offer does not belong to this driver");
  }

  // Verify status
  if (offer.status !== "pending") {
    throw new Error(`Offer is ${offer.status}, not pending`);
  }

  // Check expiry
  if (offer.expiresAt < now) {
    throw new Error("Offer has expired");
  }

  // Get the delivery
  const delivery = await ctx.db.get(offer.deliveryId);
  if (!delivery) throw new Error("Delivery not found");

  // CRITICAL: Atomic check - delivery must still be in ASSIGNED state
  // and either unassigned or assigned to this driver
  if (delivery.status !== DELIVERY_STATUS.ASSIGNED) {
    throw new Error(
      `Delivery is in "${delivery.status}" state, expected "assigned"`
    );
  }

  if (delivery.courierId && delivery.courierId !== args.driverId) {
    throw new Error("Delivery has already been assigned to another driver");
  }

  // Accept the offer
  await ctx.db.patch(args.offerId, {
    status: "accepted",
    respondedAt: now,
  });

  // CRITICAL: Re-read delivery immediately before patching to prevent race condition.
  // Two concurrent acceptAssignment calls for different offers on the same delivery
  // could both pass the initial check. This second check ensures only one succeeds.
  const deliveryRecheck = await ctx.db.get(offer.deliveryId);
  if (!deliveryRecheck || deliveryRecheck.status !== DELIVERY_STATUS.ASSIGNED) {
    throw new Error(
      "Delivery has already been claimed by another driver (concurrent acceptance)"
    );
  }

  // Assign delivery to driver (atomic update)
  await ctx.db.patch(offer.deliveryId, {
    status: DELIVERY_STATUS.DRIVER_ACCEPTED,
    courierId: args.driverId,
    vehicleId: offer.vehicleId,
    acceptedAt: now,
  });

  // Cancel other pending offers
  const otherOffers = await ctx.db
    .query("dispatch_offers")
    .withIndex("by_delivery", (q: any) => q.eq("deliveryId", offer.deliveryId))
    .collect();

  for (const otherOffer of otherOffers) {
    if (otherOffer._id !== args.offerId && otherOffer.status === "pending") {
      await ctx.db.patch(otherOffer._id, {
        status: "cancelled",
        respondedAt: now,
      });
    }
  }

  // Create tracking event
  await ctx.db.insert("tracking_events", {
    deliveryId: offer.deliveryId,
    type: "order_placed",
    timestamp: now,
    metadata: JSON.stringify({
      action: "driver_accepted",
      driverId: args.driverId,
      vehicleId: offer.vehicleId,
      offerScore: offer.score,
    }),
  });

  return { success: true, deliveryId: offer.deliveryId };
}

/**
 * Internal helper: Reject a dispatch offer.
 */
async function rejectDispatchOfferInternal(
  ctx: any,
  args: { offerId: Id<"dispatch_offers">; driverId: Id<"users">; reason?: string }
): Promise<{ success: boolean }> {
  const now = Date.now();

  const offer = await ctx.db.get(args.offerId);
  if (!offer) throw new Error("Offer not found");

  if (offer.driverId !== args.driverId) {
    throw new Error("Offer does not belong to this driver");
  }

  if (offer.status !== "pending") {
    throw new Error(`Offer is ${offer.status}, not pending`);
  }

  await ctx.db.patch(args.offerId, {
    status: "rejected",
    respondedAt: now,
    rejectionReason: args.reason,
  });

  return { success: true };
}

/**
 * Internal helper: Cancel all offers for a delivery.
 */
async function cancelOffersForDeliveryInternal(
  ctx: any,
  args: { deliveryId: Id<"deliveries">; reason?: string }
): Promise<{ cancelledCount: number }> {
  const now = Date.now();

  const pendingOffers = await ctx.db
    .query("dispatch_offers")
    .withIndex("by_delivery", (q: any) => q.eq("deliveryId", args.deliveryId))
    .collect();

  let cancelledCount = 0;
  for (const offer of pendingOffers) {
    if (offer.status === "pending") {
      await ctx.db.patch(offer._id, {
        status: "cancelled",
        respondedAt: now,
        rejectionReason: args.reason,
      });
      cancelledCount++;
    }
  }

  return { cancelledCount };
}
