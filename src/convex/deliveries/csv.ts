import { action, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { DELIVERY_STATUS, ROLES } from "../schema";
import { waybillNumberFor } from "./waybills";
import { AUDIT_ACTIONS } from "../audit/service";

// ─── Order CSV import ────────────────────────────────────────────────────────
// Bulk onboarding of orders from a spreadsheet — the same orders the Request
// Delivery form creates one at a time, so an operations/business user can bring
// an existing manifest onto the platform in one pass.
//
// Design constraints (all pre-existing systems, nothing new):
//  - Authorized exactly like the rest of the Operations Centre (operations,
//    fleet manager, company admin, super admin). The actor is resolved from the
//    session; a role is never accepted from the client.
//  - An order is owned by the importing account: senderId = session user and
//    businessId = that user's business, mirroring createOrderAndDelivery.
//  - Coordinates: the CSV may carry lat/lng columns; when it does not, the
//    addresses are resolved through the existing routing action
//    (routing.actions.geocodeAddress). Coordinates are NEVER fabricated — a row
//    whose address cannot be resolved fails with a legible message.
//  - Pricing goes through the existing pricing engine, so an imported order is
//    priced exactly like a hand-created one.
//  - Every row is independent: one bad row never aborts the batch, and the
//    result reports each row's outcome.

const IMPORTABLE_ROLES: string[] = [
  ROLES.OPERATIONS,
  ROLES.FLEET_MANAGER,
  ROLES.COMPANY_ADMIN,
  ROLES.SUPER_ADMIN,
];

/** Hard ceiling per import so one file can never run unbounded. */
export const MAX_IMPORT_ROWS = 200;

export const csvOrderRowValidator = v.object({
  orderName: v.optional(v.string()),
  recipientName: v.optional(v.string()),
  recipientPhone: v.optional(v.string()),
  pickupAddress: v.optional(v.string()),
  dropoffAddress: v.optional(v.string()),
  weight: v.optional(v.number()),
  parcelType: v.optional(v.string()),
  expeditionType: v.optional(v.string()),
  pickupLat: v.optional(v.number()),
  pickupLng: v.optional(v.number()),
  dropoffLat: v.optional(v.number()),
  dropoffLng: v.optional(v.number()),
  scheduledTime: v.optional(v.number()),
});

// ─── Actor resolution (actions have no db access) ────────────────────────────

export const getImportActorContext = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      userId: user._id,
      role: (user.role as string) ?? ROLES.CUSTOMER,
      businessId: user.businessId ?? null,
      name: user.name ?? null,
    };
  },
});

// ─── Row creation ────────────────────────────────────────────────────────────

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Create one imported order + its delivery. Deliberately the same shape as
 * state_machine.createOrderAndDelivery so imported and hand-created orders are
 * indistinguishable downstream.
 */
export const createImportedOrder = internalMutation({
  args: {
    actorId: v.id("users"),
    actorRole: v.string(),
    businessId: v.optional(v.id("businesses")),
    description: v.string(),
    recipientName: v.optional(v.string()),
    recipientPhone: v.optional(v.string()),
    parcelType: v.optional(v.string()),
    expeditionType: v.optional(v.string()),
    weight: v.optional(v.number()),
    pickupAddress: v.string(),
    pickupLat: v.number(),
    pickupLng: v.number(),
    dropoffAddress: v.string(),
    dropoffLat: v.number(),
    dropoffLng: v.number(),
    scheduledTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const pickupAddressId = await ctx.db.insert("addresses", {
      userId: args.actorId,
      label: "Pickup",
      street: args.pickupAddress,
      city: "",
      zip: "",
      lat: args.pickupLat,
      lng: args.pickupLng,
    });

    const dropoffAddressId = await ctx.db.insert("addresses", {
      userId: args.actorId,
      label: "Dropoff",
      street: args.dropoffAddress,
      city: "",
      zip: "",
      lat: args.dropoffLat,
      lng: args.dropoffLng,
    });

    const orderId = await ctx.db.insert("orders", {
      senderId: args.actorId,
      businessId: args.businessId,
      pickupAddressId,
      dropoffAddressId,
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      status: "pending",
      description: args.description,
      packageSize:
        args.weight && args.weight > 30
          ? "large"
          : args.weight && args.weight > 5
            ? "medium"
            : "small",
      parcelType: args.parcelType as never,
      expeditionType: args.expeditionType as never,
      weight: args.weight,
      price: 0,
      scheduledTime: args.scheduledTime,
      createdAt: now,
      updatedAt: now,
    });

    // Existing pricing engine — an import can never bypass quoting. A failure
    // here rolls the whole row back (no orphaned order/addresses/delivery).
    const distanceKm = haversineDistanceKm(
      args.pickupLat,
      args.pickupLng,
      args.dropoffLat,
      args.dropoffLng,
    );
    const quote: { totalCharge: number } = await ctx.runMutation(
      internal.pricing.service.calculateAndStoreQuote,
      { orderId, distanceKm },
    );

    const trackingNumber = `LSH-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const deliveryId = await ctx.db.insert("deliveries", {
      orderId,
      status: DELIVERY_STATUS.REQUESTED,
      trackingNumber,
      waybillNumber: waybillNumberFor(trackingNumber),
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      dropoffLat: args.dropoffLat,
      dropoffLng: args.dropoffLng,
      startedAt: now,
    });

    await ctx.db.patch(orderId, {
      status: "confirmed",
      trackingNumber,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
      actorId: args.actorId,
      actorRole: args.actorRole,
      deliveryId,
      orderId,
      action: AUDIT_ACTIONS.DELIVERY_CREATED,
      fromStatus: "none",
      toStatus: DELIVERY_STATUS.REQUESTED,
      metadata: JSON.stringify({
        trackingNumber,
        orderName: args.description,
        source: "csv_import",
      }),
    });

    await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
      deliveryId,
      eventType: "delivery_created",
      recipientUserIds: [args.actorId],
    });

    return { orderId, deliveryId, trackingNumber, price: quote.totalCharge };
  },
});

// ─── Import action ───────────────────────────────────────────────────────────

export interface CsvImportRowResult {
  row: number;
  status: "created" | "duplicate" | "error";
  trackingNumber?: string;
  message?: string;
}

export const importOrdersFromCsv = action({
  args: {
    rows: v.array(csvOrderRowValidator),
    /** Original file name — recorded for traceability in the result only. */
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    total: number;
    created: number;
    duplicates: number;
    failed: number;
    truncated: boolean;
    results: CsvImportRowResult[];
  }> => {
    // 1. Authorization — session identity, role resolved server-side.
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required");
    const actor = await ctx.runQuery(
      internal.deliveries.csv.getImportActorContext,
      { userId },
    );
    if (!actor) throw new Error("User not found");
    if (!IMPORTABLE_ROLES.includes(actor.role)) {
      throw new Error("Access denied: operations only");
    }

    const truncated = args.rows.length > MAX_IMPORT_ROWS;
    const rows = args.rows.slice(0, MAX_IMPORT_ROWS);

    const results: CsvImportRowResult[] = [];
    const seen = new Set<string>();
    let created = 0;
    let duplicates = 0;
    let failed = 0;

    for (let index = 0; index < rows.length; index++) {
      // +2: one for the header row, one to make the reference 1-based — the
      // number the user sees in their spreadsheet.
      const rowNumber = index + 2;
      const row = rows[index];

      try {
        const pickupAddress = row.pickupAddress?.trim();
        const dropoffAddress = row.dropoffAddress?.trim();
        if (!pickupAddress) throw new Error("Pickup address is required");
        if (!dropoffAddress) throw new Error("Drop-off address is required");
        if (row.weight !== undefined && !(row.weight > 0)) {
          throw new Error("Weight must be greater than 0 kg");
        }
        if (row.weight !== undefined && row.weight > 2000) {
          throw new Error("Weight exceeds the 2000 kg import limit");
        }

        // Duplicate guard within a single file (same route, recipient, parcel
        // and weight) — protects against a re-run of the same spreadsheet.
        const signature = [
          pickupAddress,
          dropoffAddress,
          row.recipientName ?? "",
          row.recipientPhone ?? "",
          row.orderName ?? "",
          row.weight ?? "",
        ]
          .join("|")
          .toLowerCase();
        if (seen.has(signature)) {
          duplicates++;
          results.push({
            row: rowNumber,
            status: "duplicate",
            message: "Duplicate of an earlier row in this file — skipped",
          });
          continue;
        }
        seen.add(signature);

        // Coordinates: supplied in the file, or resolved through the existing
        // routing action. Never invented.
        const pickupCoords =
          row.pickupLat !== undefined && row.pickupLng !== undefined
            ? { lat: row.pickupLat, lng: row.pickupLng }
            : await ctx.runAction(api.routing.actions.geocodeAddress, {
                address: pickupAddress,
              });
        const dropoffCoords =
          row.dropoffLat !== undefined && row.dropoffLng !== undefined
            ? { lat: row.dropoffLat, lng: row.dropoffLng }
            : await ctx.runAction(api.routing.actions.geocodeAddress, {
                address: dropoffAddress,
              });

        const description =
          row.orderName?.trim() || `Imported order — ${dropoffAddress}`;
        const parcelType = row.parcelType?.trim().toLowerCase() || undefined;
        const expeditionType =
          row.expeditionType?.trim().toLowerCase() || "standard";

        const result: {
          trackingNumber: string;
        } = await ctx.runMutation(internal.deliveries.csv.createImportedOrder, {
          actorId: actor.userId,
          actorRole: actor.role,
          businessId: actor.businessId
            ? (actor.businessId as Id<"businesses">)
            : undefined,
          description,
          recipientName: row.recipientName?.trim() || undefined,
          recipientPhone: row.recipientPhone?.trim() || undefined,
          parcelType,
          expeditionType,
          weight: row.weight,
          pickupAddress,
          pickupLat: pickupCoords.lat,
          pickupLng: pickupCoords.lng,
          dropoffAddress,
          dropoffLat: dropoffCoords.lat,
          dropoffLng: dropoffCoords.lng,
          scheduledTime: row.scheduledTime,
        });

        created++;
        results.push({
          row: rowNumber,
          status: "created",
          trackingNumber: result.trackingNumber,
        });
      } catch (error) {
        failed++;
        results.push({
          row: rowNumber,
          status: "error",
          message:
            error instanceof Error ? error.message : "Row could not be imported",
        });
      }
    }

    return {
      total: rows.length,
      created,
      duplicates,
      failed,
      truncated,
      results,
    };
  },
});
