/**
 * Customer-facing delivery status for the Activity Centre.
 *
 * The delivery lifecycle has eleven normal states. A customer does not need to
 * see all of them, and showing "Pending" for a parcel that is already with a
 * driver (or delivered) is wrong. The customer sees four working states:
 *
 *   Pending     → the order exists but no driver has been dispatched yet
 *   In Transit  → a driver has been dispatched and the parcel is on its way
 *   Delivered   → proof of delivery was captured
 *   Cancelled / Failed → the delivery will not happen
 *
 * The mapping lives here so the dashboard, the overview counters and the order
 * cards cannot drift apart.
 */
import { DELIVERY_STATUS } from "@/convex/schema";

export type OrderStatus = "Pending" | "In Transit" | "Delivered" | "Cancelled" | "Failed";

/** Before dispatch: created, awaiting dispatch, or waiting to be reassigned. */
const PENDING = new Set<string>([
  DELIVERY_STATUS.REQUESTED,
  DELIVERY_STATUS.PENDING_DISPATCH,
  DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
]);

/**
 * After dispatch and before delivery. `assigned` is the moment dispatch hands
 * the delivery to a driver, so every later step — acceptance, travel to pickup,
 * pickup, the line-haul and arrival — reads as "In Transit".
 */
const IN_TRANSIT = new Set<string>([
  DELIVERY_STATUS.ASSIGNED,
  DELIVERY_STATUS.DRIVER_ACCEPTED,
  DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
  DELIVERY_STATUS.AT_PICKUP,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.IN_TRANSIT,
  DELIVERY_STATUS.AT_DROPOFF,
]);

export function orderStatusFromDelivery(status: string): OrderStatus {
  if (IN_TRANSIT.has(status)) return "In Transit";
  if (PENDING.has(status)) return "Pending";
  switch (status) {
    case DELIVERY_STATUS.DELIVERED:
      return "Delivered";
    case DELIVERY_STATUS.CANCELLED:
      return "Cancelled";
    case DELIVERY_STATUS.FAILED:
      return "Failed";
    default:
      // An unknown state is before dispatch until proven otherwise; never
      // claim a parcel is moving or delivered without a state that says so.
      return "Pending";
  }
}

/** CSS class suffix for the status pill and icon tile. */
export function orderStatusTone(
  status: OrderStatus,
): "pending" | "in-transit" | "delivered" | "failed" {
  switch (status) {
    case "In Transit":
      return "in-transit";
    case "Delivered":
      return "delivered";
    case "Cancelled":
    case "Failed":
      return "failed";
    default:
      return "pending";
  }
}
