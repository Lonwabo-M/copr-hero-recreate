/**
 * Lasha Tracking Validation
 *
 * Server-side validation for location updates. The client must never
 * be trusted to validate its own location data.
 *
 * Validation layers:
 * 1. Authentication - driver must be authenticated
 * 2. Authorization - driver must be assigned to the delivery
 * 3. Coordinate validity - lat/lng must be within valid ranges
 * 4. Timestamp - must be recent and not in the future
 * 5. Update frequency - must respect minimum interval
 * 6. Movement reasonableness - speed must be physically possible
 */

import { Id, Doc } from "../_generated/dataModel";
import { DELIVERY_STATUS } from "../schema";
import {
  LAT_MIN, LAT_MAX,
  LNG_MIN, LNG_MAX,
  MAX_SPEED_KMH,
  MIN_UPDATE_INTERVAL_MS,
  EARTH_RADIUS_KM,
} from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationUpdate {
  lat: number;
  lng: number;
  timestamp: number;
  speed?: number;    // km/h (optional, from GPS)
  heading?: number;  // degrees (optional, from GPS)
  accuracy?: number; // meters (optional, from GPS)
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

export interface DriverLocationContext {
  userId: Id<"users">;
  role: string;
  currentLat?: number;
  currentLng?: number;
  lastLocationUpdate?: number;
}

export interface DeliveryContext {
  deliveryId: Id<"deliveries">;
  courierId?: Id<"users">;
  status: string;
  orderId: Id<"orders">;
}

// ─── Validation Functions ─────────────────────────────────────────────────────

/**
 * Validate coordinate values are within valid ranges.
 */
export function validateCoordinates(lat: number, lng: number): ValidationResult {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return {
      valid: false,
      error: "Coordinates must be numbers",
      code: "INVALID_COORDINATES",
    };
  }

  if (isNaN(lat) || isNaN(lng)) {
    return {
      valid: false,
      error: "Coordinates cannot be NaN",
      code: "INVALID_COORDINATES",
    };
  }

  if (lat < LAT_MIN || lat > LAT_MAX) {
    return {
      valid: false,
      error: `Latitude must be between ${LAT_MIN} and ${LAT_MAX}, got ${lat}`,
      code: "INVALID_LATITUDE",
    };
  }

  if (lng < LNG_MIN || lng > LNG_MAX) {
    return {
      valid: false,
      error: `Longitude must be between ${LNG_MIN} and ${LNG_MAX}, got ${lng}`,
      code: "INVALID_LONGITUDE",
    };
  }

  return { valid: true };
}

/**
 * Validate timestamp is reasonable.
 * - Must be within the last 5 minutes
 * - Must not be in the future (with 30s tolerance for clock skew)
 */
export function validateTimestamp(timestamp: number): ValidationResult {
  const now = Date.now();
  const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
  const FUTURE_TOLERANCE_MS = 30 * 1000; // 30 seconds

  if (typeof timestamp !== "number" || isNaN(timestamp)) {
    return {
      valid: false,
      error: "Timestamp must be a valid number",
      code: "INVALID_TIMESTAMP",
    };
  }

  if (timestamp > now + FUTURE_TOLERANCE_MS) {
    return {
      valid: false,
      error: "Timestamp cannot be in the future",
      code: "FUTURE_TIMESTAMP",
    };
  }

  if (now - timestamp > MAX_AGE_MS) {
    return {
      valid: false,
      error: "Timestamp is too old (max 5 minutes)",
      code: "STALE_TIMESTAMP",
    };
  }

  return { valid: true };
}

/**
 * Validate update frequency - driver must wait minimum interval between updates.
 */
export function validateUpdateFrequency(
  lastUpdate: number | undefined,
  currentTimestamp: number
): ValidationResult {
  if (lastUpdate === undefined) {
    return { valid: true }; // First update, always valid
  }

  const interval = currentTimestamp - lastUpdate;

  if (interval < MIN_UPDATE_INTERVAL_MS) {
    return {
      valid: false,
      error: `Updates must be at least ${MIN_UPDATE_INTERVAL_MS / 1000}s apart`,
      code: "TOO_FREQUENT",
    };
  }

  return { valid: true };
}

/**
 * Calculate Haversine distance between two coordinates.
 * Returns distance in kilometers.
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Validate movement reasonableness.
 * Calculate speed from previous location and timestamp, check if physically possible.
 */
export function validateMovement(
  prevLat: number | undefined,
  prevLng: number | undefined,
  prevTimestamp: number | undefined,
  newLat: number,
  newLng: number,
  newTimestamp: number
): ValidationResult {
  // First update, skip movement validation
  if (prevLat === undefined || prevLng === undefined || prevTimestamp === undefined) {
    return { valid: true };
  }

  const distance = haversineDistance(prevLat, prevLng, newLat, newLng);
  const timeDiffSeconds = (newTimestamp - prevTimestamp) / 1000;

  // Avoid division by zero
  if (timeDiffSeconds <= 0) {
    return {
      valid: false,
      error: "Timestamp must be after previous update",
      code: "INVALID_TIMELINE",
    };
  }

  const speedKmh = (distance / timeDiffSeconds) * 3600;

  if (speedKmh > MAX_SPEED_KMH) {
    return {
      valid: false,
      error: `Speed ${speedKmh.toFixed(1)} km/h exceeds maximum ${MAX_SPEED_KMH} km/h`,
      code: "UNREASONABLE_SPEED",
    };
  }

  return { valid: true };
}

/**
 * Validate that a driver is authorized to update location for a delivery.
 */
export function validateDriverAuthorization(
  driverUserId: Id<"users">,
  delivery: DeliveryContext
): ValidationResult {
  if (!delivery.courierId) {
    return {
      valid: false,
      error: "Delivery has no assigned driver",
      code: "NO_DRIVER",
    };
  }

  if (delivery.courierId !== driverUserId) {
    return {
      valid: false,
      error: "Driver is not assigned to this delivery",
      code: "NOT_ASSIGNED",
    };
  }

  return { valid: true };
}

/**
 * Validate that a delivery is in a trackable state.
 */
export function validateDeliveryTrackable(delivery: DeliveryContext): ValidationResult {
  const trackableStatuses = [
    DELIVERY_STATUS.ASSIGNED,
    DELIVERY_STATUS.DRIVER_ACCEPTED,
    DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
    DELIVERY_STATUS.AT_PICKUP,
    DELIVERY_STATUS.PICKED_UP,
    DELIVERY_STATUS.IN_TRANSIT,
    DELIVERY_STATUS.AT_DROPOFF,
  ];

  if (!trackableStatuses.includes(delivery.status as any)) {
    return {
      valid: false,
      error: `Delivery in "${delivery.status}" state is not trackable`,
      code: "NOT_TRACKABLE",
    };
  }

  return { valid: true };
}

/**
 * Comprehensive validation for a location update.
 * Runs all validation checks in order.
 */
export function validateLocationUpdate(
  update: LocationUpdate,
  driverContext: DriverLocationContext,
  delivery: DeliveryContext | null
): ValidationResult {
  // 1. Coordinate validity
  const coordResult = validateCoordinates(update.lat, update.lng);
  if (!coordResult.valid) return coordResult;

  // 2. Timestamp validity
  const timestampResult = validateTimestamp(update.timestamp);
  if (!timestampResult.valid) return timestampResult;

  // 3. Update frequency
  const frequencyResult = validateUpdateFrequency(
    driverContext.lastLocationUpdate,
    update.timestamp
  );
  if (!frequencyResult.valid) return frequencyResult;

  // 4. Movement reasonableness
  const movementResult = validateMovement(
    driverContext.currentLat,
    driverContext.currentLng,
    driverContext.lastLocationUpdate,
    update.lat,
    update.lng,
    update.timestamp
  );
  if (!movementResult.valid) return movementResult;

  // 5. Delivery authorization (if delivery context provided)
  if (delivery) {
    const authResult = validateDriverAuthorization(driverContext.userId, delivery);
    if (!authResult.valid) return authResult;

    const trackableResult = validateDeliveryTrackable(delivery);
    if (!trackableResult.valid) return trackableResult;
  }

  return { valid: true };
}
