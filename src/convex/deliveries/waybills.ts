import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "../_generated/server";
import { v } from "convex/values";
import { ROLES } from "../schema";

// ─── Waybills ────────────────────────────────────────────────────────────────
// A waybill is created automatically for every delivery, at creation time.
// There is no manual waybill step: both creation paths (createOrderAndDelivery
// and createDelivery) stamp `waybillNumber` — WB-<tracking number>,
// deterministic and idempotent — on the delivery record when they insert it.
//
// Download: the Operations Centre queries getWaybillForOps (operations /
// super_admin only), which assembles the full document payload server-side
// (delivery + order + addresses + sender + courier). The browser renders it
// to a PDF with jsPDF and triggers the download — no external service.

/**
 * Waybill number for a tracking number: WB-<tracking number>. Deterministic,
 * so creation paths can stamp it at insert time and legacy rows without the
 * field still resolve to the same value at read time.
 */
export function waybillNumberFor(trackingNumber: string): string {
  return `WB-${trackingNumber}`;
}

/**
 * Waybill payload for the Operations Centre (operations / super_admin only).
 * Assembles delivery + order + addresses + sender + courier into one
 * document-ready object. Returns null when the delivery does not exist.
 */
export const getWaybillForOps = query({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Authentication required");

    if (user.role !== ROLES.OPERATIONS && user.role !== ROLES.SUPER_ADMIN) {
      throw new Error("Access denied: operations only");
    }

    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return null;

    const order = await ctx.db.get(delivery.orderId);
    const pickup = order ? await ctx.db.get(order.pickupAddressId) : null;
    const dropoff = order ? await ctx.db.get(order.dropoffAddressId) : null;
    const sender = order ? await ctx.db.get(order.senderId) : null;
    const courier = delivery.courierId
      ? await ctx.db.get(delivery.courierId)
      : null;

    return {
      waybillNumber: delivery.waybillNumber ?? waybillNumberFor(delivery.trackingNumber),
      trackingNumber: delivery.trackingNumber,
      status: delivery.status,
      createdAt: delivery._creationTime,
      pickup: {
        label: pickup?.label ?? "Pickup",
        street: pickup?.street ?? null,
        city: pickup?.city ?? null,
        zip: pickup?.zip ?? null,
        lat: delivery.pickupLat ?? pickup?.lat ?? null,
        lng: delivery.pickupLng ?? pickup?.lng ?? null,
      },
      dropoff: {
        label: dropoff?.label ?? "Drop-off",
        street: dropoff?.street ?? null,
        city: dropoff?.city ?? null,
        zip: dropoff?.zip ?? null,
        lat: delivery.dropoffLat ?? dropoff?.lat ?? null,
        lng: delivery.dropoffLng ?? dropoff?.lng ?? null,
      },
      sender: sender
        ? {
            name: sender.name ?? "—",
            phone: sender.phone ?? null,
            email: sender.email ?? null,
          }
        : null,
      recipient: {
        name: order?.recipientName ?? null,
        phone: order?.recipientPhone ?? null,
      },
      courier: courier
        ? { name: courier.name ?? "—", phone: courier.phone ?? null }
        : null,
      parcel: {
        description: order?.description ?? null,
        packageSize: order?.packageSize ?? null,
        parcelType: order?.parcelType ?? null,
        expeditionType: order?.expeditionType ?? null,
        width: order?.width ?? null,
        height: order?.height ?? null,
        weight: order?.weight ?? null,
      },
      price: order?.price ?? null,
      scheduledTime: order?.scheduledTime ?? null,
      startedAt: delivery.startedAt ?? null,
      completedAt: delivery.completedAt ?? null,
    };
  },
});
