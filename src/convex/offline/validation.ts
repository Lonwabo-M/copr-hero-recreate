/**
 * Lasha Offline Operation Validation
 *
 * Server-side validation for operations replayed from the offline queue.
 */

import { Id, Doc } from "../_generated/dataModel";
import { DELIVERY_STATUS } from "../schema";

export type OperationResult =
  | { valid: true }
  | { valid: false; error: string; code: OperationErrorCode };

export type OperationErrorCode =
  | "INVALID_STATE"
  | "EXPIRED"
  | "DUPLICATE"
  | "NOT_AUTHORIZED"
  | "CONFLICT"
  | "INVALID_PAYLOAD";

export interface OfflineOperationContext {
  operationId: string;
  operationType: string;
  entityId: string;
  clientCreatedAt: number;
  currentUserId: Id<"users">;
}

const VALIDATION_CONFIG = {
  maxOperationAgeMs: 24 * 60 * 60 * 1000,
  validTransitions: {
    acceptAssignment: [DELIVERY_STATUS.ASSIGNED],
    arriveAtPickup: [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP],
    pickupDelivery: [DELIVERY_STATUS.AT_PICKUP],
    startTrip: [DELIVERY_STATUS.PICKED_UP],
    arriveAtDropoff: [DELIVERY_STATUS.IN_TRANSIT],
    completeDelivery: [DELIVERY_STATUS.AT_DROPOFF],
    cancelDelivery: [
      DELIVERY_STATUS.REQUESTED,
      DELIVERY_STATUS.PENDING_DISPATCH,
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.DRIVER_ACCEPTED,
      DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
      DELIVERY_STATUS.AT_PICKUP,
    ],
  } as Record<string, string[]>,
};

export function validateOperationAge(clientCreatedAt: number): OperationResult {
  const age = Date.now() - clientCreatedAt;
  if (age > VALIDATION_CONFIG.maxOperationAgeMs) {
    return {
      valid: false,
      error: `Operation expired (age: ${Math.round(age / 1000 / 60)} minutes)`,
      code: "EXPIRED",
    };
  }
  return { valid: true };
}

export function validateDeliveryState(operationType: string, currentStatus: string): OperationResult {
  const validStates = VALIDATION_CONFIG.validTransitions[operationType];
  if (!validStates) {
    return { valid: false, error: `Unknown operation type: ${operationType}`, code: "INVALID_PAYLOAD" };
  }
  if (!validStates.includes(currentStatus)) {
    return {
      valid: false,
      error: `Cannot ${operationType}: delivery is in "${currentStatus}" state, expected one of: ${validStates.join(", ")}`,
      code: "INVALID_STATE",
    };
  }
  return { valid: true };
}

export function validateDriverAuthorization(driverUserId: Id<"users">, delivery: Doc<"deliveries">): OperationResult {
  if (!delivery.courierId) {
    return { valid: false, error: "Delivery has no assigned driver", code: "NOT_AUTHORIZED" };
  }
  if (delivery.courierId !== driverUserId) {
    return { valid: false, error: "Driver is not assigned to this delivery", code: "NOT_AUTHORIZED" };
  }
  return { valid: true };
}

export function validateLocationPayload(lat?: number, lng?: number): OperationResult {
  if (lat === undefined || lng === undefined) return { valid: true };
  if (typeof lat !== "number" || typeof lng !== "number") {
    return { valid: false, error: "Location must be numbers", code: "INVALID_PAYLOAD" };
  }
  if (lat < -90 || lat > 90) return { valid: false, error: "Invalid latitude", code: "INVALID_PAYLOAD" };
  if (lng < -180 || lng > 180) return { valid: false, error: "Invalid longitude", code: "INVALID_PAYLOAD" };
  return { valid: true };
}

export function validateOfflineOperation(
  context: OfflineOperationContext,
  delivery: Doc<"deliveries"> | null
): OperationResult {
  const ageResult = validateOperationAge(context.clientCreatedAt);
  if (!ageResult.valid) return ageResult;

  if (!delivery) return { valid: false, error: "Delivery not found", code: "INVALID_PAYLOAD" };

  const driverOps = ["acceptAssignment", "arriveAtPickup", "pickupDelivery", "startTrip", "arriveAtDropoff", "completeDelivery"];
  if (driverOps.includes(context.operationType)) {
    const authResult = validateDriverAuthorization(context.currentUserId, delivery);
    if (!authResult.valid) return authResult;
  }

  const stateResult = validateDeliveryState(context.operationType, delivery.status);
  if (!stateResult.valid) return stateResult;

  return { valid: true };
}
